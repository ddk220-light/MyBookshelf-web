import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const found = value => value?.outcome === 'found' && value.source === 'live';
const nonBookFormat = /serial|journal|magazine|periodical|bound\s*volume|newspaper|non[- ]?book|dvd|video|audio/i;

// Probe families retain their original evidence. Normalize observations, never
// their claimed pass counts: a boolean or HTTP 200 alone cannot establish a pass.
export function normalizeBook(book) {
  const recordId = String(book.recordId || '');
  const title = book.title || book.resolved?.title || book.resolve?.title || book.query;
  const search = book.search || {};
  const queried = (search.matchingRecord === true || search.sameRecord === true
    || (recordId && search.matchingRecord === recordId) || book.queriedRecordFound === true)
    && search.ok !== false && search.matchingRecord !== false && search.sameRecord !== false
    && (!search.matchedRecordId || String(search.matchedRecordId) === recordId);
  const resolvedTitle = book.resolve?.title || book.resolved?.title;
  const resolved = (book.resolve?.ok === true || Boolean(book.resolved?.title && book.resolved?.observation))
    && book.resolve?.ok !== false
    && (!book.resolve?.recordId || String(book.resolve.recordId) === recordId)
    && (!book.resolved?.recordId || String(book.resolved.recordId) === recordId)
    && Boolean(resolvedTitle && titleKey(resolvedTitle) === titleKey(title));
  const isbnLookup = book.isbnLookup || book.isbnHoldings;
  const lookup = book.lookup || book.holdings || book.answer;
  const ownAnswer = found(lookup) && (!lookup.recordId || String(lookup.recordId) === recordId);
  const acceptedAttempt = [book.pass,book.passed,book.catalogPass,book.verified].every(value=>value!==false);
  return { recordId, sourceRecordId: String(book.queriedSourceId || book.sourceRecordId || recordId), title, key: titleKey(title), queried, resolved,
    completeAttempt: Boolean(queried && resolved && ownAnswer && acceptedAttempt),
    eligibleBook: book.eligibleBook !== false && book.countedForBookRequirement !== false
      && !book.exclusion
      && !nonBookFormat.test(book.resolve?.observation?.format || book.resolved?.observation?.format || book.observation?.format || ''),
    found: found(lookup), lookup, isbnLookup,
    isbn: book.isbn13 || book.isbn || book.resolved?.isbn13 || null,
    timestamp: book.finishedAt || book.startedAt || null };
}

