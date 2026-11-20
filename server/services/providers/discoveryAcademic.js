import { readFileSync } from 'node:fs';
import ISBN from 'isbn3';
import { getText, cachedTask, DEFAULT_TIMEOUT_MS } from './http.js';
import { validateAndNormalize } from '../isbn.js';
import { attributes, catalogError, quoteFreeQuery, startsWithArticle, withoutLeadingArticle } from './catalogMarkup.js';
import { parseAcademicResponse, recordFingerprint, normalizeCatalogTitle, rejectChallenge, parseEasylibAvailability, parseDarshanIsbn, parseLibsoftDetails } from './discoveryAcademicParsers.js';

const CONFIGS = JSON.parse(readFileSync(new URL('./discoveryAcademicConfigs.json',import.meta.url),'utf8'));
const MAX_QUERY_BYTES=80, MAX_RECORD_LENGTH=180, MAX_RESULTS=20;
function boundedQuery(value) {
  if(typeof value!=='string')throw catalogError('A catalog query is required');
  const trimmed=value.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!trimmed||trimmed.length>500||/[\x00-\x1f\x7f]/.test(trimmed))throw catalogError('Invalid catalog query');
  let q='';for(const c of trimmed){if(Buffer.byteLength(q+c)>MAX_QUERY_BYTES)break;q+=c;}
  return q.trim();
}
function config(library) {
  const c=Object.hasOwn(CONFIGS,library?.academicCatalogId)?CONFIGS[library.academicCatalogId]:null;
  if(!c)throw catalogError('Unknown approved academic catalog','CATALOG_CONFIGURATION_REQUIRED');
  if(c.externalOnly)throw catalogError('This catalog requires external search','CATALOG_UNSUPPORTED');
  return c;
}
export function academicCatalogConfigured(library){return Boolean(Object.hasOwn(CONFIGS,library?.academicCatalogId)&&!CONFIGS[library.academicCatalogId].externalOnly);}
// Whether a work search should ask this catalog about the work's ISBNs one
// at a time (providers/index.js `isbnLookup`). Most of these catalogs have no
// ISBN index: asked for an ISBN alone they answer CATALOG_QUERY_UNSUPPORTED.
// Baba Mastnath's ISBN index answers, but its rows never show an ISBN, so an
// ISBN search can only say "none": the title search says that too, for every
// edition at once, within the request cap (19 Nov 2026: one ISBN = 2 requests).
// Darshan (ISBN on the record page) and SOUL (ISBN in the row) can prove an
// edition by ISBN and keep it.
export function isbnLookupSupported(library){
  const c=Object.hasOwn(CONFIGS,library?.academicCatalogId)?CONFIGS[library.academicCatalogId]:null;
  return Boolean(c&&c.isbn&&!c.externalOnly&&c.kind!=='bmu');
}
function recordId(query,b){
  // Replaying the selected title is more stable than a broad query such as
  // "India", whose first page can change when the library adds more books.
  let q=boundedQuery((b.title||query).slice(0,500)),token;
  do{token='a1_'+Buffer.from(JSON.stringify([q,recordFingerprint(b)])).toString('base64url');if(token.length<=MAX_RECORD_LENGTH)return token;q=[...q].slice(0,-1).join('').trim();}while(q);
  throw catalogError('Catalog record identity is too long');
}
function decodeRecord(id){
  if(typeof id!=='string'||id.length>MAX_RECORD_LENGTH||!/^a1_[A-Za-z0-9_-]+$/.test(id))throw catalogError('Invalid catalog record identity');
  let value;try{const s=Buffer.from(id.slice(3),'base64url').toString('utf8');if(Buffer.from(s).toString('base64url')!==id.slice(3))throw new Error();value=JSON.parse(s);}catch{throw catalogError('Invalid catalog record identity');}
  if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='string'||boundedQuery(value[0])!==value[0]||! /^[a-f0-9]{20}$/.test(value[1]))throw catalogError('Invalid catalog record payload');
  return value;
}
function publicObservation(b,c,matchKind='verified_work'){
  const handoff=handoffFor(c,{title:b.title,isbn13:matchKind==='exact_isbn'?b.isbn:null});
  // POST-only catalogs need the ordinary catalog handoff supplied by the
  // public service. A catalog homepage must not masquerade as a record URL.
  const value={outcome:b.outcome||'in_catalog',matchKind,recognizedExact:matchKind!=='possible_match',...(handoff.catalogLinkKind==='search'?handoff:{})};
  for(const key of ['totalCopies','availableCopies','locations','callNumber','format'])if(b[key]!==undefined)value[key]=b[key];
  return value;
}
function handoffFor(c,book){
  const exact=validateAndNormalize(book?.isbn13),title=typeof book?.title==='string'&&!/^ISBN\s+\d/i.test(book.title)?book.title.trim():'';
  let u;
  if(c.kind==='libaitech'&&title){u=new URL(c.url);u.search=new URLSearchParams({search_in:'1',q:title.slice(0,500),search_type:'1'});}
  if(c.kind==='libsoft'&&title){u=new URL('/qs.php',c.url);u.search=new URLSearchParams({data:title.slice(0,500),select:'10'});}
  if(c.kind==='iust'&&(exact||title)){u=new URL('/result.aspx',c.url);u.search=new URLSearchParams({cmbval:exact?'ISBN/ISSN':'Title',search:exact||title.slice(0,500),RDB:'Contains',Typemate:'All',colltype:'All'});}
  return {catalogUrl:u?.toString()||c.url,catalogLinkKind:u?'search':'catalog'};
}
export function academicCatalogHandoff(library,book){return handoffFor(config(library),book);}
function finish(result,c,q){
  const records=result.records.map(b=>({...b,recordId:recordId(q,b),observation:publicObservation(b,c)}));
  // Rows beyond the first page (or a count we could not read) were not seen:
  // the caller must not read an empty or non-matching page as absence.
  Object.defineProperty(records,'hasMore',{value:!result.complete,enumerable:false});
  return records;
}
function cookieParts(headers){return typeof headers?.getSetCookie==='function'?headers.getSetCookie():[headers?.get?.('set-cookie')].filter(Boolean);}
function anonymousSession(c,deadlineAt){
  const origin=new URL(c.url).origin,cookies=new Map();
  return async function read(url,options={}){
    let current=new URL(url,c.url),opts={...options};
    for(let i=0;i<4;i++){
      if(current.origin!==origin||current.username||current.password)throw catalogError('Catalog origin mismatch','CATALOG_CONFIGURATION_REQUIRED');
      const response=await getText(current.toString(),{...opts,redirect:'manual',deadlineAt,retries:0,maxResponseBytes:c.kind==='autolib'?16*1024*1024:3*1024*1024,headers:{...opts.headers,...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{})}});
      for(const raw of cookieParts(response.headers))for(const part of raw.split(/,(?=\s*[^;,=\s]+=)/)){const pair=part.split(';')[0],j=pair.indexOf('=');if(j>0&&/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(pair.slice(0,j).trim()))cookies.set(pair.slice(0,j).trim(),pair.slice(j+1));}
      if(response.status>=300&&response.status<400&&response.headers?.get?.('location')){
        current=new URL(response.headers.get('location'),current);
        if([301,302,303].includes(response.status))opts={method:'GET'};
        continue;
      }
      if(!response.ok)throw catalogError(`Catalog HTTP ${response.status}`,[401,403,429].includes(response.status)?'CATALOG_PROVIDER_BLOCKED':'CATALOG_UNAVAILABLE');
      rejectChallenge(response.text||'');return response;
    }
    throw catalogError('Too many public catalog redirects');
  };
}
function hiddenForm(html){
  const params=new URLSearchParams();
  for(const m of html.matchAll(/<input\b([^>]*)>/gi)){const a=attributes(m[1]);if(a.name&&a.type?.toLowerCase()==='hidden')params.set(a.name,a.value||'');}
  return params;
}
// ASP.NET WebForms catalogs (ProcessCUBE, Baba Mastnath University) accept
// the public page's own form state again for a later search without a cookie
// (checked 19 Nov 2026). Reusing it for a few minutes saves one request per
// search; a response we cannot read is retried once with fresh state.
const FORM_STATE_TTL_MS=10*60*1000, formStates=new Map();
export function clearAcademicFormState(){formStates.clear();}
async function aspxForm(c,url,read,fresh){
  const key=url,cached=formStates.get(key);
  if(!fresh&&cached&&cached.expiresAt>Date.now())return {data:new URLSearchParams(cached.data),cached:true};
  const initial=await read(url);if(!/__VIEWSTATE/.test(initial.text))throw catalogError('Missing public ASP.NET form state');
  const data=hiddenForm(initial.text);
  formStates.set(key,{data:data.toString(),expiresAt:Date.now()+FORM_STATE_TTL_MS});
  while(formStates.size>200)formStates.delete(formStates.keys().next().value);
  return {data:new URLSearchParams(data),cached:false};
}
const formRequest=(data)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data).toString()});
function json(response){try{return JSON.parse(response.text);}catch{throw catalogError('Catalog did not return bibliographic JSON');}}
// Several of these catalogs put the search text into SQL unescaped: an
// apostrophe ("Harry Potter and the Philosopher's Stone") gives a database
// error page (Easylib "Database Error", ProcessCUBE "Unclosed quotation mark",
// LIBSOFT mysqli warnings, RPS HTTP 500; 19 Nov 2026). LibAITech, Darshan and
// Baba Mastnath answer such titles normally. We never send quote characters
// to the others. The words before the first
// quoted word are a contains-search for a superset of the title's records,
// which the caller then matches row by row.
const QUOTE_UNSAFE=new Set(['easylib','processcube','libsoft','rps','mizoram']);
// Title searches that match anywhere in the title ("of India" finds "The
// Constitution of India"; checked 19 Nov 2026). ProcessCUBE matches the start
// of the title only ("Modern India" does not find "History Of Modern India").
const TITLE_CONTAINS=new Set(['easylib','libaitech','libsoft','rps','darshan','iust','bmu','srms']);
async function fetchQuery(library,query,mode,deadlineAt){
  const c=config(library),read=anonymousSession(c,deadlineAt);let response,payload;
  let q=mode==='title'&&QUOTE_UNSAFE.has(c.kind)?quoteFreeQuery(query):query;
  if(mode==='title'&&TITLE_CONTAINS.has(c.kind))q=withoutLeadingArticle(q);
  const isbn=mode==='isbn'?validateAndNormalize(q):null;
  if(c.kind==='srms'){
    const url='https://myportal.srms.ac.in/Library/OPACPanel/searchbookbytitle';
    response=await read(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({searchvalue:q,colg:c.collegeId})});payload=json(response);
  }else if(c.kind==='libaitech'){
    const u=new URL(c.url);u.search=new URLSearchParams({search_in:'1',q,search_type:'1'});response=await read(u);payload=response.text;
  }else if(c.kind==='autolib'){
    payload=await cachedTask(`academic-export:${library.academicCatalogId}`,async()=>json(await read(c.exportUrl)),{ttlMs:60*60*1000,deadlineAt});
  }else if(c.kind==='rps'){
    response=await read(c.url,formRequest({search:q,save:''}));payload=response.text;
  }else if(c.kind==='libsoft'){
    const url=new URL('/qs.php',c.url);url.search=new URLSearchParams({data:q,select:'10'});response=await read(url);payload=response.text;
  }else if(c.kind==='nios'){
    await read(c.url);response=await read(new URL('/search/searchResult.html',c.url),formRequest({searchdata:q,db:'1',qcon1:'1',cat1:mode==='isbn'?'7':'2',sortByVal:'Author'}));payload=response.text;
  }else if(c.kind==='librarika'){
    const url=new URL('/search',c.url),initial=await read(url);
    if(!/id=['"]FilterIndexForm['"]/.test(initial.text))throw catalogError('Missing public Librarika search form');
    const formBlock=initial.text.match(/<form\b[^>]*id=['"]FilterIndexForm['"][\s\S]*?<\/form>/i)?.[0];
    const data=hiddenForm(formBlock||'');
    data.set('data[Filter][q]',q);data.set('data[Filter][media_type_id]','1');data.set('data[Filter][field]',mode==='isbn'?'Media.isbn':'Media.title');
    response=await read(url,formRequest(data));payload=response.text;
  }else if(['mizoram','processcube','bmu'].includes(c.kind)){
    const url=c.kind==='mizoram'?new URL('Normal.aspx',c.url).toString():c.url;
    const values=c.kind==='mizoram'?{ddlSearchIn:'B',ddlField:mode==='isbn'?'Acc_ISBN_No':'Acc_Title',txtSearchValue:q,ddlMatchCritaria:'Like',btnSerach:'Get It !!'}:c.kind==='bmu'?{ddlSearchType:mode==='isbn'?'ISBN':'Title',txtKeyword:q,btnSearch:'Search'}:{txt_search:q,btn_search:'Availability',TextBox1:'',TextBox2:'',TextBox3:'',TextBox4:''};
    const post=async fresh=>{
      const form=await aspxForm(c,url,read,fresh||c.kind==='mizoram');
      for(const [k,v] of Object.entries(values))form.data.set(k,v);
      const text=(await read(url,formRequest(form.data))).text;
      return {form,text};
    };
    let attempt=await post(false);
    if(attempt.form.cached){
      // Stale form state shows the empty search page (or an error) instead of
      // results: read it again once with the page's current state.
      try{parseAcademicResponse(c.kind,attempt.text,{query:q,isbn});}
      catch(error){if(error.code==='CATALOG_PROVIDER_BLOCKED')throw error;formStates.delete(url);attempt=await post(true);}
    }
    payload=attempt.text;
  }else if(c.kind==='easylib'){
    // The search endpoint needs no session (checked 19 Nov 2026).
    response=await read(new URL('/index.php/OpacController/advancedSearchFunc',c.url),formRequest({search:q,pageId:'1',start:'0',length:String(MAX_RESULTS),object:'{}'}));payload=json(response);
  }else if(c.kind==='darshan'){
    // The result fragment needs no session (checked 19 Nov 2026).
    response=await read(new URL('/Home/_SearchResult',c.url),formRequest({F_FieldName:mode==='isbn'?'ISBN':'Title',F_FieldValue:q,F_MaterialTypeID:'1',btnShow:'Search'}));payload=response.text;
  }else if(c.kind==='iust'){
    const url=new URL('/result.aspx',c.url);url.search=new URLSearchParams({cmbval:mode==='isbn'?'ISBN/ISSN':'Title',search:q,RDB:'Contains',Typemate:'All',colltype:'All'});
    const page=(await read(url)).text;
    // SOUL's data handler answers an empty search with HTTP 500. The result
    // page itself shows the search's facets; with no material-type facet the
    // search found nothing, and the handler is not asked.
    if(iustEmptyResultPage(page))payload=[];
    else{response=await read(new URL('/EmployeeDataHandler.ashx',c.url));payload=json(response);}
  }else throw catalogError('Public catalog method not implemented','CATALOG_UNSUPPORTED');
  const result=parseAcademicResponse(c.kind,payload,{query:q,isbn});
  // A start-of-title search for "The ..." cannot see the same book filed as
  // "Discovery of India, The": its empty answer is not a complete one.
  const inverted=mode==='title'&&c.kind==='processcube'&&startsWithArticle(q);
  return {...result,records:result.records.slice(0,MAX_RESULTS),complete:result.complete&&!inverted&&result.records.length<=MAX_RESULTS,read};
}
export function iustEmptyResultPage(html){
  rejectChallenge(html);
  const ids=new Set([...html.matchAll(/<table\b([^>]*)>/gi)].map(m=>attributes(m[1]).id).filter(Boolean));
  return /Refine Your Search/i.test(html)&&/Type of Material\(s\)/i.test(html)&&/<form\b[^>]*action=['"]\.\/result\.aspx\?/i.test(html)
    &&!['ContentPlaceHolder1_tomf','ContentPlaceHolder1_authf','ContentPlaceHolder1_pubf','ContentPlaceHolder1_yopf','ContentPlaceHolder1_subjf'].some(id=>ids.has(id));
}
// The forms of an ISBN a catalog's ISBN index matches. Darshan's index
// matches the stored text, which is sometimes plain (9788173711466) and
// sometimes hyphenated (978-81-203-4007-7); neither form finds the other
// (checked 19 Nov 2026). The hyphenated ISBN-13 is asked as well.
function isbnQueries(c,exact){
  const parsed=ISBN.parse(exact);
  const forms=c.kind==='darshan'?[exact,parsed?.isbn13h,parsed?.isbn10]:[exact,parsed?.isbn10];
  return forms.filter((v,i,a)=>v&&a.indexOf(v)===i);
}
async function enriched(b,c,read){
  if(c.kind==='libsoft'){
    const u=new URL('/details.php',c.url);u.searchParams.set('dtitle',b.title);u.searchParams.set('dauthor',b.authors.join(' '));
    try{return {...b,...parseLibsoftDetails((await read(u)).text,b),catalogRecordUrl:u.toString()};}catch{return b;}
  }
  if(c.kind==='easylib'&&c.availability&&/^[A-Za-z0-9_-]{1,80}$/.test(b.sourceId||'')){
    try {const u=new URL('/index.php/OpacController/getBookAvailability',c.url);u.searchParams.set('BookTitleNo',b.sourceId);return {...b,...parseEasylibAvailability(json(await read(u)))};}catch{return b;}
  }
  if(c.kind==='darshan'&&/^[A-Za-z0-9+/_=$-]{1,80}$/.test(b.sourceId||'')){
    const u=new URL('/Home/BookInformation',c.url);u.searchParams.set('Enc_MaterialID',b.sourceId);
    try{
      const response=await read(u),returned=new URL(response.url);
      if(returned.origin!==u.origin||returned.pathname!==u.pathname||returned.searchParams.get('Enc_MaterialID')!==b.sourceId)throw catalogError('Darshan detail record changed','CATALOG_HOLDING_UNCONFIRMED');
      return {...b,isbn:parseDarshanIsbn(response.text,b)||b.isbn,catalogRecordUrl:u.toString()};
    }catch{return b;}
  }
  return b;
}
export async function searchCatalog(library,query){
  const c=config(library),q=boundedQuery(query),deadlineAt=Date.now()+DEFAULT_TIMEOUT_MS;
  return cachedTask(`academic-search:${library.academicCatalogId}:${q}`,async()=>finish(await fetchQuery(library,q,'title',deadlineAt),c,q),{deadlineAt});
}
export async function resolveCatalogRecord(library,id){
  const c=config(library),[q,key]=decodeRecord(id),deadlineAt=Date.now()+DEFAULT_TIMEOUT_MS;
  const result=await fetchQuery(library,q,'title',deadlineAt),b=result.records.find(b=>recordFingerprint(b)===key);
  if(!b)return null;
  const rich=await enriched(b,c,result.read);
  return {...rich,recordId:id,observation:{...publicObservation(rich,c),...(rich.catalogRecordUrl?{catalogUrl:rich.catalogRecordUrl,catalogLinkKind:'record'}:{})}};
}
function possibleTitle(b,title,author){
  const a=normalizeCatalogTitle(b.title),target=normalizeCatalogTitle(title);
  if(!(target.length>=4&&(a===target||a.startsWith(target+' ')||target.startsWith(a+' '))))return false;
  const expected=normalizeCatalogTitle(author),observed=normalizeCatalogTitle((b.authors||[]).join(' '));
  return !expected||!observed||expected.split(' ').some(t=>t.length>=4&&observed.split(' ').includes(t))||expected.replaceAll(' ','').includes(observed.replaceAll(' ',''))||observed.replaceAll(' ','').includes(expected.replaceAll(' ',''));
}
function combinedObservation(matches,c,matchKind,complete){
  const records=new Map();
  for(const b of matches){
    const key=recordFingerprint(b),old=records.get(key);
    if(old&&['outcome','totalCopies','availableCopies'].some(k=>old[k]!==b[k]))complete=false;
    records.set(key,old?.outcome==='available'?old:b);
  }
  const unique=[...records.values()];
  const chosen=unique.find(b=>b.outcome==='available')||unique[0];
  const value={...publicObservation(chosen,c,matchKind),...(chosen.catalogRecordUrl?{catalogUrl:chosen.catalogRecordUrl,catalogLinkKind:'record'}:{})};
  value.outcome=unique.some(b=>b.outcome==='available')?'available':complete&&unique.every(b=>b.outcome==='none_available')?'none_available':'in_catalog';
  // Separate bibliographic records can refer to overlapping copy sets. Keep
  // totals only for one complete record, never add them across editions/IDs.
  if(!complete||unique.length>1){
    delete value.totalCopies;delete value.availableCopies;
    const locations=new Map();
    for(const b of unique)for(const {totalCopies,availableCopies,...location} of b.locations||[]){
      // One available copy is positive proof. An uninspected variant can
      // contain other copies at this same location, so negatives are unknown.
      const status=location.status==='available'?'available':!complete?'unknown':location.status;
      const old=locations.get(location.name);
      const merged=old?.status==='available'||status==='available'?'available':old?.status==='unknown'||status==='unknown'?'unknown':status;
      locations.set(location.name,{...location,status:merged});
    }
    value.locations=[...locations.values()];
  }
  return value;
}
export async function checkAvailability(library,isbn,title,author){
  const c=config(library),exact=validateAndNormalize(isbn),deadlineAt=Date.now()+DEFAULT_TIMEOUT_MS;let completeEmpty=false,firstError=null;
  const usableTitle=typeof title==='string'&&title.trim()&&!/^ISBN\s+\d/i.test(title);
  // An ISBN alone, at a catalog with no ISBN index: this lookup cannot run
  // here. That is not a failure of the catalog and says nothing about absence.
  if(exact&&!c.isbn&&!usableTitle)throw catalogError('This catalog cannot be searched by ISBN','CATALOG_QUERY_UNSUPPORTED');
  if(exact&&c.isbn){
    // Where an empty ISBN search proves nothing (Darshan), records stored
    // under another ISBN form were not inspected: counts stay partial.
    const variants=isbnQueries(c,exact);let empties=0,complete=c.isbnAbsence!==false;const exactMatches=[];
    for(const q of variants){
      try{
        // The work search asks for the ISBN-13 and ISBN-10 forms of an edition
        // separately; both run the same catalog searches, sent once.
        const result=await cachedTask(`academic-isbn:${library.academicCatalogId}:${q}`,async()=>{const {read:_,...rest}=await fetchQuery(library,q,'isbn',deadlineAt);return rest;},{ttlMs:10*60*1000,deadlineAt});
        // Record pages are read in this check's own session and deadline.
        const read=anonymousSession(c,deadlineAt);
        complete&&=result.complete;
        for(const b of result.records){
          const rich=await enriched(b,c,read);
          if(rich.isbn===exact)exactMatches.push(rich);
          else if(!rich.isbn)complete=false;
        }
        // One record-owned ISBN proves presence. Repeating the equivalent
        // ISBN-10/13 search spends another session's requests after that proof.
        // Unqueried variants can contain other
        // copies, so omit totals and do not claim all copies unavailable.
        if(exactMatches.length)return combinedObservation(exactMatches,c,'exact_isbn',complete&&q===variants.at(-1));
        if(result.complete&&result.explicitEmpty)empties++;
        else if(result.records.length)firstError ||= catalogError('Catalog returned records without proof of the requested edition','CATALOG_HOLDING_UNCONFIRMED');
      }catch(error){complete=false;firstError ||= error;}
    }
    if(exactMatches.length)return combinedObservation(exactMatches,c,'exact_isbn',complete);
    completeEmpty=empties===variants.length;
  }
  if(usableTitle){
    try{
      const q=boundedQuery(title),result=await fetchQuery(library,q,'title',deadlineAt),candidates=result.records.filter(b=>possibleTitle(b,title,author)),matches=[];
      for(const candidate of candidates)matches.push(await enriched(candidate,c,result.read));
      const exactMatches=exact?matches.filter(b=>b.isbn===exact):[];
      if(exactMatches.length)return combinedObservation(exactMatches,c,'exact_isbn',result.complete&&matches.every(b=>Boolean(b.isbn)));
      if(matches.length)return combinedObservation(matches,c,'possible_match',result.complete);
    }catch(error){firstError ||= error;}
  }
  if(completeEmpty&&!firstError){
    // Darshan's public ISBN index can omit ISBNs present on its own detail
    // pages (stored in another form). An empty search cannot prove absence:
    // the lookup could not settle the question, which is not a failure.
    if(c.isbnAbsence===false)throw catalogError('An empty ISBN search does not prove absence in this catalog','CATALOG_QUERY_UNSUPPORTED');
    return {outcome:'not_found',matchKind:'none',recognizedExact:true};
  }
  if(firstError)throw firstError;
  if(usableTitle)throw catalogError('The requested book is not confirmed by this catalog','CATALOG_HOLDING_UNCONFIRMED');
  throw catalogError(c.isbn?'No confirmed edition or title match':'This catalog needs a book title for lookup','CATALOG_EXACT_ISBN_REQUIRED');
}
export { quoteFreeQuery } from './catalogMarkup.js';
export { parseAcademicResponse, parseEasylibAvailability, parseDarshanIsbn, recordFingerprint } from './discoveryAcademicParsers.js';
