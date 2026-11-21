// Public library shelves and book pages (tools/seo/build-pages.mjs), from the
// checker's data (shared/seo-shelves.json, tools/seo/library-shelves.mjs).
// Every fact comes from the directory, the checker's record or Open Library
// as stored; a field the data lacks is left out.
import { MIN_SHELF, SHELF_SIZE, EXCLUDED_IDS, correctBookSlugs } from './shelves-core.mjs';
import { publicPlace, tidyAddress } from './public-place.mjs';

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
export function shelfPublication({ entries, toPublic, manifest, shelves, pool, removed = [], places }) {
  const out = new Set([...removed, ...EXCLUDED_IDS]);
  // Slugs from the earlier surname rule are corrected whichever checker saved
  // the file; titles are shown in title case (displayTitle).
  const stored = { ...(shelves.books || {}) };
  correctBookSlugs(stored);
  const bookDetails = Object.fromEntries(Object.entries(stored).map(([key, details]) => [key, { ...details, title: displayTitle(details.title) }]));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const guides = new Map(manifest.map(item => [item.id, item]));
  const libraries = [];
  const slugs = new Set(manifest.map(item => item.slug));
  for (const [id, record] of Object.entries(shelves.libraries || {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const entry = byId.get(id);
    if (!entry || entry.country !== 'IN' || out.has(id) || !entry.name || !entry.region) continue;
    const shelf = pool.filter(book => record.checks?.[book.bookKey]?.outcome === 'found' && bookDetails[book.bookKey])
      .slice(0, SHELF_SIZE).map(book => {
        const check = record.checks[book.bookKey];
        if (!DATE.test(check.on)) throw Error('Invalid check date: ' + id);
        return { bookKey: book.bookKey, details: bookDetails[book.bookKey], checkedOn: check.on };
      });
    if (shelf.length < MIN_SHELF) continue;
    const guide = guides.get(id) || null;
    const slug = guide ? guide.slug : record.slug;
    if (!SLUG.test(slug || '')) throw Error('Invalid library slug: ' + id);
    if (!guide) { if (slugs.has(slug)) throw Error('Library slug collision: ' + slug); slugs.add(slug); }
    const library = publicLibrary(toPublic(entry), entry, places);
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

/**
 * The public projection of a library for these pages: the place shown comes
 * from the one place rule (public-place.mjs), and the published address has
 * its run-together parts separated. Libraries outside India are unchanged.
 */
export function publicLibrary(library, entry, places) {
  if (!library) return null;
  const out = { ...library };
  if (library.country === 'IN') {
    const place = publicPlace(library, entry, places);
    out.city = place.city || null;
    if (place.district) out.district = place.district; else delete out.district;
  }
  if (out.address) out.address = tidyAddress(out.address);
  return out;
}

// The library's place: its city, else its district, and its state (once:
// "Puducherry", not "Puducherry, Puducherry").
export const localityOf = library => library.city || (library.district ? `${library.district} district` : null);
export const placeOf = library => [...new Set([localityOf(library), library.region].filter(Boolean))].join(', ');

// Search results show about 60 characters of a title and 155 of a description.
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
/** The first option that fits, else the last (never cut mid-name). */
export const fit = (options, max) => options.find(text => text.length <= max) || options.at(-1);

// Words kept in lower case inside a title: articles, conjunctions and
// prepositions (the first and last word are always capitalised).
const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'of', 'in', 'on', 'at', 'to', 'by', 'for', 'with', 'from', 'into']);
/**
 * Open Library's titles in title case for display: "Malgudi days" -> "Malgudi
 * Days", "The Home And The World" -> "The Home and the World". A lower-case
 * word gains a capital first letter; a minor word inside the title is lower
 * case. A word with other capitals ("ANSI", "IN", "iPhone") is never changed.
 */
export function displayTitle(title) {
  const words = String(title || '').split(' ');
  return words.map((word, i) => {
    const inside = i > 0 && i < words.length - 1;
    if (inside && MINOR.has(word.toLowerCase())) return /^\p{Lu}?\p{Ll}*$/u.test(word) ? word.toLowerCase() : word;
    return /^\p{Ll}[^\p{Lu}]*$/u.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }).join(' ');
}

// The name and its city first (the city is added unless the name says it:
// "CPU Central Library Kota"), then "catalog".
const named = library => `${library.name}${library.city && !library.name.toLowerCase().includes(library.city.toLowerCase()) ? `, ${library.city}` : ''}`;
export const shelfTitle = library => fit([`${named(library)} — catalog and book search`, `${named(library)} — catalog and books`, `${named(library)} catalog`], TITLE_MAX);
// The generated summary for a library without a reviewed guide: facts only.
export function shelfSummary(library, count) {
  const place = placeOf(library);
  return `${library.name}${place ? ` in ${place}` : ''}: ${count} books found in its catalog, and a free book search that checks whether the library has a book.`;
}
export function shelfDescription(library, count) {
  const the = /^the\s/i.test(library.name) ? '' : 'the ', place = placeOf(library);
  const at = place ? ` (${place})` : '';
  return fit([
    `Search ${the}${library.name} catalog${at}: ${count} books found there, and a free book search that checks whether the library has a book.`,
    `Search ${the}${library.name} catalog${at}: ${count} books found there. Check any book for free.`,
    `${library.name}${at}: ${count} books found in its catalog. Check any book for free.`,
    `${library.name}: ${count} books found in its catalog. Check any book for free.`,
  ], DESCRIPTION_MAX);
}
// A book page: its title and first author first.
export function bookTitle(details) {
  const by = details.authors?.length ? `${details.title} by ${details.authors[0]}` : details.title;
  return fit([`${by} — find it in a library`, `${by} in libraries`, by], TITLE_MAX);
}
export function bookDescription(details, names) {
  const all = details.authors?.length ? ` by ${details.authors.join(', ')}` : '', first = details.authors?.length ? ` by ${details.authors[0]}` : '';
  const where = names.length === 1 ? `the catalog of ${names[0]}` : `the catalogs of ${names.length} Indian libraries`;
  const including = names.length > 1 ? `, including ${names.slice(0, 2).join(' and ')}` : '';
  const end = ' Check whether your library has it.';
  return fit([
    `${details.title}${all}: found in ${where}${including}.${end}`,
    `${details.title}${first}: found in ${where}${including}.${end}`,
    `${details.title}${first}: found in ${where}.${end}`,
    `${details.title}: found in ${where}.${end}`,
    `${details.title}: found in ${where}.`,
  ], DESCRIPTION_MAX);
}

/**
 * Structured data for a generated library page: what the page shows. The
 * page's own address (no official website: the directory has none), and a
 * PostalAddress with the published street address (library or campus
 * address with its source), the PIN when the address has exactly one, the
 * town shown, the state and the country.
 */
export function libraryStructuredData(library, url) {
  const street = library.address && library.addressSourceUrl && ['library', 'campus'].includes(library.addressScope) ? library.address : null;
  const pins = street ? [...new Set(street.replace(/(?<!\d)(\d{3})\s(\d{3})(?!\d)/g, '$1$2').match(/(?<!\d)[1-9]\d{5}(?!\d)/g) || [])] : [];
  return { '@context': 'https://schema.org', '@type': 'Library', '@id': url + '#library', name: library.name, url, subjectOf: url,
    address: { '@type': 'PostalAddress', ...(street ? { streetAddress: street } : {}), ...(pins.length === 1 ? { postalCode: pins[0] } : {}),
      ...(library.city ? { addressLocality: library.city } : {}), ...(library.region ? { addressRegion: library.region } : {}), addressCountry: library.country || 'IN' } };
}

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
