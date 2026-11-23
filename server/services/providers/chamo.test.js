import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkPublicAvailability, parseChamoPublicRecord } from './chamo.js';
import { clearHttpCache } from './http.js';

const ISBN = '9780323850285';
const ORIGIN = 'https://webopac.iitm.ac.in';
const RECORD_URL = `${ORIGIN}/lib/item?id=chamo:187479&theme=iitm`;
const library = { id: 'chamo:iit-madras', platform: 'chamo', slug: 'iit-madras', baseUrl: ORIGIN };
const fixture = fs.readFileSync(new URL('../../test/fixtures/chamo/iitm-record.html', import.meta.url), 'utf8');
const search = `<ul class="records"><li class="record"><div class="recordImage" data-isbn="${ISBN}"></div>
<a class="title" href="../lib/item?id=chamo:187479&amp;theme=iitm">Delay - doppler communications</a>
<span class="availabilityTotal">1 of the 2 copies is available</span></li></ul>`;
const originalFetch = global.fetch;
const response = (url, text, status = 200, headers = {}) => ({ url, text: async () => text, status, ok: status >= 200 && status < 300, headers: new Headers(headers) });

afterEach(() => {
  global.fetch = originalFetch;
  clearHttpCache();
});

test('captured IITM MARC and copy table prove one available of two copies at the reading hall', () => {
  assert.deepEqual(parseChamoPublicRecord(fixture, ISBN), {
    outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true,
    availableCopies: 1, totalCopies: 2, callNumber: '621.391:681.32 HON', format: 'Book',
    locations: [{ name: 'Central Library -- Reading Hall 1', status: 'available', availableCopies: 1, totalCopies: 2 }],
  });
});

test('query echoes, cover-image identifiers, cancelled MARC020$z and other MARC tags never substitute for 020$a', () => {
  for (const record of [
    fixture.replace('$a 9780323850285', '$a 9780735219090'),
    fixture.replace('$a 9780323850285', '$z 9780323850285'),
    fixture.replace('$a 9780323850285', '$a 9780735219090 $z 9780323850285'),
    fixture.replace('class="marcTag">020', 'class="marcTag">022'),
    fixture.replace('$a 9780323850285', '$a 9780323850283'),
  ]) assert.equal(parseChamoPublicRecord(`${record}<p>Search: ${ISBN}</p><script>const isbn='${ISBN}';</script>`, ISBN), null);
  assert.equal(parseChamoPublicRecord(fixture, '9780323850283'), null);
  assert.equal(parseChamoPublicRecord(fixture, '9780735219090'), null);
});

test('copy fields follow headers when columns are reordered', () => {
  const order = [7, 2, 1, 4, 0, 3, 5, 6, 8];
  const reordered = fixture.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, (row, attrs, cells) => {
    const matches = [...cells.matchAll(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi)];
    if (matches.length !== 9) return row;
    return `<tr${attrs}>${order.map((index) => matches[index][0]).join('')}</tr>`;
  });
  const parsed = parseChamoPublicRecord(reordered, ISBN);
  assert.equal(parsed?.outcome, 'available');
  assert.deepEqual(parsed, parseChamoPublicRecord(fixture, ISBN));
});

test('unknown copy statuses never imply unavailable copies or exact counts', () => {
  const unknown = parseChamoPublicRecord(fixture.replace('<div>Available</div>', '<div>In processing</div>'), ISBN);
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(unknown.locations[0].status, 'unknown');
  assert.equal(Object.hasOwn(unknown, 'availableCopies'), false);
  assert.equal(Object.hasOwn(unknown, 'totalCopies'), false);
  assert.equal(Object.hasOwn(unknown.locations[0], 'availableCopies'), false);
  const oneAvailable = parseChamoPublicRecord(fixture.replace('Due October 4, 2026', 'Reference only'), ISBN);
  assert.equal(oneAvailable.outcome, 'available');
  assert.equal(Object.hasOwn(oneAvailable, 'availableCopies'), false);
  assert.equal(Object.hasOwn(oneAvailable, 'totalCopies'), false);
  const noneAvailable = parseChamoPublicRecord(fixture.replace('<div>Available</div>', '<div>Due October 5, 2026</div>'), ISBN);
  assert.equal(noneAvailable.outcome, 'none_available');
  assert.equal(noneAvailable.availableCopies, 0);
});

