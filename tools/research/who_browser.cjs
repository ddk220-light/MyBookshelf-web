/* Public WHO publications filter UI only; run under policy-checked registry lock. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const endpoint='https://www.who.int/publications/i';
const registry=path.resolve(__dirname,'../../docs/research/free-content/registry');
const save=r=>fs.appendFileSync(path.join(registry,'examples/who-publications.browser.jsonl'),JSON.stringify(r)+'\n');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const queries=process.argv.slice(2);
async function records(page){return page.locator('.sf-publications-item:visible').evaluateAll(xs=>xs.slice(0,50).map(x=>({title:x.querySelector('h3')?.textContent.trim(),url:x.querySelector('h3')?.closest('a')?.href,date:x.querySelector('.sf-publications-item__date')?.textContent.trim()})));}
(async()=>{
 const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:p?{server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined});
 const context=await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
 const page=await context.newPage();
 await page.route('**/*',route=>['media','image'].includes(route.request().resourceType())||/\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(route.request().url())||new URL(route.request().url()).hostname==='iris.who.int'?route.abort():route.continue());
 let initial,failures=0;
 try{for(const query of queries){
  const row={source_id:'who-publications',observed_at:new Date().toISOString(),endpoint,query,query_verified:false,execution_mode:'published-anonymous-browser-search',full_content_downloaded:false,iris_requests_blocked:true};
  try{
   {const response=await page.goto(endpoint,{waitUntil:'domcontentloaded',timeout:40000});initial={status:response.status(),url:page.url(),body_sha256:digest(await response.body())};if(initial.status!==200)throw Error('Initial page HTTP '+initial.status);await page.locator('#global-filter[role="textbox"]').waitFor({timeout:30000});await pause(5000);}
   row.initial_http=initial;await pause(3000);
   const prior=await records(page);row.previous_output_sha256=digest(JSON.stringify(prior));
   const priorIds=prior.map(r=>r.url).join('\n');
   await page.locator('#global-filter').fill('');await page.locator('#global-filter').pressSequentially(query,{delay:100});await page.locator('#global-filter').press('Tab');
   await page.waitForFunction(({priorIds,query})=>{
    const cards=[...document.querySelectorAll('.sf-publications-item')].filter(x=>x.offsetParent!==null);
    const ids=cards.map(x=>x.querySelector('h3')?.closest('a')?.href).join('\n');
    const relevant=cards.some(x=>query.toLowerCase().split(/\s+/).every(t=>(x.querySelector('h3')?.textContent||'').toLowerCase().includes(t)));
    const empty=cards.length===0&&document.body.innerText.includes("Unfortunately we don't have any results matching your criteria.");
    return ids!==priorIds&&(relevant||empty);
   },{priorIds,query},{timeout:45000});await pause(5000);
   row.visible_query=await page.locator('#global-filter').inputValue();row.final_url=page.url();
   row.records=await records(page);row.observed_output_sha256=digest(JSON.stringify(row.records));
   row.body_text=(await page.locator('body').innerText()).slice(0,20000);
   row.result_summary=await page.locator('.k-pager-info').allTextContents();
   if(row.previous_output_sha256===row.observed_output_sha256)throw Error('Search left unfiltered/stale result cards');row.outcome='observed';
   if(query===queries[0]){
    const file=path.resolve(registry,'../evidence/2026-11-05-industry-search/who-publications-results.png');await page.screenshot({path:file});row.screenshot='evidence/2026-11-05-industry-search/who-publications-results.png';
    const next=page.locator('.k-pager-next:not(.k-state-disabled)').first();if(await next.count()){await pause(3000);await next.click();await pause(10000);row.next_page_records=await records(page);row.next_page_output_sha256=digest(JSON.stringify(row.next_page_records));row.next_page_summary=await page.locator('.k-pager-info').allTextContents();}
   }
  }catch(e){row.outcome='failed';row.error=e.message;failures++;}
  save(row);console.log(query,row.outcome,row.records?.length||0,JSON.stringify(row.result_summary||[]),row.error||'');
  if([401,403,429,503].includes(initial?.status)||failures>=2)break;
 }}finally{await context.close();await browser.close();}
})().catch(e=>{save({source_id:'who-publications',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;});
