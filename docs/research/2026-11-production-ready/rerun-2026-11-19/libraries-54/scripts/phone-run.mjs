// Runs library x book checks through the real app in Chrome on the Pixel (Chrome remote debugging over adb).
// For each library: choose it in the app's own picker, then open each book's page and record what the
// reader sees (words, link, time) plus the app's own check request. Human pace: a pause after each answer.
// Usage: node phone-run.mjs <libraries.json> <out-dir> [tabId]
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const [libFile, outDir, tabWanted] = process.argv.slice(2);
const PORT = 9333, ORIGIN = 'https://mybookshelf.cloud';
const books = [
  ['v1:openlibrary:OL1037811W', 'Wings of Fire, Kalam (title)'], ['v1:isbn:9788173711466', 'Wings of Fire (ISBN)'],
  ['v1:openlibrary:OL17047576W', 'Godaan, Premchand (title)'], ['v1:openlibrary:OL356672W', 'Ponniyin Selvan, Kalki (title)'],
  ['v1:openlibrary:OL296039W', 'The Discovery of India, Nehru (title)'], ['v1:openlibrary:OL1057177W', 'Malgudi Days, Narayan (title)'],
  ['v1:isbn:9788177091878', 'Concepts of Physics 1, H. C. Verma (ISBN)'], ['v1:isbn:9780262033848', 'Introduction to Algorithms, 3rd ed. (ISBN)'],
  ['v1:isbn:9781408855652', "Harry Potter and the Philosopher's Stone (ISBN)"], ['v1:isbn:9781847941831', 'Atomic Habits (ISBN)'],
  ['v1:openlibrary:OL1052133W', 'The God of Small Things, Roy (title; phone only)'], ['v1:isbn:9780099590088', 'Sapiens (ISBN; phone only)'],
].slice(0, Number(process.env.BOOKS || 12));
const libs = JSON.parse(fs.readFileSync(libFile, 'utf8'));
const resFile = `${outDir}/results.jsonl`;
const done = new Set(fs.existsSync(resFile) ? fs.readFileSync(resFile, 'utf8').trim().split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return r.libraryId + '|' + r.bookKey; }) : []);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const serial = execSync("adb devices | awk '/:[0-9]+\\tdevice/{print $1; exit}'").toString().trim();
const wake = () => { try { execSync(`adb -s ${serial} shell input keyevent 224`, { timeout: 8000 }); } catch {} };
const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const tab = list.find(t => t.type === 'page' && (tabWanted ? t.id === tabWanted : t.url.startsWith(ORIGIN)));
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('cdp timeout ' + method)); } }, 30000); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result?.result?.value; };
await send('Page.enable');
// Record the app's own requests on every page load: path, status, time, and the answer of a book check. No bodies, no search text.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__log = []; const f = window.fetch; window.fetch = async (...a) => { const t = performance.now(); const u = String(a[0]?.url || a[0]).replace(location.origin, '').split('?')[0]; try { const r = await f(...a); const e = { path: u, status: r.status, ms: Math.round(performance.now() - t) }; if (u.endsWith('/holdings/check')) { try { const j = await r.clone().json(); e.answer = j.answer; e.linkKind = j.catalogLinkKind || ''; } catch {} } window.__log.push(e); return r; } catch (x) { window.__log.push({ path: u, status: 'ERR', ms: Math.round(performance.now() - t) }); throw x; } }; })()` });
const nav = async url => { await send('Page.navigate', { url }); };
const waitFor = async (expr, ms, step = 300) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(step); } return null; };
const selected = () => ev(`(() => { try { return JSON.parse(localStorage.getItem('mybookshelf.reader-preferences.v1')).selectedLibrary?.id || '' } catch { return '' } })()`);
async function chooseLibrary(lib) {
  if (await selected() === lib.id) return { ok: true, how: 'already chosen' };
  await nav(ORIGIN + '/'); await waitFor(`!!document.querySelector('#shelf-search')`, 15000); await sleep(800);
  // open the picker the way a reader does: "Change" beside the library, or the first-visit "Choose" control
  const opened = await ev(`(() => { const b = [...document.querySelectorAll('button,a')].find(e => /^(change|choose a library|choose|find my library)$/i.test(e.innerText.trim())); if (b) { b.click(); return true } return false })()`);
  if (!opened) return { ok: false, how: 'no library control on the shelf' };
  if (!await waitFor(`!!document.querySelector('#library-lookup')`, 8000)) return { ok: false, how: 'picker did not open' };
  const queries = [lib.name, lib.name.split(/[,(—-]/)[0].trim()].filter((q, i, a) => q && a.indexOf(q) === i);
  for (const q of queries) {
    await ev(`(() => { const i = document.querySelector('#library-lookup'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`);
    await sleep(2500);
    const rows = await ev(`[...document.querySelectorAll('button.library-row')].map(e => e.innerText.trim().replace(/\\n+/g, ' | '))`) || [];
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const order = rows.map((t, i) => [i, t]).filter(([, t]) => norm(t.split(' | ')[0]) === norm(lib.name)).concat(rows.map((t, i) => [i, t]).filter(([, t]) => norm(t.split(' | ')[0]) !== norm(lib.name) && norm(t).includes(norm(lib.name).slice(0, 18))));
    for (const [i, text] of order.slice(0, 4)) {
      await ev(`document.querySelectorAll('button.library-row')[${i}].click(); 1`); await sleep(1500);
      if (await selected() === lib.id) return { ok: true, how: `picker, typed "${q}", row ${i + 1} of ${rows.length}`, rowText: text };
      // wrong library with a similar name: reopen and try the next row
      await nav(ORIGIN + '/'); await waitFor(`!!document.querySelector('#shelf-search')`, 15000); await sleep(600);
      await ev(`(() => { const b = [...document.querySelectorAll('button,a')].find(e => /^change$/i.test(e.innerText.trim())); if (b) b.click(); return 1 })()`); await waitFor(`!!document.querySelector('#library-lookup')`, 8000);
      await ev(`(() => { const i = document.querySelector('#library-lookup'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`); await sleep(2500);
    }
  }
  return { ok: false, how: 'not found in the picker by its name' };
}
const out = fs.createWriteStream(resFile, { flags: 'a' }); let n = 0;
for (const lib of libs) {
  const todo = books.filter(b => !done.has(lib.id + '|' + b[0])); if (!todo.length) continue;
  wake(); let choice; try { choice = await chooseLibrary(lib); } catch (e) { choice = { ok: false, how: 'driver error: ' + e.message }; }
  fs.appendFileSync(`${outDir}/picker.jsonl`, JSON.stringify({ at: new Date().toISOString(), libraryId: lib.id, library: lib.name, ...choice }) + '\n');
  console.log('LIBRARY', lib.name.slice(0, 50), choice.ok ? 'chosen' : 'NOT CHOSEN', choice.how);
  if (!choice.ok) continue;
  for (const book of todo) {
    wake(); const t0 = Date.now(); let row = { at: new Date().toISOString(), libraryId: lib.id, library: lib.name, system: lib.platform, state: lib.state, bookKey: book[0], book: book[1] };
    try {
      await nav(`${ORIGIN}/app/books/${encodeURIComponent(book[0])}`);
      let firstSeen = 0, last = null; const end = t0 + 75000;
      while (Date.now() < end) {
        let s = null; try { s = await ev(`(() => { const c = document.querySelector('.library-answer'); if (!c) return null; const lines = c.innerText.split('\\n').map(x => x.trim()).filter(Boolean); const a = c.querySelector('a[href^=http]'); return { cls: c.className, head: lines[0] || '', text: lines.join(' | ').slice(0, 300), link: a ? a.innerText.split('\\n')[0].trim() : '', href: a ? a.href : '', title: document.title, log: (window.__log || []).filter(e => e.path.includes('/holdings/')) } })()`); } catch {}
        if (s) { if (!firstSeen) firstSeen = Date.now() - t0; last = s; const check = s.log.find(e => e.path.endsWith('/holdings/check')); if (!/checking|waiting|pending|loading/i.test(s.cls + ' ' + s.head) && (check || Date.now() - t0 > 4000)) break; }
        await sleep(300);
      }
      const check = last?.log.find(e => e.path.endsWith('/holdings/check'));
      Object.assign(row, { settledMs: Date.now() - t0, cardFirstSeenMs: firstSeen, words: last?.head || '', cardClass: (last?.cls || '').replace('library-answer', '').trim(), cardText: last?.text || '', linkLabel: last?.link || '', href: last?.href || '', title: last?.title || '', checkStatus: check?.status ?? '', checkMs: check?.ms ?? '', checkAnswer: check?.answer ?? '', checkLinkKind: check?.linkKind ?? '', timedOut: !last || /checking|waiting|pending|loading/i.test((last.cls || '') + ' ' + (last.head || '')) });
      const shot = `${String(++n + done.size).padStart(3, '0')}-${lib.id.replace(/[^a-z0-9]+/gi, '-')}-${book[0].split(':').pop()}.jpg`;
      try { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 55 }); fs.writeFileSync(`${outDir}/shots/${shot}`, Buffer.from(r.result.data, 'base64')); row.shot = shot; } catch {}
    } catch (e) { row.error = e.message; }
    out.write(JSON.stringify(row) + '\n'); console.log(row.library.slice(0, 28).padEnd(28), row.book.slice(0, 26).padEnd(26), (row.words || row.error || '').slice(0, 34).padEnd(34), row.checkAnswer || '', row.settledMs || '');
    await sleep(row.settledMs < 2500 ? 3000 : 6000);
  }
}
out.end(); console.log('done'); ws.close();
