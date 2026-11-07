import {isContentSourceRetired,localFreeSearchEnabled} from '../../../shared/content-source-availability.mjs';
import {createKnowledgeService} from './knowledgeSearch.js';
import {KNOWLEDGE_SOURCES,LOCAL_CONTENT_SOURCES} from './knowledgeSources.js';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createLocalContentService,readLocalSnapshots} from './localCatalog.js';
import {createEuropePmcAdapter} from './europePmc.js';
import {createOpenalexAdapter} from './openalex.js';
import {sourceSignal} from './sourceHttp.js';
import {createChildrenService} from './children.js';
import {CONTENT_POLICY_REVISION,parseContentSearch,parseContentResolve,parseContentLocate,parseContentKey,readingActions,observedAccess,itemAccess,isReadableAccess} from './contracts.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure=(code,message,status=503,sources)=>Object.assign(new Error(message),{code,status,sources});
const SOURCES={europepmc:{name:'Europe PMC',env:'EUROPEPMC',scope:'Biomedical literature'},
  openalex:{name:'Wide paper search',env:'OPENALEX',scope:'Multidisciplinary literature'},
  doaj:{name:'DOAJ',scope:'OA journal articles',website:'https://doaj.org/search/articles',parameter:'q'},
  arxiv:{name:'arXiv',scope:'Preprints',website:'https://arxiv.org/search/',parameter:'query'}};
const PROFILE='direct-live-v1';

