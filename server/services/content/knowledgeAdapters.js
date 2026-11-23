import {createFullCollectionAdapters} from './fullCollectionAdapters.js';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {setTimeout as sleep} from 'node:timers/promises';
import {contentKey,normalizeDoi,safeWebUrl} from './contracts.js';
import {clean,contact,sourceError} from './sourceHttp.js';
import {KNOWLEDGE_SOURCES} from './knowledgeSources.js';
import {searchMetadataCatalog,parseSugamya} from './metadataAdapters.js';
const strings=value=>(Array.isArray(value)?value:value?[value]:[]).filter(x=>typeof x==='string');
const lang=value=>({english:'en',eng:'en',hindi:'hi',hin:'hi',tamil:'ta',tam:'ta',french:'fr',fre:'fr',german:'de',ger:'de',spanish:'es',spa:'es'})[String(value).toLowerCase()]||(/^[a-z]{2,3}$/.test(value)?value:'und');
const matchesQuery=(row,query)=>{const text=[row.title,row.description,...(row.topic||[]).map(t=>t.name)].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();const words=text.match(/[\p{L}\p{M}\p{N}]+/gu)||[];const terms=query.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];return terms.length>0&&terms.every(t=>words.some(w=>w===t||t.length>=4&&w.startsWith(t)));};
const quote=value=>'"'+value.replace(/[\\"]/g,'\\$&')+'"';
const offset=value=>{if(!/^(0|[1-9]\d{0,5})$/.test(value||'0'))throw sourceError('unavailable');return Number(value||0);};
async function waitForTurn(previous,signal){
  if(signal.aborted)throw signal.reason;
  let abort;
  try{await Promise.race([previous,new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});})]);}
  finally{signal.removeEventListener('abort',abort);}
}
const official=(value,hosts)=>{const url=safeWebUrl(value);return url&&new URL(url).protocol==='https:'&&hosts.includes(new URL(url).hostname)?url:null;};
function item(id,recordId,title,kind,url,observedAt,extra={}){
  return {key:contentKey(id,String(recordId)),kind,title:clean(title),contributors:[],identifiers:[{scheme:id,value:String(recordId)}],languages:['und'],subjects:[],relations:[],locations:[],provenance:[{sourceId:id,sourceRecordId:String(recordId),recordUrl:url,retrievedAt:observedAt,mappingVersion:'knowledge-v1'}],...extra};
}
function location(id,recordId,url,observedAt,{free=false,reader=true,downloads=[],license,field,rightsJurisdiction}={}){
  return {id:`${id}:${recordId}`,host:KNOWLEDGE_SOURCES[id].name,landingUrl:url,...reader?{readerUrl:url}:{},downloads,access:free?'free_full_text':'unknown',...license?{license}:{},...rightsJurisdiction?{rightsJurisdiction}:{},evidence:{sourceId:id,field:field||'Provider record',observedAt}};
}
// In-process pacing is a courtesy, not an application-wide provider quota.
// There are no automatic retries. 429 responses also delay this instance's queue.
export function createKnowledgeTransport({fetchImpl=globalThis.fetch,paceMs=2000}={}) {
  const hosts=new Map();
  return async function request(url,{signal,body,maxBytes=2*1024*1024,empty404=false,binary=false,html=false}={}){
    const host=new URL(url).host;const prior=hosts.get(host)||{tail:Promise.resolve(),next:0,pending:0};
    if(prior.pending>=12)throw sourceError('throttled',30);prior.pending++;hosts.set(host,prior);
    const previous=prior.tail;let release;const slot=new Promise(resolve=>{release=resolve;});prior.tail=previous.then(()=>slot);
    const deadline=AbortSignal.timeout(30000);const combined=signal?AbortSignal.any([signal,deadline]):deadline;
    let acquired=false;
    try{
      await waitForTurn(previous,combined);if(combined.aborted)throw combined.reason;acquired=true;
      const wait=prior.next-Date.now();if(wait>20000)throw sourceError('throttled',Math.ceil(wait/1000));if(wait>0)await sleep(wait,undefined,{signal:combined});
      const response=await fetchImpl(url,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,redirect:'error',signal:combined,headers:{Accept:html?'text/html':binary?'application/octet-stream':'application/json','User-Agent':`MyBookshelf/1.0 (+https://mybookshelf.cloud; mailto:${contact})`,...body?{'Content-Type':'application/json'}:{}}});
      if(response.status===429){const raw=response.headers.get('retry-after');const seconds=/^\d+$/.test(raw||'')?Number(raw):Math.ceil((Date.parse(raw)-Date.now())/1000);const retry=Math.min(3600,Math.max(1,seconds||60));prior.next=Date.now()+retry*1000;throw sourceError('throttled',retry);}
      if(response.status===404&&!empty404)throw sourceError('not_found');
      if(!response.ok&&!(empty404&&response.status===404)||Number(response.headers.get('content-length'))>maxBytes||!response.body)throw sourceError('unavailable');
      const chunks=[];let size=0;const reader=response.body.getReader();
      try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw sourceError('unavailable');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      const bytes=Buffer.concat(chunks);if(binary)return bytes;if(html){if(!response.headers.get('content-type')?.includes('text/html'))throw sourceError('unavailable');return bytes.toString('utf8');}let data;try{data=JSON.parse(bytes);}catch{throw sourceError('unavailable');}
      // LibriVox documents a not-found JSON response; other 404s are failures.
      if(response.status===404){if(data?.error==='Audiobooks could not be found')return {books:[]};throw sourceError('not_found');}
      return data;
    }catch(error){if(error.sourceStatus)throw error;if(combined.aborted)throw sourceError('timeout');throw sourceError('unavailable');}
    finally{if(acquired)prior.next=Math.max(prior.next,Date.now()+Math.max(paceMs,host==='api.core.ac.uk'?7500:0));prior.pending--;release();}
  };
}
export function mapThoth(id,row,observedAt){
  const config=KNOWLEDGE_SOURCES[id];if(row?.workStatus!=='ACTIVE'||row?.imprint?.publisher?.publisherId!==config.publisherId||!row?.workId||!['MONOGRAPH','EDITED_BOOK'].includes(row.workType)||!clean(row.titles?.[0]?.fullTitle))return null;
  const recordUrl=safeWebUrl(row.landingPage)||safeWebUrl(row.doi);if(!recordUrl)return null;
  if(config.metadataDiscovery){
    const parsed=new URL(recordUrl);if(parsed.protocol!=='https:'||!config.hosts.includes(parsed.hostname)&&!(parsed.hostname==='doi.org'&&/^\/10\.(?:33134|11647)\//i.test(parsed.pathname)))return null;
    return item(id,row.workId,row.titles[0].fullTitle,'book',recordUrl,observedAt,{publisher:config.name,languages:(row.languages||[]).map(l=>lang(l.languageCode)),
      contributors:(row.contributions||[]).map(c=>({name:clean(c.contributor?.fullName),role:clean(c.contributionType).toLowerCase()})).filter(c=>c.name),
      identifiers:[{scheme:'thoth',value:row.workId}],locations:[location(id,row.workId,recordUrl,observedAt,{reader:false,license:{statement:'Publisher metadata via Thoth (CC0). Individual book reading and reuse terms apply.'}})],
      sourceActions:[{label:'Open at '+config.name,url:recordUrl,scope:'record'}],accessNote:'Book details at '+config.name+' · reading access may vary'});
  }
  const locations=[];for(const publication of row.publications||[]){const mime={PDF:'application/pdf',EPUB:'application/epub+zip',HTML:'text/html'}[publication.publicationType];if(!mime)continue;
    for(const target of publication.locations||[]){const url=official(target.fullTextUrl,config.hosts);if(!target.canonical||!url)continue;locations.push(location(id,row.workId+':'+locations.length,url,observedAt,{free:true,reader:mime==='text/html',downloads:mime==='text/html'?[]:[{url,mimeType:mime}],license:{id:clean(row.license)||'Per-book license not supplied',url:safeWebUrl(row.license)||undefined},field:'Active work; canonical digital fullTextUrl at reviewed publisher host'}));}}
  const doi=normalizeDoi(row.doi);return item(id,row.workId,row.titles[0].fullTitle,'book',recordUrl,observedAt,{publisher:config.name,languages:(row.languages||[]).map(l=>lang(l.languageCode)),contributors:(row.contributions||[]).map(c=>({name:clean(c.contributor?.fullName),role:clean(c.contributionType).toLowerCase()})).filter(c=>c.name),version:row.edition?`Edition ${row.edition}`:undefined,publishedAt:clean(row.publicationDate)||undefined,locations,identifiers:[{scheme:'thoth',value:row.workId},...doi?[{scheme:'doi',value:doi}]:[]]});
}
function mapGdl(row,observedAt,detail=false){
  const id=String(detail?row.id:row.postId);const title=detail?row.title?.rendered:row.title;const url=official(detail?row.link:row.postLink,['content.digitallibrary.io']);if(!/^[1-9]\d*$/.test(id)||!clean(title)||!url)return null;
  const terms=detail?(row._embedded?.['wp:term']||[]).flat():[];
  const licenses=detail?terms.filter(t=>t.taxonomy==='license').map(t=>t.slug):(row.license||[]).map(t=>t.slug);
  const languages=detail?terms.filter(t=>t.taxonomy==='language').map(t=>t.slug):(row.language||[]).map(t=>t.slug);
  const knownLicense=licenses.some(l=>/^cc-(?:by|zero|0)/.test(l));
  return item('gdl',id,title,'book',url,observedAt,{languages:languages.length?languages:['und'],subjects:detail?[]:(row.topic||[]).map(t=>clean(t.name)).filter(Boolean),collections:['children'],version:clean(detail?row.modified:row.lastChanged),locations:[location('gdl',id,url,observedAt,{free:knownLicense,license:{id:licenses.join(', ')||'License not supplied'},field:'Public GDL book record with explicit Creative Commons license and hosted reading page'})]});
}
function mapLibrivox(row,observedAt){
  const url=official(row.url_librivox,['librivox.org','www.librivox.org']);if(!url||!clean(row.title))return null;
  const contributors=(row.authors||[]).map(a=>({name:clean([a.first_name,a.last_name].filter(Boolean).join(' ')),role:'author'})).filter(a=>a.name);
  const narrators=new Set((row.sections||[]).flatMap(s=>(s.readers||[]).map(r=>clean(r.display_name))).filter(Boolean));
  return item('librivox',row.id,row.title,'audiobook',url,observedAt,{languages:[lang(row.language)],contributors:[...contributors,...[...narrators].slice(0,30).map(name=>({name,role:'narrator'}))],version:`Recording ${row.id}${row.num_sections?` · ${clean(String(row.num_sections))} sections`:''}`,locations:[location('librivox',row.id,url,observedAt,{free:true,license:{statement:'LibriVox recordings are public domain in the USA. Check the underlying work and the law where you listen; worldwide public-domain status is not implied.'},rightsJurisdiction:'US',field:'Public LibriVox audiobook record and canonical listening page'})]});
}
function mapLoc(row,observedAt){
  const match=/^https?:\/\/(?:www\.)?loc\.gov\/item\/([A-Za-z0-9_.-]+)\/?$/.exec(row.id||'');if(!match||!clean(row.title))return null;const id=match[1],url=`https://www.loc.gov/item/${id}/`;
  const resource=(row.resources||[]).find(r=>official(r.url,['www.loc.gov','loc.gov']));const reader=resource&&official(resource.url,['www.loc.gov','loc.gov']);
  const free=row.access_restricted===false&&Boolean(reader)&&row.digitized===true;
  const pdf=resource&&official(resource.pdf,['tile.loc.gov']);
  return item('loc',id,row.title,'book',url,observedAt,{contributors:strings(row.item?.contributors||row.contributor).map(name=>({name:clean(name),role:'contributor'})),languages:strings(row.item?.language||row.language).map(lang),subjects:strings(row.subject),publishedAt:clean(row.date),locations:[location('loc',id,reader||url,observedAt,{free,reader:Boolean(reader),downloads:free&&pdf?[{url:pdf,mimeType:'application/pdf'}]:[],license:{statement:'Library of Congress item rights and access statements apply. Online availability is not a blanket public-domain or reuse claim.'},field:'access_restricted=false; digitized=true; canonical online reading resource'})]});
}
function mapBhl(row,observedAt){
  if(!row.identifier||!clean(row.title))return null;const url='https://archive.org/details/'+encodeURIComponent(row.identifier);const collections=strings(row.collection);
  const free=collections.includes('biodiversity')&&row.mediatype==='texts'&&![true,'true','1',1].includes(row['access-restricted-item']);
  return item('bhl',row.identifier,row.title,'book',url,observedAt,{contributors:strings(row.creator).map(name=>({name:clean(name),role:'author'})),languages:strings(row.language).map(lang),publishedAt:clean(row.date),locations:[location('bhl',row.identifier,url,observedAt,{free,license:{statement:'Biodiversity Heritage Library metadata is CC0; this digitized item retains its own rights. Check the contributing institution and item rights before reuse.',url:safeWebUrl(strings(row.licenseurl)[0])||undefined},field:'Biodiversity collection text record; advanced search excludes access-restricted-item:true'})]});
}
export function parsePythonInventory(bytes,observedAt){
  let end=0;const headers=[];for(let i=0;i<4;i++){const n=bytes.indexOf(10,end);if(n<0)throw sourceError('unavailable');headers.push(bytes.subarray(end,n).toString());end=n+1;}
  if(headers[0]!=='# Sphinx inventory version 2'||headers[1]!=='# Project: Python'||headers[2]!=='# Version: 3.15'||!headers[3].includes('zlib'))throw sourceError('unavailable');
  const text=inflateSync(bytes.subarray(end),{maxOutputLength:8*1024*1024}).toString();const rows=[];
  for(const line of text.split('\n')){if(!line)continue;const m=/^(.+?)\s+(\S+:\S+)\s+(-?\d+)\s+(\S+)\s+(.*)$/.exec(line);if(!m)throw sourceError('unavailable');const [,name,type,,path,display]=m;const relative=path.endsWith('$')?path.slice(0,-1)+name:path;const url=new URL(relative,'https://docs.python.org/3.15/');if(url.origin!=='https://docs.python.org'||!url.pathname.startsWith('/3.15/'))continue;
    const id=createHash('sha256').update('3.15\0'+type+'\0'+name).digest('hex').slice(0,32);const title=display==='-'?name:display;
    rows.push(item('python-docs',id,title,'learning_resource',url.href,observedAt,{languages:['en'],version:'Python 3.15',identifiers:[{scheme:'sphinx',value:type+':'+name}],subjects:[name,type],locations:[location('python-docs',id,url.href,observedAt,{free:true,license:{statement:'Python documentation: Python Software Foundation License; examples also under Zero-Clause BSD. Preserve the documentation’s license and attribution notices.',url:'https://docs.python.org/3.15/license.html'},field:'Official Python 3.15 Sphinx inventory entry'})]}));if(rows.length>50000)throw sourceError('unavailable');}
  if(!rows.length)throw sourceError('unavailable');return rows;
}
export function createKnowledgeAdapters({fetchImpl=globalThis.fetch,now=()=>Date.now(),paceMs=2000}={}){
  const request=createKnowledgeTransport({fetchImpl,paceMs});let inventory;
  const adapters={};
  for(const [id,config] of Object.entries(KNOWLEDGE_SOURCES))adapters[id]={async search(query,{sourceCursor='0',signal,exactRecord}={}){
    const observedAt=new Date(now()).toISOString(),start=offset(sourceCursor);let rows=[],next=null;
    if(config.adapter==='metadata-catalog')return searchMetadataCatalog(id,query,{start,exactRecord});
    if(config.adapter==='sugamya'){
      if(exactRecord||start)throw sourceError('unsupported');
      const url=new URL('https://sugamyapustakalaya.org.in/searchAction.action');url.searchParams.set('txtboxSearch',query.query);
      rows=parseSugamya(await request(url,{signal,html:true}),query.query,observedAt);
    }else if(config.adapter==='thoth'){
      const fields='workId workType workStatus edition publicationDate imprint{publisher{publisherId}} contributions{contributionType contributor{fullName}} languages{languageCode} titles{fullTitle} doi landingPage license publications{publicationType locations{fullTextUrl landingPage canonical}}';
      const gql=exactRecord?`{work(workId:${JSON.stringify(exactRecord.recordId)}){${fields}}}`:`{works(limit:${query.limit},offset:${start},filter:${JSON.stringify(query.query)},publishers:[${JSON.stringify(config.publisherId)}],workTypes:[MONOGRAPH,EDITED_BOOK],workStatus:ACTIVE){${fields}}}`;
      const data=await request('https://api.thoth.pub/graphql',{body:{query:gql},signal});if(data.errors)throw sourceError('unavailable');const works=exactRecord?[data.data?.work].filter(Boolean):data.data?.works;if(!Array.isArray(works))throw sourceError('unavailable');rows=works.map(r=>mapThoth(id,r,observedAt));if(!exactRecord&&works.length===query.limit)next=String(start+works.length);
    }else if(config.adapter==='gdl'){
      const url=new URL(exactRecord?`https://content.digitallibrary.io/wp-json/wp/v2/book/${exactRecord.recordId}`:'https://content.digitallibrary.io/wp-json/content-api/v1/contentsearch');url.search=new URLSearchParams(exactRecord?{_embed:'wp:term',_fields:'id,title,link,modified,_embedded,_links'}:{query:query.query,language:query.languages[0]||'en',_skip:String(start)}).toString();const data=await request(url,{signal});if(exactRecord)rows=[mapGdl(data,observedAt,true)];else{if(!Array.isArray(data.books))throw sourceError('unavailable');const records=data.books.slice(0,query.limit);rows=records.filter(r=>matchesQuery(r,query.query)).map(r=>mapGdl(r,observedAt));if(records.length&&Number(data.meta?.count)>start+records.length)next=String(start+records.length);}
    }else if(config.adapter==='librivox'){
      const url=new URL('https://librivox.org/api/feed/audiobooks');url.search=new URLSearchParams({format:'json',limit:String(query.limit),...exactRecord?{id:exactRecord.recordId,extended:'1'}:{title:query.query,offset:String(start)}}).toString();const data=await request(url,{signal,empty404:!exactRecord});if(!Array.isArray(data.books))throw sourceError('unavailable');rows=data.books.map(r=>mapLibrivox(r,observedAt));if(!exactRecord&&rows.length===query.limit)next=String(start+rows.length);
    }else if(config.adapter==='loc'){
      const url=new URL(exactRecord?`https://www.loc.gov/item/${exactRecord.recordId}/`:'https://www.loc.gov/books/');url.search=new URLSearchParams({fo:'json',...exactRecord?{}:{q:query.query,c:String(query.limit),...start?{sp:String(start+1)}:{},fa:'online-format:online text'}}).toString();const data=await request(url,{signal});const records=exactRecord?[{...data.item,resources:data.resources||data.item?.resources}]:data.results;if(!Array.isArray(records))throw sourceError('unavailable');rows=records.slice(0,query.limit).map(r=>mapLoc(r,observedAt));if(!exactRecord&&data.pagination?.next)next=String(start+1);
    }else if(config.adapter==='bhl'){
      const url=new URL('https://archive.org/advancedsearch.php');const q='collection:biodiversity AND mediatype:texts AND NOT access-restricted-item:true AND '+(exactRecord?'identifier:'+quote(exactRecord.recordId):quote(query.query));url.search=new URLSearchParams({q,rows:String(query.limit),page:String(start+1),output:'json'}).toString();for(const f of ['identifier','title','creator','date','language','licenseurl','access-restricted-item','collection','mediatype'])url.searchParams.append('fl[]',f);const data=await request(url,{signal});const records=data.response?.docs;if(!Array.isArray(records))throw sourceError('unavailable');rows=records.map(r=>mapBhl(r,observedAt));if(!exactRecord&&(start+1)*query.limit<Number(data.response.numFound))next=String(start+1);
    }else if(config.adapter==='python'){
      if(!inventory||inventory.expires<=now()){const bytes=await request('https://docs.python.org/3.15/objects.inv',{signal,binary:true,maxBytes:4*1024*1024});inventory={rows:parsePythonInventory(bytes,observedAt),expires:now()+3600000};}
      const terms=query.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);const matches=exactRecord?inventory.rows.filter(r=>r.key===contentKey(id,exactRecord.recordId)):inventory.rows.filter(r=>terms.every(t=>(r.title+' '+r.subjects.join(' ')).toLocaleLowerCase().includes(t))).sort((a,b)=>Number(b.title.toLowerCase()===query.query.toLowerCase())-Number(a.title.toLowerCase()===query.query.toLowerCase())||a.title.length-b.title.length||a.key.localeCompare(b.key));rows=matches.slice(start,start+query.limit);if(!exactRecord&&start+rows.length<matches.length)next=String(start+rows.length);
    }else throw sourceError('unsupported');
    return {items:rows.filter(Boolean).slice(0,query.limit),nextSourceCursor:next};
  }};
  Object.assign(adapters,createFullCollectionAdapters(request,{now}));
  return adapters;
}
