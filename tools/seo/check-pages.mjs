// US library pages (owner decisions, 23 November 2026), built by
// tools/seo/build-pages.mjs: one page per offered US BiblioCommons library
// (shared/seo-us-libraries.json, written by tools/seo/us-pages.mjs), with the
// directory's facts and ten popular US books (shared/us-book-pool.json) that a
// reader can check at that library, live, on a tap (/library-check.js,
// tools/seo/library-check-script.mjs). Nothing is checked in advance:
// BiblioCommons' terms forbid automated collection, and its availability is
// never stored (server/data/catalog-policies.json). The books are popular
// books to check, never books known to be there: the pages make no found
// claim, and no structured data lists them. California was first; every
// state follows the same rule.
import { coverUrl, libraryBookPath, placeOf, localityOf, fit, shelfTitle, DESCRIPTION_MAX } from './shelf-pages.mjs';

// The books on each page: the first ten of the US list.
export const CHECK_BOOKS = 10;
// The catalog family the pages cover: BiblioCommons.
export const PAGE_PLATFORM = 'bc';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WORK = /^v1:openlibrary:OL\d+W$/;
const COUNT_NAMES = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const countName = count => COUNT_NAMES[count] || String(count);
const byName = (a, b) => a.library.name.localeCompare(b.library.name, 'en');

