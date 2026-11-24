import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlan, imlsRecords, parseCsv, parseHostList, planAdditions, slugFor, suggest, titleCase, DEFAULT_WALL, STATES } from './apollo-hosts.mjs';
import { getAllLibraries } from '../../server/services/directory.js';

// The IMLS PLS FY2024 administrative entity records the tests need (copied
// from the file, columns trimmed); the real file has CRLF line ends.
const IMLS = [
  'STABR,FSCSKEY,LIBID,LIBNAME,ADDRESS,CITY,ZIP,CNTY,LATITUDE,LONGITUD',
  'IA,IA0077,IA0077,CLEAR LAKE PUBLIC LIBRARY,200 N 4TH ST,CLEAR LAKE,50428,CERRO GORDO,43.13825615,-93.38275143',
  'OK,OK0054,OK0054,LAWTON PUBLIC LIBRARY,110 S W 4TH ST,LAWTON,73501,COMANCHE,34.60668949,-98.39360041',
  'MI,MI0192,MI0192,LAWTON PUBLIC LIBRARY,125 SOUTH MAIN STREET,LAWTON,49065,VAN BUREN,42.16696553,-85.84949491',
  'MO,MO0206,MO0206,ROLLING HILLS CONSOLIDATED,1912 N BELT HWY,ST. JOSEPH,64506,BUCHANAN,39.78396221,-94.8032914',
  'TX,TX0127,TX0127,KILLEEN PUBLIC LIBRARY,205 E CHURCH AVE,KILLEEN,76541,BELL,31.12374117,-97.72708882',
  'TX,TX0402,TX0402,BROWNSVILLE PUBLIC LIBRARY,2600 CENTRAL BLVD,BROWNSVILLE,78520,CAMERON,25.94091602,-97.50959009',
  'AL,AL0048,AL0048,HORSESHOE BEND REGIONAL LIBRARY,207 NORTH WEST STREET,DADEVILLE,36853,TALLAPOOSA,32.83290477,-85.76539617',
  'ID,ID0039,ID0039,HORSESHOE BEND DISTRICT,392 HWY 55,HORSESHOE BEND,83629,BOISE,43.90619266,-116.2005731',
  'IA,IA0182,HP,ORANGE CITY PUBLIC LIBRARY,112 ALBANY AVE SE,ORANGE CITY,51041,SIOUX,43.00540169,-96.05676277',
  'KY,KY0003,ANDERSON,ANDERSON COUNTY PUBLIC LIBRARY,114 N. MAIN STREET,LAWRENCEBURG,40342,ANDERSON,38.03833008,-84.89664451',
  'MS,MS8001,MS8001,LAMAR COUNTY LIBRARY SYSTEM,144 SHELBY SPEIGHTS DRIVE,PURVIS,39475,LAMAR,31.14318278,-89.40739437',
  'NH,NH0200,NH8974,GILFORD PUBLIC LIBRARY,31 POTTER HILL ROAD,GILFORD,03249,BELKNAP,43.54897683,-71.40377043',
  'GU,GU0001,GU0001,"GUAM PUBLIC LIBRARY, NIEVES M. FLORES",254 MARTYR ST,HAGATNA,96910,GUAM,13.47,144.75',
  'TX,TX9999,TX9999,NO PLACE LIBRARY,1 MAIN ST,NOWHERE,70000,NONE,,',
].join('\r\n') + '\r\n';
const imls = imlsRecords(IMLS);
const today = '2026-11-24';
const plan = (rows, directory = []) => planAdditions({ rows, imls, directory, frontPageHosts: [], today });
const problems = (rows, directory = []) => {
  try { plan(rows, directory); return []; } catch (error) { return error.problems || [error.message]; }
};

test('the IMLS file is read as CSV: quoted fields, CRLF, every record by its key', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n'), [['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
  assert.equal(imls.get('GU0001').LIBNAME, 'GUAM PUBLIC LIBRARY, NIEVES M. FLORES');
  assert.equal(imls.get('OK0054').CITY, 'LAWTON');
  assert.throws(() => imlsRecords('STABR,FSCSKEY\r\nIA,IA0077\r\n'), /LIBNAME/);
  assert.equal(Object.keys(STATES).length, 51);
});

