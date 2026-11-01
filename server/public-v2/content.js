import { createContentService } from '../services/content/search.js';

export function mountContentRoutes(router, service = createContentService()) {
  for (const operation of ['search','resolve']) router.post(`/content/${operation}`, async (req,res) => {
    try { return res.json(await service[operation](req.body)); }
    catch (error) {
      const known = ['CONTENT_INVALID_REQUEST','CONTENT_CURSOR_INVALID','CONTENT_CURSOR_EXPIRED','CONTENT_NOT_FOUND','CONTENT_DISABLED','CONTENT_UNAVAILABLE','CONTENT_FILTER_UNSUPPORTED'].includes(error?.code);
      const status = error?.code === 'CONTENT_INVALID_REQUEST' ? 400 : known ? error.status || 503 : 503;
      return res.status(status).json({error:{code:known?error.code:'CONTENT_UNAVAILABLE',
        message:known?error.message:'Free-content discovery is temporarily unavailable. Please try again.'},
        ...(known&&error.sources?{sources:error.sources,coverage:'unavailable'}:{})});
    }
  });
}
