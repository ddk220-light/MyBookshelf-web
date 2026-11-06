import {createHash} from 'node:crypto';
import {searchCompleteCatalog} from './completeCatalogs.js';
import {SaxesParser} from 'saxes';
import {FULL_COLLECTION_SOURCES} from './fullCollectionSources.js';
import {contentKey,safeWebUrl} from './contracts.js';
import {clean,sourceError} from './sourceHttp.js';
import {attributes,text} from '../providers/catalogMarkup.js';
const bad=()=>{throw sourceError('unavailable');};
const list=v=>Array.isArray(v)?v:bad();
const tokens=v=>String(v).normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
export const relevant=(title,q)=>{const words=tokens(title),terms=tokens(q);return terms.length>0&&terms.every(t=>words.some(w=>w===t||t.length>3&&w.startsWith(t)));};
const quote=v=>'"'+v.replace(/[\\"]/g,'\\$&')+'"';
const url=(base,params)=>{const u=new URL(base);for(const [k,v]of Object.entries(params))for(const a of Array.isArray(v)?v:[v])u.searchParams.append(k,String(a));return u.href;};
const numeric=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):bad();
const https=(value,hosts)=>{const u=safeWebUrl(value);if(!u)return null;const p=new URL(u);return p.protocol==='https:'&&hosts.includes(p.hostname)?u:null;};
export function fullCollectionItem(id,native,title,link,at,extra={}){
  const config=FULL_COLLECTION_SOURCES[id];const nativeId=String(native||'');const target=safeWebUrl(link);
  if(!config||!nativeId||nativeId.length>2000||!clean(title)||!target)return null;
  const recordId=createHash('sha256').update(id+'\0'+nativeId).digest('hex').slice(0,32);
  return {key:contentKey(id,recordId),kind:config.kinds[0],title:clean(text(title),2000),contributors:[],identifiers:[{scheme:id,value:nativeId}],languages:['und'],subjects:[],relations:[],
    provenance:[{sourceId:id,sourceRecordId:nativeId,recordUrl:target,retrievedAt:at,mappingVersion:'full-collection-v1'}],
    locations:[{id:id+':'+recordId,host:config.name,landingUrl:target,access:'metadata_only',evidence:{sourceId:id,field:'Live catalog metadata; reading and reuse conditions belong to the source',observedAt:at}}],
    externalOnly:true,sourceActions:[{label:'Open at '+config.name,url:target,scope:'record'}],accessNote:'Details at '+config.name+' · reading and reuse terms apply',...extra};
}

// Tiny bounded tree for provider-rendered result markup, never executing scripts.
export function htmlTree(html){
  if(typeof html!=='string'||Buffer.byteLength(html)>2*1024*1024||/cf-turnstile|verify you are human|<title>just a moment/i.test(html))bad();
  const root={tag:'root',attrs:{},children:[],parts:[]},stack=[root];
  const cleanHtml=html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  for(const m of cleanHtml.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi)){
    if(m[4]!=null){stack.at(-1).parts.push(m[4]);continue;}const tag=m[2].toLowerCase();
    if(m[1]){for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}
    const n={tag,attrs:attributes(m[3]),children:[],parts:[]};stack.at(-1).children.push(n);stack.at(-1).parts.push(n);
    if(!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(tag)){stack.push(n);if(stack.length>150)bad();}
  }return root;
}
const nodes=(root,p)=>root.children.flatMap(n=>[...(p(n)?[n]:[]),...nodes(n,p)]);
const cls=(n,c)=>(n.attrs.class||'').split(/\s+/).includes(c);
const label=n=>text(n.parts.map(p=>typeof p==='string'?p:label(p)).join(' '));
export function parseHtmlCatalog(id,html,q,page){
  const root=htmlTree(html);let records=[],hasNext=false;
  if(id==='lever-press'){
    if(!nodes(root,n=>n.tag==='input'&&n.attrs.name==='q'&&n.attrs.value===q).length)bad();
    const cards=nodes(root,n=>n.tag==='article'&&cls(n,'blacklight-monograph'));
    for(const c of cards){const title=nodes(c,n=>cls(n,'index_title'))[0],a=nodes(c,n=>n.tag==='a'&&/^\/concern\/monographs\/[a-z0-9]+(?:\?|$)/.test(n.attrs.href||''))[0];if(!title||!a)bad();const u=new URL(a.attrs.href,'https://www.fulcrum.org');records.push({id:u.pathname.split('/').at(-1),title:label(title),url:u.origin+u.pathname});}
    if(!cards.length&&!/No (?:entries|results|books|works|items) found|No results|0 results|Sorry, no/i.test(label(root)))bad();
  }else if(id==='storyberries'||id==='nalibali'){
    const heading=nodes(root,n=>n.tag==='h1'&&label(n).replace(/&ndash;/g,'–').toLowerCase()==='search results for: '+q.toLowerCase()+(page>1?' – page '+page:''));
    const empty=/Nothing Found|nothing matched|No results|can.t find what you.re looking for/i.test(label(root))||heading.length>0&&nodes(root,n=>n.tag==='body'&&cls(n,'search-no-results')).length>0;
    if(!heading.length&&!empty)bad();const cards=nodes(root,n=>n.tag==='article'&&cls(n,id==='nalibali'?'elementor-post':'type-post'));
    for(const c of cards){if(id==='nalibali'&&!cls(c,'type-stories'))continue;const native=/(?:^|\s)post-(\d+)(?:\s|$)/.exec(c.attrs.class||'')?.[1];const title=nodes(c,n=>['h2','h3'].includes(n.tag)&&cls(n,id==='nalibali'?'elementor-post__title':'entry-title'))[0];const a=title&&nodes(title,n=>n.tag==='a'&&n.attrs.href)[0];if(!native||!a)bad();const link=https(a.attrs.href,[id==='nalibali'?'nalibali.org':'www.storyberries.com']);if(!link)bad();records.push({id:native,title:label(a),url:link});}
    if(!cards.length&&!empty)bad();
  }else if(id==='la-referencia'){
    const forms=nodes(root,n=>n.tag==='form'&&n.attrs.id==='searchForm');if(forms.length!==1||!nodes(forms[0],n=>n.tag==='input'&&n.attrs.name==='lookfor'&&n.attrs.value===q).length)bad();
    const results=nodes(root,n=>n.tag==='li'&&cls(n,'result'));
    for(const c of results){const native=nodes(c,n=>n.tag==='input'&&cls(n,'hiddenId'))[0]?.attrs.value;const a=nodes(c,n=>n.tag==='a'&&cls(n,'title'))[0];if(!/^[A-Z]{2}_[a-f0-9]{32}$/.test(native||'')||!a)bad();const link=new URL(a.attrs.href,'https://buscador.lareferencia.info');if(link.origin!=='https://buscador.lareferencia.info'||link.pathname!=='/Record/'+native)bad();records.push({id:native,title:label(a),url:link.origin+link.pathname});}
    if(!results.length&&!/No results|No Results|No hay resultados|no result|no records/i.test(label(root)))bad();
  }else bad();
  for(const a of nodes(root,n=>n.tag==='a'&&n.attrs.href)){
    try{const u=new URL(a.attrs.href,{ 'lever-press':'https://www.fulcrum.org/leverpress','storyberries':'https://www.storyberries.com/','nalibali':'https://nalibali.org/','la-referencia':'https://buscador.lareferencia.info/Search/Results'}[id]);
      if(Number(u.searchParams.get('page'))===page+1||Number(u.searchParams.get('paged'))===page+1||u.pathname===`/page/${page+1}/`)hasNext=true;
    }catch{}
  }
  if(new Set(records.map(r=>r.id)).size!==records.length)bad();return {records,hasNext};
}

