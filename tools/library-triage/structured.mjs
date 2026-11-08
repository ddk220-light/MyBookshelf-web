import { SaxesParser } from 'saxes';
import { hash, failure, VERSION } from '../../server/services/catalog-connectors/contracts.js';
import { scopeSearch } from '../../server/services/providers/koha.js';
import { vufindSearchUrl } from '../../server/services/providers/vufind.js';

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function parseKohaRss(text, origin) {
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw failure('INVALID_SOURCE_RESPONSE','XML declarations outside the supported RSS contract');
  let root=null,item=null,field=null,total=null,channel=false;const items=[],stack=[];
  const parser=new SaxesParser({xmlns:true});
  parser.on('opentag',tag=>{
    stack.push(tag.local);root??=tag.local;
    if(stack.join('/')==='rss/channel')channel=true;
    if(tag.local==='item'&&stack.join('/')==='rss/channel/item')item={};
    if(item&&stack.length===4)field=tag.local;
    if(tag.local==='totalResults')field='totalResults';
  });
  const collect=value=>{if(field==='totalResults')total=(total||'')+value;else if(item&&field)item[field]=(item[field]||'')+value;};
  parser.on('text',collect);parser.on('cdata',collect);
  parser.on('closetag',tag=>{
    if(tag.local==='item'&&item){items.push(item);item=null;}
    if(tag.local===field)field=null;stack.pop();
  });
  try{parser.write(text).close();}catch{throw failure('INVALID_SOURCE_RESPONSE','Unrecognized RSS/XML response');}
  if(root!=='rss'||!channel)throw failure('API_UNAVAILABLE','Response is not a Koha RSS feed');
  const seen=new Set();
  const records=items.map(i=>{
    let url;try{url=new URL(clean(i.link),origin);}catch{throw failure('INVALID_SOURCE_RESPONSE','Invalid RSS record URL');}
    const recordId=url.searchParams.get('biblionumber');
    if(url.username||url.password||url.origin!==new URL(origin).origin || !/^\/cgi-bin\/koha\/opac-(?:MARC)?detail\.pl$/.test(url.pathname) || !/^[1-9]\d{0,11}$/.test(recordId||'') || !clean(i.title) || seen.has(recordId))throw failure('INVALID_SOURCE_RESPONSE','RSS identity or origin mismatch');
    seen.add(recordId);return {recordId,title:clean(i.title),authors:i.creator?[clean(i.creator)]:[],catalogUrl:url.toString(),linkKind:'record'};
  });
  const count=total==null?null:Number(clean(total));
  if(count!=null&&(!Number.isSafeInteger(count)||count<records.length))throw failure('INVALID_SOURCE_RESPONSE','Invalid RSS count');
  return {records,total:count};
}
export function parseVuFindApi(text,entry) {
  let data;try{data=JSON.parse(text);}catch{throw failure('API_UNAVAILABLE','Search endpoint did not return JSON');}
  if(data.status==='UNAUTHORIZED')throw failure('SOURCE_ACCESS_BLOCKED','VuFind API requires permission');
  if(data.status!=='OK'||!Number.isSafeInteger(data.resultCount)||data.resultCount<0||(!Array.isArray(data.records)&&data.resultCount!==0))throw failure('INVALID_SOURCE_RESPONSE','Unrecognized VuFind API response');
  const seen=new Set(),base=entry.baseUrl.replace(/\/+$/,'');
  const records=(data.records||[]).map(r=>{
    if(typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(r.id)||typeof r.title!=='string'||!clean(r.title)||seen.has(r.id))throw failure('INVALID_SOURCE_RESPONSE','Invalid VuFind record identity');
    seen.add(r.id);return {recordId:r.id,title:clean(r.title),authors:[],catalogUrl:base+'/Record/'+encodeURIComponent(r.id),linkKind:'record'};
  });
  if(data.resultCount<records.length)throw failure('INVALID_SOURCE_RESPONSE','Invalid VuFind API count');
  return {records,total:data.resultCount};
}
export class SharedSearchService {
  constructor(native){this.native=native;this.coordinator=native.coordinator;}
  connection(...args){return this.native.connection(...args);}
  resolve(...args){return this.native.resolve(...args);}
  search(input,options={}) {
    const route=this.connection(input.libraryId,input.connectionId);
    if(route.entry.platform==='indcat')throw failure('STRUCTURED_SCOPE_UNVERIFIED','IndCat SRU has no verified institution-holdings filter/identity mapping in the saved contract; do not count union hits as local holdings');
    if(!['koha','vufind'].includes(route.entry.platform))return this.native.search(input,options);
    return this.native.execute(input.libraryId,input.connectionId,'structured_search',async({entry},ctx)=>{
      let url,parsed;
      if(entry.platform==='koha') {
        url=new URL('/cgi-bin/koha/opac-search.pl',entry.baseUrl);
        url.search=new URLSearchParams({idx:'kw',q:input.query,count:'20',sort_by:'relevance',format:'rss'});
        scopeSearch(url,entry);
      }else{
        url=new URL(vufindSearchUrl(entry,input.query,'Title'));
        url.pathname=url.pathname.replace(/\/Search\/Results$/,'/api/v1/search');
        for(const name of ['id','title'])url.searchParams.append('field[]',name);
      }
      const response=await ctx.request(url.toString(),{headers:{Accept:entry.platform==='koha'?'application/rss+xml, application/xml, text/xml':'application/json'},
        maxResponseBytes:1024*1024,allowedResponseTypes:['application/rss+xml','application/xml','text/xml','application/json']});
      if([404,405,501].includes(response.status))throw failure('API_UNAVAILABLE','Documented API/search format is not enabled at this installation');
      if(!response.ok)throw failure(response.status>=500?'CATALOG_UNAVAILABLE':'API_UNAVAILABLE',`Structured search returned HTTP ${response.status}`);
      parsed=entry.platform==='koha'?parseKohaRss(response.text,url.origin):parseVuFindApi(response.text,entry);
      const records=parsed.records.map(r=>({...r,recordRef:this.native.refs.sign({kind:'record',libraryId:input.libraryId,connectionId:input.connectionId,recordId:r.recordId,configHash:hash(entry),version:VERSION,expiresAt:Date.now()+86400000})}));
      return {records,total:{value:parsed.total,relation:parsed.total==null?'unknown':'exact'},fidelity:'supported_structured_search',
        effectiveProfile:{query:input.query,field:entry.platform==='koha'?'keyword':'title',method:entry.platform==='koha'?'koha_rss_xml':'vufind_search_api',
          requestUrl:url.toString(),libraryScope:'configured_filters_plus_required_native_item_holdings'},page:{returned:records.length}};
    },options);
  }
}
