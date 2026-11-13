import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('free-content discovery',()=>{
  test.skip(process.env.FREE_CONTENT_E2E!=='true','Build with VITE_CONTENT_DISCOVERY_ENABLED=true for these journeys');
  test.beforeEach(async({page})=>{await page.route('**/api/account/session',route=>route.fulfill({json:{status:'guest'}}));});
  const fixture={key:'fcd:v1:europepmc:MED:123',kind:'article',title:'Synthetic browser flow fixture',contributors:[{name:'Test Author',role:'author'}],identifiers:[],languages:['en'],subjects:[],relations:[],access:'free_full_text',
    locations:[{id:'oa',host:'Europe PMC',landingUrl:'https://europepmc.org/articles/PMC123',readerUrl:'https://europepmc.org/articles/PMC123',access:'free_full_text',evidence:{sourceId:'europepmc',field:'OA location',observedAt:'2026-11-01T00:00:00Z'}}],
    readingActions:[{locationId:'oa',label:'Read at Europe PMC',url:'https://europepmc.org/articles/PMC123',downloads:[]}],
    provenance:[{sourceId:'europepmc',sourceRecordId:'MED:123',recordUrl:'https://europepmc.org/article/MED/123',retrievedAt:'2026-11-01T00:00:00Z'}]};
  async function mock(page,{failure=false}={}){
    await page.route('**/api/v2/content/search',async route=>{
      const request=route.request().postDataJSON();
      if(failure)return route.fulfill({status:503,json:{error:{code:'CONTENT_UNAVAILABLE',message:'The paper source could not answer.'},sources:[{id:'europepmc',status:'timeout',returned:0}]}});
      const unknown={...fixture,key:'fcd:v1:europepmc:MED:124',title:'Synthetic unclear-access fixture',access:'unknown',readingActions:[]};
      return route.fulfill({json:{items:request.includeUnclear?[fixture,unknown]:[fixture],nextCursor:null,hiddenUnclear:1,coverage:'partial',policyRevision:'test',sources:[{id:'europepmc',status:'ok',returned:1,scope:'Biomedical literature'},{id:'openalex',status:'quota_exhausted',returned:0}]}});
    });
    await page.route('**/api/v2/content/resolve',route=>route.fulfill({json:{item:fixture}}));
  }
  test('save, reload and remove a paper while preserving an existing book',async({page})=>{
    await mock(page);
    await page.goto('/app/search?scope=papers&q=browser-fixture');
    await page.evaluate(()=>localStorage.setItem('mybookshelf.anonymous-web.v1',JSON.stringify({version:1,selectedLibraryId:null,recentBooks:[],savedBooks:[{bookKey:'v1:isbn:9780140328721',title:'Legacy shelf fixture',authors:['Legacy Author'],source:'direct',viewedAt:'2026-10-01T00:00:00Z'}]})));
    await page.reload();
    await page.getByRole('heading',{name:fixture.title}).getByRole('link').click();
    await expect(page.getByRole('link',{name:'Read at Europe PMC (opens Europe PMC)'})).toHaveAttribute('href','https://europepmc.org/articles/PMC123');
    await page.getByRole('button',{name:'Save to shelf'}).click();
    await expect(page.getByRole('button',{name:'Saved',exact:true})).toHaveAttribute('aria-pressed','true');
    // The one-shelf home shows it as a cover that opens its reading page; removing it there keeps the book.
    await page.goto('/app/shelf');
    const cover=page.getByRole('link',{name:/Synthetic browser flow fixture/});
    await expect(cover).toBeVisible();await cover.click();
    await page.getByRole('button',{name:'Saved',exact:true}).click();
    await expect(page.getByRole('button',{name:'Save to shelf',exact:true})).toBeVisible();
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')));
    expect(state.version).toBe(2);expect(state.savedContent).toHaveLength(0);expect(state.savedBooks[0].title).toBe('Legacy shelf fixture');
  });
  test('unknown access is opt-in; source dialog traps focus and restores its trigger',async({page})=>{
    await mock(page);await page.goto('/app/search?scope=papers&q=unknown-fixture');
    await expect(page.getByRole('heading',{name:'Synthetic unclear-access fixture'})).toHaveCount(0);
    await page.getByRole('button',{name:'Show them, labelled'}).click();
    await expect(page.getByRole('heading',{name:'Synthetic unclear-access fixture'})).toBeVisible();
    const trigger=page.getByRole('button',{name:'Sources',exact:true});await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Sources for this search'});await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(()=>document.querySelector('dialog[open]')?.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
    await expect(page.getByRole('heading',{name:'Wide paper search is at today’s limit'})).toBeVisible();
  });
  test('outage never renders a no-copy claim',async({page})=>{
    await mock(page,{failure:true});await page.goto('/app/search?scope=papers&q=failed-fixture');
    await expect(page.getByRole('alert')).toContainText('This does not mean there is no free copy.');
    await expect(page.getByRole('heading',{name:'No verified free copy in these results'})).toHaveCount(0);
  });
  for(const light of ['daylight','lamplight','ink'])test(`reading controls reflow and remain accessible in ${light}`,async({page})=>{
    await page.addInitScript(light=>localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:light})),light);
    await mock(page);await page.goto('/app/search?scope=papers&q=layout-fixture');
    await expect(page.getByRole('heading',{name:fixture.title})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-light',light);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(await page.locator('#main-content').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    const results=await new AxeBuilder({page}).include('#main-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  });
  test('320px layout and enlarged text retain search and source controls',async({page})=>{
    await page.setViewportSize({width:320,height:844});await mock(page);
    await page.goto('/app/search?scope=papers&q=narrow-fixture');
    await expect(page.getByRole('heading',{name:fixture.title})).toBeVisible();
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    await expect(page.getByRole('button',{name:'Sources',exact:true})).toBeVisible();
    expect(await page.locator('#main-content').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  });
  test('saved stories keep source reading conditions after discovery retirement',async({page})=>{
    const story={...fixture,key:'fcd:v1:storyweaver:7777778',kind:'book',title:'Synthetic free-account browser story',access:'free_account_required',
      locations:[{...fixture.locations[0],id:'story',host:'StoryWeaver',access:'free_account_required',landingUrl:'https://storyweaver.org.in/en/stories/7777778-synthetic-fixture'}],
      readingActions:[{locationId:'story',label:'Read at StoryWeaver',url:'https://storyweaver.org.in/en/stories/7777778-synthetic-fixture',requiresAccount:true,downloads:[]}]};
    await page.route('**/api/v2/content/search',route=>route.fulfill({json:{items:[story],nextCursor:null,hiddenUnclear:0,coverage:'partial',policyRevision:'test',sources:[{id:'storyweaver',status:'ok',returned:1}]}}));
    await page.route('**/api/v2/content/resolve',route=>route.fulfill({json:{item:story}}));
    await page.goto('/app/read/'+encodeURIComponent(story.key));
    await expect(page.getByRole('link',{name:'Read at StoryWeaver · free account required (opens StoryWeaver)'})).toHaveAttribute('href',story.readingActions[0].url);
    await page.getByRole('button',{name:'Save to shelf'}).click();
    await page.goto('/app/shelf');
    await page.getByRole('link',{name:new RegExp(story.title)}).click();
    await expect(page.getByText(/Sign in there to read this book/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  });

});
