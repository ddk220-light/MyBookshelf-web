import assert from 'node:assert/strict';
import test from 'node:test';
import {createChildrenService,validateChildrenManifest,readChildrenManifest} from './children.js';
import {createContentService} from './search.js';
const now=Date.parse('2026-11-01T09:00:00Z');
// Synthetic review protocol fixtures; production records have independent source evidence.
function manifest(){return {schemaVersion:1,collectionId:'children',status:'reviewed',records:['en','hi','ta'].map((language,index)=>{
  const url=`https://storyweaver.org.in/en/stories/${7777771+index}-synthetic-fixture`;
  return {key:`fcd:v1:storyweaver:${7777771+index}`,title:['Synthetic English pilot fixture','हिन्दी परीक्षण कहानी','தமிழ் சோதனைக் கதை'][index],
    language,originalLanguage:'en',publisher:'Fixture publisher',readingLevel:{publisher:'Fixture publisher',label:'Publisher level one'},
    contributors:[{name:'Fixture Author',role:'author'},{name:'Fixture Illustrator',role:'illustrator'},...language==='en'?[]:[{name:'Fixture Translator',role:'translator'}]],
    license:{id:'CC-BY-4.0',url:'https://creativecommons.org/licenses/by/4.0/',statement:'Synthetic per-record licence fixture'},
    readerUrl:url,recordUrl:url,review:{reviewedBy:'Protocol fixture only',reviewedAt:new Date(now).toISOString(),noLogin:true,publicFullText:true,
      creditsUrl:url,languageUrl:url,levelUrl:url,rightsUrl:url,readingUrl:url}};
})};}
const make=(options={})=>createChildrenService({enabled:true,cursorSecret:'synthetic-children-cursor-secret-of-32-characters',now:()=>now,loadManifest:manifest,...options});
test('reviewed production translations retain current source credits; disabled collection never reads records',()=>{
  const data=readChildrenManifest();
  const reviewedNow=Math.max(...data.records.map(record=>Date.parse(record.review.reviewedAt)));
  const records=validateChildrenManifest(data,{now:reviewedNow});
  assert.deepEqual(records.map(record=>record.languages[0]).sort(),['en','hi','ta']);
  assert.equal(records.find(record=>record.key==='fcd:v1:storyweaver:8').contributors.find(c=>c.role==='translator').name,'Manisha Chaudhry');
  assert.equal(records.find(record=>record.key==='fcd:v1:storyweaver:2252').contributors.find(c=>c.role==='translator').name,'Manickavasagam Deivanayagam');
  assert.ok(records.every(record=>record.locations[0].access==='free_account_required'));
  assert.throws(()=>validateChildrenManifest({...data,records:[]},{now}),e=>e.code==='CONTENT_COLLECTION_UNAVAILABLE');
  assert.throws(()=>make({enabled:false,loadManifest:()=>{throw Error('must not read');}}).search({query:'',collection:'children'}),e=>e.code==='CONTENT_COLLECTION_UNAVAILABLE');
});
test('review gate rejects missing languages, roles, licence, evidence, off-host links and full-text fields',()=>{
  const changes=[m=>m.records.pop(),m=>m.records[1].contributors.pop(),m=>delete m.records[0].license,
    m=>m.records[0].readerUrl='https://other.example/7777771',m=>m.records[0].review.noLogin=false,
    m=>m.records[0].review.reviewedAt=new Date(now+600000).toISOString(),m=>m.records[0].readingLevel.publisher='Another publisher',
    m=>m.records[0].text='Never import story text',m=>m.records[0].license.text='No nested content',m=>m.records[0].review.creditsUrl='http://127.0.0.1/'];
  for(const change of changes){const data=manifest();change(data);assert.throws(()=>validateChildrenManifest(data,{now}),e=>e.code==='CONTENT_COLLECTION_UNAVAILABLE');}
});
test('pilot uses source language/level/credits, distinct translations and replayable bound paging',()=>{
  const first=make().search({query:'',collection:'children',limit:2});
  assert.equal(first.items.length,2);assert.equal(first.sources[0].catalogRecords,3);assert.equal(first.coverage,'partial');
  assert.deepEqual(first.availableLevels,['Publisher level one']);
  const second=make().search({query:'',collection:'children',limit:2,cursor:first.nextCursor});
  assert.equal(second.items.length,1);assert.equal(new Set([...first.items,...second.items].map(i=>i.key)).size,3);
  assert.deepEqual(make().search({query:'',collection:'children',limit:2,cursor:first.nextCursor}),second);
  assert.throws(()=>make().search({query:'',collection:'children',limit:2,languages:['hi'],cursor:first.nextCursor}),e=>e.status===409);
  const tamil=make().search({query:'தமிழ்',collection:'children',languages:['ta'],level:'Publisher level one'});
  assert.equal(tamil.items.length,1);assert.equal(tamil.items[0].contributors.find(c=>c.role==='translator').name,'Fixture Translator');
  assert.equal(make().search({query:'',collection:'children',level:'Invented level'}).items.length,0);
});
test('older review evidence stays unknown; source lookup retains exact translation identity',()=>{
  const key='fcd:v1:storyweaver:7777772';const fresh=make().resolve({key,country:'IN'});
  assert.equal(fresh.item.languages[0],'hi');assert.equal(fresh.item.readingActions.length,1);
  const stale=make({now:()=>now+86400001});assert.equal(stale.search({query:'',collection:'children'}).items.length,0);
  const shown=stale.search({query:'',collection:'children',includeUnclear:true});assert.equal(shown.items.length,3);
  assert.equal(shown.items[0].readingActions.length,0);assert.equal(shown.sources[0].freshness,'stale');
});
test('service retires pilot discovery but preserves previously saved story resolution',async()=>{
  const service=createContentService({children:make(),local:{search:()=>{throw Error('must not call local books');}}});
  await assert.rejects(service.search({query:'',collection:'children'}),e=>e.code==='CONTENT_DISABLED');
  assert.equal((await service.resolve({key:'fcd:v1:storyweaver:7777771'})).item.title,'Synthetic English pilot fixture');
  await assert.rejects(service.search({query:'x',kinds:['book','article']}),e=>e.code==='CONTENT_DISABLED');
});

