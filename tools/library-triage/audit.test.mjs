import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceStore } from '../../server/services/catalog-connectors/evidence.js';
import { hash } from '../../server/services/catalog-connectors/contracts.js';
import { initialize, readManifest, baseline, relevant, itemProof, classifyRoutes, auditLibrary, pendingJobs, reduce, report, validate, runBatch } from './audit.mjs';

function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'library-triage-test-')),store=new EvidenceStore(dir);store.acquire();
  t.after(()=>{store.release();rmSync(dir,{recursive:true,force:true});});return store;
}
function job(routes=null) {
  return {libraryId:'koha:test',name:'Test Library',family:'koha',routes:routes||[{connectionId:'primary',family:'koha',system:'koha',origins:['https://test.invalid'],memberCode:null,cluster:null,catalogUrl:'https://test.invalid/',eligible:true,method:'shared_native_opac_html',savedBlocker:null,queries:['History'],field:'keyword'}]};
}
function manifest(store,jobs=[job()]) {
  const m={purpose:'searchability_triage_not_twenty_book_qualification',total:jobs.length,libraries:jobs,inventoryHash:hash(jobs),policy:{libraryBudgetMs:1000}};store.save('manifest.json',m);return m;
}
function fakeService(store,jobValue=job(),overrides={}) {
  let searches=0,lookups=0;
  const ref=store.body('<p>History of India. Record 101</p>','text/html');
  const record={recordId:'101',title:'History of India',authors:['A Writer'],recordRef:'fixture-reference',catalogUrl:'https://test.invalid/record/101',linkKind:'record',observation:{outcome:'in_catalog'}};
  const envelope={observationKind:'live_http',freshness:{sourceContacted:true,observedAt:'2026-11-08T00:00:00Z'},evidence:[ref]};
  return {get searches(){return searches;},get lookups(){return lookups;},
    connection:()=>({descriptor:{...jobValue.routes[0],mode:'native_http',fields:['keyword','title']}}),
    search:async()=>{searches++;return {...envelope,fidelity:'website_equivalent',records:[record],total:{value:1},effectiveProfile:{field:'keyword'}};},
    resolve:async()=>{lookups++;return {...envelope,record};},...overrides};
}

