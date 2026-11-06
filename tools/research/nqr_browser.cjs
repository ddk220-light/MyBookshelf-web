// Repeat the advertised anonymous NQR keyword form; retain metadata only.
const fs=require('fs'),crypto=require('crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
(async()=>{
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:proxy?{server:proxy.origin}:undefined});
 try {
  const page=await browser.newPage({userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});
  await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname!=='www.nqr.gov.in'||/\.(pdf|epub|zip|mp[34]|docx?|xlsx?)$/i.test(u.pathname)||/download/i.test(u.pathname)?r.abort():r.continue();});
  let failures=[];page.on('response',r=>{if(r.status()>=400)failures.push({path:new URL(r.url()).pathname,status:r.status()});});
  for(const c of input.cases){let response,records=[],error=null;failures=[];const observed_at=new Date().toISOString();
   try {
    response=await page.goto('https://www.nqr.gov.in/filter-search',{waitUntil:'domcontentloaded',timeout:45000});
    if(response.status()!==200)throw Error('Initial page HTTP '+response.status());
    await page.waitForTimeout(input.pace_ms||3000);
    const field=page.locator('input[name=querySearch]').first();await field.fill(c.query_text);
    [response]=await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),field.press('Enter')]);
    if(response?.status()!==200)throw Error('Search HTTP '+response?.status());
    await page.waitForTimeout(3000);
    records=await page.locator('main a').evaluateAll(as=>as.filter(a=>/^https:\/\/www\.nqr\.gov\.in\/qualifications\/\d+$/.test(a.href)).slice(0,20).map(a=>({title:a.textContent.replace(/\s+/g,' ').trim(),url:a.href})));
   }catch(e){error=e.message.slice(0,250);}
   const rendered_result_sha256=crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
   fs.appendFileSync(input.output,JSON.stringify({case_id:c.id,query:c.query_text,request:c.request,observed_at,http:{status:response?.status()||null,truncated:false},records,error,failures,rendered_result_sha256,full_content_downloaded:false,credentials_saved:false})+'\n');
   console.log(c.id,records.length,error||'captured');if(error)break;await page.waitForTimeout(input.pace_ms||3000);
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
