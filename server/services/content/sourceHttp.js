// Adapters provide fixed URLs. Never pass a caller-supplied origin here.
export const contact = 'deepakdhanavel@gmail.com';
export function sourceError(status, retryAfterSeconds) {
  return Object.assign(new Error('The paper source could not answer.'), {sourceStatus:status,retryAfterSeconds});
}
export function clean(value, limit=500) {
  return typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,limit):'';
}
export function sourceSignal(signal) {
  const timeout=AbortSignal.timeout(8000);
  return signal?AbortSignal.any([signal,timeout]):timeout;
}
export async function sourceText(fetchImpl,url,{signal,accept='application/json',maxBytes=2*1024*1024}={}) {
  try {
    const response=await fetchImpl(url,{redirect:'error',signal,headers:{Accept:accept,'User-Agent':`MyBookshelf/1.0 (non-commercial; mailto:${contact})`}});
    if(response.status===429)throw sourceError('throttled',Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60)));
    if(response.status===404)throw sourceError('not_found');
    if(!response.ok||Number(response.headers.get('content-length'))>maxBytes||!response.body)throw sourceError('unavailable');
    const reader=response.body.getReader();let size=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw sourceError('unavailable');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    return Buffer.concat(chunks).toString('utf8');
  }catch(error){if(error.sourceStatus)throw error;throw sourceError(signal?.aborted?'timeout':'unavailable');}
}
export async function sourceJson(fetchImpl,url,options){
  const text=await sourceText(fetchImpl,url,options);
  try{return JSON.parse(text);}catch{throw sourceError('unavailable');}
}
