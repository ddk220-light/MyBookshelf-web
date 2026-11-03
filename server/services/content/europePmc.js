import { contentKey, normalizeDoi, safeWebUrl } from './contracts.js';

export const EUROPE_PMC_SEARCH = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const MAX_BYTES = 2 * 1024 * 1024;
function sourceError(status, retryAfterSeconds) { return Object.assign(new Error('The paper source could not answer.'), { sourceStatus:status,retryAfterSeconds }); }
function clean(value, limit=500) { return typeof value === 'string' ? value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,limit) : ''; }
function quoted(value) { return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"'; }

export function europePmcQuery(query) {
  const doi = normalizeDoi(query);
  if (doi) return `DOI:${quoted(doi)} AND OPEN_ACCESS:Y`;
  if (/^PMC\d+$/i.test(query)) return `PMCID:${quoted(query.toUpperCase())} AND OPEN_ACCESS:Y`;
  return `${quoted(query)} AND OPEN_ACCESS:Y`;
}

export function mapEuropePmc(record, observedAt) {
  if (!record || typeof record.id !== 'string' || typeof record.source !== 'string' || !clean(record.title)) return null;
  let key;
  try { key = contentKey('europepmc',record.id,record.source); } catch { return null; }
  const types = (record.pubTypeList?.pubType || []).filter(t=>typeof t === 'string');
  if (record.source === 'PAT' || types.some(t=>/dataset|software/i.test(t))) return null;
  const kind = types.some(t=>/preprint/i.test(t)) || record.source === 'PPR' ? 'preprint'
    : types.some(t=>/chapter/i.test(t)) ? 'chapter' : 'article';
  const locations = (record.fullTextUrlList?.fullTextUrl || []).flatMap((entry,index)=> {
    const url = safeWebUrl(entry.url);
    if (!url) return [];
    // Neither an OA flag on the item nor a DOI URL makes a subscription
    // location free. Contradictory record/location flags become unknown.
    const access = entry.availabilityCode === 'S' ? 'restricted'
      : entry.availabilityCode === 'OA' && record.isOpenAccess === 'Y' ? 'free_full_text' : 'unknown';
    const host = entry.site === 'Europe_PMC' ? 'Europe PMC' : clean(entry.site,100) || new URL(url).hostname;
    return [{id:`europepmc:${record.source}:${record.id}:${index}`,host,landingUrl:url,
      ...(entry.documentStyle === 'html' ? {readerUrl:url}:{}),
      downloads:entry.documentStyle === 'pdf' ? [{url,mimeType:'application/pdf'}]:[],access,
      ...(clean(record.license) ? {license:{id:clean(record.license,100)}}:{}),
      evidence:{sourceId:'europepmc',field:'fullTextUrl.availabilityCode + isOpenAccess',observedAt}}];
  });
  const identifiers = [{scheme:'europepmc',value:record.source+':'+record.id}];
  const doi = normalizeDoi(record.doi);
  if (doi) identifiers.push({scheme:'doi',value:doi});
  if (/^PMC\d+$/.test(record.pmcid || '')) identifiers.push({scheme:'pmcid',value:record.pmcid});
  const authors = (record.authorList?.author || []).flatMap(a=>clean(a.fullName,240)?[{name:clean(a.fullName,240),role:'author'}]:[]);
  return {key,kind,title:clean(record.title),contributors:authors.slice(0,100),identifiers,
    languages:[({eng:'en',fre:'fr',fra:'fr',ger:'de',deu:'de',spa:'es',hin:'hi',tam:'ta'})[record.language] || clean(record.language,30) || 'und'],
    originalLanguages:clean(record.language,30)?[clean(record.language,30)]:[],subjects:[],relations:[],locations,
    ...(record.journalInfo?.journal?.title ? {container:{title:clean(record.journalInfo.journal.title)}}:{}),
    ...(clean(record.firstPublicationDate) ? {publishedAt:clean(record.firstPublicationDate,30)}:{}),
    ...(record.isRetracted === 'Y' ? {flags:['source_reports_retracted']}:{}),
    provenance:[{sourceId:'europepmc',sourceRecordId:record.source+':'+record.id,
      recordUrl:`https://europepmc.org/article/${record.source}/${encodeURIComponent(record.id)}`,
      retrievedAt:observedAt,mappingVersion:'europepmc-core-v1'}]};
}

export function createEuropePmcAdapter({fetchImpl=globalThis.fetch, now=()=>Date.now(),
  contact='deepakdhanavel@gmail.com'}={}) {
  return {async search(query,{sourceCursor='*',signal,exactRecord}={}) {
    // Cursor comes only from a verified server-signed token, never a URL supplied
    // by the reader. It is still bounded before constructing this fixed-origin URL.
    if (typeof sourceCursor !== 'string' || sourceCursor.length > 1500) throw sourceError('unavailable');
    const url = new URL(EUROPE_PMC_SEARCH);
    let providerQuery=europePmcQuery(query.query);
    if(exactRecord) {
      contentKey('europepmc',exactRecord.recordId,exactRecord.recordSource);
      providerQuery=`EXT_ID:${quoted(exactRecord.recordId)} AND SRC:${exactRecord.recordSource} AND OPEN_ACCESS:Y`;
    }
    url.search = new URLSearchParams({query:providerQuery,format:'json',resultType:'core',
      pageSize:String(query.limit),cursorMark:sourceCursor,email:contact}).toString();
    try {
      const timeout = AbortSignal.timeout(8000);
      const response = await fetchImpl(url,{redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,
        headers:{Accept:'application/json','User-Agent':`MyBookshelf/1.0 (non-commercial; mailto:${contact})`}});
      if (response.status === 429) throw sourceError('throttled',Math.min(3600,Math.max(1,Number(response.headers.get('retry-after'))||60)));
      if (!response.ok) throw sourceError('unavailable');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw sourceError('unavailable');
      if (!response.body) throw sourceError('unavailable');
      const reader = response.body.getReader();
      const chunks=[];let bytes=0;
      try {
        while (true) { const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
          if(bytes>MAX_BYTES)throw sourceError('unavailable');chunks.push(value); }
      } finally { await reader.cancel().catch(()=>{}); }
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const records=data.resultList?.result;
      if(!Array.isArray(records)||records.length>query.limit)throw sourceError('unavailable');
      const observedAt=new Date(now()).toISOString();
      const seen=new Set();
      const items=records.map(r=>mapEuropePmc(r,observedAt)).filter(item=>item&&!seen.has(item.key)&&seen.add(item.key));
      const next = typeof data.nextCursorMark === 'string' && data.nextCursorMark !== sourceCursor
        && data.nextCursorMark.length<=1500 && records.length ? data.nextCursorMark : null;
      return {items,nextSourceCursor:next,observedAt};
    } catch(error) {
      if(error.sourceStatus)throw error;
      throw sourceError(error.name === 'TimeoutError'||error.name === 'AbortError'?'timeout':'unavailable');
    }
  }};
}