test('all frozen IDs/routes initialize without promoting historical passes',t=>{
  const store=setup(t),m=initialize(store);assert.equal(m.total,6703);assert.equal(m.libraries.reduce((n,l)=>n+l.routes.length,0),6744);
  const result=report(store);assert.equal(result.working,0);assert.equal(result.working+result.needsWork+result.blocked,6703);
  assert.ok(result.pending>5000);assert.equal(result.liveChecked,0);assert.equal(validate(store).valid,true);
  assert.throws(()=>initialize(store),/Already initialized/);
});
test('non-core libraries need work and saved blockers remain dated, not live',()=>{
  const j=job();j.routes[0].eligible=false;assert.equal(baseline(j).category,2);assert.equal(baseline(j).assessed,true);
  j.routes[0].savedBlocker={code:'ROBOTS_DISALLOWED',reason:'Disallowed',observedAt:'2026-11-07'};
  assert.equal(baseline(j).category,3);assert.equal(baseline(j).liveChecked,false);assert.equal(baseline(j).routes[0].observedAt,'2026-11-07');
});
test('working alternate wins; blocked primary plus unsupported alternate needs work',()=>{
  assert.equal(classifyRoutes([{category:3},{category:1}]),1);assert.equal(classifyRoutes([{category:3},{category:2}]),2);assert.equal(classifyRoutes([{category:3},{category:3}]),3);
});
test('relevance matches complete normalized words, not substring accidents',()=>{
  assert.equal(relevant({title:'Chemistry'},'History'),false);assert.equal(relevant({title:'The History of India'},'history india'),true);
});
test('real query and item identity, scope, fresh evidence required',t=>{
  const store=setup(t),service=fakeService(store);
  return (async()=>{const search=await service.search(),detail=await service.resolve(),r=search.records[0];
    assert.equal(itemProof(r,detail.record,'History',search,detail),null);
    assert.equal(itemProof(r,{...detail.record,recordId:'999'},'History',search,detail),'item_identity_mismatch');
    assert.equal(itemProof(r,{...detail.record,observation:{outcome:'unknown'}},'History',search,detail),'library_membership_unconfirmed');
    assert.equal(itemProof(r,detail.record,'History',{...search,fidelity:'unverified'},detail),'unproven_query_scope_or_equivalence');
    assert.equal(itemProof(r,detail.record,'History',{...search,observationKind:'fixture'},detail),'not_live');
    assert.equal(itemProof(r,{...detail.record,linkKind:'catalog'},'History',search,detail),'item_link_unconfirmed');
    assert.equal(itemProof(r,detail.record,'History',search,{...detail,evidence:[]}),'missing_evidence');
  })();
});
test('successful run saves all results and resolved item proof and skips on resume',async t=>{
  const store=setup(t),m=manifest(store),service=fakeService(store);
  await runBatch(store,service,m);assert.equal(service.searches,1);assert.equal(service.lookups,1);assert.equal(validate(store).working,1);
  await runBatch(store,service,m);assert.equal(service.searches,1);
  report(store);assert.match(readFileSync(join(store.root,'results.csv'),'utf8'),/History of India/);
  assert.match(readFileSync(join(store.root,'items.csv'),'utf8'),/false/); // direct URL navigation not invented
});
test('empty completed searches need work, do not prove absence',async t=>{
  const store=setup(t),m=manifest(store),base=fakeService(store);const service=fakeService(store,job(),{search:async()=>({...await base.search(),records:[]})});
  await runBatch(store,service,m);const row=reduce(m,store.events())[0];assert.equal(row.category,2);assert.equal(row.routes[0].reason,'NO_RELEVANT_ITEMS_FOR_TESTED_TERMS');
});
test('parser bugs are needs work but actual access refusals are deferred',async t=>{
  for(const [code,category] of [['CATALOG_UNRECOGNIZED',2],['ROBOTS_DISALLOWED',3],['UPSTREAM_TIMEOUT',3]]){
    const store=setup(t),m=manifest(store),service=fakeService(store,job(),{search:async()=>{throw Object.assign(Error(code),{code});}});
    await runBatch(store,service,m);assert.equal(reduce(m,store.events())[0].category,category);
  }
});
test('frozen library scope drift stops before network',async t=>{
  const store=setup(t),m=manifest(store),service=fakeService(store);const original=service.connection;
  service.connection=()=>({descriptor:{...original().descriptor,memberCode:'FOREIGN'}});
  await runBatch(store,service,m);assert.equal(service.searches,0);assert.equal(reduce(m,store.events())[0].routes[0].reason,'CONFIG_CHANGED');
});
test('operator interruption stays pending and resumable',async t=>{
  const store=setup(t),m=manifest(store),ctrl=new AbortController(),service=fakeService(store,job(),{search:async()=>{ctrl.abort();throw Error('stopped');}});
  await runBatch(store,service,m,{signal:ctrl.signal});assert.equal(reduce(m,store.events())[0].assessed,false);
  await runBatch(store,fakeService(store),m);assert.equal(validate(store).working,1);
});
test('time budget is tooling work, not an infinite automatic retry or source block',async t=>{
  const store=setup(t),m=manifest(store);m.policy.libraryBudgetMs=5;
  const service=fakeService(store,job(),{search:async()=>{await new Promise(r=>setTimeout(r,20));throw Error('budget');}});
  await runBatch(store,service,m);const row=reduce(m,store.events())[0];assert.equal(row.category,2);assert.equal(row.assessed,true);assert.equal(row.routes[0].reason,'LIBRARY_BUDGET_EXCEEDED');
});
test('retry needs explicit IDs/reason and does not clear saved refusals',t=>{
  const store=setup(t),j=job();j.routes[0].savedBlocker={code:'ROBOTS_DISALLOWED'};const m=manifest(store,[j]);
  assert.equal(pendingJobs(m,[]).length,0);assert.throws(()=>pendingJobs(m,[],{retryReason:'some reason for retry'}),/explicit/);
  assert.equal(pendingJobs(m,[],{ids:[j.libraryId],retryReason:'Documented parser repair'}).length,0);
  assert.throws(()=>pendingJobs(m,[],{ids:['absent']}),/Unknown/);
});
test('missing raw evidence or tampered working identity fails validation',async t=>{
  const store=setup(t),m=manifest(store);await runBatch(store,fakeService(store),m);
  const events=store.events(),proof=events.find(e=>e.type==='triage_lookup');proof.record={...proof.record,recordId:'foreign'};
  writeFileSync(store.eventsPath,events.map(e=>JSON.stringify(e)).join('\n')+'\n');store.cachedEvents=null;
  assert.throws(()=>validate(store),/Working outcome lacks/);
});
test('frozen manifest tampering fails before collection',t=>{
  const store=setup(t),m=manifest(store);m.libraries[0].name='tampered';store.save('manifest.json',m);assert.throws(()=>readManifest(store),/inventory mismatch/);
});

