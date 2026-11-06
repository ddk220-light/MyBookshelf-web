const fs=require('fs'),crypto=require('crypto'),cp=require('child_process');
const {webkit}=require(process.env.MYBOOKSHELF_PLAYWRIGHT_MODULE||'@playwright/test');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
(async()=>{
 const proxy=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
 const browser=await webkit.launch({headless:true,proxy:proxy?{server:proxy.origin}:undefined});
 const page=await browser.newPage({userAgent:input.user_agent});
 let apiQueue=Promise.resolve(),apiStopped=false,initialStatus=null;const errors=[],blocked=new Set();
 await page.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(!['www.nsdcindia.org','api1.nsdcindia.org'].includes(u.hostname)){blocked.add(u.origin);return route.abort();}
  if(['image','media','font'].includes(request.resourceType())||/\.(pdf|epub|zip|xlsx?|docx?)$/i.test(u.pathname)||/download/i.test(u.pathname))return route.abort();
  if(cp.spawnSync('python',[input.policy_checker,'--policy',input.policies,u.hostname,u.href]).status!==0){blocked.add('policy:'+u.pathname);return route.abort();}
  if(u.hostname==='api1.nsdcindia.org'){
   apiQueue=apiQueue.then(()=>new Promise(resolve=>setTimeout(resolve,input.pace_ms)));await apiQueue;
   if(apiStopped)return route.abort();
  }
  return route.continue();
 });
 page.on('response',r=>{if(r.status()>=400)errors.push({path:new URL(r.url()).pathname,status:r.status()});if([401,403,429,503].includes(r.status())&&new URL(r.url()).hostname==='api1.nsdcindia.org')apiStopped=true;});
 const cases=[...input.cases];if(input.include_empty_control)cases.push({id:'empty-control',query_text:'ZZQXNORESULT671932'});
 let current=cases[0];
 function save(cap){fs.appendFileSync(input.output,JSON.stringify(cap)+'\n');}
 try{
  const response=await page.goto('https://www.nsdcindia.org/insights-reports/sector-wise-reports',{waitUntil:'domcontentloaded',timeout:60000});initialStatus=response.status();
  if(initialStatus!==200)throw Error('Initial page HTTP'+initialStatus);
  await page.locator('table tbody tr').first().waitFor({timeout:45000});
  for(const c of cases){
   current=c;if(apiStopped)throw Error('Public browser backend access/service failure; stopped');
   await page.getByLabel('Title Name',{exact:true}).and(page.locator('input:visible')).fill(c.query_text,{timeout:10000});
   const textButton=page.locator('button:visible').filter({hasText:/^Search$/});
   if(await textButton.count())await textButton.first().click({timeout:10000});
   else{
    const icon=page.locator('button:visible').filter({has:page.locator('img[alt="search"][src="/assets/svgs/menu-search-icon.svg"]')});
    if(await icon.count()!==1)throw Error('Published search control changed');await icon.click({timeout:10000});
   }
   await page.waitForTimeout(Math.max(7000,input.pace_ms));
   if(apiStopped)throw Error('Public browser backend access/service failure; stopped');
   const records=await page.locator('table tbody tr').evaluateAll(es=>es.map(e=>({text:e.innerText,links:[...e.querySelectorAll('a')].map(a=>({url:a.href,label:a.getAttribute('aria-label'),title:a.title})),attributes:[...e.attributes].map(a=>[a.name,a.value])})));
   const text=await page.locator('body').innerText();const digest=crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
   save({case_id:c.id,observed_at:new Date().toISOString(),http:{status:200,truncated:false},records,rendered_result_sha256:digest,page_url:page.url(),visible_text_excerpt:text.slice(0,5000),http_errors:errors,blocked_external_origins:[...blocked],full_content_downloaded:false,error:null});
  }
 }catch(e){save({case_id:current.id,observed_at:new Date().toISOString(),http:{status:initialStatus,truncated:false},records:[],error:e.message.slice(0,2000),http_errors:errors,blocked_external_origins:[...blocked],full_content_downloaded:false});}
 finally{await browser.close();}
})();
