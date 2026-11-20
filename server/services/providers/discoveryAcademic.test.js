import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAcademicResponse,parseEasylibAvailability,parseDarshanIsbn,searchCatalog,resolveCatalogRecord,checkAvailability,academicCatalogConfigured,academicCatalogHandoff,clearAcademicFormState,isbnLookupSupported,iustEmptyResultPage} from './discoveryAcademic.js';
import {clearHttpCache} from './http.js';
import {parseLibsoftDetails,rejectChallenge} from './discoveryAcademicParsers.js';
const fixture=n=>fs.readFileSync(new URL(`../../test/fixtures/discovery-academic/${n}`,import.meta.url),'utf8');
const parsed=n=>JSON.parse(fixture(n));
const library=id=>({academicCatalogId:id});
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;clearHttpCache();clearAcademicFormState();});
function reply(body,url='https://example.invalid/',extra={}){return {ok:true,status:200,url,headers:new Headers(),text:async()=>typeof body==='string'?body:JSON.stringify(body),...extra};}
const form='<form><input type="hidden" name="__VIEWSTATE" value="fresh-state"><input type="hidden" name="__EVENTVALIDATION" value="fresh-validation"></form>';

test('saved bibliography fixtures parse across the academic methods',()=>{
 const cases=[['srms','srms.json',1],['libaitech','libaitech.html',3],['autolib','autolib.json',1],['rps','rps.html',2],['mizoram','mizoram.html',6],['processcube','processcube.html',1],['bmu','bmu.html',6],['easylib','easylib.json',2],['darshan','darshan.html',1],['iust','iust.json',1],['librarika','librarika.html',10]];
 for(const [kind,file,count] of cases){const r=parseAcademicResponse(kind,file.endsWith('.json')?parsed(file):fixture(file),{query:kind==='bmu'?'History':'Wings'});assert.equal(r.records.length,count,kind);assert.ok(r.records.every(b=>b.title&&!/^Title$/.test(b.title)),kind);}
});
test('ProcessCUBE Availability button proves catalog copies, never circulation status',()=>{
 const b=parseAcademicResponse('processcube',fixture('processcube.html')).records[0];assert.equal(b.totalCopies,5);assert.equal(b.outcome,undefined);assert.equal(b.availableCopies,undefined);
 const partial=parseAcademicResponse('processcube',fixture('processcube-partial.html'));assert.equal(partial.complete,false);assert.ok(partial.records.every(b=>b.totalCopies===undefined&&b.availableCopies===undefined));
});
test('partial BMU page retains a positive Available status without claiming complete counts',()=>{
 const r=parseAcademicResponse('bmu',fixture('bmu.html'));assert.equal(r.complete,false);assert.equal(r.records[0].outcome,'available');assert.equal(r.records[0].totalCopies,undefined);assert.equal(r.records[0].availableCopies,undefined);
});
test('Librarika parses record-owned ISBNs and detects a partial catalog page',()=>{
 const r=parseAcademicResponse('librarika',fixture('librarika.html'));assert.equal(r.complete,false);assert.equal(r.records[0].isbn,'9788177585421');assert.equal(r.records[0].sourceId,'9727846');assert.equal(r.records[0].title,'Organic Chemistry Vol. 1');
});
test('Darshan combines duplicate copy rows and reads its labeled ISBN-13 detail field',()=>{
 const r=parseAcademicResponse('darshan',fixture('darshan.html')).records[0];assert.equal(r.totalCopies,2);assert.equal(r.availableCopies,1);assert.equal(r.outcome,'available');assert.equal(parseDarshanIsbn(fixture('darshan-record.html')),'9788173711466');assert.equal(parseDarshanIsbn('<p>Search 9788173711466</p>'),null);
 const encoded=fixture('darshan.html').replaceAll('xD8N4hmE0U0','Uf-0OVL-lwU');assert.equal(parseAcademicResponse('darshan',encoded).records[0].sourceId,'Uf-0OVL-lwU=');
});
test('Darshan encrypted dollar IDs remain searchable and are encoded unchanged for record enrichment',async()=>{
 const captured=fixture('darshan-dollar-id.html');
 const [record]=parseAcademicResponse('darshan',captured).records;
 assert.equal(record.sourceId,'O$$Sel08eL0=');
 assert.match(record.title,/Short History of Wars in India/);
 const calls=[];
 global.fetch=async(url,options)=>{
  calls.push(url);
  if(url.includes('/BookInformation'))return reply(`<h5>${record.title}</h5><table><tr><td>Author</td><td>${record.authors[0]}</td></tr><tr><td>Publication</td><td>${record.publisher}</td></tr></table>`,url);
  return reply(options.method==='POST'?captured:'<html>Catalog</html>',url);
 };
 const lib=library('dlib:darshan'),[hit]=await searchCatalog(lib,'India');
 const resolved=await resolveCatalogRecord(lib,hit.recordId);
 assert.equal(resolved.sourceId,record.sourceId);
 assert.equal(resolved.observation.matchKind,'verified_work');
 const detail=calls.find(url=>url.includes('/BookInformation'));
 assert.ok(detail,'enrichment must not silently skip the observed encrypted ID');
 assert.equal(new URL(detail).searchParams.get('Enc_MaterialID'),record.sourceId);
 assert.equal(new URL(detail).origin,'https://library.darshan.ac.in');
 assert.throws(()=>parseAcademicResponse('darshan',captured.replace('O%24%24Sel08eL0%3D','bad%3Fpath')),{code:'CATALOG_UNRECOGNIZED'});
});
const separateDarshanRecords=()=>fixture('darshan.html').replace(/(Enc_MaterialID=xD8N4hmE0U0%3D[\s\S]*?Enc_MaterialID=)xD8N4hmE0U0%3D/,'$1DifferentId%3D');
function darshanFetch(searchHtml,detail=(url)=>fixture('darshan-record.html')){
 return async(url,options)=>reply(url.includes('/BookInformation')?await detail(url):options.method==='POST'?searchHtml:'<html>Catalog</html>',url);
}
test('all exact-edition records are examined and any available copy wins without double-counting',async()=>{
 const details=[];global.fetch=darshanFetch(separateDarshanRecords(),url=>{details.push(new URL(url).searchParams.get('Enc_MaterialID'));return fixture('darshan-record.html');});
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);
 assert.equal(value.outcome,'available');assert.equal(value.matchKind,'exact_isbn');assert.equal(value.totalCopies,undefined);assert.equal(value.availableCopies,undefined);assert.ok(details.includes('xD8N4hmE0U0='));assert.ok(details.includes('DifferentId='));assert.match(value.catalogUrl,/DifferentId/);
 assert.deepEqual(value.locations,[{name:'GN',status:'available'}]);
});
test('uninspected exact-edition candidates prevent a false none-available result',async()=>{
 global.fetch=darshanFetch(separateDarshanRecords(),url=>{if(url.includes('DifferentId'))throw Object.assign(Error('timeout'),{name:'AbortError'});return fixture('darshan-record.html');});
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);assert.equal(value.outcome,'in_catalog');assert.equal(value.matchKind,'exact_isbn');assert.equal(value.availableCopies,undefined);assert.equal(value.totalCopies,undefined);
});
test('a confirmed edition does not depend on the equivalent-ISBN endpoint',async()=>{
 global.fetch=async(url,options)=>{if(options.method==='POST'&&new URLSearchParams(options.body).get('F_FieldValue')==='8173711461')throw Object.assign(Error('timeout'),{name:'AbortError'});return darshanFetch(fixture('darshan.html'))(url,options);};
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);assert.equal(value.outcome,'available');assert.equal(value.matchKind,'exact_isbn');assert.equal(value.availableCopies,undefined);assert.equal(value.totalCopies,undefined);
});
test('Darshan detail ISBN requires matching title, author, publisher and requested record URL',async()=>{
 const expected=parseAcademicResponse('darshan',fixture('darshan.html')).records[0];
 assert.equal(parseDarshanIsbn(fixture('darshan-record.html'),expected),'9788173711466');
 for(const [from,to] of [['<h5>Wings of Fire: An Autobiography </h5>','<h5>Different book</h5>'],['Kalam,A P J Abdul','Tui Sutherland'],['Universities Press (India) Private Limited','Different publisher']])assert.throws(()=>parseDarshanIsbn(fixture('darshan-record.html').replaceAll(from,to),expected),{code:'CATALOG_HOLDING_UNCONFIRMED'});
 global.fetch=async(url,options)=>url.includes('/BookInformation')?reply(fixture('darshan-record.html'),'https://library.darshan.ac.in/Home/BookInformation?Enc_MaterialID=OtherId'):darshanFetch(fixture('darshan.html'))(url,options);
 await assert.rejects(checkAvailability(library('dlib:darshan'),'9788173711466',null,null),{code:'CATALOG_HOLDING_UNCONFIRMED'});
});
test('Darshan and RPS schema drift cannot turn discarded book rows into no-match',async()=>{
 const changed=fixture('darshan.html').replaceAll('<td class="text-center">GN</td>','<td class="text-center">GN</td><td>new column</td>');
 assert.throws(()=>parseAcademicResponse('darshan',changed),{code:'CATALOG_UNRECOGNIZED'});global.fetch=darshanFetch(changed);await assert.rejects(checkAvailability(library('dlib:darshan'),'9788173711466',null,null),{code:'CATALOG_UNRECOGNIZED'});
 assert.throws(()=>parseAcademicResponse('rps',fixture('rps.html').replaceAll('</tr>','<td>new column</td></tr>')),{code:'CATALOG_UNRECOGNIZED'});
 const empty=fixture('darshan.html').replace(/<tbody>[\s\S]*?<\/tbody>/,'<tbody></tbody>');assert.equal(parseAcademicResponse('darshan',empty).explicitEmpty,true);
});
test('an explicit empty answer is distinct from an unrecognized page and access challenge',()=>{
 for(const [kind,name] of [['srms','srms-empty.json'],['easylib','easylib-empty.json'],['mizoram','mizoram-empty.html'],['bmu','bmu-empty.html'],['librarika','librarika-empty.html']]){const result=parseAcademicResponse(kind,name.endsWith('.json')?parsed(name):fixture(name),{query:'Wings'});assert.equal(result.explicitEmpty,true,kind);}
 for(const kind of ['libaitech','rps','mizoram','bmu','processcube','darshan','librarika'])assert.throws(()=>parseAcademicResponse(kind,'<html>Welcome to our library</html>'),{code:'CATALOG_UNRECOGNIZED'});
 assert.throws(()=>parseAcademicResponse('libaitech','Just a moment <script src="/challenge-platform/x">'),{code:'CATALOG_PROVIDER_BLOCKED'});
});
test('Easylib requires the right query and never equates copy count to availability',()=>{
 const b=parseAcademicResponse('easylib',parsed('easylib.json'),{query:'Wings'}).records[0];assert.equal(b.totalCopies,1);assert.equal(b.availableCopies,undefined);assert.throws(()=>parseAcademicResponse('easylib',parsed('easylib.json'),{query:'History'}));assert.equal(parseEasylibAvailability(parsed('easylib-availability.json')).outcome,'available');
});
test('SRMS retains college scope and durable record replay after caches are cleared',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});return reply(parsed('srms.json'),url);};
 const lib={...library('srms:1'),baseUrl:'http://127.0.0.1/private'};const books=await searchCatalog(lib,'Wings');assert.equal(books.length,1);assert.ok(books[0].recordId.length<=180);assert.equal(books[0].observation.matchKind,'verified_work');
 clearHttpCache();const resolved=await resolveCatalogRecord(lib,books[0].recordId);assert.equal(resolved.title,'WINGS OF FIRE /');assert.equal(calls.length,2);
 for(const c of calls){assert.equal(new URL(c.url).hostname,'myportal.srms.ac.in');assert.equal(JSON.parse(c.options.body).colg,'1');assert.ok(!/ISSUE|borrow|login/i.test(c.url));}
 assert.equal(JSON.parse(calls[1].options.body).searchvalue,'WINGS OF FIRE /');
});
test('replay rejects an absent or changed record rather than resolving another title',async()=>{
 global.fetch=async url=>reply(parsed('srms.json'),url);const lib=library('srms:1'),[b]=await searchCatalog(lib,'Wings');clearHttpCache();global.fetch=async url=>reply([{title:'Different book',author_name:'Kalam'}],url);assert.equal(await resolveCatalogRecord(lib,b.recordId),null);
});
test('record tokens are canonical, bounded and cannot supply an origin',async()=>{
 let called=false;global.fetch=async()=>{called=true;throw Error('unexpected');};
 for(const id of ['123','a1_!!!!','a1_'+Buffer.from(JSON.stringify(['https://evil.test',{}])).toString('base64url'),'a1_'+Buffer.from(JSON.stringify(['x'.repeat(81),'a'.repeat(20)])).toString('base64url')])await assert.rejects(resolveCatalogRecord(library('srms:1'),id));
 await assert.rejects(searchCatalog(library('__proto__'),'Book'),{code:'CATALOG_CONFIGURATION_REQUIRED'});assert.equal(academicCatalogConfigured(library('__proto__')),false);assert.equal(called,false);
});
test('fresh anonymous ASP.NET state and cookies are replayed, never fixture tokens',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});return options.method==='POST'?reply(fixture('processcube.html'),url):reply(form,url,{headers:new Headers({'Set-Cookie':'ASP.NET_SessionId=ephemeral; Path=/'})});};
 const books=await searchCatalog(library('processcube:daya-vihar'),'Wings');assert.equal(books[0].observation.outcome,'in_catalog');const post=calls.find(c=>c.options.method==='POST'),data=new URLSearchParams(post.options.body);assert.equal(data.get('__VIEWSTATE'),'fresh-state');assert.equal(data.get('txt_search'),'Wings');assert.equal(data.get('btn_search'),'Availability');assert.equal(post.options.headers.Cookie,'ASP.NET_SessionId=ephemeral');assert.equal(post.options.redirect,'manual');
});
test('cross-origin redirects stop before a second request',async()=>{
 const urls=[];global.fetch=async(url)=>{urls.push(url);return reply('',url,{ok:false,status:302,headers:new Headers({Location:'http://127.0.0.1/secrets'})});};
 await assert.rejects(searchCatalog(library('processcube:daya-vihar'),'Wings'),{code:'CATALOG_CONFIGURATION_REQUIRED'});assert.equal(urls.length,1);
});
test('ISBN absence needs both equivalent ISBN queries to finish, and timeout never becomes absence',async()=>{
 const posts=[];global.fetch=async(url,options)=>{if(options.method==='POST'){posts.push(new URLSearchParams(options.body).get('txtKeyword'));return reply(fixture('bmu-empty.html'),url);}return reply(form,url);};
 const no=await checkAvailability(library('public-aspx:baba-mastnath-university'),'9788173711466',null,null);assert.equal(no.outcome,'not_found');assert.deepEqual(posts,['9788173711466','8173711461']);
 clearHttpCache();clearAcademicFormState();
 global.fetch=async(url,options)=>{if(options.method==='POST')throw Object.assign(Error('timeout'),{name:'AbortError'});return reply(form,url);};await assert.rejects(checkAvailability(library('public-aspx:baba-mastnath-university'),'9788173711466',null,null),{name:'AbortError'});
});
test('Darshan empty ISBN indexes cannot disprove a detail-page ISBN, and title recovery still verifies the edition',async()=>{
 const empty=fixture('darshan.html').replace(/<tbody>[\s\S]*?<\/tbody>/,'<tbody></tbody>');
 global.fetch=async(url,options)=>{
  if(options.method==='POST'&&new URLSearchParams(options.body).get('F_FieldName')==='ISBN')return reply(empty,url);
  return darshanFetch(fixture('darshan.html'))(url,options);
 };
 // Not a failure of the catalog: an ISBN lookup alone cannot settle it here.
 await assert.rejects(checkAvailability(library('dlib:darshan'),'9788173711466',null,null),{code:'CATALOG_QUERY_UNSUPPORTED'});
 const recovered=await checkAvailability(library('dlib:darshan'),'9788173711466','Wings of Fire','Kalam');
 assert.equal(recovered.matchKind,'exact_isbn');assert.equal(recovered.recognizedExact,true);
});
test('title fallback is a possible match and rejects a clearly different author',async()=>{
 global.fetch=async url=>reply(parsed('srms.json'),url);const lib=library('srms:1');const value=await checkAvailability(lib,'9788173711466','Wings of Fire','A. P. J. Abdul Kalam');assert.equal(value.matchKind,'possible_match');assert.equal(value.recognizedExact,false);assert.equal(value.outcome,'in_catalog');await assert.rejects(checkAvailability(lib,'9788173711466','Wings of Fire','Tui Sutherland'),{code:'CATALOG_HOLDING_UNCONFIRMED'});
 global.fetch=async url=>reply([],url);await assert.rejects(checkAvailability(lib,'9788173711466','Wings of Fire','Kalam'),{code:'CATALOG_HOLDING_UNCONFIRMED'});
});
test('IUST session JSON proves the edition only from the record-owned ISBN',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});return reply(url.includes('EmployeeDataHandler')?parsed('iust.json'):'<html>Results</html>',url,{headers:new Headers({'Set-Cookie':'session=fresh; Path=/'})});};
 const value=await checkAvailability(library('soul:iust'),'9788173711466',null,null);assert.equal(value.matchKind,'exact_isbn');assert.equal(value.outcome,'in_catalog');assert.equal(value.availableCopies,undefined);assert.match(calls[0].url,/cmbval=ISBN%2FISSN/);assert.equal(calls[1].options.headers.Cookie,'session=fresh');
});
test('a proven exact ISBN finishes before an equivalent query can exhaust the session catalog budget',async()=>{
 const calls=[];
 global.fetch=async(url)=>{calls.push(url);assert.ok(calls.length<=2,'an exact match must not start another session');return reply(url.includes('EmployeeDataHandler')?parsed('iust.json'):'<html>Results</html>',url);};
 const value=await checkAvailability(library('soul:iust'),'9788173711466',null,null);
 assert.equal(value.matchKind,'exact_isbn');assert.equal(value.recognizedExact,true);assert.equal(value.outcome,'in_catalog');assert.equal(calls.length,2);
});
test('early ISBN presence does not claim complete counts or all copies unavailable',async()=>{
 global.fetch=darshanFetch(fixture('darshan.html').replaceAll('<b>1</b>','<b>0</b>'));
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);
 assert.equal(value.matchKind,'exact_isbn');assert.equal(value.outcome,'in_catalog');
 assert.equal(value.totalCopies,undefined);assert.equal(value.availableCopies,undefined);
 assert.deepEqual(value.locations,[{name:'GN',status:'unknown'}]);
});
test('oversized responses stay errors',async()=>{
 global.fetch=async url=>reply('too big',url,{headers:new Headers({'Content-Length':String(20*1024*1024)})});await assert.rejects(searchCatalog(library('srms:1'),'Wings'),/response body too large/);
});
test('LIBSOFT copy wording and LIBSYS stock icon do not become borrowable availability',()=>{
 const soft=parseAcademicResponse('libsoft',fixture('libsoft.html'));assert.equal(soft.records.length,3);const wings=soft.records[2];assert.equal(wings.totalCopies,4);assert.equal(wings.availableCopies,undefined);assert.equal(wings.outcome,undefined);
 const details=parseLibsoftDetails(fixture('libsoft-detail.html'),wings);assert.equal(details.publishedDate,'2011');assert.equal(details.availableCopies,undefined);
 const nios=parseAcademicResponse('nios',fixture('nios.html'));assert.equal(nios.records[0].title,'Wings of Fire : An Autobiography');assert.equal(nios.records[0].sourceId,'036233');assert.equal(nios.records[0].outcome,undefined);assert.equal(nios.records[0].isbn,null);assert.equal(parseAcademicResponse('nios',fixture('nios-empty.html')).explicitEmpty,true);
});
test('public copyright notices are not mistaken for authentication failures',()=>{
 assert.doesNotThrow(()=>rejectChallenge('<script>/* Any unauthorized modification or distribution is prohibited. */</script><h1>Public catalog</h1>'));
 assert.throws(()=>rejectChallenge('<title>401 Unauthorized</title>'),{code:'CATALOG_UNAVAILABLE'});
});
test('catalog links distinguish direct GET searches from POST-only catalog homes',()=>{
 const book={title:'Wings of Fire',isbn13:'9788173711466'};
 const post=academicCatalogHandoff(library('srms:1'),book);assert.equal(post.catalogLinkKind,'catalog');assert.equal(new URL(post.catalogUrl).pathname,'/Library/OPACPanel/OPAC1');
 const title=academicCatalogHandoff(library('webopac:morigaon'),book);assert.equal(title.catalogLinkKind,'search');assert.equal(new URL(title.catalogUrl).searchParams.get('q'),'Wings of Fire');
 const exact=academicCatalogHandoff(library('soul:iust'),book);assert.equal(exact.catalogLinkKind,'search');assert.equal(new URL(exact.catalogUrl).searchParams.get('cmbval'),'ISBN/ISSN');assert.equal(new URL(exact.catalogUrl).searchParams.get('search'),'9788173711466');
});
test('durable tokens stay within the public contract for long multibyte and escaped titles',async()=>{
 for(const title of ['संस्कृत भाषा साहित्य '.repeat(15),'\\"'.repeat(120),'Very long catalog title '.repeat(30)]){global.fetch=async url=>reply([{title,author_name:'Author'}],url);const [b]=await searchCatalog(library('srms:1'),'Title');assert.ok(b.recordId.length<=180);clearHttpCache();assert.ok(await resolveCatalogRecord(library('srms:1'),b.recordId));clearHttpCache();}
});