test('a host list row becomes an entry with its IMLS identity, the host as its catalog, its evidence and its listing', () => {
  const rows = parseHostList(['# a comment', 'host\tfscsKey\tsource\tname', 'killeen.biblionix.com\tTX0127\tBiblionix\'s customer list (e-mail of 10 January 2027)\t'].join('\n'));
  assert.deepEqual(rows, [{ host: 'killeen.biblionix.com', fscsKey: 'TX0127', source: 'Biblionix\'s customer list (e-mail of 10 January 2027)' }]);
  const result = plan(rows);
  assert.deepEqual(result.connected, ['apollo:killeen-tx']);
  assert.deepEqual(result.waiting, []);
  const [entry] = result.entries;
  assert.deepEqual({ ...entry, evidence: undefined }, {
    slug: 'killeen-tx', name: 'Killeen Public Library', country: 'US', region: 'Texas', city: 'Killeen', lat: 31.123741, lon: -97.727089,
    platform: 'apollo', capabilities: ['catalogSearch', 'availability'], catalogUrl: 'https://killeen.biblionix.com/catalog/', baseUrl: 'https://killeen.biblionix.com/',
    catalogScope: 'library', branches: [], publicCatalogValidated: true,
    publicCatalogCapabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true },
    evidence: undefined });
  assert.deepEqual(entry.evidence.identity, { source: 'IMLS Public Libraries Survey FY2024 (administrative entity file)', fscsKey: 'TX0127',
    imlsName: 'KILLEEN PUBLIC LIBRARY', address: '205 E CHURCH AVE, KILLEEN, TX 76541 (BELL County)' });
  assert.equal(entry.evidence.catalog.wall, DEFAULT_WALL);
  // Behind the front-page gate by default: the host goes on the front-page list as unseen.
  assert.deepEqual(result.frontPageHosts, [{ host: 'killeen.biblionix.com', family: 'apollo', why: 'unseen', state: 'TX', system: 'Killeen Public Library' }]);
  // A host an agent saw without a wall may be offered now; a waiting entry's host still gets its front-page result.
  const open = plan([{ host: 'lawton.biblionix.com', fscsKey: 'OK0054', source: 's', gate: 'none', wall: 'none seen (an agent, 24 November 2026)' },
    { host: 'brownsville.biblionix.com', fscsKey: 'TX0402', source: 's', listing: 'waiting', reason: 'Its name fits seven libraries.' }]);
  assert.deepEqual(open.connected, ['apollo:lawton-ok']);
  assert.deepEqual(open.waiting, [{ id: 'apollo:brownsville-tx', waitsOn: 'identity', reason: 'Its name fits seven libraries.', date: today }]);
  assert.deepEqual(open.frontPageHosts.map(item => item.host), ['brownsville.biblionix.com']);
  // Places from IMLS, in title case; names from the row or IMLS, never a place.
  assert.equal(titleCase('ST. JOSEPH'), 'St. Joseph');
  assert.equal(titleCase('O\'FALLON'), 'O\'Fallon');
  assert.equal(plan([{ host: 'rollinghills.biblionix.com', fscsKey: 'MO0206', source: 's', name: 'Rolling Hills Consolidated Library' }]).entries[0].city, 'St. Joseph');
  assert.equal(slugFor('Clear Lake Public Library', 'IA'), 'clear-lake-ia');
  assert.equal(slugFor('Horseshoe Bend Regional Library', 'AL'), 'horseshoe-bend-regional-al');
  assert.equal(slugFor('Pikes Peak Library District', 'CO'), 'pikes-peak-co');
});

test('anything a person must settle stops the run, and nothing is written', () => {
  const ok = { host: 'killeen.biblionix.com', fscsKey: 'TX0127', source: 's' };
  const cases = [
    [{ ...ok, host: 'killeen.example.org' }, /not a library/],
    [{ ...ok, host: 'www.biblionix.com' }, /not a library/],
    [{ ...ok, host: 'lawton-images.biblionix.com' }, /not a library/],
    [{ ...ok, fscsKey: '' }, /IMLS key/],
    [{ ...ok, fscsKey: 'TX0000' }, /IMLS lists no TX0000/],
    [{ ...ok, fscsKey: 'GU0001' }, /outside the 50 states/],
    [{ ...ok, fscsKey: 'TX9999' }, /no position/],
    [{ ...ok, source: '' }, /source/],
    [{ ...ok, listing: 'waiting' }, /reason/],
    [{ ...ok, listing: 'maybe' }, /unknown listing/],
    [{ ...ok, gate: 'none' }, /wall an agent saw/],
    [{ ...ok, gate: 'none', wall: 'not looked for' }, /wall an agent saw/],
    [{ ...ok, slug: 'Bad Slug' }, /invalid slug/],
  ];
  for (const [row, pattern] of cases) assert.match(problems([row]).join('\n'), pattern, JSON.stringify(row));
  assert.match(problems([ok, { ...ok }]).join('\n'), /listed twice/);
  assert.match(problems([ok, { ...ok, host: 'killeen2.biblionix.com' }]).join('\n'), /TX0127 is listed twice/);
  // The directory already has the host, or the key, or the ID.
  const known = [{ id: 'polaris:killeen-tx', country: 'US', baseUrl: 'https://catalog.killeen.example/', evidence: { identity: { fscsKey: 'TX0127' } } }];
  assert.match(problems([ok], known).join('\n'), /TX0127 is already polaris:killeen-tx/);
  assert.match(problems([ok], [{ id: 'apollo:x', country: 'US', baseUrl: 'https://killeen.biblionix.com/' }]).join('\n'), /already in the directory \(apollo:x\)/);
  assert.match(problems([ok], [{ id: 'apollo:killeen-tx', country: 'US', baseUrl: 'https://other.biblionix.com/' }]).join('\n'), /apollo:killeen-tx is taken/);
  assert.throws(() => parseHostList('host\tfscsKey\tsource\tcity\nx\ty\tz\n'), /Unknown column/);
  assert.throws(() => parseHostList('host\tsource\nx\tz\n'), /fscsKey/);
  // The real directory: Clear Lake's host is already there.
  assert.match(problems([{ host: 'cllibrary.biblionix.com', fscsKey: 'IA0077', source: 's' }], getAllLibraries()).join('\n'), /already in the directory \(apollo:clear-lake-ia\)/);
});

