/* MSHA's officially linked Public Research guest form; metadata only. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const endpoint='https://digitallibrary.msha.gov/#!autologin/research';
const output=path.resolve(__dirname,'../../docs/research/free-content/registry/examples/msha-digital-library.browser.jsonl');
const save=x=>fs.appendFileSync(output,JSON.stringify(x)+'\n');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:p?{server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
 let failures=0;
 try{for(const query of process.argv.slice(2)){
  const page=await ctx.newPage(),blocked=[];
  await page.route('**/*',route=>{
   const u=route.request().url();
   if(['media','image'].includes(route.request().resourceType())||/\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(u)||/\/awdocumentprovider\/|\/product\/download\/|\/pdfjs\//.test(u)){
    if(/\/awdocumentprovider\/|\/product\/download\/|\/pdfjs\//.test(u))blocked.push('document/media request blocked');
    return route.abort();
   }return route.continue();
  });
  const row={source_id:'msha-digital-library',observed_at:new Date().toISOString(),endpoint,query,query_verified:false,execution_mode:'published-public-research-browser-form',full_content_downloaded:false};
  try{
   const res=await page.goto(endpoint,{waitUntil:'domcontentloaded',timeout:40000});row.initial_http={status:res.status(),url:res.url()};
   if(res.status()!==200)throw Error('Initial HTTP '+res.status());
   const input=page.getByPlaceholder('Search or press enter for all records');await input.waitFor({timeout:30000});await pause(3000);
   await input.fill(query);await input.press('Enter');
   await page.waitForURL(u=>new URLSearchParams(u.hash.split('?')[1]||'').get('q')===query,{timeout:30000});
   await page.waitForFunction(q=>{
    const titles=[...document.querySelectorAll('.ui-grid-row a.pointMe[title]')].map(x=>x.title.toLowerCase());
    return titles.some(t=>t.includes(q.toLowerCase())) || /\b0 - 0 of 0\b|No results found|No records found/i.test(document.body.innerText);
   },query,{timeout:30000});await pause(3000);
   row.visible_query=await input.inputValue();row.search_url=page.url();
   row.guest_label=await page.getByText('Welcome, Public Research',{exact:true}).innerText();
   row.visible_titles=await page.locator('.ui-grid-row a.pointMe[title]').evaluateAll(as=>as.map(a=>a.title));
   row.paging_text=(await page.locator('body').innerText()).match(/\d+ - \d+ of [\d,]+/)?.[0]||null;
   const index=row.visible_titles.findIndex(t=>t.toLowerCase().includes(query.toLowerCase()));
   row.records=[];
   if(index>=0){
    await page.locator('.ui-grid-row a.pointMe[title]').nth(index).click({position:{x:8,y:8},timeout:15000});
    const link=page.locator('a[href*="/product/download/"][href$="?metadata=true"]').first();
    await link.waitFor({state:'attached',timeout:20000});
    const metadata_url=await link.getAttribute('href');
    row.records=[{title:row.visible_titles[index],metadata_url:new URL(metadata_url,'https://digitallibrary.msha.gov/').href,landing_page:row.search_url}];
   }
   row.outcome='observed';row.observed_output_sha256=hash(row.records);
   row.blocked_content_requests=blocked.length;
  }catch(e){row.outcome='failed';row.error=e.message;failures++;try{row.failure_ui_text=(await page.locator('body').innerText()).slice(0,1800);}catch{}}
  save(row);console.log(query,row.outcome,row.records?.[0]?.metadata_url||'',row.error||'');
  await page.close();await pause(3000);if(failures>=2||[401,403,429,503].includes(row.initial_http?.status))break;
 }}finally{await ctx.close();await browser.close();}
})().catch(e=>{save({source_id:'msha-digital-library',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;});
