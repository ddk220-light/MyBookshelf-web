import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSugamya,searchMetadataCatalog} from './metadataAdapters.js';
import {createKnowledgeAdapters,mapThoth} from './knowledgeAdapters.js';
import {createKnowledgeService} from './knowledgeSearch.js';
import {parseContentKey,readingActions} from './contracts.js';

const observedAt='2026-11-06T05:00:00Z';
const env={CONTENT_DISCOVERY_ENABLED:'true',CONTENT_KNOWLEDGE_ENABLED:'true',CONTENT_CURSOR_SECRET:'test-only-secret-with-at-least-32-characters'};
const row=(title,library='Library')=>`<tr><th scope="row">${title}</th><td>Author</td><td>Publisher</td><td>${library}</td><td><table><tr><td>DAISY Audio</td></tr></table></td><td>English</td></tr>`;
const html=(rows,query='science')=>`<input name="txtboxSearch" value="${query}"><table class="search-result-table"><tr><th>Title</th></tr>${rows}</table>`;

test('anonymous search preserves library/format identity and directs to search, never a fabricated native book link',()=>{
  const rows=parseSugamya(html(row('Science One')+row('Science One','Other Library')+row('Unrelated')),'science',observedAt);
  assert.equal(rows.length,2);assert.notEqual(rows[0].key,rows[1].key);assert.equal(rows[0].version,'DAISY Audio');
  assert.ok(rows[0].externalOnly);assert.equal(rows[0].provenance[0].sourceRecordId,'');assert.equal(rows[0].sourceActions[0].scope,'search');
  assert.match(rows[0].accessNote,/Eligible-member/);assert.deepEqual(readingActions(rows[0]),[]);
  assert.ok(parseContentKey(rows[0].key));assert.equal(parseContentKey('fcd:v1:sugamya-pustakalaya:../../secret'),null);
  assert.throws(()=>parseSugamya(html(row('Science One')),'different',observedAt));
  assert.throws(()=>parseSugamya('<html>Verify your browser</html>','science',observedAt));
  assert.deepEqual(parseSugamya('<input name="txtboxSearch" value="science">Total 0 books found','science',observedAt),[]);
});
test('reviewed local catalogs resolve stable native identities, preserve editions, search Tamil and page without network',async()=>{
  const adapters=createKnowledgeAdapters({fetchImpl:()=>{throw Error('Unexpected provider request');}});
  const first=await adapters.openstax.search({query:'Calculus',limit:1,languages:[]});assert.equal(first.items.length,1);assert.equal(first.nextSourceCursor,'1');
  const second=await adapters.openstax.search({query:'Calculus',limit:1,languages:[]},{sourceCursor:'1'});assert.notEqual(first.items[0].key,second.items[0].key);
  const exact=await adapters.openstax.search({query:'',limit:1},{exactRecord:parseContentKey(first.items[0].key)});assert.equal(exact.items[0].key,first.items[0].key);
  const tamil=searchMetadataCatalog('project-madurai',{query:'திருக்குறள்',limit:6});assert.ok(tamil.items.length);assert.ok(tamil.items.some(x=>x.identifiers.some(i=>i.value==='1')));
  assert.ok(tamil.items.every(x=>x.sourceActions.every(a=>a.url.startsWith('https://www.projectmadurai.org/pm_etexts/utf8/'))));
  assert.equal(searchMetadataCatalog('openstax',{query:'ZZZnoMatch123',limit:6}).items.length,0);
});
test('metadata-only sources are searchable by default without asserting free reading',async()=>{
  const service=createKnowledgeService({env});const query={query:'Calculus',sourceIds:['openstax'],kinds:['book']};
  const page=await service.search(query);assert.ok(page.items.length);assert.equal(page.hiddenUnclear,0);
  assert.ok(page.items.every(x=>x.access==='unknown'&&x.readingActions.length===0&&x.sourceActions.length===1));
  assert.equal((await service.search({...query,access:'free_full_text'})).items.length,0);
});
test('publisher identity and supplied DOI links are checked without a PDF prerequisite',()=>{
  const row={workStatus:'ACTIVE',workType:'MONOGRAPH',workId:'fc93c392-222d-42c5-89ca-2aad69952f78',imprint:{publisher:{publisherId:'7c0b2d93-3264-4d83-beb5-7c18898d995a'}},titles:[{fullTitle:'An Anthropology of Crosslocations'}],landingPage:null,doi:'https://doi.org/10.33134/HUP-23'};
  const item=mapThoth('helsinki-university-press',row,observedAt);assert.equal(item.sourceActions[0].url,row.doi);assert.deepEqual(readingActions(item),[]);
  assert.equal(mapThoth('open-book-publishers',row,observedAt),null);
  assert.equal(mapThoth('helsinki-university-press',{...row,doi:'https://evil.example/private'},observedAt),null);
});
test('live HTML search is bounded to the published form and cannot resolve invented book IDs',async()=>{
  let requests=0;const adapters=createKnowledgeAdapters({paceMs:0,fetchImpl:async(url,options)=>{requests++;assert.equal(new URL(url).origin,'https://sugamyapustakalaya.org.in');assert.equal(new URL(url).searchParams.get('txtboxSearch'),'science');assert.equal(options.redirect,'error');return new Response(html(row('Science One')),{headers:{'content-type':'text/html'}});}});
  const result=await adapters['sugamya-pustakalaya'].search({query:'science',limit:6});assert.equal(result.items.length,1);assert.equal(result.nextSourceCursor,null);
  await assert.rejects(adapters['sugamya-pustakalaya'].search({query:'',limit:1},{exactRecord:{recordId:'a'.repeat(32)}}),e=>e.sourceStatus==='unsupported');assert.equal(requests,1);
});
