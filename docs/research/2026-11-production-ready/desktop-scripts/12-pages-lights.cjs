// No library chosen (no catalog checks). Account entry screens (nothing typed), report a problem (not sent), privacy, about, terms; reading lights; reduced motion; dark scheme.
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const slot = page => page.locator('.desk-slot');
const column = page => page.getByRole('complementary', { name: 'Library and account' });
(async () => {
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-nolib-12.json'), STATE_FILE);
  const s = await open({ name: '12-pages-lights', useState: true });
  const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    for (const [n, name, label] of [['63', 'account-create', 'Create account'], ['64', 'account-log-in', 'Log in']]) {
      const t0 = Date.now();
      await column(page).getByRole('link', { name: label }).click(); await page.waitForTimeout(1200);
      console.log(name, page.url(), Date.now() - t0);
      await shot(`${n}-${name}-<vp>`);
      const where = (await slot(page).count()) ? slot(page) : page.locator('main, body').first();
      console.log(name, 'TEXT', (await where.innerText()).replace(/\n+/g, ' | ').slice(0, 900));
      console.log(name, 'fields', JSON.stringify(await where.evaluate(el => [...el.querySelectorAll('input, button, a')].map(e => e.tagName + ':' + (e.type || '') + ':' + (e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.innerText || e.name).trim().slice(0, 40) + (e.autocomplete ? ' ac=' + e.autocomplete : '')))));
      console.log(name, 'focus', await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.labels?.[0]?.innerText || document.activeElement?.innerText || document.activeElement?.tagName)?.slice(0, 40)), 'shelf beside?', await page.locator('.home-bookcase .cover3d').count());
      console.log(JSON.stringify(await layoutRow(page, s.vp, name)));
      await shot(`${n}-${name}-full-<vp>`, { fullPage: true });
      const close = slot(page).getByRole('button', { name: /Close/ });
      if (await close.count()) await close.first().click(); else await page.goBack();
      await page.waitForTimeout(700);
      console.log(name, 'after close', page.url());
    }
    for (const [n, name, label] of [['65', 'report-a-problem', 'Report a problem'], ['66', 'privacy-in-app', 'Privacy'], ['67', 'about-in-app', 'About']]) {
      await column(page).getByRole('link', { name: label }).click(); await page.waitForTimeout(1000);
      await shot(`${n}-${name}-<vp>`);
      console.log(name, page.url(), 'TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 1200));
      console.log(name, 'controls', JSON.stringify(await slot(page).evaluate(el => [...el.querySelectorAll('input, textarea, select, button, a')].map(e => e.tagName + ':' + (e.type || '') + ':' + (e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.innerText || e.name || '').trim().slice(0, 50) + (e.href ? ' -> ' + e.getAttribute('href') : '')))));
      console.log(JSON.stringify(await layoutRow(page, s.vp, name + ' (middle slot)')));
      console.log(name, 'slot scroll', JSON.stringify(await slot(page).evaluate(el => [el.scrollHeight, el.clientHeight])));
      if (name === 'about-in-app') { await slot(page).evaluate(el => el.scrollTo(0, el.scrollHeight)); await page.waitForTimeout(300); await shot(`${n}-${name}-bottom-<vp>`); }
    }
    // page-to-page: with About open, column link replaces the page; Escape closes
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    console.log('Escape closes page?', await slot(page).count(), page.url());
    await page.goto(BASE + '/app/terms'); await page.waitForTimeout(1200); await shot('68-terms-in-app-<vp>');
    console.log('terms', (await slot(page).innerText().catch(() => 'no slot')).slice(0, 200).replace(/\n+/g, ' | '));
    await page.goto(BASE + '/app/nope-not-a-page'); await page.waitForTimeout(1200); await shot('69-not-found-<vp>');
    console.log('404 TEXT', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
    // reading lights
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1200);
    for (const light of ['Lamplight', 'Ink', 'Daylight']) {
      const t0 = Date.now();
      await column(page).getByRole('button', { name: light }).click(); await page.waitForTimeout(700);
      await shot(`70-light-${light.toLowerCase()}-shelf-<vp>`);
      console.log(light, 'html attrs', await page.evaluate(() => JSON.stringify([...document.documentElement.attributes].map(a => a.name + '=' + a.value))), 'bg', await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'color-scheme', await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme));
      await page.locator('.home-bookcase .cover3d:not(.is-suggested)').nth(1).click(); await slot(page).locator('h1').waitFor(); await page.waitForTimeout(1500);
      await shot(`71-light-${light.toLowerCase()}-book-<vp>`);
      const a = await layoutRow(page, s.vp, `book page, ${light}`);
      await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
      // search results look in this light (no library; repeat of the cached author query is avoided: use the cold field only)
      await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(400); await shot(`72-light-${light.toLowerCase()}-list-<vp>`); await page.getByRole('button', { name: 'Shelf view' }).click(); await page.waitForTimeout(300);
    }
    await page.reload(); await page.waitForTimeout(1500);
    console.log('light kept after reload (last chosen Daylight):', await page.evaluate(() => localStorage.getItem('mybookshelf.appearance.v1') || localStorage.getItem('mybookshelf.reader-preferences.v1')));
  } catch (e) { console.error('ERR', e); await shot('ERR-12-<vp>').catch(() => {}); }
  finally { await s.close(); }
  // reduced motion and dark scheme
  for (const [tag, extra] of [['reduced-motion', { reducedMotion: 'reduce' }], ['dark-scheme', { colorScheme: 'dark' }]]) {
    const t = await open({ name: '12-' + tag, useState: true, extra });
    try {
      await t.page.goto(BASE + '/app/shelf'); await t.page.getByRole('heading', { name: 'My shelf' }).waitFor(); await t.page.waitForTimeout(1500);
      await t.shot(`73-${tag}-shelf-<vp>`);
      console.log(tag, 'bg', await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'html attrs', await t.page.evaluate(() => JSON.stringify([...document.documentElement.attributes].map(a => a.name + '=' + a.value))), 'pressed light', await t.page.evaluate(() => [...document.querySelectorAll('.light-toggle button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.innerText)));
      const anim = () => t.page.evaluate(() => document.getAnimations().map(a => (a.animationName || a.transitionProperty || 'anim') + ':' + Math.round(a.effect?.getComputedTiming().duration || 0)).slice(0, 12));
      await t.page.locator('.home-bookcase .cover3d:not(.is-suggested)').nth(2).click();
      await t.page.waitForTimeout(60); console.log(tag, 'animations 60 ms after opening a book:', JSON.stringify(await anim()));
      await t.shot(`73-${tag}-book-opening-60ms-<vp>`);
      await t.page.waitForTimeout(1200); await t.shot(`73-${tag}-book-<vp>`);
      console.log(tag, 'transition on slot/shelf', await t.page.evaluate(() => JSON.stringify(['.desk-slot', '.desk-shelf', '.desk-column', '.cover3d'].map(s => { const e = document.querySelector(s); return e ? s + ' ' + getComputedStyle(e).transitionDuration + ' / ' + getComputedStyle(e).animationDuration : s + ' none'; }))));
      await t.page.goto(BASE + '/'); await t.page.waitForTimeout(800); await t.shot(`73-${tag}-landing-<vp>`);
      console.log(tag, 'landing bg', await t.page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    } catch (e) { console.error('ERR', e); } finally { await t.close(); }
  }
})();
