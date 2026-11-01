import {afterEach,expect,it,vi} from 'vitest';
import {contentApi} from './contentApi';
const source={id:'doaj',status:'searching',returned:0};
const page={items:[],sources:[{...source,status:'ok'}],nextCursor:null,coverage:'partial',hiddenUnclear:0,policyRevision:'fixture'};
afterEach(()=>vi.unstubAllGlobals());
function stream(events:unknown[],truncate=false){
  const bytes=new TextEncoder().encode(events.map(event=>JSON.stringify(event)+'\n').join(''));
  return new Response(new ReadableStream({start(controller){
    // Split a Hindi character and JSON token across transport chunks.
    for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();
  }}),{headers:{'Content-Type':truncate?'application/x-ndjson':'application/x-ndjson; charset=utf-8'}});
}
it('streams source progress before the final committed page and accepts JSON fixture fallback',async()=>{
  const progress=vi.fn();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(stream([{type:'source',source:{...source,name:'हिन्दी'}},{type:'result',result:page}])));
  expect(await contentApi.search('fixture',['article'],{},undefined,progress)).toEqual(page);
  expect(progress).toHaveBeenCalledWith({...source,name:'हिन्दी'});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(page))));
  expect(await contentApi.search('fixture',['article'],{},undefined,progress)).toEqual(page);
});
it('a stream ending after progress or with an explicit source error never becomes an empty result',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(stream([{type:'source',source}],true)));
  await expect(contentApi.search('fixture',['article'],{},undefined,vi.fn())).rejects.toMatchObject({code:'CONTENT_UNAVAILABLE'});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(stream([{type:'source',source},{type:'error',status:503,error:{code:'CONTENT_UNAVAILABLE',message:'Source timeout'},sources:[{...source,status:'timeout'}]}])));
  await expect(contentApi.search('fixture',['article'],{},undefined,vi.fn())).rejects.toMatchObject({status:503,sources:[{...source,status:'timeout'}]});
});
