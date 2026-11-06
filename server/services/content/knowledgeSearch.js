import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {CONTENT_POLICY_REVISION,parseContentSearch,parseContentResolve,readingActions,itemAccess,isReadableAccess,observedAccess} from './contracts.js';
import {KNOWLEDGE_SOURCES,publicKnowledgeSources} from './knowledgeSources.js';
import {createKnowledgeAdapters} from './knowledgeAdapters.js';
const fail=(code,message,status=503,sources)=>Object.assign(new Error(message),{code,status,sources});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const PROFILE='knowledge-live-v1';
export function createKnowledgeService({env=process.env,adapters,now=()=>Date.now()}={}) {
  const providers=adapters||createKnowledgeAdapters({now});
  const enabled=()=>env.CONTENT_DISCOVERY_ENABLED==='true'&&env.CONTENT_KNOWLEDGE_ENABLED==='true';
  function ready(){if(!enabled())throw fail('CONTENT_DISABLED','Knowledge search is not connected here.');if(typeof env.CONTENT_CURSOR_SECRET!=='string'||env.CONTENT_CURSOR_SECRET.length<32)throw fail('CONTENT_UNAVAILABLE','Knowledge search is temporarily unavailable.');}
  const sign=value=>createHmac('sha256',env.CONTENT_CURSOR_SECRET).update(value).digest('base64url');
  function encode(value){const payload=Buffer.from(JSON.stringify(value)).toString('base64url');return payload+'.'+sign(payload);}
  function decode(value,binding,id){try{const [payload,signature,extra]=value.split('.');if(extra||!/^[A-Za-z0-9_-]{43}$/.test(signature||'')||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw Error();const state=JSON.parse(Buffer.from(payload,'base64url'));if(state.profile!==PROFILE||state.id!==id||state.binding!==binding||!Number.isFinite(state.expires)||state.expires<=now()||!Number.isInteger(state.page)||state.page<0||state.page>=50||typeof state.native!=='string'||state.native.length>1000||!Array.isArray(state.history)||state.history.length>8||state.history.some(v=>!/^[a-f0-9]{64}$/.test(v)))throw Error();return state;}catch{throw fail('CONTENT_CURSOR_EXPIRED','This source search expired or changed. Search it again.',409);}}
  const present=(item,context)=>({...item,readingActions:readingActions(item,{...context,now:now()}),access:itemAccess(item,{...context,now:now()})});
  const status=(id,state,returned=0,extra={})=>({id,name:KNOWLEDGE_SOURCES[id].name,scope:KNOWLEDGE_SOURCES[id].scope,status:state,returned,...extra});
  async function request(id,query,options){
    if(options.signal?.aborted)throw options.signal.reason;
    try {const page=await providers[id].search(query,options);if(!Array.isArray(page?.items)||page.items.length>query.limit)throw Error();return page;}
    catch(error){if(options.signal?.aborted)throw error;const state=['timeout','throttled','not_found','unsupported'].includes(error.sourceStatus)?error.sourceStatus:'unavailable';throw fail(state==='not_found'?'CONTENT_NOT_FOUND':state==='unsupported'?'CONTENT_FILTER_UNSUPPORTED':'CONTENT_UNAVAILABLE',state==='throttled'?'This source is limiting requests. Please wait before trying it again.':state==='unsupported'?'This filter is not supported by this source.':'This source could not answer. Other sources may still have matches.',state==='not_found'?404:state==='unsupported'?400:503,[status(id,state,0,{retryAfterSeconds:error.retryAfterSeconds})]);}
  }
  return {
    sources:()=>publicKnowledgeSources(enabled()),
    async search(input,{signal,onSource=()=>{}}={}){
      const query=parseContentSearch(input);ready();const id=query.sourceIds?.[0];
      if(query.sourceIds?.length!==1||!KNOWLEDGE_SOURCES[id])throw fail('CONTENT_INVALID_REQUEST','Choose one source for each request.',400);
      if(query.retrySource&&query.retrySource!==id)throw fail('CONTENT_INVALID_REQUEST','Retry the selected source.',400);
      const config=KNOWLEDGE_SOURCES[id];
      if(config.blocked)throw fail('CONTENT_DISABLED','This source is not connected here.',503,[status(id,'disabled')]);
      if(query.languages.length&&(query.languages.length!==1||!config.languages?.includes(query.languages[0])))throw fail('CONTENT_FILTER_UNSUPPORTED','This source does not support that language filter.',400,[status(id,'unsupported')]);
      if(!query.kinds.some(k=>config.kinds.includes(k)))throw fail('CONTENT_FILTER_UNSUPPORTED','This source does not supply the selected content type.',400,[status(id,'unsupported')]);
      const binding=hash({...query,cursor:null,retrySource:null,profile:PROFILE,policy:CONTENT_POLICY_REVISION});
      const state=query.cursor?decode(query.cursor,binding,id):{profile:PROFILE,id,binding,native:'0',expires:now()+900000,page:0,history:[]};
      onSource(status(id,'searching'));
      const page=await request(id,query,{sourceCursor:state.native,signal});
      const items=[],seen=new Set();let hiddenUnclear=0;
      for(const raw of page.items){if(seen.has(raw.key)||!query.kinds.includes(raw.kind))continue;seen.add(raw.key);const item=present(raw,query);
        if(config.metadataDiscovery&&query.access!=='free_full_text')items.push(item);
        else if(isReadableAccess(item.access)&&(query.access!=='free_full_text'||item.access==='free_full_text'))items.push(item);
        else if(!item.locations.length||item.locations.some(location=>['unknown','metadata_only'].includes(observedAccess(location,{...query,now:now()})))){hiddenUnclear++;if(query.includeUnclear)items.push(item);}}
      const native=page.nextSourceCursor;
      if(native!=null&&(typeof native!=='string'||!native||native.length>1000))throw fail('CONTENT_UNAVAILABLE','This source returned an invalid continuation.');
      const history=[...state.history,hash(state.native)].slice(-8);const truncated=Boolean(native&&(history.includes(hash(native))||state.page>=49));
      const sources=[status(id,'ok',items.length,{truncated})];sources.forEach(onSource);
      return {items,sources,hiddenUnclear,nextCursor:native&&!truncated?encode({...state,native,page:state.page+1,history}):null,coverage:'partial',searchMode:'live',policyRevision:CONTENT_POLICY_REVISION};
    },
    async resolve(input,{signal}={}){const query=parseContentResolve(input);ready();const id=query.parsed.sourceId;if(KNOWLEDGE_SOURCES[id]?.blocked)throw fail('CONTENT_DISABLED','This source is not connected here.');if(!KNOWLEDGE_SOURCES[id])throw fail('CONTENT_INVALID_REQUEST','Unknown knowledge source.',400);const page=await request(id,{query:'record lookup',limit:1,languages:query.parsed.recordSource?[query.parsed.recordSource]:[]},{signal,exactRecord:query.parsed});const item=page.items.find(x=>x.key===query.key);if(!item)throw fail('CONTENT_NOT_FOUND','This record could not be found at the source.',404);return {item:present(item,query),policyRevision:CONTENT_POLICY_REVISION};}
  };
}
