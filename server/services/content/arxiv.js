import {SaxesParser} from 'saxes';
import {contentKey,normalizeDoi,safeWebUrl} from './contracts.js';
import {clean,sourceError,sourceSignal,sourceText} from './sourceHttp.js';
const ATOM='http://www.w3.org/2005/Atom',AX='http://arxiv.org/schemas/atom',OS='http://a9.com/-/spec/opensearch/1.1/';

function children(node,local,uri=ATOM){return node.children.filter(n=>n.local===local&&n.uri===uri);}
function value(node){return node?clean(node.text+node.children.map(value).join(' '),2000):'';}
function first(node,local,uri=ATOM){return children(node,local,uri)[0];}
function arxivUrl(raw){const url=safeWebUrl(raw);return url&&new URL(url).hostname==='arxiv.org'?url:null;}
export function parseArxivFeed(xml){
  if(typeof xml!=='string'||Buffer.byteLength(xml)>2*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(xml))throw sourceError('unavailable');
  const parser=new SaxesParser({xmlns:true});const stack=[];let root,nodes=0;
  parser.on('opentag',tag=>{
    if(++nodes>40000||stack.length>40)throw sourceError('unavailable');
    const node={local:tag.local,uri:tag.uri,text:'',children:[],attrs:Object.fromEntries(Object.values(tag.attributes).map(a=>[a.local,a.value]))};
    if(stack.length)stack[stack.length-1].children.push(node);else root=node;stack.push(node);
  });
  parser.on('text',text=>{if(stack.length)stack[stack.length-1].text+=text;});
  parser.on('cdata',text=>{if(stack.length)stack[stack.length-1].text+=text;});
  parser.on('closetag',()=>stack.pop());parser.on('error',()=>{throw sourceError('unavailable');});
  try{parser.write(xml).close();}catch{throw sourceError('unavailable');}
  if(root?.uri!==ATOM||root.local!=='feed')throw sourceError('unavailable');
  return root;
}
export function mapArxiv(entry,observedAt){
  const idUrl=arxivUrl(value(first(entry,'id')));if(!idUrl)return null;
  const native=new URL(idUrl).pathname.replace(/^\/abs\//,'');let key;
  try{key=contentKey('arxiv',native);}catch{return null;}
  const title=value(first(entry,'title'));if(!title)return null;
  const links=children(entry,'link');const reader=links.find(l=>l.attrs.rel==='alternate'&&arxivUrl(l.attrs.href));
  const pdf=links.find(l=>l.attrs.type==='application/pdf'&&arxivUrl(l.attrs.href));
  const landing=reader?arxivUrl(reader.attrs.href):idUrl;
  const licence=first(entry,'license',AX)?.attrs.href;const doi=normalizeDoi(value(first(entry,'doi',AX)));
  const version=/v([1-9]\d*)$/.exec(native);
  return {key,kind:'preprint',title:clean(title),...(version?{version:'v'+version[1]}:{}),
    contributors:children(entry,'author').flatMap(a=>value(first(a,'name'))?[{name:clean(value(first(a,'name')),240),role:'author'}]:[]).slice(0,100),
    identifiers:[{scheme:'arxiv',value:native},...doi?[{scheme:'doi',value:doi}]:[]],languages:['und'],
    subjects:children(entry,'category').map(n=>clean(n.attrs.term,100)).filter(Boolean),publishedAt:value(first(entry,'published')),
    ...(value(first(entry,'journal_ref',AX))?{container:{title:clean(value(first(entry,'journal_ref',AX)))}}:{}),
    relations:doi?[{kind:'Published DOI · access not checked',targetUrl:'https://doi.org/'+doi,evidence:'arxiv:doi'}]:[],
    locations:[{id:'arxiv:'+native,host:'arXiv',landingUrl:landing,readerUrl:landing,access:'free_full_text',
      downloads:pdf?[{url:arxivUrl(pdf.attrs.href),mimeType:'application/pdf'}]:[],
      ...safeWebUrl(licence)?{license:{url:safeWebUrl(licence),statement:licence}}:{},
      evidence:{sourceId:'arxiv',field:'arXiv public Atom entry; supplied alternate/PDF links',observedAt}}],
    provenance:[{sourceId:'arxiv',sourceRecordId:native,recordUrl:idUrl,retrievedAt:observedAt,mappingVersion:'arxiv-atom-v1'}]};
}

export function createArxivAdapter({fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  return {async search(query,{sourceCursor='0',signal,exactRecord}={}){
    if(!/^\d{1,5}$/.test(sourceCursor)||Number(sourceCursor)>10000)throw sourceError('unavailable');
    const id=exactRecord?.recordId||query.query.replace(/^(?:arxiv:|https?:\/\/arxiv\.org\/abs\/)/i,'').trim();let exact;
    try{contentKey('arxiv',id);exact=id;}catch{}
    const url=new URL('https://export.arxiv.org/api/query');
    const search='all:"'+query.query.replace(/[\\"]/g,'\\$&')+'"';
    url.search=new URLSearchParams({...exact?{id_list:exact}:{search_query:search},start:sourceCursor,max_results:String(query.limit),sortBy:'relevance',sortOrder:'descending'}).toString();
    const xml=await sourceText(fetchImpl,url,{signal:sourceSignal(signal),accept:'application/atom+xml'});
    const root=parseArxivFeed(xml),entries=children(root,'entry');
    if(entries.length>query.limit)throw sourceError('unavailable');
    const observedAt=new Date(now()).toISOString();const items=entries.map(e=>mapArxiv(e,observedAt));
    if(items.some(i=>!i))throw sourceError('unavailable');
    const total=Number(value(first(root,'totalResults',OS))),start=Number(sourceCursor);
    if(!Number.isInteger(total)||total<0)throw sourceError('unavailable');
    return {items,observedAt,nextSourceCursor:!exact&&entries.length&&start+entries.length<total&&start+entries.length<10000?String(start+entries.length):null};
  }};
}
