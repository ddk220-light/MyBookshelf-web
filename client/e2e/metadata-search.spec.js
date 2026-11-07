import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import retired from '../../shared/retired-content-sources.json' with {type:'json'};
const active={id:'librivox',name:'LibriVox',scope:'Audiobooks',kinds:['audiobook'],languages:[],enabled:true,mode:'live'};
test.describe('retired source removal',()=>{
 test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires discovery UI');
 for(const light of ['daylight','lamplight','ink'])test(`retired options and legacy browse links are removed in ${light}`,async({page},info)=>{
  await page.addInitScript(value=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:value})),light);
  await page.route('**/api/account/session',route=>route.fulfill({json:{status:'guest'}}));
  // A stale directory must not restore a removed connector in a new client.
  await page.route('**/api/v2/content/sources',route=>route.fulfill({json:{sources:[active,...Object.entries(retired).map(([id,v])=>({...active,id,name:v.name}))]}}));
  const calls=[];await page.route('**/api/v2/content/search',route=>{calls.push(route.request().postDataJSON());return route.fulfill({json:{items:[],sources:[{id:'librivox',status:'ok',returned:0}],nextCursor:null,hiddenUnclear:0,coverage:'partial',policyRevision:'fixture'}});});
  await page.goto('/app/search?scope=knowledge');
  await expect(page.getByRole('combobox',{name:'Source',exact:true})).toHaveText(/All connected sources \(1\)/);
  for(const id of Object.keys(retired))await expect(page.locator(`select option[value="${id}"]`)).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Search scope'}).getByRole('link',{name:'Free to read',exact:true})).toHaveCount(1);
  for(const path of ['scope=knowledge&source=core&q=history','scope=free&collection=children&q=rain']){
   await page.goto('/app/search?'+path);await expect(page).toHaveURL(/scope=knowledge/);await expect(page.getByLabel('Search all knowledge',{exact:true})).toBeVisible();
  }
  expect(calls.length).toBeGreaterThan(0);expect(calls.every(c=>c.sourceIds?.length===1&&c.sourceIds[0]==='librivox'&&!c.collection)).toBe(true);
  expect((await new AxeBuilder({page}).include('#main-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`retired-sources-${light}.png`),fullPage:true});
 });
});
