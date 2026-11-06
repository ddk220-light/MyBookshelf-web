import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {EnvHttpProxyAgent} from 'undici';
import {createKnowledgeAdapters} from '../../server/services/content/knowledgeAdapters.js';
import {createKnowledgeService} from '../../server/services/content/knowledgeSearch.js';
import {FULL_COLLECTION_SOURCES} from '../../server/services/content/fullCollectionSources.js';
const dir='docs/research/free-content/evidence/2026-11-06-full-collection-release';
const policies=readFileSync(dir+'/policies.jsonl','utf8').trim().split('\n').map(JSON.parse);
const dispatcher=process.env.HTTPS_PROXY?new EnvHttpProxyAgent():undefined;
const requests=[];let active;
const fetchImpl=async(url,options)=>{const response=await fetch(url,{...options,dispatcher});const body=Buffer.from(await response.clone().arrayBuffer());requests.push({source:active,url:(()=>{const u=new URL(url);if(u.searchParams.has('key'))u.searchParams.set('key','REDACTED');return u.href;})(),status:response.status,contentType:response.headers.get('content-type'),bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});mkdirSync('/tmp/full-collection-responses',{recursive:true});writeFileSync('/tmp/full-collection-responses/'+active+'.body',body);return response;};
const adapters=createKnowledgeAdapters({fetchImpl,paceMs:3000});
const service=createKnowledgeService({env:{CONTENT_DISCOVERY_ENABLED:'true',CONTENT_KNOWLEDGE_ENABLED:'true',CONTENT_CURSOR_SECRET:'release-test-only-not-a-production-secret'},adapters});
const terms={doaj:"mathematics",onet:'Farmers','national-gallery-art':'Ginevra Benci','art-institute-chicago':'Nighthawks',core:'agriculture',metmuseum:'Buddha',tatoeba:'book','free-kids-books':'I Have the Mind of Jesus','google-books':'mathematics',appropedia:'drip irrigation',crossref:'Molecular Structure of Nucleic Acids',osti:'solar','cleveland-museum-art':'lotus','nasa-image-video-library':'Apollo','federal-register':'drinking water','internet-archive':'mathematics','fao-publications':'agroforestry','lever-press':'Otium',storyberries:'cat',nalibali:'moon','la-referencia':'mathematics'};
const selected=process.argv.slice(2);const report=[];
for(const [id,config] of Object.entries(FULL_COLLECTION_SOURCES)){
 if(selected.length&&!selected.includes(id))continue;active=id;
 if(!policies.filter(p=>p.id===id).at(-1)?.allowed){console.log(id,'policy not cleared');continue;}
 const term=process.env.CHECK_EMPTY==='true'?'zzzxqvMyBookshelfNoSuchRecord772991':terms[id];
 const query={query:term,sourceIds:[id],kinds:config.kinds,limit:3};
 try{let result=await service.search(query);let page=1;if(process.env.CHECK_PAGE_TWO==='true'&&result.nextCursor){const firstKeys=result.items.map(i=>i.key);result=await service.search({...query,cursor:result.nextCursor});page=2;if(result.items.some(i=>firstKeys.includes(i.key)))throw Error('Provider repeated first-page records');}const row={source:id,query:term,page,observedAt:new Date().toISOString(),returned:result.items.length,hasNext:!!result.nextCursor,items:result.items};report.push(row);console.log(id,result.items.length,result.items.map(i=>i.title).join(' | ').slice(0,200));}
 catch(e){report.push({source:id,query:term,error:e.message,code:e.code,sourceStatus:e.sources?.[0]?.status,observedAt:new Date().toISOString()});console.log(id,'ERROR',e.code,e.message);}
}
appendFileSync(dir+'/live-checks.jsonl',report.map(x=>JSON.stringify(x)).join('\n')+'\n');appendFileSync(dir+'/requests.jsonl',requests.length?requests.map(x=>JSON.stringify(x)).join('\n')+'\n':'');await dispatcher?.close();
