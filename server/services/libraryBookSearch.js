import { validateAndNormalize } from './isbn.js';
import { isPrintEdition } from './workDiscovery.js';
import ISBN from 'isbn3';
import { withCatalogOperation, withCatalogSuboperation } from './providers/http.js';
import { MAX_CHECK_MS } from './catalog-lookup/platforms.js';

// Fold Latin accents (é → e) but keep combining marks in other scripts.
// Devanagari and Tamil vowel signs are marks: removing them makes different
// titles compare equal (राम and रोम, கடல் and கடலை).
const normalize = value => String(value || '').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
  .replace(/[\u200c\u200d]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const titleParts = value => String(value || '').split(/\s+\/\s+/)[0].split(/\s*:\s*/);
// Catalogs often drop a leading English article ("DISCOVERY OF INDIA" for "The
// Discovery of India", SRMS, 19 November 2026), so titles compare without it.
const titleKey = value => normalize(value).replace(/^(?:the|an?) (?=\S)/, '');
const unique = values => [...new Set(values.filter(Boolean))];
// Words compared without a final plural "s", only to find rows that might be
// the book under a variant title ("Concept of Physics" for "Concepts of
// Physics", HCDGC, 19 November 2026). Never used to match a book.
const stemKey = value => titleKey(value).split(' ').map(word => (word.length > 3 && /[^s]s$/.test(word) ? word.slice(0, -1) : word)).join(' ');
// The main title with its plural words made singular ("Concepts of physics"
// -> "Concept of physics"), or null when there is none. Catalogs whose title
// search matches words or substrings miss the singular form a library used.
export function singularTitleVariant(title) {
  const main = titleParts(title)[0].trim();
  if (nonLatinLetters(main)) return null;
  const variant = main.replace(/\b(\p{L}{3,})s\b/gu, (word, stem) => (/(?:s|u|i|ic)$/i.test(stem) ? word : stem));
  return variant !== main && /\p{L}/u.test(variant) ? variant : null;
}

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
  if (titleKey(left.join(' ')) === titleKey(right.join(' '))) return true;
  const optionalSubtitle = parts => parts.length === 1 || /^(?:(?:an?|the) )?(?:autobiography|novel|memoir|illustrated edition|large print edition)\b/.test(normalize(parts.slice(1).join(' ')));
  return titleKey(left[0]) === titleKey(right[0]) && optionalSubtitle(left) && optionalSubtitle(right);
}

// Title rules shared by full records and search-result rows.
function titleAgrees(title, profile) {
  const titles = profile.titles || [profile.book.title];
  if (!titles.some(expected => sameTitle(expected, title))) return false;
  if (distinctions.test(title) && !titles.some(expected => titleKey(expected) === titleKey(title))) return false;
  // Preserve numbered/revised editions instead of erasing those differences.
  if (revision(title) && !titles.some(expected => revision(expected) === revision(title))) return false;
  return true;
}

const authorsOf = record => Array.isArray(record.authors) ? record.authors : [record.author].filter(Boolean);
const authorAgrees = (record, profile) => authorsOf(record).some(author => profile.authors.some(expected => relatedAuthor(expected, author)));
const isbnsOf = record => unique([record.isbn, record.isbn13, ...(record.isbns || [])].map(validateAndNormalize));

// The family name of a personal name as catalogs and Open Library write it:
// the part before a comma ("Kalam, A. P. J. Abdul"), else the last word of
// two letters or more ("A. P. J. Abdul Kalam"). Null when there is none.
function surname(name) {
  const value = String(name || '');
  const words = normalize(value.includes(',') ? value.split(',')[0] : value).split(' ').filter(word => word.length > 1);
  return (value.includes(',') ? words[0] : words.at(-1)) || null;
}
// An author field that names a translator ("Dharmapurikar, Madhukar Tr",
// "tr.", "translated by", अनुवाद, மொழிபெயர்ப்பு).
const TRANSLATOR = /(?:^|[\s,.;:(\/[])(?:tr|trs|trans|transl|translator|translators|translated|translation|anuvadak|anuvad)(?=$|[\s.,;:)\]])|अनुवाद|மொழிபெயர்/iu;
// Stricter than authorAgrees (one shared word, which a common given name or
// "Kumar" satisfies): the row's author and one of the work's authors share a
// family name, in either name order. Used where agreement makes a "found".
function authorConfirms(record, profile) {
  return authorsOf(record).some(author => profile.authors.some(expected => {
    const left = normalize(expected).split(' '), right = normalize(author).split(' ');
    const mine = surname(expected), theirs = surname(author);
    return Boolean((mine && right.includes(mine)) || (theirs && left.includes(theirs)));
  }));
}

