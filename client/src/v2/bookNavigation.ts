import type { PublicBook, RecentSource } from './types';

export type BookPageName = 'cover' | 'library' | 'about' | 'details';
export const BOOK_PAGES: BookPageName[] = ['cover', 'library', 'about', 'details'];
export type BookNavigation = { from?: 'shelf' | 'search'; searchState?: { candidateId?: string }; source?: RecentSource; book?: PublicBook; transition?: boolean };
export type LibraryNavigation = { after?: string; book?: PublicBook; notice?: string; bookNavigation?: BookNavigation };

// Share only an explicit local book destination and its edition preferences.
export function safeBookReturn(path?: string | null): string | null {
  if (!path?.startsWith('/app/books/')) return null;
  try {
    const url = new URL(path, 'https://bookshelf.invalid');
    const encodedKey = /^\/app\/books\/([^/]+)$/.exec(url.pathname)?.[1];
    const key = encodedKey && decodeURIComponent(encodedKey);
    if (!key || key.length > 4096 || !/^v1:(isbn|catalog|googlebooks|openlibrary):\S+$/.test(key)) return null;
    const preferences = new URLSearchParams();
    if (url.searchParams.get('edition') === 'exact') preferences.set('edition', 'exact');
    const language = url.searchParams.get('language');
    if (language && /^[a-z]{3}$/.test(language)) preferences.set('language', language);
    return '/app/books/' + encodeURIComponent(key) + (preferences.size ? '?' + preferences : '');
  } catch { return null; }
}

export function libraryReturn(pathname: string, search: string, state: BookNavigation | null): LibraryNavigation {
  const params = new URLSearchParams(search);
  if (!params.has('page')) params.set('page', state?.from === 'search' || state?.searchState || state?.source === 'search' ? 'library' : 'cover');
  return { after: `${pathname}?${params}`, bookNavigation: state || undefined, book: state?.book };
}
