import type { PublicBook } from './types';

// Same-tab memory for shelf search (plan Phase 5): the results of a search
// under an opaque ID, the text that produced them, and the reader's saved
// books (by bookKey) that matched, listed first with the bookmark badge.
const candidates = new Map<string, PublicBook[]>();
const queries = new Map<string, string>();
const shelfMatches = new Map<string, string[]>();
const MAX_CANDIDATE_SETS = 20;
export function clearSearchMemory(): void { candidates.clear(); queries.clear(); shelfMatches.clear(); }

function opaqueId(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `c${values[0].toString(36)}${values[1].toString(36)}`;
}

export function rememberCandidates(items: PublicBook[], query?: string): string {
  const id = opaqueId();
  candidates.set(id, items);
  if (query) queries.set(id, query);
  while (candidates.size > MAX_CANDIDATE_SETS) {
    const first = candidates.keys().next().value as string | undefined;
    if (!first) break;
    candidates.delete(first);
    queries.delete(first);
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

export function candidatesFor(id: unknown): PublicBook[] | null {
  return typeof id === 'string' ? candidates.get(id) || null : null;
}

// Search text stays in this bounded, same-tab memory; never in URLs, browser
// history state or local storage. It is lost when the page is reloaded.
// History entries carry only the opaque candidate ID. The server keeps an
// anonymous operational log (usageLog.js; plan 4.6.2).
export function queryForCandidates(id: unknown): string {
  return typeof id === 'string' ? queries.get(id) || '' : '';
}