// 19 November 2026 re-test: most of these catalogs have no ISBN index. Asked
// for an ISBN alone they answered "unsupported" (a failure) for 77 of 170
// checks; it is a lookup they cannot run, which the work search skips.
test('an ISBN alone at a title-only catalog is an unsupported query, sent nowhere',async()=>{
 let called=false;global.fetch=async()=>{called=true;throw Error('unexpected');};
 for(const id of ['easylib:sdmmc','processcube:kaptipada-nuasahi','webopac:hcdgc','rps-mahnar:library','libsoft:rcet','srms:1'])await assert.rejects(checkAvailability(library(id),'9781847941831','',''),{code:'CATALOG_QUERY_UNSUPPORTED'});
 assert.equal(called,false);
 assert.equal(isbnLookupSupported(library('easylib:sdmmc')),false);assert.equal(isbnLookupSupported(library('dlib:darshan')),true);assert.equal(isbnLookupSupported(library('soul:iust')),true);assert.equal(isbnLookupSupported(library('public-aspx:baba-mastnath-university')),false);assert.equal(isbnLookupSupported(library('__proto__')),false);
});
test('Easylib and Darshan searches are one request each, without a home-page visit',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,method:options.method});return reply(url.includes('advancedSearchFunc')?{...parsed('easylib.json'),search:'Wings'}:fixture('darshan.html'),url);};
 const rows=await searchCatalog(library('easylib:sdmmc'),'Wings');assert.ok(rows.length);assert.equal(rows.hasMore,false);
 await searchCatalog(library('dlib:darshan'),'Wings');
 assert.deepEqual(calls.map(c=>c.method),['POST','POST']);
});
test('Darshan is asked for the plain and hyphenated ISBN-13 it stores, once for both ISBN forms',async()=>{
 const posts=[];global.fetch=async(url,options)=>{if(options.method==='POST'){posts.push(new URLSearchParams(options.body).get('F_FieldValue'));return reply(fixture('darshan.html').replace(/<tbody>[\s\S]*?<\/tbody>/,'<tbody></tbody>'),url);}return reply('<html>Catalog</html>',url);};
 await assert.rejects(checkAvailability(library('dlib:darshan'),'9788173711466','',''),{code:'CATALOG_QUERY_UNSUPPORTED'});
 await assert.rejects(checkAvailability(library('dlib:darshan'),'8173711461','',''),{code:'CATALOG_QUERY_UNSUPPORTED'});
 assert.deepEqual(posts,['9788173711466','978-81-7371-146-6','8173711461']);
});
test('SOUL result page without facets is an explicit empty search; the failing data handler is not asked',async()=>{
 assert.equal(iustEmptyResultPage(fixture('iust-result-empty.html')),true);assert.equal(iustEmptyResultPage(fixture('iust-result-hit.html')),false);
 assert.equal(iustEmptyResultPage('<html>Welcome</html>'),false);
 const calls=[];global.fetch=async url=>{calls.push(url);if(url.includes('EmployeeDataHandler'))return reply('<title>Runtime Error</title>',url,{ok:false,status:500});return reply(fixture('iust-result-empty.html'),url);};
 const value=await checkAvailability(library('soul:iust'),'9781408855652','','');
 assert.equal(value.outcome,'not_found');assert.equal(value.recognizedExact,true);
 assert.equal(calls.length,2);assert.ok(calls.every(u=>u.includes('/result.aspx')));
 // A page with results still reads the handler.
 calls.length=0;clearHttpCache();global.fetch=async url=>{calls.push(url);return reply(url.includes('EmployeeDataHandler')?parsed('iust.json'):fixture('iust-result-hit.html'),url);};
 assert.equal((await checkAvailability(library('soul:iust'),'9788173711466','','')).matchKind,'exact_isbn');assert.ok(calls.some(u=>u.includes('EmployeeDataHandler')));
});
test('ASP.NET form state is reused for a later search and refreshed once when stale',async()=>{
 const calls=[];let stale=false;
 global.fetch=async(url,options)=>{calls.push(options.method||'GET');if(options.method==='POST')return reply(stale?form:fixture('processcube.html'),url);stale=false;return reply(form,url);};
 await searchCatalog(library('processcube:daya-vihar'),'Wings');await searchCatalog(library('processcube:daya-vihar'),'Fire');
 assert.deepEqual(calls,['GET','POST','POST']);
 calls.length=0;stale=true;const rows=await searchCatalog(library('processcube:daya-vihar'),'History');
 assert.deepEqual(calls,['POST','GET','POST']);assert.ok(rows.length);
 assert.equal((await searchCatalog(library('processcube:daya-vihar'),'Partial')).hasMore,false);
});
test('quote characters never reach catalogs that put search text into SQL',async()=>{
 const {quoteFreeQuery}=await import('./discoveryAcademic.js');
 assert.equal(quoteFreeQuery("Harry Potter and the Philosopher's Stone"),'Harry Potter and the');
 assert.equal(quoteFreeQuery('Wings of Fire'),'Wings of Fire');
 assert.equal(quoteFreeQuery("Gray's Anatomy for Students"),'Anatomy for Students');
 assert.throws(()=>quoteFreeQuery("O'Neil"),{code:'CATALOG_QUERY_UNSUPPORTED'});
 const posts=[];global.fetch=async(url,options)=>{posts.push(new URLSearchParams(options.body).get('search'));return reply({search:'Harry Potter and the',realdata:[],recordsTotal:5,recordsFiltered:0},url);};
 assert.deepEqual(await searchCatalog(library('easylib:sdmmc'),"Harry Potter and the Philosopher's Stone"),[]);assert.deepEqual(posts,['Harry Potter and the']);
});
test('SRMS is asked without a leading article; ProcessCUBE, which matches title starts, cannot call such a search complete',async()=>{
 const bodies=[];global.fetch=async(url,options)=>{bodies.push(JSON.parse(options.body).searchvalue);return reply([{title:'DISCOVERY OF INDIA',author_name:'NEHRU,JAWAHAR LAL'}],url);};
 const rows=await searchCatalog(library('srms:1'),'The discovery of India');assert.deepEqual(bodies,['discovery of India']);assert.equal(rows[0].title,'DISCOVERY OF INDIA');assert.equal(rows.hasMore,false);
 global.fetch=async(url,options)=>reply(options.method==='POST'?fixture('processcube.html'):form,url);
 assert.equal((await searchCatalog(library('processcube:daya-vihar'),'The Wings')).hasMore,true);
 clearHttpCache();assert.equal((await searchCatalog(library('processcube:daya-vihar'),'Wings')).hasMore,false);
});
