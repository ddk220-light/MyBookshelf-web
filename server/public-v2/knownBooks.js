import usList from '../../shared/us-book-pool.json' with { type: 'json' };
import shelfPool from '../../shared/seo-book-pool.json' with { type: 'json' };
import shelves from '../../shared/seo-shelves.json' with { type: 'json' };

// Books whose details are already in this repository, so that a library
// check for one of them searches the catalog without reading Open Library
// first (metadata.js checkDetails, holdings.js). On 23 November 2026 slow
// Open Library reads left California page taps at "couldn't check" before
// any catalog was asked (all 3 taps one time, 1 of 3 later). The books:
//
// - the details of every book on the Indian library shelves
//   (shared/seo-shelves.json `books`: Open Library's own title and authors,
//   as the published shelf checks searched by them);
// - the US list (shared/us-book-pool.json: the California library pages and
//   the app's US suggestions);
// - the Indian shelf checker's pool (shared/seo-book-pool.json).
//
// A work in more than one file takes the first of that order. Only Open
// Library work keys are listed; every other key (a typed search's Google
// Books record, a scanned ISBN, a library's own record) and every work not
// listed is resolved as before.
//
// Only the title and authors are used: a check searches by the main title
// (libraryBookSearch.js) and the catalog link names the title and authors
// (catalog-handoff.js). The lists' ISBNs are not: an Open Library work has
// never carried an ISBN into a check (workDiscovery.js resolve), each list's
// ISBN is one edition of the work (as tools/seo/library-shelves.mjs fills it,
// the lowest-numbered that Open Library's search lists, in any language),
// and as the check's ISBN it would turn the
// catalog link into a search for that one edition and become an identity
// under which answers are stored (catalog-lookup/record.js). The work key is
// the book (client/src/v2/suggestions/seed.ts).

const WORK_KEY = /^v1:openlibrary:(OL\d+W)$/;

const text = (value, maximum) => {
  if (typeof value !== 'string') return null;
  const result = value.replace(/\s+/g, ' ').trim();
  return result ? result.slice(0, maximum) : null;
};

/**
 * The table of known books, bookKey -> { bookKey, workId, title, authors },
 * from the shelf details (`shelfBooks`, keyed by book key) and then each list
 * of `{ bookKey, title, author }` in order. An entry without a work key or a
 * title is left out.
 */
export function knownBookTable({ shelfBooks = {}, lists = [] } = {}) {
  const table = new Map();
  const add = (bookKey, title, authors) => {
    const workId = WORK_KEY.exec(typeof bookKey === 'string' ? bookKey : '')?.[1];
    const name = text(title, 500);
    if (!workId || !name || table.has(bookKey)) return;
    table.set(bookKey, Object.freeze({ bookKey, workId, title: name,
      authors: Object.freeze(authors.map(author => text(author, 240)).filter(Boolean).slice(0, 20)) }));
  };
  for (const [bookKey, details] of Object.entries(shelfBooks || {})) add(bookKey, details?.title, Array.isArray(details?.authors) ? details.authors : []);
  for (const list of lists) for (const book of list?.books || []) add(book?.bookKey, book?.title, [book?.author]);
  return table;
}

const KNOWN = knownBookTable({ shelfBooks: shelves.books, lists: [usList, shelfPool] });

/**
 * A known book's details as a resolved book (metadata.js toPublicBook's
 * shape: bookKey, title, authors, workId), or null for any other key.
 */
export function knownBook(bookKey, table = KNOWN) {
  const book = table.get(bookKey);
  return book ? { bookKey: book.bookKey, title: book.title, authors: [...book.authors], workId: book.workId } : null;
}