// How a catalog record or search row matches the work (`profile`), or null:
//   exact_isbn / verified_work  the row shows one of the work's ISBNs (the
//                               reader's own, or another edition's) and its
//                               title agrees;
//   title_author                no work ISBN shown, but the title agrees and
//                               the author's family name is one of the
//                               work's authors' (authorConfirms). Owner
//                               decision, 19 November 2026: this is "found",
//                               answered exactly like an ISBN match. A row
//                               that shows some other ISBN qualifies too (an
//                               edition Open Library does not list). Not a
//                               row that names a translator: a translation
//                               under the original title (Modern College
//                               Pune's Marathi "Malgudi Days", 19 November
//                               2026) is at most a possible match;
//   possible_match              title agrees and the authors share only a
//                               word (authorAgrees, not authorConfirms):
//                               "couldn't check" (unconfirmed).
// The title must agree under titleAgrees: the same title once a leading
// article is ignored, a subtitle optional only when it is one like "an
// autobiography", and no study guide, abridgement, numbered or revised edition
// the work's titles do not have. A volume or part ("Part 1", "Vol. 2") is a
// different title. Never the looser plural-stem comparison of relatedRow.
// A row with no author, or a work with no author, never makes a title match:
// a title alone is not enough to say "found" (such a row still blocks "not
// found", relatedRow). A row by another author is not a match either.
// A match only proves a holding through the record's own observation, which
// adapters give only for this library's records (searchLibraryBook, addRecord).
export function matchCatalogRecord(record, profile) {
  if (!record?.title || !isPrintEdition(record)) return null;
  if (record.language && profile.language && record.language !== profile.language) return null;
  if (!titleAgrees(record.title, profile)) return null;
  const isbns = isbnsOf(record);
  const knownIsbn = isbns.find(isbn => profile.isbns.includes(isbn));
  // The record shows one of the work's ISBNs and its title agrees: that is the
  // edition, whoever the catalog lists as author (co-authors and translators:
  // SRS Jammu lists Wings of Fire, ISBN 9788173711466, under "Tiwari, Arun").
  if (knownIsbn) {
    return { matchKind: knownIsbn === profile.book.isbn13 ? 'exact_isbn' : 'verified_work', isbn13: knownIsbn };
  }
  if (!authorsOf(record).length || !profile.authors?.length) return null;
  if (authorConfirms(record, profile) && !authorsOf(record).some(author => TRANSLATOR.test(author))) return { matchKind: 'title_author' };
  if (authorAgrees(record, profile)) return { matchKind: 'possible_match', ...(isbns[0] ? { isbn13: isbns[0] } : {}) };
  return null;
}

// When may a work search that matched nothing say "not found"? Only when the
// search could have proved the book was there and looked properly:
//   - the work has at least one known ISBN: without one no row can prove the
//     edition, so the search could never say "found" either (Godaan and
//     Ponniyin Selvan on 19 November: no ISBN in Open Library, "not found" at
//     32 to 37 of 48 libraries);
//   - a title search ran and the catalog answered it: ISBN lookups alone miss
//     every edition Open Library does not list (most Indian printings);
//   - no row in that search had a related title we could not rule out (a
//     multi-volume set, "Part 1", a longer title with the same words, the
//     same title under any author); a title with plural words is also
//     searched in the singular first;
//   - the title cannot hide behind another spelling or script: every known
//     title is in Latin script and the work's language is one written in it.
//     A Hindi or Tamil work may be catalogued as "Godan", "गोदान" or
//     "பொன்னியின் செல்வன்", which a search for "Godaan" never finds.
// Otherwise the answer is "couldn't check" (unconfirmed), never "not found".
const LATIN_SCRIPT_LANGUAGES = new Set(['eng', 'fre', 'ger', 'spa', 'ita', 'por', 'dut', 'swe', 'nor', 'nob', 'nno', 'dan', 'fin', 'ice', 'pol', 'cze', 'slo',
  'hun', 'rum', 'hrv', 'slv', 'tur', 'ind', 'may', 'vie', 'lat', 'cat', 'glg', 'baq', 'wel', 'gle', 'est', 'lav', 'lit', 'afr', 'swa', 'tgl', 'alb', 'mlt']);
