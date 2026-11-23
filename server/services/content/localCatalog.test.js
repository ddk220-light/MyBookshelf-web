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
  // A public catalog's import evidence is accepted for 30 days, never longer.
  const recent=service({now:()=>now+86400_001}).resolve({key:'fcd:v1:gutenberg:1'}).item;
  assert.equal(recent.access,'free_full_text');
  assert.equal(recent.readingActions.length,1);
  const stale=service({now:()=>now+30*86400_000+1}).resolve({key:'fcd:v1:gutenberg:1'}).item;
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
  assert.equal(service({loadSnapshot:()=>mapped,now:()=>now+86400_001}).locate({isbn13:'9780140328721'}).items.length,1);
  assert.equal(service({loadSnapshot:()=>mapped,now:()=>now+30*86400_000+1}).locate({isbn13:'9780140328721'}).items.length,0);
});

test('a public catalog stays searchable between refreshes and reports how old its check is', () => {
  const at=offset=>service({now:()=>now+offset}).search({query:'Fixture'});
  const fresh=at(0), recent=at(6*86400_000), stale=at(30*86400_000+1);
  assert.equal(fresh.sources[0].freshness,'fresh');
  assert.equal(recent.sources[0].freshness,'recent');
  assert.equal(recent.items.length,3);
  assert.equal(recent.hiddenUnclear,0);
  assert.equal(recent.sources[0].importedAt,observedAt);
  assert.equal(stale.sources[0].freshness,'stale');
  assert.equal(stale.items.length,0);
  assert.equal(stale.hiddenUnclear,3);
  // Evidence dated in the future is never accepted, whatever the window.
  const future=structuredClone(data);for(const record of future.records)record.locations[0].evidence.observedAt=new Date(now+3600_000).toISOString();
  assert.equal(service({loadSnapshot:()=>future}).search({query:'Fixture'}).items.length,0);
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

function textbooks(){
  const record={...item(5),key:'fcd:v1:open-textbook-library:5',kind:'learning_resource',languages:['und'],
    identifiers:[{scheme:'isbn13',value:'9780140328721'}],provenance:[{sourceId:'open-textbook-library'}]};
  return {...data,sourceId:'open-textbook-library',recordCount:1,revision:'c'.repeat(64),records:[record]};
}
test('combined catalogs keep source identity, filter unknown languages and replay all pages',()=>{
  const loadSnapshot=()=>[structuredClone(data),textbooks()];
  const make=()=>service({loadSnapshot});const query={query:'Fixture',kinds:['book','learning_resource'],limit:2};
  const first=make().search(query),second=make().search({...query,cursor:first.nextCursor});
  assert.equal(first.items.length+second.items.length,4);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.key)).size,4);
  assert.deepEqual(make().search({...query,cursor:first.nextCursor}),second);
  const only=make().search({...query,kinds:['learning_resource']});
  assert.equal(only.items[0].key,'fcd:v1:open-textbook-library:5');
  assert.equal(only.sources.find(s=>s.id==='gutenberg').status,'not_selected');
  assert.equal(only.sources.find(s=>s.id==='open-textbook-library').returned,1);
  assert.equal(make().search({...query,languages:['en']}).items.length,2);
  assert.equal(make().search({...query,kinds:['learning_resource'],languages:['en']}).items.length,0);
  assert.equal(make().locate({isbn13:'9780140328721'}).items[0].kind,'learning_resource');
  assert.equal(make().resolve({key:'fcd:v1:open-textbook-library:5'}).item.access,'free_full_text');
  assert.throws(()=>service({loadSnapshot:()=>[data,{...textbooks(),revision:'d'.repeat(64)}]}).search({...query,cursor:first.nextCursor}),/expired/);
});
test('one damaged catalog preserves the other source and never pretends no textbook exists',()=>{
  const api=service({loadSnapshot:()=>[data,{sourceId:'open-textbook-library',unavailable:true}]});
  const page=api.search({query:'Fixture',kinds:['book','learning_resource']});
  assert.equal(page.items.length,3);assert.equal(page.sources.find(s=>s.id==='open-textbook-library').status,'unavailable');
  assert.throws(()=>api.search({query:'Fixture',kinds:['learning_resource']}),/unavailable/);
});

