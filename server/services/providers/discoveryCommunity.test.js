import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, searchCatalog, resolveCatalogRecord, parseSurat, parseSanthom, parseNmmc,
  parseRmrl, parseShodhak, parseRmc, parseSindhiRecord } from './discoveryCommunity.js';
import { parsePmbRecord, parsePmbSearch } from './communityPmb.js';
import { CommunitySession } from './communitySession.js';
import { boundedQuery, parseReplayId, replayId } from './communityRecords.js';
import { clearHttpCache } from './http.js';

const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/community/${name}`, import.meta.url), 'utf8');
const data = name => JSON.parse(fixture(name));
const origins = { surat: 'https://office.suratmunicipal.org', rmc: 'https://emp.rmc.gov.in', rmrl: 'https://rmrl.in',
  nmmc: 'https://vdb.nmmclibrary.in', santhom: 'https://lib.pvpkottayam.in', shodhak: 'https://shodhakbooks.in',
  sindhi: 'https://sindhisanchaya.online', pmb: 'https://mediatheques-afinde.org' };
const library = (family, scope) => ({ id: `discovery-community:${family}-${scope || 'main'}`, name: `Selected ${family}`,
  baseUrl: origins[family], catalogUrl: origins[family] + '/', communityCatalog: { family, ...(scope ? { scope } : {}) } });
const response = (url, value, status = 200, headers = {}) => ({ url, status, ok: status >= 200 && status < 300,
  headers: new Headers(headers), text: async () => typeof value === 'string' ? value : JSON.stringify(value) });
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

test('Surat honors the selected library and does not call reference stock borrowable', () => {
  const books = parseSurat(data('surat.json'), library('surat', '1'));
  assert.equal(books[0].observation.outcome, 'available');
  assert.equal(books.find(r => r.recordId === 's1_00163393_167787').observation.outcome, 'in_catalog');
  assert.equal(books[0].observation.availableCopies, undefined);
  assert.throws(() => parseSurat(data('surat.json'), library('surat', '2')), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  assert.throws(() => parseSurat({ status: 200, data: [], iTotalRecords: 1 }, library('surat', '1')));
});

test('all five Surat branches preserve their published letter-prefixed accession codes', () => {
  for (const scope of ['1', '2', '5', '6', '7']) {
    const books = parseSurat(data(scope === '1' ? 'surat.json' : `surat-${scope}.json`), library('surat', scope));
    assert.ok(books.length > 0);
    assert.match(books[0].recordId, /^s1_[A-Za-z0-9]+_\d+$/);
    assert.ok(books.every(r => r.observation.locations[0].name === 'Selected surat'));
  }
});

test('Surat durable book-code lookup verifies source ID and branch without an earlier process cache', async () => {
  const selected = library('surat', '1'), calls = [];
  global.fetch = async (url) => { calls.push(url); return response(url, data('surat.json')); };
  const record = await resolveCatalogRecord(selected, 's1_00116831_116831');
  assert.equal(record.title, 'AGANPANKH (TRANS: WINGS OF FIRE)');
  const params = new URL(calls[0]).searchParams;
  assert.equal(params.get('CustomData[SearchType]'), 'BookCode');
  assert.equal(params.get('CustomData[LibraryId]'), '1');
  assert.equal(params.get('CustomData[SearchBy]'), '00116831');
  await assert.rejects(resolveCatalogRecord(selected, 's1_00116831_999999'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('Santhom binds source ISBN and lending status to a single reproducible record', () => {
  const books = parseSanthom(data('santhom.json'), library('santhom'), 'India');
  assert.equal(books[3].observation.outcome, 'in_catalog'); // Other pages can contain another copy.
  assert.equal(books[4].isbn, '9788120804265');
  assert.equal(books[0].observation.outcome, 'available');
  assert.equal(books[0].observation.totalCopies, undefined);
  assert.notEqual(books[0].recordId, books[1].recordId);
  assert.deepEqual(parseSanthom({ success: true, total: 0, items: [] }, library('santhom'), 'Absent'), []);
  assert.throws(() => parseSanthom({ success: false, items: [] }, library('santhom'), 'India'));
});

test('Santhom duplicate bibliographic copy rows retain an available copy and stable identity in either order', () => {
  const selected = library('santhom'), original = data('santhom.json').items[4];
  const expected = parseSanthom({ success: true, total: 1, items: [original] }, selected, 'India')[0].recordId;
  for (const statuses of [['In Library', 'Lended'], ['Lended', 'In Library']]) {
    const books = parseSanthom({ success: true, total: 2, items: statuses.map(status => ({ ...original, status })) }, selected, 'India');
    assert.equal(books.length, 1);
    assert.equal(books[0].recordId, expected);
    assert.equal(books[0].observation.outcome, 'available');
    assert.equal(books[0].observation.locations[0].status, 'available');
    assert.equal(books[0].observation.totalCopies, undefined);
  }
});

test('Santhom exact ISBN aggregates matching records and treats unknown or unseen siblings conservatively', async () => {
  const selected = library('santhom'), original = data('santhom.json').items[4];
  let items, total;
  global.fetch = async url => response(url, { success: true, total, items });
  items = [{ ...original, status: 'Lended' }, { ...original, call_no: 'second-copy', status: 'In Library' }]; total = 2;
  let value = await checkAvailability(selected, '9788120804265', original.title, '');
  assert.equal(value.outcome, 'available'); assert.equal(value.matchKind, 'exact_isbn');
  assert.equal(value.availableCopies, undefined);
  items[1].isbn = '-';
  value = await checkAvailability(selected, '9788120804265', original.title, '');
  assert.equal(value.outcome, 'in_catalog'); // Available sibling has an unidentified edition.
  items[1].isbn = original.isbn;
  items[1].status = 'Unknown';
  value = await checkAvailability(selected, '9788120804265', original.title, '');
  assert.equal(value.outcome, 'in_catalog'); assert.equal(value.locations[0].status, 'unknown');
  items[1].status = 'Lended';
  value = await checkAvailability(selected, '9788120804265', original.title, '');
  assert.equal(value.outcome, 'none_available');
  total = 3;
  value = await checkAvailability(selected, '9788120804265', original.title, '');
  assert.equal(value.outcome, 'in_catalog'); assert.equal(value.totalCopies, undefined);
});

test('title-query identities resolve again with a fresh process and cannot silently change to another book', async () => {
  const selected = library('santhom'), requests = [];
  global.fetch = async url => { requests.push(url); return response(url, data('santhom.json')); };
  const records = await searchCatalog(selected, 'India');
  clearHttpCache();
  const fresh = await resolveCatalogRecord(selected, records[4].recordId);
  assert.equal(fresh.isbn, records[4].isbn);
  assert.equal(new URL(requests.at(-1)).searchParams.get('title'), 'India');
  global.fetch = async url => response(url, { success: true, total: 0, items: [] });
  await assert.rejects(resolveCatalogRecord(selected, records[4].recordId), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('NMMC excludes signed image and encrypted navigation tokens from returned books', () => {
  const source = data('nmmc.json');
  source[0].front_page_photo = 'https://storage.example.test/?X-Amz-Signature=private';
  source[0].encrypted_cat_ref_num = 'transient';
  const records = parseNmmc(source, library('nmmc'), 'Wings');
  assert.equal(records[0].observation.outcome, 'in_catalog');
  assert.equal(records[0].recordId, replayId('Wings', '2505'));
  assert.doesNotMatch(JSON.stringify(records), /X-Amz|transient|storage\.example/);
  assert.throws(() => parseNmmc({ error: 'Unavailable' }, library('nmmc'), 'Wings'));
});

test('NMMC uses its public CSRF cookie and a fresh anonymous session on every record resolution', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method !== 'POST') return response(url, '<input type="hidden" name="csrfmiddlewaretoken" value="form-token">', 200,
      { 'set-cookie': 'csrftoken=cookie-token; Domain=.nmmclibrary.in; Path=/L01/; Secure' });
    assert.equal(options.headers.Cookie, 'csrftoken=cookie-token');
    assert.equal(new URLSearchParams(options.body).get('csrfmiddlewaretoken'), 'form-token');
    return response(url, data('nmmc.json'));
  };
  const found = await searchCatalog(library('nmmc'), 'Wings');
  const record = await resolveCatalogRecord(library('nmmc'), found[0].recordId);
  assert.equal(record.title, 'Wings of fire an Autobiography');
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 2);
  assert.ok(calls.every(c => new URL(c.url).pathname.startsWith('/L01/')));
});

test('RMRL decodes public JSON records without executing scripts or claiming borrowing status', () => {
  const records = parseRmrl(fixture('rmrl.html'), library('rmrl'), 'India');
  assert.equal(records.length, 10);
  assert.match(records[0].title, /Guide to health/);
  assert.equal(records[0].observation.outcome, 'in_catalog');
  assert.equal(records[0].recordId, replayId('India', '232'));
  const zero = `<script>self.__next_f.push(${JSON.stringify([1, '0:{"entries":[],"totalCount":0,"searchdb":"books"}\n'])})</script>`;
  assert.deepEqual(parseRmrl(zero, library('rmrl'), 'Absent'), []);
  assert.throws(() => parseRmrl('<script>throw new Error("No results")</script>', library('rmrl'), 'India'));
});

test('Shodhak distinguishes in-circulation and available cards and rejects a loading/error fragment', () => {
  const records = parseShodhak(data('shodhak.json'), library('shodhak'), 'Wings');
  assert.equal(records[0].observation.outcome, 'none_available');
  assert.ok(records.some(r => r.observation.outcome === 'available'));
  assert.throws(() => parseShodhak({ data: '<p>Loading</p>' }, library('shodhak'), 'Wings'));
  assert.deepEqual(parseShodhak({ data: '<p>No books found</p>' }, library('shodhak'), 'Absent'), []);
});

test('Rajkot checks the actual selected branch and recognizes the public server zero alert', () => {
  const books = parseRmc(fixture('rmc-positive.html'), library('rmc', '1'), 'Wings of Fire');
  assert.equal(books.length, 10);
  assert.equal(books[0].observation.outcome, 'in_catalog');
  assert.deepEqual(parseRmc(fixture('rmc-zero.html'), library('rmc', '4'), 'Wings of Fire'), []);
  assert.throws(() => parseRmc(fixture('rmc-positive.html'), library('rmc', '4'), 'Wings of Fire'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  assert.throws(() => parseRmc(fixture('rmc-zero.html').replace("msgAlert_error('No records found.');", ''), library('rmc', '4'), 'Wings of Fire'));
});

test('Rajkot cold record resolution repeats public Books/Title navigation and keeps the branch', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const fields = new URLSearchParams(options.body || '');
    if (options.method !== 'POST') return response(url, fixture('rmc-home.html'), 200, { 'set-cookie': 'session=public; Path=/rmclibrary/; Secure' });
    assert.equal(options.headers.Cookie, 'session=public');
    if (fields.get('__EVENTTARGET') === 'ctl00$body$ctl01') return response(url, fixture('rmc-books.html'));
    assert.equal(fields.get('ctl00$body$ddlLibrary'), '1');
    return response(url, fixture(fields.has('ctl00$body$rpt_SearchTypeMaster$ctl01$SearchValue') ? 'rmc-positive.html' : 'rmc-titleform.html'));
  };
  const result = await resolveCatalogRecord(library('rmc', '1'), replayId('Wings of Fire', '6008'));
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(calls.length, 4);
  assert.equal(new URLSearchParams(calls.at(-1).options.body).get('ctl00$body$rpt_SearchTypeMaster$ctl01$SearchValue'), 'Wings of Fire');
});

test('Sindhi archive physical ownership is checked independently of global search and Available Offline', () => {
  const result = parseSindhiRecord(fixture('sindhi-record.html'), library('sindhi', 'indian-institute-of-sindhology'), '5938');
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(result.observation.availableCopies, undefined);
  assert.throws(() => parseSindhiRecord(fixture('sindhi-record.html'), library('sindhi', 'sindhu-youth-circle'), '5938'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  assert.throws(() => parseSindhiRecord(fixture('sindhi-record.html'), library('sindhi', 'indian-institute-of-sindhology'), '1234'));
});

test('PMB parses a scoped search but requires individual branch-owned copies for availability', () => {
  const selected = library('pmb', '12');
  assert.equal(parsePmbSearch(fixture('pmb-search.html'), selected).length, 10);
  const book = parsePmbRecord(fixture('pmb-record.html'), selected, '94918');
  assert.equal(book.isbn, '9782091805009');
  assert.equal(book.observation.outcome, 'none_available');
  assert.equal(book.observation.totalCopies, 1);
  assert.equal(book.observation.availableCopies, 0);
  const otherCopy = fixture('pmb-record.html').replace('>AF Bangalore</td>', '>AF Delhi</td>');
  assert.throws(() => parsePmbRecord(otherCopy, selected, '94918'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  assert.throws(() => parsePmbSearch(fixture('pmb-search.html'), library('pmb', '5')), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('all sixteen PMB view labels are recognized, including Chennai/Madras and A.F. abbreviations', () => {
  const scopes = data('pmb-scopes.json');
  assert.equal(scopes.length, 16);
  for (const source of scopes) {
    const result = parsePmbSearch(source.html, library('pmb', source.scope));
    assert.equal(result.length > 0, source.expectedPositive, source.scope);
  }
});

test('PMB restricted, unknown or partial copy lists do not imply borrowable or exact unavailable totals', () => {
  const selected = library('pmb', '12'), source = fixture('pmb-record.html');
  const available = source.replace("Libre accès<br><strong>Sorti jusqu'au 07/03/2020</strong>", 'Disponible');
  assert.equal(parsePmbRecord(available, selected, '94918').observation.outcome, 'available');
  const restricted = available.replace(/>Disponible\s*<\/td>/, '>Consultation sur place - Disponible</td>');
  assert.equal(parsePmbRecord(restricted, selected, '94918').observation.outcome, 'in_catalog');
  const partial = source.replace('Exemplaires (1)', 'Exemplaires (3)');
  const obs = parsePmbRecord(partial, selected, '94918').observation;
  assert.equal(obs.outcome, 'in_catalog'); assert.equal(obs.totalCopies, undefined); assert.equal(obs.availableCopies, undefined);
  const copy = source.match(/<tr class="item_expl expl_out">[\s\S]*?<\/tr>/)[0];
  const duplicate = source.replace(copy, copy + copy).replace('Exemplaires (1)', 'Exemplaires (2)');
  const duplicated = parsePmbRecord(duplicate, selected, '94918').observation;
  assert.equal(duplicated.outcome, 'in_catalog'); assert.equal(duplicated.totalCopies, undefined);
});

function pmbResultPage(ids, total = ids.length) {
  return `<div id="adresse"><span>AF Bangalore<br></span></div><span id="searchResult-nbResults"><b>${total}</b></span>`
    + ids.map(id => `<div id="record_container_${id}"><span class="tit1_notCourte">Camus</span></div>`).join('');
}

test('PMB exact ISBN keeps a later available record and never adds potentially repeated copy counts', async () => {
  const selected = library('pmb', '12'), calls = [];
  global.fetch = async (url, options) => {
    const id = new URL(url).searchParams.get('id');
    if (id) {
      calls.push(id);
      let html = fixture('pmb-record.html').replaceAll('94918', id);
      if (id === '94919') html = html.replace("Libre accès<br><strong>Sorti jusqu'au 07/03/2020</strong>", 'Disponible');
      return response(url, html);
    }
    return response(url, options.method === 'POST' ? pmbResultPage(['94918', '94919']) : fixture('pmb-home.html'));
  };
  const value = await checkAvailability(selected, '9782091805009', 'Camus', '');
  assert.deepEqual(calls, ['94918', '94919']);
  assert.equal(value.outcome, 'available'); assert.equal(value.matchKind, 'exact_isbn');
  assert.equal(value.totalCopies, undefined); assert.equal(value.availableCopies, undefined);
  assert.equal(new URL(value.catalogUrl).searchParams.get('id'), '94919');
});

test('PMB incomplete or failed sibling records cannot become exact ISBN unavailability', async () => {
  const selected = library('pmb', '12');
  let ids = ['94918', '94919'], failId = '94919', availableId = null, calls = [];
  global.fetch = async (url, options) => {
    const id = new URL(url).searchParams.get('id');
    if (id) {
      calls.push(id);
      if (id === failId) return response(url, 'temporarily unavailable', 503);
      let html = fixture('pmb-record.html').replaceAll('94918', id);
      if (id === availableId) html = html.replace("Libre accès<br><strong>Sorti jusqu'au 07/03/2020</strong>", 'Disponible');
      return response(url, html);
    }
    return response(url, options.method === 'POST' ? pmbResultPage(ids) : fixture('pmb-home.html'));
  };
  let value = await checkAvailability(selected, '9782091805009', 'Camus', '');
  assert.equal(value.outcome, 'in_catalog'); assert.equal(value.totalCopies, undefined); assert.equal(value.availableCopies, undefined);
  ids.push('94920'); availableId = '94920'; calls = [];
  value = await checkAvailability(selected, '9782091805009', 'Camus', '');
  assert.deepEqual(calls, ids); assert.equal(value.outcome, 'available'); assert.equal(value.totalCopies, undefined);
  ids.push('94921'); failId = null; availableId = null; calls = [];
  value = await checkAvailability(selected, '9782091805009', 'Camus', '');
  assert.equal(calls.length, 3); assert.equal(value.outcome, 'in_catalog'); assert.equal(value.totalCopies, undefined);
  ids = ['94918']; calls = [];
  value = await checkAvailability(selected, '9782091805009', 'Camus', '');
  assert.equal(value.outcome, 'none_available'); assert.equal(value.totalCopies, 1); assert.equal(value.availableCopies, 0);
});

test('PMB public form posts its own token and uses a fresh stable branch record URL', async () => {
  const selected = library('pmb', '12'), calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).searchParams.get('lvl') === 'notice_display') return response(url, fixture('pmb-record.html'));
    if (options.method === 'POST') {
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('user_query'), 'Camus'); assert.equal(fields.get('look_ALL'), '1');
      assert.equal(fields.get('csrf_token'), 'fixture_token'); assert.equal(fields.has('password'), false);
      return response(url, fixture('pmb-search.html'));
    }
    return response(url, fixture('pmb-home.html'), 200, { 'set-cookie': 'PHPSESSID=public; Path=/; Secure' });
  };
  const records = await searchCatalog(selected, 'Camus');
  clearHttpCache();
  const resolved = await resolveCatalogRecord(selected, records[0].recordId);
  assert.equal(resolved.isbn, '9782091805009');
  assert.equal(new URL(calls.at(-1).url).searchParams.get('opac_view'), '12');
});

test('ISBN title fallback remains a possible match and never reports a scanned edition available', async () => {
  global.fetch = async url => response(url, data('surat.json'));
  const result = await checkAvailability(library('surat', '1'), '9788173711466', 'WINGS OF FIRE', '');
  assert.equal(result.outcome, 'in_catalog'); assert.equal(result.matchKind, 'possible_match');
  assert.equal(result.availableCopies, undefined);
  await assert.rejects(checkAvailability(library('surat', '1'), '9788173711466', 'ISBN 9788173711466', ''), { code: 'CATALOG_UNSUPPORTED' });
});

test('title fallback tolerates a subtitle and reversed author while rejecting a different author', async () => {
  global.fetch = async (url, options) => options.method === 'POST' ? response(url, data('nmmc.json'))
    : response(url, '<input type="hidden" name="csrfmiddlewaretoken" value="public-token">');
  const selected = library('nmmc');
  const result = await checkAvailability(selected, '9788173711466', 'Wings of Fire', 'A. P. J. Abdul Kalam');
  assert.equal(result.matchKind, 'possible_match'); assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.recognizedExact, false);
  await assert.rejects(checkAvailability(selected, '9788173711466', 'Wings of Fire', 'Tui Sutherland'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('record-owned matching ISBN is exact; a title zero is always inconclusive for ISBN', async () => {
  const selected = library('santhom');
  global.fetch = async url => response(url, data('santhom.json'));
  const result = await checkAvailability(selected, '9788120804265', 'Encyclopedia of Indian Philosophy-vol.2', '');
  assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.outcome, 'available');
  global.fetch = async url => response(url, { success: true, total: 0, items: [] });
  await assert.rejects(checkAvailability(selected, '9788173711466', 'Wings of Fire', ''), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('opaque replay identifiers are bounded and canonical, and never carry a URL or a session token', () => {
  const query = boundedQuery('ગુજરાતી '.repeat(50)), id = replayId(query, '123');
  assert.ok(id.length <= 180); assert.equal(parseReplayId(id).query, query);
  assert.throws(() => parseReplayId(`r1_${Buffer.from('[ "Wings", "123" ]').toString('base64url')}`));
  assert.throws(() => replayId('Wings', 'https://other.example'));
  assert.throws(() => parseReplayId('https://other.example'));
});

test('anonymous session rejects cross-origin redirects without forwarding cookies or reading the destination', async () => {
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return response(url, '', 302,
    { location: 'https://other.example.test/', 'set-cookie': 'public=abc; Path=/' }); };
  await assert.rejects(new CommunitySession(origins.nmmc).read('/'), /origin changed/);
  assert.equal(calls.length, 1);
});

test('anonymous cookies remain path scoped and are never shared between independent operations', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(options.headers.Cookie);
    return response(url, 'ok', 200, { 'set-cookie': 'public=value; Path=/L01/; Secure' });
  };
  const a = new CommunitySession(origins.nmmc);
  await a.read('/L01/index'); await a.read('/L01/search'); await a.read('/unrelated');
  await new CommunitySession(origins.nmmc).read('/L01/index');
  assert.deepEqual(calls, [undefined, 'public=value', undefined, undefined]);
});

test('a parent-domain cookie stays in the same-origin jar and unrelated domains are rejected', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(options.headers.Cookie);
    return response(url, 'ok', 200, { 'set-cookie': 'public=value; Domain=.nmmclibrary.in; Path=/; Secure' });
  };
  const session = new CommunitySession(origins.nmmc);
  await session.read('/'); await session.read('/L01/index');
  await assert.rejects(session.read('https://other.nmmclibrary.in/'), /origin changed/);
  assert.deepEqual(calls, [undefined, 'public=value']);
});

test('refusals and unknown scope configurations fail without retries or invented absence', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, '<h1>Access denied</h1>', 403); };
  await assert.rejects(searchCatalog(library('santhom'), 'India'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(calls, 1);
  await assert.rejects(searchCatalog(library('rmc', '99'), 'India'));
  await assert.rejects(searchCatalog({ ...library('surat', '1'), baseUrl: 'https://other.example.test' }, 'India'));
  assert.equal(calls, 1);
});