test('empty, partial, and paginated copy tables remain unknown without guessed totals', () => {
  const variants = [
    fixture.replace(/<tbody>[\s\S]*?<\/tbody>/, '<tbody></tbody>'),
    fixture.replace('</table>\n  </div>', '</table><a href="?copies-page=2">Next</a>\n  </div>'),
    fixture.replace('</table>\n  </div>', '</table><div class="pagination"><a href="?next=1">2</a></div>\n  </div>'),
    fixture.replace('<tr class="odd">', '<tr class="odd"><td colspan="9">Additional copies</td></tr><tr class="odd">'),
    fixture.replace('<tr class="odd">', '<tr class="odd" hidden>'),
    fixture.replace('</table>\n  </div>', '</table><div class="pageLinks"><a href="../wicket/page?next=2">2</a></div>\n  </div>'),
  ];
  for (const html of variants) {
    const result = parseChamoPublicRecord(html, ISBN);
    assert.equal(result.outcome, 'unknown');
    assert.equal(Object.hasOwn(result, 'totalCopies'), false);
    assert.equal(Object.hasOwn(result, 'availableCopies'), false);
  }
  assert.equal(parseChamoPublicRecord(fixture, ISBN, { expectedCopies: 3 }).outcome, 'unknown');
});

test('missing or ambiguous copy-table headers reject the shape rather than infer columns', () => {
  assert.equal(parseChamoPublicRecord(fixture.replace('<span>Status</span>', '<span>Progress</span>'), ISBN), null);
  assert.equal(parseChamoPublicRecord(fixture.replace('<span>Barcode</span>', '<span>Status</span>'), ISBN), null);
  assert.equal(parseChamoPublicRecord(fixture.replace('<a href="#tabContents-1">Copies</a>', '<a href="#tabContents-1">Details</a>'), ISBN), null);
});

test('public lookup makes exactly two honest reads, verifies the record, and caches a confirmed result', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(url, url.includes('/search/query') ? search : fixture);
  };
  const first = await checkPublicAvailability(library, ISBN);
  assert.equal(first.catalogUrl, RECORD_URL);
  assert.equal(first.matchKind, 'exact_isbn');
  assert.equal(first.availableCopies, 1);
  assert.equal(first.totalCopies, 2);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get('term_1'), ISBN);
  assert.equal(calls[1].url, RECORD_URL);
  assert.ok(calls.every((call) => call.options.redirect === 'manual'));
  assert.ok(calls.every((call) => /^MyBookshelf\//.test(call.options.headers['User-Agent'])));
  assert.deepEqual(await checkPublicAvailability(library, ISBN), first);
  assert.equal(calls.length, 2);
});

test('the public path rejects a different record ISBN and keeps no-result searches unconfirmed', async () => {
  global.fetch = async (url) => response(url, url.includes('/search/query') ? search : fixture.replace('$a 9780323850285', '$a 9780735219090'));
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  for (const html of ['<p>did not find any results</p>', '<p>Loading…</p>', search + '<a href="../lib/item?id=chamo:99">Another record</a>', search + '<div class="pageLinks"><a href="../wicket/page?next=2">2</a></div>']) {
    clearHttpCache();
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, html); };
    await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls, 1);
  }
});

test('off-origin, credential-bearing and insecure record links are rejected before any record fetch', async () => {
  for (const href of ['https://elsewhere.example/lib/item?id=chamo:187479', 'http://webopac.iitm.ac.in/lib/item?id=chamo:187479', 'https://reader@webopac.iitm.ac.in/lib/item?id=chamo:187479']) {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, `<a href="${href}">Title</a>`); };
    await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls, 1);
  }
});

test('HTTP blocks, failures and redirects produce typed errors without retries or following redirects', async () => {
  for (const status of [401, 403, 429, 503, 302]) {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, '', status, { location: 'https://elsewhere.example/' }); };
    await assert.rejects(checkPublicAvailability(library, ISBN), { code: [401, 403, 429].includes(status) ? 'CATALOG_PROVIDER_BLOCKED' : 'CATALOG_UNAVAILABLE' });
    assert.equal(calls, 1);
  }
  global.fetch = async () => response('https://elsewhere.example/', search);
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('timeouts, oversized responses and invalid configuration fail safely', async () => {
  global.fetch = async () => { throw Object.assign(new Error('deadline exceeded'), { name: 'AbortError' }); };
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_TIMEOUT' });
  let calls = 0;
  global.fetch = async (url) => { calls += 1; return response(url, search, 200, { 'content-length': 2 * 1024 * 1024 }); };
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(checkPublicAvailability(library, '9780323850283'), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
  await assert.rejects(checkPublicAvailability({ ...library, baseUrl: 'http://webopac.iitm.ac.in' }, ISBN), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  assert.equal(calls, 0);
});

test('complete unknown lending responses retain exact edition identity and are not cached', async () => {
  let calls = 0;
  global.fetch = async (url) => { calls += 1; return response(url, url.includes('/search/query') ? search : fixture.replace('<div>Available</div>', '<div>In processing</div>')); };
  for (let i = 0; i < 2; i += 1) {
    const result = await checkPublicAvailability(library, ISBN);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.matchKind, 'exact_isbn');
    assert.equal(result.recognizedExact, true);
    assert.equal(Object.hasOwn(result, 'totalCopies'), false);
  }
  assert.equal(calls, 4);
});
