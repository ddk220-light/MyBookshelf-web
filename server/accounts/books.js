import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { parsePublicBookKey } from '../public-v2/contracts.js';
import { sanitizePublicCoverUrl } from '../public-v2/metadata.js';
import { strictObject } from './validation.js';
import { operation,operationId,revision,invalid,conflict,versions } from './operations.js';
import { AccountRequestError } from './security.js';

const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value);
export function bookSnapshot(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!parsePublicBookKey(value.bookKey))throw invalid('This book reference is invalid.');
  if(!text(value.title,500)||!value.title.trim()||!Array.isArray(value.authors)||value.authors.length>20||!value.authors.every(a=>text(a,240)))throw invalid('This book’s display details are too large or invalid.');
  const snapshot={title:value.title,authors:value.authors};
  if(value.coverUrl){if(!text(value.coverUrl,2048))throw invalid('This cover link is too large.');const safe=sanitizePublicCoverUrl(value.coverUrl);if(safe)snapshot.coverUrl=safe;}
  if(value.isbn13&&/^\d{13}$/.test(value.isbn13))snapshot.isbn13=value.isbn13;
  if(value.metadataStatus==='unavailable'||value.metadataStatus==='missing')snapshot.metadataStatus=value.metadataStatus;
  return {bookKey:value.bookKey,snapshot};
}
export async function reference(client,bookKey){
  const digest=createHash('sha256').update(bookKey).digest();
  const inserted=await client.query('INSERT INTO book_refs(book_key,key_digest) VALUES($1,$2) ON CONFLICT(key_digest) DO NOTHING RETURNING id,book_key',[bookKey,digest]);
  const found=inserted.rows[0]??(await client.query('SELECT id,book_key FROM book_refs WHERE key_digest=$1',[digest])).rows[0];
  if(!found||found.book_key!==bookKey)throw new AccountRequestError(503,'REFERENCE_UNAVAILABLE','This book could not be saved.');
  return found.id;
}
export const bookDTO=(row)=>({...row.display_snapshot,referenceId:row.reference_id,bookKey:row.book_key,...(row.saved_at?{savedAt:new Date(row.saved_at).toISOString()}:{}),...(row.viewed_at?{viewedAt:new Date(row.viewed_at).toISOString()}:{} )});

