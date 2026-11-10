// Offline directory/configuration snapshot. Imports never contact providers.
import {getAllLibraries} from '../../server/services/directory.js';
import {inventory} from '../../server/services/catalog-connectors/inventory.js';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getProvider} from '../../server/services/providers/index.js';
import {toPublicLibrary} from '../../server/public-v2/directory.js';
import {academicNativeProfile} from '../../server/services/providers/discoveryAcademic.js';
import {communityNativeProfile} from '../../server/services/providers/discoveryCommunity.js';
import {catalogNativeProfile} from '../../server/services/providers/catalogNative.js';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const entries=getAllLibraries();
const aliases=JSON.parse(readFileSync(new URL('../../server/data/discovered-catalogs.json',import.meta.url))).aliases||{};
for(const e of entries)for(const c of [e,...(e.alternateCatalogs||[])])for(const k of ['sourceConnectionId','networkConnectionId','researchId'])if(c[k])aliases[c[k]]=e.id;
// Static inspection only: constructing a provider never invokes its methods.
const sourceHash=createHash('sha256');
for(const dir of ['../../server/services/providers/','../../server/services/catalog-connectors/','../../server/public-v2/']){
  const url=new URL(dir,import.meta.url);
  for(const name of readdirSync(url).filter(n=>n.endsWith('.js')&&!n.endsWith('.test.js')).sort()){
    sourceHash.update(dir+name+'\0');sourceHash.update(readFileSync(new URL(name,url)));
  }
}
const implementationFingerprint=sourceHash.digest('hex');
const runtime=entries.flatMap(library=>[library,...(library.alternateCatalogs||[])].map((entry,i)=>{
  const isolated={...entry,id:library.id,alternateCatalogs:[]};
  const provider=getProvider(isolated);
  let auditProfile=null;
  try{auditProfile=entry.platform==='discovery-academic'?academicNativeProfile(entry):entry.platform==='discovery-community'?communityNativeProfile(entry):entry.platform==='catalog'?catalogNativeProfile(entry):null;}
  catch(error){auditProfile={supported:false,error:error.message};}
  return {libraryId:library.id,connectionId:i?`alternate-${i}`:'primary',adapterSystem:entry.platform,
    methods:['searchCatalog','searchBookCandidates','resolveCatalogRecord','checkAvailability','checkRecordAvailability'].filter(name=>typeof provider?.[name]==='function'),
    publicCapabilities:toPublicLibrary(isolated)?.capabilities||{},implementationFingerprint,auditProfile,
    validation:'static_inspection_only'};
}));
export function directorySnapshot(){return {inventory:inventory({country:'*'}),entries,aliases,runtime};}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))console.log(JSON.stringify(directorySnapshot()));
