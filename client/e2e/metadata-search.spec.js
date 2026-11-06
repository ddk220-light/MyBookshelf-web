import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const sources=[{id:'openstax',name:'OpenStax',scope:'16 Math textbooks',kinds:['book'],languages:[],enabled:true,mode:'snapshot'},{id:'sugamya-pustakalaya',name:'Sugamya Pustakalaya',scope:'Public book search; eligible membership to read',kinds:['book'],languages:[],enabled:true,mode:'live'}];
const item=id=>({key:id==='openstax'?'fcd:v1:openstax:calculus-volume-1':'fcd:v1:sugamya-pustakalaya:'+'a'.repeat(32),title:id==='openstax'?'Calculus Volume 1':'Science Book',kind:'book',contributors:[],identifiers:[],languages:['en'],subjects:[],relations:[],access:'unknown',locations:[],provenance:[{sourceId:id,sourceRecordId:id==='openstax'?'calculus-volume-1':'',recordUrl:'https://openstax.org/details/books/calculus-volume-1',retrievedAt:'2026-11-06T05:00:00Z'}],readingActions:[],sourceActions:[{label:id==='openstax'?'Open at OpenStax':'See matching books at Sugamya Pustakalaya',url:id==='openstax'?'https://openstax.org/details/books/calculus-volume-1':'https://sugamyapustakalaya.org.in/searchAction.action?txtboxSearch=science',scope:id==='openstax'?'record':'search'}],accessNote:id==='openstax'?'Textbook details at OpenStax':'Eligible-member login required to read · opens search results',externalOnly:id!=='openstax'});
test.describe('Metadata and outbound discovery',()=>{
 test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires discovery UI');
 for(const light of ['daylight','lamplight','ink'])test(`clear source links and eligibility in ${light}`,async({page},info)=>{
  await page.addInitScript(value=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:value})),light);
  await page.route('**/api/account/session',route=>route.fulfill({json:{status:'guest'}}));
  await page.route('**/api/v2/content/sources',route=>route.fulfill({json:{sources}}));
  await page.route('**/api/v2/content/search',route=>{const id=route.request().postDataJSON().sourceIds[0];return route.fulfill({json:{items:[item(id)],sources:[{id,status:'ok',returned:1}],coverage:'partial',nextCursor:null,hiddenUnclear:0,policyRevision:'fixture'}});});
  await page.route('**/api/v2/content/resolve',route=>route.fulfill({json:{item:item('openstax')}}));
  await page.goto('/app/search?scope=knowledge&q=science');
  await expect(page.getByRole('heading',{name:'Calculus Volume 1'})).toBeVisible();
  await expect(page.getByText('Eligible-member login required to read · opens search results')).toBeVisible();
  await expect(page.getByRole('link',{name:'Science Book (opens source search results)'})).toHaveAttribute('href',/sugamyapustakalaya.*txtboxSearch=science/);
  expect((await new AxeBuilder({page}).include('#main-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  await page.evaluate(()=>document.fonts.ready);
  await page.getByRole('link',{name:'Science Book (opens source search results)'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath(`metadata-${light}.png`),fullPage:true});
  await page.getByRole('heading',{name:'Calculus Volume 1'}).getByRole('link').click();
  await expect(page.getByRole('link',{name:'Open at OpenStax (opens source)'})).toHaveAttribute('href','https://openstax.org/details/books/calculus-volume-1');
  await expect(page.getByText('Free to read',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Save to shelf',exact:true}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath(`metadata-detail-${light}.png`),fullPage:true});
 });
});