function accountManifest(){
  const data=manifest();
  for(const record of data.records){record.access='free_account_required';Object.assign(record.review,{noLogin:false,publicFullText:false,freeAccount:true,fullTextOffered:true,postLoginReadingVerified:false,accountNoticeUrl:record.recordUrl,rightsPolicyUrl:'https://storyweaver.org.in/en/open-content'});}
  data.records[1].originalStoryKey=data.records[0].key;return data;
}
test('free-account stories are searchable, linked and separately labelled without a MyBookshelf login',()=>{
  const service=make({loadManifest:accountManifest});
  const found=service.search({query:'',collection:'children'});
  assert.equal(found.items.length,3);assert.equal(found.hiddenUnclear,0);
  assert.ok(found.items.every(item=>item.access==='free_account_required'&&item.readingActions[0].requiresAccount));
  assert.equal(service.search({query:'',collection:'children',access:'free_full_text'}).items.length,0);
  const hindi=service.resolve({key:'fcd:v1:storyweaver:7777772'}).item;
  assert.equal(hindi.relations[0].targetKey,'fcd:v1:storyweaver:7777771');
  const stale=make({loadManifest:accountManifest,now:()=>now+86400001});
  assert.equal(stale.search({query:'',collection:'children'}).items.length,0);
  assert.ok(stale.search({query:'',collection:'children',includeUnclear:true}).items.every(item=>item.access==='unknown'&&!item.readingActions.length));
});
test('account review rejects unknown charges, contradictory access, wrong notice IDs and unreviewed originals',()=>{
  for(const mutate of [m=>m.records[0].access='registration',m=>m.records[0].review.freeAccount=false,m=>m.records[0].review.publicFullText=true,
    m=>m.records[0].review.accountNoticeUrl=m.records[1].recordUrl,m=>m.records[0].review.rightsPolicyUrl='https://other.example/policy',
    m=>m.records[1].originalStoryKey='fcd:v1:storyweaver:9999999']){
    const data=accountManifest();mutate(data);assert.throws(()=>validateChildrenManifest(data,{now}),e=>e.code==='CONTENT_COLLECTION_UNAVAILABLE');
  }
});

test('retired stories cannot be discovered but saved record identity and reading conditions survive',async()=>{
  const reviewed=readChildrenManifest();const reviewedNow=Math.max(...reviewed.records.map(record=>Date.parse(record.review.reviewedAt)));
  const service=createContentService({env:{CONTENT_DISCOVERY_ENABLED:'true',CONTENT_CHILDREN_ENABLED:'true',CONTENT_CURSOR_SECRET:'test-free-book-search-without-store-secret'},now:()=>reviewedNow,
    paperAdapter:{search:()=>{throw Error('Saved story lookup must not contact live papers');}}});
  await assert.rejects(service.search({query:'குண்டு',access:'free',languages:['ta']}),e=>e.code==='CONTENT_DISABLED');
  const result=await service.resolve({key:'fcd:v1:storyweaver:2252'});
  assert.equal(result.item.access,'free_account_required');
  assert.equal(result.item.contributors.find(c=>c.role==='translator').name,'Manickavasagam Deivanayagam');
});
