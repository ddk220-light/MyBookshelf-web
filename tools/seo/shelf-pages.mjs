// Public library shelves and book pages (tools/seo/build-pages.mjs), from the
// checker's data (shared/seo-shelves.json, tools/seo/library-shelves.mjs).
// Every fact comes from the directory, the checker's record or Open Library
// as stored; a field the data lacks is left out.
import { MIN_SHELF, SHELF_SIZE, EXCLUDED_IDS } from './shelves-core.mjs';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
export const coverUrl = (id, size = 'M') => `https://covers.openlibrary.org/b/id/${encodeURIComponent(id)}-${size}.jpg`;
export const appBookPath = bookKey => '/app/books/' + encodeURIComponent(bookKey);
// The app's own library link (client SelectLibraryLink): choose the library,
// then open the book, which runs a fresh check there.
export const libraryBookPath = (selectionPath, bookKey) => `${selectionPath}?book=${encodeURIComponent(bookKey)}`;

/**
 * Which libraries get a shelf, and which books get a page.
 * `entries`: directory rows; `toPublic`: the public projection;
 * `manifest`: the reviewed guides; `shelves`: the checker's data;
 * `pool`: the book pool (its order is the shelf order); `removed`: IDs the
 * listed file removes. A library is published with at least five found books
 * that have Open Library details, a name and a state; a guide keeps its own
 * page and gains the shelf on the same terms.
 */
export function shelfPublication({ entries, toPublic, manifest, shelves, pool, removed = [] }) {
  const out = new Set([...removed, ...EXCLUDED_IDS]);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const guides = new Map(manifest.map(item => [item.id, item]));
  const libraries = [];
  const slugs = new Set(manifest.map(item => item.slug));
  for (const [id, record] of Object.entries(shelves.libraries || {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const entry = byId.get(id);
    if (!entry || entry.country !== 'IN' || out.has(id) || !entry.name || !entry.region) continue;
    const shelf = pool.filter(book => record.checks?.[book.bookKey]?.outcome === 'found' && shelves.books?.[book.bookKey])
      .slice(0, SHELF_SIZE).map(book => {
        const check = record.checks[book.bookKey];
        if (!DATE.test(check.on)) throw Error('Invalid check date: ' + id);
        return { bookKey: book.bookKey, details: shelves.books[book.bookKey], checkedOn: check.on };
      });
    if (shelf.length < MIN_SHELF) continue;
    const guide = guides.get(id) || null;
    const slug = guide ? guide.slug : record.slug;
    if (!SLUG.test(slug || '')) throw Error('Invalid library slug: ' + id);
    if (!guide) { if (slugs.has(slug)) throw Error('Library slug collision: ' + slug); slugs.add(slug); }
    const library = toPublic(entry);
    if (!library) continue;
    libraries.push({ id, slug, path: '/libraries/' + slug, guide, library, shelf,
      lastmod: shelf.map(item => item.checkedOn).sort().at(-1) });
  }
  const books = new Map();
  for (const row of libraries) for (const item of row.shelf) {
    const details = item.details;
    if (!books.has(item.bookKey)) {
      if (!SLUG.test(details.slug || '')) throw Error('Invalid book slug: ' + item.bookKey);
      books.set(item.bookKey, { bookKey: item.bookKey, details, path: '/books/' + details.slug, libraries: [] });
    }
    books.get(item.bookKey).libraries.push({ row, checkedOn: item.checkedOn });
  }
  const bookSlugs = new Set();
  for (const book of books.values()) {
    if (bookSlugs.has(book.details.slug)) throw Error('Book slug collision: ' + book.details.slug);
    bookSlugs.add(book.details.slug);
    book.libraries.sort((a, b) => (a.row.library.name < b.row.library.name ? -1 : 1));
    book.lastmod = book.libraries.map(item => item.checkedOn).sort().at(-1);
  }
  const bookList = [...books.values()].sort((a, b) => (a.details.title.toLowerCase() < b.details.title.toLowerCase() ? -1 : 1));
  return { libraries, books: bookList, bookByKey: books };
}

// The library's place: its city, else its published district, and its state.
export const localityOf = library => library.city || (library.district ? `${library.district} district` : null);
export const placeOf = library => [localityOf(library), library.region].filter(Boolean).join(', ');

// The generated summary for a library without a reviewed guide: facts only.
export function shelfSummary(library, count) {
  const place = placeOf(library);
  return `${library.name}${place ? ` in ${place}` : ''}: ${count} books found in its catalog, and a free book search that checks whether the library has a book.`;
}
// The city is added unless the name already says it ("CPU Central Library Kota").
export const shelfTitle = library => `${library.name}${library.city && !library.name.toLowerCase().includes(library.city.toLowerCase()) ? `, ${library.city}` : ''} — catalog and book search`;
export const shelfDescription = (library, count) => `Search ${/^the\s/i.test(library.name) ? '' : 'the '}${library.name} catalog${placeOf(library) ? ` (${placeOf(library)})` : ''}: ${count} books found there, and a free book search that checks whether the library has a book.`;

/** HTML of the shelf section on a library page. */
export function shelfSection(row, { escape, bookByKey }) {
  const items = row.shelf.map(item => {
    const book = bookByKey.get(item.bookKey), d = item.details;
    const cover = d.coverId
      ? `<img class="cover" src="${escape(coverUrl(d.coverId))}" alt="" width="120" height="180" loading="lazy" decoding="async">`
      : `<span class="cover cover-fallback" aria-hidden="true">${escape(d.title)}</span>`;
    return `<li class="shelf-book"><a class="shelf-link" href="${escape(book.path)}">${cover}<span class="shelf-title">${escape(d.title)}</span></a>${d.authors?.length ? `<p class="shelf-author">${escape(d.authors.join(', '))}</p>` : ''}<p class="note">Found in the catalog · checked ${escape(longDate(item.checkedOn))}</p></li>`;
  }).join('');
  return `<section class="shelf-section" aria-labelledby="shelf-heading"><h2 id="shelf-heading">Books found in this library’s catalog</h2><p>MyBookshelf’s catalog check found each of these books in ${escape(row.library.name)}’s catalog on the date shown. Open a book to see the other libraries that have it, or check it again.</p><ul class="shelf">${items}</ul><p class="note">A catalog listing is not a copy count, a due date or a shelf location. Ask the library about borrowing.</p></section>`;
}

/** Structured data for the shelf: an ItemList of its books. */
export function shelfItemList(row, { origin, bookByKey }) {
  return { '@context': 'https://schema.org', '@type': 'ItemList', name: `Books found in the ${row.library.name} catalog`,
    itemListElement: row.shelf.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.details.title, url: origin + bookByKey.get(item.bookKey).path })) };
}
