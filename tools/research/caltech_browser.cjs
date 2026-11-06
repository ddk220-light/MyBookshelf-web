const fs=require('fs'),crypto=require('crypto');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
(async()=>{
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:proxy?{server:proxy.origin}:undefined});
 try {const page=await browser.newPage({userAgent:'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'});await page.route('**/*',r=>{const u=new URL(r.request().url());return u.hostname!=='thesis.caltech.edu'||/\.(pdf|epub|zip|mp3|mp4)$/i.test(u.pathname)?r.abort():r.continue();});
 for(const c of input.cases){const observed_at=new Date().toISOString();let response;let records=[];let error=null;
  try {response=await page.goto(c.request.url,{waitUntil:'domcontentloaded',timeout:30000});if(response.status()!==200)throw Error('HTTP '+response.status());
   await page.locator('pagefind-results a').first().waitFor({timeout:25000});
   records=await page.locator('pagefind-results a').evaluateAll(as=>as.slice(0,2).map(a=>({title:a.textContent.trim(),url:a.href})));
  }catch(e){error=e.message.slice(0,250);}
  const rendered_result_sha256=crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
  fs.appendFileSync(input.output,JSON.stringify({case_id:c.id,query:c.query_text,request:c.request,observed_at,http:{status:response?.status()||null,truncated:false},records,error,rendered_result_sha256,full_content_downloaded:false})+'\n');
  console.log(c.id,records.length,error||'captured');if(error)break;await page.waitForTimeout(input.pace_ms||3000);
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
