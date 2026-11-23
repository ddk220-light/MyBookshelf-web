import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// The publication manifest decides which guides exist; the page must list each one.
const publishedGuides = JSON.parse(fs.readFileSync(new URL('../../shared/seo-libraries.json', import.meta.url), 'utf8')).length;

test.beforeEach(async ({page}) => {
  await page.route('https://covers.openlibrary.org/**', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'}));
});

test('public pages work without JavaScript and publish exactly the manifest libraries', async ({browser,baseURL}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  const response=await page.goto(baseURL+'/libraries');
  expect(response.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Explore the libraries');
  // The hub's button opens the app's library picker directly.
  await expect(page.getByRole('main').getByRole('link', { name: 'Find my library', exact: true })).toHaveAttribute('href', '/app/libraries');
  expect(await page.locator('.library-grid > li').count()).toBe(publishedGuides);
  await page.getByRole('link',{name:'Anna Centenary Library',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('Anna Centenary Library');
  await expect(page.getByRole('heading',{name:'What MyBookshelf can check here'})).toBeVisible();
  const missing=await page.goto(baseURL+'/libraries/toronto-public-library');
  expect(missing.status()).toBe(404);
  await context.close();
});
// Library shelves and book pages (tools/seo/library-shelves.mjs): plain links both ways, without JavaScript.
const report=fs.existsSync(new URL('../dist/seo-report.json', import.meta.url))?JSON.parse(fs.readFileSync(new URL('../dist/seo-report.json', import.meta.url),'utf8')):{bookPages:[]};
test('a book page lists the libraries that have it, and each links back to a shelf', async ({browser,baseURL}) => {
  test.skip(!report.bookPages?.length, 'no book pages in this build');
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  const response=await page.goto(baseURL+report.bookPages[0]);
  expect(response.status()).toBe(200);
  await expect(page.getByRole('heading',{name:'Found in these libraries'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Check my library'})).toHaveAttribute('href',/^\/app\/books\/v1%3A/);
  await page.locator('.found-list li a[href^="/libraries/"]').first().click();
  await expect(page.getByRole('heading',{name:'Books found in this library’s catalog'})).toBeVisible();
  await expect(page.locator(`.shelf a[href="${report.bookPages[0]}"]`)).toHaveCount(1);
  await context.close();
});
test('the root page is the reading shelf, indexable and crawlable; app and unknown paths have correct handling', async ({page,request}) => {
  const violations=[];
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>console.error('CSP: '+e.violatedDirective)));
  page.on('console',msg=>{if(msg.type()==='error' && msg.text().includes('CSP:'))violations.push(msg.text());});
  await page.goto('/');
  await expect(page.getByRole('searchbox',{name:'Search for a book'})).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','index, follow');
  expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://mybookshelf.cloud/');
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content',/reading shelf/);
  await expect(page).toHaveTitle('MyBookshelf — Find out if your library has a book');
  const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(data.some(item=>item['@type']==='WebSite' && item.url==='https://mybookshelf.cloud/')).toBe(true);
  expect(violations).toEqual([]);
  const root=await request.get('/');
  expect(root.headers()['x-robots-tag']).toBeUndefined();
  expect(await root.text()).toMatch(/<noscript>[^]*href="\/about"[^]*<\/noscript>/);
  expect((await request.get('/not-a-page')).status()).toBe(404);
  const sitemap=await request.get('/sitemap.xml');
  expect(sitemap.headers()['content-type']).toContain('xml');
  expect(await sitemap.text()).toContain('<loc>https://mybookshelf.cloud/</loc>');
  expect(await sitemap.text()).not.toContain('/app/');
  await page.goto('/app/report');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, follow');
  await expect(page.locator('h1')).toBeVisible();
});
test('the About page holds the old landing page: the reading shelf, how it works, trust, libraries, who makes it', async ({browser,baseURL}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  await page.goto(baseURL+'/about');
  await expect(page.locator('h1')).toHaveText('Find out if your library has a book, before you go.');
  await expect(page.getByRole('main').getByRole('link',{name:'Open my reading shelf'})).toHaveAttribute('href','/');
  await expect(page.getByRole('banner').getByRole('link',{name:'Open my reading shelf'})).toHaveAttribute('href','/');
  await expect(page.getByLabel('An example reading shelf')).toContainText('In your library');
  for (const name of ['How it works','Built to be trusted','Explore featured libraries','What you can do','Who makes it','Corrections and questions'])
    await expect(page.getByRole('heading',{level:2,name})).toBeVisible();
  await expect(page.getByRole('link',{name:'privacy@mybookshelf.cloud'})).toHaveAttribute('href','mailto:privacy@mybookshelf.cloud');
  await expect(page.getByRole('link',{name:'LinkedIn'})).toBeVisible();
  expect(await page.content()).not.toMatch(/gmail|myBookshelf/);
  await context.close();
});

test('public headings and navigation fit at 320px with enlarged text', async ({page}) => {
  await page.setViewportSize({width:320,height:740});
  for (const path of ['/about', '/libraries', '/libraries/central-library-iit-bhubaneswar', '/support', '/privacy']) {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
    await expect(page.locator('h1')).toBeVisible();
  }
});
