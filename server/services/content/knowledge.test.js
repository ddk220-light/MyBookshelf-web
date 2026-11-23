import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createKnowledgeAdapters,createKnowledgeTransport,mapThoth,parsePythonInventory} from './knowledgeAdapters.js';
import {createKnowledgeService} from './knowledgeSearch.js';
import {createContentService} from './search.js';
import {contentKey,parseContentKey,readingActions} from './contracts.js';
const now=Date.parse('2026-11-05T03:00:00Z');
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_KNOWLEDGE_ENABLED:'true',CONTENT_CURSOR_SECRET:'synthetic-cursor-secret-longer-than-32-characters'};
const observedAt=new Date(now).toISOString();
const record={key:'fcd:v1:librivox:47',kind:'audiobook',title:'Fixture recording',contributors:[],languages:['en'],identifiers:[],subjects:[],relations:[],provenance:[],locations:[{id:'lv47',host:'LibriVox',readerUrl:'https://librivox.org/fixture/',landingUrl:'https://librivox.org/fixture/',access:'free_full_text',evidence:{sourceId:'librivox',field:'public recording',observedAt}}]};
const query={query:'fixture',sourceIds:['librivox'],kinds:['audiobook'],limit:1};
test('new identities retain source and language; malformed IDs cannot turn into fetch URLs',()=>{
  for(const key of ['fcd:v1:librivox:47','fcd:v1:loc:16017346','fcd:v1:bhl:flora_of_india','fcd:v1:wikipedia:hi:42','fcd:v1:python-docs:'+'a'.repeat(32)])assert.ok(parseContentKey(key));
  for(const key of ['fcd:v1:loc:../secret','fcd:v1:gdl:0','fcd:v1:librivox:https://evil.example','fcd:v1:wikipedia:evil:42','fcd:v1:python-docs:../../x'])assert.equal(parseContentKey(key),null);
  assert.notEqual(contentKey('wikipedia','42','en'),contentKey('wikipedia','42','hi'));
});
test('knowledge cursors survive a restart, bind filters, expire, reject tampering and retain separate native items',async()=>{
  let calls=0;const adapters={librivox:{search:async(_q,{sourceCursor})=>{calls++;return {items:[record],nextSourceCursor:sourceCursor==='0'?'1':null};}}};
  const make=(clock=now)=>createKnowledgeService({env,adapters,now:()=>clock});
  const first=await make().search(query);assert.equal(first.items[0].readingActions[0].label,'Listen at LibriVox');assert.ok(first.nextCursor);
  assert.equal((await make().search({...query,cursor:first.nextCursor})).nextCursor,null);
  for(const change of [{query:'another'},{limit:2},{includeUnclear:true},{cursor:first.nextCursor+'X'}])await assert.rejects(make().search({...query,cursor:first.nextCursor,...change}),e=>e.code==='CONTENT_CURSOR_EXPIRED');
  await assert.rejects(make(now+900001).search({...query,cursor:first.nextCursor}),e=>e.code==='CONTENT_CURSOR_EXPIRED');assert.equal(calls,2);
});
test('disabled/policy-held sources and unsupported languages fail before provider dispatch',async()=>{
  let calls=0;const service=createKnowledgeService({env,adapters:{wikipedia:{search(){calls++;}},librivox:{search(){calls++;}}}});
  await assert.rejects(service.search({query:'math',sourceIds:['wikipedia'],kinds:['article']}),e=>e.code==='CONTENT_DISABLED');
  await assert.rejects(service.search({...query,languages:['hi']}),e=>e.code==='CONTENT_FILTER_UNSUPPORTED');assert.equal(calls,0);
  const directory=createContentService({env}).sources().sources;assert.equal(directory.find(s=>s.id==='wikipedia').enabled,false);assert.equal(directory.find(s=>s.id==='librivox').enabled,true);
});
test('retail/print and unreviewed mirror locations cannot become free-reading actions',()=>{
  const base={workStatus:'ACTIVE',imprint:{publisher:{publisherId:'5da5617c-306b-4f68-b60b-abc74faf49f8'}},workId:'87ba80cb-eebd-4576-a8c4-a82a1b5bf19a',workType:'MONOGRAPH',titles:[{fullTitle:'Fixture work'}],landingPage:'https://press.lse.ac.uk/fixture',license:'https://creativecommons.org/licenses/by-nc/4.0/',publications:[{publicationType:'PAPERBACK',locations:[{canonical:true,fullTextUrl:'https://books.press.lse.ac.uk/paid'}]},{publicationType:'PDF',locations:[{canonical:true,fullTextUrl:'https://evil.example/book.pdf'},{canonical:false,fullTextUrl:'https://books.press.lse.ac.uk/mirror.pdf'}]}]};
  assert.deepEqual(readingActions(mapThoth('lse-press',base,observedAt),{now}),[]);
  base.publications.push({publicationType:'PDF',locations:[{canonical:true,fullTextUrl:'https://books.press.lse.ac.uk/fixture.pdf'}]});const mapped=mapThoth('lse-press',base,observedAt);assert.equal(readingActions(mapped,{now}).length,1);assert.match(mapped.locations[0].license.id,/by-nc/);
});
test('Sphinx inventory supports names with spaces, pins version, rejects external links and caps inflation',()=>{
  const inventory=(text,version='3.15')=>Buffer.concat([Buffer.from(`# Sphinx inventory version 2\n# Project: Python\n# Version: ${version}\n# compressed using zlib.\n`),deflateSync(text)]);
  const rows=parsePythonInventory(inventory('asyncio py:module 0 library/asyncio.html#$ -\ncommand line std:label -1 using/cmdline.html#command-line Command line\nforeign py:module 0 https://evil.example/evil -\n'),observedAt);assert.equal(rows.length,2);assert.equal(rows[1].title,'Command line');assert.match(rows[0].locations[0].readerUrl,/asyncio.html#asyncio/);
  assert.throws(()=>parsePythonInventory(inventory('x py:module 0 x.html -','3.16'),observedAt));assert.throws(()=>parsePythonInventory(inventory('x'.repeat(9*1024*1024)),observedAt));
});
test('GDL substring false positives are excluded while pagination advances across inspected native rows',async()=>{
  const books=[{postId:1,title:'Rain',postLink:'https://content.digitallibrary.io/en/book/rain/',language:[{slug:'en'}],license:[{slug:'cc-by-4-0'}]},{postId:2,title:'Queens of Shakrain',description:'A kite festival',postLink:'https://content.digitallibrary.io/en/book/kites/',language:[],license:[]}];
  const adapters=createKnowledgeAdapters({paceMs:0,fetchImpl:async()=>Response.json({books,meta:{count:8}})});
  const p=await adapters.gdl.search({query:'rain',languages:[],limit:2});assert.equal(p.items.length,1);assert.equal(p.nextSourceCursor,'2');
});
test('provider throttles and HTML errors are preserved; no retries or redirect following',async()=>{
  let count=0;const fetchImpl=async(_url,options)=>{count++;assert.equal(options.redirect,'error');return new Response('blocked',{status:429,headers:{'retry-after':'90'}});};const request=createKnowledgeTransport({fetchImpl,paceMs:0});
  await assert.rejects(request('https://api.thoth.pub/graphql'),e=>e.sourceStatus==='throttled'&&e.retryAfterSeconds===90);await assert.rejects(request('https://api.thoth.pub/graphql'),e=>e.sourceStatus==='throttled');assert.equal(count,1);
  await assert.rejects(createKnowledgeTransport({fetchImpl:async()=>new Response('<h1>Not JSON</h1>'),paceMs:0})('https://librivox.org/api/feed/audiobooks'),e=>e.sourceStatus==='unavailable');
});
test('cancelled queued requests finish promptly without allowing later requests to overlap the active provider',async()=>{
  let finishFirst,calls=0;
  const request=createKnowledgeTransport({paceMs:0,fetchImpl:async()=>{calls++;if(calls===1)await new Promise(resolve=>{finishFirst=resolve;});return Response.json({ok:true});}});
  const first=request('https://api.thoth.pub/graphql');await new Promise(resolve=>setImmediate(resolve));
  const controller=new AbortController();const queued=request('https://api.thoth.pub/graphql',{signal:controller.signal});const third=request('https://api.thoth.pub/graphql');
  controller.abort();await assert.rejects(queued,e=>e.sourceStatus==='timeout');assert.equal(calls,1);
  finishFirst();await Promise.all([first,third]);assert.equal(calls,2);
});