test('suggestions list every IMLS library a host\'s name fits, for a person to choose from', () => {
  assert.deepEqual(suggest('killeen.biblionix.com', imls).map(item => item.fscsKey), ['TX0127']);
  assert.deepEqual(suggest('horseshoebend.biblionix.com', imls).map(item => item.fscsKey), ['AL0048', 'ID0039']);
  assert.deepEqual(suggest('lawton.biblionix.com', imls).map(item => item.fscsKey), ['OK0054', 'MI0192']);
  assert.deepEqual(suggest('cllibrary.biblionix.com', imls), []);
});

test('a plan applied keeps the listing\'s lists sorted and its counts in step', () => {
  const listed = { count: 2, counts: { legacy: 1, connected: 1, verified: 0, removed: 0, waiting: 1 }, platforms: { bc: 1, tlc: 1 },
    libraryIds: ['bc:a', 'tlc:b'], connected: ['tlc:b'], waiting: [{ id: 'tlc:c', waitsOn: 'identity', reason: 'r', date: '2026-11-23' }] };
  const result = plan([{ host: 'killeen.biblionix.com', fscsKey: 'TX0127', source: 's' },
    { host: 'brownsville.biblionix.com', fscsKey: 'TX0402', source: 's', listing: 'waiting', reason: 'r' }]);
  const next = applyPlan({ catalogs: { libraries: [{ slug: 'x' }] }, listed, frontPage: { updatedOn: '2026-11-23', hosts: [{ host: 'a.example.org' }] } }, result, today);
  assert.deepEqual(next.listed.libraryIds, ['apollo:killeen-tx', 'bc:a', 'tlc:b']);
  assert.deepEqual(next.listed.connected, ['apollo:killeen-tx', 'tlc:b']);
  assert.deepEqual(next.listed.waiting.map(item => item.id), ['apollo:brownsville-tx', 'tlc:c']);
  assert.deepEqual([next.listed.count, next.listed.counts, next.listed.platforms],
    [3, { legacy: 1, connected: 2, verified: 0, removed: 0, waiting: 2 }, { apollo: 1, bc: 1, tlc: 1 }]);
  assert.deepEqual(next.catalogs.libraries.map(entry => entry.slug), ['x', 'killeen-tx', 'brownsville-tx']);
  assert.deepEqual([next.frontPage.updatedOn, next.frontPage.hosts.map(item => item.host)], [today, ['a.example.org', 'killeen.biblionix.com', 'brownsville.biblionix.com']]);
});

test('the committed Apollo entries are what the tool makes from their rows: IMLS facts, never typed', () => {
  const committed = getAllLibraries().filter(entry => entry.platform === 'apollo');
  // Clear Lake, Lawton, Rolling Hills and Killeen (23 November 2026); Brownsville, Horseshoe Bend (Idaho), Anderson County,
  // Gilford, Lamar County and Orange City, each from its catalog page (24 November 2026).
  assert.equal(committed.length, 10);
  for (const entry of committed) {
    const { catalog } = entry.evidence;
    const row = { host: catalog.host, fscsKey: entry.evidence.identity.fscsKey, source: catalog.source, name: entry.name, robots: catalog.robots, wall: catalog.wall,
      ...(catalog.identifiedBy ? { identifiedBy: catalog.identifiedBy } : {}), ...(/^none seen/.test(catalog.wall) ? { gate: 'none' } : {}) };
    const [made] = plan([row]).entries;
    const { id, ...fields } = entry;
    assert.deepEqual(made, fields, entry.id);
    assert.equal(id, `apollo:${made.slug}`);
  }
});