test('Book Dash native editions share local paging without merging same-title Gutenberg books',()=>{
  const record={...item(123),key:'fcd:v1:bookdash:123',title:'Fixture title 1',publisher:'Book Dash',
    contributors:[{name:'Fixture Writer',role:'author'},{name:'Fixture Artist',role:'illustrator'}],
    locations:[{...item(123).locations[0],host:'Book Dash',landingUrl:'https://bookdash.org/books/synthetic-fixture/'}]};
  const bookdash={schemaVersion:1,sourceId:'bookdash',revision:'c'.repeat(64),recordCount:1,complete:false,importedAt:observedAt,records:[record]};
  const make=()=>service({loadSnapshot:()=>[structuredClone(data),structuredClone(bookdash)]});
  const first=make().search({query:'Fixture',limit:2});
  const next=make().search({query:'Fixture',limit:2,cursor:first.nextCursor});
  const keys=[...first.items,...next.items].map(item=>item.key);
  assert.equal(new Set(keys).size,4);assert.ok(keys.includes('fcd:v1:bookdash:123'));assert.ok(keys.includes('fcd:v1:gutenberg:1'));
  const detail=make().resolve({key:record.key}).item;
  assert.equal(detail.readingActions[0].label,'Read at Book Dash');
  assert.equal(detail.contributors.find(c=>c.role==='illustrator').name,'Fixture Artist');assert.equal(detail.readingLevel,undefined);
  assert.equal(first.sources.find(source=>source.id==='bookdash').catalogRecords,1);
});

test('curly source apostrophes accept ordinary typed book queries without changing edition identity',()=>{
  const record={...item(123),key:'fcd:v1:bookdash:123',title:'Writer’s Book'};
  const snapshot={schemaVersion:1,sourceId:'bookdash',revision:'c'.repeat(64),recordCount:1,complete:false,importedAt:observedAt,records:[record]};
  const found=service({loadSnapshot:()=>snapshot}).search({query:"Writer's"});
  assert.equal(found.items[0].key,record.key);assert.equal(found.items[0].title,'Writer’s Book');
});

test('title relevance precedes broad subject matches and explains the source field',()=>{
  const records=[
    {...item(1),title:'A Psychology Workbook',subjects:['Mathematics']},
    {...item(2),title:'Understanding Mathematics',subjects:['Mathematics']},
    {...item(3),title:'Mathematics',subjects:[]},
    {...item(4),title:'Zoology',contributors:[{name:'Mathematics Institute',role:'author'}]},
  ];
  const make=()=>service({loadSnapshot:()=>({...data,records})});
  const first=make().search({query:'Mathematics',limit:2});
  assert.deepEqual(first.items.map(i=>i.title),['Mathematics','Understanding Mathematics']);
  const next=make().search({query:'Mathematics',limit:2,cursor:first.nextCursor});
  assert.deepEqual(next.items.map(i=>i.title),['Zoology','A Psychology Workbook']);
  assert.deepEqual(next.items[1].searchMatch,{field:'subject',value:'Mathematics'});
  assert.deepEqual(make().search({query:'Mathematics',limit:2,cursor:first.nextCursor}),next);
});

test('queries match words and deliberate prefixes rather than unrelated word interiors',()=>{
  const records=[{...item(1),title:'Chair Design'},{...item(2),title:'AI for Beginners'},
    {...item(3),title:'Cartography'},{...item(4),title:'Art and Artists'},
    {...item(5),title:'Artificial Intelligence'},
    {...item(6),title:'Mathematics and Math'},{...item(7),title:'Mathematical Concepts'}];
  const api=service({loadSnapshot:()=>({...data,records,recordCount:records.length})});
  assert.deepEqual(api.search({query:'AI'}).items.map(i=>i.title),['AI for Beginners']);
  assert.deepEqual(api.search({query:'art'}).items.map(i=>i.title),['Art and Artists']);
  assert.deepEqual(api.search({query:'begin'}).items.map(i=>i.title),['AI for Beginners']);
  assert.deepEqual(api.search({query:'math'}).items.map(i=>i.title),['Mathematics and Math','Mathematical Concepts']);
  assert.equal(api.search({query:'not-in-this-catalog'}).items.length,0);
});

test('all query terms must match while author-title combinations and punctuation remain searchable',()=>{
  const records=[{...item(1),title:'Number Theory: An Introduction',contributors:[{name:'Émilie Test',role:'author'}]},
    {...item(2),title:'An Unrelated Introduction'},{...item(3),title:'C++ Essentials'},item(4)];
  const api=service({loadSnapshot:()=>({...data,records})});
  assert.deepEqual(api.search({query:'Emilie Number Theory'}).items.map(i=>i.key),['fcd:v1:gutenberg:1']);
  assert.deepEqual(api.search({query:'Number Theory: An Introduction'}).items.map(i=>i.key),['fcd:v1:gutenberg:1']);
  assert.deepEqual(api.search({query:'C++'}).items.map(i=>i.key),['fcd:v1:gutenberg:3']);
});
