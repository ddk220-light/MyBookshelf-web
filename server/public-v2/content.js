import { createContentService } from '../services/content/search.js';

export function mountContentRoutes(router, service = createContentService()) {
  for (const operation of ['search','resolve','locate']) router.post(`/content/${operation}`, async (req,res) => {
    let streaming=false;
    const controller=new AbortController();res.on('close',()=>controller.abort());
    const stream=operation==='search'&&req.get('Accept')?.includes('application/x-ndjson');
    const write=value=>{if(!res.writableEnded&&!res.destroyed)res.write(JSON.stringify(value)+'\n');};
    const onSource=source=>{
      if(!stream||res.destroyed)return;
      if(!streaming){res.type('application/x-ndjson');res.set('Cache-Control','no-store');streaming=true;}
      write({type:'source',source});
    };
    try {
      const result=await service[operation](req.body,{onSource,signal:controller.signal});
      if(streaming){write({type:'result',result});return res.end();}
      return res.json(result);
    }
    catch (error) {
      const known = ['CONTENT_INVALID_REQUEST','CONTENT_CURSOR_INVALID','CONTENT_CURSOR_EXPIRED','CONTENT_NOT_FOUND','CONTENT_DISABLED','CONTENT_UNAVAILABLE','CONTENT_FILTER_UNSUPPORTED','CONTENT_COLLECTION_UNAVAILABLE'].includes(error?.code);
      const status = error?.code === 'CONTENT_INVALID_REQUEST' ? 400 : known ? error.status || 503 : 503;
      const body={error:{code:known?error.code:'CONTENT_UNAVAILABLE',
        message:known?error.message:'Free-content discovery is temporarily unavailable. Please try again.'},
        ...(known&&error.sources?{sources:error.sources,coverage:'unavailable'}:{})};
      if(streaming){write({type:'error',status,...body});return res.end();}
      return res.status(status).json(body);
    }
  });
}
