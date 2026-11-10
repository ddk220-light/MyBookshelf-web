import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,appendFileSync,unlinkSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TriageEvidenceStore } from './evidence.mjs';
function setup(t){const dir=mkdtempSync(join(tmpdir(),'triage-segments-')),s=new TriageEvidenceStore(dir,{segmentBytes:1});s.acquire();t.after(()=>{s.release();rmSync(dir,{recursive:true,force:true});});return s;}
test('rollover preserves original bytes, dates and unique events across restart',t=>{const s=setup(t),a=s.append({type:'one',at:'2001-01-01T00:00:00Z'}),raw=readFileSync(join(s.root,'events.jsonl'));s.append({type:'two'});s.append({type:'three'});assert.deepEqual(readFileSync(join(s.root,'events.jsonl')),raw);assert.equal(s.validate().events,3);const reopened=new TriageEvidenceStore(s.root);assert.equal(reopened.events()[0].at,a.at);assert.equal(reopened.validate().events,3);});
test('cached reader and appended event include sealed history exactly once',t=>{const s=setup(t);s.append({type:'one'});s.events({cached:true});s.append({type:'two'});assert.equal(s.events({cached:true}).length,2);assert.equal(s.events().length,2);});
test('missing and corrupt sealed segments fail validation',t=>{const s=setup(t);s.append({type:'one'});s.append({type:'two'});const p=join(s.root,'events.jsonl'),raw=readFileSync(p);appendFileSync(p,'\n');assert.throws(()=>s.validate(),/mismatched/);writeFileSync(p,raw);unlinkSync(p);assert.throws(()=>s.validate());});
test('interrupted active tail is preserved and recovered only under writer lock',t=>{const s=setup(t);s.append({type:'one'});s.append({type:'two'});appendFileSync(s.eventsPath,'{"broken":');const reader=new TriageEvidenceStore(s.root);assert.throws(()=>reader.events({repairTail:true}),/writer lock/);assert.equal(s.events({repairTail:true}).length,2);s.append({type:'three'});assert.equal(s.validate().events,3);});
test('index published before first append safely resumes an empty active segment',t=>{const s=setup(t);s.append({type:'one'});s.append({type:'two'});writeFileSync(s.eventsPath,'');assert.equal(s.events().length,1);s.append({type:'replacement_unwritten_event'});assert.equal(s.validate().events,2);});
test('index paths cannot escape or reorder the evidence directory',t=>{const s=setup(t);s.save('journal-index.json',{schemaVersion:1,sealed:[],active:'../events.jsonl'});assert.throws(()=>s.events(),/Invalid triage journal index/);});
test('body hash validation still applies across sealed events',t=>{const s=setup(t),ref=s.body('source','text/plain');s.append({type:'one',evidence:[ref]});s.append({type:'two'});writeFileSync(join(s.root,ref.path),'tampered');assert.throws(()=>s.validate(),/evidence/);});

test('missing indexed active file is not silently treated as empty',t=>{const s=setup(t);s.append({type:'one'});s.append({type:'two'});unlinkSync(s.eventsPath);assert.throws(()=>s.events(),/Missing active/);assert.throws(()=>s.append({type:'three'}),/Missing active/);});
