/* Public approved-storybook UI and language filter; never opens a book. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const output=path.resolve(__dirname,'../../docs/research/free-content/registry/examples/african-storybook.browser.jsonl');
const save=x=>fs.appendFileSync(output,JSON.stringify(x)+'\n'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;const browser=await webkit.launch({headless:true,proxy:p?{server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined});
 const ctx=await browser.newContext({viewport:{width:1280,height:900},userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});const page=await ctx.newPage();
 await page.route('**/*',r=>['media','image'].includes(r.request().resourceType())||/\.(pdf|epub|mp3|mp4|zip)(?:\?|$)/i.test(r.request().url())||/\/(reader|pdf)\.php/.test(r.request().url())?r.abort():r.continue());
 try{
  const res=await page.goto('https://www.africanstorybook.org/',{waitUntil:'domcontentloaded',timeout:40000});if(res.status()!==200)throw Error('Initial HTTP '+res.status());await pause(12000);
  await page.locator('a.open-popover.button').filter({hasText:/^Read$/}).click();const approved=page.locator('a[onclick*="read/index.approved.php"]');await pause(1500);if(!await approved.isVisible()){await page.locator('a.open-popover.button').filter({hasText:/^Read$/}).click();}await approved.click();
  const input=page.locator('#storySearchId');await input.waitFor({timeout:30000});await page.locator('#lang1 option[value="0"]').waitFor({state:'attached',timeout:30000});await pause(3000);
  for(const query of process.argv.slice(2)){
   const row={source_id:'african-storybook',observed_at:new Date().toISOString(),endpoint:'https://www.africanstorybook.org/',query,initial_http:{status:res.status()},query_verified:false,full_content_downloaded:false};
   try{
    await input.fill(query);await input.press('Enter');await pause(5000);
    await page.waitForFunction(q=>[...document.querySelectorAll('.list-block-search-reader a[onclick]')].filter(a=>a.getClientRects().length).some(a=>a.querySelector('.item-title')?.textContent.toLowerCase().includes(q.toLowerCase())),query,{timeout:20000});
    row.visible_query=await input.inputValue();row.language_value=await page.locator('#lang1').inputValue();row.language_label=await page.locator('#lang1 option:checked').innerText();
    row.records=await page.locator('.list-block-search-reader a[onclick]').evaluateAll(as=>as.filter(a=>a.getClientRects().length).slice(0,40).map(a=>({title:a.querySelector('.item-title')?.textContent.trim(),creator:a.querySelector('.item-subtitle')?.textContent.trim(),native_action:a.getAttribute('onclick'),language_id:a.getAttribute('data-language'),approved:a.getAttribute('data-approved'),reading_level:a.getAttribute('data-readinglevel'),date_attribute:a.getAttribute('data-date')})));
    row.outcome='observed';row.observed_output_sha256=hash(row.records);
   }catch(e){row.outcome='failed';row.error=e.message;}
   save(row);console.log(query,row.outcome,row.records?.length||0,row.error||'');if(row.outcome==='failed')break;await pause(3000);
  }
 }catch(e){save({source_id:'african-storybook',observed_at:new Date().toISOString(),outcome:'worker-error',error:e.message,query_verified:false});process.exitCode=1;}finally{await ctx.close();await browser.close();}
})();
