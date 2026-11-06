/* Public Commons search UI only. Invoke under a policy-checked registry flock. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {webkit} = require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE || '@playwright/test');
const endpoint = 'https://commons.libretexts.org/';
const output = path.resolve(__dirname, '../../docs/research/free-content/registry/examples/libretexts.browser.jsonl');
const save = row => fs.appendFileSync(output, JSON.stringify(row) + '\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const queries = process.argv.slice(2);
(async () => {
  const p = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  const browser = await webkit.launch({headless:true, proxy:p ? {server:p.origin,
    ...(p.username ? {username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)} : {})} : undefined});
  const context = await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
  const page = await context.newPage();
  await page.route('**/*', route => ['media','image'].includes(route.request().resourceType()) || /\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(route.request().url()) ? route.abort() : route.continue());
  let initial, failures=0;
  try {
    for (const query of queries) {
      const row={source_id:'libretexts',observed_at:new Date().toISOString(),endpoint,query,
        execution_mode:'published-anonymous-browser-search',query_verified:false,full_content_downloaded:false};
      try {
        if (!initial) {
          const response=await page.goto(endpoint,{waitUntil:'domcontentloaded',timeout:40000});
          initial={status:response.status(),url:page.url(),body_sha256:digest(await response.body())};
          if(initial.status!==200)throw Error('Initial page HTTP '+initial.status);
        }
        row.initial_http=initial;
        await page.locator('#commons-search-input').waitFor({timeout:30000});
        await pause(3000);
        await page.locator('#commons-search-input').fill(query);
        await page.getByRole('button',{name:'Search Catalog',exact:true}).click();
        await page.waitForURL(u=>u.searchParams.get('search')===query,{timeout:30000});
        await pause(5000);
        row.visible_query=await page.locator('#commons-search-input').inputValue();
        row.selected_tab=await page.locator('[role="tab"][aria-selected="true"]').innerText();
        row.final_url=page.url();
        row.body_text=(await page.locator('body').innerText()).slice(0,16000);
        row.records=await page.locator('a[href^="/book/"]').evaluateAll(as=>as.slice(0,24).map(a=>({title:a.textContent.trim(),url:a.href})));
        row.observed_output_sha256=digest(JSON.stringify(row.records));
        row.outcome='observed';
        if(query===queries[0]){
          const file=path.resolve(__dirname,'../../docs/research/free-content/evidence/2026-11-05-learning-search/libretexts-results.png');
          fs.mkdirSync(path.dirname(file),{recursive:true});await page.screenshot({path:file});
          row.screenshot='evidence/2026-11-05-learning-search/libretexts-results.png';
          const more=page.getByRole('button',{name:'Load more results',exact:true});
          if(await more.count()){
            await pause(3000);await more.click();await pause(5000);
            row.load_more_records=await page.locator('a[href^="/book/"]').evaluateAll(as=>as.slice(0,60).map(a=>({title:a.textContent.trim(),url:a.href})));
            row.load_more_output_sha256=digest(JSON.stringify(row.load_more_records));
          }
        }
      }catch(e){row.outcome='failed';row.error=e.message;failures++;}
      save(row);console.log(query,row.outcome,row.records?.length||0,row.error||'');
      if([401,403,429,503].includes(initial?.status)||failures>=2)break;
    }
  }finally{await context.close();await browser.close();}
})().catch(e=>{save({source_id:'libretexts',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;});
