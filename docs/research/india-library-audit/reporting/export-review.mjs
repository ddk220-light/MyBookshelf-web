import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {reduceRun} from '/workspace/MyBookshelf-web-india-library-audit/tools/library-audit/runner.mjs';
import {classifyRevalidation} from '/workspace/MyBookshelf-web-india-library-audit/tools/library-audit/revalidation-report.mjs';

// Read-only consumer of the collector's complete journal records. It never
// fetches providers, takes their locks, edits their code, or changes the app.
const repo='/workspace/MyBookshelf-web-india-library-audit';
const output='/workspace/library-audit-review/current';
const repairRoot=join(repo,'docs/research/india-library-audit/revalidation/20261107');
const fullRoot=join(repo,'docs/research/india-library-audit/runs/india-20261107');
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const load=path=>JSON.parse(readFileSync(path,'utf8'));
const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
function save(name,text){const path=join(output,name),temp=path+'.tmp';writeFileSync(temp,text);renameSync(temp,path);}
function csv(name,fields,rows){save(name,[fields,...rows.map(row=>fields.map(key=>typeof row[key]==='object'?JSON.stringify(row[key]):row[key]))].map(row=>row.map(cell).join(',')).join('\n')+'\n');}
function manifestAt(root){const m=load(join(root,'manifest.json'));if(digest(m.inventory.libraries)!==m.inventory.inventoryHash||m.inventory.libraries.length!==m.inventory.total||new Set(m.inventory.libraries.map(r=>r.libraryId)).size!==m.inventory.total)throw Error('Invalid frozen inventory');return m;}
function readJournal(root,phase){const text=readFileSync(join(root,'events.jsonl'),'utf8'),cut=text.lastIndexOf('\n')+1,events=text.slice(0,cut).split('\n').filter(Boolean).map(JSON.parse);if(new Set(events.map(e=>e.eventId)).size!==events.length)throw Error('Duplicate event identity');const checked=new Set();for(const event of events)for(const ref of event.evidence||[]){if(ref.path!==`bodies/${ref.sha256}.txt`||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('Invalid evidence reference');if(!checked.has(ref.sha256)){if(digest(readFileSync(join(root,ref.path)))!==ref.sha256)throw Error('Missing/mismatched evidence hash');checked.add(ref.sha256);}}return {root,phase,events,completeBytes:cut,ignoredTrailingBytes:Buffer.byteLength(text.slice(cut)),hash:digest(text.slice(0,cut)),checkedEvidenceFiles:checked.size};}
const fullManifest=manifestAt(fullRoot),repairManifest=manifestAt(repairRoot),full=readJournal(fullRoot,'original_audit_history'),repair=readJournal(repairRoot,'live_revalidation');
const replay=load(join(repairRoot,'replay-review.json'));if(replay.cohortHash!==repairManifest.inventory.inventoryHash)throw Error('Replay cohort mismatch');
const fullProgress=reduceRun(fullManifest,full.events),repairProgress=reduceRun(repairManifest,repair.events),replayById=new Map(replay.libraries.map(row=>[row.libraryId,row]));
const correction=new Set(['discovery-academic:librarika-bncollege']);
const repaired=repairProgress.libraries.map(row=>{const review=classifyRevalidation(replayById.get(row.libraryId),row,repair.events);if(correction.has(row.libraryId)&&review.classification==='confirmed_access_block'){review.classification='challenge_classification_needs_review';review.closed=false;review.reason='Normal public Catalog Search page; original broad challenge classification remains unconfirmed';}return {...row,review};});
const currentById=new Map(repaired.map(row=>[row.libraryId,row]));
const nativeIdFamilies=new Set(['koha','egranthalaya','libman','indcat','vufind']);
const connectionFamilies=new Map(fullManifest.inventory.libraries.flatMap(l=>l.connections.map(c=>[JSON.stringify([l.libraryId,c.connectionId]),c.family])));
function identifiers(record,libraryId,connectionId='primary'){const family=connectionFamilies.get(JSON.stringify([libraryId,connectionId||'primary']));const nativeId=record.sourceId!=null?String(record.sourceId):nativeIdFamilies.has(family)?String(record.recordId||''):'';return {nativeId,recordIdKind:nativeId?nativeId===String(record.recordId)?'source_native':'connector_reference_with_native_id':/^a1_|^ta[._]/.test(record.recordId||'')?'connector_fingerprint':'connector_reference_native_id_not_exposed'};}

const fullControl=load(join(fullRoot,'audit-control.json'));
const phase=fullControl.resumeAllowed===false?'repair_revalidation':'full_audit';
const rows=fullProgress.libraries.map(row=>{
 const current=phase==='repair_revalidation'?currentById.get(row.libraryId):null,review=current?.review;
 const count=review?.books??(phase==='full_audit'?row.books.length:0);
 let status=review?.classification||(phase==='full_audit'?row.status:'not_yet_revalidated');
 let completed=review?.closed??(phase==='full_audit'&&['qualified','blocked','needs_review'].includes(row.lastAttemptState));
 let category=!completed?'Still checking':count>=20?'20-book pass':count>0?'Partial findings':/empty|zero/.test(status)?'No matches for tested terms':'Blocked';
 const prior=replayById.get(row.libraryId),code=category==='Blocked'?(review?.code||prior?.diagnosedCode||row.blocker?.code||''):'';
 let reason=review?.reason||'';if(category==='Blocked'&&/confirmed_policy_block/.test(status))reason='Provider robots rules restrict automated access to the tested catalog search route.';
 return {libraryId:row.libraryId,name:row.name,country:row.country,region:row.region||'',family:row.connections[0]?.family,origin:row.connections[0]?.origins?.[0]||'',phase,status,category,reviewComplete:Boolean(completed),verifiedBooks:count,reason,code,nextAction:current?.nextAction||row.nextAction||'',historicalBooks:row.books.length};
});
const queries=[],results=[],books=[],failures=[],links=[],itemLinkChecks=[],observationsByLibrary=new Map();
const normUrl=value=>{if(!value)return null;try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;u.hash='';u.searchParams.sort();return u.toString();}catch{return null;}};
function linkFor(book){const observation=book.observation||{};return {url:normUrl(book.catalogUrl||observation.catalogUrl)||'',kind:observation.catalogLinkKind||book.linkKind||(book.catalogUrl?'record':'not_provided')};}
for(const source of [full,repair]){
 const requests=new Map(source.events.filter(e=>e.type==='request_started').map(e=>[e.requestId,e]));
 const responses=new Map();for(const event of source.events)if(event.type==='response_received')for(const ref of event.evidence||[]){if(!responses.has(ref.sha256))responses.set(ref.sha256,[]);responses.get(ref.sha256).push({...event,request:requests.get(event.requestId)});}
 const attemptRequests=new Map();for(const event of requests.values()){if(!attemptRequests.has(event.attemptId))attemptRequests.set(event.attemptId,[]);attemptRequests.get(event.attemptId).push(event);}
 const pending=new Map(),queryByEvent=new Map();
 const key=(libraryId,query,connectionId,recordId)=>JSON.stringify([libraryId,query,connectionId||'primary',recordId]);
 const sourceRef=e=>JSON.stringify({phase:source.phase,eventId:e.eventId,at:e.at,journal:join(source.root,'events.jsonl'),evidence:e.evidence||[]});
 const linkObservation=(book,event)=>{const link=linkFor(book),seen=(event.evidence||[]).flatMap(ref=>responses.get(ref.sha256)||[]).findLast(response=>response.at<=event.at&&normUrl(response.request?.url)===link.url&&['GET','HEAD'].includes(response.request?.method||'GET'));
  return {...link,status:!link.url?'no_link_provided':link.kind!=='record'?'search_or_catalog_handoff_only':seen?seen.status>=200&&seen.status<300?'item_url_http_success_observed':'item_url_http_error_observed':'item_link_not_checked',httpStatus:seen?.status||'',observedAt:seen?.at||'',identityDecision:event.reason||''};};
 for(const event of source.events){
  if(!event.libraryId)continue;
  if(!observationsByLibrary.has(event.libraryId))observationsByLibrary.set(event.libraryId,{queryRows:[],resultRows:[],bookRows:[],failureRows:[]});const group=observationsByLibrary.get(event.libraryId);
  if(['search_completed','search_failed','search_interrupted'].includes(event.type)){
   const request=(attemptRequests.get(event.attemptId)||[]).filter(r=>!r.policyRequest&&r.at<=event.at).at(-1);
   const query={phase:source.phase,eventId:event.eventId,libraryId:event.libraryId,connectionId:event.connectionId||'primary',at:event.at,query:event.query,field:event.profile?.field||'',outcome:event.type,returnedRows:event.records?.length||0,acceptedBookObservations:0,rejectedBookObservations:0,nativeTotal:event.total?.value??'',fidelity:event.fidelity||'',code:event.code||'',reason:event.reason||'',requestUrl:request?.url||'',requestMethod:request?.method||'',profile:event.profile||{},provenance:sourceRef(event)};
   queryByEvent.set(event.eventId,query);
   queries.push(query);group.queryRows.push(queries.length-1);
   for(const [index,record]of(event.records||[]).entries()){
    const link=linkFor(record),row={phase:source.phase,searchEventId:event.eventId,libraryId:event.libraryId,connectionId:event.connectionId||'primary',at:event.at,query:event.query,nativeRank:record.nativeRank??index+1,...identifiers(record,event.libraryId,event.connectionId),recordId:record.recordId,title:record.title,authors:record.authors||[],isbn:record.isbn||record.isbn13||'',catalogUrl:link.url,linkKind:link.kind,linkStatus:!link.url?'no_link_provided':link.kind==='record'?'item_link_not_checked':'search_or_catalog_handoff_only',decision:'returned_not_individually_verified',reason:'',provenance:sourceRef(event)};
    results.push(row);group.resultRows.push(results.length-1);const id=key(event.libraryId,event.query,event.connectionId,record.recordId);if(!pending.has(id))pending.set(id,[]);pending.get(id).push(row);
   }
  }
  if(['book_accepted','book_rejected'].includes(event.type)&&event.book){
   const id=key(event.libraryId,event.query,event.connectionId,event.book.recordId),candidate=pending.get(id)?.shift();
   const link=linkObservation(event.book,event);
   if(candidate){candidate.decision=event.type;candidate.reason=event.reason||'';candidate.linkStatus=link.status;if(link.url){candidate.catalogUrl=link.url;candidate.linkKind=link.kind;}const query=queryByEvent.get(candidate.searchEventId);if(query)query[event.type==='book_accepted'?'acceptedBookObservations':'rejectedBookObservations']++;}
   if(event.type==='book_accepted'){
    const book={phase:source.phase,eventId:event.eventId,libraryId:event.libraryId,connectionId:event.connectionId||'primary',at:event.at,query:event.query,...identifiers(event.book,event.libraryId,event.connectionId),recordId:event.book.recordId,title:event.book.title,authors:event.book.authors||[],isbn:event.book.isbn||event.book.isbn13||'',catalogUrl:link.url,linkKind:link.kind,linkStatus:link.status,httpStatus:link.httpStatus,linkObservedAt:link.observedAt,provenance:sourceRef(event)};
    books.push(book);group.bookRows.push(books.length-1);links.push({...book,identityDecision:link.identityDecision});
   }
  }
  if(event.type==='link_verification_completed')itemLinkChecks.push({...event,phase:source.phase,provenance:sourceRef(event)});
  if(/failed$/.test(event.type)){
   const request=event.requestId?requests.get(event.requestId):(attemptRequests.get(event.attemptId)||[]).filter(r=>r.at<=event.at).at(-1);
   failures.push({phase:source.phase,eventId:event.eventId,libraryId:event.libraryId,at:event.at,type:event.type,query:event.query||'',recordId:event.recordId||'',code:event.code||'',causeCode:event.causeCode||'',reason:event.reason||'',requestUrl:request?.url||'',provenance:sourceRef(event)});group.failureRows.push(failures.length-1);
  }
 }
}
// Reanalysis keeps its original source dates and references; it is never a
// newly fetched book. Preserve raw observations separately from current books.
for(const row of replay.libraries)for(const book of row.books||[]){
 const original=full.events.find(e=>e.libraryId===row.libraryId&&['book_accepted','book_rejected'].includes(e.type)&&e.book?.recordId===book.recordId),link=linkFor(book);
 books.push({phase:'saved_response_reanalysis',eventId:original?.eventId||'',libraryId:row.libraryId,connectionId:book.connectionId||'primary',at:original?.at||row.sourceObservedThrough,query:original?.query||'',...identifiers(book,row.libraryId,book.connectionId),recordId:book.recordId,title:book.title,authors:book.authors||[],isbn:book.isbn||book.isbn13||'',catalogUrl:link.url,linkKind:link.kind,linkStatus:link.url?(link.kind==='record'?'item_link_not_checked':'search_or_catalog_handoff_only'):'no_link_provided',httpStatus:'',linkObservedAt:'',provenance:JSON.stringify({replayFile:join(repairRoot,'replay-review.json'),originalEventId:original?.eventId,sourceObservedThrough:row.sourceObservedThrough,evidence:row.evidence||[],evidenceScope:'aggregate library replay references; see original journal for each record'})});
 if(!observationsByLibrary.has(row.libraryId))observationsByLibrary.set(row.libraryId,{queryRows:[],resultRows:[],bookRows:[],failureRows:[]});observationsByLibrary.get(row.libraryId).bookRows.push(books.length-1);
}
const currentBooks=[];
for(const library of rows){const candidate=currentById.get(library.libraryId),reanalysis=replayById.get(library.libraryId);let selected=phase==='full_audit'?fullProgress.libraries.find(r=>r.libraryId===library.libraryId)?.books||[]:candidate?.review.classification==='verified_20_replayed'?reanalysis?.books||[]:candidate?.books||[];if(!selected.length&&candidate?.review.books>0)selected=reanalysis?.books||[];
 for(const book of selected){const matches=books.filter(b=>b.libraryId===library.libraryId&&b.recordId===book.recordId&&(b.connectionId||'primary')===(book.connectionId||'primary'));const observation=candidate?.review.classification==='verified_20_replayed'?matches.findLast(b=>b.phase==='saved_response_reanalysis'):matches.findLast(b=>b.phase==='live_revalidation')||matches.findLast(b=>b.phase==='original_audit_history')||matches.at(-1);if(observation)currentBooks.push({...observation,currentLibraryStatus:library.category,reviewComplete:library.reviewComplete});}
}
const categories={};for(const row of rows)categories[row.category]=(categories[row.category]||0)+1;
const reviewed=rows.filter(r=>r.reviewComplete).length,cohortTotal=phase==='repair_revalidation'?554:6703;
const summary={schemaVersion:1,generatedAt:new Date().toISOString(),phase,fullInventoryTotal:6703,reviewCohortTotal:cohortTotal,reviewed,remainingInCohort:cohortTotal-reviewed,categories,booksAtTwentyTarget:rows.filter(r=>r.category==='20-book pass').length,searchesWithVerifiedBooks:rows.filter(r=>r.reviewComplete&&r.verifiedBooks>0).length,currentBookRows:currentBooks.length,queryObservations:queries.length,returnedResultRows:results.length,acceptedBookObservations:books.length,linkObservations:links.length,failedObservations:failures.length,linkStates:Object.fromEntries([...new Set(links.map(r=>r.linkStatus))].map(status=>[status,links.filter(r=>r.linkStatus===status).length])),counting:'Unique library IDs; retries and repair history are not additional libraries. Observation CSVs retain historical events and must not be summed as current passes.',sources:[full,repair].map(s=>({phase:s.phase,journal:join(s.root,'events.jsonl'),completeBytes:s.completeBytes,ignoredTrailingBytes:s.ignoredTrailingBytes,journalSha256:s.hash,checkedEvidenceFiles:s.checkedEvidenceFiles,lastEventAt:s.events.at(-1)?.at}))};
mkdirSync(output,{recursive:true});save('summary.json',JSON.stringify(summary,null,2)+'\n');
const libraryFields=['libraryId','name','country','region','family','origin','phase','category','status','reviewComplete','verifiedBooks','code','reason','nextAction','historicalBooks'];
csv('libraries.csv',libraryFields,rows);csv('blocked-libraries.csv',libraryFields,rows.filter(row=>row.category==='Blocked'));
for(const row of queries)row.queryReview=row.outcome==='search_failed'?'failed':row.outcome==='search_interrupted'?'interrupted':row.fidelity!=='website_equivalent'&&row.fidelity?.verified!==true?'website_equivalence_unproven':row.acceptedBookObservations?'found_verified_books':!row.returnedRows?'empty':row.rejectedBookObservations?'candidates_not_qualified':'returned_not_individually_verified';
csv('queries.csv',['phase','eventId','libraryId','connectionId','at','query','field','queryReview','outcome','returnedRows','acceptedBookObservations','rejectedBookObservations','nativeTotal','fidelity','code','reason','requestUrl','requestMethod','profile','provenance'],queries);
csv('results.csv',['phase','searchEventId','libraryId','connectionId','at','query','nativeRank','recordId','nativeId','recordIdKind','title','authors','isbn','catalogUrl','linkKind','linkStatus','decision','reason','provenance'],results);
const bookFields=['phase','eventId','libraryId','connectionId','at','query','recordId','nativeId','recordIdKind','title','authors','isbn','catalogUrl','linkKind','linkStatus','httpStatus','linkObservedAt','provenance'];
csv('book-observations.csv',bookFields,books);csv('books.csv',[...bookFields,'currentLibraryStatus','reviewComplete'],currentBooks);
csv('links.csv',['phase','eventId','libraryId','recordId','nativeId','recordIdKind','title','query','catalogUrl','linkKind','linkStatus','httpStatus','linkObservedAt','identityDecision','provenance'],links);
csv('item-link-checks.csv',['phase','eventId','jobId','libraryId','connectionId','recordId','nativeId','title','url','linkKind','tested','outcome','identityConfirmed','finalUrl','code','reason','sourceObservedAt','at','hops','evidence','sourceEvents','provenance'],itemLinkChecks);
csv('failures.csv',['phase','eventId','libraryId','at','type','query','recordId','code','causeCode','reason','requestUrl','provenance'],failures);
save('per-library-review.jsonl',rows.map(row=>JSON.stringify({...row,observations:observationsByLibrary.get(row.libraryId)||{queryRows:[],resultRows:[],bookRows:[],failureRows:[]},observationFiles:{queryRows:'queries.csv',resultRows:'results.csv',bookRows:'book-observations.csv',failureRows:'failures.csv'},currentBookRows:currentBooks.flatMap((book,index)=>book.libraryId===row.libraryId?[index]:[]),currentBooksFile:'books.csv',rowIndexesAreZeroBasedDataRows:true})).join('\n')+'\n');
save('README.md',`# India library audit: review files\n\nGenerated ${summary.generatedAt}. Phase: ${phase}. ${reviewed} reviewed in the ${cohortTotal}-entry phase; ${summary.remainingInCohort} remain. The full inventory is 6,703. No app entries were changed.\n\n- [All library statuses](libraries.csv)\n- [Blocked library names and reasons](blocked-libraries.csv)\n- [Every attempted query](queries.csv)\n- [Every returned result, including unaccepted candidates](results.csv)\n- [Current selected books and catalog URLs](books.csv)\n- [All historical book observations and saved-response reanalysis](book-observations.csv)\n- [Link kinds and observed check states](links.csv)\n- [Governed per-item link checks and identity conclusions](item-link-checks.csv)\n- [Failures](failures.csv)\n- [Per-library JSONL index](per-library-review.jsonl)\n- [Summary and source hashes](summary.json)\n\nNative IDs are separate from connector references. When the source supplies no native ID, the CSV explicitly labels a connector fingerprint/reference instead of inventing one. These are current review exports, not the final audit report. Original history, live revalidation and saved-response reanalysis are separate phases. Reanalysis retains original observation dates and never counts as a fresh query. Retries and historical book observations are not additional current passes. Current book rows can include provisional findings for libraries still under review; use reviewComplete and currentLibraryStatus. A successful source query does not mean all returned links have been checked. Link statuses describe observed HTTP access; identity conclusions remain in the linked evidence. Empty or handoff-only links are labelled. links.csv describes accepted live/historical observations, while results.csv also retains links on unaccepted candidates. item-link-checks.csv records the separate governed pass; tested=false includes policy refusals before the item request, and HTTP 200 is distinct from confirmed native item identity.\n\nThe exporter reads complete journal lines, validates frozen inventory and all referenced evidence hashes, and does not fetch providers, change collector files or modify the web app. CSV row indexes in JSONL start at zero after the header and name their corresponding file.\n`);
const hundred=Math.floor(reviewed/100)*100,milestoneRoot=resolve(output,'../milestones');mkdirSync(milestoneRoot,{recursive:true});
// Begin with the next requested repair milestone (400); do not send historical
// 100/200/300 notifications that predate the owner's reporting request.
for(let threshold=phase==='repair_revalidation'?400:600;threshold<=hundred;threshold+=100){
 const name=`${phase}-${threshold}.json`,path=join(milestoneRoot,name);
 if(!existsSync(path)){const directory=join(milestoneRoot,`${phase}-${threshold}`);mkdirSync(directory,{recursive:true});const files={};for(const file of ['libraries.csv','blocked-libraries.csv','summary.json']){copyFileSync(join(output,file),join(directory,file));files[file]=digest(readFileSync(join(directory,file)));}writeFileSync(path,JSON.stringify({...summary,milestone:threshold,observedReviewedAtMilestone:reviewed,reportDirectory:output,savedStatusDirectory:directory,savedStatusHashes:files,note:'Counts observed at the first report snapshot after this threshold; journal-prefix hashes retain the exact underlying evidence.'},null,2)+'\n');}
}
console.log(JSON.stringify({phase,reviewed,remainingInCohort:summary.remainingInCohort,categories,queries:queries.length,returnedResults:results.length,bookObservations:books.length,linkStates:summary.linkStates,milestone:hundred,output}));
