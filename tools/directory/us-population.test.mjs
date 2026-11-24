import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatPopulation, legacyMatches, populationRows, SOURCE } from './us-population.mjs';
import { imlsRecords } from './apollo-hosts.mjs';
import { getAllLibraries } from '../../server/services/directory.js';
import population from '../../server/data/us-library-population.json' with { type: 'json' };
import usListed from '../../server/data/us-catalogs-listed.json' with { type: 'json' };
import usCities from '../../shared/seo-us-cities.json' with { type: 'json' };
import usCatalogs from '../../server/data/us-catalogs.json' with { type: 'json' };

// Sixteen IMLS PLS FY2024 administrative entity records and five rows of the
// research's legacy matches, copied (server/test/fixtures/imls/README.md).
const fixture = name => new URL(`../../server/test/fixtures/imls/${name}`, import.meta.url);
const imls = imlsRecords(readFileSync(fixture('pls-fy2024-ae-population.csv'), 'latin1'));
const legacy = legacyMatches(readFileSync(fixture('directory-legacy-matches.tsv'), 'utf8'));
const us = getAllLibraries().filter(entry => entry.country === 'US');
const byId = new Map(us.map(entry => [entry.id, entry]));
const usCatalogIds = new Set(usCatalogs.libraries.map(entry => entry.directoryId || `${entry.platform === 'bibliocommons' ? 'bc' : entry.platform}:${entry.slug}`));

test('the committed file has one row per US directory entry, largest first, in the tool\'s own form', () => {
  const rows = population.libraries;
  assert.deepEqual(rows.map(row => row.id).toSorted(), us.map(entry => entry.id).toSorted());
  for (let i = 1; i < rows.length; i += 1) {
    const [a, b] = [rows[i - 1], rows[i]];
    assert.ok((a.population ?? -1) > (b.population ?? -1) || ((a.population ?? -1) === (b.population ?? -1) && a.id < b.id), b.id);
  }
  assert.equal(population.source, SOURCE);
  assert.match(population.source, /FY2024/);
  assert.match(population.source, /POPU_UND/);
  assert.equal(formatPopulation(rows), readFileSync(new URL('../../server/data/us-library-population.json', import.meta.url), 'utf8'));
  for (const row of rows) {
    assert.ok(row.population === null || (Number.isInteger(row.population) && row.population >= 0), row.id);
    if (row.population === null) assert.ok(row.note?.length > 10, row.id);
  }
});

test('each row uses the key the entry records (its own record, as a shared catalog\'s member), else the research\'s match', () => {
  for (const row of population.libraries) {
    const entry = byId.get(row.id);
    const recorded = entry.evidence?.identity?.fscsKey;
    if (recorded) {
      // A member of a shared catalog takes its own record, never its consortium's.
      assert.equal(row.keySource, undefined, row.id);
      assert.equal(row.outlet || row.fscsKey, recorded, row.id);
      if (row.outlet) assert.equal(row.fscsKey, recorded.split('-')[0], row.id);
    } else {
      // Only a legacy entry (server/data/libraries.json, from before the US research) records none.
      assert.equal(row.keySource, 'match', row.id);
      assert.ok(!usCatalogIds.has(row.id), row.id);
    }
  }
  // A legacy entry's matched key agrees with the IMLS record the directory's other evidence cites for it.
  const rows = new Map(population.libraries.map(row => [row.id, row]));
  const cited = [...Object.entries(usListed.places || {}), ...Object.entries(usCities.cities)].filter(([, item]) => item.evidence?.fscsKey);
  assert.ok(cited.length > 50);
  for (const [id, item] of cited) assert.equal(rows.get(id).fscsKey, item.evidence.fscsKey, id);
  // Members of the Monroe County Library System record their own libraries: Rochester serves Rochester.
  assert.deepEqual(rows.get('tlc:mcls-rochester'), { id: 'tlc:mcls-rochester', fscsKey: 'NY0521', population: 208818 });
});

test('the tool: the entry\'s own record, an outlet\'s entity, a matched key or members\' sum, and no population where IMLS gives none', () => {
  const ids = ['tlc:lapl', 'tlc:mcls-rochester', 'aspen:alachua-fl', 'tlc:putnam-fl', 'polaris:share-greenville-public-library-il', 'polaris:fort-worth-tx',
    'bc:chipublib', 'bc:midark', 'bc:pac2', 'bc:mlkacademy', 'bc:nvc'];
  const rows = populationRows({ entries: ids.map(id => byId.get(id)), imls, legacy });
  // The same rows as the committed file, from the copied records.
  const committed = new Map(population.libraries.map(row => [row.id, row]));
  for (const row of rows) assert.deepEqual(row, committed.get(row.id), row.id);
  assert.deepEqual(rows.map(row => [row.id, row.population]), [
    ['tlc:lapl', 3814318], ['bc:chipublib', 2746388], ['aspen:alachua-fl', 407366], ['tlc:putnam-fl', 407366], ['tlc:mcls-rochester', 208818],
    ['bc:midark', 189438], ['bc:pac2', 88527], ['polaris:share-greenville-public-library-il', 7083],
    ['bc:mlkacademy', null], ['bc:nvc', null], ['polaris:fort-worth-tx', null]]);
  const row = id => rows.find(item => item.id === id);
  assert.deepEqual(row('tlc:lapl'), { id: 'tlc:lapl', fscsKey: 'CA0063', population: 3814318 });
  assert.equal(row('aspen:alachua-fl').outlet, 'FL0259-005');
  assert.match(row('aspen:alachua-fl').note, /PAL PUBLIC LIBRARY COOPERATIVE \(FL0259\)/);
  assert.deepEqual(row('bc:chipublib'), { id: 'bc:chipublib', fscsKey: 'IL0098', population: 2746388, keySource: 'match' });
  assert.equal(row('bc:pac2').fscsKeys.length, 9);
  assert.match(row('bc:pac2').note, /9 member libraries/);
  assert.match(row('bc:mlkacademy').note, /school catalog/);
  assert.match(row('polaris:fort-worth-tx').note, /no population for TX0050/);
  // A key the file lacks, or a legacy entry nobody matched, stops the tool.
  assert.throws(() => populationRows({ entries: [byId.get('tlc:lapl')], imls: new Map(), legacy }), /No IMLS record CA0063/);
  assert.throws(() => populationRows({ entries: [byId.get('bc:sfpl')], imls, legacy }), /no legacy match: bc:sfpl/);
  assert.throws(() => legacyMatches('slug\tplatform\n'), /no match_type column/);
});
