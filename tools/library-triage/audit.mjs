import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hash } from '../../server/services/catalog-connectors/contracts.js';
import { implementationHash } from '../../server/services/catalog-connectors/service.js';
import { termsFor } from '../library-audit/runner.mjs';
import { runOriginJobs } from '../library-audit/origin-jobs.mjs';

export const ROOT = resolve(new URL('../../', import.meta.url).pathname);
export const SOURCE = 'docs/research/india-library-audit/access-classification';
export const DEFAULT_DIR = 'docs/research/india-library-audit/search-triage/india-20261108';
export const CORE = new Set(['koha', 'indcat', 'vufind', 'egranthalaya', 'libman']);
export const LABELS = { 1: 'Working', 2: 'Needs work', 3: 'Blocked / deferred' };
export const BLOCKS = new Set(['ROBOTS_DISALLOWED', 'ROBOTS_UNAVAILABLE', 'SOURCE_ACCESS_BLOCKED', 'CATALOG_PROVIDER_BLOCKED', 'CATALOG_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'PROVIDER_COOLDOWN', 'UPSTREAM_RATE_LIMITED']);
export const METHODS = {
  koha: 'koha_rss_xml', indcat: 'indcat_sru_scope_pending',
  vufind: 'vufind_search_api', egranthalaya: 'shared_native_member_html',
  libman: 'shared_native_website_json',
};
// No system-level API claim is converted into proof of an enabled provider API.
// Structured search wrappers reuse the coordinator; item identity and library
// membership still require the existing native resolver. IndCat's gap stays open.
export const VERSION = hash([implementationHash, ...['audit.mjs', 'cli.mjs', 'structured.mjs', 'evidence.mjs'].map(f => readFileSync(new URL(f, import.meta.url), 'utf8'))]);
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function relevant(record, query) {
  const words = norm(query).split(' ').filter(Boolean);
  const text = ` ${norm([record?.title, ...(record?.authors || [])].join(' '))} `;
  return words.length > 0 && words.every(w => text.includes(` ${w} `));
}
export function sameNativeTitle(search, detail) {
  const a=norm(search?.title), b=norm(detail?.title);
  if(a===b)return Boolean(a);
  // Koha RSS omits the statement of responsibility displayed on the detail page.
  // Accept only an exact title followed by "by" and independently parsed author
  // tokens. Never use arbitrary prefixes or fuzzy title matching.
  if(!a || !b.startsWith(a+' by '))return false;
  const credit=b.slice(a.length+4).split(' ').filter(Boolean);
  const authors=new Set((detail.authors||[]).flatMap(x=>norm(x).split(' ')).filter(x=>x!=='by'));
  return credit.length>0 && credit.every(x=>authors.has(x));
}
export function itemProof(search, detail, query, response, resolved) {
  const observation = detail?.observation || detail?.availability;
  if (response?.observationKind !== 'live_http' || resolved?.observationKind !== 'live_http') return 'not_live';
  if (!response.freshness?.sourceContacted || !resolved.freshness?.sourceContacted) return 'no_fresh_source_contact';
  if (!response.evidence?.length || !resolved.evidence?.length) return 'missing_evidence';
  if (!['website_equivalent','supported_structured_search'].includes(response.fidelity)) return 'unproven_query_scope_or_equivalence';
  if (!search?.recordId || detail?.recordId !== search.recordId || !sameNativeTitle(search,detail)) return 'item_identity_mismatch';
  if (!relevant(search, query) || !relevant(detail, query)) return 'relevance_unconfirmed';
  if (!['available', 'none_available', 'in_catalog'].includes(observation?.outcome)) return 'library_membership_unconfirmed';
  // A generic handoff alone cannot pass. Some native records are POST-only;
  // their resolved content can pass searchability while link limitations stay explicit.
  const resolvedNativeCatalogItem=detail.linkKind==='catalog' && observation.recognizedExact===true && observation.matchKind==='verified_work';
  if (!detail.catalogUrl || (!['record', 'metadata_fragment', 'post_only', 'form_post'].includes(detail.linkKind) && !resolvedNativeCatalogItem)) return 'item_link_unconfirmed';
  try { if (!['http:', 'https:'].includes(new URL(detail.catalogUrl).protocol)) return 'item_link_unconfirmed'; }
  catch { return 'item_link_unconfirmed'; }
  return null;
}
export function classifyRoutes(routes) {
  if (routes.some(r => r.category === 1)) return 1;
  if (routes.length && routes.every(r => r.category === 3)) return 3;
  return 2;
}
export function initialize(store, root = ROOT) {
  if (existsSync(join(store.root, 'manifest.json'))) throw Error('Already initialized; resume this queue');
  const sourcePath = join(root, SOURCE, 'libraries.jsonl');
  const rows = readFileSync(sourcePath, 'utf8').trim().split('\n').map(JSON.parse);
  const frozen = json(join(root, 'docs/research/india-library-audit/runs/india-20261107/manifest.json')).inventory;
  if (hash(frozen.libraries) !== frozen.inventoryHash || rows.length !== 6703 || new Set(rows.map(r => r.libraryId)).size !== 6703) throw Error('Frozen inventory mismatch');
  const byId = new Map(rows.map(r => [r.libraryId, r]));
  const index = json(join(root, SOURCE, 'evidence-index.json'));
  const checkedBodies=new Set();
  for(const e of Object.values(index))for(const ref of e.evidence||[]) {
    if(!checkedBodies.has(ref.path)) {
      if(ref.path.startsWith('/')||ref.path.split('/').includes('..')||hash(readFileSync(join(root,ref.path),'utf8'))!==ref.sha256)throw Error('Missing/mismatched historical evidence');
      checkedBodies.add(ref.path);
    }
  }
  const jobs = frozen.libraries.map(library => {
    const row = byId.get(library.libraryId);
    if (!row || row.routes.length !== library.connections.length) throw Error('Missing library/route mapping');
    const routes = row.routes.map((r, i) => {
      const f = library.connections[i];
      if (r.connectionId !== f.connectionId || r.frozenFamily !== f.family || r.catalogUrl !== f.catalogUrl) throw Error('Frozen route mismatch');
      if(r.evidenceEventIds.some(id=>!index[id]))throw Error('Missing historical query reference');
      const seeds = r.evidenceEventIds.map(id => index[id]).filter(e => e?.type === 'search_completed' && e.returned > 0)
        .map(e => typeof e.query === 'string' ? e.query : e.query?.query).filter(Boolean);
      const queries = [...new Set([...seeds.reverse(), ...termsFor(library)])].filter(q => q.length <= 160 && q.trim() === q).slice(0, 3);
      return { ...f, system: r.system, eligible: CORE.has(f.family), method: METHODS[f.family] || null,
        savedBlocker: r.blocker, sourceEvidenceEventIds: r.evidenceEventIds, queries,
        // Origin/family/config agreement is checked again against the service before traffic.
        field: ['indcat', 'egranthalaya'].includes(f.family) ? 'title' : 'keyword' };
    });
    return { libraryId: library.libraryId, name: library.name, region: library.region, family: library.connections[0].family, routes };
  });
  const manifest = { schemaVersion: 1, purpose: 'searchability_triage_not_twenty_book_qualification', createdAt: new Date().toISOString(),
    sourceInventoryHash: frozen.inventoryHash, sourceClassification: { path: SOURCE+'/libraries.jsonl', sha256: hash(readFileSync(sourcePath, 'utf8')) },
    sourceEvidenceIndex: { path: SOURCE+'/evidence-index.json', sha256: hash(readFileSync(join(root,SOURCE,'evidence-index.json'),'utf8')) },
    implementationAtInitialization: VERSION, total: jobs.length, inventoryHash: hash(jobs), libraries: jobs,
    policy: { maxQueriesPerRoute: 3, maxDetailsPerQuery: 2, libraryBudgetMs: 480000, targetRelevantItems: 1,
      initialCoreFamilies: [...CORE], providerMethod: 'structured_core_plus_approved_shared_web_methods', structuredApiEnablement: 'koha_rss_and_vufind_api_probed_per_installation_indcat_scope_unverified',
      historicalPassesPromoted: false, historicalBlockersRetained: true, activation: false } };
  store.save('manifest.json', manifest);
  store.append({ type: 'triage_initialized', inventoryHash: manifest.inventoryHash, total: manifest.total });
  return manifest;
}
export function readManifest(store) {
  const m = json(join(store.root, 'manifest.json'));
  if (m.purpose !== 'searchability_triage_not_twenty_book_qualification' || hash(m.libraries) !== m.inventoryHash || m.total !== m.libraries.length || new Set(m.libraries.map(l=>l.libraryId)).size !== m.total) throw Error('Triage inventory mismatch');
  return m;
}
function skippedRoute(route) {
  return route.savedBlocker ? { connectionId: route.connectionId, category: 3, reason: route.savedBlocker.code,
    cause: route.savedBlocker.reason, observedAt: route.savedBlocker.observedAt, basis: 'saved_prior_route_block_not_retested',
    nextAction: 'Revisit only after a documented access or recovery change; do not infer permanent failure.' }
    : route.method==='indcat_sru_scope_pending' ? {connectionId:route.connectionId,category:2,reason:'STRUCTURED_SCOPE_UNVERIFIED',basis:'offline_shared_method_gap',
      nextAction:'Prove an institution-specific SRU holdings filter and native ID mapping once for the shared system before testing its member libraries.'}
    : !route.eligible ? { connectionId: route.connectionId, category: 2, reason: 'OUTSIDE_SHARED_CORE', basis: 'offline_method_triage',
      nextAction: 'Needs an additional shared or individual connector; no custom connector development in this pass.' } : null;
}
export function baseline(job) {
  const routes = job.routes.map(r => skippedRoute(r) || { connectionId:r.connectionId, category:2, reason:'NOT_TESTED', nextAction:'Run bounded shared-method search.' });
  return { libraryId:job.libraryId, category:classifyRoutes(routes), status:LABELS[classifyRoutes(routes)],
    assessed:routes.every(r=>r.reason!=='NOT_TESTED'), liveChecked:false, routes, basis:'offline_preclassification', finishedAt:null };
}
export function reduce(manifest, events) {
  const rows = new Map(manifest.libraries.map(l => [l.libraryId, {...baseline(l),name:l.name,family:l.family}]));
  for (const e of events) if (e.type === 'triage_outcome') {
    if (!rows.has(e.libraryId)) throw Error('Unknown outcome ID');
    rows.set(e.libraryId, { ...rows.get(e.libraryId), ...e.outcome, finishedAt:e.at, eventId:e.eventId });
  }
  return [...rows.values()];
}
export function summarize(rows) {
  return { total:rows.length, working:rows.filter(r=>r.category===1).length, needsWork:rows.filter(r=>r.category===2).length,
    blocked:rows.filter(r=>r.category===3).length, assessed:rows.filter(r=>r.assessed).length,
    pending:rows.filter(r=>!r.assessed).length, liveChecked:rows.filter(r=>r.liveChecked).length };
}
export function attemptKey(job) { return hash({ libraryId:job.libraryId, routes:job.routes, implementation:VERSION }); }
export function pendingJobs(manifest, events, { ids=null, retryReason=null } = {}) {
  const current = new Map(reduce(manifest,events).map(r=>[r.libraryId,r]));
  if (ids && ids.some(id=>!current.has(id))) throw Error('Unknown requested library ID');
  if (retryReason && (!ids?.length || retryReason.trim().length < 12)) throw Error('Retries need explicit library IDs and a concrete reason');
  const pending=manifest.libraries.filter(l=>(!ids || ids.includes(l.libraryId)) &&
    (!current.get(l.libraryId).assessed || (retryReason && !l.routes.every(r=>r.savedBlocker))));
  // Keep the 5,036-member e-Granthalaya host from monopolizing early batches.
  const groups=new Map();
  for(const job of pending) {const family=job.routes.find(r=>!skippedRoute(r))?.family||job.family;if(!groups.has(family))groups.set(family,[]);groups.get(family).push(job);}
  const ordered=[];
  while([...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length)ordered.push(g.shift());
  return ordered;
}
function safeRecord(r) {
  const { recordRef, ...value } = r || {}; return value;
}
function failureOutcome(error, signal) {
  if (signal?.aborted) return { category:2, reason:'BUDGET_OR_OPERATOR_INTERRUPTION', nextAction:'Resume interrupted work; not a provider failure.' };
  return { category:BLOCKS.has(error.code)?3:2, reason:error.code||'CONNECTOR_ERROR', cause:String(error.message||'Request failed').slice(0,300),
    nextAction:BLOCKS.has(error.code)?'Investigate the saved access/transport cause; retry only on meaningful recovery.':'Review the shared request/parser/scope evidence; do not call this a failed library.' };
}
export async function auditLibrary(store, service, job, {signal, retryReason=null}={}) {
  const key=attemptKey(job), routes=[];
  let liveChecked=false;
  for (const route of job.routes) {
    if (signal?.aborted) break;
    const skip=skippedRoute(route);
    if (skip) {routes.push(skip);continue;}
    const prior = [...store.events({cached:true})].reverse().find(e=>e.type==='triage_route_outcome' && e.libraryId===job.libraryId && e.attemptKey===key && e.connectionId===route.connectionId);
    if (prior && !retryReason) { routes.push(prior.outcome);liveChecked ||= prior.liveChecked; if(prior.outcome.category===1)break;continue; }
    let outcome={connectionId:route.connectionId,category:2,reason:'NO_RELEVANT_ITEMS_FOR_TESTED_TERMS',method:route.method,nextAction:'Try a meaningful title/field plan or review the shared method; not proof that the collection is empty.'};
    let routeLive=false;
    try {
      const current=service.connection(job.libraryId,route.connectionId).descriptor;
      if (current.family!==route.family || current.catalogUrl!==route.catalogUrl || current.memberCode!==route.memberCode || current.cluster!==route.cluster || hash([...current.origins].sort())!==hash([...route.origins].sort())) throw Object.assign(Error('Frozen route configuration changed'),{code:'CONFIG_CHANGED'});
      if (current.mode!=='native_http') throw Object.assign(Error('Shared native method unavailable'),{code:'UNSUPPORTED_PROFILE'});
      const field=current.fields.includes(route.field)?route.field:current.fields[0];
      for (const query of route.queries) {
        if (signal?.aborted) break;
        const request={libraryId:job.libraryId,connectionId:route.connectionId,query,field};
        let response;
        try {
          response=await service.search(request,{signal}); routeLive ||= response.freshness?.sourceContacted === true;
          store.append({type:'triage_search',libraryId:job.libraryId,connectionId:route.connectionId,attemptKey:key,query,field,method:route.method,
            observedAt:response.freshness?.observedAt,observationKind:response.observationKind,fidelity:response.fidelity,sourceContacted:response.freshness?.sourceContacted,
            profile:response.effectiveProfile,total:response.total,returned:response.records.length,
            records:response.records.map(safeRecord),evidence:response.evidence});
        } catch(e) {
          routeLive ||= Boolean(e.evidence?.length);
          store.append({type:'triage_search_failed',libraryId:job.libraryId,connectionId:route.connectionId,attemptKey:key,query,field,code:e.code||'CONNECTOR_ERROR',evidence:e.evidence||[]});
          throw e;
        }
        if(response.observationKind!=='live_http' || !['website_equivalent','supported_structured_search'].includes(response.fidelity)) {outcome.reason='QUERY_EQUIVALENCE_UNPROVEN';break;}
        const candidates=response.records.filter(r=>relevant(r,query)).slice(0,2);
        for (const item of candidates) {
          if(signal?.aborted)break;
          try {
            const detail=await service.resolve(item.recordRef,{signal}); routeLive ||= detail.freshness?.sourceContacted===true;
            const reason=itemProof(item,detail.record,query,response,detail);
            const event=store.append({type:'triage_lookup',libraryId:job.libraryId,connectionId:route.connectionId,attemptKey:key,
              query,record:safeRecord(detail.record),searchRecord:safeRecord(item),observedAt:detail.freshness?.observedAt,
              observationKind:detail.observationKind,sourceContacted:detail.freshness?.sourceContacted,proved:!reason,reason,evidence:detail.evidence,
              link:{url:detail.record?.catalogUrl,kind:detail.record?.linkKind,check:'native_record_resolution',
                directUrlHttpChecked:false,note:'Resolved native item content; direct item URL navigation is not independently asserted.'}});
            if(!reason) {outcome={...outcome,category:1,reason:'RELEVANT_SCOPED_ITEM_RESOLVED',query,recordId:item.recordId,title:detail.record.title,
              proofEventId:event.eventId,nextAction:'Searchability passed for the saved scope; production release is separate.'};break;}
            outcome.reason=reason;
          } catch(e) {
            routeLive ||= Boolean(e.evidence?.length);
            store.append({type:'triage_lookup_failed',libraryId:job.libraryId,connectionId:route.connectionId,attemptKey:key,query,recordId:item.recordId,code:e.code||'CONNECTOR_ERROR',evidence:e.evidence||[]});
            if(BLOCKS.has(e.code) || signal?.aborted)throw e;
            outcome={...outcome,...failureOutcome(e,signal)};
          }
        }
        if(outcome.category===1)break;
      }
    }catch(e){outcome={...outcome,...failureOutcome(e,signal)};}
    liveChecked ||= routeLive;
    if(signal?.aborted) return {interrupted:true};
    store.append({type:'triage_route_outcome',libraryId:job.libraryId,connectionId:route.connectionId,attemptKey:key,liveChecked:routeLive,outcome});
    routes.push(outcome);
    if(outcome.category===1)break;
  }
  if(signal?.aborted)return {interrupted:true};
  const category=classifyRoutes(routes);
  const outcome={libraryId:job.libraryId,category,status:LABELS[category],assessed:true,liveChecked,routes,attemptKey:key,
    basis:'bounded_shared_method_audit',retryReason};
  store.append({type:'triage_outcome',libraryId:job.libraryId,outcome});
  return outcome;
}
export async function runBatch(store,service,manifest,{limit=10,concurrency=3,ids=null,retryReason=null,signal,onCheckpoint=()=>{}}={}) {
  const jobs=pendingJobs(manifest,store.events({cached:true}),{ids,retryReason}).slice(0,limit);
  await runOriginJobs(jobs,{concurrency,signal,originFor:j=>j.routes.find(r=>!skippedRoute(r))?.origins[0]||j.libraryId,
    run:async job=>{
      const timeout=AbortSignal.timeout(manifest.policy.libraryBudgetMs);
      const combined=signal?AbortSignal.any([signal,timeout]):timeout;
      await auditLibrary(store,service,job,{signal:combined,retryReason});
      if(timeout.aborted && !signal?.aborted) {
        const events=store.events({cached:true}),key=attemptKey(job);
        const routes=job.routes.map(r=>[...events].reverse().find(e=>e.type==='triage_route_outcome'&&e.libraryId===job.libraryId&&e.connectionId===r.connectionId&&e.attemptKey===key)?.outcome || skippedRoute(r) ||
          {connectionId:r.connectionId,category:2,reason:'LIBRARY_BUDGET_EXCEEDED',nextAction:'Review saved timing and partial results before another bounded attempt; not a library failure.'});
        const category=classifyRoutes(routes);
        store.append({type:'triage_outcome',libraryId:job.libraryId,outcome:{libraryId:job.libraryId,category,status:LABELS[category],assessed:true,
          liveChecked:events.some(e=>e.libraryId===job.libraryId&&e.attemptKey===key&&e.sourceContacted===true),routes,attemptKey:key,basis:'bounded_attempt_budget_exhausted'}});
      }
      await onCheckpoint();
    }});
  return summarize(reduce(manifest,store.events({cached:true})));
}
export function validate(store, manifest=readManifest(store)) {
  const check=store.validate(),events=store.events(),rows=reduce(manifest,events);
  for(const ref of [manifest.sourceClassification,manifest.sourceEvidenceIndex].filter(Boolean))
    if(ref.path.startsWith('/')||ref.path.split('/').includes('..')||hash(readFileSync(join(ROOT,ref.path),'utf8'))!==ref.sha256)throw Error('Frozen classification source changed or missing');
  const ids=new Set(manifest.libraries.map(l=>l.libraryId));
  const byEvent=new Map(events.map(e=>[e.eventId,e]));
  for(const e of events) {
    if(e.libraryId&&!ids.has(e.libraryId))throw Error('Foreign library evidence');
    if(e.type==='triage_outcome') {
      if(e.outcome.category!==classifyRoutes(e.outcome.routes))throw Error('Incorrect category');
      for(const r of e.outcome.routes.filter(r=>r.category===1)) {
        const proof=byEvent.get(r.proofEventId);
        const search=[...events].reverse().find(s=>s.type==='triage_search'&&s.libraryId===e.libraryId&&s.connectionId===r.connectionId&&s.attemptKey===e.outcome.attemptKey&&s.query===r.query&&s.records.some(x=>x.recordId===r.recordId));
        if(!proof?.proved || proof.libraryId!==e.libraryId || proof.connectionId!==r.connectionId || proof.record?.recordId!==r.recordId || !search || itemProof(proof.searchRecord,proof.record,r.query,
          {...search,freshness:{sourceContacted:search.sourceContacted}}, {...proof,freshness:{sourceContacted:proof.sourceContacted}}))throw Error('Working outcome lacks live scoped item proof');
      }
    }
  }
  return {...check,...summarize(rows)};
}
export const quote=v=>{
  const raw=String(v??''),safe=/^\s*[=+@-]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replaceAll('"','""')+'"';
};
function csv(store,name,columns,rows){writeFileSync(join(store.root,name),[columns.join(','),...rows.map(r=>columns.map(k=>quote(r[k])).join(','))].join('\n')+'\n');}
export function report(store) {
  const manifest=readManifest(store),events=store.events({cached:true}),rows=reduce(manifest,events),summary=summarize(rows);
  const families=[...new Set(rows.map(r=>r.family))].sort().map(f=>({family:f,...summarize(rows.filter(r=>r.family===f))}));
  store.save('progress.json',{...summary,at:new Date().toISOString(),families,implementation:VERSION});
  csv(store,'libraries.csv',['libraryId','name','family','status','assessed','liveChecked','finishedAt','reasons','nextActions'],rows.map(r=>({...r,reasons:r.routes.map(x=>x.reason).join('; '),nextActions:r.routes.map(x=>x.nextAction).join('; ')})));
  csv(store,'blocked.csv',['libraryId','name','connectionId','reason','cause','observedAt','basis','nextAction'],rows.flatMap(r=>r.routes.filter(x=>x.category===3).map(x=>({...x,libraryId:r.libraryId,name:r.name}))));
  csv(store,'queries.csv',['eventId','libraryId','connectionId','query','field','at','observedAt','type','method','returned','code','fidelity'],events.filter(e=>['triage_search','triage_search_failed'].includes(e.type)));
  csv(store,'results.csv',['eventId','libraryId','connectionId','query','at','recordId','title','authors','isbn','catalogUrl','linkKind'],events.filter(e=>e.type==='triage_search').flatMap(e=>e.records.map(r=>({...r,eventId:e.eventId,libraryId:e.libraryId,connectionId:e.connectionId,query:e.query,at:e.observedAt,authors:r.authors?.join('; '),isbn:r.isbn||r.isbn13}))));
  csv(store,'items.csv',['eventId','libraryId','connectionId','query','observedAt','proved','reason','recordId','title','url','kind','directUrlHttpChecked'],events.filter(e=>e.type==='triage_lookup').map(e=>({...e,recordId:e.record?.recordId,title:e.record?.title,...e.link})));
  writeFileSync(join(store.root,'report.md'),`# Shared-method library search audit\n\n| Status | Libraries |\n|---|---:|\n| Working | ${summary.working} |\n| Needs work (includes not yet tested) | ${summary.needsWork} |\n| Blocked / deferred | ${summary.blocked} |\n| Total | ${summary.total} |\n\n${summary.pending} await a shared-method test; ${summary.assessed} have an assessed outcome (including saved blockers and offline exclusions). ${summary.liveChecked} have source contact recorded by this run. No old search pass is promoted. Twenty-book qualification, complete link verification and app activation are separate.\n\nMethods: Koha RSS/XML, VuFind Search API, e-Granthalaya shared HTML, and Libman shared JSON. IndCat SRU remains Needs work until institution-specific holdings and identity mapping are proved; union hits cannot qualify a library. Existing native item resolvers confirm identity and holdings after structured search. API failures do not silently fall back to HTML search.\n\n[Per-library list](libraries.csv) · [Blocked routes](blocked.csv) · [Queries](queries.csv) · [All results](results.csv) · [Resolved items and link limitations](items.csv)\n`);
  return summary;
}
