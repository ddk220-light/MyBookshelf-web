// Search helper: types into the shelf search field, submits with Enter, measures in page.
const { timing } = require('./lib.cjs');
async function installRecorder(page) {
  await page.evaluate(() => {
    window.__rec = {}; const rec = window.__rec;
    const mark = k => { if (!(k in rec)) rec[k] = performance.now(); };
    if (window.__obs) window.__obs.disconnect();
    if (!window.__keyHooked) { window.__keyHooked = true; document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { if (!('submit' in window.__rec)) window.__rec.submit = performance.now(); } }, true); }
    const check = () => {
      if (!('submit' in rec)) return;
      if (document.querySelector('.ghost-bookcase')) mark('ghost');
      if (document.querySelector('.results-bookcase:not(.ghost-bookcase) .cover3d')) mark('firstResult');
      if (document.querySelector('.search-message')) mark('message');
      if (document.querySelector('.results-library-looking')) { mark('lookingStart'); delete rec.lookingEnd; } else if ('lookingStart' in rec) mark('lookingEnd');
      if (document.querySelector('.results-bookcase .cover-badge-library')) mark('firstLibraryBadge');
      if (document.querySelector('.results-library-in')) mark('inLibraryLine');
    };
    window.__obs = new MutationObserver(check); window.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}
// label is a neutral name for the query (never the text itself) for logs
async function search(page, text, label, { step, expectLibrary = false, maxWait = 40000 } = {}) {
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.click(); await input.fill('');
  await installRecorder(page);
  const before = page.url();
  await input.pressSequentially(text, { delay: 45 });
  await page.waitForTimeout(700);
  const preSubmit = await page.evaluate(() => ({ results: !!document.querySelector('.results-bookcase'), msg: document.querySelector('.search-message')?.textContent }));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => 'firstResult' in window.__rec || 'message' in window.__rec && !/Searching/.test(document.querySelector('.search-message')?.textContent || ''), null, { timeout: maxWait, polling: 50 }).catch(() => console.log('!! no result state within', maxWait));
  // settle: wait until "Looking in…" (if any) has ended, or 3 s with no library line
  if (expectLibrary) {
    await page.waitForFunction(() => 'lookingEnd' in window.__rec && !document.querySelector('.results-library-looking'), null, { timeout: maxWait, polling: 100 }).catch(() => console.log('!! library line did not settle within', maxWait));
  }
  await page.waitForFunction(() => { const im = [...document.querySelectorAll('.results-bookcase .cover3d-face')]; return im.every(f => f.dataset.cover !== 'loading'); }, null, { timeout: 12000, polling: 100 }).catch(() => {});
  const rec = await page.evaluate(() => ({ ...window.__rec, now: performance.now() }));
  const d = k => (k in rec && 'submit' in rec ? Math.round(rec[k] - rec.submit) : null);
  const out = { label, searchedBeforeEnter: preSubmit, urlChanged: page.url() !== before, urlHasQuery: /[?&]q=|search=/.test(page.url()), ghost: d('ghost'), firstResult: d('firstResult'), message: d('message'), lookingStart: d('lookingStart'), lookingEnd: d('lookingEnd'), firstLibraryBadge: d('firstLibraryBadge'), coversSettled: Math.round(rec.now - rec.submit) };
  const how = 'performance.now() in page; MutationObserver from Enter keydown';
  if (out.ghost != null) timing(step, `${label}: submit to placeholder covers`, out.ghost, how);
  if (out.firstResult != null) timing(step, `${label}: submit to first result cover`, out.firstResult, how);
  if (out.message != null) timing(step, `${label}: submit to message heading`, out.message, how);
  if (out.lookingStart != null) timing(step, `${label}: submit to "Looking in <library>…" shown`, out.lookingStart, how);
  if (out.lookingEnd != null) timing(step, `${label}: submit to library answers settled ("Looking in…" gone)`, out.lookingEnd, how);
  if (out.firstLibraryBadge != null) timing(step, `${label}: submit to first library badge on a result`, out.firstLibraryBadge, how);
  timing(step, `${label}: submit to all result cover images loaded or failed`, out.coversSettled, how + '; poll of data-cover');
  const cards = await page.evaluate(() => {
    const covers = [...document.querySelectorAll('.results-bookcase:not(.ghost-bookcase) .cover3d')];
    return { count: covers.length, bays: [...document.querySelectorAll('.results-bookcase .bay-books')].map(b => b.querySelectorAll('.cover3d').length),
      cards: covers.map(c => ({ name: c.getAttribute('aria-label'), cover: c.querySelector('.cover3d-face')?.dataset.cover, mine: !!c.querySelector('.cover-badge-mine'), lib: !!c.querySelector('.cover-badge-library'), visibleText: c.innerText.trim().replace(/\s+/g, ' ').slice(0, 80), w: Math.round(c.getBoundingClientRect().width), typeOverflow: (() => { const t = c.querySelector('.cover3d-type'); return t ? t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1 : false; })() })),
      heading: document.querySelector('#results-heading, .search-results h2')?.textContent, message: document.querySelector('.search-message')?.textContent, extra: [...document.querySelectorAll('.search-results p, .search-results button, .results-head *')].map(e => e.innerText?.trim()).filter(Boolean).slice(0, 12), libLine: document.querySelector('.results-library')?.innerText,
      scroll: (() => { const m = [...document.querySelectorAll('*')].find(el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 300); return m ? { cls: m.className.slice(0, 40), sh: m.scrollHeight, ch: m.clientHeight } : { doc: document.documentElement.scrollHeight, vh: innerHeight }; })() };
  });
  return { out, cards };
}
module.exports = { search, installRecorder };
