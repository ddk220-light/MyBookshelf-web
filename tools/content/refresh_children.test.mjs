import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {recheckRecord} from './refresh_children.mjs';

const record=JSON.parse(readFileSync(new URL('../../server/data/content/children-pilot.json',import.meta.url))).records.find(r=>r.language==='hi');
function source(){return {id:8,name:record.title,language:'Hindi',level:'1',isTranslation:true,publisher:{name:'Pratham Books'},
  authors:[{name:'Manisha Chaudhry'}],illustrators:[{name:'Parismita'}],originalStory:{id:7,authors:[{name:'Parismita'}]}};}
const proof={readStatus:401,freeAccountOffered:true,policyVerified:true,checkedAt:'2026-11-01T16:00:00Z'};
test('source recheck preserves review facts and only renews access after current source proof',()=>{
  const updated=recheckRecord(record,source(),proof);
  assert.equal(updated.review.reviewedAt,proof.checkedAt);assert.deepEqual(updated.contributors,record.contributors);
  assert.equal(updated.review.postLoginReadingVerified,false);assert.notEqual(record.review.reviewedAt,proof.checkedAt);
});
test('changed translations, charges, level or policy stop refresh instead of renewing stale claims',()=>{
  for(const mutate of [r=>r.authors[0].name='A different translator',r=>r.id=4300,r=>r.originalStory.id=55,r=>r.level='2',r=>r.isFlagged=true]){
    const data=source();mutate(data);assert.throws(()=>recheckRecord(record,data,proof),/manual source review/);
  }
  for(const patch of [{freeAccountOffered:false},{policyVerified:false},{readStatus:500},{checkedAt:'unknown'}])assert.throws(()=>recheckRecord(record,source(),{...proof,...patch}),/Current free-account/);
});
