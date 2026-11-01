import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {createLocalContentService} from './localCatalog.js';
import {createEuropePmcAdapter} from './europePmc.js';
import {createDoajAdapter} from './doaj.js';
import {createArxivAdapter} from './arxiv.js';
import {createOpenalexAdapter} from './openalex.js';
import {createRedisCoordinator} from './coordinator.js';
import {sourceSignal} from './sourceHttp.js';
import {createChildrenService} from './children.js';
import {CONTENT_POLICY_REVISION,parseContentSearch,parseContentResolve,parseContentKey,normalizeDoi,readingActions,observedAccess} from './contracts.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function error(code,message,status=503,sources){return Object.assign(new Error(message),{code,status,sources});}
const SOURCES={europepmc:{name:'Europe PMC',env:'EUROPEPMC',initial:'*',scope:'Biomedical literature'},
  doaj:{name:'DOAJ',env:'DOAJ',initial:'1',scope:'OA journal articles'},
  arxiv:{name:'arXiv',env:'ARXIV',initial:'0',scope:'Preprints'},
  openalex:{name:'Wide paper search',env:'OPENALEX',initial:'*',scope:'Multidisciplinary literature'}};
const sessionPolicy={dailyLimit:1000000,perMinute:10000,concurrency:10};

export function createContentService({env=process.env,local=createLocalContentService(),paperAdapter=createEuropePmcAdapter(),
  adapters={},children,coordinatorFactory=()=>createRedisCoordinator(),now=()=>Date.now()}={}){
  const providers={europepmc:paperAdapter,doaj:createDoajAdapter(),arxiv:createArxivAdapter(),openalex:createOpenalexAdapter(),...adapters};
  let coordinator;
  const pilot=children||createChildrenService({enabled:env.CONTENT_DISCOVERY_ENABLED==='true'&&env.CONTENT_CHILDREN_ENABLED==='true',cursorSecret:env.CONTENT_CURSOR_SECRET,now});
  function policy(id){
    const prefix='CONTENT_'+SOURCES[id].env;
    const dailyLimit=Number(env[prefix+'_DAILY_LIMIT']),perMinute=Number(env[prefix+'_PER_MINUTE']);
    if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>(id==='openalex'?500:100000)
      ||!Number.isInteger(perMinute)||perMinute<1||perMinute>300)return null;
    return {dailyLimit,perMinute,concurrency:id==='arxiv'?1:2};
  }
  function enabled(id){return env['CONTENT_'+SOURCES[id].env+'_ENABLED']==='true';}
  function shared(){
    if(env.CONTENT_DISCOVERY_ENABLED!=='true')throw error('CONTENT_DISABLED','Free-content discovery is not connected yet.');
    if(typeof env.CONTENT_CURSOR_SECRET!=='string'||env.CONTENT_CURSOR_SECRET.length<32)throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');
    try{coordinator||=coordinatorFactory();}catch{}
    if(!coordinator?.shared)throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');
  }
  function selected(query){
    if(query.sourceIds)return query.sourceIds;
    const arxiv=query.query.replace(/^(?:arxiv:|https?:\/\/arxiv\.org\/abs\/)/i,'').trim();
    if(parseContentKey('fcd:v1:arxiv:'+arxiv.replace('/',':')))return ['arxiv'];
    if(/^PMC[1-9]\d*$/i.test(query.query))return ['europepmc'];
    if(normalizeDoi(query.query))return ['openalex','europepmc','doaj'].filter(enabled);
    const bio=/malaria|biomed|clinical|medicine|health|cancer|genom|protein|disease/i.test(query.query);
    const order=bio?['europepmc','doaj','openalex','arxiv']:['openalex','arxiv','doaj','europepmc'];
    return order.filter(enabled).slice(0,3);
  }
  function present(item,query){return {...item,readingActions:readingActions(item,{...query,now:now()}),
    access:item.locations.some(l=>observedAccess(l,{...query,now:now()})==='free_full_text')?'free_full_text':'unknown'};}
  function sign(payload){return createHmac('sha256',env.CONTENT_CURSOR_SECRET).update(payload).digest('base64url');}
  function encode(previous,binding,expires){const payload=Buffer.from(JSON.stringify({previous,binding,expires})).toString('base64url');return payload+'.'+sign(payload);}
  function decode(cursor,binding){
    try{
      const [payload,signature,extra]=cursor.split('.');
      if(extra||!/^[A-Za-z0-9_-]{43}$/.test(signature||'')||!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw Error();
      const state=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(state.binding!==binding||state.expires<=now()||!/^[a-f0-9]{64}$/.test(state.previous))throw Error();
      return state;
    }catch{throw error('CONTENT_CURSOR_EXPIRED','This paper search has expired or changed. Search again to continue.',409);}
  }
  function sourceRows(chosen,states,query){
    return Object.entries(SOURCES).map(([id,source])=>({id,name:source.name,returned:0,
      status:!enabled(id)?'disabled':!chosen.includes(id)?'not_selected':query.languages.length&&id!=='openalex'?'unsupported':!policy(id)?'unavailable':'ok',
      ...(states?.[id]?.status?{status:states[id].status}:{}),scope:source.scope,
      ...(states?.[id]?.truncated?{truncated:true}:{})}));
  }
  async function runSource(id,key,work){
    try{
      const result=await coordinator.run(id,key,policy(id),work);
      if(result.status==='ok'&&coordinator.cache)await coordinator.cache(id,result.page.items.map(item=>({key:hash({record:item.key,policy:CONTENT_POLICY_REVISION}),value:item})));
      return result;
    }
    catch(e){return {status:e.sourceStatus==='not_found'?'unavailable':e.sourceStatus||'unavailable'};}
  }
  return {
    locate(input){return local.locate(input);},
    async search(input,{onSource=()=>{},signal}={}){
      const query=parseContentSearch(input);
      if(query.collection==='children')return pilot.search(input);
      if(query.kinds.includes('book')||query.kinds.includes('learning_resource')){
        if(query.kinds.some(kind=>!['book','learning_resource'].includes(kind)))throw error('CONTENT_FILTER_UNSUPPORTED','Choose free books or paper kinds for this search.',400);
        if(query.sourceIds||query.retrySource)throw error('CONTENT_FILTER_UNSUPPORTED','Paper source filters do not apply to book search.',400);
        return local.search(input);
      }
      const chosen=selected(query);let states={};
      if(!chosen.length)throw error('CONTENT_DISABLED','Paper search is not connected yet.',503,sourceRows(chosen,states,query));
      try{shared();}catch(e){e.sources=sourceRows(chosen,Object.fromEntries(chosen.map(id=>[id,{status:'unavailable'}])),query);throw e;}
      const eligible=chosen.filter(id=>enabled(id)&&policy(id)&&(!query.languages.length||id==='openalex'));
      if(!eligible.length)throw error(query.languages.length?'CONTENT_FILTER_UNSUPPORTED':'CONTENT_UNAVAILABLE',
        query.languages.length?'Language filtering is not supported by these paper sources yet.':'Paper search is temporarily unavailable.',query.languages.length?400:503,sourceRows(chosen,states,query));
      for(const row of sourceRows(chosen,states,query))onSource({...row,...eligible.includes(row.id)?{status:'searching'}:{}});
      const binding=hash({...query,cursor:null,retrySource:null,policy:CONTENT_POLICY_REVISION,chosen});
      let previous='start',expires=now()+900000,seenKeys=[],hiddenUnclear=0,pageNumber=0;
      if(query.cursor){
        const token=decode(query.cursor,binding);previous=token.previous;expires=token.expires;
        let prior;try{prior=await coordinator.get('sessions',previous);}catch{throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');}
        if(!prior?.nextState)throw error('CONTENT_CURSOR_EXPIRED','This paper search has expired. Search again to continue.',409);
        ({states,seenKeys,hiddenUnclear,pageNumber}=structuredClone(prior.nextState));
      }
      if(query.retrySource&&!eligible.includes(query.retrySource))throw error('CONTENT_INVALID_REQUEST','This source cannot be retried for this search.',400);
      const pageKey=hash({binding,previous,retrySource:query.retrySource});
      const deadline=sourceSignal(signal);
      let outcome;
      try{outcome=await coordinator.run('sessions',pageKey,sessionPolicy,async()=>{
        const seen=new Set(seenKeys);
        const fetchSources=eligible.filter(id=>(!query.retrySource||query.retrySource===id)&&!states[id]?.queue?.length&&!states[id]?.done);
        await Promise.all(fetchSources.map(async id=>{
          const prior=states[id]||{cursor:SOURCES[id].initial,queue:[],history:[],done:false,status:'ok'};
          const sourceCursor=prior.cursor;
          const key=hash({...query,cursor:sourceCursor,retrySource:null,sourceIds:null,source:id,policy:CONTENT_POLICY_REVISION});
          const result=await runSource(id,key,()=>{
            if(deadline.aborted)throw Object.assign(Error('deadline'),{sourceStatus:'timeout'});
            return providers[id].search(query,{sourceCursor,signal:deadline});
          });
          if(result.status!=='ok'){states[id]={...prior,status:result.status};onSource({id,name:SOURCES[id].name,status:result.status,returned:0});return;}
          const native=result.page;const queue=[];
          for(const raw of native.items){
            if(seen.has(raw.key))continue;seen.add(raw.key);
            if(!query.kinds.includes(raw.kind)||query.languages.length&&!raw.languages?.some(l=>query.languages.includes(l)))continue;
            const item=present(raw,query);
            if(item.access==='free_full_text')queue.push(item);
            else if(!item.locations.length||item.locations.some(l=>['unknown','metadata_only'].includes(observedAccess(l,{...query,now:now()})))){
              hiddenUnclear++;if(query.includeUnclear)queue.push(item);
            }
          }
          const history=[...prior.history,hash(sourceCursor)];
          const cycle=Boolean(native.nextSourceCursor&&history.includes(hash(native.nextSourceCursor)));
          states[id]={cursor:native.nextSourceCursor,queue,history,status:'ok',observedAt:native.observedAt,
            done:!native.nextSourceCursor||cycle,truncated:cycle};
          onSource({id,name:SOURCES[id].name,status:'ok',returned:0});
        }));
        const rows=sourceRows(chosen,states,query);
        if(!eligible.some(id=>states[id]?.status==='ok'))throw error('CONTENT_UNAVAILABLE',
          'Paper search could not finish. This does not mean there are no free papers.',503,rows);
        const items=[];
        // Keep excess provider records in the shared session; slicing the merged
        // list would permanently skip the unreturned records on the next page.
        let added=true;
        const emitFrom=eligible.filter(id=>!query.retrySource||id===query.retrySource);
        while(items.length<query.limit&&added){added=false;for(const id of emitFrom){
          if(items.length===query.limit)break;
          if(states[id]?.queue?.length){items.push(states[id].queue.shift());added=true;}
        }}
        for(const row of rows){row.returned=items.filter(item=>item.provenance?.some(p=>p.sourceId===row.id)).length;row.retryable=['timeout','unavailable','queued','throttled'].includes(row.status);}
        const truncated=pageNumber>=49||seen.size>=1000;
        const hasNext=!truncated&&eligible.some(id=>states[id]?.queue?.length||states[id]?.status==='ok'&&!states[id]?.done);
        return {items,sources:rows,hiddenUnclear,expires,hasNext,coverage:'partial',policyRevision:CONTENT_POLICY_REVISION,
          nextState:{states,seenKeys:[...seen].slice(0,1000),hiddenUnclear,pageNumber:pageNumber+1}};
      });}catch(e){if(e.code)throw e;throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');}
      if(outcome.status!=='ok')throw error('CONTENT_UNAVAILABLE','Paper search could not finish. Please try again.',503,
        sourceRows(chosen,Object.fromEntries(eligible.map(id=>[id,{status:outcome.status}])),query));
      const page=outcome.page;const token=encode(pageKey,binding,page.expires);
      const {nextState,...publicPage}=page;
      return {...publicPage,nextCursor:page.hasNext?token:null,sessionCursor:token};
    },
    async resolve(input){
      const request=parseContentResolve(input),id=request.parsed.sourceId;
      if(id==='storyweaver')return pilot.resolve(input);
      if(!SOURCES[id])return local.resolve(input);
      shared();
      if(!enabled(id)||!policy(id))throw error('CONTENT_DISABLED','This paper source is not connected yet.');
      let cached;
      try{cached=await coordinator.get(id,hash({record:request.key,policy:CONTENT_POLICY_REVISION}));}
      catch{throw error('CONTENT_UNAVAILABLE','This paper source is temporarily unavailable.');}
      if(cached?.key===request.key)return {item:present(cached,request),policyRevision:CONTENT_POLICY_REVISION};
      const key=hash({key:request.key,country:request.country,languages:request.languages,policy:CONTENT_POLICY_REVISION});
      const result=await runSource(id,key,()=>providers[id].search({query:'record lookup',limit:1},{exactRecord:request.parsed,signal:sourceSignal()}));
      if(result.status!=='ok')throw error('CONTENT_UNAVAILABLE','This paper source could not answer.',503,[{id,status:result.status,returned:0}]);
      const item=result.page.items.find(i=>i.key===request.key);
      if(!item)throw error('CONTENT_NOT_FOUND','This paper record could not be found at the source.',404);
      return {item:present(item,request),policyRevision:CONTENT_POLICY_REVISION};
    },
  };
}
