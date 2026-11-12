import { validateAndNormalize } from './isbn.js';
import { isPrintEdition } from './workDiscovery.js';
import ISBN from 'isbn3';
import { withCatalogOperation } from './providers/http.js';

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

const distinctions = /\b(study guide|graphic novel|adaptation|abridged|summary|workbook|box set|boxed set)\b/i;
const revision = value => normalize(value).match(/\b(?:\d+(?:st|nd|rd|th)?|revised) edition\b/)?.[0];

function sameTitle(expected, actual) {
  const left = titleParts(expected), right = titleParts(actual);
  if (normalize(left.join(' ')) === normalize(right.join(' '))) return true;
  const optionalSubtitle = parts => parts.length === 1 || /^(?:(?:an?|the) )?(?:autobiography|novel|memoir|illustrated edition|large print edition)\b/.test(normalize(parts.slice(1).join(' ')));
  return normalize(left[0]) === normalize(right[0]) && optionalSubtitle(left) && optionalSubtitle(right);
}

// Title rules shared by full records and search-result rows.
function titleAgrees(title, profile) {
  const titles = profile.titles || [profile.book.title];
  if (!titles.some(expected => sameTitle(expected, title))) return false;
  if (distinctions.test(title) && !titles.some(expected => normalize(expected) === normalize(title))) return false;
  // Preserve numbered/revised editions instead of erasing those differences.
  if (revision(title) && !titles.some(expected => revision(expected) === revision(title))) return false;
  return true;
}

const authorsOf = record => Array.isArray(record.authors) ? record.authors : [record.author].filter(Boolean);
const authorAgrees = (record, profile) => authorsOf(record).some(author => profile.authors.some(expected => relatedAuthor(expected, author)));
const isbnsOf = record => unique([record.isbn, record.isbn13, ...(record.isbns || [])].map(validateAndNormalize));

export function matchCatalogRecord(record, profile) {
  if (!record?.title || !isPrintEdition(record)) return null;
  if (record.language && profile.language && record.language !== profile.language) return null;
  if (!titleAgrees(record.title, profile)) return null;
  const recordAuthors = authorsOf(record);
  const authorMatch = authorAgrees(record, profile);
  const isbns = isbnsOf(record);
  const knownIsbn = isbns.find(isbn => profile.isbns.includes(isbn));
  if (knownIsbn && (!recordAuthors.length || !profile.authors.length || authorMatch)) {
    return { matchKind: knownIsbn === profile.book.isbn13 ? 'exact_isbn' : 'verified_work', isbn13: knownIsbn };
  }
  if (authorMatch) return { matchKind: 'possible_match', ...(isbns[0] ? { isbn13: isbns[0] } : {}) };
  return null;
}

// A search-result row is worth opening only if its own title/author do not
// already rule it out. Rows that show one of the work's ISBNs come first (they
// can prove the edition), then rows with no ISBN shown (opening one may reveal
// it), then rows showing another ISBN (at best a similar edition).
export function candidateTier(row, profile) {
  if (!row?.title || !isPrintEdition(row)) return null;
  if (row.language && profile.language && row.language !== profile.language) return null;
  if (!titleAgrees(row.title, profile)) return null;
  if (authorsOf(row).length && profile.authors.length && !authorAgrees(row, profile)) return null;
  const isbns = isbnsOf(row);
  if (isbns.some(isbn => profile.isbns.includes(isbn))) return 1;
  return isbns.length ? 3 : 2;
}

// The availability API function may run for 120 s and the client shows a
// "still checking" hint after 5 s. Slow catalogs (Anna Centenary and
// Kalaignar Centenary answer in 4–9 s per request) declare a longer budget in
// the directory; no check may run past 45 s.
export const DEFAULT_CHECK_MS = 20_000;
export const MAX_CHECK_MS = 45_000;
export function checkBudgetMs(library) {
  const configured = Number(library?.publicCatalogTimeoutMs);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, MAX_CHECK_MS) : DEFAULT_CHECK_MS;
}

// Hard caps on upstream HTTP requests for one check. Catalogs with a
// structured candidate search (Koha title search, Visakhapatnam) normally use
// one search plus one or two record reads.
export const TITLE_FIRST_MAX_REQUESTS = 6;
export const LEGACY_MAX_REQUESTS = 12;

// Small, fixed budgets apply even to works with hundreds of known editions.
// Provider functions retain their own transport deadlines; after this deadline
// no further requests are scheduled and late results cannot alter the response.
export async function searchLibraryBook(provider, profile, options = {}) {
  const titleFirst = typeof provider.findBookCandidates === 'function';
  const maxRequests = options.maxRequests ?? (titleFirst ? TITLE_FIRST_MAX_REQUESTS : LEGACY_MAX_REQUESTS);
  return withCatalogOperation({ maxRequests }, operation => runSearch(provider, profile, {
    timeoutMs: DEFAULT_CHECK_MS, maxIsbns: 6, maxRecords: titleFirst ? 3 : 6, ...options, maxRequests, titleFirst, operation }));
}

