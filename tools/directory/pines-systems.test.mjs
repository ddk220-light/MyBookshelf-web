import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPines, nameKey, orgTree, placeCase, planPines, ROOT_ORG_ID, SAME_LIBRARY } from './pines-systems.mjs';
import { imlsRecords } from './apollo-hosts.mjs';
import { getAllLibraries } from '../../server/services/directory.js';

// PINES's org tree (the one approved org_tree call, 24 November 2026, trimmed
// to the fields the tool reads) and the IMLS PLS FY2024 administrative entity
// records of the keys it carries (copied from the file, columns trimmed).
const fixture = name => new URL(`../../server/test/fixtures/evergreen/${name}`, import.meta.url);
const answer = () => JSON.parse(readFileSync(fixture('pines-org-tree.json'), 'utf8'));
const imls = imlsRecords(readFileSync(fixture('imls-pls-fy2024-ae-pines.csv'), 'latin1'));
const plan = (tree = orgTree(answer())) => planPines({ tree, imls });

test('the org tree is read by Evergreen\'s field positions, from the PINES root', () => {
  const tree = orgTree(answer());
  assert.equal(tree.id, ROOT_ORG_ID);
  assert.equal(tree.shortname, 'PINES');
  const athens = tree.children.find(system => system.id === 6);
  assert.deepEqual([athens.name, athens.shortname, athens.type, athens.parent, athens.visible, athens.fscsKey],
    ['Athens Regional Library System', 'ARL', 2, 1, true, 'GA0011']);
  assert.equal(athens.children.find(unit => unit.id === 7).name, 'Athens-Clarke County Library');
  assert.throws(() => orgTree({ status: 200, payload: [{ __c: 'mvr', __p: [] }] }), /cannot read/);
  const notRoot = answer();
  notRoot.payload[0].__p[9] = 'OTHER';
  assert.throws(() => orgTree(notRoot), /root is not PINES/);
});

test('one entry per member system, its IMLS identity checked by name, its own org and short name, its branches', () => {
  const { entries, leftOut } = plan();
  assert.equal(entries.length, 51);
  assert.deepEqual(leftOut, [{ org: 65, name: 'Georgia Public Library Service', reason: 'PINES records no IMLS key for the system or its branches' }]);
  const athens = entries.find(entry => entry.slug === 'athens-regional-ga');
  assert.deepEqual({ ...athens, branches: undefined, evidence: undefined }, {
    slug: 'athens-regional-ga', name: 'Athens Regional Library System', country: 'US', region: 'Georgia', city: 'Athens', lat: 33.94598, lon: -83.403778,
    platform: 'evergreen', capabilities: ['catalogSearch', 'availability'],
    catalogUrl: 'https://gapines.org/eg/opac/home?locg=6', baseUrl: 'https://gapines.org', evergreenOrgId: 6, evergreenSite: 'ARL',
    catalogScope: 'member', sharedCatalog: 'Georgia PINES', crawlDelaySeconds: 1, branches: undefined, publicCatalogValidated: true,
    publicCatalogCapabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true },
    searchAliases: ['PINES'], evidence: undefined });
  assert.equal(athens.branches.length, 11);
  assert.deepEqual(athens.branches[0], { name: 'Aaron Heard Resource Center', evergreenOrgId: 18 });
  assert.equal(athens.evidence.identity.fscsKey, 'GA0011');
  assert.match(athens.evidence.identity.member, /records GA0011 for org 6 \(ARL, "Athens Regional Library System", 11 branches\)/);
  // The IMLS name in PINES's capitals where the words are the same, else IMLS's words, with PINES's name searchable.
  const henry = entries.find(entry => entry.evidence.identity.fscsKey === 'GA0054');
  assert.deepEqual([henry.name, henry.city, henry.searchAliases], ['Henry County Library System', 'McDonough', ['PINES', 'Henry County Library']]);
  // Greater Clarks Hill: one IMLS library, two PINES systems, so the whole of PINES is searched.
  const gchrl = entries.find(entry => entry.evidence.identity.fscsKey === 'GA0066');
  assert.deepEqual([gchrl.name, gchrl.city, gchrl.evergreenOrgId, gchrl.evergreenSite, gchrl.catalogScope, gchrl.branches.length],
    ['Greater Clarks Hill Regional Library', 'Evans', 1, undefined, 'shared', 8]);
  assert.match(gchrl.evidence.identity.member, /two systems, org 444 \(CCO.*and org 365 \(ERLS/);
  // Every visible branch of every member system is one entry's branch, once.
  const ids = entries.flatMap(entry => entry.branches.map(branch => branch.evergreenOrgId));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 286);
});

