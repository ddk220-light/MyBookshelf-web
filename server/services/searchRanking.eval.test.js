// Offline ranking evaluation: replays captured Open Library responses for the
// golden searches through the real discovery and public search code (no
// network; the second source returns nothing). Run directly for a table:
//   node server/services/searchRanking.eval.test.js
// Refresh the fixtures with tools/search-ranking/capture.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkDiscovery } from './workDiscovery.js';
import { createPublicBookService } from '../public-v2/metadata.js';
import { evaluateGolden, formatTable, loadGolden, listResponseFiles, summarize, requestKey, trimResponse, packRequests, unpackRequests } from '../test/searchRanking.js';

// Measured on these fixtures (52 searches) with the title-only ranking of
// d62916cee, before popularity, source order and author intent were used.
const BASELINE = { top1: 37, top3: 41 };
// Achieved by the blended ranking; raise these when the ranking improves.
// Not first: "harry poter" (Goblet of Fire, matched strictly through a
// Latvian edition title "Poters", stays above the spelling pass's
// Philosopher's Stone).
const REQUIRED = { top1: 51, top3: 52 };

test('fixture keys ignore the field list; trimming keeps query-related names; packing round-trips', () => {
  assert.equal(requestKey('/search.json?q=dune&fields=key,title&limit=40'), requestKey('/search.json?limit=40&fields=key&q=dune'));
  const names = [...Array.from({ length: 12 }, (_, index) => `Contributor ${index}`), 'R. K. Narayan'];
  const trimmed = trimResponse('/search.json?q=narayan&fields=key,author_name,readinglog_count', { numFound: 1,
    docs: [{ key: '/works/OL1W', author_name: names, readinglog_count: 5, extra: 'dropped' }] }, 'narayan');
  assert.deepEqual(trimmed.docs[0].author_name, [...names.slice(0, 6), 'R. K. Narayan']);
  assert.equal(trimmed.docs[0].extra, undefined);
  const requests = { '/search.json?q=a': { numFound: 1, docs: [{ key: '/works/OL1W', title: 'A', editions: { docs: [{ title: 'B' }] } }] },
    '/search.json?q=b': { numFound: 1, docs: [{ key: '/works/OL1W', title: 'A' }] }, '/works/OL1W/editions.json?limit=100': null };
  assert.deepEqual(unpackRequests(packRequests(requests)), requests);
});

test('every golden search has a captured response set', () => {
  const files = new Set(listResponseFiles());
  assert.deepEqual(loadGolden().filter(entry => !files.has(`${entry.id}.json`)).map(entry => entry.id), []);
});

test('blended ranking meets the golden-query hit rates and never falls below the baseline', async () => {
  const rows = await evaluateGolden({ createWorkDiscovery, createPublicBookService });
  if (!process.env.NODE_TEST_CONTEXT) console.log(formatTable(rows));
  const result = summarize(rows);
  assert.deepEqual(rows.filter(row => row.missing.length).map(row => `${row.id}: ${row.missing[0]}`), []);
  assert.ok(REQUIRED.top1 >= BASELINE.top1 && REQUIRED.top3 >= BASELINE.top3);
  assert.ok(result.top1 >= REQUIRED.top1, `top-1 ${result.top1}/${result.total} is below ${REQUIRED.top1}`);
  assert.ok(result.top3 >= REQUIRED.top3, `top-3 ${result.top3}/${result.total} is below ${REQUIRED.top3}`);
});

test('guard searches keep the clearly better textual match at the top', async () => {
  const rows = await evaluateGolden({ createWorkDiscovery, createPublicBookService },
    loadGolden().filter(entry => entry.category === 'guard'));
  assert.deepEqual(rows.filter(row => row.rank !== 1).map(row => row.id), []);
});
