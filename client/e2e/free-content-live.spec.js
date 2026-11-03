import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {installContentReviewFixture,reviewPaper} from './free-content-ui-fixture.js';

test.describe('simple live paper discovery',()=>{
  test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires the feature-enabled build');
  for(const light of ['daylight','lamplight','ink'])test(`live paging, reading, saving and source switching in ${light}`,async({page})=>{
    await page.addInitScript(light=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:light})),light);
    await installContentReviewFixture(page,'PaperResults');
    const calls=[];
    const fixture=(id='777777',source='openalex')=>({...reviewPaper(id,'Synthetic live mathematics fixture '+id),
      key:source==='openalex'?'fcd:v1:openalex:W'+id:'fcd:v1:europepmc:MED:'+id,
      provenance:[{sourceId:source,sourceRecordId:id,recordUrl:'https://europepmc.org/article/MED/'+id,retrievedAt:'2026-11-03T14:00:00Z'}]});
    await page.route('**/api/v2/content/search',route=>{
      const body=route.request().postDataJSON();calls.push(body);const source=body.sourceIds?.[0]||'openalex';
      return route.fulfill({json:{items:[fixture(body.cursor?'777778':'777777',source)],nextCursor:body.cursor?null:'synthetic-live-next',
        sessionCursor:'synthetic-live-retry',hiddenUnclear:0,coverage:'partial',searchMode:'live',policyRevision:'fixture',
        sources:[{id:source,status:'ok',returned:1},{id:source==='openalex'?'europepmc':'openalex',status:'not_selected',returned:0},
          {id:'arxiv',status:'disabled',returned:0,searchUrl:'https://arxiv.org/search/?query=Mathematics&searchtype=all'},
          {id:'doaj',status:'disabled',returned:0,searchUrl:'https://doaj.org/search/articles?q=Mathematics'}]}});
    });
    await page.route('**/api/v2/content/resolve',route=>{const key=route.request().postDataJSON().key;return route.fulfill({json:{item:fixture(key.endsWith('777778')?'777778':'777777',key.includes('openalex')?'openalex':'europepmc')}});});
    await page.goto('/app/search?scope=papers&q=Mathematics');
    await expect(page.getByText(/Searching Wide paper search live/)).toBeVisible();
    await page.getByRole('button',{name:'Show more',exact:true}).click();await expect(page.locator('.content-result')).toHaveCount(2);
    expect(calls.at(-1).cursor).toBe('synthetic-live-next');
    await page.locator('.content-result h2 a').first().click();await page.getByRole('button',{name:'Save to shelf',exact:true}).click();
    await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Shelf',exact:true}).click();await page.reload();
    await page.getByRole('link',{name:/Synthetic live mathematics fixture 777777/}).click();
    await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
    await expect(page.locator('.content-read')).toHaveAttribute('href',fixture().readingActions[0].url);
    await page.goto('/app/search?scope=papers&q=Mathematics');await page.getByRole('button',{name:'Sources',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Sources for this search'});
    await expect(dialog.getByRole('link',{name:'Search arXiv website (opens source website)'})).toHaveAttribute('href','https://arxiv.org/search/?query=Mathematics&searchtype=all');
    await page.setViewportSize({width:320,height:844});
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
    await dialog.getByRole('link',{name:'Search it',exact:true}).click();
    await expect(page).toHaveURL(/source=europepmc/);await expect(page.getByText(/Searching Europe PMC live/)).toBeVisible();
    expect(calls.at(-1).sourceIds).toEqual(['europepmc']);
  });
});