export function createContentService({env=process.env,local,paperAdapter=createEuropePmcAdapter(),
  adapters={},children,knowledge,now=()=>Date.now()}={}){
  local||=createLocalContentService({enabled:env.CONTENT_DISCOVERY_ENABLED==='true',cursorSecret:env.CONTENT_CURSOR_SECRET,now,
    loadSnapshot:()=>readLocalSnapshots({includeChildren:env.CONTENT_CHILDREN_ENABLED==='true'&&!isContentSourceRetired('storyweaver'),now:now()})});
  const expanded=knowledge||createKnowledgeService({env,now});
  const providers={europepmc:paperAdapter,openalex:createOpenalexAdapter({apiKey:env.OPENALEX_API_KEY}),...adapters};
  const pilot=children||createChildrenService({enabled:env.CONTENT_DISCOVERY_ENABLED==='true'&&env.CONTENT_CHILDREN_ENABLED==='true',cursorSecret:env.CONTENT_CURSOR_SECRET,now});
  const enabled=id=>Boolean(SOURCES[id]?.env&&env['CONTENT_'+SOURCES[id].env+'_ENABLED']==='true');
  function ready(){
    if(env.CONTENT_DISCOVERY_ENABLED!=='true')throw failure('CONTENT_DISABLED','Free-content discovery is not connected yet.');
    if(typeof env.CONTENT_CURSOR_SECRET!=='string'||env.CONTENT_CURSOR_SECRET.length<32)throw failure('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');
  }
  function selected(query){
    if(query.sourceIds){
      if(query.sourceIds.length!==1)throw failure('CONTENT_FILTER_UNSUPPORTED','Choose one paper source for each live search.',400);
      return query.sourceIds[0];
    }
    const arxiv=query.query.replace(/^(?:arxiv:|https?:\/\/arxiv\.org\/abs\/)/i,'').trim();
    if(parseContentKey('fcd:v1:arxiv:'+arxiv.replace('/',':')))return 'arxiv';
    if(/^PMC[1-9]\d*$/i.test(query.query))return 'europepmc';
    const biomedical=/malaria|biomed|clinical|medicine|health|cancer|genom|protein|disease/i.test(query.query);
    return (biomedical?['europepmc','openalex']:['openalex','europepmc']).find(enabled)||'openalex';
  }
  function rows(id,query,status='ok',returned=0,details={}){
    return Object.entries(SOURCES).map(([key,source])=>{
      const row={id:key,name:source.name,scope:source.scope,returned:key===id?returned:0,
        status:!enabled(key)?'disabled':key===id?status:'not_selected',...key===id?details:{}};
      if(source.website){
        const url=new URL(source.website);url.searchParams.set(source.parameter,query.query);
        if(key==='arxiv')url.searchParams.set('searchtype','all');
        row.searchUrl=url.href;
      }
      return row;
    });
  }
  const present=(item,context)=>({...item,readingActions:readingActions(item,{...context,now:now()}),access:itemAccess(item,{...context,now:now()})});
  const sign=payload=>createHmac('sha256',env.CONTENT_CURSOR_SECRET).update(payload).digest('base64url');
  function encode(state){const payload=Buffer.from(JSON.stringify(state)).toString('base64url');return payload+'.'+sign(payload);}
  function decode(cursor,binding,id){
    try{
      const [payload,signature,extra]=cursor.split('.');
      if(extra||!/^[A-Za-z0-9_-]{43}$/.test(signature||'')||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw Error();
      const state=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(state.profile!==PROFILE||state.binding!==binding||state.id!==id||!Number.isFinite(state.expires)||state.expires<=now()
        ||typeof state.native!=='string'||!state.native||state.native.length>1500
        ||!Number.isInteger(state.page)||state.page<0||state.page>=50||!Array.isArray(state.history)||state.history.length>8
        ||state.history.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error();
      return state;
    }catch{throw failure('CONTENT_CURSOR_EXPIRED','This live search changed or expired. Search again to continue.',409);}
  }
  async function requestSource(id,query,options){
    if(options.signal?.aborted)throw options.signal.reason;
    try{
      const page=await providers[id].search(query,options);
      if(!Array.isArray(page?.items)||page.items.length>query.limit)throw Error('Invalid provider page');
      return page;
    }
    catch(error){
      if(options.signal?.aborted&&options.signal.reason?.name==='AbortError')throw error;
      const status=['timeout','throttled','quota_exhausted','not_found'].includes(error.sourceStatus)?error.sourceStatus:'unavailable';
      const retryAfterSeconds=Number.isFinite(error.retryAfterSeconds)?Math.min(3600,Math.max(1,error.retryAfterSeconds)):undefined;
      throw failure(status==='not_found'?'CONTENT_NOT_FOUND':'CONTENT_UNAVAILABLE',
        status==='quota_exhausted'?'This source’s free allowance is used up. Try another source or return later.':
        status==='throttled'?'This source is limiting requests. Please wait before trying again.':'This paper source could not answer. This does not mean there is no free copy.',
        status==='not_found'?404:503,rows(id,query,status,0,retryAfterSeconds?{retryAfterSeconds}:{}));
    }
  }
  return {
    sources(){return {sources:[...expanded.sources(),...Object.entries(SOURCES).map(([id,s])=>({id,name:s.name,scope:s.scope,kinds:['article','preprint','chapter','thesis','report'],languages:id==='openalex'?['en','hi','ta']:[],enabled:env.CONTENT_DISCOVERY_ENABLED==='true'&&enabled(id),mode:'live'})),...LOCAL_CONTENT_SOURCES.filter(id=>!isContentSourceRetired(id)).map(id=>({id,name:({'gutenberg':'Project Gutenberg','open-textbook-library':'Open Textbook Library',bookdash:'Book Dash',storyweaver:'StoryWeaver'})[id],scope:'Reviewed catalog snapshot · coverage and freshness vary',kinds:[id==='open-textbook-library'?'learning_resource':'book'],languages:[],enabled:env.CONTENT_DISCOVERY_ENABLED==='true'&&(id!=='storyweaver'||env.CONTENT_CHILDREN_ENABLED==='true'),mode:'snapshot'}))]};},
    locate(input){parseContentLocate(input);return localFreeSearchEnabled?local.locate(input):{items:[],policyRevision:CONTENT_POLICY_REVISION};},
    async search(input,{onSource=()=>{},signal}={}){
      const query=parseContentSearch(input);
      if(query.sourceIds?.some(isContentSourceRetired)||query.collection==='children'&&isContentSourceRetired('storyweaver')||!localFreeSearchEnabled&&(!query.sourceIds?.length)&&(query.kinds.includes('book')||query.kinds.includes('learning_resource')))throw failure('CONTENT_DISABLED','This source is no longer connected. Search the connected sources in All knowledge.',503);
      if(query.sourceIds?.some(id=>KNOWLEDGE_SOURCES[id]))return expanded.search(input,{onSource,signal});
      if(query.collection==='children')return pilot.search(input);
      if(query.kinds.includes('book')||query.kinds.includes('learning_resource')){
        if(query.kinds.some(kind=>!['book','learning_resource'].includes(kind)))throw failure('CONTENT_FILTER_UNSUPPORTED','Choose free books or paper kinds for this search.',400);
        if(query.sourceIds?.some(id=>!LOCAL_CONTENT_SOURCES.includes(id))||query.retrySource)throw failure('CONTENT_FILTER_UNSUPPORTED','Paper source filters do not apply to book search.',400);
        const page=local.search(input);return {...page,sources:page.sources.filter(s=>!isContentSourceRetired(s.id))};
      }
      ready();const id=selected(query);
      if(!enabled(id))throw failure('CONTENT_DISABLED','This paper source is not connected here. Choose another source or open its website.',503,rows(id,query));
      if(query.languages.length&&id!=='openalex')throw failure('CONTENT_FILTER_UNSUPPORTED','Choose wide paper search for language filtering.',400,rows(id,query,'unsupported'));
      const binding=hash({...query,cursor:null,retrySource:null,profile:PROFILE,id,policy:CONTENT_POLICY_REVISION});
      const state=query.cursor?decode(query.cursor,binding,id):{profile:PROFILE,id,binding,native:'*',expires:now()+900000,page:0,history:[]};
      if(query.retrySource&&query.retrySource!==id)throw failure('CONTENT_INVALID_REQUEST','Retry the selected source or start a new search.',400);
      for(const row of rows(id,query,'searching'))onSource(row);
      const page=await requestSource(id,query,{sourceCursor:state.native,signal:sourceSignal(signal)});
      if(!Array.isArray(page.items)||page.items.length>query.limit)throw failure('CONTENT_UNAVAILABLE','This paper source returned an invalid page.');
      const items=[],seen=new Set();let hiddenUnclear=0;
      for(const raw of page.items){
        if(seen.has(raw.key)||!query.kinds.includes(raw.kind)||query.languages.length&&!raw.languages?.some(l=>query.languages.includes(l)))continue;
        seen.add(raw.key);const item=present(raw,query);
        if(isReadableAccess(item.access)&&(query.access!=='free_full_text'||item.access==='free_full_text'))items.push(item);
        else if(!item.locations.length||item.locations.some(l=>['unknown','metadata_only'].includes(observedAccess(l,{...query,now:now()})))){
          hiddenUnclear++;if(query.includeUnclear)items.push(item);
        }
      }
      const native=page.nextSourceCursor;
      if(native!=null&&(typeof native!=='string'||native.length>1500))throw failure('CONTENT_UNAVAILABLE','This source returned an invalid continuation.');
      const history=[...state.history,hash(state.native)].slice(-8);
      const truncated=Boolean(native&&(history.includes(hash(native))||state.page>=49));
      const sources=rows(id,query,'ok',items.length,truncated?{truncated:true}:{});
      for(const row of sources)onSource(row);
      return {items,sources,hiddenUnclear,searchMode:'live',coverage:'partial',policyRevision:CONTENT_POLICY_REVISION,
        nextCursor:native&&!truncated?encode({...state,native,history,page:state.page+1}):null,sessionCursor:encode(state)};
    },
    async resolve(input,{signal}={}){
      const request=parseContentResolve(input),id=request.parsed.sourceId;
      if(KNOWLEDGE_SOURCES[id])return expanded.resolve(input,{signal});
      if(id==='storyweaver')return pilot.resolve(input);
      if(!SOURCES[id])return local.resolve(input);
      ready();
      if(!enabled(id))throw failure('CONTENT_DISABLED','This paper source is not connected here.');
      const query={query:'record lookup',limit:1};
      const page=await requestSource(id,query,{exactRecord:request.parsed,signal:sourceSignal(signal)});
      const item=page.items?.find(item=>item.key===request.key);
      if(!item)throw failure('CONTENT_NOT_FOUND','This paper record could not be found at the source.',404);
      return {item:present(item,request),policyRevision:CONTENT_POLICY_REVISION};
    },
  };
}
