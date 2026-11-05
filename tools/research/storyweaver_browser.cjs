/* Normal public home->advanced-search interaction. No reader or private API. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const output=path.resolve(__dirname,'../../docs/research/free-content/registry/examples/storyweaver.browser.jsonl');
const save=x=>fs.appendFileSync(output,JSON.stringify(x)+'\n'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;const browser=await webkit.launch({headless:true,proxy:p?{server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});const page=await ctx.newPage();
 await page.route('**/*',r=>['media','image'].includes(r.request().resourceType())||/\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(r.request().url())?r.abort():r.continue());
 try{
  const res=await page.goto('https://storyweaver.org.in/',{waitUntil:'domcontentloaded',timeout:40000});if(res.status()!==200)throw Error('Initial HTTP '+res.status());await pause(10000);
  const back=page.getByRole('button',{name:'Back to Home',exact:true});if(await back.count())await back.click();
  const first=page.getByPlaceholder('Search for a topic');await first.waitFor({timeout:30000});await first.click({noWaitAfter:true});await page.waitForURL(u=>u.pathname==='/en/advanced-search',{timeout:30000});await pause(2000);
  for(const query of process.argv.slice(2)){
   const row={source_id:'storyweaver',observed_at:new Date().toISOString(),endpoint:'https://storyweaver.org.in/',query,initial_http:{status:res.status()},query_verified:false,full_content_downloaded:false};
   try{
    const search=new URL('https://storyweaver.org.in/en/search');search.search=new URLSearchParams({intent:'1',query,tab:'matches',language:'English'}).toString();
    const result=await page.goto(search.href,{waitUntil:'domcontentloaded',timeout:40000});row.search_http_status=result.status();
    await page.waitForFunction(q=>[...document.querySelectorAll('a[href*="/en/stories/"]')].some(a=>a.textContent.trim().toLowerCase().includes(q.toLowerCase())),query,{timeout:25000});await pause(2000);
    row.search_url=page.url();row.query_echo=new URL(page.url()).searchParams.get('query');row.language_filter=new URL(page.url()).searchParams.get('language');
    row.records=await page.locator('a[href*="/en/stories/"]').evaluateAll(as=>{const seen=new Set();return as.filter(a=>a.textContent.trim()&&!seen.has(a.href)&&seen.add(a.href)).slice(0,30).map(a=>({title:a.textContent.trim(),url:a.href}));});
    row.outcome='observed';row.observed_output_sha256=hash(row.records);
   }catch(e){row.outcome='failed';row.error=e.message;try{row.failure_text=(await page.locator('body').innerText()).slice(0,2500);row.failure_url=page.url();row.inputs=await page.locator('input').evaluateAll(xs=>xs.map(x=>({placeholder:x.placeholder,type:x.type,value:x.type==='password'?'[excluded]':x.value})));}catch{}}
   save(row);console.log(query,row.outcome,row.records?.length||0,row.error||'');if(row.outcome==='failed')break;await pause(3000);
  }
 }catch(e){save({source_id:'storyweaver',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;}finally{await ctx.close();await browser.close();}
})();