const nonLatinLetters = value => /(?![\p{Script=Latin}])\p{L}/u.test(String(value || ''));
export function transliterationRisk(profile) {
  if (!LATIN_SCRIPT_LANGUAGES.has(String(profile?.language || '').toLowerCase())) return true;
  return (profile.titles || [profile.book?.title]).some(nonLatinLetters);
}
// A search row that contains one of the work's main titles, word for word
// (ignoring a leading article and final plural "s"), and that did not match:
// perhaps a volume of a set, the same book under a longer title, or the book
// with a wrong author field.
export function relatedRow(row, profile) {
  if (!row?.title || matchCatalogRecord(row, profile)) return false;
  // The row's author does not rule it out: small catalogs often put the
  // publisher there (LIBMAN 520 lists "APJAbdul Kalam Wing Of Fire" under
  // "Rupa", 19 November 2026). A same-title book by another author therefore
  // leaves the answer unconfirmed rather than risking a false "not found".
  const text = ` ${stemKey(titleParts(row.title).join(' '))} `;
  return (profile.titles || [profile.book?.title]).some(expected => {
    const main = stemKey(titleParts(expected)[0]);
    return main.length >= 3 && text.includes(` ${main} `);
  });
}
export function absenceRisk(summary, profile) {
  if (summary.partial || !summary.editionsComplete || profile?.complete === false) return 'partial';
  if (!profile?.isbns?.length) return 'no_isbns';
  if (!(summary.titleSearches > 0)) return 'no_title_search';
  if (summary.relatedTitles > 0) return 'related_titles';
  if (transliterationRisk(profile)) return 'other_script';
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
  const isbns = isbnsOf(row);
  // A row showing a work ISBN can prove the edition whatever its author says
  // (matchCatalogRecord).
  if (isbns.some(isbn => profile.isbns.includes(isbn))) return 1;
  if (authorsOf(row).length && profile.authors.length && !authorAgrees(row, profile)) return null;
  return isbns.length ? 3 : 2;
}

// The availability API function may run for 120 s. Every library's check may
// run up to 45 s (owner decision, 19 November 2026: one longer deadline for
// all instead of per slow host); a check ends as soon as it has its answer.
export const DEFAULT_CHECK_MS = MAX_CHECK_MS;
export { MAX_CHECK_MS };
export function checkBudgetMs() {
  return DEFAULT_CHECK_MS;
}

// Request caps for a search outside the lookup layer: the old `/availability`
// path for platforms not in CATALOG_LOOKUP_V2 (no shared host pacing there)
// and tools. A reader's check through the lookup layer has no request, ISBN
// or record caps (catalog-lookup/check.js; owner decision, 20 November 2026):
// its deadline and the shared host pacing bound it.
export const TITLE_FIRST_MAX_REQUESTS = 6;
export const LEGACY_MAX_REQUESTS = 12;
// ISBNs per search for catalogs that answer several at once (`checkIsbns`):
// the adapters' own limit for one query (koha.js and indcat.js
// MAX_BATCH_ISBNS), which keeps one search address a sensible length. A work
// with more editions is asked in several such searches.
export const BATCH_ISBNS = 8;
// A title search (legacy branch) that lists more rows than this does not
// prove absence: several adapters show only their first page or first rows,
// not always saying so. This is an absence rule, not a request cap: a reader's
// check still reads every row it was given.
export const ABSENCE_LIST_ROWS = 6;

// A proven match: the catalog showed this edition, or another edition of the
// work, by one of the work's ISBNs, its own record or an agreeing title and
// author (matchCatalogRecord), with a holding the app answers "found" for
// (outcome.js). A possible_match never is.
const HOLDING_OUTCOMES = new Set(['available', 'none_available', 'in_catalog']);
export function provesHolding(item) {
  if (!item || !item.matchKind || item.matchKind === 'possible_match') return false;
  return HOLDING_OUTCOMES.has(item.outcome) || (item.outcome === 'unknown' && item.recognizedExact === true && item.totalCopies > 0);
}
// An ISBN match ranks above a title-and-author one, which ranks above a possible match.
const rank = value => (value.matchKind === 'possible_match' ? 0 : value.lookupKind === 'title_author' ? 5 : 10)
  + ({ available: 4, in_catalog: 3, none_available: 2, unknown: 1 }[value.outcome] || 0);

