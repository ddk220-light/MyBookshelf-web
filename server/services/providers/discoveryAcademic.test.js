import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAcademicResponse,parseEasylibAvailability,parseDarshanIsbn,searchCatalog,resolveCatalogRecord,checkAvailability,academicCatalogConfigured,academicCatalogHandoff} from './discoveryAcademic.js';
import {clearHttpCache} from './http.js';
import {parseLibsoftDetails,rejectChallenge} from './discoveryAcademicParsers.js';
const fixture=n=>fs.readFileSync(new URL(`../../test/fixtures/discovery-academic/${n}`,import.meta.url),'utf8');
const parsed=n=>JSON.parse(fixture(n));
const library=id=>({academicCatalogId:id});
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;clearHttpCache();});
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
const separateDarshanRecords=()=>fixture('darshan.html').replace(/(Enc_MaterialID=xD8N4hmE0U0%3D[\s\S]*?Enc_MaterialID=)xD8N4hmE0U0%3D/,'$1DifferentId%3D');
function darshanFetch(searchHtml,detail=(url)=>fixture('darshan-record.html')){
 return async(url,options)=>reply(url.includes('/BookInformation')?await detail(url):options.method==='POST'?searchHtml:'<html>Catalog</html>',url);
}
test('all exact-edition records are examined and any available copy wins without double-counting',async()=>{
 const details=[];global.fetch=darshanFetch(separateDarshanRecords(),url=>{details.push(new URL(url).searchParams.get('Enc_MaterialID'));return fixture('darshan-record.html');});
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);
 assert.equal(value.outcome,'available');assert.equal(value.matchKind,'exact_isbn');assert.equal(value.totalCopies,undefined);assert.equal(value.availableCopies,undefined);assert.ok(details.includes('xD8N4hmE0U0='));assert.ok(details.includes('DifferentId='));assert.match(value.catalogUrl,/DifferentId/);
});
test('uninspected exact-edition candidates prevent a false none-available result',async()=>{
 global.fetch=darshanFetch(separateDarshanRecords(),url=>{if(url.includes('DifferentId'))throw Object.assign(Error('timeout'),{name:'AbortError'});return fixture('darshan-record.html');});
 const value=await checkAvailability(library('dlib:darshan'),'9788173711466',null,null);assert.equal(value.outcome,'in_catalog');assert.equal(value.matchKind,'exact_isbn');assert.equal(value.availableCopies,undefined);assert.equal(value.totalCopies,undefined);
});
test('a later ISBN query failure preserves a positive exact-edition observation',async()=>{
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
 global.fetch=async(url,options)=>{if(options.method==='POST')throw Object.assign(Error('timeout'),{name:'AbortError'});return reply(form,url);};await assert.rejects(checkAvailability(library('public-aspx:baba-mastnath-university'),'9788173711466',null,null),{name:'AbortError'});
});
test('title fallback is a possible match and rejects a clearly different author',async()=>{
 global.fetch=async url=>reply(parsed('srms.json'),url);const lib=library('srms:1');const value=await checkAvailability(lib,'9788173711466','Wings of Fire','A. P. J. Abdul Kalam');assert.equal(value.matchKind,'possible_match');assert.equal(value.recognizedExact,false);assert.equal(value.outcome,'in_catalog');await assert.rejects(checkAvailability(lib,'9788173711466','Wings of Fire','Tui Sutherland'),{code:'CATALOG_HOLDING_UNCONFIRMED'});
 global.fetch=async url=>reply([],url);await assert.rejects(checkAvailability(lib,'9788173711466','Wings of Fire','Kalam'),{code:'CATALOG_HOLDING_UNCONFIRMED'});
});
test('IUST session JSON proves the edition only from the record-owned ISBN',async()=>{
 const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});return reply(url.includes('EmployeeDataHandler')?parsed('iust.json'):'<html>Results</html>',url,{headers:new Headers({'Set-Cookie':'session=fresh; Path=/'})});};
 const value=await checkAvailability(library('soul:iust'),'9788173711466',null,null);assert.equal(value.matchKind,'exact_isbn');assert.equal(value.outcome,'in_catalog');assert.equal(value.availableCopies,undefined);assert.match(calls[0].url,/cmbval=ISBN%2FISSN/);assert.equal(calls[1].options.headers.Cookie,'session=fresh');
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
