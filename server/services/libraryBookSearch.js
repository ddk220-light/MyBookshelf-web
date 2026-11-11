import { validateAndNormalize } from './isbn.js';
import { isPrintEdition } from './workDiscovery.js';
import ISBN from 'isbn3';

// Fold Latin accents (é → e) but keep combining marks in other scripts.
// Devanagari and Tamil vowel signs are marks: removing them makes different
// titles compare equal (राम and रोम, கடல் and கடலை).
const normalize = value => String(value || '').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
  .replace(/[\u200c\u200d]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const titleParts = value => String(value || '').split(/\s+\/\s+/)[0].split(/\s*:\s*/);
const unique = values => [...new Set(values.filter(Boolean))];

function relatedAuthor(a, b) {
  const left = normalize(a).split(' ').filter(word => word.length > 1);
  const right = normalize(b).split(' ').filter(word => word.length > 1);
  // Ignore order and initials, but require a shared full name token. Author
  // similarity only supports a possible match, never a work-ID equivalence.
  return left.some(word => right.includes(word));
}

export function matchCatalogRecord(record, profile) {
  if (!record?.title || !isPrintEdition(record)) return null;
  if (record.language && profile.language && record.language !== profile.language) return null;
  const titles = profile.titles || [profile.book.title];
  const sameTitle = (expected, actual) => {
    const left = titleParts(expected), right = titleParts(actual);
    if (normalize(left.join(' ')) === normalize(right.join(' '))) return true;
    const optionalSubtitle = parts => parts.length === 1 || /^(?:(?:an?|the) )?(?:autobiography|novel|memoir|illustrated edition|large print edition)\b/.test(normalize(parts.slice(1).join(' ')));
    return normalize(left[0]) === normalize(right[0]) && optionalSubtitle(left) && optionalSubtitle(right);
  };
  const titleMatch = titles.some(title => sameTitle(title, record.title));
  const distinctions = /\b(study guide|graphic novel|adaptation|abridged|summary|workbook|box set|boxed set)\b/i;
  if (distinctions.test(record.title) && !titles.some(title => normalize(title) === normalize(record.title))) return null;
  // Preserve numbered/revised editions instead of erasing those differences.
  const revision = value => normalize(value).match(/\b(?:\d+(?:st|nd|rd|th)?|revised) edition\b/)?.[0];
  if (revision(record.title) && !titles.some(title => revision(title) === revision(record.title))) return null;
  const recordAuthors = Array.isArray(record.authors) ? record.authors : [record.author].filter(Boolean);
  const authorMatch = recordAuthors.some(author => profile.authors.some(expected => relatedAuthor(expected, author)));
  const isbns = unique([record.isbn, record.isbn13, ...(record.isbns || [])].map(validateAndNormalize));
  const knownIsbn = isbns.find(isbn => profile.isbns.includes(isbn));
  if (knownIsbn && titleMatch && (!recordAuthors.length || !profile.authors.length || authorMatch)) {
    return { matchKind: knownIsbn === profile.book.isbn13 ? 'exact_isbn' : 'verified_work', isbn13: knownIsbn };
  }
  if (titleMatch && authorMatch) return { matchKind: 'possible_match', ...(isbns[0] ? { isbn13: isbns[0] } : {}) };
  return null;
}

// Small, fixed budgets apply even to works with hundreds of known editions.
// Provider functions retain their own transport deadlines; after this deadline
// no further requests are scheduled and late results cannot alter the response.
export async function searchLibraryBook(provider, profile, { timeoutMs = 20_000, maxIsbns = 6, maxRecords = 6 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const summary = { isbnQueries: 0, titleQueries: 0, recordsChecked: 0, partial: !profile.complete, editionsComplete: profile.complete };
  const positives = [], seen = new Set();
  const searchCandidates = provider.searchBookCandidates || provider.searchCatalog;
  let failures = profile.expansionFailed ? 1 : 0;
  let failureCode;
  let completed = 0;
  const attempt = async task => {
    if (Date.now() >= deadline) { failures++; failureCode ||= 'CATALOG_TIMEOUT'; return null; }
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Catalog search deadline exceeded')), Math.max(1, deadline - Date.now()));
      })]);
      completed++;
      return value;
    } catch (error) {
      failures++;
      failureCode ||= /^CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code
        : /deadline|timeout/i.test(error?.message || '') || error?.name === 'AbortError' ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
      return null;
    }
    finally { clearTimeout(timer); }
  };
  const addRecord = record => {
    const match = matchCatalogRecord(record, profile);
    const observation = record?.observation;
    if (!match || !observation || !['available', 'none_available', 'in_catalog', 'unknown'].includes(observation.outcome)) return;
    positives.push({ ...observation,
      outcome: match.matchKind === 'possible_match' ? 'in_catalog' : observation.outcome,
      matchKind: match.matchKind, lookupKind: match.matchKind === 'possible_match' ? 'title_author' : match.matchKind,
      recognizedExact: match.matchKind !== 'possible_match',
      catalogUrl: record.catalogUrl || observation.catalogUrl,
      matchedBook: { title: record.title, ...(match.isbn13 ? { isbn13: match.isbn13 } : {}) },
    });
  };
  async function byIsbn(isbn) {
    if (!provider.checkAvailability || Date.now() >= deadline) return;
    summary.isbnQueries++;
    // Empty metadata prevents adapters from silently substituting their own
    // title fallback for an ISBN whose identity we haven't verified.
    const result = await attempt(() => provider.checkAvailability(isbn, '', ''));
    const legacyPositive = ['available', 'checked_out', 'waitlist'].includes(result?.status);
    if (legacyPositive || (result?.matchKind === 'exact_isbn' && ['available', 'none_available', 'in_catalog', 'unknown'].includes(result.outcome))) {
      const canonical = validateAndNormalize(isbn);
      const kind = canonical === profile.book.isbn13 ? 'exact_isbn' : 'verified_work';
      positives.push({ ...result, ...(legacyPositive ? { outcome: result.status === 'available' ? 'available' : 'none_available',
        totalCopies: result.copies, catalogUrl: result.url } : {}), matchKind: kind, lookupKind: kind,
        matchedBook: { title: profile.book.title, isbn13: canonical } });
    } else if (result && !(result.outcome === 'not_found' && result.recognizedExact)) failures++;
  }
  async function byTitle(query) {
    if (!searchCandidates || Date.now() >= deadline) return;
    summary.titleQueries++;
    const response = await attempt(() => searchCandidates.call(provider, query));
    const records = Array.isArray(response) ? response : response?.records;
    if (response?.hasMore) summary.partial = true;
    if (!Array.isArray(records)) return;
    if (records.length > maxRecords) summary.partial = true;
    for (const candidate of records) {
      if (seen.has(candidate.recordId)) continue;
      if (summary.recordsChecked >= maxRecords || Date.now() >= deadline) { summary.partial = true; break; }
      seen.add(candidate.recordId); summary.recordsChecked++;
      const record = candidate.observation ? candidate : await attempt(() => provider.resolveCatalogRecord?.(candidate.recordId));
      if (!record) failures++;
      addRecord(record);
    }
  }
  const identifiers = unique(profile.isbns.flatMap(isbn => [isbn, ISBN.parse(isbn)?.isbn10]));
  const isbns = identifiers.slice(0, maxIsbns);
  if (identifiers.length > isbns.length) summary.partial = true;
  const queries = unique([[profile.titles[0], profile.authors[0]].filter(Boolean).join(' '), profile.titles[0], profile.titles[1]]).slice(0, 3);
  // Start textual recovery early; a missing ISBN must not consume the whole
  // budget before the library gets a title/author query.
  await Promise.all([isbns[0] ? byIsbn(isbns[0]) : null, queries[0] ? byTitle(queries[0]) : null]);
  for (let index = 1; index < Math.max(isbns.length, queries.length); index++) {
    if (positives.some(item => item.outcome === 'available' && item.matchKind !== 'possible_match')) break;
    await Promise.all([isbns[index] ? byIsbn(isbns[index]) : null, queries[index] ? byTitle(queries[index]) : null]);
  }
  const rank = value => (value.matchKind === 'possible_match' ? 0 : 10) + ({ available: 4, in_catalog: 3, none_available: 2, unknown: 1 }[value.outcome] || 0);
  positives.sort((a, b) => rank(b) - rank(a));
  summary.partial ||= failures > 0;
  if (positives.length) return { ...positives[0], searchSummary: summary };
  if (failures || !completed) return { outcome: 'unknown', searchSummary: summary, errorCode: failureCode || 'CATALOG_INCOMPLETE' };
  return { outcome: 'no_match', searchSummary: summary };
}
