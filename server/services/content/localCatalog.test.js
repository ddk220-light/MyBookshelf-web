import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalContentService } from './localCatalog.js';
const now = Date.parse('2026-11-01T08:00:00Z');
const observedAt = new Date(now).toISOString();
function item(id,access='free_full_text') { return {key:`fcd:v1:gutenberg:${id}`,kind:'book',title:'Fixture title '+id,
  contributors:[{name:'Contract Author',role:'author'}],subjects:[],languages:['en'],identifiers:[],provenance:[],relations:[],
  locations:[{id:String(id),host:'Project Gutenberg',landingUrl:`https://www.gutenberg.org/ebooks/${id}`,access,
    evidence:{sourceId:'gutenberg',field:'rights and formats',observedAt},downloads:[]}]}; }
const data={schemaVersion:1,sourceId:'gutenberg',revision:'a'.repeat(64),recordCount:4,complete:false,importedAt:observedAt,
  records:[item(1),item(2),item(3),item(4,'borrow')]};
function service(options={}) { return createLocalContentService({enabled:true,cursorSecret:'test-only-cursor-secret-of-32-characters',now:()=>now,loadSnapshot:()=>structuredClone(data),...options}); }

test('replayed cursors and process restarts preserve pages without skips or duplicates', () => {
  const first=service().search({query:'Fixture',limit:2});
  assert.equal(first.items.length,2);
  const body={query:'Fixture',limit:2,cursor:first.nextCursor};
  const second=service().search(body);
  assert.deepEqual(service().search(body),second);
  assert.equal(second.items.length,1);
  assert.equal(second.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.key)).size,3);
  assert.equal(first.sources[0].complete,false);
});
test('cursor binding rejects changed query, country, index, tampering and expiry', () => {
  const cursor=service().search({query:'Fixture',limit:2}).nextCursor;
  for (const patch of [{query:'Author'},{country:'IN'},{limit:3},{includeUnclear:true},{cursor:cursor+'X'}]) assert.throws(()=>service().search({query:'Fixture',limit:2,cursor,...patch}), /search/i);
  assert.throws(()=>service({now:()=>now+901000}).search({query:'Fixture',limit:2,cursor}),/expired/);
  assert.throws(()=>service({loadSnapshot:()=>({...data,revision:'b'.repeat(64)})}).search({query:'Fixture',limit:2,cursor}),/expired/);
});
test('deep-link resolution survives restart; stale access is unknown rather than free', () => {
  assert.equal(service().resolve({key:'fcd:v1:gutenberg:1',country:'IN'}).item.readingActions.length,1);
  const stale=service({now:()=>now+86400_001}).resolve({key:'fcd:v1:gutenberg:1'}).item;
  assert.equal(stale.access,'unknown');
  assert.deepEqual(stale.readingActions,[]);
  assert.throws(()=>service().resolve({key:'fcd:v1:gutenberg:99'}), /not in/);
  assert.equal(service().search({query:'Fixture',includeUnclear:true}).items.length,3);
});
test('disabled discovery never reads the snapshot; unavailable is not an empty paper result', () => {
  assert.throws(()=>service({enabled:false,loadSnapshot:()=>{throw Error('must not load');}}).search({query:'x'}),/not connected/);
  assert.throws(()=>service().search({query:'x',kinds:['article']}),/not connected/);
  assert.throws(()=>service({cursorSecret:undefined}).search({query:'x'}),/unavailable/);
});

test('library link-back uses exact identifier evidence and never title similarity',()=>{
  const mapped=structuredClone(data);mapped.records[0].identifiers=[{scheme:'isbn13',value:'9780140328721'}];
  const api=service({loadSnapshot:()=>mapped});
  const found=api.locate({isbn13:'9780140328721'});
  assert.equal(found.items.length,1);assert.deepEqual(found.items[0].match,{scheme:'isbn13',value:'9780140328721'});
  assert.equal(api.locate({isbn13:'9780142410363'}).items.length,0);
  assert.throws(()=>api.locate({title:'Fixture title 1'}));
  assert.equal(service({loadSnapshot:()=>mapped,now:()=>now+86400_001}).locate({isbn13:'9780140328721'}).items.length,0);
});

test('search folds Latin accents without erasing Tamil or Hindi vowel signs',()=>{
  const mapped=structuredClone(data);mapped.records[0].title='தமிழ்';mapped.records[1].title='हिन्दी';mapped.records[2].title='École';
  const api=service({loadSnapshot:()=>mapped});
  assert.equal(api.search({query:'தமிழ்'}).items.length,1);
  assert.equal(api.search({query:'தமழ'}).items.length,0);
  assert.equal(api.search({query:'हिन्दी'}).items.length,1);
  assert.equal(api.search({query:'हनद'}).items.length,0);
  assert.equal(api.search({query:'ecole'}).items.length,1);
});
