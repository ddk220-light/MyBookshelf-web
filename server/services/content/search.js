import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createLocalContentService } from './localCatalog.js';
import { createEuropePmcAdapter } from './europePmc.js';
import { createRedisCoordinator } from './coordinator.js';
import { CONTENT_POLICY_REVISION, parseContentSearch, parseContentResolve, readingActions, observedAccess } from './contracts.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function error(code,message,status=503,sources) {return Object.assign(new Error(message),{code,status,sources});}

export function createContentService({env=process.env,local=createLocalContentService(),
  paperAdapter=createEuropePmcAdapter(),coordinatorFactory=()=>createRedisCoordinator(),now=()=>Date.now()}={}) {
  let coordinator;
  function live() {
    if(env.CONTENT_DISCOVERY_ENABLED!=='true'||env.CONTENT_EUROPEPMC_ENABLED!=='true')throw error('CONTENT_DISABLED','Paper search is not connected yet.');
    const dailyLimit=Number(env.CONTENT_EUROPEPMC_DAILY_LIMIT),perMinute=Number(env.CONTENT_EUROPEPMC_PER_MINUTE);
    if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100000||!Number.isInteger(perMinute)||perMinute<1||perMinute>300
      ||typeof env.CONTENT_CURSOR_SECRET!=='string'||env.CONTENT_CURSOR_SECRET.length<32)throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');
    coordinator ||= coordinatorFactory();
    if(!coordinator?.shared)throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');
    return {dailyLimit,perMinute,concurrency:2};
  }
  function present(item,context) {return {...item,readingActions:readingActions(item,{...context,now:now()}),
    access:item.locations.some(l=>observedAccess(l,{...context,now:now()})==='free_full_text')?'free_full_text':'unknown'};}
  function sign(payload){return createHmac('sha256',env.CONTENT_CURSOR_SECRET).update(payload).digest('base64url');}
  function encode(state){const payload=Buffer.from(JSON.stringify(state)).toString('base64url');return payload+'.'+sign(payload);}
  function decode(cursor,binding) {
    try {
      const [payload,signature,extra]=cursor.split('.');
      if(extra||!/^[A-Za-z0-9_-]{43}$/.test(signature||''))throw Error();
      if(!timingSafeEqual(Buffer.from(signature),Buffer.from(sign(payload))))throw Error();
      const state=JSON.parse(Buffer.from(payload,'base64url').toString());
      if(state.binding!==binding||state.expires<=now()||!/^[a-f0-9]{64}$/.test(state.previous))throw Error();
      return state;
    }catch{throw error('CONTENT_CURSOR_EXPIRED','This paper search has expired or changed. Search again to continue.',409);}
  }
  async function coordinated(pageKey,policy,work) {
    let value;
    try{value=await coordinator.run('europepmc',pageKey,policy,work);}
    catch(e){value={status:e.sourceStatus||'unavailable'};}
    if(value.status!=='ok')throw error('CONTENT_UNAVAILABLE','Paper search could not finish. This does not mean there are no free papers.',503,
      [{id:'europepmc',name:'Europe PMC',status:value.status,returned:0,retryable:true}]);
    return value.page;
  }
  return {
    locate(input){return local.locate(input);},
    async search(input) {
      const query=parseContentSearch(input);
      if(query.kinds.includes('book')||query.kinds.includes('learning_resource'))return local.search(input);
      const policy=live();
      if(query.languages.length)throw error('CONTENT_FILTER_UNSUPPORTED','Language filtering is not supported by this paper source yet.',400,
        [{id:'europepmc',status:'unsupported',returned:0}]);
      const binding=hash({...query,cursor:null,policy:CONTENT_POLICY_REVISION,source:'europepmc'});
      let sourceCursor='*',expires=now()+900000,emittedKeys=[],cursorHashes=[];
      if(query.cursor){
        const state=decode(query.cursor,binding);expires=state.expires;
        let prior;
        try{prior=await coordinator.get('europepmc',state.previous);}catch{throw error('CONTENT_UNAVAILABLE','Paper search is temporarily unavailable.');}
        if(!prior?.nextSourceCursor)throw error('CONTENT_CURSOR_EXPIRED','This paper search has expired. Search again to continue.',409);
        sourceCursor=prior.nextSourceCursor;
        emittedKeys=prior.emittedKeys||[];cursorHashes=prior.cursorHashes||[];
      }
      const pageKey=hash({binding,sourceCursor});
      const page=await coordinated(pageKey,policy,async()=>{
        const result=await paperAdapter.search(query,{sourceCursor});
        const seen=new Set(emittedKeys);
        const unique=result.items.filter(item=>{if(seen.has(item.key))return false;seen.add(item.key);return true;});
        const history=[...cursorHashes,hash(sourceCursor)];
        const truncated=history.length>=50||seen.size>=1000||Boolean(result.nextSourceCursor&&history.includes(hash(result.nextSourceCursor)));
        return {...result,items:unique,emittedKeys:[...seen].slice(0,1000),cursorHashes:history,
          nextSourceCursor:truncated?null:result.nextSourceCursor,truncated};
      });
      let hiddenUnclear=0;
      const seen=new Set();
      const items=page.items.filter(i=>query.kinds.includes(i.kind)).map(i=>present(i,query)).filter(item=>{
        if(seen.has(item.key))return false;seen.add(item.key);
        if(item.access==='free_full_text')return true;
        if(item.locations.some(l=>['unknown','metadata_only'].includes(observedAccess(l,{...query,now:now()})))){hiddenUnclear++;return query.includeUnclear;}
        return false;
      });
      return {items,hiddenUnclear,nextCursor:page.nextSourceCursor?encode({binding,previous:pageKey,expires}):null,
        coverage:'partial',policyRevision:CONTENT_POLICY_REVISION,sources:[{id:'europepmc',name:'Europe PMC',status:'ok',returned:items.length,
          scope:'Biomedical literature',observedAt:page.observedAt,truncated:page.truncated},
          ...['doaj','arxiv','openalex'].map(id=>({id,status:'disabled',returned:0}))]};
    },
    async resolve(input) {
      const request=parseContentResolve(input);
      if(request.parsed.sourceId==='gutenberg')return local.resolve(input);
      const policy=live();
      const pageKey=hash({key:request.key,country:request.country,languages:request.languages,policy:CONTENT_POLICY_REVISION});
      const page=await coordinated(pageKey,policy,()=>paperAdapter.search({query:'record lookup',limit:1},{exactRecord:request.parsed}));
      const item=page.items.find(i=>i.key===request.key);
      if(!item)throw error('CONTENT_NOT_FOUND','This paper record could not be found at the source.',404);
      return {item:present(item,request),policyRevision:CONTENT_POLICY_REVISION};
    },
  };
}
