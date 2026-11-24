import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, exactKey, looseKey, proposeChanges } from './front-page-proposals.mjs';

// Synthetic data only: the tool reads files, never a host.
const entry = (platform, slug, name, extra = {}) => ({ slug, name, platform, country: 'US', region: 'New York', city: 'X', baseUrl: 'https://search.owwl.org/',
  evidence: { identity: { fscsKey: 'NY0001' }, catalog: { host: 'search.owwl.org' } }, ...extra });
const catalogs = { version: 1, libraries: [
  entry('aspen', 'owwl-batavia', 'Richmond Memorial Library', { sharedCatalog: 'OWWL Library System' }),
  entry('aspen', 'owwl-geneseo', 'Wadsworth Library', { sharedCatalog: 'OWWL Library System' }),
  entry('aspen', 'owwl-avon', 'Avon Free Library', { sharedCatalog: 'OWWL Library System' }),
  entry('aspen', 'owwl-gone', 'Nowhere Library', { sharedCatalog: 'OWWL Library System' }),
  entry('polaris', 'dekalb-county-ga', 'DeKalb County Public Library', { region: 'Georgia', baseUrl: 'https://dekalb.polarislibrary.com/' }),
  entry('aspen', 'anne-arundel-md', 'Anne Arundel County Public Library', { region: 'Maryland', baseUrl: 'https://catalog.aacpl.net/' }),
  entry('tlc', 'grand-island', 'Grand Island Public Library', { region: 'Nebraska', baseUrl: 'https://gilibrary.tlcdelivers.com/' }),
] };
const ids = ['aspen:owwl-batavia', 'aspen:owwl-geneseo', 'aspen:owwl-avon', 'aspen:owwl-gone', 'polaris:dekalb-county-ga', 'aspen:anne-arundel-md', 'tlc:grand-island'];
const listed = { version: 1, count: 1, counts: { legacy: 0, connected: 1, verified: 0, removed: 0, waiting: ids.length }, platforms: { bc: 1 },
  libraryIds: ['bc:x'], connected: ['bc:x'], verified: [], removed: [], waiting: ids.map(id => ({ id, waitsOn: 'identity', reason: 'r', date: '2026-11-24' })) };
const hosts = { hosts: [],
  memberLists: [{ id: 'owwl', catalog: 'OWWL', family: 'aspen', url: 'https://search.owwl.org/Search/Advanced', state: 'NY', source: 's', sharedCatalog: 'OWWL Library System' }],
  catalogLinks: [
    { libraryId: 'polaris:dekalb-county-ga', url: 'https://dekalblibrary.org/', catalogHost: 'dekalb.polarislibrary.com', source: 's' },
    { libraryId: 'aspen:anne-arundel-md', url: 'https://aacpl.net/', catalogHost: 'catalog.aacpl.net', source: 's' },
    { libraryId: 'tlc:grand-island', url: 'https://www.gilibrary.org/', catalogHost: 'gilibrary.tlcdelivers.com', source: 's' }] };
const read = values => ({ date: '2026-11-25', status: 200, wall: 'none', ...values });
const results = { results: [],
  memberLists: [read({ id: 'owwl', host: 'search.owwl.org', title: 'OWWL', marks: ['aspen'], selects: [{ name: 'sort', label: '' }, { name: 'filter[]', label: 'Owning Library' }],
    options: [[0, 'title', 'Title'], [1, '', 'All libraries'], [1, 'RML', 'Richmond Memorial Library'], [1, 'WAD', 'WADSWORTH LIBRARY'], [1, 'AVN', 'Avon'], [1, 'LIM', 'Lima Public Library']] })],
  catalogLinks: [
    read({ libraryId: 'polaris:dekalb-county-ga', host: 'dekalblibrary.org', title: 'DeKalb County Public Library', links: [['https://dekalb.polarislibrary.com/polaris/', 'polaris']] }),
    read({ libraryId: 'aspen:anne-arundel-md', host: 'aacpl.net', title: 'AACPL', links: [['https://catalog.aacpl.net/', 'catalog-host']] }),
    read({ libraryId: 'tlc:grand-island', host: 'www.gilibrary.org', status: 403, wall: '403', title: '', links: [] })] };
const imls = new Map([['NY0999', { STABR: 'NY', FSCSKEY: 'NY0999', LIBNAME: 'LIMA PUBLIC LIBRARY', CITY: 'LIMA' }]]);

