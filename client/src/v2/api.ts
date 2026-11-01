import type { Availability, PublicBook, PublicLibrary, PublicLibraryPage, LibraryDiscovery, LibraryAreas, Place } from './types';
import type { ContentSourceStatus } from './contentTypes';

type ApiErrorBody = { error?: { code?: string; message?: string } };

export class PublicApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly sources?: ContentSourceStatus[];

  constructor({ code = 'REQUEST_FAILED', message = 'Something went wrong. Please try again.', status = 0, sources }: {
    code?: string;
    message?: string;
    status?: number;
    sources?: ContentSourceStatus[];
  } = {}) {
    super(message);
    this.name = 'PublicApiError';
    this.code = code;
    this.status = status;
    if (sources) this.sources = sources;
  }
}

export async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v2${path}`, {
      method: 'POST',
      credentials: import.meta.env.VITE_DEPLOYMENT_ENV === 'preview' ? 'same-origin' : 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PublicApiError({ code: 'NETWORK_ERROR', message: 'Unable to reach the catalog service.' });
  }

  const data = await response.json().catch(() => ({})) as T & ApiErrorBody & { sources?: ContentSourceStatus[] };
  if (!response.ok) {
    throw new PublicApiError({
      code: data.error?.code,
      message: data.error?.message,
      status: response.status,
      sources: data.sources,
    });
  }
  return data;
}

export const publicApi = Object.freeze({
  async searchPlaces(query: string, signal?: AbortSignal, country?: string): Promise<Place[]> {
    const data = await post<{ places: Place[] }>('/places/search', { query, ...(country ? { country } : {}) }, signal);
    return data.places;
  },
  async discoverLibraries(filters: LibraryDiscovery, signal?: AbortSignal): Promise<PublicLibraryPage> {
    return post('/libraries/discover', { ...filters, limit: 25 }, signal);
  },
  async libraryAreas(country?: string, region?: string, signal?: AbortSignal): Promise<LibraryAreas> {
    return post('/libraries/areas', { country, region }, signal);
  },
  async searchLibraries(query: string): Promise<PublicLibrary[]> {
    const data = await post<{ libraries: PublicLibrary[] }>('/libraries/search', { query, limit: 25 });
    return data.libraries;
  },

  async resolveLibrary(libraryId: string): Promise<PublicLibrary> {
    const data = await post<{ library: PublicLibrary }>('/libraries/resolve', { libraryId });
    return data.library;
  },

  async resolveLibraryLink(slug: string, signal?: AbortSignal): Promise<PublicLibrary> {
    const data = await post<{ library: PublicLibrary }>('/libraries/resolve-link', { slug }, signal);
    return data.library;
  },

  async browseLibraries(country: string, region: string, offset = 0): Promise<PublicLibraryPage> {
    return post('/libraries/browse', { country, region, offset, limit: 25 });
  },

  async searchBooks(query: string, signal?: AbortSignal, libraryId?: string, offset?: number): Promise<{ kind: 'exact'; book: PublicBook } | { kind: 'candidates'; candidates: PublicBook[]; nextOffset?: number | null; partial?: boolean; catalog?: { libraryId: string; name: string; hasMore: boolean }; catalogUnavailable?: boolean; catalogSearchUrl?: string }> {
    return post('/books/search', { query, ...(libraryId ? { libraryId } : {}), ...(offset !== undefined ? { offset } : {}) }, signal);
  },
  async enrichBook(bookKey: string, signal?: AbortSignal): Promise<PublicBook> {
    const result = await post<{ book: PublicBook }>('/books/enrich', { bookKey }, signal);
    return result.book;
  },

  async resolveBook(bookKey: string): Promise<PublicBook> {
    const data = await post<{ book: PublicBook }>('/books/resolve', { bookKey });
    return data.book;
  },

  async availability(libraryId: string, bookKey: string, options?: { editionScope: 'work' | 'exact'; language?: string }): Promise<Availability> {
    return post('/availability', { libraryId, bookKey, ...options });
  },
});
