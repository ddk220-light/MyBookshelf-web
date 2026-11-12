import type { PublicBook } from './types';

const candidates = new Map<string, PublicBook[]>();
const catalogs = new Map<string, { name: string; hasMore: boolean }>();
const queries = new Map<string, string>();
export type SearchPage = { nextOffset?: number | null; partial?: boolean; libraryId?: string; incompleteOffsets?: number[]; fetchedThrough?: number };
const pages = new Map<string, SearchPage>();
export type SearchView = { visibleCount: number; expandedKeys: string[]; scrollTop: number; visited: boolean };
const views = new Map<string, SearchView>();
// One-shelf search (plan Phase 5): the reader's saved books (by bookKey) that
// matched the query when it ran. They are listed first with the bookmark badge.
const shelfMatches = new Map<string, string[]>();
const MAX_CANDIDATE_SETS = 20;
export function clearSearchMemory(): void { candidates.clear();catalogs.clear();queries.clear();pages.clear();views.clear();shelfMatches.clear(); }

function opaqueId(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `c${values[0].toString(36)}${values[1].toString(36)}`;
}

export function rememberCandidates(items: PublicBook[], catalog?: { name: string; hasMore: boolean }, query?: string, page?: SearchPage): string {
  const id = opaqueId();
  candidates.set(id, items);
  if (catalog) catalogs.set(id, catalog);
  if (query) queries.set(id, query);
  if (page) pages.set(id, { ...page, incompleteOffsets: page.partial ? [0] : [], fetchedThrough: 0 });
  while (candidates.size > MAX_CANDIDATE_SETS) {
    const first = candidates.keys().next().value as string | undefined;
    if (!first) break;
    candidates.delete(first);
    catalogs.delete(first);
    queries.delete(first);
    pages.delete(first);
    views.delete(first);
    shelfMatches.delete(first);
  }
  return id;
}

export function rememberShelfMatches(id: string, bookKeys: string[]) {
  if (candidates.has(id)) shelfMatches.set(id, [...bookKeys]);
}
export function shelfMatchesFor(id: unknown): string[] {
  return typeof id === 'string' ? shelfMatches.get(id) || [] : [];
}

export function pageForCandidates(id: string): SearchPage { return pages.get(id) || {}; }

export function viewForCandidates(id: string): SearchView {
  return views.get(id) || { visibleCount: 5, expandedKeys: [], scrollTop: 0, visited: false };
}

export function updateSearchView(id: string, patch: Partial<SearchView>) {
  if (candidates.has(id)) views.set(id, { ...viewForCandidates(id), ...patch });
}

export function markIncompletePage(id: string, offset: number): SearchPage {
  const previous = pageForCandidates(id);
  const page = { ...previous, partial: true, incompleteOffsets: [...new Set([...(previous.incompleteOffsets || []), offset])].sort((a, b) => a - b) };
  if (candidates.has(id)) pages.set(id, page);
  return page;
}

// A retry of an earlier page must not roll back the pagination cursor or erase
// successful records from later pages. All keys retain their provider identity.
export function mergeCandidatePage(id: string, offset: number, response: {
  candidates: PublicBook[]; nextOffset?: number | null; partial?: boolean;
  catalog?: { name: string; hasMore: boolean };
}) {
  const previous = pageForCandidates(id);
  const incomplete = new Set(previous.incompleteOffsets || (previous.partial ? [0] : []));
  if (response.partial) incomplete.add(offset); else incomplete.delete(offset);
  const newest = offset >= (previous.fetchedThrough || 0);
  const merged = [...new Map([...(candidates.get(id) || []), ...response.candidates].map(book => [book.bookKey, book])).values()];
  const page = { ...previous, ...(newest ? { nextOffset: response.nextOffset, fetchedThrough: offset } : {}),
    partial: incomplete.size > 0, incompleteOffsets: [...incomplete].sort((a, b) => a - b) };
  updateCandidates(id, merged, page, newest ? response.catalog : undefined);
  return { items: merged, page, catalog: catalogs.get(id) };
}

export function updateCandidates(id: string, items: PublicBook[], page: SearchPage, catalog?: { name: string; hasMore: boolean }) {
  if (!candidates.has(id)) return;
  candidates.set(id, items);
  pages.set(id, page);
  if (catalog) catalogs.set(id, catalog);
}

export function candidatesFor(id: unknown): PublicBook[] | null {
  return typeof id === 'string' ? candidates.get(id) || null : null;
}

export function catalogForCandidates(id: unknown) {
  return typeof id === 'string' ? catalogs.get(id) : undefined;
}

// Search text stays in this bounded, same-tab memory; never in URLs, browser
// history state or local storage. It is lost when the page is reloaded.
// History entries carry only the opaque candidate ID. The server keeps an
// anonymous operational log (usageLog.js; plan 4.6.2).
export function queryForCandidates(id: unknown): string {
  return typeof id === 'string' ? queries.get(id) || '' : '';
}
