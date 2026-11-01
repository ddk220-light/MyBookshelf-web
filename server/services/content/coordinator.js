import { randomUUID } from 'node:crypto';

// One atomic reservation covers cache/coalescing, daily/minute quota and leased
// concurrency. Redis TIME, not a request-supplied clock, controls resets.
export const RESERVE = `
local cached = redis.call('GET', KEYS[4])
if cached then return {'cached', cached} end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local day = math.floor(now / 86400000)
local minute = math.floor(now / 60000)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if redis.call('EXISTS', KEYS[5]) == 1 then return {'queued', ''} end
local dayCount = 0
if tonumber(redis.call('HGET', KEYS[1], 'period')) == day then dayCount = tonumber(redis.call('HGET', KEYS[1], 'count') or '0') end
if dayCount >= tonumber(ARGV[2]) then return {'quota_exhausted', ''} end
local minuteCount = 0
if tonumber(redis.call('HGET', KEYS[2], 'period')) == minute then minuteCount = tonumber(redis.call('HGET', KEYS[2], 'count') or '0') end
if minuteCount >= tonumber(ARGV[3]) then return {'throttled', ''} end
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[4]) then return {'queued', ''} end
redis.call('SET', KEYS[5], ARGV[1], 'PX', ARGV[5])
redis.call('ZADD', KEYS[3], now + tonumber(ARGV[5]), ARGV[1])
redis.call('PEXPIRE', KEYS[3], ARGV[5])
redis.call('HSET', KEYS[1], 'period', day, 'count', dayCount + 1)
redis.call('PEXPIREAT', KEYS[1], (day + 1) * 86400000)
redis.call('HSET', KEYS[2], 'period', minute, 'count', minuteCount + 1)
redis.call('PEXPIREAT', KEYS[2], (minute + 1) * 60000)
return {'reserved', ARGV[1]}
`;

export const FINISH = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[2])
if ARGV[2] ~= '' then redis.call('SET', KEYS[3], ARGV[2], 'PX', ARGV[3]) end
return 1
`;

export function createRedisCoordinator({url=process.env.CONTENT_REDIS_REST_URL,
  token=process.env.CONTENT_REDIS_REST_TOKEN,fetchImpl=globalThis.fetch,
  namespace='mybookshelf:fcd:v1',allowInsecureLocal=false}={}) {
  if (!url || !token) return null;
  const parsed=new URL(url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.protocol!=='https:' && !(allowInsecureLocal && parsed.protocol==='http:' && ['localhost','127.0.0.1'].includes(parsed.hostname)))) throw new Error('CONTENT_COORDINATOR_CONFIG_INVALID');
  if(!/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace))throw new Error('CONTENT_COORDINATOR_CONFIG_INVALID');
  async function command(args) {
    try {
      const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(1000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
      if(!response.ok || Number(response.headers.get('content-length'))>4*1024*1024)throw Error();
      const reader=response.body?.getReader();
      if(!reader)throw Error();
      let size=0;const chunks=[];
      try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>4*1024*1024)throw Error();chunks.push(value);}}
      finally{await reader.cancel().catch(()=>{});}
      const text=Buffer.concat(chunks).toString('utf8');
      const result=JSON.parse(text);
      if(result.error)throw Error();
      return result.result;
    }catch{throw Object.assign(new Error('Shared content coordination is unavailable.'),{sourceStatus:'unavailable'});}
  }
  function keys(source,pageKey) {
    if(source!=='europepmc'||!/^[a-f0-9]{64}$/.test(pageKey))throw Error('CONTENT_COORDINATOR_KEY_INVALID');
    const prefix=namespace+':{'+source+'}:';
    return {daily:prefix+'daily',minute:prefix+'minute',active:prefix+'active',cache:prefix+'page:'+pageKey,lock:prefix+'lock:'+pageKey};
  }
  return {shared:true,
    async get(source,pageKey) {
      const value=await command(['GET',keys(source,pageKey).cache]);
      return value?JSON.parse(value):null;
    },
    async run(source,pageKey,policy,work) {
      const k=keys(source,pageKey);
      if(!Number.isInteger(policy.dailyLimit)||policy.dailyLimit<1||!Number.isInteger(policy.perMinute)||policy.perMinute<1
        ||!Number.isInteger(policy.concurrency)||policy.concurrency<1||policy.concurrency>10) throw Error('CONTENT_BUDGET_INVALID');
      const lease=randomUUID();
      const result=await command(['EVAL',RESERVE,5,k.daily,k.minute,k.active,k.cache,k.lock,lease,policy.dailyLimit,policy.perMinute,policy.concurrency,5000]);
      if(result[0]==='cached')return {status:'ok',cached:true,page:JSON.parse(result[1])};
      if(result[0]!=='reserved')return {status:result[0]};
      let page;
      try {
        page=await work();
        const serialized=JSON.stringify(page);
        if(Buffer.byteLength(serialized)>1024*1024)throw Error('CONTENT_PAGE_TOO_LARGE');
        const committed=await command(['EVAL',FINISH,3,k.active,k.lock,k.cache,lease,serialized,900000]);
        if(committed!==1)throw Error('CONTENT_LEASE_EXPIRED');
        return {status:'ok',cached:false,page};
      }catch(error){
        await command(['EVAL',FINISH,3,k.active,k.lock,k.cache,lease,'',0]).catch(()=>{});
        throw error;
      }
    },
  };
}