export function summarizeEvidence(manifest, sources) {
  const aliases = new Map();
  for (const candidate of manifest.candidates) {
    aliases.set(candidate.libraryId, candidate.libraryId);
    for (const id of candidate.alternateLibraryIds || []) aliases.set(id, candidate.libraryId);
  }
  const selected = new Set(manifest.selectedLibraryIds);
  const libraries = new Map();
  for (const { file, data } of sources) for (const source of data.includeInCoverage === false ? [] : data.libraries || data.results || []) {
    const routeId = source.libraryId || source.id;
    if (!routeId) continue;
    const id = aliases.get(routeId) || routeId;
    if (!libraries.has(id)) libraries.set(id, { libraryId: id, name: source.name, selected: selected.has(id), routes: new Map() });
    const library = libraries.get(id);
    // Different catalog routes can use the same numeric record ID. Evidence
    // may be joined across runs of one route, never across unrelated catalogs.
    if (!library.routes.has(routeId)) library.routes.set(routeId, { routeId, records: new Map(), sources: new Set(), attempted: false, runs: [] });
    const route = library.routes.get(routeId);
    route.sources.add(file);
    route.attempted ||= !['not_attempted','pending','unsupported'].includes(source.status)
      && Boolean(source.books?.length || source.discovery?.length || source.errors?.length);
    route.runs.push({file,status:source.status,reason:source.reason,startedAt:source.startedAt,finishedAt:source.finishedAt});
    for (const raw of source.books || []) {
      const book = normalizeBook(raw);
      if (!book.recordId || !book.key) continue;
      const identity = `${book.recordId}\0${book.key}`;
      if (!route.records.has(identity)) route.records.set(identity, { ...book, evidenceFiles: new Set([file]) });
      else {
        const existing = route.records.get(identity);
        existing.completeAttempt ||= book.completeAttempt;
        existing.eligibleBook &&= book.eligibleBook;
        if (book.isbnLookup) existing.isbnLookup = book.isbnLookup;
        existing.isbn ||= book.isbn;
        existing.evidenceFiles.add(file);
      }
    }
  }
  for (const id of selected) if (!libraries.has(id)) libraries.set(id, {
    libraryId: id, name: manifest.candidates.find(c => c.libraryId === id)?.name, selected: true, routes: new Map(),
  });
  const rows = [...libraries.values()].map(library => {
    const titles = new Set();
    const routes = [...library.routes.values()].map(route => {
      const records = new Set(), routeTitles = new Set();
      const books = [...route.records.values()].filter(book => {
        if (!book.eligibleBook || !book.completeAttempt || records.has(book.sourceRecordId) || routeTitles.has(book.key)) return false;
        records.add(book.sourceRecordId); routeTitles.add(book.key); titles.add(book.key); return true;
      });
      const isbnChecks = [...route.records.values()].filter(book => book.isbnLookup);
      return { libraryId: route.routeId, verifiedBooks: books.length, attemptedRecords: route.records.size,
        attempted: route.attempted, runs: route.runs,
        isbnChecks: isbnChecks.length, isbnFound: isbnChecks.filter(book => found(book.isbnLookup)).length,
        evidenceFiles: [...route.sources], books: books.map(book => ({
          recordId: book.recordId, title: book.title, evidenceFiles: [...book.evidenceFiles],
        })) };
    });
    // Ten must work through one connected route; do not assemble ten from
    // several partially working alternate catalogs or duplicate editions.
    const verifiedBooks = Math.max(0, ...routes.map(route => route.verifiedBooks));
    return { libraryId: library.libraryId, name: library.name, selected: library.selected,
      attempted: routes.some(route=>route.attempted), verifiedBooks, tenBooksVerified: verifiedBooks >= 10, routes };
  });
  rows.sort((a,b) => Number(b.selected)-Number(a.selected) || a.libraryId.localeCompare(b.libraryId));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(),
    method: 'Distinct titles and exact catalog records with explicit query match, record resolution and live app found evidence; ISBN checks separate. One institution counted once; ten books must pass on one route.',
    selectedInstitutions: selected.size,
    selectedTenBooksVerified: rows.filter(row => row.selected && row.tenBooksVerified).length,
    additionalDirectoryEntriesReviewed: rows.filter(row => !row.selected).length,
    additionalDirectoryEntriesChecked: rows.filter(row => !row.selected && row.attempted).length,
    additionalTenBooksVerified: rows.filter(row => !row.selected && row.tenBooksVerified).length,
    additionalEntriesWithAtLeastOneBookVerified: rows.filter(row => !row.selected && row.verifiedBooks > 0).length,
    libraries: rows };
}

