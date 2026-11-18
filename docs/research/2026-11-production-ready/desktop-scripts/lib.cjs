// Shared helpers for the desktop walk. Run with NODE_PATH=/Users/deepak/AI/MyBookshelf-web/node_modules
const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
const STATES = path.join(SHOTS, 'states');
const STATE_FILE = path.join(ROOT, 'scripts', 'state.json');
const LOG_DIR = path.join(ROOT, 'scripts', 'logs');
fs.mkdirSync(STATES, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
const BASE = 'https://mybookshelf.cloud';

function appendCsv(file, row) {
  const line = row.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',') + '\n';
  fs.appendFileSync(path.join(ROOT, file), line);
}
function timing(step, what, ms, how) { appendCsv('timings.csv', [step, what, Math.round(ms), how]); console.log('TIMING', step, '|', what, '|', Math.round(ms), 'ms'); }

async function open({ stateFile = null, viewport = { width: 1440, height: 900 }, useState = false, engine = 'chromium', name = 'run', extra = {} } = {}) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engine === 'webkit' ? {} : { executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1187/chrome-mac/headless_shell' }) });
  const context = await browser.newContext({ viewport, ...(stateFile ? { storageState: path.join(__dirname, stateFile) } : useState && fs.existsSync(STATE_FILE) ? { storageState: STATE_FILE } : {}), ...extra });
  const page = await context.newPage();
  const net = [];
  const started = new Map();
  page.on('request', r => started.set(r, Date.now()));
  const record = async (r, failed) => {
    const u = new URL(r.url());
    const isApi = u.pathname.startsWith('/api/');
    const entry = { t: new Date().toISOString(), method: r.method(), host: u.host, path: u.pathname, type: r.resourceType(), ms: Date.now() - (started.get(r) || Date.now()) };
    if (failed) { entry.failed = r.failure()?.errorText || 'failed'; }
    else {
      const resp = await r.response().catch(() => null);
      if (resp) {
        entry.status = resp.status();
        const h = resp.headers();
        entry.cache = h['cache-control'] || ''; entry.xcache = h['x-vercel-cache'] || ''; entry.enc = h['content-encoding'] || ''; entry.len = h['content-length'] || '';
        try { const s = await r.sizes(); entry.bodyBytes = s.responseBodySize; } catch {}
        const tm = r.timing(); if (tm && tm.responseStart >= 0) { entry.ttfb = Math.round(tm.responseStart); entry.end = Math.round(tm.responseEnd); }
      }
    }
    if (isApi || entry.failed || (entry.status && entry.status >= 400) || ['document', 'script', 'stylesheet', 'font'].includes(entry.type)) net.push(entry);
  };
  page.on('requestfinished', r => record(r, false));
  page.on('requestfailed', r => record(r, true));
  const consoleMsgs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({ t: new Date().toISOString(), type: m.type(), text: m.text().slice(0, 400), url: page.url().split('?')[0] }); });
  page.on('pageerror', e => consoleMsgs.push({ t: new Date().toISOString(), type: 'pageerror', text: String(e).slice(0, 400), url: page.url().split('?')[0] }));
  const vp = viewport.width + 'x' + viewport.height;
  const shot = async (n, opts = {}) => { const f = path.join(SHOTS, n.replace('<vp>', vp) + '.png'); await page.screenshot({ path: f, ...opts }); console.log('SHOT', path.basename(f)); return f; };
  const close = async ({ save = false } = {}) => {
    if (save) await context.storageState({ path: STATE_FILE });
    await new Promise(r => setTimeout(r, 300));
    fs.appendFileSync(path.join(LOG_DIR, 'network.jsonl'), net.map(e => JSON.stringify({ run: name, vp, engine, ...e })).join('\n') + (net.length ? '\n' : ''));
    fs.appendFileSync(path.join(LOG_DIR, 'console.jsonl'), consoleMsgs.map(e => JSON.stringify({ run: name, vp, engine, ...e })).join('\n') + (consoleMsgs.length ? '\n' : ''));
    await browser.close();
    console.log('NET api:', net.filter(e => e.path.startsWith('/api/')).map(e => `${e.method} ${e.path} ${e.status ?? e.failed} ${e.ms}ms`).join('\n  '));
    console.log('CONSOLE', JSON.stringify(consoleMsgs.slice(0, 20)));
  };
  return { browser, context, page, net, consoleMsgs, shot, close, vp };
}

