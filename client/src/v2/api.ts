import type { Availability, PublicBook, PublicLibrary, PublicLibraryPage, LibraryDiscovery } from './types';
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

const NDJSON = 'application/x-ndjson';
const MAX_STREAM_BYTES = 4 * 1024 * 1024;
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

async function send(path: string, body: Record<string, unknown>, signal?: AbortSignal, stream = false): Promise<Response> {
  try {
    return await fetch(`/api/v2${path}`, {
      method: 'POST',
      credentials: import.meta.env.VITE_DEPLOYMENT_ENV === 'preview' ? 'same-origin' : 'omit',
      headers: { 'Content-Type': 'application/json', ...stream ? { Accept: NDJSON } : {} },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PublicApiError({ code: 'NETWORK_ERROR', message: 'Unable to reach the catalog service.' });
  }
}

async function failure(response: Response): Promise<PublicApiError> {
  const data = await response.json().catch(() => ({})) as ApiErrorBody & { sources?: ContentSourceStatus[] };
  return new PublicApiError({ code: data.error?.code, message: data.error?.message, status: response.status, sources: data.sources });
}

/**
 * Reads an NDJSON body line by line, handing each parsed line to `onLine`.
 * Throws a SyntaxError for an unreadable line or a last line cut off without
 * its newline, and a PublicApiError for a missing body or one over 4 MB;
 * `onLine` may throw to stop reading. The reader is always released.
 */
export async function readNdjson(response: Response, onLine: (line: unknown) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new PublicApiError();
  const decoder = new TextDecoder();
  let pending = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        bytes += value.byteLength;
        if (bytes > MAX_STREAM_BYTES) throw new PublicApiError();
        pending += decoder.decode(value, { stream: true });
      }
      const lines = pending.split('\n');
      pending = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        onLine(JSON.parse(line));
      }
      if (done) break;
    }
    if (pending.trim()) throw new SyntaxError('The stream ended inside a line.');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal, progress?:(source:ContentSourceStatus)=>void): Promise<T> {
  const response = await send(path, body, signal, Boolean(progress));
  if (progress && response.headers.get('content-type')?.includes(NDJSON)) {
    let result: T | undefined;
    try {
      await readNdjson(response, line => {
        const event = line as { type?: unknown; source?: { id?: unknown; status?: unknown }; result?: unknown; error?: { code?: string; message?: string }; status?: number; sources?: ContentSourceStatus[] };
        if (event?.type === 'source') {
          if (typeof event.source?.id !== 'string' || typeof event.source.status !== 'string') throw new PublicApiError();
          progress(event.source as ContentSourceStatus);
        }
        else if (event?.type === 'result') result = event.result as T;
        else if (event?.type === 'error') throw new PublicApiError({ code: event.error?.code, message: event.error?.message, status: event.status, sources: event.sources });
      });
      if (result === undefined) throw new SyntaxError('The stream ended without a result.');
      return result;
    } catch (error) {
      if (error instanceof PublicApiError || signal?.aborted) throw error;
      throw new PublicApiError({ code: 'CONTENT_UNAVAILABLE', message: 'The sources could not finish answering. Please try again.' });
    }
  }
  if (!response.ok) throw await failure(response);
  return await response.json().catch(() => ({})) as T;
}