export function parseFao(xml,query){
  if(typeof xml!=='string'||/<!DOCTYPE|<!ENTITY/i.test(xml))bad();
  const parser=new SaxesParser({xmlns:true});let entry=null,field=null,total=null,start=null,echo=null;const rows=[];
  parser.on('opentag',n=>{if(n.uri==='http://www.w3.org/2005/Atom'&&n.local==='entry')entry={};if(n.local==='Query')echo=n.attributes.searchTerms?.value;
    if(['id','title','totalResults','startIndex'].includes(n.local))field={name:n.local,value:''};});
  parser.on('text',t=>{if(field)field.value+=t;});parser.on('cdata',t=>{if(field)field.value+=t;});
  parser.on('closetag',n=>{if(field&&n.local===field.name){if(n.local==='totalResults')total=numeric(field.value);else if(n.local==='startIndex')start=numeric(field.value);else if(entry)entry[field.name]=field.value;field=null;}
    if(n.local==='entry'&&entry){if(!https(entry.id,['openknowledge.fao.org'])||!new URL(entry.id).pathname.startsWith('/handle/')||!entry.title)bad();rows.push({...entry,url:entry.id});entry=null;}});
  try{parser.write(xml).close();}catch{bad();}if(decodeURIComponent(String(echo||'').replace(/\+/g,' '))!==query||total===null||start===null)bad();return {records:rows,total,start};
}

