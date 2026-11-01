import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {installContentReviewFixture,reviewBook} from './free-content-ui-fixture.js';

test.describe('free-content relevance and disabled search',()=>{
  test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires the feature-enabled build');
  for(const light of ['daylight','lamplight','ink'])test(`disabled papers lead to free books and explain subject matches in ${light}`,async({page})=>{
    await page.addInitScript(light=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:light})),light);
    await installContentReviewFixture(page,'FreeBookResults');
    await page.route('**/api/v2/content/search',route=>{
      const body=route.request().postDataJSON();
      if(body.kinds.includes('article'))return route.fulfill({status:503,json:{error:{code:'CONTENT_DISABLED',message:'Paper search is not connected yet.'},sources:[{id:'arxiv',status:'disabled',returned:0}]}});
      const book={...reviewBook(),title:'Synthetic statistics workbook',subjects:['Mathematics'],searchMatch:{field:'subject',value:'Mathematics'}};
      return route.fulfill({json:{items:[book],nextCursor:null,hiddenUnclear:0,coverage:'partial',policyRevision:'test',sources:[{id:'gutenberg',status:'ok',returned:1}]}});
    });
    await page.goto('/app/search?scope=papers&q=Mathematics');
    await expect(page.getByRole('heading',{name:'Paper search isn’t enabled yet'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Try again',exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Free-reading sources aren’t answering'})).toHaveCount(0);
    await page.getByRole('link',{name:'Search free books instead'}).click();
    await expect(page).toHaveURL(/scope=free&q=Mathematics/);
    await expect(page.getByLabel('Search free books',{exact:true})).toHaveValue('Mathematics');
    await expect(page.getByText('Subject: Mathematics',{exact:true})).toBeVisible();
    expect(await page.locator('#main-content').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({page}).include('#main-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  });
});