export const publicApi = Object.freeze({

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

  async discoverLibraries(filters: LibraryDiscovery, signal?: AbortSignal): Promise<PublicLibraryPage> {
    return post('/libraries/discover', { ...filters, limit: 25 }, signal);
  },

  /** A library catalog record is read only for its own library, which must be the chosen one. */
  async resolveBook(bookKey: string, libraryId?: string | null): Promise<PublicBook> {
    const catalog = bookKey.startsWith('v1:catalog:') && libraryId && bookKey.startsWith('v1:catalog:' + libraryId + ':');
    const data = await post<{ book: PublicBook }>('/books/resolve', catalog ? { bookKey, libraryId } : { bookKey });
    return data.book;
  },

  async availability(libraryId: string, bookKey: string, options?: { editionScope: 'work' | 'exact'; language?: string }): Promise<Availability> {
    return post('/availability', { libraryId, bookKey, ...options });
  },

  // One-shelf (plan 3.5): stored answers only, no catalog request. At most 100
  // books per call. Anything other than "found" or "not_found" is dropped.
  async holdingsLookup(libraryId: string, books: Array<{ bookKey: string; isbn13?: string }>, signal?: AbortSignal): Promise<Record<string, 'found' | 'not_found'>> {
    const data = await post<{ answers?: unknown }>('/holdings/lookup', { libraryId, books: books.slice(0, 100) }, signal);
    const answers: Record<string, 'found' | 'not_found'> = {};
    if (data.answers && typeof data.answers === 'object' && !Array.isArray(data.answers))
      for (const [bookKey, answer] of Object.entries(data.answers as Record<string, unknown>))
        if (answer === 'found' || answer === 'not_found') answers[bookKey] = answer;
    return answers;
  },

  // One-shelf book page (plan 3.5): the stored answer, else one live check.
  // Anything the client does not recognise is "unknown" (couldn't check),
  // never "not found". catalogUrl is kept only when it is an http(s) link.
  async holdingsCheck(libraryId: string, bookKey: string, signal?: AbortSignal): Promise<HoldingsCheck> {
    const data = await post<{ answer?: unknown; catalogUrl?: unknown }>('/holdings/check', { libraryId, bookKey }, signal);
    const answer = data.answer === 'found' || data.answer === 'not_found' || data.answer === 'unconfirmed' ? data.answer : 'unknown';
    const catalogUrl = webLink(data.catalogUrl);
    return { answer, ...(catalogUrl ? { catalogUrl } : {}) };
  },

  // One-shelf background check for search results (plan 5.7): NDJSON lines
  // {type:'mark', bookKey, answer:'found'} as the library's answers arrive,
  // then exactly one {type:'done', unchecked}. Only "found" is ever passed on,
  // and only for a book that was asked about: no mark never means "not in the
  // library". Any failure (network, HTTP error, unreadable or unfinished
  // stream) rejects; marks already passed on stand. At most 12 books.
  async holdingsSearch(libraryId: string, query: string, bookKeys: readonly string[], onMark: (bookKey: string) => void, signal?: AbortSignal): Promise<{ unchecked: string[] }> {
    const asked = [...new Set(bookKeys)].slice(0, 12);
    const response = await send('/holdings/search', { libraryId, query, books: asked.map(bookKey => ({ bookKey })) }, signal, true);
    if (!response.ok) throw await failure(response);
    if (!response.headers.get('content-type')?.includes(NDJSON)) throw new PublicApiError();
    const wanted = new Set(asked);
    let unchecked: string[] | null = null;
    await readNdjson(response, line => {
      if (unchecked) return;
      if (!line || typeof line !== 'object' || Array.isArray(line)) throw new PublicApiError();
      const event = line as { type?: unknown; bookKey?: unknown; answer?: unknown; unchecked?: unknown };
      if (event.type === 'mark') {
        if (event.answer === 'found' && typeof event.bookKey === 'string' && wanted.has(event.bookKey)) onMark(event.bookKey);
      } else if (event.type === 'done') {
        unchecked = Array.isArray(event.unchecked) ? event.unchecked.filter((key): key is string => typeof key === 'string' && wanted.has(key)) : [];
      }
    });
    if (!unchecked) throw new PublicApiError();
    return { unchecked };
  },

  // One-tap "Request to add" from the library pop-up: the typed text only.
  async libraryRequest(text: string): Promise<void> {
    await post('/library-requests', { text });
  },

  // Report a problem: the reader's words plus the screen, library and book
  // shown. No account, email or device identifier is attached.
  async problemReport(report: { text: string; screen?: ProblemScreen; libraryId?: string; bookKey?: string; appVersion?: string }): Promise<void> {
    await post('/problem-reports', report);
  },
});

/** Screens a problem report may name (server catalog-store/requests.js SCREENS). */
export const PROBLEM_SCREENS = ['shelf', 'search', 'book', 'library', 'panel', 'account', 'scan', 'other'] as const;
export type ProblemScreen = typeof PROBLEM_SCREENS[number];

export type HoldingsCheck = { answer: 'found' | 'not_found' | 'unconfirmed' | 'unknown'; catalogUrl?: string };

export function webLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined; } catch { return undefined; }
}
