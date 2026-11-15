import fs from 'node:fs';
import { createProbeRunner } from './probe.mjs';
import { getLibraryById } from '../../server/services/directory.js';

const manifestUrl = new URL('./manifests/community-member-seeds.json', import.meta.url);
const outputUrl = new URL('../../docs/research/india-library-hardening/community-member-results.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestUrl, 'utf8'));
const report = {
  observedOn: new Date().toISOString().slice(0, 10),
  method: 'Member-list candidates are starting points only. Each selected title must independently match its exact catalog ID through the app provider, resolve under the selected holder, and produce a fresh live app found answer. One serial host queue; production robots and host limits.',
  sourceManifest: 'tools/catalog-hardening/manifests/community-member-seeds.json',
  libraries: [],
};
const save = () => fs.writeFileSync(outputUrl, JSON.stringify(report, null, 2) + '\n');
const runner = createProbeRunner({ onProgress: event => console.log(JSON.stringify(event)) });
// Member-list discovery may have just used this host. Begin in a new request
// window so this runner's independent gate cannot undercount those requests.
await new Promise(resolve => setTimeout(resolve, Math.min(60_000, 60_000 - Date.now() % 60_000 + 250)));
for (const member of manifest.libraries) {
  const entry = getLibraryById(member.libraryId);
  if (entry?.platform !== 'discovery-community' || entry.communityCatalog?.family !== 'sindhi') throw new Error('Unexpected member catalog');
  const value = await runner.probeLibrary(member.libraryId, {
    required: 1, maxAttempts: 5, queries: [], checkIsbn: false, candidates: member.candidates || [],
  });
  value.discoverySourceUrl = member.sourceUrl;
  for (const book of value.books) book.eligibleBook = true;
  report.libraries.push(value);
  save();
  if (value.books.some(book => book.search?.code === 'CATALOG_PROVIDER_BLOCKED'
      || book.resolve?.code === 'CATALOG_PROVIDER_BLOCKED' || book.lookup?.reason === 'blocked')) {
    report.stoppedAfterRefusal = member.libraryId;
    break;
  }
}
report.finishedAt = new Date().toISOString();
save();
