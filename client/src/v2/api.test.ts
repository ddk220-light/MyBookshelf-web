import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicApi, PublicApiError } from './api';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public API adapter', () => {
  it('uses only the v2 route with credentials omitted', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'production');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ libraries: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(publicApi.searchLibraries('Chennai University')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v2/libraries/search', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify({ query: 'Chennai University', limit: 25 }),
    }));
  });

  it('allows the existing Vercel access cookie only in protected preview builds', async () => {
    vi.stubEnv('VITE_DEPLOYMENT_ENV', 'preview');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ libraries: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await publicApi.searchLibraries('Burlingame');
    expect(fetchMock).toHaveBeenCalledWith('/api/v2/libraries/search', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('book page check: keeps the four answers, makes anything else "unknown", and keeps only web catalog links', async () => {
    const reply = (data: unknown) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })));
    for (const answer of ['found', 'not_found', 'unconfirmed', 'unknown']) {
      reply({ answer, catalogUrl: 'https://catalog.example.test/record/1' });
      await expect(publicApi.holdingsCheck('koha:a', 'v1:isbn:9788173711466')).resolves.toEqual({ answer, catalogUrl: 'https://catalog.example.test/record/1' });
    }
    for (const data of [{ answer: 'checking' }, { answer: 'NOT_FOUND' }, {}, { answer: 'found', catalogUrl: 'javascript:alert(1)' }]) {
      reply(data);
      const result = await publicApi.holdingsCheck('koha:a', 'v1:isbn:9788173711466');
      expect(result.catalogUrl).toBeUndefined();
      expect(result.answer).toBe(data.answer === 'found' ? 'found' : 'unknown');
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await publicApi.libraryRequest('Tirunelveli');
    expect(fetchMock).toHaveBeenCalledWith('/api/v2/library-requests', expect.objectContaining({ body: JSON.stringify({ text: 'Tirunelveli' }) }));
  });

  it('background check: passes on found marks for asked books only, needs the done line, and rejects any failure', async () => {
    const stream = (text: string, type = 'application/x-ndjson; charset=utf-8', status = 200) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text, { status, headers: { 'Content-Type': type } })));
    const asked = ['v1:openlibrary:OL1W', 'v1:openlibrary:OL2W'];
    const run = () => { const marks: string[] = []; return { marks, done: publicApi.holdingsSearch('koha:a', 'wings', asked, key => marks.push(key)) }; };
    stream(['{"type":"mark","bookKey":"v1:openlibrary:OL2W","answer":"found"}', '{"type":"mark","bookKey":"v1:openlibrary:OL1W","answer":"not_found"}',
      '{"type":"mark","bookKey":"v1:openlibrary:OL9W","answer":"found"}', '{"type":"later","x":1}', '{"type":"done","unchecked":["v1:openlibrary:OL1W","other"]}', ''].join('\n'));
    let call = run();
    await expect(call.done).resolves.toEqual({ unchecked: ['v1:openlibrary:OL1W'] });
    expect(call.marks).toEqual(['v1:openlibrary:OL2W']);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/v2/holdings/search', expect.objectContaining({ body: JSON.stringify({ libraryId: 'koha:a', query: 'wings', books: asked.map(bookKey => ({ bookKey })) }),
      headers: expect.objectContaining({ Accept: 'application/x-ndjson' }) }));
    // Marks already passed on stand; the call still rejects.
    for (const text of ['{"type":"mark","bookKey":"v1:openlibrary:OL1W","answer":"found"}\n', '{"type":"mark","bookKey":"v1:openlibrary:OL1W","answer":"found"}\n{"type":"do', '[1]\n{"type":"done","unchecked":[]}\n']) {
      stream(text);
      call = run();
      await expect(call.done).rejects.toBeTruthy();
      expect(call.marks).toEqual(text.startsWith('[') ? [] : ['v1:openlibrary:OL1W']);
    }
    stream('{"answers":{}}', 'application/json');
    await expect(run().done).rejects.toBeInstanceOf(PublicApiError);
    stream('{"error":{"code":"INVALID_REQUEST","message":"The request is invalid."}}', 'application/json', 400);
    await expect(run().done).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 400 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(run().done).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('uses the server-provided public error without exposing request data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } }), { status: 404 })));

    await expect(publicApi.searchBooks('Synthetic query text')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
      status: 404,
      message: 'No public book details were found.',
    });
  });
});