// The search's ISBN side and title side run side by side from the start, in
// the order the owner set (runSearch, "The search order"); each side asks one
// thing at a time, so a check has at most a couple of requests waiting on the
// host, and every request waits for the host's shared pacing. Inside the lookup layer
// there is no request, ISBN or record cap: the deadline ends the search
// (catalog-lookup/check.js). Without the lookup layer the old small caps
// apply (`maxRequests`, `maxIsbns`, `maxRecords`, `maxTitles`). Provider
// functions retain their own transport deadlines; after this deadline no
// further requests are scheduled and late results cannot alter the response.
//
// The search ends at the first proven match (plan A2, step 1): the app's answer
// is "found" either way, so reading on for a copy marked available only costs
// the catalog requests and the reader time. Requests still in flight then are
// cancelled. `options.progress`, when given, holds the best proven match so far
// (`progress.best`), so a caller whose deadline arrives first can still answer
// with it instead of "couldn't check".
export async function searchLibraryBook(provider, profile, options = {}) {
  const titleFirst = typeof provider.findBookCandidates === 'function';
  const maxRequests = options.maxRequests ?? (titleFirst ? TITLE_FIRST_MAX_REQUESTS : LEGACY_MAX_REQUESTS);
  return withCatalogOperation({ maxRequests }, operation => {
    const stop = new AbortController();
    // The child scope adds only the cancellation: its cap is what is left of
    // the operation's, and every request still counts against the operation.
    return withCatalogSuboperation({ signal: stop.signal, maxRequests: Math.max(0, operation.maxRequests - operation.requests) }, search => runSearch(provider, profile, {
      timeoutMs: DEFAULT_CHECK_MS, maxIsbns: 6, maxRecords: titleFirst ? 3 : 6, maxTitles: 2, ...options, maxRequests, titleFirst, operation: search,
      stop: () => stop.abort() }));
  });
}