test('a name that is not the IMLS library\'s, or a key two systems carry without a reason, stops the run', () => {
  const renamed = orgTree(answer());
  renamed.children.find(system => system.id === 6).name = 'Oconee County Library';
  assert.throws(() => plan(renamed), /org 6 \(Oconee County Library\) carries GA0011, ATHENS REGIONAL LIBRARY SYSTEM: not the same name/);
  const twice = orgTree(answer());
  twice.children.find(system => system.id === 25).fscsKey = 'GA0011';
  twice.children.find(system => system.id === 25).name = 'Athens Regional Library';
  assert.throws(() => plan(twice), /GA0011 is carried by orgs 6 and 25 without a reason/);
  assert.equal(nameKey('DE SOTO TRAIL REGIONAL LIBRARY SYSTEM'), nameKey('Desoto Trail Regional Library'));
  assert.notEqual(nameKey('GREATER CLARKS HILL REGIONAL LIBRARY'), nameKey('Eastern Regional Library System'));
  assert.ok(SAME_LIBRARY[365] && SAME_LIBRARY[444]);
  assert.equal(placeCase('MARSHES OF GLYNN LIBRARIES'), 'Marshes of Glynn Libraries');
  assert.equal(placeCase('MCDONOUGH'), 'McDonough');
  assert.equal(placeCase('FORT VALLEY'), 'Fort Valley');
});

test('the committed PINES entries are what the tool makes from the org tree and IMLS: never typed', () => {
  const { entries } = plan();
  const committed = getAllLibraries().filter(entry => entry.platform === 'evergreen' && entry.id !== 'evergreen:gapines');
  assert.equal(committed.length, entries.length);
  for (const entry of committed) {
    const { id, ...fields } = entry;
    const made = entries.find(item => `evergreen:${item.slug}` === id);
    assert.deepEqual(fields, made, id);
  }
});

test('applied, the plan replaces the evergreen entries and lists them as connected, with the counts in step', () => {
  const { entries } = plan();
  const listed = { count: 2, counts: { legacy: 1, connected: 1, verified: 0, removed: 1, waiting: 0 }, platforms: { bc: 1, tlc: 1 },
    libraryIds: ['bc:a', 'tlc:b'], connected: ['tlc:b'], removed: [{ id: 'evergreen:gapines' }] };
  const catalogs = { libraries: [{ slug: 'x', platform: 'tlc' }, { slug: 'old', platform: 'evergreen' }] };
  const next = applyPines({ catalogs, listed }, { entries });
  assert.deepEqual(next.catalogs.libraries.map(entry => entry.slug).slice(0, 2), ['x', 'athens-regional-ga']);
  assert.equal(next.catalogs.libraries.length, 52);
  assert.equal(next.listed.count, 53);
  assert.deepEqual(next.listed.counts, { legacy: 1, connected: 52, verified: 0, removed: 1, waiting: 0 });
  assert.deepEqual(next.listed.platforms, { bc: 1, evergreen: 51, tlc: 1 });
  assert.deepEqual(next.listed.libraryIds, [...next.listed.libraryIds].sort());
  // Run again on its own output, nothing changes.
  assert.deepEqual(applyPines(next, { entries }), next);
});
