// Run after a feature-enabled build + preview. Captures approved board states;
// synthetic API fixtures isolate layout/failure behavior from source availability.
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {installContentReviewFixture,openReviewState,reviewStates} from '../../client/e2e/free-content-ui-fixture.js';
import {LINKED_LIBRARY} from '../../client/e2e/public-v2-fixture.js';
import {startReviewStream} from './ui-review-stream.mjs';
import {reviewGallery} from './ui-review-gallery.mjs';

const option=(key,fallback)=>process.argv.find(arg=>arg.startsWith(key+'='))?.slice(key.length+1)||fallback;
const output=resolve(option('--output','/tmp/free-content-ui-review'));
const origin=option('--base-url','http://127.0.0.1:4183');
const reference=option('--reference-url','http://127.0.0.1:4197');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});
const stream=await startReviewStream({upstreamOrigin:origin});const results=[];
try{
  for(const light of ['daylight','lamplight','ink']){
    for(const [device,width,height] of [['phone',390,844],['desktop',1280,900]]){
      for(const state of reviewStates){
        const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
        await context.addInitScript(({light,library})=>{
          localStorage.setItem('mybookshelf.appearance.v1',JSON.stringify({version:1,preference:light}));
          if(library)localStorage.setItem('mybookshelf.anonymous-web.v1',JSON.stringify({version:2,selectedLibraryId:library,recentBooks:[],savedBooks:[],savedContent:[]}));
        },{light,library:state==='LibraryBookFreeEdition'?LINKED_LIBRARY.id:null});
        const page=await context.newPage();const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await installContentReviewFixture(page,state,{loadingUrl:stream.url});
        await openReviewState(page,state,state==='Loading'?stream.origin:origin);
        if(state==='LibraryBookFreeEdition')await page.locator('.content-also-free').scrollIntoViewIfNeeded();
        await page.mouse.move(width-1,height-1);
        const filename=`${state}-${device}-${light}.png`;
        await page.screenshot({path:resolve(output,filename)});
        const selector=state==='SourcesSheet'?'dialog[open]':'#main-content';
        const accessibility=await new AxeBuilder({page}).include(selector).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,main:document.querySelector('#main-content').clientWidth,mainScroll:document.querySelector('#main-content').scrollWidth}));
        const passed=errors.length===0&&accessibility.violations.length===0&&layout.document<=width&&layout.mainScroll<=layout.main;
        results.push({state,device,light,filename,passed,layout,pageErrors:errors,violations:accessibility.violations.map(({id,nodes})=>({id,targets:nodes.map(node=>node.target)}))});
        console.log(JSON.stringify({state,device,light,passed}));await context.close();
      }
    }
    const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
    for(const state of reviewStates){
      if(state==='DeskFreeSearch')await page.setViewportSize({width:1280,height:900});
      else await page.setViewportSize({width:390,height:844});
      await page.goto(`${reference}/docs/design/2026-11-free-content/boards/${state}.html?light=${light}`);
      await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(output,`${state}-reference-${light}.png`)});
    }
    await context.close();
  }
}finally{await browser.close();await stream.close();}
await writeFile(resolve(output,'checks.json'),JSON.stringify({observedAt:new Date().toISOString(),data:'Synthetic UI fixtures, not source access evidence',results},null,2)+'\n');
await writeFile(resolve(output,'index.html'),reviewGallery(reviewStates));
console.log(JSON.stringify({output,captures:results.length,passed:results.filter(result=>result.passed).length}));
if(results.some(result=>!result.passed))process.exitCode=1;