async function runSearch(provider, profile, { timeoutMs, maxIsbns, maxRecords, maxRequests, titleFirst, operation }) {
  const deadline = Date.now() + timeoutMs;
  const summary = { isbnQueries: 0, titleQueries: 0, recordsChecked: 0, requests: 0, maxRequests, partial: !profile.complete, editionsComplete: profile.complete };
  const positives = [], seen = new Set();
  const searchCandidates = provider.searchBookCandidates || provider.searchCatalog;
  let failures = profile.expansionFailed ? 1 : 0;
  let failureCode;
  let completed = 0;
  const budgetLeft = () => operation.requests < operation.maxRequests;
  const confident = () => positives.some(item => item.outcome === 'available' && item.matchKind !== 'possible_match');
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
      // A catalog that cannot run this kind of lookup has not failed.
      if (['CATALOG_TITLE_SEARCH_REQUIRED', 'CATALOG_QUERY_UNSUPPORTED'].includes(error?.code)) { summary.partial = true; return null; }
      failures++;
      failureCode ||= error?.code === 'CATALOG_REQUEST_BUDGET' ? 'CATALOG_INCOMPLETE'
        : /^CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code
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
    if (!provider.checkAvailability || provider.isbnLookup === false || Date.now() >= deadline) return;
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
  async function readRecords(candidates) {
    for (const candidate of candidates) {
      if (confident()) break;
      if (seen.has(candidate.recordId)) continue;
      if (candidate.observation) { seen.add(candidate.recordId); addRecord(candidate); continue; }
      if (titleFirst && candidate.tier === 3 && positives.length) continue;
      if (summary.recordsChecked >= maxRecords || Date.now() >= deadline || !budgetLeft()) { summary.partial = true; break; }
      seen.add(candidate.recordId); summary.recordsChecked++;
      const record = await attempt(() => provider.resolveCatalogRecord?.(candidate.recordId));
      if (record) addRecord(record);
    }
  }
  async function byTitle(query) {
    if (!searchCandidates || Date.now() >= deadline) return;
    summary.titleQueries++;
    const response = await attempt(() => searchCandidates.call(provider, query));
    const records = Array.isArray(response) ? response : response?.records;
    if (response?.hasMore) summary.partial = true;
    if (!Array.isArray(records)) return;
    if (records.length > maxRecords) summary.partial = true;
    await readRecords(records);
  }
  const identifiers = unique(profile.isbns.flatMap(isbn => [isbn, ISBN.parse(isbn)?.isbn10]));
  if (titleFirst) {
    // Title first: on these catalogs one search shows every candidate's title,
    // authors and often its ISBN, while an ISBN search only succeeds when the
    // library recorded that exact ISBN. Lookups run one at a time: requests to
    // one catalog host are queued, so parallel lookups only delay each other.
    const mainTitle = title => titleParts(title)[0];
    const searches = [];
    for (const title of profile.titles.filter(Boolean)) {
      if (!searches.some(search => normalize(mainTitle(search.title)) === normalize(mainTitle(title)))) searches.push({ title, author: profile.authors[0] || '' });
    }
    let candidatesFound = false, searchFailed = false;
    for (const search of searches.slice(0, 2)) {
      if (candidatesFound || confident()) break;
      if (!budgetLeft()) { summary.partial = true; break; }
      summary.titleQueries++;
      const before = failures;
      const response = await attempt(() => provider.findBookCandidates(search));
      const records = Array.isArray(response) ? response : response?.records;
      if (failures > before) { searchFailed = true; break; }
      if (!Array.isArray(records)) continue;
      if (response?.hasMore) summary.partial = true;
      const ranked = records.map((row, index) => ({ ...row, tier: candidateTier(row, profile), index }))
        .filter(row => row.tier).sort((a, b) => a.tier - b.tier || a.index - b.index);
      candidatesFound = ranked.length > 0;
      await readRecords(ranked);
    }
    // Fall back to ISBNs (the reader's own edition first) only while nothing
    // has been found and the request budget allows. A catalog that just failed
    // the title search gets one ISBN attempt, not a run of likely failures.
    const isbns = unique([profile.book.isbn13, ...profile.isbns].map(validateAndNormalize)).filter(isbn => isbn && profile.isbns.includes(isbn));
    const isbnLimit = searchFailed ? 1 : maxIsbns;
    let tried = 0;
    for (const isbn of isbns) {
      if (positives.length || provider.isbnLookup === false || !provider.checkAvailability) break;
      if (tried >= isbnLimit || !budgetLeft()) { summary.partial = true; break; }
      if (tried && failures) break;
      if (Date.now() >= deadline) { failures++; failureCode ||= 'CATALOG_TIMEOUT'; break; }
      tried++;
      await byIsbn(isbn);
    }
  } else {
    const isbns = identifiers.slice(0, maxIsbns);
    if (identifiers.length > isbns.length) summary.partial = true;
    const queries = unique([[profile.titles[0], profile.authors[0]].filter(Boolean).join(' '), profile.titles[0], profile.titles[1]]).slice(0, 3);
    // Start textual recovery early; a missing ISBN must not consume the whole
    // budget before the library gets a title/author query.
    await Promise.all([isbns[0] ? byIsbn(isbns[0]) : null, queries[0] ? byTitle(queries[0]) : null]);
    for (let index = 1; index < Math.max(isbns.length, queries.length); index++) {
      if (confident()) break;
      if (!budgetLeft()) { summary.partial = true; break; }
      await Promise.all([isbns[index] ? byIsbn(isbns[index]) : null, queries[index] ? byTitle(queries[index]) : null]);
    }
  }
  summary.requests = operation.requests;
  const rank = value => (value.matchKind === 'possible_match' ? 0 : 10) + ({ available: 4, in_catalog: 3, none_available: 2, unknown: 1 }[value.outcome] || 0);
  positives.sort((a, b) => rank(b) - rank(a));
  summary.partial ||= failures > 0;
  if (positives.length) return { ...positives[0], searchSummary: summary };
  if (failures || !completed) return { outcome: 'unknown', searchSummary: summary, errorCode: failureCode || 'CATALOG_INCOMPLETE' };
  return { outcome: 'no_match', searchSummary: summary };
}
