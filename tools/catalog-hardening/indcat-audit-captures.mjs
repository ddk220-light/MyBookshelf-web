#!/usr/bin/env node
// Offline reparse of every holding-verified record in an IndCat live report.
// Raw anonymous catalog pages stay outside version control. This report records
// their hashes, exact scoped-search proof, and material type without form tokens.
// node tools/catalog-hardening/indcat-audit-captures.mjs \
//   --input docs/research/india-library-hardening/indcat-results.json \
//   --capture-dir /tmp/indcat-captures --output /tmp/indcat-capture-audit.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseIndcatSearch, parseIndcatRecord } from '../../server/services/providers/indcat.js';
import { attributes } from '../../server/services/providers/catalogMarkup.js';
import { getAllLibraries } from '../../server/services/directory.js';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1]) throw Error('Arguments must be --name value pairs.');
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
for (const name of ['input', 'capture-dir', 'output']) if (!args.has(name)) throw Error(`--${name} is required.`);
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const directory = args.has('directory') ? await readJson(args.get('directory')) : getAllLibraries();
const report = await readJson(args.get('input'));
const normalizedText = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const audit = {
  generatedAt: new Date().toISOString(), sourceReportUpdatedAt: report.updatedAt,
  method: 'Offline reparse of all holding-verified record captures using the current provider. Each confirmedMemberRecord requires the same record in a captured institution-scoped title search. Explicit serials remain excluded; absent MARC leaders remain unknown, not inferred to be books.',
  providerSha256: createHash('sha256').update(await fs.readFile(new URL('../../server/services/providers/indcat.js', import.meta.url))).digest('hex'),
  records: [],
};
for (const evidence of report.libraries) {
  const library = directory.find(entry => entry.id === evidence.id);
  if (!library) throw Error(`Directory is missing ${evidence.id}.`);
  for (const book of evidence.books.filter(entry => entry.holdingVerified || entry.passed)) {
    const record = { libraryId: evidence.id, code: evidence.code, recordId: book.recordId,
      query: book.query, countedAsBook: book.passed, exclusion: book.exclusion || null,
      originalFormat: book.resolved?.format || null, scopedSearchVerified: false, titleQueryVerified: false,
      recordVerified: false, resolvedMetadataMatches: false, captures: [] };
    const captures = [];
    for (const request of book.requests || []) {
      if (request.status !== 200 || !request.capture || !['title-search', 'resolve'].includes(request.stage)) continue;
      const html = await fs.readFile(path.join(args.get('capture-dir'), request.capture), 'utf8');
      captures.push({ ...request, html });
    }
    // GET is the institution preflight and can show unrelated discovery rows.
    // Only the explicit query's POST response proves that query returned this ID.
    for (const capture of captures.filter(entry => entry.stage === 'title-search' && entry.method === 'POST')) {
      try {
        const parsed = parseIndcatSearch(capture.html, evidence.code);
        if (parsed.records.some(entry => entry.recordId === book.recordId)) {
          record.scopedSearchVerified = true;
          record.titleQueryVerified = [...capture.html.matchAll(/<input\b([^>]*)>/gi)].map(match => attributes(match[1]))
            .some(input => input.name === 'title' && normalizedText(input.value) === normalizedText(book.query));
          record.captures.push({ stage: 'title-search', method: capture.method, file: capture.capture,
            sha256: createHash('sha256').update(capture.html).digest('hex') });
          break;
        }
      } catch { /* A scope/form preflight is not itself a result page. */ }
    }
    for (const capture of captures.filter(entry => entry.stage === 'resolve')) {
      try {
        const parsed = parseIndcatRecord(capture.html, library, book.recordId, null,
          { confirmedMemberRecord: record.scopedSearchVerified });
        if (parsed?.observation?.outcome !== 'in_catalog'
          || !parsed.observation.locations?.some(entry => entry.name === library.name)) continue;
        record.recordVerified = true;
        record.parsedFormat = parsed.format || null;
        record.parsedTitle = parsed.title;
        record.resolvedMetadataMatches = parsed.title === book.resolved?.title && (parsed.isbn || null) === (book.resolved?.isbn13 || null);
        record.captures.push({ stage: 'resolve', method: capture.method, file: capture.capture,
          sha256: createHash('sha256').update(capture.html).digest('hex') });
        break;
      } catch { /* A membership search within resolution is not a record page. */ }
    }
    record.needsAttention = !record.recordVerified || !record.resolvedMetadataMatches
      || (record.countedAsBook && (!record.scopedSearchVerified || !record.titleQueryVerified || record.parsedFormat === 'Serial'));
    audit.records.push(record);
  }
}
audit.summary = {
  records: audit.records.length,
  countedBooks: audit.records.filter(record => record.countedAsBook).length,
  scopedSearchVerified: audit.records.filter(record => record.scopedSearchVerified).length,
  titleQueryVerified: audit.records.filter(record => record.titleQueryVerified).length,
  recordVerified: audit.records.filter(record => record.recordVerified).length,
  resolvedMetadataMatches: audit.records.filter(record => record.resolvedMetadataMatches).length,
  explicitBooks: audit.records.filter(record => record.parsedFormat === 'Book').length,
  explicitSerials: audit.records.filter(record => record.parsedFormat === 'Serial').length,
  unspecifiedMaterial: audit.records.filter(record => record.recordVerified && !record.parsedFormat).length,
  needsAttention: audit.records.filter(record => record.needsAttention).length,
};
await fs.mkdir(path.dirname(path.resolve(args.get('output'))), { recursive: true });
await fs.writeFile(args.get('output'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify(audit.summary));
for (const record of audit.records.filter(entry => entry.needsAttention)) console.log(JSON.stringify(record));
if (audit.summary.needsAttention) process.exitCode = 1;