async function runSearch(provider, profile, { timeoutMs, maxIsbns, maxRecords, maxTitles, maxRequests, titleFirst, operation, progress = null, stop = () => {},
  readerIsbn = profile.book?.isbn13 }) {
  const deadline = Date.now() + timeoutMs;
  // An edition list that could not be read in full (profile.complete false,
  // including an Open Library failure) leaves the search partial: nothing
  // found is then "couldn't tell", never absence and never a catalog failure.
  const summary = { isbnQueries: 0, titleQueries: 0, titleSearches: 0, relatedTitles: 0, recordsChecked: 0, requests: 0,
    ...(Number.isFinite(maxRequests) ? { maxRequests } : {}), partial: !profile.complete, editionsComplete: profile.complete };
  // A title search the catalog answered, and its rows we could not rule out.
  const titleRows = [];
  const noteTitleSearch = records => {
    summary.titleSearches++;
    summary.relatedTitles += records.filter(row => relatedRow(row, profile)).length;
    titleRows.push(...records);
  };
  const positives = [], seen = new Set();
  let provenFound;
  const proven = new Promise(resolve => { provenFound = resolve; });
  // For the log line: whether the title search alone matched the work (one
  // of its rows agrees by title and author, or shows a work ISBN): true or
  // false once a title search has answered, null before.
  const titleAlsoMatched = () => (summary.titleSearches > 0
    ? titleRows.some(row => { const match = matchCatalogRecord(row, profile); return Boolean(match && match.matchKind !== 'possible_match'); }) : null);
  const withFoundBy = item => (item?.foundBy ? { ...item, titleAlsoMatched: item.foundBy === 'isbn' ? titleAlsoMatched() : true } : item);
  const addPositive = item => {
    positives.push(item);
    // A title-and-author match is kept too, so that a deadline arriving first
    // answers "unconfirmed" (with the catalog link) rather than "timeout".
    if (progress && !progress.possible && item.matchKind === 'possible_match') {
      progress.possible = { ...item, searchSummary: { ...summary, requests: operation.requests, partial: true } };
    }
    if (!provesHolding(item)) return;
    if (progress && (!progress.best || rank(item) > rank(progress.best))) {
      progress.best = withFoundBy({ ...item, searchSummary: { ...summary, requests: operation.requests, partial: true } });
    }
    provenFound();
  };
  const searchCandidates = provider.searchBookCandidates || provider.searchCatalog;
  let failures = 0;
  let failureCode;
  // A catalog's own failure code wins over CATALOG_INCOMPLETE, which only
  // means a caller's request cap or row limit ran out (never a reader's check,
  // which has none) and is not the catalog's failure.
  const noteFailure = code => { if (!failureCode || failureCode === 'CATALOG_INCOMPLETE') failureCode = code; };
  let completed = 0;
  const budgetLeft = () => operation.requests < operation.maxRequests;
  const confident = () => positives.some(provesHolding);
  // One lookup: its value (null when it failed), and whether this lookup
  // itself failed (`failed`; the ISBN and title sides run at once, so the
  // shared failure count cannot tell whose request it was).
  const attemptWith = async task => {
    if (Date.now() >= deadline) { failures++; noteFailure('CATALOG_TIMEOUT'); return { value: null, failed: true }; }
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Catalog search deadline exceeded')), Math.max(1, deadline - Date.now()));
      })]);
      completed++;
      return { value, failed: false };
    } catch (error) {
      // A catalog that cannot run this kind of lookup has not failed.
      if (['CATALOG_TITLE_SEARCH_REQUIRED', 'CATALOG_QUERY_UNSUPPORTED'].includes(error?.code)) { summary.partial = true; return { value: null, failed: false }; }
      failures++;
      if (['CATALOG_REQUEST_BUDGET', 'CATALOG_INCOMPLETE'].includes(error?.code)) failureCode ||= 'CATALOG_INCOMPLETE';
      else noteFailure(/^CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code
        : /deadline|timeout/i.test(error?.message || '') || error?.name === 'AbortError' ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE');
      return { value: null, failed: true };
    }
    finally { clearTimeout(timer); }
  };
  const attempt = async task => (await attemptWith(task)).value;
  // A record or row counts only with its own observation: adapters give one
  // only for this library's records (a member-scoped search row, or a record
  // page that shows this library's or branch's holding; a union catalog's or
  // shared catalog's record held elsewhere has none or fails), for an ISBN
  // and a title-and-author match alike.
  // `foundBy`: the search that produced the evidence, for the check's log
  // line only: 'title' (a title-search row), 'record' (a record page opened
  // from a title-search row) or 'isbn' (an ISBN request).
  const addRecord = (record, foundBy = 'title') => {
    const match = matchCatalogRecord(record, profile);
    const observation = record?.observation;
    if (!match || !observation || !['available', 'none_available', 'in_catalog', 'unknown'].includes(observation.outcome)) return;
    const possible = match.matchKind === 'possible_match', titleAuthor = match.matchKind === 'title_author';
    // A title-and-author match is answered as a verified match of the work
    // (found, outcome.js); `lookupKind: 'title_author'` keeps its evidence
    // apart for the stored answer and the log.
    addPositive({ ...observation,
      outcome: possible ? 'in_catalog' : observation.outcome,
      matchKind: titleAuthor ? 'verified_work' : match.matchKind, lookupKind: possible || titleAuthor ? 'title_author' : match.matchKind,
      recognizedExact: !possible,
      catalogUrl: record.catalogUrl || observation.catalogUrl,
      matchedBook: { title: record.title, ...(match.isbn13 ? { isbn13: match.isbn13 } : {}) },
      foundBy,
    });
  };
  async function byIsbn(isbn) {
    if (!provider.checkAvailability || provider.isbnLookup === false || Date.now() >= deadline) return;
    summary.isbnQueries++;
    // Empty metadata prevents adapters from silently substituting their own
    // title fallback for an ISBN whose identity we haven't verified.
    const { value: result, failed } = await attemptWith(() => provider.checkAvailability(isbn, '', ''));
    const legacyPositive = ['available', 'checked_out', 'waitlist'].includes(result?.status);
    if (legacyPositive || (result?.matchKind === 'exact_isbn' && ['available', 'none_available', 'in_catalog', 'unknown'].includes(result.outcome))) {
      const canonical = validateAndNormalize(isbn);
      const kind = canonical === profile.book.isbn13 ? 'exact_isbn' : 'verified_work';
      addPositive({ ...result, ...(legacyPositive ? { outcome: result.status === 'available' ? 'available' : 'none_available',
        totalCopies: result.copies, catalogUrl: result.url } : {}), matchKind: kind, lookupKind: kind,
        matchedBook: { title: profile.book.title, isbn13: canonical }, foundBy: 'isbn' });
    } else if (result && !(result.outcome === 'not_found' && result.recognizedExact)) { failures++; noteFailure('CATALOG_UNRECOGNIZED'); return false; }
    return !failed;
  }
  async function readRecords(list) {
    // With no cap on records read, the rows most likely to be the book are
    // opened first (candidateTier: a row showing a work ISBN, then one whose
    // title and author agree), so a holding is usually proven by the first
    // read; every row is still read before nothing found can count.
    const candidates = titleFirst ? list : list.map((row, index) => ({ row, index, tier: candidateTier(row, profile) || 9 }))
      .sort((a, b) => a.tier - b.tier || a.index - b.index).map(item => item.row);
    for (const candidate of candidates) {
      if (confident()) break;
      if (seen.has(candidate.recordId)) continue;
      // Where a row shows the record's full title (`rowTitlesReliable`), a row
      // whose title rules it out is not opened: it would only cost a request.
      // Rows with a related title already count against absence (relatedRow).
      if (!titleFirst && provider.rowTitlesReliable === true && candidate.title && !titleAgrees(candidate.title, profile)) continue;
      if (candidate.observation) { seen.add(candidate.recordId); addRecord(candidate); continue; }
      if (titleFirst && candidate.tier === 3 && positives.length) continue;
      const late = Date.now() >= deadline;
      if (late || summary.recordsChecked >= maxRecords || !budgetLeft()) {
        summary.partial = true;
        // A row left unread is not evidence of absence. Title-first rows
        // already agree with the work by title and author, and running out of
        // time is never a completed search.
        if (late) { failures++; noteFailure('CATALOG_TIMEOUT'); } else if (titleFirst) { failures++; failureCode ||= 'CATALOG_INCOMPLETE'; }
        break;
      }
      seen.add(candidate.recordId); summary.recordsChecked++;
      const { value: record, failed } = await attemptWith(() => provider.resolveCatalogRecord?.(candidate.recordId));
      if (record) addRecord(record, 'record');
      else if (!failed) { failures++; noteFailure('CATALOG_UNRECOGNIZED'); }
    }
  }
  async function byTitle(query) {
    if (!searchCandidates || Date.now() >= deadline) return;
    summary.titleQueries++;
    const response = await attempt(() => searchCandidates.call(provider, query));
    const records = Array.isArray(response) ? response : response?.records;
    if (response?.hasMore) summary.partial = true;
    if (!Array.isArray(records)) return;
    noteTitleSearch(records);
    // A long list is not used to prove absence: an adapter may have shortened
    // it without saying so (ABSENCE_LIST_ROWS). Every row is still read.
    if (records.length > Math.min(maxRecords, ABSENCE_LIST_ROWS)) summary.partial = true;
    await readRecords(records);
  }
  const ranked = records => records.map((row, index) => ({ ...row, tier: candidateTier(row, profile), index }))
    .filter(row => row.tier).sort((a, b) => a.tier - b.tier || a.index - b.index);

  // The search order (owner decision, 20 November 2026):
  //   1. A book reached by ISBN (a scan or an ISBN key): the reader's own ISBN
  //      and the title-and-author search start together, and the first
  //      conclusive find ends the check. Where the catalog can OR ISBNs, the
  //      work's other known editions ride along in that same single ISBN
  //      request (the reader's ISBN first); never an extra ISBN request.
  //   2. A book reached by title (a work key): the title-and-author search,
  //      plus at most one combined ISBN request where the catalog can OR
  //      ISBNs. Where it cannot, no ISBN search at all.
  //   3. A catalog without a title search: the ISBNs are the only evidence,
  //      batched where possible, otherwise one by one (two at a time where
  //      the catalog allows, platforms.js `requestsInFlight`), as fast as the
  //      shared host pacing lets.
  // The absence rule is unchanged (absenceRisk): "not found" needs an answered
  // title search with no related row; any failed request, the ISBN one
  // included, leaves the answer "couldn't check". At a catalog with a title
  // search the editions no ISBN request covered do not make it partial: the
  // title search is the evidence there, the ISBN request a second look for a
  // record listed under another title or with a garbled or missing author.
  // (Anna Centenary, 20 November 2026: the seven Open Library ISBNs of Swami
  // and Friends, old UK and US editions, were asked one by one, 3.7 s each,
  // until the deadline; its copy is "Malgudi schooldays", under another ISBN.)
  const workIsbns = unique([profile.book.isbn13, ...profile.isbns].map(validateAndNormalize)).filter(isbn => isbn && profile.isbns.includes(isbn));
  const titleSearchable = (titleFirst || typeof searchCandidates === 'function') && (profile.titles || [profile.book?.title]).some(Boolean);
  // A catalog that answers several ISBNs in one search (`checkIsbns`).
  const batched = typeof provider.checkIsbns === 'function' && provider.isbnLookup !== false;
  const own = validateAndNormalize(readerIsbn || '');
  const searched = new Set();
  const byIsbns = async group => {
    if (Date.now() >= deadline) return;
    summary.isbnQueries++;
    const result = await attempt(() => provider.checkIsbns(group));
    if (!result) return;
    const matched = validateAndNormalize(result.isbn13 || '');
    if (matched && group.includes(matched) && ['available', 'none_available', 'in_catalog', 'unknown'].includes(result.outcome)) {
      group.forEach(isbn => searched.add(isbn));
      const kind = matched === profile.book.isbn13 ? 'exact_isbn' : 'verified_work';
      addPositive({ ...result, matchKind: kind, lookupKind: kind, recognizedExact: result.recognizedExact !== false,
        matchedBook: { title: result.catalogTitle || profile.book.title, isbn13: matched }, foundBy: 'isbn' });
    } else if (result.outcome === 'not_found' && result.recognizedExact && Array.isArray(result.isbns)) {
      result.isbns.map(validateAndNormalize).forEach(isbn => { if (isbn) searched.add(isbn); });
    } else { failures++; noteFailure('CATALOG_UNRECOGNIZED'); }
  };
  // A catalog whose ISBN search already matches both forms of an edition
  // (`isbn10Lookup: false`) is not asked again for the ISBN-10 form; a
  // title-first catalog is asked by ISBN-13 only, as before.
  const withForms = isbns => (titleFirst ? isbns
    : unique(isbns.flatMap(isbn => [isbn, provider.isbn10Lookup === false ? null : ISBN.parse(isbn)?.isbn10])));
  // ISBN requests to send: groups for one combined search each, or single ISBNs.
  const groups = [];
  if (batched) {
    if (titleSearchable) {
      // (1) and (2): one request, the reader's ISBN first, as many of the
      // work's editions as one query takes (BATCH_ISBNS).
      const ride = unique([own, ...workIsbns]).filter(Boolean).slice(0, BATCH_ISBNS);
      if (ride.length) groups.push(ride);
    } else {
      // (3): every edition, in as many queries as their length needs.
      for (let index = 0; index < workIsbns.length; index += BATCH_ISBNS) groups.push(workIsbns.slice(index, index + BATCH_ISBNS));
    }
  }
  // (1): the reader's own ISBN only; (2): none; (3): every edition.
  const perIsbn = batched ? [] : titleSearchable ? (own ? withForms([own]) : []) : withForms(titleFirst ? workIsbns : profile.isbns);
  async function isbnSide() {
    if (provider.isbnLookup === false) return;
    if (batched) {
      await Promise.all(groups.map(group => {
        if (confident() || Date.now() >= deadline) return null;
        if (!budgetLeft()) { summary.partial = true; return null; }
        return byIsbns(group);
      }));
      // Where ISBNs are the only evidence, every edition must be answered.
      if (!titleSearchable && !confident() && workIsbns.some(isbn => !searched.has(isbn))) summary.partial = true;
      return;
    }
    if (!provider.checkAvailability) return;
    const asked = perIsbn.slice(0, maxIsbns);
    // ISBNs a capped caller never asks make the search partial.
    if (asked.length < perIsbn.length) summary.partial = true;
    const queue = [...asked];
    const isbnFailures = { count: 0 };
    const worker = async () => {
      while (queue.length) {
        if (confident() || Date.now() >= deadline) return;
        if (!budgetLeft()) { summary.partial = true; return; }
        // A title-first catalog whose lookups are failing gets no run of
        // likely failures: one failed ISBN lookup ends its ISBN side.
        if (titleFirst && isbnFailures.count) { summary.partial = true; return; }
        const isbn = queue.shift();
        if (await byIsbn(isbn) === false) isbnFailures.count++;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(2, operation.hostRequests || 1)) }, worker));
    if (queue.length) summary.partial = true;
  }

  // The title side.
  async function titleSide() {
    if (titleFirst) {
      // On these catalogs one search shows every candidate's title, authors and
      // often its ISBN; the ISBN side finds an edition listed under another title.
      const mainTitle = title => titleParts(title)[0];
      const searches = [];
      for (const title of profile.titles.filter(Boolean)) {
        if (!searches.some(search => normalize(mainTitle(search.title)) === normalize(mainTitle(title)))) searches.push({ title, author: profile.authors[0] || '' });
      }
      for (const search of searches.slice(0, maxTitles)) {
        if (confident()) return;
        if (!budgetLeft()) { summary.partial = true; return; }
        summary.titleQueries++;
        const { value: response, failed } = await attemptWith(() => provider.findBookCandidates(search));
        const records = Array.isArray(response) ? response : response?.records;
        if (failed) return;
        if (!Array.isArray(records)) continue;
        noteTitleSearch(records);
        if (response?.hasMore) summary.partial = true;
        const candidates = ranked(records);
        await readRecords(candidates);
        if (candidates.length) return;
      }
      return;
    }
    const titles = (profile.titles || []).filter(Boolean);
    const queries = [];
    for (const query of [[titles[0], profile.authors[0]].filter(Boolean).join(' '), titles[0], titles[1]]) {
      if (query && !queries.some(existing => normalize(existing) === normalize(query))) queries.push(query);
    }
    for (const query of queries) {
      if (confident()) return;
      if (!budgetLeft()) { summary.partial = true; return; }
      await byTitle(query);
    }
  }

  const work = (async () => {
    // Both sides start now; the ISBN side (the reader's own edition first) is
    // asked first, as one request ahead of the title search.
    await Promise.all([isbnSide(), titleSide()]);
    // Before nothing found may be called absence: one more title search with
    // the plural words made singular, when the title has any. Its rows count
    // like any title search's (a related row leaves the answer unconfirmed); a
    // failure or no time for it leaves the search incomplete.
    if (positives.length || failures || !completed || absenceRisk(summary, profile)) return;
    const variant = singularTitleVariant((profile.titles || [])[0] || profile.book?.title);
    if (!variant) return;
    if (!budgetLeft() || Date.now() >= deadline) { summary.partial = true; return; }
    if (!titleFirst) { await byTitle(variant); return; }
    summary.titleQueries++;
    const { value: response, failed } = await attemptWith(() => provider.findBookCandidates({ title: variant, author: profile.authors[0] || '' }));
    const records = Array.isArray(response) ? response : response?.records;
    if (failed) return;
    if (!Array.isArray(records)) { summary.partial = true; return; }
    noteTitleSearch(records);
    if (response?.hasMore) summary.partial = true;
    await readRecords(ranked(records));
  })();
  work.catch(() => {});
  // A proven match ends the search at once, even while a title search or an
  // ISBN search is still waiting on the catalog; that request is cancelled.
  try { await Promise.race([work, proven]); } finally { stop(); }
  summary.requests = operation.requests;
  positives.sort((a, b) => rank(b) - rank(a));
  summary.partial ||= failures > 0;
  if (positives.length) return withFoundBy({ ...positives[0], searchSummary: summary });
  // Nothing answered: the time ran out first (CATALOG_TIMEOUT), or there was
  // nothing this catalog could be asked for this book (no title it can search
  // and no ISBN lookup), which is not the catalog's failure.
  if (failures || !completed) return { outcome: 'unknown', searchSummary: summary,
    errorCode: failureCode || (Date.now() >= deadline ? 'CATALOG_TIMEOUT' : 'CATALOG_QUERY_UNSUPPORTED') };
  // Nothing matched. Whether that is "not found" or only "couldn't check" is
  // decided here, where the search knows what it tried (absenceRisk).
  const risk = absenceRisk(summary, profile);
  summary.absenceProvable = !risk;
  if (risk) summary.absenceRisk = risk;
  return { outcome: 'no_match', searchSummary: summary };
}
