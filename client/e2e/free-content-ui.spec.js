import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {installContentReviewFixture,openReviewState,reviewPreprint} from './free-content-ui-fixture.js';
import {startReviewStream} from '../../tools/content/ui-review-stream.mjs';

test.describe('approved free-content UI behavior',()=>{
  test.skip(process.env.FREE_CONTENT_E2E!=='true','Requires the feature-enabled build');
  test('recent searches are real same-tab queries and clearing returns to browse',async({page,baseURL})=>{
    await installContentReviewFixture(page,'FreeStart');await openReviewState(page,'FreeStart',baseURL);
    await expect(page.getByRole('heading',{name:'Recent free searches'})).toBeVisible();
    await page.getByRole('link',{name:/jane austen/}).click();await expect(page).toHaveURL(/q=jane\+austen/);
    await page.reload();await page.getByLabel('Search free books',{exact:true}).fill('');await page.getByRole('button',{name:'Search',exact:true}).click();
    await expect(page.getByRole('link',{name:/Classic literature/})).toBeVisible();
    expect(await page.evaluate(()=>Object.values(localStorage).join(' ').includes('jane austen'))).toBe(false);
  });
  test('type filtering changes the request and result kinds',async({page,baseURL})=>{
    const calls=await installContentReviewFixture(page,'PaperResults');await openReviewState(page,'PaperResults',baseURL);
    await page.getByLabel('Content type',{exact:true}).selectOption('preprint');
    await expect(page.locator('.content-result')).toHaveCount(1);
    expect(calls.filter(call=>call.endpoint==='search').at(-1).body.kinds).toEqual(['preprint']);
    await expect(page.getByLabel('Language',{exact:true})).toBeDisabled();
    await expect(page.getByLabel('Language',{exact:true})).toHaveAccessibleDescription(/not available yet/);
    await page.getByLabel('Content type',{exact:true}).selectOption('report');
    await expect(page.locator('.content-result')).toHaveCount(0);
    await expect(page.getByLabel('Content type',{exact:true})).toBeVisible();
    await page.getByLabel('Content type',{exact:true}).selectOption('');
    await expect(page.locator('.content-result')).toHaveCount(3);
  });
  test('a source retry preserves results and targets only the failed source',async({page,baseURL})=>{
    const calls=await installContentReviewFixture(page,'PartialCoverage');await openReviewState(page,'PartialCoverage',baseURL);
    await expect(page.getByText(/1 of 2 sources answered/)).toBeVisible();
    await page.getByRole('button',{name:'Try arXiv again'}).click();
    await expect(page.locator('.content-result')).toHaveCount(3);
    expect(calls.filter(call=>call.endpoint==='search').at(-1).body).toMatchObject({cursor:'synthetic-review-session',retrySource:'arxiv'});
    await expect(page.getByRole('heading',{name:'arXiv didn’t answer in time'})).toHaveCount(0);
  });
  test('an empty successful search lists zero matches for each answered source',async({page,baseURL})=>{
    await installContentReviewFixture(page,'NoFreeCopy');await openReviewState(page,'NoFreeCopy',baseURL);
    await expect(page.locator('.content-empty .content-source-list li')).toHaveCount(2);
    await expect(page.locator('.content-empty')).toContainText('Project Gutenberg');
    await expect(page.locator('.content-empty')).toContainText('Open Textbook Library');
    await expect(page.locator('.content-empty').getByText('0 matches',{exact:true})).toHaveCount(2);
  });
  test('desktop selection follows Back and survives resizing to a phone',async({page,baseURL})=>{
    await page.setViewportSize({width:1280,height:900});await installContentReviewFixture(page,'FreeBookResults');
    await openReviewState(page,'FreeBookResults',baseURL);
    const row=await page.locator('.content-result').first().boundingBox();
    await page.mouse.click(row.x+row.width-5,row.y+row.height-5);
    await expect(page.locator('.content-detail h1')).toHaveText('Pride and Prejudice');
    await expect(page.locator('.content-result.is-selected h2 a')).toHaveAttribute('aria-current','true');
    await page.getByRole('heading',{name:'Emma',exact:true}).getByRole('link').click();await expect(page.locator('.content-detail h1')).toHaveText('Emma');
    await page.goBack();await expect(page.locator('.content-detail h1')).toHaveText('Pride and Prejudice');
    await page.setViewportSize({width:390,height:844});await expect(page.locator('.content-detail h1')).toHaveText('Pride and Prejudice');
    await expect(page.locator('.content-read')).toBeVisible();await page.locator('.content-toolbar .back-link').click();
    await expect(page.locator('.content-result')).toHaveCount(3);
  });
  test('bookmark, supplied formats and separate versions remain usable by keyboard',async({page,baseURL})=>{
    await installContentReviewFixture(page,'PaperDetail');await openReviewState(page,'PaperDetail',baseURL);
    await expect(page.locator('.content-detail .content-cover')).toHaveCount(0);
    const save=page.getByRole('button',{name:'Save to shelf',exact:true});await save.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('button',{name:'Saved',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('link',{name:'PDF (opens arxiv.org)'})).toHaveAttribute('href',reviewPreprint().readingActions[0].downloads[0].url);
    const related=page.locator('.content-relations');await expect(related).toContainText('Its text, access and licence may differ.');
    await expect(related.getByRole('link',{name:/Published version/})).toHaveAttribute('target','_blank');
    await page.getByRole('link',{name:'Shelf',exact:true}).click();await page.reload();
    await page.getByRole('link',{name:new RegExp(reviewPreprint().title)}).click();await expect(page.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
  });
  test('source dialog exposes unsearched sources and preserves the query',async({page,baseURL})=>{
    const calls=await installContentReviewFixture(page,'SourcesSheet');await openReviewState(page,'SourcesSheet',baseURL);
    const dialog=page.getByRole('dialog',{name:'Sources for this search'});await expect(dialog).toContainText('Not searched this time');
    await dialog.getByRole('link',{name:'Search it',exact:true}).click();await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/source=openalex/);
    await expect.poll(()=>calls.filter(call=>call.endpoint==='search').at(-1).body.sourceIds).toEqual(['openalex']);
  });
  test('unclear access stays opt-in and can be hidden again',async({page,baseURL})=>{
    await installContentReviewFixture(page,'FreeBookResults');await openReviewState(page,'FreeBookResults',baseURL);
    await page.getByRole('button',{name:'Show them, labelled'}).click();await expect(page.getByRole('region',{name:'Unclear access'})).toBeVisible();
    await page.getByRole('button',{name:'Hide them',exact:true}).click();await expect(page.getByRole('region',{name:'Unclear access'})).toHaveCount(0);
  });
  test('loading shows actual streamed progress and static placeholders',async({page,baseURL})=>{
    const stream=await startReviewStream({upstreamOrigin:baseURL});try{
      await installContentReviewFixture(page,'Loading',{loadingUrl:stream.url});await openReviewState(page,'Loading',stream.origin);
      await expect(page.getByText('12 found',{exact:true})).toBeVisible();
      await expect(page.getByText('Searching…',{exact:true})).toBeVisible();
      await expect(page.getByText('Waiting its turn',{exact:true})).toBeVisible();
      await expect(page.locator('.content-skeletons span')).toHaveCount(3);
      expect(await page.locator('.content-skeletons span').first().evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
    }finally{await stream.close();}
  });
});
