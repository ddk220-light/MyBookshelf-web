import type { PublicBook } from './types';
import { uiMessages as m } from './uiMessages';
import { languageName } from './format';

// `key` identifies the presentation group for remembered UI state such as an
// expanded card. It never equals a record's bookKey ("v1:…"), so a key that
// was remembered for another grouping cannot open the wrong card. "g2:" keys
// may span several Open Library work IDs; "g1:" keys (work ID only) are no
// longer issued, so a remembered g1 key matches nothing.
// `separateWorks` is true when the card holds records with different work IDs:
// they are shown as separate records under one title, never as versions of one
// work. `editionCount` is the largest edition count in the group, not a sum.
export type SearchGroup = { key: string; book: PublicBook; versions: PublicBook[]; separateWorks: boolean; editionCount?: number };

// Fold Latin accents (é → e) but keep combining marks in other scripts:
// Devanagari and Tamil vowel signs are marks, and removing them makes
// different titles equal (राम and रोम, கடல் and கடலை). Same rule as
// server/services/libraryBookSearch.js.
export const normalizeText = (value: string) => String(value || '').normalize('NFKD')
  .replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
  .replace(/[‌‍]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

const WORK_ID = /^OL\d+W$/;
// Open Library search results carry their work ID in the key as well.
function workIdOf(book: PublicBook): string | null {
  if (WORK_ID.test(book.workId || '')) return book.workId!;
  return /^v1:openlibrary:(OL\d+W)$/.exec(book.bookKey)?.[1] || null;
}

const isCatalog = (book: PublicBook) => book.bookKey.startsWith('v1:catalog:');

const ROLE = /^(?:author|authors|auth|editor|editors|ed|eds|edited by|translator|translated by|tr|trans|illustrator|illustrated by|ill|illus|compiler|comp|narrator|narrated by|contributor|joint author|foreword|introduction|writer of introduction|adapter|adapted by|and others|et al)$/;
const DATES = /^(?:(?:b|d|fl|ca|c|born|died)\s*)?\d{3,4}(?:\s*\d{3,4})?(?:\s*(?:bc|bce|ad|ce))?$/;
const SUFFIX = /^(?:jr|sr|ii|iii|iv)$/;
const HONORIFIC = new Set(['dr', 'prof', 'mr', 'mrs', 'ms']);

// One person's name, comparable across catalog and bibliographic styles:
// "Coelho, Paulo", "Paulo Coelho (Author)", "COELHO, PAULO, 1947-" and
// "Abdul Kalam, A. P. J." vs "APJ Abdul Kalam". Token order is otherwise kept:
// "R S Aggarwal" and "S R Aggarwal" are different names.
export function normalizeAuthor(value: string): string {
  const raw = String(value || '').replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/^\s*by\s+/i, '');
  const segments = raw.split(/[,;]/).map(segment => normalizeText(segment.replace(/\b\d{3,4}\??\s*[-–—]\s*(?:\d{3,4}\??)?/g, ' ')))
    .filter(segment => segment && !ROLE.test(segment) && !DATES.test(segment));
  let ordered = segments;
  if (segments.length === 2) ordered = [segments[1], segments[0]];
  else if (segments.length === 3 && SUFFIX.test(segments[2])) ordered = [segments[1], segments[0], segments[2]];
  const tokens = ordered.join(' ').split(' ').filter(Boolean);
  while (tokens.length > 1 && HONORIFIC.has(tokens[0])) tokens.shift();
  // Join initials so "a p j", "a.p.j." and "apj" compare equal.
  const joined: string[] = [];
  let initials = '';
  for (const token of tokens) {
    if (/^\p{L}$/u.test(token)) { initials += token; continue; }
    if (initials) { joined.push(initials); initials = ''; }
    joined.push(token);
  }
  if (initials) joined.push(initials);
  return joined.join(' ');
}

