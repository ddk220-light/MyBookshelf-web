import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {contentKey,safeWebUrl} from './contracts.js';
import {clean,sourceError} from './sourceHttp.js';
import {attributes,text} from '../providers/catalogMarkup.js';
import {KNOWLEDGE_SOURCES} from './knowledgeSources.js';

const snapshot=JSON.parse(readFileSync(new URL('../../data/content/metadata-catalogs.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32);
const words=value=>String(value).normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
const relevant=(value,query)=>{const haystack=words(value),terms=words(query);return terms.length>0&&terms.every(term=>haystack.some(word=>word===term||term.length>=4&&word.startsWith(term)));};

function metadataItem(id,recordId,title,url,observedAt,extra={}){
  if(!safeWebUrl(url)||!clean(title))throw sourceError('unavailable');
  return {key:contentKey(id,recordId),kind:'book',title:clean(title,2000),contributors:[],languages:['und'],identifiers:[],subjects:[],relations:[],
    locations:[{id:id+':'+recordId,host:KNOWLEDGE_SOURCES[id].name,landingUrl:url,access:'metadata_only',evidence:{sourceId:id,field:'Published bibliographic metadata; reader access not tested',observedAt}}],
    provenance:[{sourceId:id,sourceRecordId:recordId,recordUrl:url,retrievedAt:observedAt,mappingVersion:'metadata-link-v1'}],
    sourceActions:[{label:'Open at '+KNOWLEDGE_SOURCES[id].name,url,scope:'record'}],accessNote:'Book details at the source · reading access may vary',...extra};
}

export function searchMetadataCatalog(id,query,{start=0,exactRecord}={}){
  const catalog=snapshot.catalogs[id];if(!catalog)throw sourceError('unsupported');
  const records=exactRecord?catalog.records.filter(row=>row.id===exactRecord.recordId):catalog.records.filter(row=>relevant(row.title,query.query));
  const rows=records.slice(start,start+query.limit).map(row=>{
    const officialHost=id==='openstax'?'openstax.org':'www.projectmadurai.org';
    if(new URL(row.url).hostname!==officialHost)throw sourceError('unavailable');
    const urls=(row.listedFormats||[]).filter(url=>/^https:\/\/www\.projectmadurai\.org\/pm_etexts\/utf8\/[A-Za-z0-9_.-]+\.html$/.test(url));
    return metadataItem(id,row.id,row.title,row.url,catalog.observedAt,{identifiers:[{scheme:id,value:row.nativeId}],
      contributors:row.authors.map(name=>({name,role:'author'})),subjects:row.subjects,languages:id==='openstax'?['en']:['und'],
      provenance:[{sourceId:id,sourceRecordId:row.nativeId,recordUrl:row.url,retrievedAt:catalog.observedAt,mappingVersion:'metadata-link-v1'}],
      ...urls.length?{sourceActions:urls.map((url,i)=>({url,label:urls.length===1?'Open at Project Madurai':`Open part ${i+1} at Project Madurai`,scope:'record'})),accessNote:'Text links at Project Madurai · source reading and reuse terms apply'}:{},
      ...id==='openstax'?{accessNote:'Textbook details at OpenStax',version:'Math catalog · 6 Nov 2026'}:{}});
  });
  return {items:rows,nextSourceCursor:!exactRecord&&start+rows.length<records.length?String(start+rows.length):null};
}

export function parseSugamya(html,query,observedAt){
  // Only the public, echoed search table is parsed. Never retain login fields,
  // session IDs, scripts, challenge answers or hidden input values.
  if(typeof html!=='string'||Buffer.byteLength(html)>2*1024*1024)throw sourceError('unavailable');
  const echoed=[...html.matchAll(/<input\b([^>]*)>/gi)].some(match=>{const a=attributes(match[1]);return a.name==='txtboxSearch'&&a.value===query;});
  if(!echoed)throw sourceError('unavailable');
  const cleaned=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  let tableDepth=0,inside=false,cell=null,row=null;const found=[];
  for(const token of cleaned.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi)){
    if(token[4]!=null){if(inside&&cell)cell.value+=token[4]+' ';continue;}
    const closing=token[1]==='/',tag=token[2].toLowerCase(),a=attributes(token[3]);
    if(!inside){if(!closing&&tag==='table'&&a.class?.split(/\s+/).includes('search-result-table')){inside=true;tableDepth=1;}continue;}
    if(tag==='table'){tableDepth+=closing?-1:1;if(!tableDepth){inside=false;break;}continue;}
    if(tableDepth!==1)continue;
    if(tag==='tr'){
      if(!closing)row=[];
      else if(row?.[0]?.rowTitle){if(row.length!==6)throw sourceError('unavailable');found.push(row.map(c=>text(c.value)));row=null;}
    }else if(tag==='td'||tag==='th'){
      if(!closing)cell={value:'',rowTitle:tag==='th'&&a.scope==='row'};
      else if(cell&&row){row.push(cell);cell=null;}
    }
  }
  if(!found.length&&!/Total\s+0\s+books found|No books found|No records found/i.test(text(cleaned)))throw sourceError('unavailable');
  const url=new URL('https://sugamyapustakalaya.org.in/searchAction.action');url.searchParams.set('txtboxSearch',query);
  const results=new Map();
  for(const [title,author,publisher,library,format,language] of found){
    if(!title||!relevant(title,query))continue;
    const recordId=digest({title,author,publisher,library,format,language});
    const item=metadataItem('sugamya-pustakalaya',recordId,title,url.href,observedAt,{contributors:author?[{name:author,role:'author'}]:[],publisher,
      languages:[({English:'en',Hindi:'hi',Tamil:'ta',Kannada:'kn',Odia:'or',Telugu:'te',Malayalam:'ml',Bengali:'bn'})[language]||'und'],
      container:{title:library},version:format,externalOnly:true,
      // Composite identity is not presented as a provider's book/edition ID.
      provenance:[{sourceId:'sugamya-pustakalaya',sourceRecordId:'',recordUrl:url.href,retrievedAt:observedAt,mappingVersion:'anonymous-metadata-v1'}],
      accessNote:'Eligible-member login required to read · opens search results',
      sourceActions:[{label:'See matching books at Sugamya Pustakalaya',url:url.href,scope:'search'}]});
    results.set(item.key,item);
  }
  return [...results.values()];
}
