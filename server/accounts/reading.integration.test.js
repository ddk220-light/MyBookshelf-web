import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../db/migrate.js';
import {prepareTestRoles,testRoleURL} from './test-database.js';
import {createReadingActions} from './reading.js';
import {createShelfActions} from './books.js';
import {createHistoryActions} from './history.js';
import {createTitleAuthorId} from '../services/titleAuthorIdentity.js';

const connectionString=process.env.ACCOUNT_TEST_DATABASE_URL;
test('owner-private library/shelf API: conflicts, receipts, exact keys, cursors, undo, clear and quota',{
 skip:!connectionString&&'Set disposable local ACCOUNT_TEST_DATABASE_URL.',timeout:30_000,
},async(t)=>{
 const url=new URL(connectionString);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.endsWith('_test'));
 const admin=new Pool({connectionString});let pool;const ids=[randomUUID(),randomUUID()],keys=[];
 t.after(async()=>{await admin.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[ids]);await admin.query('DELETE FROM book_refs WHERE book_key=ANY($1::text[])',[keys]);if(pool)await pool.end();await admin.end();});
 await migrate(admin);await prepareTestRoles(admin);pool=new Pool({connectionString:testRoleURL(connectionString,'reading'),max:4});
 for(const id of ids){await admin.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',[id,'Synthetic reader',id+'@example.test']);await admin.query('INSERT INTO app_users(id,auth_user_id) VALUES($1::uuid,$1::text)',[id]);}
 const [a,b]=ids.map(id=>({sessionId:randomUUID(),authUserId:id,user:{id,name:'Synthetic reader',email:id+'@example.test'}}));
 let sessionActive=true;
 const reading=createReadingActions({pool,sessionActive:async()=>sessionActive});const shelf=createShelfActions({owned:reading.owned,secret:'a synthetic signing secret longer than 32 characters'});
 assert.equal((await reading.state(a)).historyEnabled,false);
 const library={libraryId:'bc:smcl',settingsRevision:0,operationId:randomUUID()};
 const selected=await reading.selectLibrary(library,a);assert.deepEqual(await reading.selectLibrary(library,a),selected);
 await assert.rejects(reading.selectLibrary({...library,libraryId:'bc:sfpl'},a),e=>e.code==='OPERATION_CONFLICT');
 await assert.rejects(reading.selectLibrary({...library,operationId:randomUUID()},a),e=>e.code==='VERSION_CONFLICT');
 await assert.rejects(reading.selectLibrary({libraryId:'missing:directory',settingsRevision:1,operationId:randomUUID()},a),e=>e.code==='INVALID_INPUT');
 assert.equal((await reading.state(b)).selectedLibraryId,null);
 const choices=await Promise.allSettled(['bc:sfpl','bc:smcl'].map(libraryId=>reading.selectLibrary({libraryId,settingsRevision:1,operationId:randomUUID()},a)));
 assert.equal(choices.filter(r=>r.status==='fulfilled').length,1);assert.equal(choices.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
 const makeBook=()=>{const bookKey='v1:googlebooks:'+randomUUID().replaceAll('-','');keys.push(bookKey);return {bookKey,title:'Private synthetic title',authors:['Synthetic author']};};
 const book=makeBook(),save={book,shelfRevision:0,operationId:randomUUID()};
 const saved=await shelf.save(save,a);assert.deepEqual(await shelf.save(save,a),saved);assert.equal(saved.shelfRevision,1);
 assert.equal((await shelf.books({},b)).books.length,0);
 await assert.rejects(shelf.save({...save,operationId:randomUUID()},a),e=>e.code==='VERSION_CONFLICT');
 const next=await shelf.save({book:makeBook(),shelfRevision:1,operationId:randomUUID()},a);
 // Force adjacent microsecond timestamps to prove the cursor retains PG precision.
 await admin.query("UPDATE user_books SET saved_at='2026-01-01T00:00:00.000002Z' WHERE user_id=$1 AND reference_id=$2",[a.user.id,saved.referenceId]);
 await admin.query("UPDATE user_books SET saved_at='2026-01-01T00:00:00.000001Z' WHERE user_id=$1 AND reference_id=$2",[a.user.id,next.referenceId]);
 const first=await shelf.books({limit:1},a);assert.equal(first.books[0].referenceId,saved.referenceId);assert.ok(first.nextCursor);
 const second=await shelf.books({limit:1,cursor:first.nextCursor},a);assert.equal(second.books[0].referenceId,next.referenceId);assert.equal(second.nextCursor,null);
 await assert.rejects(shelf.books({cursor:first.nextCursor},b),e=>e.code==='INVALID_INPUT');
 const removalId=randomUUID();const removed=await shelf.remove({shelfRevision:2,operationId:removalId},a,saved.referenceId);assert.ok(removed.undoUntil);
 await assert.rejects(shelf.books({cursor:first.nextCursor},a),e=>e.code==='VERSION_CONFLICT');
 const restored=await shelf.undo({removalId,shelfRevision:3,operationId:randomUUID()},a);assert.equal(restored.shelfRevision,4);
 const clear=await shelf.clear({shelfRevision:4,operationId:randomUUID(),confirmed:true},a);assert.equal(clear.shelfRevision,5);
 await assert.rejects(shelf.undo({removalId,shelfRevision:5,operationId:randomUUID()},a),e=>e.code==='UNDO_EXPIRED');
 const longKey='v1:catalog:vpl:visakhapatnam-public-library:'+createTitleAuthorId('அ'.repeat(490),'ஆ'.repeat(240));assert.ok(longKey.length>512&&longKey.length<=4096);keys.push(longKey);
 const long=await shelf.save({book:{bookKey:longKey,title:'Long exact reference',authors:[],coverUrl:'https://attacker.invalid/image'},shelfRevision:5,operationId:randomUUID()},a);
 assert.equal((await shelf.books({},a)).books[0].bookKey,longKey);assert.equal((await shelf.books({},a)).books[0].coverUrl,undefined);
 assert.deepEqual((await admin.query('SELECT provider_metadata FROM book_refs WHERE id=$1',[long.referenceId])).rows[0].provider_metadata,{});
 const history=createHistoryActions({owned:reading.owned});
 const paused={book,source:'direct',historyGeneration:0,operationId:randomUUID()};
 await assert.rejects(history.view(paused,a),e=>e.code==='HISTORY_PAUSED');
 assert.equal((await history.history({},a)).books.length,0);
 const enabled=await history.historySettings({enabled:true,settingsRevision:2,operationId:randomUUID()},a);assert.equal(enabled.historyGeneration,1);
 await assert.rejects(history.view({...paused,operationId:randomUUID()},a),e=>e.code==='VERSION_CONFLICT');
 const live={book,source:'direct',historyGeneration:1,operationId:randomUUID()};const viewed=await history.view(live,a);assert.deepEqual(await history.view(live,a),viewed);
 assert.equal((await history.history({},b)).books.length,0);
 await assert.rejects(history.view({...live,source:'prefetch',operationId:randomUUID()},a),e=>e.code==='INVALID_INPUT');
 for(let n=0;n<51;n++)await history.view({book:makeBook(),source:'search',historyGeneration:1,operationId:randomUUID()},a);
 assert.equal((await history.history({},a)).books.length,50);
 const pausedAgain=await history.historySettings({enabled:false,settingsRevision:3,operationId:randomUUID()},a);assert.equal(pausedAgain.historyGeneration,2);
 assert.equal((await history.history({},a)).books.length,50);
 await assert.rejects(history.view({...live,operationId:randomUUID()},a),e=>e.code==='VERSION_CONFLICT');
 const priorHistory=await history.history({},a);
 await admin.query("UPDATE recent_book_views SET viewed_at=now()-interval '31 days' WHERE user_id=$1 AND reference_id=$2",[a.user.id,priorHistory.books[0].referenceId]);
 assert.equal((await history.history({},a)).books.length,49);
 const historyClear=await history.clearHistory({historyGeneration:2,operationId:randomUUID()},a);assert.equal(historyClear.historyGeneration,3);
 await assert.rejects(history.removeHistory({historyGeneration:2,operationId:randomUUID()},a,priorHistory.books[1].referenceId),e=>e.code==='VERSION_CONFLICT');
 assert.equal((await history.history({},a)).books.length,0);
 // Seed the quota boundary without sending 999 serial requests.
 const quotaBooks=Array.from({length:999},makeBook);
 for(const row of quotaBooks){const ref=randomUUID();await admin.query('INSERT INTO book_refs(id,book_key,key_digest) VALUES($1,$2,$3)',[ref,row.bookKey,createHash('sha256').update(row.bookKey).digest()]);await admin.query('INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES($1,$2,$3)',[a.user.id,ref,{title:row.title,authors:[]}]);}
 await assert.rejects(shelf.save({book:makeBook(),shelfRevision:6,operationId:randomUUID()},a),e=>e.code==='SHELF_FULL');assert.equal((await reading.state(a)).counts.saved,1000);
 sessionActive=false;await assert.rejects(reading.state(a),e=>e.code==='SIGN_IN_REQUIRED');sessionActive=true;
 await admin.query("UPDATE app_users SET status='deleting' WHERE id=$1",[a.user.id]);await assert.rejects(shelf.books({},a),/unavailable/);
});
