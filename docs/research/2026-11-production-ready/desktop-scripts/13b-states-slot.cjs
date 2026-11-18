// Interaction states, second part: book page controls in the middle slot, search field input, result cards. No library chosen.
const { open, BASE, STATES } = require('./lib.cjs');
const path = require('path');
const { states } = require('./states.cjs');
const { search } = require('./search.cjs');
const slot = page => page.locator('.desk-slot');
(async () => {
  const s = await open({ name: '13b-states-slot', stateFile: 'state-nolib-12.json' }); const { page } = s;
  const park = [560, 890];
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    await states(page, 'search-input-shelf', page.getByRole('searchbox', { name: 'Search for a book' }), { pad: 14 });
    await page.locator('.home-bookcase .cover3d:not(.is-suggested)').nth(2).click(); await slot(page).locator('h1').waitFor(); await page.waitForTimeout(1500);
    const oc = page.locator('.cover3d.is-open'); const b = await oc.boundingBox();
    await page.mouse.move(park[0], park[1]); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(STATES, 'open-book-cover-on-shelf-default.png'), clip: { x: b.x - 16, y: b.y - 16, width: b.width + 32, height: b.height + 32 } });
    await states(page, 'slot-close', slot(page).getByRole('button', { name: 'Close the book' }), { park });
    await states(page, 'remove-button-on-my-shelf', slot(page).getByRole('button', { name: 'On my shelf' }), { park });
    await states(page, 'book-find-my-library', slot(page).getByRole('button', { name: 'Find my library' }), { park });
    const more = slot(page).getByRole('button', { name: 'More' }); if (await more.count()) await states(page, 'book-more', more, { park });
    await states(page, 'book-elsewhere-link', slot(page).getByRole('link', { name: /Goodreads/ }), { park });
    console.log('slot still open?', await slot(page).count());
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
    await page.locator('.cover3d.is-suggested').first().click(); await slot(page).locator('h1').waitFor(); await page.waitForTimeout(1500);
    await states(page, 'save-button-add-to-my-shelf', slot(page).getByRole('button', { name: 'Add to my shelf' }), { park });
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
    await search(page, 'R. K. Narayan', 'author query (for state shots)', { step: '10 interaction states' });
    await states(page, 'result-card', page.locator('.results-bookcase .cover3d:not(:has(.cover-badge-mine))').first(), { pad: 16 });
    await states(page, 'result-card-saved', page.locator('.results-bookcase .cover3d:has(.cover-badge-mine)').first(), { pad: 16 });
    await states(page, 'search-clear', page.getByRole('button', { name: /Clear search/ }));
    await states(page, 'back-to-my-shelf', page.getByText('Back to my shelf'));
    // native tooltip / title on covers?
    console.log('title attributes on covers:', await page.locator('.cover3d[title]').count(), '| rail/title elsewhere:', await page.locator('[title]').count());
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
})();
