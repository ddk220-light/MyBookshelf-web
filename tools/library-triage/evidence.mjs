import { existsSync, readFileSync, statSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { join } from 'node:path';
import { EvidenceStore } from '../../server/services/catalog-connectors/evidence.js';
import { hash } from '../../server/services/catalog-connectors/contracts.js';

// Only the new triage run opts in. Original audit/repair stores stay unchanged.
// Completed journal files never move or change; the index seals each file before
// selecting a new append-only active file. An interrupted empty active file is safe.
export class TriageEvidenceStore extends EvidenceStore {
  constructor(root,{segmentBytes=20*1024*1024}={}) {
    super(root);this.segmentBytes=segmentBytes;
    this.eventsPath=join(root,this.index().active);
  }
  index() {
    const p=join(this.root,'journal-index.json');
    const data=existsSync(p)?JSON.parse(readFileSync(p,'utf8')):{schemaVersion:1,sealed:[],active:'events.jsonl'};
    const names=[...data.sealed.map(x=>x.path),data.active];
    if(data.schemaVersion!==1 || new Set(names).size!==names.length || names.some((n,i)=>n!==(i===0?'events.jsonl':`events-${String(i).padStart(6,'0')}.jsonl`)))throw Error('Invalid triage journal index');
    if(data.sealed.some(x=>!Number.isSafeInteger(x.events)||x.events<0||!Number.isSafeInteger(x.bytes)||x.bytes<0||!/^[a-f0-9]{64}$/.test(x.sha256)))throw Error('Invalid sealed journal metadata');
    return data;
  }
  events({repairTail=false,cached=false}={}) {
    if(cached && this.cachedEvents)return this.cachedEvents;
    const index=this.index(),rows=[];
    for(const segment of index.sealed) {
      const raw=readFileSync(join(this.root,segment.path));
      if(raw.length!==segment.bytes||hash(raw.toString('utf8'))!==segment.sha256||raw.length&&!raw.toString('utf8').endsWith('\n'))throw Error('Missing/mismatched sealed journal');
      const part=raw.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
      if(part.length!==segment.events)throw Error('Sealed journal count mismatch');
      rows.push(...part);
    }
    this.eventsPath=join(this.root,index.active);
    if(index.sealed.length && !existsSync(this.eventsPath))throw Error('Missing active journal');
    this.cachedEvents=null;
    rows.push(...super.events({repairTail,cached:false}));
    this.cachedEvents=rows;return rows;
  }
  append(event) {
    if(this.fd==null)throw Error('Evidence writer lock required');
    const index=this.index();this.eventsPath=join(this.root,index.active);
    if(index.sealed.length && !existsSync(this.eventsPath))throw Error('Missing active journal');
    if(existsSync(this.eventsPath)&&statSync(this.eventsPath).size>=this.segmentBytes) {
      const raw=readFileSync(this.eventsPath),text=raw.toString('utf8');
      if(!text.endsWith('\n'))throw Error('Recover interrupted active journal before rollover');
      const rows=text.split('\n').filter(Boolean).map(JSON.parse);
      index.sealed.push({path:index.active,sha256:hash(text),bytes:raw.length,events:rows.length});
      index.active=`events-${String(index.sealed.length).padStart(6,'0')}.jsonl`;
      const next=join(this.root,index.active);
      if(existsSync(next)) { if(statSync(next).size!==0)throw Error('Unindexed nonempty journal requires review'); }
      else { const fd=openSync(next,'wx',0o600);try{fsyncSync(fd);}finally{closeSync(fd);} }
      this.save('journal-index.json',index);
      this.eventsPath=join(this.root,index.active);
    }
    return super.append(event);
  }
}
