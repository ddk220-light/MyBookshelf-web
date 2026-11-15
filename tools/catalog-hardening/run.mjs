import { writeFile, readFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createProbeRunner, hostFailureCount } from './probe.mjs';
import { getLibraryById } from '../../server/services/directory.js';
import { hostFor } from '../../server/services/catalog-lookup/platforms.js';

const [manifestPath,outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw new Error('Usage: node tools/catalog-hardening/run.mjs manifest.json output.json');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
const selected = Array.isArray(manifest) ? manifest : manifest.libraries;
if (!Array.isArray(selected)) throw new Error('Manifest must contain a libraries array');
let result = { schemaVersion:1,startedAt:new Date().toISOString(),
  commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),libraries:[] };
if (process.argv.includes('--resume')) {
  try { result = JSON.parse(await readFile(outputPath,'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
result.selection = manifestPath;
delete result.finishedAt;
result.runs ||= [];
result.runs.push({startedAt:new Date().toISOString(),requestSpacingMs:manifest.requestSpacingMs || 0});
const runner = createProbeRunner({onProgress:item=>console.log(JSON.stringify(item)),requestSpacingMs:manifest.requestSpacingMs || 0});
const refusedHosts = new Set(result.refusedHosts || []);
// Optional, like koha-run: after N successive members of one shared host fail
// discovery with errors and no candidate, stop sending requests to that host.
const stopAfter = manifest.stopAfterHostFailures;
if (stopAfter !== undefined && (!Number.isInteger(stopAfter) || stopAfter < 1 || stopAfter > 10)) throw new Error('stopAfterHostFailures must be an integer from 1 to 10');
const failedHosts = new Map(Object.entries(result.failedHosts || {}));
const consecutiveFailures = new Map(Object.entries(result.consecutiveHostFailures || {}));
await mkdir(dirname(outputPath),{recursive:true});
async function checkpoint() { await writeFile(outputPath+'.tmp',JSON.stringify(result,null,2)+'\n'); await rename(outputPath+'.tmp',outputPath); }
for (const selectedLibrary of selected) {
  const config = typeof selectedLibrary === 'string' ? {libraryId:selectedLibrary} : selectedLibrary;
  if (result.libraries.some(library => library.libraryId === config.libraryId)) continue;
  const entry = getLibraryById(config.libraryId), host = hostFor(entry);
  if (refusedHosts.has(host)) {
    result.libraries.push({ libraryId:config.libraryId,name:entry.name,host,status:'not_attempted',reason:'Shared host refused an earlier operation; no further requests sent',books:[] });
  } else if (failedHosts.has(host)) {
    result.libraries.push({ libraryId:config.libraryId,name:entry.name,host,status:'not_attempted',reason:failedHosts.get(host),books:[] });
  } else {
    const library = await runner.probeLibrary(config.libraryId,config);
    result.libraries.push(library);
    if (library.refused || library.discovery.some(result => result.code === 'CATALOG_PROVIDER_BLOCKED')
        || library.books.some(book => [book.search,book.resolve].some(stage=>stage?.code==='CATALOG_PROVIDER_BLOCKED'))) refusedHosts.add(host);
    else if (stopAfter) {
      const count = hostFailureCount(Number(consecutiveFailures.get(host) || 0), library);
      consecutiveFailures.set(host, count);
      if (count >= stopAfter) failedHosts.set(host, `${count} successive members failed discovery with errors at this shared host; remaining members not tested`);
    }
  }
  result.refusedHosts = [...refusedHosts];
  if (stopAfter) { result.failedHosts = Object.fromEntries(failedHosts); result.consecutiveHostFailures = Object.fromEntries(consecutiveFailures); }
  await checkpoint();
}
result.finishedAt = new Date().toISOString();
await checkpoint();
console.log(JSON.stringify({finished:true,libraries:result.libraries.length,passed:result.libraries.filter(x=>x.status==='passed').length}));
