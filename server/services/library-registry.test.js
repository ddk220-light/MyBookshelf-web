import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadLibraryRegistry,compareDirectory} from './library-registry.js';
const fingerprint='configuration-1';
function fixture(eligible=false){return {schemaVersion:1,purpose:'proposal_only',snapshotId:'snapshot',aliases:{old:'koha:a'},libraries:[{
  library_id:'koha:a',name:'Library',country:'IN',system:'koha',app_eligible:eligible?1:0,status:'Working',
  connections:[{connectionId:'route',versionId:'v1',label:'primary',catalogSystem:'koha',configurationFingerprint:fingerprint,
    configuration:{family:'koha',directoryEntry:{id:'koha:a',name:'Library',privateEndpoint:'secret'}},
    auditMethod:{fields:['title','keyword']},verifiedSearchFields:eligible?['title']:[],appAdapter:{implementationFingerprint:'implementation'},eligible,
    latestAppAssessment:eligible?{status:'Working',observation_kind:'live_http',configuration_fingerprint:fingerprint,app_implementation_fingerprint:'implementation'}:null,
    readinessGaps:eligible?[]:['audit_to_app_alignment_unverified']}]}]};}
function save(t,data){const dir=mkdtempSync(join(tmpdir(),'registry-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'library-registry.json'),raw=JSON.stringify(data);writeFileSync(path,raw);
  writeFileSync(join(dir,'registry-manifest.json'),JSON.stringify({snapshotId:data.snapshotId,sha256:{'library-registry.json':createHash('sha256').update(raw).digest('hex')}}));return path;}
test('proposal reader resolves aliases without promoting native Working',t=>{
  const reader=loadLibraryRegistry(save(t,fixture()));assert.equal(reader.resolve('old').library_id,'koha:a');assert.deepEqual(reader.publicLibraries(),[]);
  assert.ok(Object.isFrozen(reader.resolve('old').connections[0].configuration));assert.equal(reader.resolve('missing'),null);
});
test('eligible projection never exposes private route configuration or history',t=>{
  const reader=loadLibraryRegistry(save(t,fixture(true)));assert.deepEqual(reader.publicLibraries(),[{id:'koha:a',name:'Library',country:'IN',catalogSystems:['koha'],searchFields:['title']}]);
});
test('corrupt artifact fails closed',t=>{const path=save(t,fixture());writeFileSync(path,'{}');assert.throws(()=>loadLibraryRegistry(path),/checksum/);});
test('duplicate IDs and missing app implementation proof are rejected',t=>{
  const duplicate=fixture();duplicate.libraries.push(duplicate.libraries[0]);assert.throws(()=>loadLibraryRegistry(save(t,duplicate)),/duplicate/);
  const invalid=fixture(true);delete invalid.libraries[0].connections[0].latestAppAssessment.app_implementation_fingerprint;
  assert.throws(()=>loadLibraryRegistry(save(t,invalid)),/proof/);
});
test('offline comparison reports configuration and inventory drift without provider calls',t=>{
  const reader=loadLibraryRegistry(save(t,fixture()));
  const snapshot={entries:[{id:'koha:a',name:'Library',privateEndpoint:'changed'}],inventory:{libraries:[{libraryId:'koha:a',connections:[{connectionId:'primary',family:'koha'}]},{libraryId:'new',connections:[]}]}};
  const result=compareDirectory(reader,snapshot);assert.equal(result.providerRequests,0);assert.deepEqual(result.configurationDifferences.map(x=>x.reason),['configuration_differs','library_not_indexed']);
});