export function createFullCollectionAdapters(request,{now=()=>Date.now()}={}){
  return Object.fromEntries(Object.entries(FULL_COLLECTION_SOURCES).map(([id,cfg])=>[id,{async search(query,{sourceCursor='0',signal,exactRecord}={}){
    if(exactRecord)throw sourceError('unsupported'); // Source-native links open the original record directly.
    if(cfg.method==='tatoeba'?!/^[0-9,]{1,200}$/.test(sourceCursor):!/^(0|[1-9]\d{0,5})$/.test(sourceCursor))bad();const start=Number(sourceCursor),limit=Math.min(query.limit,6),isHtml=['lever','storyberries','nalibali','lareferencia'].includes(cfg.method),page=Math.floor(start/(isHtml?1000:limit))+1,at=new Date(now()).toISOString();let records=[],next=null;
    const get=u=>request(u,{signal});
    if(cfg.method==='complete-catalog'){
      const catalog=searchCompleteCatalog(id,query.query,start,limit);next=catalog.next;records=catalog.records.map(({words,artist,...r})=>({...r,version:id==='onet'?'O*NET 31.0':'Published artwork catalog · 6 Nov 2026',contributors:artist?[{name:artist,role:'artist'}]:[],...id==='national-gallery-art'?{sourceActions:[{label:'Search at National Gallery of Art',url:r.url,scope:'search'}]}:{},accessNote:id==='onet'?'O*NET 31.0 occupation profile · National Center for O*NET Development · CC BY 4.0':id==='national-gallery-art'?'Artwork metadata · CC0 · opens museum search results · image rights vary':'Artwork metadata · CC0 · individual image rights apply',provenance:[{sourceId:id,sourceRecordId:r.id,recordUrl:r.url,retrievedAt:catalog.meta.observedAt,mappingVersion:'complete-export-v1'}]}));
    }else if(cfg.method==='core'){
      const d=await get(url('https://api.core.ac.uk/v3/search/works/',{q:'title:'+quote(query.query),limit,offset:start}));records=list(d.results).map(r=>({id:r.id,title:r.title,url:'https://core.ac.uk/works/'+numeric(r.id)}));if(records.length&&start+records.length<numeric(d.totalHits))next=start+records.length;
    }else if(cfg.method==='met'){
      const d=await get(url('https://collectionapi.metmuseum.org/public/collection/v1.1/search',{q:query.query,title:'true',limit,offset:start}));if(!Number.isInteger(d.total))bad();const ids=list(d.objectIDs||[]);if(ids.length>limit)bad();
      for(const native of ids){const r=await get('https://collectionapi.metmuseum.org/public/collection/v1/objects/'+numeric(native));if(r.objectID!==native)bad();records.push({id:r.objectID,title:r.title,url:https(r.objectURL,['www.metmuseum.org']),version:r.objectDate,accessNote:'Museum record · '+(r.isPublicDomain?'source labels the artwork public domain':'check individual image and reuse rights')});}if(ids.length&&start+ids.length<Math.min(d.total,10000))next=start+ids.length;
    }else if(cfg.method==='tatoeba'){
      const d=await get(url('https://api.tatoeba.org/v1/sentences',{q:query.query,lang:'eng',limit,sort:'relevance',is_unapproved:'no',is_orphan:'no',showtrans:'none',...sourceCursor!=='0'?{after:sourceCursor}:{}}));
      records=list(d.data).map(r=>{if(r.is_unapproved!==false||!r.owner||!['CC BY 2.0 FR','CC0 1.0'].includes(r.license)||r.lang!=='eng')bad();return {id:r.id,title:r.text,url:'https://tatoeba.org/en/sentences/show/'+numeric(r.id),languages:['en'],contributors:[{name:clean(r.owner),role:'author'}],accessNote:r.license+' · attributed to '+clean(r.owner)};});
      if(d.paging?.has_next){const u=new URL(d.paging.next);const after=u.searchParams.get('after');if(u.origin!=='https://api.tatoeba.org'||u.pathname!=='/v1/sentences'||!/^[0-9,]{1,200}$/.test(after||''))bad();next=after;}
    }else if(cfg.method==='wordpress'){
      const data=await get(url('https://freekidsbooks.org/wp-json/wp/v2/posts',{search:query.query,per_page:limit,page,_fields:'id,title,link,type'}));records=list(data).map(r=>({id:r.id,title:r.title?.rendered,url:https(r.link,['freekidsbooks.org']),kind:'article'}));if(data.length===limit)next=start+limit;
    }else if(cfg.method==='google'){
      const d=await get(url('https://www.googleapis.com/books/v1/volumes',{q:'intitle:'+quote(query.query),printType:'books',maxResults:limit,startIndex:start,...process.env.GOOGLE_BOOKS_API_KEY?{key:process.env.GOOGLE_BOOKS_API_KEY}:{}}));if(!Number.isInteger(d.totalItems)||d.error)bad();records=list(d.items||[]).map(r=>({id:r.id,title:r.volumeInfo?.title,url:https(r.volumeInfo?.infoLink,['books.google.com','books.google.co.in'])||`https://books.google.com/books?id=${encodeURIComponent(r.id)}`,languages:[r.volumeInfo?.language||'und'],version:r.volumeInfo?.contentVersion,accessNote:'Book information · preview or purchase may be required'}));if(records.length&&start+records.length<d.totalItems)next=start+records.length;
    }else if(cfg.method==='appropedia'){
      const d=await get(url('https://www.appropedia.org/w/api.php',{action:'query',format:'json',formatversion:2,list:'search',srnamespace:0,srsearch:query.query,srlimit:limit,sroffset:start,srprop:'timestamp|wordcount|snippet',maxlag:5}));if(d.error)bad();records=list(d.query?.search).map(r=>({id:r.pageid,title:r.title,url:`https://www.appropedia.org/?curid=${numeric(r.pageid)}`}));if(d.continue?.sroffset!=null)next=numeric(d.continue.sroffset);
    }else if(cfg.method==='crossref'){
      const d=await get(url('https://api.crossref.org/works',{'query.title':query.query,rows:limit,offset:start,select:'DOI,title,type,URL'}));records=list(d.message?.items).map(r=>({id:r.DOI,title:r.title?.[0],url:'https://doi.org/'+r.DOI,kind:({'journal-article':'article','book':'book','monograph':'book','book-chapter':'chapter','report':'report','posted-content':'preprint'})[r.type]||'other'}));if(records.length&&start+records.length<numeric(d.message['total-results']))next=start+records.length;
    }else if(cfg.method==='osti'){
      const d=await get(url('https://www.osti.gov/api/v1/records',{title:query.query,rows:limit,page}));records=list(d).map(r=>({id:r.osti_id,title:r.title,url:`https://www.osti.gov/biblio/${numeric(r.osti_id)}`,publishedAt:r.publication_date}));if(d.length===limit)next=start+limit;
    }else if(cfg.method==='cleveland'){
      const d=await get(url('https://openaccess-api.clevelandart.org/api/artworks/',{q:query.query,limit,skip:start,fields:'id,accession_number,title,creation_date,share_license_status,url'}));records=list(d.data).map(r=>({id:r.id,title:r.title,url:https(r.url,['www.clevelandart.org','clevelandart.org']),version:r.creation_date,accessNote:'Museum record · check the individual image licence'}));if(records.length&&start+records.length<numeric(d.info?.total))next=start+records.length;
    }else if(cfg.method==='nasa'){
      const d=await get(url('https://images-api.nasa.gov/search',{q:query.query,page_size:limit,page}));records=list(d.collection?.items).map(r=>{const v=r.data?.[0];return {id:v?.nasa_id,title:v?.title,url:v?.nasa_id?'https://images.nasa.gov/details/'+encodeURIComponent(v.nasa_id):null,publishedAt:v?.date_created,accessNote:'NASA '+(v?.media_type||'media')+' record · source usage conditions apply'};});if(records.length&&start+records.length<numeric(d.collection?.metadata?.total_hits))next=start+records.length;
    }else if(cfg.method==='federal'){
      const d=await get(url('https://www.federalregister.gov/api/v1/documents.json',{'conditions[term]':query.query,'fields[]':['document_number','title','type','publication_date','html_url'],order:'relevance',page,per_page:limit}));if(d.errors||!Number.isInteger(d.count))bad();records=list(d.results||[]).map(r=>({id:r.document_number,title:r.title,url:https(r.html_url,['www.federalregister.gov']),publishedAt:r.publication_date,accessNote:'Published '+r.type+' · check amendments and current legal status'}));if(records.length&&page<numeric(d.total_pages))next=start+limit;
    }else if(cfg.method==='archive'){
      const d=await get(url('https://archive.org/advancedsearch.php',{q:'mediatype:texts AND NOT access-restricted-item:true AND title:'+quote(query.query),'fl[]':['identifier','title','mediatype','date'],rows:limit,page,output:'json'}));records=list(d.response?.docs).map(r=>({id:r.identifier,title:Array.isArray(r.title)?r.title[0]:r.title,url:/^[A-Za-z0-9_.-]+$/.test(r.identifier)?'https://archive.org/details/'+r.identifier:null,accessNote:'Archive text item · reading and reuse conditions vary'}));if(records.length&&start+records.length<numeric(d.response.numFound))next=start+records.length;
    }else if(cfg.method==='fao'){
      const term='title:'+quote(query.query);const d=parseFao(await request(url('https://openknowledge.fao.org/server/opensearch/search',{format:'atom',query:term,rpp:limit,start}),{signal,binary:true}).then(b=>b.toString('utf8')),term);records=d.records;if(records.length&&start+records.length<d.total)next=start+records.length;
    }else{
      const base={lever:'https://www.fulcrum.org/leverpress',storyberries:'https://www.storyberries.com/',nalibali:'https://nalibali.org/',lareferencia:'https://buscador.lareferencia.info/Search/Results'}[cfg.method];if(!base)bad();
      const params=cfg.method==='lever'?{q:query.query,page}:cfg.method==='lareferencia'?{lookfor:query.query,type:'Title',page}:{s:query.query,...cfg.method==='nalibali'?{id:35234}:{},...page>1?{paged:page}:{}};
      const parsed=parseHtmlCatalog(id,await request(url(base,params),{signal,html:true}),query.query,page);
      // Public HTML pages may have a fixed provider page size. Cursor counts pages, not our filtered results.
      const matches=parsed.records.filter(r=>relevant(r.title,query.query)),within=start%1000;records=matches.slice(within,within+limit);next=within+records.length<matches.length?start+records.length:parsed.hasNext?page*1000:null;
    }
    const seen=new Set();const items=[];for(const r of records){if(!r.id||!r.title||!r.url)bad();const native=String(r.id);if(seen.has(native))bad();seen.add(native);
      if(!relevant(text(r.title),query.query)&&!['nasa','cleveland','federal','complete-catalog'].includes(cfg.method))continue;
      const {id:rid,title,url:link,...extra}=r;const item=fullCollectionItem(id,rid,title,link,at,extra);if(item)items.push(item);}
    return {items:items.slice(0,limit),nextSourceCursor:next==null?null:String(next)};
  }}]));
}
