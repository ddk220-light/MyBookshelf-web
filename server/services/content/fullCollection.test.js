import test from 'node:test';
import assert from 'node:assert/strict';
import {createFullCollectionAdapters,fullCollectionItem,parseHtmlCatalog,parseFao,relevant} from './fullCollectionAdapters.js';
import {createKnowledgeService} from './knowledgeSearch.js';
import {FULL_COLLECTION_SOURCES} from './fullCollectionSources.js';
import {parseContentKey,readingActions} from './contracts.js';
const query={query:'Moon',limit:2,languages:[]};
const at='2026-11-06T14:00:00Z';
const make=(responses,calls=[])=>createFullCollectionAdapters(async(u,o)=>{calls.push({url:new URL(u),options:o});assert.ok(responses.length,'Unexpected additional request');return responses.shift();});
test('collection release excludes small recovered catalogs and policy-held sources',()=>{
 for(const id of ['doaj','imo','fdic','cmda','storyberries','tatoeba','doab','oapen'])assert.equal(FULL_COLLECTION_SOURCES[id],undefined);
});
test('source identity remains distinct; links never imply free reading or allow javascript',()=>{
 const a=fullCollectionItem('crossref','10.1000/one','Same title','https://doi.org/10.1000/one',at);
 const b=fullCollectionItem('crossref','10.1000/two','Same title','https://doi.org/10.1000/two',at);
 assert.notEqual(a.key,b.key);assert.ok(parseContentKey(a.key));assert.equal(a.provenance[0].sourceRecordId,'10.1000/one');assert.deepEqual(readingActions(a),[]);assert.equal(a.externalOnly,true);
 assert.equal(fullCollectionItem('crossref','one','Title','javascript:alert(1)',at),null);
 assert.equal(parseContentKey('fcd:v1:crossref:https://evil.test'),null);
});
test('relevance uses words rather than accidental substrings',()=>{
 assert.ok(relevant('Mathematics: An Introduction','mathematics'));assert.ok(relevant('Moon & Stars','moon stars'));assert.equal(relevant('Shakrain','rain'),false);assert.equal(relevant('Moon','Mars'),false);
});
const lever=(ids,next=false)=>'<input name="q" value="Moon">'+ids.map(id=>`<article class="blacklight-monograph"><h2 class="index_title"><a href="/concern/monographs/${id}">Moon ${id}</a></h2></article>`).join('')+(next?'<a href="?q=Moon&page=2">Next</a>':'');
test('provider HTML page larger than requested page loses no records',async()=>{
 const calls=[],html=lever(['a','b','c'],true);const adapters=make([html,html,lever(['d'])],calls);
 const first=await adapters['lever-press'].search(query);assert.equal(first.items.length,2);assert.equal(first.nextSourceCursor,'2');
 const second=await adapters['lever-press'].search(query,{sourceCursor:first.nextSourceCursor});assert.equal(second.items[0].identifiers[0].value,'c');assert.equal(second.nextSourceCursor,'1000');
 const third=await adapters['lever-press'].search(query,{sourceCursor:second.nextSourceCursor});assert.equal(third.items[0].identifiers[0].value,'d');assert.equal(third.nextSourceCursor,null);
 assert.deepEqual(calls.map(c=>c.url.searchParams.get('page')),['1','1','2']);
});
test('HTML rejects challenges, wrong query echoes, duplicate IDs and unrecognized empty pages',()=>{
 for(const html of ['<title>Just a moment</title>',lever(['a']).replace('value="Moon"','value="Mars"'),lever(['a','a']),'<input name="q" value="Moon"><p>Server failed</p>'])assert.throws(()=>parseHtmlCatalog('lever-press',html,'Moon',1));
 assert.deepEqual(parseHtmlCatalog('lever-press','<input name="q" value="Moon"><p>No results found</p>','Moon',1),{records:[],hasNext:false});
});
test('LA Referencia preserves source network IDs and refuses foreign landing URLs',()=>{
 const id='IN_'+'a'.repeat(32);const html=`<form id="searchForm"><input name="lookfor" value="Moon"></form><li class="result"><input class="hiddenId" value="${id}"><a class="title" href="/Record/${id}">Moon</a></li>`;
 assert.equal(parseHtmlCatalog('la-referencia',html,'Moon',1).records[0].id,id);
 assert.throws(()=>parseHtmlCatalog('la-referencia',html.replace('/Record/','https://evil.test/Record/'),'Moon',1));
});
test('FAO checks query echo and native handles, rejects entity expansion',()=>{
 const xml='<feed xmlns="http://www.w3.org/2005/Atom" xmlns:os="http://a9.com/-/spec/opensearch/1.1/"><os:Query searchTerms="title%3A%22Moon%22"/><os:totalResults>1</os:totalResults><os:startIndex>0</os:startIndex><entry><id>https://openknowledge.fao.org/handle/20.500/42</id><title>Moon farming</title></entry></feed>';
 assert.equal(parseFao(xml,'title:"Moon"').records[0].title,'Moon farming');assert.throws(()=>parseFao(xml,'Mars'));assert.throws(()=>parseFao('<!DOCTYPE feed>'+xml,'title:"Moon"'));
});
const cases=[
 ['crossref',{message:{items:[{DOI:'10.1000/moon',title:['Moon science'],type:'journal-article'}],'total-results':5}},'api.crossref.org','offset','2'],
 ['osti',[{osti_id:1,title:'Moon'},{osti_id:2,title:'Moon science'}],'www.osti.gov','page','2'],
 ['cleveland-museum-art',{data:[{id:1,title:'Moon',url:'https://www.clevelandart.org/art/1'}],info:{total:5}},'openaccess-api.clevelandart.org','skip','2'],
 ['nasa-image-video-library',{collection:{items:[{data:[{nasa_id:'moon-one',title:'Moon',media_type:'image'}]}],metadata:{total_hits:5}}},'images-api.nasa.gov','page','2'],
 ['federal-register',{results:[{document_number:'2026-0001',title:'Moon',html_url:'https://www.federalregister.gov/documents/2026/0001',type:'Rule'}],count:5,total_pages:3},'www.federalregister.gov','page','2'],
 ['internet-archive',{response:{docs:[{identifier:'moon-one',title:'Moon'}],numFound:5}},'archive.org','page','2'],
 ['core',{results:[{id:42,title:'Moon science'}],totalHits:5},'api.core.ac.uk','offset','2'],
 ['appropedia',{query:{search:[{pageid:42,title:'Moon science'}]},continue:{sroffset:3}},'www.appropedia.org','sroffset','2'],
 ['free-kids-books',[{id:42,title:{rendered:'Moon &amp; stars'},link:'https://freekidsbooks.org/moon/',type:'post'}],'freekidsbooks.org','page','2'],
 ['google-books',{items:[{id:'moon-one',volumeInfo:{title:'Moon'}}],totalItems:5},'www.googleapis.com','startIndex','2'],
];
for(const [id,response,host,param,value] of cases)test(`${id} queries the catalog with provider paging and preserves native identity`,async()=>{
 const calls=[],result=await make([response],calls)[id].search(query,{sourceCursor:'2'});assert.equal(calls[0].url.hostname,host);assert.equal(calls[0].url.searchParams.get(param),value);assert.ok(result.items.length);assert.ok(result.items[0].identifiers[0].value);assert.deepEqual(readingActions(result.items[0]),[]);
});
test('Met hydrates only returned IDs and rejects mismatched record identity',async()=>{
 const result=await make([{total:5,objectIDs:[42]},{objectID:42,title:'Moon',objectURL:'https://www.metmuseum.org/art/collection/search/42',isPublicDomain:true}]).metmuseum.search(query);assert.equal(result.nextSourceCursor,'1');assert.equal(result.items[0].identifiers[0].value,'42');
 await assert.rejects(make([{total:5,objectIDs:[42]},{objectID:43,title:'Moon'}]).metmuseum.search(query));
});
test('provider failure is preserved, and signed paging excludes metadata when free reading is requested',async()=>{
 const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_KNOWLEDGE_ENABLED:'true',CONTENT_CURSOR_SECRET:'synthetic-32-character-cursor-secret'};
 const record=fullCollectionItem('crossref','10.1/moon','Moon','https://doi.org/10.1/moon',at);
 const service=createKnowledgeService({env,adapters:{crossref:{search:async()=>({items:[record],nextSourceCursor:null})}}});
 assert.equal((await service.search({...query,sourceIds:['crossref'],kinds:['article']})).items.length,1);
 assert.equal((await service.search({...query,sourceIds:['crossref'],kinds:['article'],access:'free_full_text'})).items.length,0);
 await assert.rejects(make([{}]).crossref.search(query));
});
test('Nalibali accepts page-number headings and explicit empty-search body without accepting generic blank HTML',()=>{
 const heading='<h1>Search Results for: Moon&nbsp;&ndash; Page 2</h1>';
 const card='<article class="elementor-post type-stories post-42"><h2 class="elementor-post__title"><a href="https://nalibali.org/stories/moon/">Moon</a></h2></article>';
 assert.equal(parseHtmlCatalog('nalibali',heading+card,'Moon',2).records[0].id,'42');
 assert.equal(parseHtmlCatalog('nalibali','<body class="search-no-results"><h1>Search Results for: Moon</h1></body>','Moon',1).records.length,0);
 assert.throws(()=>parseHtmlCatalog('nalibali','<body><h1>Search Results for: Moon</h1></body>','Moon',1));
});
test('complete export catalogs validate hashes/counts, retain every native ID and search beyond a sample',async()=>{
 const {readCompleteCatalog,searchCompleteCatalog}=await import('./completeCatalogs.js');
 for(const [id,count] of [['national-gallery-art',146454],['art-institute-chicago',139752],['onet',1016]]){
  const {rows,meta}=readCompleteCatalog(id);assert.equal(rows.length,count);assert.equal(meta.records,count);assert.equal(new Set(rows.map(r=>r.id)).size,count);
  const row=rows.findLast(r=>r.title?.length>10);const page=searchCompleteCatalog(id,row.title,0,6);assert.ok(page.records.length,'Must search records beyond first-page samples');
  assert.equal(searchCompleteCatalog(id,'zzzxqvNoSuchRecord772991',0,6).records.length,0);
 }
});
