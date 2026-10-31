import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { BOOK, AVAILABILITY, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

for (const [name, availability, label] of [
  ['available',AVAILABILITY.available,'Available at the library'],
  ['unavailable',AVAILABILITY.noneAvailable,'No lending copies available'],
  ['absent',AVAILABILITY.notFound,'Not listed in this catalog'],
  ['uncertain',AVAILABILITY.unknown,'Availability unavailable'],
  ['stale',AVAILABILITY.stale,'Catalog timed out'],
  ['reference',{...AVAILABILITY.available,outcome:'unknown',loanRestriction:'not_for_loan',availableCopies:undefined},'Read at the library'],
]) test(`${name} status explains the next step on the Library page without clipped text`, async ({page},testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await installPublicV2Fixture(page,{availability});
  await chooseLinkedLibrary(page);
  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}?page=library`);
  await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
  const card=page.locator('.reader-availability');
  await expect(card.getByRole('link',{name:'Open library catalog'})).toBeVisible();
  expect(await card.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath(`book-${name}.png`),fullPage:true});
});

test('the full description, edition and provider credit stay available on the book pages', async ({page}) => {
  await installPublicV2Fixture(page);
  const description='A longer book description with useful detail. '.repeat(30);
  await page.route('**/api/v2/books/resolve',r=>r.fulfill({json:{book:{...BOOK,description}}}));
  const attribution={label:'Calil',url:'https://calil.jp/book/9781625275868'};
  await page.route('**/api/v2/availability',r=>r.fulfill({json:{...AVAILABILITY.available,attribution}}));
  await chooseLinkedLibrary(page);
  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}?page=library`);
  await expect(page.getByRole('link',{name:'Calil',exact:true})).toHaveAttribute('href',attribution.url);
  await expect(page.getByRole('heading',{name:'About this book',exact:true})).toBeVisible();

  expect((await page.locator('.story-text').innerText()).length).toBeLessThan(452);
  await page.getByRole('button',{name:'More'}).click();
  await expect(page.locator('.story-text')).toHaveText(description.trim());
  await page.getByRole('button',{name:'Less'}).click();
  expect((await page.locator('.story-text').innerText()).length).toBeLessThan(452);
  await expect(page.getByRole('heading',{name:'Details'})).toBeVisible();
  await expect(page.locator('.reader-availability')).toBeVisible();
});
