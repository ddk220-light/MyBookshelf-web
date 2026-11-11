import { cachedTask, enqueueTask, getJson } from './providers/http.js';
import { validateAndNormalize } from './isbn.js';
import { lookupBookMetadata } from './bookMetadata.js';
import { searchGoogleBooksByQuery } from './googleBooks.js';
import { rankSearchResults, scopedSearchQuery, prefixSearchQuery, searchWords, authorIntent } from './searchRelevance.js';

const WORK_ID = /^OL\d+W$/;
// Reader-log and rating counts come free with the same search request. They
// order relevant results; they never decide which works match or are merged.
const POPULARITY_FIELDS = 'readinglog_count,want_to_read_count,already_read_count,ratings_count';
const FIELDS = `key,title,author_name,author_key,cover_i,first_publish_year,edition_count,language,${POPULARITY_FIELDS}`;
// Field-scoped queries must not use nested edition filtering: author terms
// have no equivalent edition field. Plain-text queries can return editions.
const SEARCH_FIELDS = `${FIELDS},subtitle,alternative_title,author_alternative_name`;
const PAGE_SIZE = 40;
const unique = values => [...new Set(values.filter(Boolean))];
const workId = key => String(key || '').replace('/works/', '');
const count = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);
const languageOf = edition => edition.languages?.map(item => item.key?.split('/').pop()).filter(Boolean) || [];

function unavailable() {
  return Object.assign(new Error('Book discovery is temporarily unavailable'), { code: 'BOOK_METADATA_UNAVAILABLE' });
}

let nextRequestAt = 0;
async function request(path) {
  const deadlineAt = Date.now() + 12_000;
  return cachedTask(`work-discovery:${path}`, () => enqueueTask('openlibrary:discovery', async () => {
    // Cache and coalesce requests, then pace uncached reads across this process.
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1000;
    const response = await getJson(`https://openlibrary.org${path}`, {
      deadlineAt, retries: 0,
      headers: { 'User-Agent': 'MyBookshelf/1.0 (book discovery; https://mybookshelf.cloud/privacy)' },
    });
    if (response.status === 404) return null;
    if (!response.ok || response.unreadable) throw unavailable();
    return response.json;
  }, { deadlineAt }), { deadlineAt, ttlMs: 6 * 60 * 60 * 1000 }).catch(() => { throw unavailable(); });
}

function fromSearch(doc) {
  const id = workId(doc?.key);
  if (!WORK_ID.test(id) || !doc.title) return null;
  return {
    source: 'openlibrary', source_id: id, workId: id,
    title: doc.subtitle && !doc.title.toLowerCase().includes(doc.subtitle.toLowerCase()) ? `${doc.title}: ${doc.subtitle}` : doc.title,
    authors: doc.author_name || [], editionCount: doc.edition_count,
    languages: doc.language || [], publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
    searchTitles: [doc.subtitle && `${doc.title}: ${doc.subtitle}`, ...(Array.isArray(doc.alternative_title) ? doc.alternative_title : []), ...(doc.editions?.docs || []).map(edition => edition.title)].filter(value => typeof value === 'string'),
    searchAuthors: Array.isArray(doc.author_alternative_name) ? doc.author_alternative_name : [],
    // Ranking-only signals; the public book shape does not include them.
    popularity: { readers: count(doc.readinglog_count) || count(doc.want_to_read_count) + count(doc.already_read_count),
      ratings: count(doc.ratings_count) },
  };
}

export function isPrintEdition(edition) {
  return !/audio|ebook|e-book|electronic|digital|kindle|daisy|braille/i.test(edition.physical_format || edition.format || '');
}

const searchOtherSource = query => cachedTask(`work-discovery:google:${JSON.stringify(query)}`,
  () => searchGoogleBooksByQuery(query), { deadlineAt: Date.now() + 9000, ttlMs: 6 * 60 * 60 * 1000 });