// Layout audit, run in the page.
async function audit(page) {
  return page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
    const label = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '"');
    const all = [...document.querySelectorAll('body *')].filter(vis);
    const trunc = all.filter(el => { const s = getComputedStyle(el); return el.children.length === 0 && el.textContent.trim() && (el.scrollWidth > el.clientWidth + 1) && (s.overflow !== 'visible' || s.textOverflow === 'ellipsis'); });
    const clamp = all.filter(el => { const s = getComputedStyle(el); return (s.webkitLineClamp && s.webkitLineClamp !== 'none') && el.scrollHeight > el.clientHeight + 1; });
    const textEls = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    const fonts = textEls.map(el => ({ px: parseFloat(getComputedStyle(el).fontSize), el }));
    const small = fonts.filter(f => f.px < 12);
    const minFont = fonts.reduce((m, f) => Math.min(m, f.px), 99);
    const targets = [...document.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [tabindex]:not([tabindex="-1"])')].filter(vis).filter(el => !el.closest('[inert]'));
    const tsizes = targets.map(el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), el }; });
    const smallT = tsizes.filter(t => t.w < 24 || t.h < 24);
    const minT = tsizes.reduce((m, t) => Math.min(m, Math.min(t.w, t.h)), 999);
    // covered targets: centre point hit test
    const covered = targets.filter(el => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const top = document.elementFromPoint(x, y); return top && !(el === top || el.contains(top) || top.contains(el)) && !(el.labels && [...el.labels].some(l => l.contains(top))); });
    const scroller = [...document.querySelectorAll('*')].filter(el => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 100; }).map(el => ({ el: label(el).slice(0, 50), sh: el.scrollHeight, ch: el.clientHeight }));
    const paras = [...document.querySelectorAll('p, li')].filter(vis).map(el => { const r = el.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(el).fontSize); return { chars: Math.round(r.width / (fs * 0.5)), len: el.textContent.trim().length }; }).filter(p => p.len > 80);
    return {
      inner: innerWidth + 'x' + innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      truncCount: trunc.length + clamp.length, trunc: [...trunc, ...clamp].slice(0, 12).map(label),
      minFont, smallFontCount: small.length, smallFonts: [...new Set(small.map(f => f.px + 'px ' + label(f.el)))].slice(0, 12),
      minTarget: minT, smallTargetCount: smallT.length, smallTargets: smallT.slice(0, 12).map(t => t.w + 'x' + t.h + ' ' + label(t.el)),
      covered: covered.slice(0, 8).map(label), scrollers: scroller.slice(0, 5),
      maxLineChars: paras.reduce((m, p) => Math.max(m, p.chars), 0),
      baysBooks: [...document.querySelectorAll('.bay-books')].filter(vis).map(b => b.querySelectorAll('.cover3d').length),
    };
  });
}
async function layoutRow(page, vp, screen) {
  const a = await audit(page);
  appendCsv('layout.csv', [vp, screen, a.docH, a.overflowX ? 'YES ' + a.docW : 'no', a.truncCount, a.minFont, a.minTarget, a.smallFontCount, a.smallTargetCount, a.baysBooks.join('/'), a.scrollers.map(s => s.el + ' ' + s.sh + '/' + s.ch).join(' ; '), a.maxLineChars]);
  fs.appendFileSync(path.join(LOG_DIR, 'layout-detail.jsonl'), JSON.stringify({ vp, screen, ...a }) + '\n');
  return a;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
module.exports = { open, audit, layoutRow, timing, appendCsv, sleep, BASE, ROOT, SHOTS, STATES, STATE_FILE, LOG_DIR };