export function renderSummary(report, manifest) {
  const cell = value => String(value || '').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
  const selected = manifest.selectedLibraryIds.map(id=>report.libraries.find(row=>row.libraryId===id));
  const extra = report.libraries.filter(row=>!row.selected&&row.tenBooksVerified);
  const families = new Map();
  for (const row of report.libraries.filter(row => !row.selected)) {
    const family = row.libraryId.split(':')[0];
    if (!families.has(family)) families.set(family, { reviewed: 0, attempted: 0, one: 0, ten: 0 });
    const totals = families.get(family);
    totals.reviewed++; totals.attempted += Number(row.attempted);
    totals.one += Number(row.verifiedBooks > 0); totals.ten += Number(row.tenBooksVerified);
  }
  const status = row => row.tenBooksVerified ? 'Ten books verified' : row.verifiedBooks ? 'Incomplete' : row.attempted ? 'Unresolved; see evidence' : 'Not verified';
  return `# Indian library validation results\n\nSnapshot: ${report.generatedAt}. Re-run the summary tool after updating evidence.\n\n`
    + `**Frozen cohort: ${report.selectedTenBooksVerified}/${report.selectedInstitutions} institutions have ten verified books.** `
    + `${report.additionalTenBooksVerified} additional entries have ten. The size-led cohort is not an exact national ranking; [selection and sources](ranking-notes.md) explain the limits.\n\n`
    + `Across wider checks, **${report.additionalEntriesWithAtLeastOneBookVerified} additional directory entries have at least one verified book**, out of ${report.additionalDirectoryEntriesChecked} actually attempted and ${report.additionalDirectoryEntriesReviewed} reviewed. This includes the additional ten-book entries. These are catalog connections; branches and uncertain duplicate institutions must not be presented as a unique-library census. Deferred members of a blocked host are excluded from the attempted count.\n\n`
    + `A pass requires an explicit matching query, a resolved record with matching title, and a live app answer in one complete attempt. Ten must pass on one route. Failed attempts, cold ISBN checks, cache conditions, non-book exclusions, and endpoint diagnostics remain in the [source evidence](README.md). A holding does not necessarily mean a borrowable copy.\n\n`
    + `## Frozen cohort\n\n| Institution | Verified books | Result |\n| --- | ---: | --- |\n`
    + selected.map(row=>`| ${cell(row.name)} | ${row.verifiedBooks} | ${status(row)} |`).join('\n')
    + `\n\n## Additional ten-book checks\n\nReserves remain outside the frozen denominator; other entries were explored independently. Known alternate routes are attributed to their existing institution.\n\n| Institution / connection | Verified books | ID |\n| --- | ---: | --- |\n`
    + extra.map(row=>`| ${cell(row.name)} | ${row.verifiedBooks} | \`${row.libraryId}\` |`).join('\n')
    + `\n\n## Wider coverage by directory family\n\nOnly connections outside the frozen 50 appear here. Family labels follow the canonical directory ID; the evidence identifies the actual route used, including alternates. Ten-book entries are included in the one-book column.\n\n| Directory family | Reviewed | Attempted | At least one book | Ten books |\n| --- | ---: | ---: | ---: | ---: |\n`
    + [...families.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, total]) => `| ${cell(name)} | ${total.reviewed} | ${total.attempted} | ${total.one} | ${total.ten} |`).join('\n')
    + `\n\n## e-Granthalaya fifty-title audit\n\nA separate audit on 10 November 2026 searched all 5,036 e-Granthalaya libraries in the directory for the same fifty titles: 3,135 returned books, 1,890 returned a valid empty result for all fifty and 11 had request or setup errors. The 1,890 are recorded as empty catalogs, except IUCAA, which later passed a one-book check ([empty-catalogs.json](../india-library-status/empty-catalogs.json), which also lists 155 empty LIBMAN tenants). Only libraries on the India allowlist ([server/data/india-catalogs-listed.json](../../../server/data/india-catalogs-listed.json)) are offered when finding a library; every other library still resolves for readers who already chose one. See [the audit evidence](egranthalaya-audit-20261110/README.md).\n\n## Inspecting or updating results\n\n[coverage.csv](coverage.csv) provides a sortable row for every reviewed connection. [summary.json](summary.json) links each counted record to its original evidence files and lists all reviewed entries, including those with no verified books. The source files preserve failures and timing. No stored answer, periodical, title-only guess, or other institution's record can satisfy the count.\n\nRun from the repository root:\n\n\`\`\`sh\nnode --test tools/catalog-hardening/*.test.mjs\nnode tools/catalog-hardening/summarize.mjs\n\`\`\`\n\nSee [methodology and reproduction](README.md) before sending live requests. Changes are on a branch excluded from Vercel deployments; this audit is not a deployment.\n`;
}

export function renderCoverage(report) {
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = report.libraries.map(row => [row.libraryId, row.name,
    row.selected ? 'frozen priority cohort' : 'additional connection', row.attempted,
    row.verifiedBooks, row.tenBooksVerified,
    [...new Set(row.routes.flatMap(route => route.evidenceFiles))].join('; ')]);
  return [['library_id', 'name', 'cohort', 'attempted', 'verified_books', 'ten_books_verified', 'evidence_files'], ...rows]
    .map(row => row.map(quote).join(',')).join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '../../docs/research/india-library-hardening'));
  const manifest = JSON.parse(await readFile(join(directory, 'candidates.json'), 'utf8'));
  const files = (await readdir(directory)).filter(file => file.endsWith('-results.json')).sort();
  const sources = await Promise.all(files.map(async file => ({ file, data: JSON.parse(await readFile(join(directory,file),'utf8')) })));
  const report = summarizeEvidence(manifest,sources);
  await writeFile(join(directory,'summary.json'), JSON.stringify(report,null,2)+'\n');
  await writeFile(join(directory,'RESULTS.md'), renderSummary(report,manifest));
  await writeFile(join(directory,'coverage.csv'), renderCoverage(report));
  console.log(JSON.stringify({ ...report, libraries: undefined }));
}
