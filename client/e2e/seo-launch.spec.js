import { test, expect } from '@playwright/test';

test('public pages work without JavaScript and publish exactly nine libraries', async ({browser,baseURL}) => {
  const context=await browser.newContext({javaScriptEnabled:false});
  const page=await context.newPage();
  const response=await page.goto(baseURL+'/libraries');
  expect(response.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Explore the libraries');
  expect(await page.locator('.library-grid > li').count()).toBe(9);
  await page.getByRole('link',{name:'Anna Centenary Library',exact:true}).click();
  await expect(page.locator('h1')).toHaveText('Anna Centenary Library');
  await expect(page.getByRole('heading',{name:'What MyBookshelf can check here'})).toBeVisible();
  const missing=await page.goto(baseURL+'/libraries/toronto-public-library');
  expect(missing.status()).toBe(404);
  await context.close();
});
test('homepage and library metadata are crawlable; app and unknown paths have correct handling', async ({page,request}) => {
  const violations=[];
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>console.error('CSP: '+e.violatedDirective)));
  page.on('console',msg=>{if(msg.type()==='error' && msg.text().includes('CSP:'))violations.push(msg.text());});
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Your next read');
  expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://mybookshelf.cloud/');
  const data=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(data.some(item=>item['@type']==='WebSite')).toBe(true);
  expect(violations).toEqual([]);
  expect((await request.get('/not-a-page')).status()).toBe(404);
  expect((await request.get('/sitemap.xml')).headers()['content-type']).toContain('xml');
  await page.goto('/app/shelf');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex, follow');
  await expect(page.locator('h1')).toBeVisible();
});
test('only returning homepage visitors are redirected; corrupt storage leaves the landing page readable', async ({page}) => {
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('mybookshelf.anonymous-web.v1',JSON.stringify({version:1,selectedLibraryId:'bc:aclibrary',savedBooks:[],recentBooks:[]})));
  await page.goto('/');
  await expect(page).toHaveURL(/\/app\/shelf$/);
  await page.goto('/about');
  await expect(page.locator('h1')).toHaveText('About MyBookshelf');
  await page.evaluate(()=>localStorage.setItem('mybookshelf.anonymous-web.v1','not-json'));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Your next read');
});
