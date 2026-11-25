// Key events for the Google tag (shared/google-tag.mjs; docs/GOOGLE_TAG.md).
// Page views, scrolls and clicks on outside links come from the tag itself.
// Never pass search text or anything about the account.
import type { BookNavigation } from './bookNavigation';
import { candidatesFor, shelfMatchesFor } from './searchMemory';
import type { PublicLibrary } from './types';
import type { SearchAnswer } from './ui/search/useBookSearch';

declare global {
  interface Window { gtag?: (command: 'event', name: string, params?: Record<string, unknown>) => void }
}

/** Sends one key event; nothing without the tag. */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  window.gtag?.('event', name, params);
}

/** The library's public directory ID and country, for an event about a chosen library. */
export function libraryParams(library: Pick<PublicLibrary, 'id' | 'country'>) {
  return { library_id: library.id, library_country: library.country };
}

/** A library's answer as an event outcome: anything but found and not found is "unknown". */
export function outcomeOf(answer: string): string {
  return answer === 'found' || answer === 'not_found' ? answer : 'unknown';
}

/** A finished book search: whether it found anything and roughly how much, never what was searched. */
export function trackBookSearch(answer: SearchAnswer, method: 'typed' | 'scan') {
  if (answer.kind === 'failed') { trackEvent('book_search', { outcome: 'error', method }); return; }
  // A placeholder (no public data for the ISBN) is not a find.
  const count = answer.kind === 'exact' ? (answer.book.metadataStatus === 'missing' ? 0 : 1)
    : candidatesFor(answer.id)?.length || shelfMatchesFor(answer.id).length;
  trackEvent('book_search', { outcome: count ? 'results' : 'none', result_band: !count ? '0' : count <= 5 ? '1-5' : count <= 20 ? '6-20' : '21+', method });
}

/** How a book page was opened, as far as its router state says. */
export function openedFrom(navigation: BookNavigation | null): string {
  if (!navigation) return 'link';
  if (navigation.suggested) return 'suggestion';
  if (navigation.viewed) return 'viewed';
  if (navigation.source === 'camera') return 'scan';
  if (navigation.from === 'search' || navigation.source === 'search' || navigation.source === 'isbn') return 'search';
  return navigation.from === 'shelf' ? 'shelf' : 'other';
}