export function createWorkDiscovery({ read = request, fallbackIsbn = lookupBookMetadata, fallbackText = searchOtherSource } = {}) {
  async function searchPage({ title, author = '', max = 160, offset = 0 }) {
    const query = { title, author, max };
    if (!scopedSearchQuery(query)) return { books: [], nextOffset: null };
    let hasMore = false;
    const page = books => ({ books, nextOffset: hasMore ? offset + PAGE_SIZE : null,
      ...(failedModes.length || fallbackFailed ? { partial: true } : {}) });
    const searchWorks = async (mode = 'fields') => {
      const params = new URLSearchParams(mode === 'title'
        ? { title: String(title).replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' '), ...(author ? { author } : {}), fields: SEARCH_FIELDS }
        : mode === 'author'
          ? { author: String(title).replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(), sort: 'readinglog', fields: SEARCH_FIELDS }
          : mode === 'text'
          ? { q: [...searchWords(title), ...searchWords(author)].join(' '), fields: `${SEARCH_FIELDS},editions,editions.title` }
          : { q: mode === 'prefix' ? prefixSearchQuery(query) : scopedSearchQuery(query, mode === 'spelling'), fields: SEARCH_FIELDS });
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const result = await read(`/search.json?${params}`);
      if (!Array.isArray(result?.docs)) throw unavailable();
      hasMore ||= Number(result.numFound ?? result.num_found) > offset + result.docs.length
        || (result.numFound === undefined && result.num_found === undefined && result.docs.length === PAGE_SIZE);
      // The provider's own order is one ranking signal (per mode and page).
      return result.docs.map(fromSearch).filter(Boolean).map((book, index) => ({ ...book, sourceRank: index }));
    };
    let editionReads = 0;
    const checkedWorks = new Set();
    const withEditionTitles = async (candidates, spelling = false) => {
      // Search indexes match alternate titles but do not return all of them.
      // Verify aliases for at most two leading work hits, sharing the normal
      // edition cache. The work identity and ISBNs remain unchanged.
      for (const candidate of candidates.slice(0, 2)) {
        if (editionReads >= 2 || checkedWorks.has(candidate.workId) || rankSearchResults([candidate], query, spelling).length) continue;
        editionReads++; checkedWorks.add(candidate.workId);
        try {
          const editions = await read(`/works/${candidate.workId}/editions.json?limit=100`);
          candidate.searchTitles.push(...(editions?.entries || []).map(edition => edition.title).filter(Boolean));
        } catch { /* Keep verified search metadata when enrichment is unavailable. */ }
      }
      return candidates;
    };
    let books = [], fallbackFailed = false;
    const exact = [], failedModes = [];
    // Query the independent source even when Open Library has matches: one
    // successful provider is not proof that all relevant books were returned.
    const fallback = Promise.resolve().then(() => fallbackText({
      query: [...searchWords(title), ...searchWords(author)].join(' '), max: PAGE_SIZE, ...(offset ? { offset } : {}),
    })).then(editions => {
      if (!Array.isArray(editions)) throw unavailable();
      hasMore ||= editions.length === PAGE_SIZE;
      return editions.map((edition, index) => (edition && typeof edition === 'object' ? { ...edition, sourceRank: index } : edition));
    }).catch(() => { fallbackFailed = true; return []; });
    // Combine matching edition titles with bibliographic-field matches, then
    // require every significant input word locally. Broad topic hits are not
    // allowed through merely because the provider returned them.
    const modes = ['text', 'title', 'fields'];
    const responses = await Promise.allSettled(modes.map(mode => searchWorks(mode)));
    for (const [index, response] of responses.entries()) {
      if (response.status === 'fulfilled') {
        exact.push(...(modes[index] === 'fields' ? await withEditionTitles(response.value) : response.value));
      } else failedModes.push(modes[index]);
    }
    // When the returned works show that the words name an author, add that
    // author's works ordered by readers: one extra paced request at most.
    const namesAuthor = Boolean(authorIntent(exact, query));
    if (namesAuthor) {
      try { exact.push(...await searchWorks('author')); } catch { /* Optional: the text results remain. */ }
    }
    const editions = await fallback;
    books = rankSearchResults([...exact, ...editions], { ...query, authorIntent: namesAuthor });
    // A strict match found only through another edition's title (no record
    // matches on its own title and authors) is weak evidence that the words
    // were spelt as intended ("harry poter" matching a Latvian "Poters"). On
    // the first page, also run the bounded spelling pass and rank both sets
    // together. Its failure leaves the strict matches as they were.
    if (books.length && !offset && !namesAuthor
      && ![...exact, ...editions].some(book => book?.title && rankSearchResults([{ ...book, searchTitles: [] }], query).length)) {
      try {
        const spelt = await withEditionTitles(await searchWorks('spelling'), true);
        books = rankSearchResults([...exact, ...editions, ...spelt], query, true);
      } catch { /* Optional: the strict matches remain. */ }
    }
    if (books.length) return page(books);
    // Later pages continue the original query, never silently switch to typos.
    if (offset) {
      if (failedModes.length || fallbackFailed) throw unavailable();
      return page([]);
    }
    let spellingFailed = false;
    for (const mode of ['spelling', 'prefix']) {
      try { books = rankSearchResults(await withEditionTitles(await searchWorks(mode), true), query, true); } catch { spellingFailed = true; }
      if (books.length) return page(books);
    }
    // Restore the independent metadata source used before work discovery.
    // Its bounded request returns edition/source keys, never invented work IDs.
    const relevant = rankSearchResults(editions, query, true);
    if (relevant.length) return page(relevant);
    if (failedModes.length) {
      // One paced retry can recover a transient failure (or reuse a concurrent
      // successful lookup). Every attempt retains the transport's deadline.
      try {
        books = rankSearchResults(await searchWorks(failedModes[0]), query);
        failedModes.shift();
      } catch { /* Report the outage below. */ }
      if (books.length) return page(books);
    }
    if (failedModes.length || spellingFailed || fallbackFailed) throw unavailable();
    return page(books);
  }

  async function search(query) { return (await searchPage(query)).books; }

  async function resolve(id) {
    if (!WORK_ID.test(id)) return null;
    const params = new URLSearchParams({ q: `key:/works/${id}`, fields: FIELDS, limit: '1' });
    const [data, result] = await Promise.all([read(`/works/${id}.json`), read(`/search.json?${params}`)]);
    if (!data?.title) return null;
    const summary = result?.docs?.map(fromSearch).find(book => book?.workId === id);
    let authors = summary?.authors || [];
    if (!authors.length) {
      const keys = unique((data.authors || []).map(item => item.author?.key)).filter(key => /^\/authors\/OL\d+A$/.test(key)).slice(0, 3);
      authors = (await Promise.all(keys.map(key => read(`${key}.json`)))).map(item => item?.name).filter(Boolean);
    }
    return { ...summary, source: 'openlibrary', source_id: id, workId: id, title: data.title, authors,
      description: typeof data.description === 'string' ? data.description : data.description?.value,
      subjects: data.subjects || [],
      coverUrl: data.covers?.[0] > 0 ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-M.jpg` : summary?.coverUrl };
  }

  async function lookup({ isbn }) {
    try {
      const edition = await read(`/isbn/${isbn}.json`);
      if (edition?.title) {
        const identifiers = unique([...(edition.isbn_13 || []), ...(edition.isbn_10 || [])].map(validateAndNormalize));
        if (identifiers.length && !identifiers.includes(validateAndNormalize(isbn))) return fallbackIsbn({ isbn });
        const id = workId(edition.works?.[0]?.key);
        let summary;
        if (WORK_ID.test(id)) {
          try { summary = await resolve(id); } catch { /* Preserve the exact edition even if enrichment fails. */ }
        }
        // The ISBN endpoint identifies the requested edition. Keep the supplied
        // ISBN even when its record stores only the equivalent ISBN-10.
        return { book: { ...summary, isbn, title: edition.title,
          authors: summary?.authors || [], language: languageOf(edition)[0],
          physical_format: edition.physical_format,
          publisher: edition.publishers?.[0], publishedDate: edition.publish_date,
          coverUrl: edition.covers?.[0] > 0 ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-M.jpg` : summary?.coverUrl,
          ...(WORK_ID.test(id) ? { workId: id } : {}) } };
      }
    } catch { /* The existing metadata sources can still identify the ISBN. */ }
    return fallbackIsbn({ isbn });
  }

  async function profile(book, { editionScope = 'work', language } = {}) {
    const base = { book, isbns: book.isbn13 && (!language || !book.language || language === book.language || editionScope === 'exact') ? [book.isbn13] : [], titles: [book.title],
      authors: book.authors || [], language: language || book.language || (book.languages?.includes('eng') ? 'eng' : book.languages?.[0]) || '', complete: true, expansionFailed: false };
    if (editionScope === 'exact') return base;
    if (!WORK_ID.test(book.workId || '')) return { ...base, complete: false };
    try {
      // One page bounds latency for works with hundreds of editions. Title
      // searches still run, so missing or unenumerated ISBNs aren't a dead end.
      const result = await read(`/works/${book.workId}/editions.json?limit=100`);
      if (!Array.isArray(result?.entries)) throw unavailable();
      // Do not invent an English filter for records with no language metadata.
      // An explicit or known language still requires positive edition evidence.
      const compatible = result.entries.filter(edition => isPrintEdition(edition)
        && (!base.language || languageOf(edition).includes(base.language)));
      return { ...base,
        isbns: unique([...base.isbns, ...compatible.flatMap(edition => [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])].map(validateAndNormalize))]),
        titles: unique([book.title, ...compatible.map(edition => edition.title)]).slice(0, 5),
        complete: Number.isFinite(result.size) && result.entries.length >= result.size };
    } catch {
      return { ...base, complete: false, expansionFailed: true };
    }
  }
  return { search, searchPage, resolve, lookup, profile };
}

export const workDiscovery = createWorkDiscovery();
