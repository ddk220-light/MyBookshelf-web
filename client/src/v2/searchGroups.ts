import type { PublicBook } from './types';
import { uiMessages as m } from './uiMessages';

// `key` identifies the presentation group for remembered UI state such as an
// expanded card. It never equals a record's bookKey ("v1:…"), so a key that
// was remembered for another grouping cannot open the wrong card.
export type SearchGroup = { key: string; book: PublicBook; versions: PublicBook[] };

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

type Entry = { book: PublicBook; index: number; workId: string | null; title: string; author: string; volume: string };
const fallbackKey = (entry: Entry) => `${entry.title}\u0001${entry.volume}\u0001${entry.author}`;

// Presentation groups only: retain every record's key and availability lookup.
// 1. Records sharing an Open Library work ID belong together; different work
//    IDs are never merged, however similar their titles.
// 2. Records without a work ID group by normalised title, volume statement and
//    authors. Records with conflicting or missing volume information stay apart.
// 3. A record without a work ID joins a work only when exactly one work in the
//    results has the same title, volume and authors; when unsure it stays apart.
export function groupSearchResults(books: PublicBook[]): SearchGroup[] {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  books.forEach((book, index) => {
    if (seen.has(book.bookKey)) return;
    seen.add(book.bookKey);
    entries.push({ book, index, workId: workIdOf(book), title: normalizeText(book.title), author: authorKey(book), volume: volumeKey(book) });
  });

  const groups = new Map<string, Entry[]>();
  const add = (key: string, entry: Entry) => { const list = groups.get(key) || []; list.push(entry); groups.set(key, list); };
  // Work IDs that each title/volume/author key is attributed to.
  const worksByKey = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.workId) continue;
    add(`g1:work:${entry.workId}`, entry);
    const works = worksByKey.get(fallbackKey(entry)) || new Set<string>();
    works.add(entry.workId);
    worksByKey.set(fallbackKey(entry), works);
  }
  for (const entry of entries) {
    if (entry.workId) continue;
    const works = isCatalog(entry.book) || !entry.author ? undefined : worksByKey.get(fallbackKey(entry));
    add(works?.size === 1 ? `g1:work:${[...works][0]}` : `g1:title:${fallbackKey(entry)}`, entry);
  }

  // Records without an author may join the only attributed group with the same
  // title and volume. They never inherit an author where attribution conflicts,
  // and catalog records without an author always stay apart.
  const byTitle = new Map<string, string[]>();
  for (const [key, list] of groups) {
    if (!list.some(entry => entry.author)) continue;
    const titles = new Set(list.map(entry => `${entry.title}\u0001${entry.volume}`));
    for (const title of titles) byTitle.set(title, [...(byTitle.get(title) || []), key]);
  }
  for (const [key, list] of [...groups]) {
    if (!key.startsWith('g1:title:') || list.some(entry => entry.author || entry.workId)) continue;
    const title = `${list[0].title}\u0001${list[0].volume}`;
    const targets = byTitle.get(title) || [];
    if (targets.length !== 1 || entries.some(entry => isCatalog(entry.book) && `${entry.title}\u0001${entry.volume}` === title)) continue;
    groups.get(targets[0])!.push(...list);
    groups.delete(key);
  }

  return [...groups].map(([key, list]) => {
    list.sort((a, b) => a.index - b.index);
    return { key, index: list[0].index, book: list.find(({ book }) => book.authors.length)?.book || list[0].book, versions: list.map(({ book }) => book) };
  }).sort((a, b) => a.index - b.index).map(({ key, book, versions }) => ({ key, book, versions }));
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

export type VersionLabel = { label: string; showsIsbn: boolean };

// Short labels that tell the records in one group apart. Edition statement,
// publisher and year come first; volume, format and ISBN are added only to rows
// that would otherwise read the same, and only where the detail differs.
// "Record n" (catalog) or "Version n" is the last resort.
export function versionLabels(versions: PublicBook[], catalog = versions.some(isCatalog)): VersionLabel[] {
  const parts = versions.map(version => [version.edition, version.publisher, yearOf(version.publishedDate) && m.publishedIn(yearOf(version.publishedDate))]
    .map(part => (part || '').trim()).filter(Boolean));
  const showsIsbn = versions.map(() => false);
  const labels = () => parts.map(list => list.join(' · '));
  const ambiguous = () => { const all = labels(); return all.map(label => !label || all.filter(other => other === label).length > 1); };
  const extras: Array<[string, (version: PublicBook) => string]> = [
    ['volume', volumeLabel], ['format', version => version.format?.trim() || ''], ['isbn', version => version.isbn13 ? m.isbnVersion(version.isbn13) : ''],
  ];
  for (const [kind, extra] of extras) {
    const unclear = ambiguous();
    if (!unclear.some(Boolean)) break;
    const current = labels();
    const values = versions.map(extra);
    const additions = values.map((value, index) => Boolean(unclear[index] && value && (!current[index]
      || current.some((label, peer) => peer !== index && label === current[index] && values[peer] !== value))));
    additions.forEach((add, index) => { if (add) { parts[index].push(values[index]); if (kind === 'isbn') showsIsbn[index] = true; } });
  }
  const unclear = ambiguous();
  return parts.map((list, index) => {
    const number = catalog ? m.numberedCatalogRecord(index + 1) : m.numberedVersion(index + 1);
    return { label: (unclear[index] ? [...list, number] : list).join(' · '), showsIsbn: showsIsbn[index] };
  });
}
