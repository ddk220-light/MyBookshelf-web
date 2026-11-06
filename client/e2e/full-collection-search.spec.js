import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const sources=[{id:'nasa-image-video-library',name:'NASA Image and Video Library',scope:'Search image, video and audio metadata across the library',kinds:['other'],languages:[],enabled:true,mode:'live'},{id:'core',name:'CORE',scope:'Search research titles',kinds:['article'],languages:[],enabled:true,mode:'live'}];
const item={key:'fcd:v1:nasa-image-video-library:'+'a'.repeat(32),title:'Apollo lunar mission',kind:'other',contributors:[],identifiers:[],languages:['und'],subjects:[],relations:[],access:'unknown',locations:[],provenance:[],externalOnly:true,sourceActions:[{label:'Open at NASA',url:'https://images.nasa.gov/details/apollo',scope:'record'}],accessNote:'NASA image record · source usage conditions apply',readingActions:[]};
test.describe('Full collection source links',()=>{
 test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires discovery UI build');
 for(const light of ['daylight','lamplight','ink'])test(`record links, type filter and failure isolation in ${light}`,async({page},info)=>{
  await page.addInitScript(value=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:value})),light);
  await page.route('**/api/account/session',route=>route.fulfill({json:{status:'guest'}}));
  await page.route('**/api/v2/content/sources',route=>route.fulfill({json:{sources}}));
  await page.route('**/api/v2/content/search',route=>{const id=route.request().postDataJSON().sourceIds[0];return id==='core'?route.fulfill({status:503,json:{error:{code:'CONTENT_UNAVAILABLE',message:'This source is limiting requests. Please wait before trying it again.'},sources:[{id,status:'throttled',returned:0}]}}):route.fulfill({json:{items:[item],sources:[{id,status:'ok',returned:1}],coverage:'partial',nextCursor:null,hiddenUnclear:0,policyRevision:'fixture'}});});
  await page.goto('/app/search?scope=knowledge&q=Apollo');
  await expect(page.getByRole('link',{name:'Apollo lunar mission (opens source record)'})).toHaveAttribute('href','https://images.nasa.gov/details/apollo');
  await expect(page.getByText('This source is limiting requests. Please wait before trying it again.')).toBeVisible();
  await expect(page.getByText('NASA image record · source usage conditions apply')).toBeVisible();
  await expect(page.locator('.content-result').getByText('Free to read',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Apollo lunar mission (opens source record)'})).toHaveAttribute('target','_blank');
  expect((await new AxeBuilder({page}).include('#main-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`full-collection-${light}.png`),fullPage:true});
  await page.getByRole('combobox',{name:'Source',exact:true}).selectOption('nasa-image-video-library');await expect(page.locator('.knowledge-source')).toHaveCount(1);
 });
});