test('actual connector service and governed fixture transport cannot create a live pass',async t=>{
  const { Coordinator }=await import('../../server/services/catalog-connectors/transport.js');
  const { ConnectorService }=await import('../../server/services/catalog-connectors/service.js');
  const store=setup(t),entry={id:'koha:test',platform:'koha',slug:'test',name:'Test',country:'IN',baseUrl:'https://catalog.test',catalogUrl:'https://catalog.test',capabilities:['availability']};
  const html='<body id="results"><h1>Your search returned 1 results.</h1><a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=9">History of India</a></body>';
  let calls=0;
  const coordinator=new Coordinator({store,robots:false,minGapMs:0,fetchImpl:async()=>{calls++;return new Response(html,{headers:{'Content-Type':'text/html'}});}});
  const service=new ConnectorService({coordinator,secret:'test-only-0123456789abcdef0123456789abcdef',lookup:()=>entry});
  const j=job();Object.assign(j.routes[0],service.connection(j.libraryId).descriptor);const m=manifest(store,[j]);
  await runBatch(store,service,m);assert.ok(calls>0);assert.equal(validate(store).working,0);
  assert.equal(store.events().find(e=>e.type==='triage_search').observationKind,'fixture');
});
test('corrupt content-addressed evidence fails validation',async t=>{
  const store=setup(t),m=manifest(store);await runBatch(store,fakeService(store),m);
  const ref=store.events().find(e=>e.type==='triage_lookup').evidence[0];writeFileSync(join(store.root,ref.path),'corrupted');
  assert.throws(()=>validate(store),/Missing or mismatched evidence/);
});
test('early batch selection includes independent core families',t=>{
  const store=setup(t),m=initialize(store),first=pendingJobs(m,store.events()).slice(0,5);
  assert.equal(new Set(first.map(j=>j.routes.find(r=>r.eligible&&!r.savedBlocker&&r.method!=='indcat_sru_scope_pending').family)).size,4);
});

test('spreadsheet exports escape source-supplied formulas without changing raw evidence',async()=>{
 const {quote}=await import('./audit.mjs');assert.equal(quote('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(quote('Ordinary title'),'"Ordinary title"');
});

test('native author credit may extend exact RSS title without conflating other works',async t=>{
 const s=setup(t),svc=fakeService(s),response=await svc.search(),resolved=await svc.resolve(),r=response.records[0];
 assert.equal(itemProof(r,{...r,title:'History of India / by A Writer'},'History',response,resolved),null);
 assert.equal(itemProof(r,{...r,title:'History of India / by Someone Else'},'History',response,resolved),'item_identity_mismatch');
 assert.equal(itemProof(r,{...r,title:'History of India and Pakistan'},'History',response,resolved),'item_identity_mismatch');
});
test('fresh native scoped item can pass with catalog handoff but handoff alone cannot',async t=>{
 const s=setup(t),svc=fakeService(s),response=await svc.search(),resolved=await svc.resolve(),r=response.records[0];
 const detail={...r,linkKind:'catalog',observation:{outcome:'in_catalog',recognizedExact:true,matchKind:'verified_work'}};
 assert.equal(itemProof(r,detail,'History',response,resolved),null);
 assert.equal(itemProof(r,detail,'History',response,{...resolved,evidence:[]}),'missing_evidence');
 assert.equal(itemProof(r,{...detail,observation:{outcome:'unknown',recognizedExact:true,matchKind:'verified_work'}},'History',response,resolved),'library_membership_unconfirmed');
});
