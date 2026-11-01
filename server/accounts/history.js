import { strictObject } from './validation.js';
import { operation,operationId,revision,conflict,invalid,versions } from './operations.js';
import { bookSnapshot,reference,bookDTO } from './books.js';
import { AccountRequestError } from './security.js';

export const historySources=new Set(['camera','isbn','search','direct']);
export async function trimHistory(client,id){
  await client.query(`DELETE FROM recent_book_views WHERE user_id=$1 AND
    (viewed_at<=clock_timestamp()-interval '30 days' OR reference_id IN
    (SELECT reference_id FROM recent_book_views WHERE user_id=$1 ORDER BY viewed_at DESC,reference_id DESC OFFSET 50))`,[id]);
}
export function createHistoryActions({owned}){
  return {
    async history(query,identity){
      strictObject(query,[]);
      return owned(identity,async(client,settings,id)=>({
        books:(await client.query(`SELECT v.*,r.book_key FROM recent_book_views v JOIN book_refs r ON r.id=v.reference_id
          WHERE v.user_id=$1 AND v.viewed_at>clock_timestamp()-interval '30 days' ORDER BY v.viewed_at DESC,v.reference_id DESC LIMIT 50`,[id])).rows.map(bookDTO),...versions(settings),
      }));
    },
    async historySettings(body,identity){
      strictObject(body,['enabled','settingsRevision','operationId']);revision(body.settingsRevision);
      if(typeof body.enabled!=='boolean')throw invalid('Choose whether to keep reading history.');
      return owned(identity,(client,settings,id)=>operation(client,id,'history-settings',body,async()=>{
        if(Number(settings.revision)!==body.settingsRevision)throw conflict();
        const updated=settings.history_enabled===body.enabled?settings:(await client.query('UPDATE user_settings SET history_enabled=$2,revision=revision+1,history_generation=history_generation+1 WHERE user_id=$1 RETURNING *',[id,body.enabled])).rows[0];
        return {status:body.enabled?'enabled':'paused',...versions(updated)};
      }));
    },
    async view(body,identity){
      strictObject(body,['book','source','historyGeneration','operationId']);revision(body.historyGeneration);
      const book=bookSnapshot(body.book);
      if(!historySources.has(body.source))throw invalid('History records explicit book opens only.');
      return owned(identity,(client,settings,id)=>operation(client,id,'history-view',body,async()=>{
        if(Number(settings.history_generation)!==body.historyGeneration)throw conflict();
        if(!settings.history_enabled)throw new AccountRequestError(409,'HISTORY_PAUSED','Reading history is paused.');
        const ref=await reference(client,book.bookKey);
        const row=(await client.query(`INSERT INTO recent_book_views(user_id,reference_id,viewed_at,display_snapshot) VALUES($1,$2,clock_timestamp(),$3)
          ON CONFLICT(user_id,reference_id) DO UPDATE SET viewed_at=excluded.viewed_at,display_snapshot=excluded.display_snapshot RETURNING viewed_at`,[id,ref,{...book.snapshot,source:body.source}])).rows[0];
        await trimHistory(client,id);
        return {status:'recorded',referenceId:ref,viewedAt:new Date(row.viewed_at).toISOString(),...versions(settings)};
      }));
    },
    async removeHistory(body,identity,ref){
      operationId(ref);strictObject(body,['historyGeneration','operationId']);revision(body.historyGeneration);
      return owned(identity,(client,settings,id)=>operation(client,id,'history-remove',{...body,referenceId:ref},async()=>{
        if(Number(settings.history_generation)!==body.historyGeneration)throw conflict();
        await client.query('DELETE FROM recent_book_views WHERE user_id=$1 AND reference_id=$2',[id,ref]);
        const updated=(await client.query('UPDATE user_settings SET history_generation=history_generation+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        return {status:'removed',...versions(updated)};
      }));
    },
    async clearHistory(body,identity){
      strictObject(body,['historyGeneration','operationId']);revision(body.historyGeneration);
      return owned(identity,(client,settings,id)=>operation(client,id,'history-clear',body,async()=>{
        if(Number(settings.history_generation)!==body.historyGeneration)throw conflict();
        await client.query('DELETE FROM recent_book_views WHERE user_id=$1',[id]);
        const updated=(await client.query('UPDATE user_settings SET history_generation=history_generation+1 WHERE user_id=$1 RETURNING *',[id])).rows[0];
        return {status:'cleared',...versions(updated)};
      }));
    },
  };
}
