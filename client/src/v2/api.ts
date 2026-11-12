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

export async function post<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal, progress?:(source:ContentSourceStatus)=>void): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v2${path}`, {
      method: 'POST',
      credentials: import.meta.env.VITE_DEPLOYMENT_ENV === 'preview' ? 'same-origin' : 'omit',
      headers: { 'Content-Type': 'application/json',...progress?{Accept:'application/x-ndjson'}:{} },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PublicApiError({ code: 'NETWORK_ERROR', message: 'Unable to reach the catalog service.' });
  }

  if(progress&&response.headers.get('content-type')?.includes('application/x-ndjson')){
    const reader=response.body?.getReader();if(!reader)throw new PublicApiError();
    const decoder=new TextDecoder();let pending='',bytes=0,result:T|undefined;
    try{
      while(true){const {value,done}=await reader.read();
        if(value){bytes+=value.byteLength;if(bytes>4*1024*1024)throw new PublicApiError();pending+=decoder.decode(value,{stream:true});}
        const lines=pending.split('\n');pending=lines.pop()!;
        for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);
          if(event.type==='source'){
            if(typeof event.source?.id!=='string'||typeof event.source.status!=='string')throw new PublicApiError();
            progress(event.source);
          }
          else if(event.type==='result')result=event.result as T;
          else if(event.type==='error')throw new PublicApiError({code:event.error?.code,message:event.error?.message,status:event.status,sources:event.sources});
        }
        if(done)break;
      }
      if(result===undefined||pending.trim())throw new PublicApiError({code:'CONTENT_UNAVAILABLE',message:'The sources could not finish answering. Please try again.'});
      return result;
    }catch(error){if(error instanceof PublicApiError||signal?.aborted)throw error;throw new PublicApiError({code:'CONTENT_UNAVAILABLE',message:'The sources could not finish answering. Please try again.'});}
    finally{await reader.cancel().catch(()=>{});}
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
});
