import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';
import {createContentService} from './search.js';
const now=Date.parse('2026-11-03T14:00:00Z');
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_EUROPEPMC_ENABLED:'true',CONTENT_OPENALEX_ENABLED:'true',
  CONTENT_CURSOR_SECRET:'synthetic-live-secret-with-at-least-32-characters'};
const query={query:'malaria',kinds:['article'],limit:2};
const item=(id,access='free_full_text')=>({key:`fcd:v1:europepmc:MED:${id}`,kind:'article',title:'Synthetic live fixture '+id,languages:['en'],
  contributors:[],provenance:[{sourceId:'europepmc'}],locations:[{id:'oa',host:'Europe PMC',landingUrl:`https://europepmc.org/articles/PMC${id}`,
    access,evidence:{sourceId:'europepmc',field:'explicit OA location',observedAt:new Date(now).toISOString()}}]});
function service(adapters,options={}){return createContentService({env,adapters,now:()=>now,...options});}

test('live requests need no store/budget variables; cursors work after restart and replay makes another request',async()=>{
  const calls=[];const adapters={europepmc:{search:async(_q,{sourceCursor})=>{
    calls.push(sourceCursor);return {items:[item(sourceCursor==='*'?1:2)],nextSourceCursor:sourceCursor==='*'?'native-next':null};}}};
  const first=await service(adapters).search(query);
  assert.equal(first.searchMode,'live');assert.equal(first.items[0].key,item(1).key);
  const second=await service(adapters).search({...query,cursor:first.nextCursor});
  assert.equal(second.items[0].key,item(2).key);assert.equal(second.nextCursor,null);
  assert.deepEqual(await service(adapters).search({...query,cursor:first.nextCursor}),second);
  assert.deepEqual(calls,['*','native-next','native-next']);
  const token=JSON.parse(Buffer.from(first.nextCursor.split('.')[0],'base64url').toString());
  assert.equal(token.native,'native-next');assert.equal(token.id,'europepmc');
  assert.deepEqual(Object.keys(token).sort(),['binding','expires','history','id','native','page','profile']);
  assert.equal(JSON.stringify(token).includes('Synthetic live fixture'),false);
});

test('changed context, expired/tampered/old session cursors fail before any upstream request',async()=>{
  let calls=0;const adapters={europepmc:{search:async()=>{calls++;return {items:[item(1)],nextSourceCursor:'next'};}}};
  const first=await service(adapters).search(query);
  for(const patch of [{query:'cancer'},{country:'IN'},{includeUnclear:true},{access:'free_full_text'},
    {kinds:['preprint']},{limit:3},{sourceIds:['europepmc']},{cursor:first.nextCursor+'X'},{cursor:'https://evil.example/next'}]){
    await assert.rejects(service(adapters).search({...query,cursor:first.nextCursor,...patch}),e=>e.code==='CONTENT_CURSOR_EXPIRED');
  }
  await assert.rejects(service(adapters,{now:()=>now+901000}).search({...query,cursor:first.nextCursor}),e=>e.status===409);
  const old=Buffer.from(JSON.stringify({previous:'a'.repeat(64),binding:'b'.repeat(64),expires:now+900000})).toString('base64url');
  const mac=createHmac('sha256',env.CONTENT_CURSOR_SECRET).update(old).digest('base64url');
  await assert.rejects(service(adapters).search({...query,cursor:old+'.'+mac}),e=>e.status===409);
  assert.equal(calls,1);
});

test('long provider cursors remain bounded without carrying result buffers',async()=>{
  const first=await service({europepmc:{search:async()=>({items:[item(1)],nextSourceCursor:'x'.repeat(1500)})}}).search(query);
  assert.ok(first.nextCursor.length<4096);
  await assert.rejects(service({europepmc:{search:async()=>({items:[],nextSourceCursor:'x'.repeat(1501)})}}).search(query),e=>e.code==='CONTENT_UNAVAILABLE');
});

