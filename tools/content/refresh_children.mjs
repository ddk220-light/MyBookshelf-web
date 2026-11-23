import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,createPublicKey} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validateChildrenManifest} from '../../server/services/content/children.js';

// Recheck a small, already reviewed set. This is not a discovery scraper and
// never logs credentials, browser state, story text, artwork or source payloads.
export function recheckRecord(record,metadata,{readStatus,freeAccountOffered,policyVerified,checkedAt}) {
  const id=Number(record.key.split(':').at(-1));
  const language={en:'English',hi:'Hindi',ta:'Tamil'}[record.language];
  const credits=[...(metadata.isTranslation?metadata.originalStory?.authors:metadata.authors)||[]].map(c=>({name:c.name,role:'author'}));
  credits.push(...(metadata.illustrators||[]).map(c=>({name:c.name,role:'illustrator'})));
  if(metadata.isTranslation)credits.push(...(metadata.authors||[]).map(c=>({name:c.name,role:'translator'})));
  const sorted=values=>JSON.stringify(values.map(value=>JSON.stringify(value)).sort());
  if(record.access!=='free_account_required'||metadata.id!==id||metadata.name?.trim()!==record.title
    ||metadata.language!==language||'Level '+metadata.level!==record.readingLevel.label
    ||metadata.publisher?.name!==record.publisher||metadata.isFlagged===true
    ||sorted(credits)!==sorted(record.contributors)
    ||(record.originalStoryKey&&Number(record.originalStoryKey.split(':').at(-1))!==metadata.originalStory?.id)) {
    throw Error('Reviewed metadata changed; manual source review is required for '+record.key);
  }
  if(readStatus!==401||freeAccountOffered!==true||policyVerified!==true||!Number.isFinite(Date.parse(checkedAt))) {
    throw Error('Current free-account reading and book-policy evidence is required for '+record.key);
  }
  return {...structuredClone(record),review:{...record.review,reviewedAt:checkedAt,
    reviewedBy:'Codex-reviewed metadata; unchanged-record browser recheck',postLoginReadingVerified:false}};
}

async function refresh(outputPath) {
  const {chromium}=await import('playwright');
  const baseline=JSON.parse(await readFile(new URL('../../server/data/content/children-pilot.json',import.meta.url),'utf8'));
  validateChildrenManifest(baseline);
  const options={headless:true};
  if(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)options.executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const proxyValue=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
  if(proxyValue){const proxy=new URL(proxyValue);options.proxy={server:proxy.protocol+'//'+proxy.host,
    ...(proxy.username?{username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}:{})};}
  if(process.env.NODE_EXTRA_CA_CERTS){
    const spki=createPublicKey(await readFile(process.env.NODE_EXTRA_CA_CERTS)).export({type:'spki',format:'der'});
    options.args=['--ignore-certificate-errors-spki-list='+createHash('sha256').update(spki).digest('base64')];
  }
  const browser=await chromium.launch(options);
  try {
    const context=await browser.newContext();const page=await context.newPage();
    await page.goto('https://storyweaver.org.in/en/open-content',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>/all stories and illustrations is CCBY4\.0/.test(document.body.innerText),{timeout:30000});
    const policyVerified=await page.locator('a[href="https://creativecommons.org/licenses/by/4.0/"]').count()>0;
    const records=[];
    for(const record of baseline.records){
      const slug=new URL(record.recordUrl).pathname.split('/').at(-1);
      const metadataResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/node/api/v1/stories/'+slug,{timeout:30000});
      await page.goto(record.recordUrl,{waitUntil:'domcontentloaded',timeout:30000});
      const response=await metadataResponse;
      if(!response.ok())throw Error('Public source metadata unavailable for '+record.key);
      const raw=await response.body();if(raw.length>256*1024)throw Error('Source metadata exceeds review bound');
      const metadata=JSON.parse(raw.toString()).data;
      const read=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/stories/'+slug+'/read',{timeout:25000});
      await page.getByText('Read Story',{exact:true}).first().click({timeout:25000});
      const readResponse=await read;
      await page.getByText('Join StoryWeaver to keep the story going!',{exact:true}).waitFor({timeout:15000});
      const freeAccountOffered=(await page.locator('body').innerText()).includes('Sign-up for a free StoryWeaver account');
      records.push(recheckRecord(record,metadata,{readStatus:readResponse.status(),freeAccountOffered,policyVerified,checkedAt:new Date().toISOString()}));
      process.stdout.write('Verified unchanged metadata and free-account offer: '+record.key+'\n');
      // Keep the handful of source visits sequential and deliberately spaced.
      await page.waitForTimeout(1100);
    }
    const candidate={...baseline,records};validateChildrenManifest(candidate);
    const target=resolve(outputPath),temporary=target+'.tmp';
    await writeFile(temporary,JSON.stringify(candidate,null,2)+'\n');await rename(temporary,target);
    process.stdout.write('Prepared '+records.length+' reviewed metadata records; no source login or full text stored.\n');
  } finally {await browser.close();}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const outputIndex=process.argv.indexOf('--output');
  if(outputIndex<0||!process.argv[outputIndex+1])throw Error('Usage: node tools/content/refresh_children.mjs --output <candidate.json>');
  await refresh(process.argv[outputIndex+1]);
}
