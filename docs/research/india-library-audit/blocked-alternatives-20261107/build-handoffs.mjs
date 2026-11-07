import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {getLibraryById} from '/workspace/MyBookshelf-web-india-library-audit/server/services/directory.js';
import {scopeSearch} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/koha.js';
import {vufindSearchUrl} from '/workspace/MyBookshelf-web-india-library-audit/server/services/providers/vufind.js';

// Offline preparation only. This never fetches a catalog or changes the active
// audit worktree, its journal, source guards, or production activation state.
const repository='/workspace/MyBookshelf-web-india-library-audit';
const destination='/workspace/library-blocked-alternatives-20261107';
const registry=join(repository,'docs/research/india-library-audit/revalidation/20261107');
const manifest=JSON.parse(readFileSync(join(registry,'manifest.json')));
const replay=JSON.parse(readFileSync(join(registry,'replay-review.json')));
const targets=replay.libraries.filter(row=>['confirmed_policy_block','confirmed_access_block'].includes(row.classification));
if(targets.length!==114||new Set(targets.map(row=>row.libraryId)).size!==114)throw Error('Original blocked cohort mismatch');
const sourceDirectory=join(repository,manifest.sourceRunDirectory);
const events=readFileSync(join(sourceDirectory,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const requests=new Map(events.filter(e=>e.type==='request_started').map(e=>[e.requestId,e]));
const policies=new Map();
for(const event of events)if(event.type==='response_received'&&event.status===200){const request=requests.get(event.requestId);if(request&&new URL(request.url).pathname==='/robots.txt')policies.set(new URL(request.url).origin,{observedAt:event.at,eventId:event.eventId,evidence:event.evidence});}
const examples=['Mathematics','Wings of Fire','தமிழ்','R & D'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const rows=targets.map(row=>{
 const entry=getLibraryById(row.libraryId),origin=new URL(entry.baseUrl||entry.catalogUrl).origin;
 let build=null,queryField=null;
 if(entry.platform==='koha'){build=query=>{const url=scopeSearch(new URL('/cgi-bin/koha/opac-search.pl',origin),entry);url.searchParams.set('idx','kw');url.searchParams.set('q',query);return url.toString();};queryField='q';}
 if(entry.platform==='vufind'){build=query=>vufindSearchUrl(entry,query,'Title');queryField='lookfor';}
 const sampleLinks=build?examples.map(query=>{const url=build(query),parsed=new URL(url);if(parsed.origin!==origin||parsed.searchParams.get(queryField)!==query||parsed.username||parsed.password)throw Error('Unsafe or transformed handoff');
  if(entry.platform==='vufind'&&!parsed.searchParams.getAll('filter[]').includes(`institution:"${entry.vufindInstitution}"`))throw Error('Missing institution filter');
  if(entry.platform==='koha'&&entry.kohaBranchCode&&!entry.kohaSearchUnscoped&&parsed.searchParams.get(entry.kohaLegacyHoldings?'branch_group_limit':'limit')!==`branch:${entry.kohaBranchCode}`)throw Error('Missing branch filter');
  return {query,url,validation:'offline_url_and_scope_validation_only'};}):[];
 const policy=policies.get(origin);
 for(const reference of policy?.evidence||[]){const body=readFileSync(join(sourceDirectory,reference.path));if(hash(body)!==reference.sha256)throw Error('Policy evidence hash mismatch');}
 const scope=entry.platform==='vufind'?{kind:'institution_filter',value:entry.vufindInstitution}:entry.kohaBranchCode&&!entry.kohaSearchUnscoped?{kind:entry.kohaLegacyHoldings?'branch_group_limit':'branch_limit',value:entry.kohaBranchCode}:{kind:entry.kohaBranchCode?'network_wide_search_requires_member_detail_verification':'individual_catalog',value:null};
 return {libraryId:row.libraryId,name:entry.name,family:entry.platform,origin,scope,baselineClassification:row.classification,
  currentAssessment:row.classification==='confirmed_access_block'?'access_classification_unconfirmed_normal_catalog_page_needs_review':'tested_automated_route_restricted_documented_alternatives_need_review',
  fallback:{mode:build?'user_opened_query_link':'user_opened_catalog',template:build?build('{query}').replace(/%7Bquery%7D/gi,'{query}'):null,catalogUrl:entry.catalogUrl||entry.baseUrl,queryField,examples:sampleLinks},
  providerPolicyEvidence:policy?{sourceDirectory:manifest.sourceRunDirectory,...policy}:null,
  supportedAlternativeApiVerified:false,providerRequestsMade:0,canReturnVerifiedInAppItems:false,twentyBookPass:false,
  nextAction:row.classification==='confirmed_access_block'?'Review challenge detection using the public form/client, then make a governed supported-search canary':'Find a provider-published machine interface or explicit permitted metadata export; preserve link-only fallback separately',
  provenance:{cohort:join('docs/research/india-library-audit/revalidation/20261107','replay-review.json'),originalSourceObservedThrough:row.sourceObservedThrough,adapterUrlShapes:'existing scopeSearch/vufindSearchUrl source code; no new network verification'}};
});
const grouped=new Map();for(const row of rows){if(!grouped.has(row.origin))grouped.set(row.origin,{origin:row.origin,libraryIds:[],entryCount:0});const group=grouped.get(row.origin);group.libraryIds.push(row.libraryId);group.entryCount++;}
const result={schemaVersion:1,generatedAt:new Date().toISOString(),task:'Find permitted alternatives and user-opened search handoffs for the original 114 blocked entries',originalCohortTotal:114,catalogHosts:grouped.size,queryLinkTemplates:rows.filter(row=>row.fallback.mode==='user_opened_query_link').length,catalogLandingLinks:rows.filter(row=>row.fallback.mode==='user_opened_catalog').length,providerRequestsMade:0,searchResultVerification:'none; URL construction is not a working connector or a book pass',activeCollectorUntouched:true,groups:[...grouped.values()].sort((a,b)=>b.entryCount-a.entryCount),libraries:rows};
mkdirSync(destination,{recursive:true});writeFileSync(join(destination,'blocked-alternatives.json'),JSON.stringify(result,null,2)+'\n');
const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';const fields=['libraryId','name','origin','scope','assessment','fallbackMode','urlTemplate','catalogUrl','alternativeApiVerified'];
writeFileSync(join(destination,'blocked-alternatives.csv'),[fields,...rows.map(row=>[row.libraryId,row.name,row.origin,JSON.stringify(row.scope),row.currentAssessment,row.fallback.mode,row.fallback.template,row.fallback.catalogUrl,false])].map(row=>row.map(cell).join(',')).join('\n')+'\n');
console.log(JSON.stringify({entries:result.originalCohortTotal,hosts:result.catalogHosts,queryLinkTemplates:result.queryLinkTemplates,catalogLandingLinks:result.catalogLandingLinks,offlineExamples:rows.reduce((sum,row)=>sum+row.fallback.examples.length,0),providerRequestsMade:0,alternativeApiVerified:0,sha256:hash(readFileSync(join(destination,'blocked-alternatives.json')))}));
