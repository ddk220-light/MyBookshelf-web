// Read-only parser replay. No network requests, directory writes, or app configuration changes.
// Usage: node replay-koha.mjs search SNAPSHOT.html 'https://host/cgi-bin/koha/opac-search.pl?idx=kw&q=BOOK'
//        node replay-koha.mjs record SNAPSHOT.html RECORD_ID [BRANCH_NAME]
import fs from 'node:fs';
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
// Optional isolated dependency install, useful when the checkout has no node_modules.
// It resolves the real locked isbn3 dependency; the app's source is still loaded unchanged.
if (process.env.MYBOOKSHELF_REPLAY_DEPENDENCIES) {
  const dependencyRequire = createRequire(path.join(process.env.MYBOOKSHELF_REPLAY_DEPENDENCIES, 'package.json'));
  registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier === 'isbn3') return { url: pathToFileURL(dependencyRequire.resolve('isbn3')).href, shortCircuit: true };
    return nextResolve(specifier, context);
  } });
}
const {
  parseExpandedKohaCatalogSearch,
  parseKohaCatalogSearch,
  parseKohaCatalogRecord,
} = await import('../../../../../server/services/providers/koha.js');

const [mode, snapshotPath, source, branchName] = process.argv.slice(2);
if (!['search', 'record'].includes(mode) || !snapshotPath || !source) {
  process.stderr.write('Usage: replay-koha.mjs search HTML_PATH SEARCH_URL | record HTML_PATH RECORD_ID [BRANCH_NAME]\n');
  process.exit(2);
}
const html = fs.readFileSync(snapshotPath, 'utf8');
const result = {
  method: 'offline_replay_of_current_exported_parsers',
  snapshotPath,
  mode,
  source,
  replayedAt: new Date().toISOString(),
  qualification: 'Parser recognition only. Does not verify live transport, robots permission, terms, deployed integration, or holdings absent from the saved response.',
};
function attempt(name, run) {
  try {
    const value = run();
    result[name] = { recognized: value != null, value };
  } catch (error) {
    result[name] = { recognized: false, error: { code: error.code || null, message: error.message } };
  }
}
if (mode === 'search') {
  const url = new URL(source);
  attempt('expandedCatalogSearch', () => parseExpandedKohaCatalogSearch(html, url));
  attempt('detailedTitleSearch', () => parseKohaCatalogSearch(html, url));
} else {
  attempt('catalogRecord', () => parseKohaCatalogRecord(html, source, branchName ? { libraryName: branchName } : {}));
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
