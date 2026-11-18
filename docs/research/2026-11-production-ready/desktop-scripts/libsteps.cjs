const { timing } = require('./lib.cjs');
const slot = page => page.locator('.desk-slot');
const column = page => page.getByRole('complementary', { name: 'Library and account' });
async function chooseLibrary(page, text, rowName, step) {
  const side = column(page);
  const opener = side.getByRole('button', { name: /Find my library|Change library/ });
  await opener.first().click();
  await page.getByRole('heading', { name: 'Find your library' }).waitFor();
  const input = page.getByLabel('City, town or library name');
  await input.fill(''); await input.pressSequentially(text, { delay: 50 });
  const row = page.locator('.library-row', { hasText: rowName }).first();
  await row.waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  return { row, pick: async () => {
    const t0 = Date.now(); await row.click();
    await page.getByRole('heading', { name: 'Find your library' }).waitFor({ state: 'detached', timeout: 15000 });
    timing(step, `choose "${rowName}": row click to picker closed`, Date.now() - t0, 'Date.now() around click and waitFor');
    await page.waitForTimeout(800);
  } };
}
// Opens a cover and measures the library answer on the book page (in-page clock).
async function openBookMeasure(page, locator, label, step, maxWait = 45000) {
  await page.evaluate(() => { window.__b = { click: null }; document.addEventListener('click', () => { if (window.__b.click == null) window.__b.click = performance.now(); }, { capture: true, once: true });
    const mark = (k, v) => { if (!(k in window.__b)) window.__b[k] = v ?? performance.now(); };
    if (window.__bobs) window.__bobs.disconnect();
    window.__bobs = new MutationObserver(() => { const s = document.querySelector('.desk-slot'); if (!s) return; if (s.querySelector('h1.shelf-book-title')) mark('title'); const a = s.querySelector('.library-answer'); if (a) { mark('answerCard'); mark('first:' + a.dataset.answer); if (a.dataset.answer !== 'checking') mark('settled'); } if (s.querySelector('.library-answer-catalog')) mark('catalogLink'); if (s.querySelector('#about-heading')) mark('about'); });
    window.__bobs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
  await locator.click();
  await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => 'settled' in window.__b, null, { timeout: maxWait, polling: 100 }).catch(() => console.log('!! answer not settled in', maxWait));
  await page.waitForTimeout(600);
  const b = await page.evaluate(() => window.__b);
  const d = k => (k in b ? Math.round(b[k] - b.click) : null);
  const answer = await slot(page).locator('.library-answer').getAttribute('data-answer').catch(() => null);
  const how = 'performance.now() in page; MutationObserver from the click';
  timing(step, `${label}: click to book title`, d('title'), how);
  if (d('first:checking') != null) timing(step, `${label}: click to "Checking <library>" shown`, d('first:checking'), how);
  if (d('settled') != null) timing(step, `${label}: click to library answer settled (${answer})`, d('settled'), how);
  const info = await slot(page).evaluate(el => { const a = el.querySelector('.library-answer'); const c = el.querySelector('.library-answer-catalog'); return { ariaLabel: a?.getAttribute('aria-label'), answer: a?.dataset.answer, visibleText: a?.innerText.replace(/\s+/g, ' ').trim(), retry: !!el.querySelector('.library-answer-retry'), catalogHref: c?.href || null, catalogLabel: c?.getAttribute('aria-label'), catalogText: c?.innerText.trim(), title: el.querySelector('h1')?.innerText, cardBox: a ? [Math.round(a.getBoundingClientRect().width), Math.round(a.getBoundingClientRect().height)] : null, iconTitle: a?.querySelector('[title]')?.getAttribute('title') || null }; });
  return { times: { title: d('title'), checking: d('first:checking'), settled: d('settled'), about: d('about') }, ...info };
}
module.exports = { slot, column, chooseLibrary, openBookMeasure };