/** A state's anchor on /libraries: "us-california", "us-new-jersey". */
export const stateAnchor = state => 'us-' + String(state).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/** States in the order /libraries shows them: `first` in its order, then the others alphabetically. */
export function stateOrder(states, first = []) {
  const rank = state => (first.includes(state) ? first.indexOf(state) : first.length);
  return [...new Set(states)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en'));
}
/**
 * The library as its page shows it: the directory's facts, with the city
 * from shared/seo-us-cities.json where that file has one (the system's city
 * in the IMLS survey; null shows the state only).
 */
export function withCity(library, correction) {
  if (!library || !correction) return library;
  return { ...library, city: correction.city ?? null };
}

/**
 * The pages: one per library in `pages.libraries` (shared/seo-us-libraries.json)
 * that is in the directory, a US BiblioCommons library in the state the file
 * records, and checkable; a reviewed guide keeps its own slug and text and
 * gains the section. `pool` is the US list; `cities` the city corrections.
 * A page's date (`lastmod`, the date its content last changed) is the newest
 * of the US list's `updatedOn`, the page's own `on` (added, or its state
 * changed), its city correction's `on`, and the `on` of the pages its "More
 * libraries" links show.
 */
export function checkPublication({ entries, toPublic, manifest, pages, pool, removed = [], cities = {} }) {
  if (!DATE.test(pool?.updatedOn || '')) throw Error('The US list needs updatedOn (YYYY-MM-DD)');
  const books = (pool.books || []).filter(book => WORK.test(book.bookKey || '') && /^\d+$/.test(book.coverId || '')).slice(0, CHECK_BOOKS);
  if (books.length < CHECK_BOOKS) throw Error('The US list needs ten books with a work key and a cover');
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const guides = new Map(manifest.map(item => [item.id, item]));
  const out = new Set([...removed, ...(pages.leftOut || []).map(item => item.id)]);
  const slugs = new Set(), ids = new Set();
  const libraries = [];
  for (const { id, slug: given, state, on } of pages.libraries || []) {
    if (ids.has(id) || out.has(id)) throw Error('A US page is listed twice or also left out: ' + id);
    ids.add(id);
    const entry = byId.get(id);
    if (!entry) continue;
    if (entry.country !== 'US' || entry.platform !== PAGE_PLATFORM) throw Error('Not a US BiblioCommons library: ' + id);
    if (!state || entry.region !== state) throw Error(`Not a ${state || 'listed'} library: ${id} (run node tools/seo/us-pages.mjs)`);
    if (!DATE.test(on || '')) throw Error('A US page needs the date it changed (on): ' + id);
    const guide = guides.get(id) || null;
    const slug = guide ? guide.slug : given;
    if (!SLUG.test(slug || '')) throw Error('Invalid library slug: ' + id);
    if (slugs.has(slug)) throw Error('Library slug collision: ' + slug);
    slugs.add(slug);
    const correction = cities[id] || null;
    if (correction && !DATE.test(correction.on || '')) throw Error('A city correction needs its date (on): ' + id);
    const library = withCity(toPublic(entry), correction);
    if (!library?.capabilities?.publicAvailability || !library.selectionPath) continue;
    libraries.push({ id, slug, path: '/libraries/' + slug, guide, library, books, on, cityOn: correction?.on || null });
  }
  for (const row of libraries) {
    row.related = sameStatePages(row, libraries);
    row.lastmod = [pool.updatedOn, row.on, row.cityOn, ...row.related.map(other => other.on)].filter(Boolean).sort().at(-1);
  }
  const states = stateOrder(libraries.map(row => row.library.region), pages.firstStates || [])
    .map(state => ({ state, anchor: stateAnchor(state), libraries: libraries.filter(row => row.library.region === state).sort(byName) }));
  return { libraries, books, states, date: libraries.map(row => row.lastmod).sort().at(-1) || null };
}

// The name and its city (unless the name says it), as the shelf pages do.
export const checkTitle = library => shelfTitle(library);
const the = library => (/^the\s/i.test(library.name) ? '' : 'the ');
/** The generated summary for a page without a reviewed guide: facts only. */
export function checkSummary(library) {
  const place = placeOf(library);
  return `${library.name}${place ? ` in ${place}` : ''}: check whether its catalog lists popular books, live when you tap, or find any book with a free book search.`;
}
export function checkDescription(library) {
  const place = placeOf(library), at = place ? ` (${place})` : '';
  return fit([
    `Book search for ${the(library)}${library.name} catalog${at}: check popular books live when you tap, or find any book and see whether the library has it.`,
    `Book search for ${the(library)}${library.name} catalog${at}: check popular books live when you tap. Free and independent.`,
    `${library.name}${at}: check popular books in its catalog, live when you tap. Free and independent.`,
    `${library.name}: check popular books in its catalog, live when you tap.`,
  ], DESCRIPTION_MAX);
}

/**
 * HTML of the "Popular books" section. Each row: the cover, title and
 * author, a "Check at <library>" button (hidden until the script runs, so
 * nothing is offered that cannot work) and a plain link that opens the book
 * in the app with this library chosen, where the check runs. The answer
 * goes in the row's answer box, empty until a tap. `stored`: whether the
 * catalog's answers may be kept (catalog-store/policy.js); when not, the
 * section says no answer is kept.
 */
export function checkSection(row, { escape, stored = false }) {
  const l = row.library;
  const items = row.books.map(book => {
    const title = escape(book.title);
    return `<li class="check-book" data-book-key="${escape(book.bookKey)}" data-title="${title}"><img class="cover" src="${escape(coverUrl(book.coverId))}" alt="" width="72" height="108" loading="lazy" decoding="async"><div class="check-body"><p class="shelf-title">${title}</p><p class="shelf-author">${escape(book.author)}</p><div class="check-actions"><button type="button" class="button button-secondary" data-check hidden>Check at ${escape(l.name)}<span class="sr-only">: ${title}</span></button><a href="${escape(libraryBookPath(l.selectionPath, book.bookKey))}" rel="nofollow">Check in the app<span class="sr-only">: ${title}</span> →</a></div><div class="check-answer" data-check-answer aria-live="polite"></div></div></li>`;
  }).join('');
  return `<section class="check-section" id="popular-books" aria-labelledby="check-heading" data-library-check data-library-id="${escape(row.id)}"><h2 id="check-heading">Popular books: check this library’s catalog</h2><p>${countName(row.books.length)} books that are popular in US public libraries. They are books to check, not books known to be in ${escape(l.name)}. When you tap “Check”, MyBookshelf searches the library’s own catalog for that book once, right then. Nothing is checked before you tap${stored ? '' : ', and no answer is kept'}.</p><div class="check-all"><button type="button" class="button" data-check-all hidden>Check all ${row.books.length}</button><span class="note" data-check-progress></span></div><ul class="check-list">${items}</ul><p class="note">The check looks for the book’s title in the catalog, so a find can be another edition. A catalog listing is not a copy count, a due date or a shelf location. If the catalog doesn’t answer, MyBookshelf says it couldn’t check, never that the book isn’t there. Covers from Open Library.</p></section>`;
}

/** Other pages in the same state, for a page's "More libraries" links (by name, at most eight). */
export function sameStatePages(row, rows, limit = 8) {
  return rows.filter(other => other.id !== row.id && other.library.region === row.library.region).sort(byName).slice(0, limit);
}

export { localityOf };
