import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {sourceError} from './sourceHttp.js';
const base=new URL('../../data/content/',import.meta.url);
const loaded=new Map();
const words=value=>String(value).normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu)||[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readCompleteCatalog(id){
 if(loaded.has(id))return loaded.get(id);
 const manifest=JSON.parse(readFileSync(new URL('complete-catalogs.json',base),'utf8'));
 const meta=manifest.catalogs[id];if(!meta||meta.file!==id+'-complete.json.gz')throw sourceError('unavailable');
 const packed=readFileSync(new URL(meta.file,base));if(sha(packed)!==meta.compressedSha256)throw sourceError('unavailable');
 const bytes=gunzipSync(packed,{maxOutputLength:64*1024*1024});if(sha(bytes)!==meta.recordsSha256)throw sourceError('unavailable');
 const rows=JSON.parse(bytes);if(rows.length!==meta.records||new Set(rows.map(r=>r.id)).size!==rows.length)throw sourceError('unavailable');
 const catalog={meta,rows:rows.map(row=>({...row,words:words(row.title+' '+(row.artist||''))}))};loaded.set(id,catalog);return catalog;
}
export function searchCompleteCatalog(id,query,start,limit){
 const {meta,rows}=readCompleteCatalog(id),terms=words(query);
 const matches=terms.length?rows.filter(row=>terms.every(t=>row.words.some(w=>w===t||t.length>3&&w.startsWith(t)))):[];
 return {meta,records:matches.slice(start,start+limit),next:start+limit<matches.length?start+limit:null};
}
