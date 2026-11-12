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

  it('uses the server-provided public error without exposing request data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } }), { status: 404 })));

    await expect(publicApi.searchBooks('Not stored anywhere')).rejects.toMatchObject({
      code: 'BOOK_NOT_FOUND',
      status: 404,
      message: 'No public book details were found.',
    });
  });
});
