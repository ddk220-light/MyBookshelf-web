/** Offline/staged registry reader. Not wired into public directory or search routes.
 * @typedef {{connectionId:string,label:string,versionId:string,configurationFingerprint:string,
 * catalogSystem:string,auditMethod:object,appAdapter:object|null,configuration:object,
 * eligible:boolean,eligibilityReason:string,readinessGaps:string[]}} RegistryConnection
 * @typedef {{library_id:string,name:string,country:string,system:string,status:string,
 * app_eligible:number,connections:RegistryConnection[]}} RegistryLibrary
 */
import {readFileSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
import {createHash} from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

export function loadLibraryRegistry(path){
  const raw=readFileSync(path),manifest=JSON.parse(readFileSync(join(dirname(path),'registry-manifest.json'),'utf8'));
  if(manifest.sha256?.[basename(path)]!==digest(raw))throw Error('Registry artifact checksum mismatch');
  const data=JSON.parse(raw);
  if(data.schemaVersion!==1||data.purpose!=='proposal_only'||data.snapshotId!==manifest.snapshotId||!Array.isArray(data.libraries))throw Error('Unsupported registry contract');
  const byId=new Map(),routeIds=new Set();
  for(const library of data.libraries){
    if(!library.library_id||!library.name||byId.has(library.library_id)||!Array.isArray(library.connections))throw Error('Invalid or duplicate registry library');
    const labels=new Set();
    for(const c of library.connections){
      if(!c.connectionId||!c.versionId||!c.configurationFingerprint||!c.configuration||labels.has(c.label)||routeIds.has(c.connectionId)||typeof c.eligible!=='boolean')throw Error('Invalid or duplicate registry connection');
      labels.add(c.label);routeIds.add(c.connectionId);
      if(c.eligible&&(!c.latestAppAssessment||c.latestAppAssessment.status!=='Working'||c.latestAppAssessment.observation_kind!=='live_http'||c.latestAppAssessment.configuration_fingerprint!==c.configurationFingerprint||!c.appAdapter?.implementationFingerprint||c.latestAppAssessment.app_implementation_fingerprint!==c.appAdapter.implementationFingerprint))throw Error('Eligibility lacks current live app proof');
    }
    if(Boolean(library.app_eligible)!==library.connections.some(c=>c.eligible))throw Error('Library/connection eligibility mismatch');
    byId.set(library.library_id,library);
  }
  for(const target of Object.values(data.aliases||{}))if(!byId.has(target))throw Error('Registry alias points to an unknown library');
  freeze(data);
  return Object.freeze({snapshotId:data.snapshotId,data,
    resolve:id=>byId.get(data.aliases?.[id]||id)||null,
    // Explicit projection prevents endpoint configuration, private evidence and query history leaking.
    publicLibraries:()=>data.libraries.filter(l=>l.app_eligible).map(l=>({id:l.library_id,name:l.name,country:l.country,
      catalogSystems:[...new Set(l.connections.filter(c=>c.eligible).map(c=>c.catalogSystem))],
      searchFields:[...new Set(l.connections.filter(c=>c.eligible).flatMap(c=>c.verifiedSearchFields||[]))]})),
  });
}

export function compareDirectory(registry,snapshot){
  const expected=new Map(snapshot.inventory.libraries.map(l=>[l.libraryId,l]));
  const entries=new Map(snapshot.entries.map(l=>[l.id,l]));
  const differences=[];const readiness={};let routes=0;
  for(const library of registry.data.libraries){
    const current=expected.get(library.library_id);
    if(!current){differences.push({libraryId:library.library_id,reason:'missing_from_current_directory'});continue;}
    expected.delete(library.library_id);
    const currentRoutes=new Map(current.connections.map((c,i)=>[c.connectionId,{c,i}]));
    for(const route of library.connections){
      routes++;for(const gap of route.readinessGaps)readiness[gap]=(readiness[gap]||0)+1;
      const selected=currentRoutes.get(route.label);
      if(!selected){differences.push({libraryId:library.library_id,connection:route.label,reason:'missing_current_route'});continue;}
      currentRoutes.delete(route.label);
      const config=Object.fromEntries(Object.entries(selected.c).filter(([k])=>!['connectionId','fidelity'].includes(k)));
      const entry=entries.get(library.library_id);
      if(entry)config.directoryEntry=selected.i?entry.alternateCatalogs[selected.i-1]:entry;
      if(canonical(config)!==canonical(route.configuration))differences.push({libraryId:library.library_id,connection:route.label,reason:'configuration_differs'});
    }
    for(const label of currentRoutes.keys())differences.push({libraryId:library.library_id,connection:label,reason:'route_not_indexed'});
  }
  for(const id of expected.keys())differences.push({libraryId:id,reason:'library_not_indexed'});
  return {schemaVersion:1,snapshotId:registry.snapshotId,mode:'offline_comparison',providerRequests:0,
    libraries:registry.data.libraries.length,connections:routes,configurationDifferences:differences,readinessGapCounts:readiness,
    note:'Static alignment is not live app search proof. This reader is not active in production.'};
}
