// Diagnostic: run the app's own book check from this machine, the way
// POST /api/v2/holdings/check does (same directory, book resolution and
// lookup), and print each answer with its reason, the provider's error code,
// its requests and the catalog rows a found answer lists. No store: nothing is read from or written to a database.
//   CATALOG_LOOKUP_V2=all node tools/diag-check.mjs <libraryId> <bookKey> [bookKey ...]
import { createPublicDirectoryService } from '../server/public-v2/directory.js';
import { createPublicBookService } from '../server/public-v2/metadata.js';
import { createPublicCatalogBookService } from '../server/public-v2/catalogBooks.js';
import { createCatalogLookup } from '../server/services/catalog-lookup/index.js';
import { createLookupRecorder, writeLibraryCheckLog } from '../server/services/catalog-lookup/record.js';
import { parsePublicBookKey } from '../server/public-v2/contracts.js';
const [libraryId, ...keys] = process.argv.slice(2);
const directory = createPublicDirectoryService();
const books = createPublicBookService({ catalogs: createPublicCatalogBookService({ directory }) });
let last = {};
const recorder = createLookupRecorder({ health: { recordOutcome: async o => { last.health = o; } }, telemetry: { emit: e => { last.telemetry = e; } }, defer: fn => { fn(); },
  log: e => { last.event = e; writeLibraryCheckLog(e); } });
const lookup = createCatalogLookup({ recorder });
const library = directory.resolve(libraryId), entry = directory.entry?.(libraryId);
const out = o => console.log(JSON.stringify(o));
if (!library || !entry) { out({ libraryId, error: 'not in directory' }); process.exit(0); }
for (const bookKey of keys) {
  last = {}; const t = Date.now(); const row = { libraryId, platform: entry.platform, bookKey, publicAvailability: library.capabilities?.publicAvailability };
  // As holdings.js: the catalog's robots.txt is read while the book resolves.
  if (library.capabilities?.publicAvailability) lookup.prepare?.(entry);
  try {
    let resolved = null, metadataFailed = false;
    try { resolved = await books.resolve(bookKey); } catch (e) { metadataFailed = true; row.metadataError = e.code || e.message; }
    const parsed = parsePublicBookKey(bookKey);
    const book = { bookKey, title: resolved?.title || '', authors: resolved?.authors || [] };
    if (parsed?.kind === 'isbn') book.isbn13 = parsed.isbn13; else if (resolved?.isbn13) book.isbn13 = resolved.isbn13;
    if (parsed?.kind === 'source') book.workId = parsed.sourceRecordId; else if (resolved?.workId) book.workId = resolved.workId;
    row.title = book.title.slice(0, 40); row.resolvedIsbn = book.isbn13 || ''; row.resolveMs = Date.now() - t;
    const tl = Date.now();
    // As holdings.js: the library's deadline counts from the request (askedAt).
    const a = await lookup.lookupBook({ library: entry, publicLibrary: library, book, books, editionScope: 'work', storedChecked: true, background: false,
      askedAt: t, deadlineAt: t + 60000, finishBy: t + 110000 });
    await new Promise(r => setTimeout(r, 50));
    Object.assign(row, { outcome: a.outcome, reason: a.reason, evidence: a.evidence, requests: a.requests, lookupMs: Date.now() - tl, errorCode: last.health?.errorCode || a.errorCode || '', linkKind: a.catalogLinkKind,
      foundBy: last.event?.foundBy ?? null, matchCount: last.event?.matchCount ?? 0, matches: a.matches || [] });
  } catch (e) { row.thrown = e.code || e.name; row.message = String(e.message).slice(0, 200); }
  row.ms = Date.now() - t; out(row);
}
process.exit(0);