export function createShelfActions({owned,secret}){
  const sign=(data)=>createHmac('sha256',secret).update('shelf-cursor:'+data).digest('base64url');
  const encode=(value)=>{const data=Buffer.from(JSON.stringify(value)).toString('base64url');return data+'.'+sign(data);};
  const decode=(input,id,r)=>{
    try{
      if(typeof input!=='string'||input.length>1024)throw Error();
      const [data,signature,...extra]=input.split('.');const expected=sign(data);
      if(extra.length||typeof signature!=='string'||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw Error();
      const value=JSON.parse(Buffer.from(data,'base64url').toString());
      if(value.owner!==id||!Number.isFinite(Date.parse(value.at))||!value.id)throw Error();
      if(value.r!==r)throw conflict();return value;
    }catch(error){if(error instanceof AccountRequestError)throw error;throw invalid('This shelf page is invalid. Refresh your shelf.');}
  };
  return {
    async books(query,identity){
      const limit=query.limit===undefined?50:Number(query.limit);
      if(!Number.isInteger(limit)||limit<1||limit>100||Object.keys(query).some(k=>!['cursor','limit'].includes(k)))throw invalid('Choose a shelf page size between 1 and 100.');
      return owned(identity,async(client,settings,id)=>{
        const cursor=query.cursor?decode(query.cursor,id,Number(settings.shelf_revision)):null;
        const rows=(await client.query(`SELECT b.*,r.book_key,to_char(b.saved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM user_books b JOIN book_refs r ON r.id=b.reference_id WHERE b.user_id=$1
          ${cursor?'AND (b.saved_at,b.reference_id)<($3::timestamptz,$4::uuid)':''} ORDER BY b.saved_at DESC,b.reference_id DESC LIMIT $2`,cursor?[id,limit+1,cursor.at,cursor.id]:[id,limit+1])).rows;
        const page=rows.slice(0,limit),last=page.at(-1);
        return {books:page.map(bookDTO),...versions(settings),nextCursor:rows.length>limit?encode({owner:id,r:Number(settings.shelf_revision),at:last.cursor_at,id:last.reference_id}):null};
      });
    },
    async save(body,identity){
      strictObject(body,['book','shelfRevision','operationId']);const book=bookSnapshot(body.book);revision(body.shelfRevision);
      return owned(identity,(client,settings,id)=>operation(client,id,'book-save',body,async()=>{
        if(Number(settings.shelf_revision)!==body.shelfRevision)throw conflict();
        const ref=await reference(client,book.bookKey);
        const existing=(await client.query('SELECT saved_at FROM user_books WHERE user_id=$1 AND reference_id=$2',[id,ref])).rows[0];
        if(existing)return {status:'already-saved',referenceId:ref,savedAt:new Date(existing.saved_at).toISOString(),...versions(settings)};
        if((await client.query('SELECT count(*)::int AS n FROM user_books WHERE user_id=$1',[id])).rows[0].n>=1000)throw new AccountRequestError(422,'SHELF_FULL','Your account can save up to 1,000 books. Remove one before saving another.');
        const row=(await client.query('INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES($1,$2,$3) RETURNING saved_at',[id,ref,book.snapshot])).rows[0];
        const updated=(await client.query('UPDATE user_settings SET shelf_revision=shelf_revision+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        return {status:'saved',referenceId:ref,savedAt:new Date(row.saved_at).toISOString(),...versions(updated)};
      }));
    },
    async remove(body,identity,ref){
      operationId(ref);strictObject(body,['shelfRevision','operationId']);revision(body.shelfRevision);
      return owned(identity,(client,settings,id)=>operation(client,id,'book-remove',{...body,referenceId:ref},async()=>{
        if(Number(settings.shelf_revision)!==body.shelfRevision)throw conflict();
        const removed=(await client.query(`DELETE FROM user_books WHERE user_id=$1 AND reference_id=$2 RETURNING *,
          to_char(saved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS saved_at_exact`,[id,ref])).rows[0];
        const updated=(await client.query('UPDATE user_settings SET shelf_revision=shelf_revision+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        // The owner-private receipt holds the exact removed row for conditional undo.
        return {status:'removed',referenceId:ref,undoUntil:removed?new Date(Date.now()+10000).toISOString():null,removed:removed?{snapshot:removed.display_snapshot,savedAt:removed.saved_at_exact}:null,...versions(updated)};
      }));
    },
    async undo(body,identity){
      strictObject(body,['removalId','shelfRevision','operationId']);operationId(body.removalId);revision(body.shelfRevision);
      return owned(identity,(client,settings,id)=>operation(client,id,'book-undo',body,async()=>{
        if(Number(settings.shelf_revision)!==body.shelfRevision)throw conflict();
        const prior=(await client.query('SELECT result FROM account_operations WHERE user_id=$1 AND operation_id=$2',[id,body.removalId])).rows[0]?.result;
        if(prior?.status!=='removed'||!prior.removed||Date.parse(prior.undoUntil)<=Date.now()||prior.shelfRevision!==body.shelfRevision)throw new AccountRequestError(409,'UNDO_EXPIRED','This removal can no longer be undone.');
        await client.query('INSERT INTO user_books(user_id,reference_id,saved_at,display_snapshot) VALUES($1,$2,$3,$4)',[id,prior.referenceId,prior.removed.savedAt,prior.removed.snapshot]);
        const updated=(await client.query('UPDATE user_settings SET shelf_revision=shelf_revision+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        return {status:'restored',...versions(updated)};
      }));
    },
    async clear(body,identity){
      strictObject(body,['shelfRevision','operationId','confirmed']);revision(body.shelfRevision);
      if(body.confirmed!==true)throw invalid('Confirm before clearing your saved books.');
      return owned(identity,(client,settings,id)=>operation(client,id,'book-clear',body,async()=>{
        if(Number(settings.shelf_revision)!==body.shelfRevision)throw conflict();
        await client.query('DELETE FROM user_books WHERE user_id=$1',[id]);
        const updated=(await client.query('UPDATE user_settings SET shelf_revision=shelf_revision+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        return {status:'cleared',...versions(updated)};
      }));
    },
  };
}
