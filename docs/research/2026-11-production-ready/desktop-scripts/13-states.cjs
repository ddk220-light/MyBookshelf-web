// Interaction states at 1440x900 (wide) and 1024x768 (rail), and on the landing page. No book is opened and no search is run while a library is chosen.
const { open, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { states } = require('./states.cjs');
const { search } = require('./search.cjs');
const slot = page => page.locator('.desk-slot');
const column = page => page.getByRole('complementary', { name: 'Library and account' });
(async () => {
  // A. landing page
  let s = await open({ name: '13-states-landing' });
  let { page } = s;
  try {
    await page.goto(BASE + '/'); await page.waitForTimeout(1000);
    await states(page, 'landing-logo', page.locator('header a').first());
    await states(page, 'landing-header-link', page.locator('header').getByRole('link', { name: 'Libraries', exact: true }));
    await states(page, 'landing-open-the-app', page.getByRole('link', { name: /Open the app/ }));
    await states(page, 'landing-find-my-library-button', page.getByRole('link', { name: 'Find my library' }));
    await states(page, 'landing-text-link', page.getByRole('link', { name: /Find a book instead/ }));
    await states(page, 'landing-country-row', page.getByRole('link', { name: /India/ }).first());
    await states(page, 'landing-footer-link', page.locator('footer').getByRole('link', { name: 'Privacy' }));
    await page.goto(BASE + '/libraries'); await page.waitForTimeout(800);
    await states(page, 'libraries-guide-card', page.getByRole('link', { name: 'Anna Centenary Library', exact: true }));
    await states(page, 'libraries-explore-link', page.getByRole('link', { name: /Explore this library/ }).first());
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }

  // B. cold shelf (fresh): search field, suggestion cover, Find my library
  s = await open({ name: '13-states-cold' }); ({ page } = s);
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor(); await page.waitForTimeout(1200);
    await states(page, 'search-field-cold', page.locator('.search-bar'));
    await states(page, 'suggestion-cover-cold', page.locator('.cover3d.is-suggested').nth(1), { pad: 16 });
    await states(page, 'find-my-library-button', column(page).getByRole('button', { name: 'Find my library' }));
    await states(page, 'create-account-button', column(page).getByRole('link', { name: 'Create account' }));
    await states(page, 'log-in-button', column(page).getByRole('link', { name: 'Log in' }));
    await states(page, 'light-toggle-selected', column(page).getByRole('button', { name: 'Daylight' }));
    await states(page, 'light-toggle-unselected', column(page).getByRole('button', { name: 'Lamplight' }));
    await states(page, 'column-link-report', column(page).getByRole('link', { name: 'Report a problem' }));
    await states(page, 'column-link-privacy', column(page).getByRole('link', { name: 'Privacy' }));
    await states(page, 'wordmark', page.locator('.desk-wordmark'));
    // picker
    await column(page).getByRole('button', { name: 'Find my library' }).click(); await page.getByRole('heading', { name: 'Find your library' }).waitFor();
    await states(page, 'picker-near-me', page.getByRole('button', { name: /Libraries near me/ }));
    await states(page, 'picker-field', page.getByLabel('City, town or library name'));
    await states(page, 'picker-close', page.locator('.desk-picker').getByRole('button', { name: 'Close' }));
    await page.getByLabel('City, town or library name').pressSequentially('Burlingame', { delay: 40 }); await page.locator('.library-row').first().waitFor(); await page.waitForTimeout(600);
    await states(page, 'picker-row', page.locator('.library-row').first());
    await states(page, 'picker-not-listed-link', page.getByRole('button', { name: 'My library isn’t listed' }));
    await page.keyboard.press('Escape');
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }

  // C. shelf with 12 saved, no library: covers, view switch, slot buttons, results
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-nolib-12.json'), STATE_FILE);
  s = await open({ name: '13-states-shelf', useState: true }); ({ page } = s);
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    await states(page, 'search-field-shelf', page.locator('.search-bar'));
    await states(page, 'book-cover', page.locator('.home-bookcase .cover3d:not(.is-suggested)').nth(2), { pad: 16 });
    await states(page, 'suggestion-cover', page.locator('.cover3d.is-suggested').first(), { pad: 16 });
    await states(page, 'view-switch-selected', page.getByRole('button', { name: 'Shelf view' }));
    await states(page, 'view-switch-unselected', page.getByRole('button', { name: 'List view' }));
    const spine = page.getByRole('region', { name: 'Viewed before' }).getByRole('link').first();
    await states(page, 'viewed-before-spine', spine, { pad: 12 });
    await states(page, 'viewed-before-clear', page.getByRole('region', { name: 'Viewed before' }).getByRole('button', { name: /Clear/ }));
    await page.locator('.desk-shelf').evaluate(el => el.scrollTo(0, 0));
    // list view rows
    await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(500);
    await states(page, 'list-row', page.locator('.shelf-list-item a, .shelf-list-item').first());
    await page.getByRole('button', { name: 'Shelf view' }).click(); await page.waitForTimeout(400);
    // book page buttons
    await page.locator('.home-bookcase .cover3d:not(.is-suggested)').nth(2).click(); await slot(page).locator('h1').waitFor(); await page.waitForTimeout(1500);
    await states(page, 'open-book-cover-on-shelf', page.locator('.cover3d.is-open'), { pad: 16 });
    await states(page, 'slot-close', slot(page).getByRole('button', { name: 'Close the book' }));
    await states(page, 'remove-button-on-my-shelf', slot(page).getByRole('button', { name: 'On my shelf' }));
    await states(page, 'book-find-my-library', slot(page).getByRole('button', { name: 'Find my library' }));
    const more = slot(page).getByRole('button', { name: 'More' }); if (await more.count()) await states(page, 'book-more', more);
    await states(page, 'book-elsewhere-link', slot(page).getByRole('link', { name: /Goodreads/ }));
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
    // an unsaved book: Add to my shelf
    await page.locator('.cover3d.is-suggested').first().click(); await slot(page).locator('h1').waitFor(); await page.waitForTimeout(1500);
    await states(page, 'save-button-add-to-my-shelf', slot(page).getByRole('button', { name: 'Add to my shelf' }));
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
    // search results (no library: no catalog request)
    await search(page, 'R. K. Narayan', 'author query (for state shots)', { step: '10 interaction states' });
    await states(page, 'result-card', page.locator('.results-bookcase .cover3d:not(:has(.cover-badge-mine))').first(), { pad: 16 });
    await states(page, 'result-card-saved', page.locator('.results-bookcase .cover3d:has(.cover-badge-mine)').first(), { pad: 16 });
    await states(page, 'search-clear', page.getByRole('button', { name: /Clear search/ }));
    await states(page, 'back-to-my-shelf', page.getByText('Back to my shelf'));
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }

  // D. library chosen (shelf only; no book opened, no search): library name and Change
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-burl-13.json'), STATE_FILE);
  s = await open({ name: '13-states-library', useState: true }); ({ page } = s);
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    await states(page, 'library-name', column(page).locator('.desk-library > :not(h2):not(button)').first());
    await states(page, 'library-change', column(page).getByRole('button', { name: 'Change library' }));
    console.log('library block html', (await column(page).locator('.desk-library').innerHTML()).replace(/<svg.*?<\/svg>/g, '<svg/>').slice(0, 700));
    // Tab order from a fresh load
    await page.reload(); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    const order = [];
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), inView: r.top >= 0 && r.bottom <= innerHeight, fv: e.matches(':focus-visible') }; });
      order.push(f);
      if (i === 0) await page.screenshot({ path: path.join(SHOTS, '74-tab-1-skip-link-1440x900.png') });
      if (i === 3) await page.screenshot({ path: path.join(SHOTS, '74-tab-4-1440x900.png') });
      if (f && /Wings of Fire/.test(f.name)) await page.screenshot({ path: path.join(SHOTS, '74-tab-first-book-1440x900.png') });
    }
    console.log('TAB ORDER'); order.forEach((f, i) => console.log(`  ${i + 1}. ${f ? `${f.name} <${f.tag}.${f.cls}> at ${f.x},${f.y}${f.inView ? '' : ' (out of view)'}${f.fv ? '' : ' (no focus-visible)'}` : 'body'}`));
    fs.writeFileSync(path.join(__dirname, 'logs', 'tab-order-1440.json'), JSON.stringify(order, null, 1));
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }

  // E. rail (1024x768): rail icons, pop-over items, scan button. Library chosen, shelf only.
  s = await open({ name: '13-states-rail', useState: true, viewport: { width: 1024, height: 768 } }); ({ page } = s);
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    for (const n of ['My library', 'Account', 'Reading light', 'Help']) await states(page, 'rail-icon-' + n.toLowerCase().replace(/ /g, '-'), page.locator('.desk-rail').getByRole('button', { name: n }), { park: [1000, 760] });
    const scan = page.getByRole('button', { name: 'Scan a barcode' });
    console.log('scan button at 1024 with books saved:', await scan.count());
    if (await scan.count()) await states(page, 'scan-button', scan, { park: [1000, 760] });
    await states(page, 'search-field-rail', page.locator('.search-bar'), { park: [1000, 760] });
    for (const [n, file] of [['My library', '75-rail-popover-library'], ['Account', '75-rail-popover-account'], ['Reading light', '75-rail-popover-light'], ['Help', '75-rail-popover-help']]) {
      await page.locator('.desk-rail').getByRole('button', { name: n }).click(); await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, file + '-1024x768.png') });
      const menu = page.locator('dialog.rail-menu[open], dialog[open]').first();
      console.log('POPOVER', n, '|', (await menu.innerText().catch(() => 'none')).replace(/\n+/g, ' | '));
      const items = menu.locator('a, button:not(.rail-menu-close):not(.scan-close)');
      if (await items.count()) await states(page, 'popover-item-' + n.toLowerCase().replace(/ /g, '-'), items.first(), { park: [1000, 760] });
      const close = menu.getByRole('button', { name: 'Close' });
      if (await close.count()) { if (n === 'Account') await states(page, 'popover-close', close.first(), { park: [1000, 760] }); }
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
})();