test('provider cursor cycles and continuation depth stop rather than looping',async()=>{
  const adapters={europepmc:{search:async(_q,{sourceCursor})=>({items:[item(1)],nextSourceCursor:sourceCursor==='*'?'next':'*'})}};
  const first=await service(adapters).search(query),second=await service(adapters).search({...query,cursor:first.nextCursor});
  assert.equal(second.nextCursor,null);assert.equal(second.sources.find(s=>s.id==='europepmc').truncated,true);
  let calls=0;const make=()=>service({europepmc:{search:async()=>({items:[item(1)],nextSourceCursor:String(++calls)})}});
  let cursor;do{const page=await make().search({...query,...cursor?{cursor}:{}});cursor=page.nextCursor;}while(cursor);
  assert.equal(calls,50);
});

test('access and kind filters may underfill a live page without losing its continuation',async()=>{
  const unknown=item(2,'unknown'),restricted=item(3,'restricted'),account=item(4,'free_account_required');
  const input={...query,limit:4};const adapters={europepmc:{search:async()=>({items:[item(1),unknown,restricted,account],nextSourceCursor:'next'})}};
  const normal=await service(adapters).search(input);
  assert.deepEqual(normal.items.map(i=>i.key),[item(1).key,account.key]);assert.equal(normal.hiddenUnclear,1);assert.ok(normal.nextCursor);
  const unclear=await service(adapters).search({...input,includeUnclear:true});
  assert.equal(unclear.items.find(i=>i.key===unknown.key).readingActions.length,0);
  assert.equal(unclear.items.some(i=>i.key===restricted.key),false);
  const anonymous=await service(adapters).search({...input,access:'free_full_text'});
  assert.deepEqual(anonymous.items.map(i=>i.key),[item(1).key]);
  const preprints=await service(adapters).search({...input,kinds:['preprint']});
  assert.equal(preprints.items.length,0);assert.ok(preprints.nextCursor);
});

test('throttles, free-allowance exhaustion and failures stay explicit; failed requests are not cached',async()=>{
  for(const status of ['throttled','quota_exhausted','timeout','unavailable']){
    let calls=0;const adapters={europepmc:{search:async()=>{calls++;throw Object.assign(Error('private upstream detail'),{sourceStatus:status,retryAfterSeconds:23});}}};
    for(let i=0;i<2;i++)await assert.rejects(service(adapters).search(query),e=>e.code==='CONTENT_UNAVAILABLE'&&e.status===503&&e.sources.find(s=>s.id==='europepmc').status===status&&!e.message.includes('private upstream'));
    assert.equal(calls,2);
  }
  const empty=await service({europepmc:{search:async()=>({items:[],nextSourceCursor:null})}}).search(query);
  assert.equal(empty.sources.find(s=>s.id==='europepmc').status,'ok');assert.deepEqual(empty.items,[]);
});

test('resolve always requests the exact native record live and preserves access evidence',async()=>{
  const calls=[];const adapters={europepmc:{search:async(q,options)=>{calls.push({q,options});return {items:[item(1)]};}}};
  for(let i=0;i<2;i++){const result=await service(adapters).resolve({key:item(1).key});assert.equal(result.item.key,item(1).key);assert.equal(result.item.readingActions.length,1);}
  assert.equal(calls.length,2);assert.equal(calls[0].q.limit,1);
  assert.deepEqual(calls[0].options.exactRecord,{sourceId:'europepmc',recordId:'1',recordSource:'MED'});
  await assert.rejects(service({europepmc:{search:async()=>({items:[]})}}).resolve({key:item(1).key}),e=>e.status===404);
});

test('progress reports one selected source and aborts do not dispatch extra work',async()=>{
  let calls=0,signal;const progress=[];
  const adapter={search:async(_q,options)=>{calls++;signal=options.signal;return {items:[item(1)]};}};
  await service({europepmc:adapter}).search(query,{onSource:s=>progress.push(s)});
  assert.deepEqual(progress.filter(s=>s.id==='europepmc').map(s=>s.status),['searching','ok']);
  assert.equal(signal instanceof AbortSignal,true);
  const controller=new AbortController();controller.abort();
  await assert.rejects(service({europepmc:adapter}).search(query,{signal:controller.signal}));assert.equal(calls,1);
});