test('names: exact means the same letters and digits; loose sets the common words aside and is only ever proposed', () => {
  assert.equal(exactKey('Eudora Public Library & Annex'), exactKey('EUDORA PUBLIC LIBRARY AND ANNEX'));
  assert.notEqual(exactKey('Avon Free Library'), exactKey('Avon'));
  assert.equal(looseKey('Avon Free Library'), looseKey('Avon'));
});

test('proposals: clear changes are applied only where the homepage links the entry\'s own catalog host in its family, or the catalog lists the member exactly', () => {
  const { apply, propose } = proposeChanges({ catalogs, listed, hosts, results, imls });
  assert.deepEqual(apply.map(change => [change.kind, change.id]), [
    ['catalog-link-confirms', 'polaris:dekalb-county-ga'],
    ['member-list-confirms', 'aspen:owwl-batavia'],
    ['member-list-confirms', 'aspen:owwl-geneseo']]);
  assert.match(apply[0].note, /dekalblibrary\.org.*links its polaris catalog dekalb\.polarislibrary\.com/);
  assert.match(apply[1].note, /"Richmond Memorial Library" \(code RML\)/);
  const kinds = Object.fromEntries(propose.map(item => [`${item.kind} ${item.id}`, item.note]));
  // The family is not shown by a link to a custom host: proposed only.
  assert.ok(kinds['catalog-link-host-family-unconfirmed aspen:anne-arundel-md']);
  assert.match(kinds['catalog-link-not-read tlc:grand-island'], /a wall \(403\)/);
  assert.match(kinds['member-loose-match aspen:owwl-avon'], /"Avon" \(AVN\): a person decides/);
  assert.match(kinds['member-not-listed aspen:owwl-gone'], /stays waiting/);
  assert.match(kinds['member-new owwl'], /"Lima Public Library" \(LIM\).*NY0999 LIMA PUBLIC LIBRARY, LIMA/);
  assert.match(kinds['member-list-read owwl'], /5 names in "Owning Library"/);
  // Without results there is nothing to propose.
  assert.deepEqual(proposeChanges({ catalogs, listed, hosts, results: { results: [] } }), { apply: [], propose: [] });
});

test('applying: waiting to connected, the counts in step, and the evidence notes why', () => {
  const { apply } = proposeChanges({ catalogs, listed, hosts, results });
  const next = applyChanges({ catalogs, listed }, apply, '2026-11-26');
  assert.deepEqual(next.moved.sort(), ['aspen:owwl-batavia', 'aspen:owwl-geneseo', 'polaris:dekalb-county-ga']);
  assert.equal(next.listed.waiting.length, ids.length - 3);
  assert.deepEqual(next.listed.counts, { ...listed.counts, connected: 4, waiting: ids.length - 3 });
  assert.equal(next.listed.count, 4);
  assert.deepEqual(next.listed.platforms, { aspen: 2, bc: 1, polaris: 1 });
  assert.ok(next.listed.libraryIds.includes('polaris:dekalb-county-ga') && next.listed.connected.includes('aspen:owwl-geneseo'));
  const dekalb = next.catalogs.libraries.find(item => item.slug === 'dekalb-county-ga');
  assert.match(dekalb.evidence.catalog.confirmedBy, /applied 2026-11-26$/);
  assert.equal(catalogs.libraries.find(item => item.slug === 'dekalb-county-ga').evidence.catalog.confirmedBy, undefined, 'the input is not changed');
});

test('the script prints the proposals, and writes only with --write', t => {
  const directory = mkdtempSync(join(tmpdir(), 'mybookshelf-proposals-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = { catalogs, listed, hosts, results };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, `${name}.json`), JSON.stringify(value));
  const script = fileURLToPath(new URL('./front-page-proposals.mjs', import.meta.url));
  const run = extra => spawnSync(process.execPath, [script, ...Object.keys(files).flatMap(name => [`--${name}`, join(directory, `${name}.json`)]), '--on', '2026-11-26', ...extra], { encoding: 'utf8' });
  const dry = run([]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^apply\tcatalog-link-confirms\tpolaris:dekalb-county-ga\t/m);
  assert.match(dry.stdout, /3 clear change\(s\), \d+ proposal\(s\); nothing written/);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'listed.json'), 'utf8')), listed);
  const wrote = run(['--write']);
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.match(wrote.stdout, /Moved 3 entries from waiting to connected/);
  assert.equal(JSON.parse(readFileSync(join(directory, 'listed.json'), 'utf8')).counts.connected, 4);
});
