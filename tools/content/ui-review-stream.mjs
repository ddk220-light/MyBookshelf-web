import {createServer,request as httpRequest} from 'node:http';

// Local synthetic NDJSON source progress for browser review; never a live source.
export async function startReviewStream({upstreamOrigin}={}) {
  if(upstreamOrigin){const url=new URL(upstreamOrigin);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Review proxy requires a local HTTP preview');}
  const timers=new Set();
  const server=createServer((request,response)=>{
    if(upstreamOrigin&&new URL(request.url,'http://localhost').pathname!=='/api/v2/content/search'){
      const url=new URL(request.url,upstreamOrigin);
      const forwarded=httpRequest(url,{method:request.method,headers:{...request.headers,host:url.host}},upstream=>{
        response.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(response);
      });
      forwarded.on('error',()=>{response.writeHead(502);response.end();});
      request.pipe(forwarded);return;
    }
    response.setHeader('Access-Control-Allow-Origin','*');
    response.setHeader('Access-Control-Allow-Headers','content-type');
    if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
    response.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    response.flushHeaders();
    for(const source of [{id:'openalex',status:'ok',returned:12},{id:'europepmc',status:'searching',returned:0},{id:'arxiv',status:'queued',returned:0}])
      response.write(JSON.stringify({type:'source',source})+'\n');
    const timer=setTimeout(()=>{timers.delete(timer);response.end(JSON.stringify({type:'error',status:503,error:{code:'CONTENT_UNAVAILABLE',message:'Synthetic timed review ended.'}})+'\n');},4900);
    timers.add(timer);response.on('close',()=>{clearTimeout(timer);timers.delete(timer);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,url:origin+'/api/v2/content/search',async close(){for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