// Catalog display cards use the explicitly listed lead author. Additional
// contributors remain on each record; no ISBNs, work IDs or holdings are merged.
function authorKey(book: PublicBook) {
  const names = (isCatalog(book) ? book.authors.slice(0, 1) : book.authors).map(normalizeAuthor).filter(Boolean);
  return [...new Set(names)].sort().join('|');
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const VOLUME_MARKERS = new Set(['vol', 'vols', 'volume', 'v', 'part', 'pt', 'book', 'bk', 'no', 'number', 'num', 'tome', 'tomo', 'band',
  'episode', 'issue', 'installment', 'instalment', 'भाग', 'खंड', 'खण्ड', 'பாகம்', 'தொகுதி', 'பகுதி']);
function volumeNumber(token: string): string | null {
  if (/^\d{1,4}$/.test(token)) return String(Number(token));
  if (/^\d{1,4}(?:st|nd|rd|th)$/.test(token)) return String(parseInt(token, 10));
  if (NUMBER_WORDS[token]) return String(NUMBER_WORDS[token]);
  if (/^[ivxlc]+$/.test(token) && /^(?:c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/.test(token)) {
    const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    let total = 0;
    for (let index = 0; index < token.length; index++) {
      const value = values[token[index]], next = values[token[index + 1]] || 0;
      total += value < next ? -value : value;
    }
    return total ? String(total) : null;
  }
  return null;
}
// Volume, part or number statements in the title or edition statement, e.g.
// "Vol. 2", "Part II", "Book 3", "भाग 2". Different values are different books.
export function volumeKey(book: Pick<PublicBook, 'title' | 'edition'>): string {
  const found = new Set<string>();
  for (const value of [book.title, book.edition || '']) {
    const tokens = normalizeText(value).split(' ');
    tokens.forEach((token, index) => {
      // "book one", "part ii", "vol 2"; also "2nd volume" and "second book".
      const after = VOLUME_MARKERS.has(token) ? volumeNumber(tokens[index + 1] || '') : null;
      const before = index > 0 && ['volume', 'vol', 'part', 'book', 'भाग', 'பாகம்'].includes(token) ? volumeNumber(tokens[index - 1]) : null;
      const marker = token === 'v' || token === 'vols' ? 'vol' : token;
      // A bare "v" or "no" counts only before a digit ("v. 2", "No. 3").
      if (after && (!['v', 'no', 'num'].includes(token) || /^\d/.test(tokens[index + 1]))) found.add(`${canonicalMarker(marker)}${after}`);
      else if (before && !/^\d{3,4}$/.test(tokens[index - 1])) found.add(`${canonicalMarker(marker)}${before}`);
    });
  }
  return [...found].sort().join(' ');
}
function canonicalMarker(marker: string) {
  if (['vol', 'vols', 'volume', 'tome', 'tomo', 'band', 'खंड', 'खण्ड', 'தொகுதி'].includes(marker)) return 'vol';
  if (['part', 'pt', 'भाग', 'பாகம்', 'பகுதி'].includes(marker)) return 'part';
  if (['book', 'bk'].includes(marker)) return 'book';
  return 'no';
}

// Known record language(s). Work records list the languages of their
// editions; "und", "mul" and "zxx" say nothing.
function languagesOf(book: PublicBook): Set<string> {
  const codes = book.language ? [book.language] : book.languages || [];
  return new Set(codes.map(code => code.toLowerCase()).filter(code => code && !['und', 'mul', 'zxx'].includes(code)));
}
const languagesConflict = (left: Set<string>, right: Set<string>) => left.size > 0 && right.size > 0 && ![...left].some(code => right.has(code));

// Titles that many unrelated books share: collections, life writing and
// school subjects (textbooks by different "R. D. Sharma"s and "S. K. Gupta"s).
// Author typo tolerance never applies to them (exact title and author matches
// still share a card).
const GENERIC_TITLES = new Set(['poems', 'selected poems', 'collected poems', 'complete poems', 'poetry', 'stories', 'short stories',
  'selected stories', 'collected stories', 'complete stories', 'selected short stories', 'collected short stories', 'complete short stories',
  'works', 'collected works', 'complete works', 'selected works', 'poetical works', 'complete poetical works', 'prose', 'selected prose',
  'essays', 'selected essays', 'collected essays', 'letters', 'selected letters', 'correspondence', 'plays', 'collected plays', 'novels', 'writings',
  'selected writings', 'speeches', 'lectures', 'tales', 'fables', 'sermons', 'diary', 'diaries', 'journal', 'journals', 'notebooks', 'memoir', 'memoirs',
  'autobiography', 'my autobiography', 'biography', 'mathematics', 'physics', 'chemistry', 'biology', 'economics', 'history', 'geography',
  'grammar', 'english grammar', 'accountancy', 'statistics', 'kahaniyan', 'kavitayen', 'कहानियाँ', 'कहानियां', 'कविताएँ', 'कविताएं', 'निबंध',
  'சிறுகதைகள்', 'கவிதைகள்', 'கட்டுரைகள்'].map(title => normalizeText(title)));
const isGenericTitle = (title: string) => GENERIC_TITLES.has(title.replace(/^(?:the|a|an)\s+/, ''));

function withinOneEdit(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}
// One person's normalised name with an obvious source typo ("paulo coello" vs
// "paulo coelho"): at least two name tokens, the same number of tokens, every
// token equal except one, and that one at least 5 letters long in both, with
// the same first letter and within one edit. Initials and short names never
// qualify, and the matching part must include a full name of 4+ letters:
// "R. D. Sharma" / "R. D. Sarma" or "K. Verma" / "K. Varma" match only on
// initials, which many different people share.
function nameTypo(left: string, right: string) {
  const a = left.split(' '), b = right.split(' ');
  if (a.length < 2 || a.length !== b.length) return false;
  const differing = a.map((token, index) => [token, b[index]]).filter(([x, y]) => x !== y);
  if (differing.length !== 1) return false;
  if (!a.some((token, index) => token === b[index] && /^\p{L}{4,}$/u.test(token))) return false;
  const [x, y] = differing[0];
  return /^\p{L}{5,}$/u.test(x) && /^\p{L}{5,}$/u.test(y) && x[0] === y[0] && withinOneEdit(x, y);
}
// Same number of authors, all equal except one pair that is a name typo.
function authorsTypo(left: string, right: string) {
  if (!left || !right || left === right) return false;
  const a = left.split('|'), b = right.split('|');
  if (a.length !== b.length) return false;
  const onlyA = a.filter(name => !b.includes(name)), onlyB = b.filter(name => !a.includes(name));
  return onlyA.length === 1 && onlyB.length === 1 && nameTypo(onlyA[0], onlyB[0]);
}

// Titles compare with normalizeText, except that "+" and "#" are kept as
// words: "Let Us C" and "Let Us C++" (or "C#") are different books.
const titleText = (title: string) => normalizeText(String(title || '').replace(/\+/g, ' plus ').replace(/#/g, ' sharp '));

type Entry = { book: PublicBook; index: number; workId: string | null; title: string; author: string; volume: string; languages: Set<string> };
const fallbackKey = (entry: Entry) => `${entry.title}\u0001${entry.volume}\u0001${entry.author}`;
const titleKey = (entry: Entry) => `${entry.title}\u0001${entry.volume}`;

// Presentation groups only: every record keeps its own key, ISBNs and
// availability lookup; nothing here is a claim of work equivalence.
// 1. Records sharing an Open Library work ID belong together.
// 2. Records with the same normalised title, volume/part statement and
//    (non-empty) author set share a card, even with different work IDs. Open
//    Library holds duplicate work records for one book, and series volumes
//    whose record title is only the series name; the latter are different
//    books, so a card spanning work IDs is labelled as separate records.
//    Records without a work ID (Google Books) and without authors still group
//    with each other by title and volume, as before.
// 3. An obvious author typo ("Coello" / "Coelho", see nameTypo) is tolerated
//    only for an identical, non-generic title and volume, and only when the
//    records' known languages do not conflict. Titles are never fuzzy-matched.
// 4. A non-catalog record without authors and work ID joins the only
//    attributed group with the same title and volume; when unsure it stays apart.
export function groupSearchResults(books: PublicBook[]): SearchGroup[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  books.forEach((book, index) => {
    if (seen.has(book.bookKey)) return;
    seen.add(book.bookKey);
    entries.push({ book, index: entries.length, workId: workIdOf(book), title: titleText(book.title), author: authorKey(book), volume: volumeKey(book), languages: languagesOf(book) });
  });

  // Union-find over entry positions; the root is always the best-ranked entry.
  const parent = entries.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (left: number, right: number) => {
    const a = find(left), b = find(right);
    if (a !== b) { if (a < b) parent[b] = a; else parent[a] = b; }
  };
  const firstBy = new Map<string, number>();
  const link = (key: string, index: number) => { const first = firstBy.get(key); if (first === undefined) firstBy.set(key, index); else union(first, index); };
  for (const entry of entries) {
    if (entry.workId) link(`work\u0001${entry.workId}`, entry.index);
    if (entry.author || !entry.workId) link(`book\u0001${fallbackKey(entry)}`, entry.index);
  }
  const byTitle = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!entry.author || isGenericTitle(entry.title)) continue;
    const list = byTitle.get(titleKey(entry)) || [];
    for (const other of list) {
      if (find(other.index) !== find(entry.index) && authorsTypo(other.author, entry.author) && !languagesConflict(other.languages, entry.languages)) union(other.index, entry.index);
    }
    list.push(entry);
    byTitle.set(titleKey(entry), list);
  }

  const members = new Map<number, Entry[]>();
  for (const entry of entries) { const root = find(entry.index); members.set(root, [...(members.get(root) || []), entry]); }
  // Author-less, work-less records may join the only attributed group with the
  // same title and volume. Catalog records without an author always stay apart.
  const attributed = new Map<string, Set<number>>();
  for (const [root, list] of members) {
    if (!list.some(entry => entry.author)) continue;
    for (const entry of list) attributed.set(titleKey(entry), new Set([...(attributed.get(titleKey(entry)) || []), root]));
  }
  for (const [root, list] of [...members]) {
    if (list.some(entry => entry.author || entry.workId)) continue;
    const title = titleKey(list[0]);
    const targets = [...(attributed.get(title) || [])];
    if (targets.length !== 1 || entries.some(entry => isCatalog(entry.book) && titleKey(entry) === title)) continue;
    members.get(targets[0])!.push(...list);
    members.delete(root);
  }

  return [...members.values()].map(list => {
    list.sort((a, b) => a.index - b.index);
    // The key names the best-ranked attributed record's work (or its title
    // key without one), so it stays put when later pages add records.
    const anchor = list.find(entry => entry.author || entry.workId) || list[0];
    const key = anchor.workId ? `g2:work:${anchor.workId}` : `g2:title:${fallbackKey(anchor)}`;
    const works = new Set(list.map(entry => entry.workId).filter(Boolean));
    const counts = list.map(entry => entry.book.editionCount || 0).filter(count => count > 0);
    return { key, index: list[0].index, group: { key, book: list.find(({ book }) => book.authors.length)?.book || list[0].book, versions: list.map(({ book }) => book),
      separateWorks: works.size > 1, ...(counts.length ? { editionCount: Math.max(...counts) } : {}) } };
  }).sort((a, b) => a.index - b.index).map(({ group }) => group);
}

// Cover fallbacks for a card: other records of the same work only. A card that
// spans work IDs may hold different books, so it never borrows their covers.
export function coverAlternatives(group: SearchGroup): PublicBook[] {
  if (!group.separateWorks) return group.versions;
  const work = workIdOf(group.book);
  return group.versions.filter(version => workIdOf(version) === work);
}


function yearOf(date?: string) {
  if (!date) return '';
  return /(?<!\d)(1[4-9]\d{2}|20\d{2})(?!\d)/.exec(date)?.[1] || date.trim();
}
function volumeLabel(book: PublicBook) {
  return volumeKey(book).split(' ').filter(Boolean).map(value => {
    const [, marker, number] = /^(vol|part|book|no)(\d+)$/.exec(value) || [];
    return marker ? `${{ vol: 'Volume', part: 'Part', book: 'Book', no: 'No.' }[marker]} ${number}` : '';
  }).filter(Boolean).join(', ');
}

export type VersionLabel = { label: string; showsIsbn: boolean; showsEditions: boolean };

// The one known language of a record, if it has exactly one.
function singleLanguage(book: PublicBook) {
  const codes = [...languagesOf(book)];
  return codes.length === 1 ? codes[0] : '';
}

// Short labels that tell the records in one group apart. Edition statement,
// publisher and year come first; the language is added to every row when the
// rows have different known languages (a translation is an edition a reader
// may want specifically). Volume, edition count, format and ISBN are added only
// to rows that would otherwise read the same, and only where the detail
// differs. "Record n" (catalog records, or records of different works) or
// "Version n" is the last resort.
export function versionLabels(versions: PublicBook[], records = versions.some(isCatalog)): VersionLabel[] {
  const parts = versions.map(version => [version.edition, version.publisher, yearOf(version.publishedDate) && m.publishedIn(yearOf(version.publishedDate))]
    .map(part => (part || '').trim()).filter(Boolean));
  const languages = versions.map(singleLanguage);
  if (new Set(languages.filter(Boolean)).size > 1) languages.forEach((code, index) => { if (code) parts[index].push(languageName(code)); });
  const showsIsbn = versions.map(() => false);
  const showsEditions = versions.map(() => false);
  const labels = () => parts.map(list => list.join(' · '));
  const ambiguous = () => { const all = labels(); return all.map(label => !label || all.filter(other => other === label).length > 1); };
  const extras: Array<[string, (version: PublicBook) => string]> = [
    ['volume', volumeLabel], ['editions', version => version.editionCount && version.editionCount > 1 ? m.editionsGrouped(version.editionCount) : ''],
    ['format', version => version.format?.trim() || ''], ['isbn', version => version.isbn13 ? m.isbnVersion(version.isbn13) : ''],
  ];
  for (const [kind, extra] of extras) {
    const unclear = ambiguous();
    if (!unclear.some(Boolean)) break;
    const current = labels();
    const values = versions.map(extra);
    const additions = values.map((value, index) => Boolean(unclear[index] && value && (!current[index]
      || current.some((label, peer) => peer !== index && label === current[index] && values[peer] !== value))));
    additions.forEach((add, index) => {
      if (!add) return;
      parts[index].push(values[index]);
      if (kind === 'isbn') showsIsbn[index] = true;
      if (kind === 'editions') showsEditions[index] = true;
    });
  }
  const unclear = ambiguous();
  return parts.map((list, index) => {
    const number = records ? m.numberedCatalogRecord(index + 1) : m.numberedVersion(index + 1);
    return { label: (unclear[index] ? [...list, number] : list).join(' · '), showsIsbn: showsIsbn[index], showsEditions: showsEditions[index] };
  });
}
