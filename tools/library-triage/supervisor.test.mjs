import test from 'node:test';
import assert from 'node:assert/strict';
import { publishTriageCheckpoint } from './supervisor.mjs';
const path='docs/research/india-library-audit/search-triage/india-20261108';
function gitMock({remote='old',staged='',pushFail=false}={}) {
  const calls=[]; let added=false;
  const git=a=>{calls.push(a); if(a[0]==='diff')return added?path+'/events.jsonl':staged;
    if(a[0]==='rev-parse')return a[1]==='FETCH_HEAD'?remote:calls.some(c=>c[0]==='commit')?'new':'old';
    if(a[0]==='add')added=true;
    if(a[0]==='push'&&pushFail)throw Error('publish failed'); return '';};
  return {git,calls};
}
test('publishes only triage evidence after matching remote',()=>{const m=gitMock();assert.equal(publishTriageCheckpoint({...m,path,expectedLocal:'old'}),'new');assert.deepEqual(m.calls.find(a=>a[0]==='add'),['add','--',path]);assert.deepEqual(m.calls.at(-1),['push','origin','HEAD:refs/heads/feat/library-connector-audit']);});
test('changed remote stops before staging',()=>{const m=gitMock({remote:'other'});assert.throws(()=>publishTriageCheckpoint({...m,path,expectedLocal:'old'}),/Remote branch/);assert(!m.calls.some(a=>a[0]==='add'));});
test('unrelated staged edits stay untouched',()=>{const m=gitMock({staged:'client/other.ts'});assert.throws(()=>publishTriageCheckpoint({...m,path,expectedLocal:'old'}),/Unrelated/);assert.equal(m.calls.length,1);});
test('old audit directories cannot be published',()=>{const m=gitMock();assert.throws(()=>publishTriageCheckpoint({...m,path:'docs/research/india-library-audit/revalidation/20261107',expectedLocal:'old'}),/scope/);assert.equal(m.calls.length,0);});
test('push failure is not reported as success',()=>{const m=gitMock({pushFail:true});assert.throws(()=>publishTriageCheckpoint({...m,path,expectedLocal:'old'}),/publish failed/);assert(m.calls.some(a=>a[0]==='commit'));});
