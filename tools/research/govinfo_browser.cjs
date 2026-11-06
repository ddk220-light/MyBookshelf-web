/* Published GovInfo browser search; API host remains unavailable. Metadata only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const output=path.resolve(__dirname,'../../docs/research/free-content/registry/examples/govinfo.browser.jsonl');
const save=x=>fs.appendFileSync(output,JSON.stringify(x)+'\n');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:p?{server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
 let failures=0;
 try{for(const term of process.argv.slice(2)){
  const query='title:'+term,endpoint='https://www.govinfo.gov/app/search/'+encodeURIComponent(JSON.stringify({query,offset:0}));
  const page=await ctx.newPage();
  await page.route('**/*',r=>['media','image'].includes(r.request().resourceType())||/\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(r.request().url())||/\/content\/pkg\//.test(r.request().url())?r.abort():r.continue());
  const row={source_id:'govinfo',observed_at:new Date().toISOString(),endpoint,query,query_verified:false,execution_mode:'documented-public-browser-search',full_content_downloaded:false};
  try{
   const res=await page.goto(endpoint,{waitUntil:'domcontentloaded',timeout:40000});row.initial_http={status:res.status(),url:res.url()};if(res.status()!==200)throw Error('Initial HTTP '+res.status());
   await page.waitForFunction(t=>[...document.querySelectorAll('a[href*="/app/details/"]')].some(a=>a.textContent.toLowerCase().includes(t.toLowerCase())),term,{timeout:40000});
   await pause(2000);row.visible_query=await page.getByRole('textbox',{name:'Search word',exact:true}).inputValue();row.search_url=page.url();
   row.records=await page.locator('a[href*="/app/details/"]').evaluateAll(as=>as.filter(a=>a.textContent.trim().toLowerCase()!=='details').map(a=>({title:a.textContent.trim(),url:a.href})));
   row.result_count_label=(await page.locator('body').innerText()).match(/[\d,]+ Records/)?.[0]||null;
   row.outcome='observed';row.observed_output_sha256=hash(row.records);
  }catch(e){row.outcome='failed';row.error=e.message;failures++;try{row.failure_ui_text=(await page.locator('body').innerText()).slice(0,1600);}catch{}}
  save(row);console.log(term,row.outcome,row.records?.length||0,row.error||'');await page.close();await pause(3000);if(failures>=2||[401,403,429,503].includes(row.initial_http?.status))break;
 }}finally{await ctx.close();await browser.close();}
})().catch(e=>{save({source_id:'govinfo',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;});
