import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countedOutcome, createOutcomeCounts, outcomeRow } from './outcomeCounts.js';

test('a count is a library, an operation, an outcome and a reason: nothing about a book, a search or a reader', () => {
  assert.deepEqual(outcomeRow({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '' }),
    { libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '' });
  // A reason only with "couldn't check"; an unknown one is `unavailable`.
  assert.equal(outcomeRow({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: 'timeout' }).reason, '');
  assert.equal(outcomeRow({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'couldnt_check', reason: 'surprise' }).reason, 'unavailable');
  for (const extra of [{ bookKey: 'v1:openlibrary:OL1W' }, { isbn13: '9788173711466' }, { queryText: 'matilda' }, { title: 'Matilda' },
    { address: '203.0.113.5' }, { accountId: 'a' }, { at: Date.now() }]) {
    assert.throws(() => outcomeRow({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '', ...extra }), /not permitted/, Object.keys(extra)[0]);
  }
  for (const bad of [{ libraryId: 'not an id' }, { operation: 'search' }, { outcome: 'unknown' }]) {
    assert.throws(() => outcomeRow({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '', ...bad }), TypeError, JSON.stringify(bad));
  }
});

test('the app\'s answers count as found, not found or couldn\'t check with its reason', () => {
  assert.deepEqual(countedOutcome('found'), { outcome: 'found', reason: '' });
  assert.deepEqual(countedOutcome('not_found', 'timeout'), { outcome: 'not_found', reason: '' });
  assert.deepEqual(countedOutcome('unconfirmed'), { outcome: 'couldnt_check', reason: 'unconfirmed' });
  for (const reason of ['timeout', 'blocked', 'busy', 'details']) assert.deepEqual(countedOutcome('unknown', reason), { outcome: 'couldnt_check', reason });
  assert.deepEqual(countedOutcome('unknown'), { outcome: 'couldnt_check', reason: 'unavailable' });
});

test('the database gets one upsert of a count per check, after the response, and nothing when the log is off', async () => {
  const queries = [];
  const pending = [];
  const db = { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; } };
  const later = task => pending.push(task);
  const flush = () => Promise.all(pending.splice(0).map(task => task()));
  const counts = createOutcomeCounts({ enabled: true, db, defer: later });
  counts.record({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'couldnt_check', reason: 'timeout' });
  assert.equal(queries.length, 0, 'written after the response');
  await flush();
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /^INSERT INTO library_outcome_days AS d \(day, library_id, operation, outcome, reason, checks\)/);
  assert.match(queries[0].sql, /ON CONFLICT \(day, library_id, operation, outcome, reason\) DO UPDATE SET checks = d\.checks \+ 1/);
  assert.deepEqual(queries[0].values, ['bc:sfpl', 'book_check', 'couldnt_check', 'timeout']);
  // A store failure is dropped, never retried, never seen by the reader.
  const failing = createOutcomeCounts({ enabled: true, db: { query: async () => { throw new Error('down'); } }, defer: later });
  failing.record({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '' });
  await flush();
  const off = createOutcomeCounts({ enabled: false, db });
  off.record({ libraryId: 'bc:sfpl', operation: 'book_check', outcome: 'found', reason: '' });
  assert.equal(queries.length, 1);
});

test('the table has no column for a book, text, a reader or a time finer than the day', () => {
  const sql = readFileSync(new URL('./migrations/005-library-outcome-days.sql', import.meta.url), 'utf8');
  const body = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(');', sql.indexOf('CREATE TABLE')));
  const columns = body.split('\n').slice(1).map(line => line.trim().split(/\s+/)[0]).filter(name => /^[a-z_]+$/.test(name) && !['PRIMARY', 'CHECK'].includes(name));
  assert.deepEqual(columns, ['day', 'library_id', 'operation', 'outcome', 'reason', 'checks']);
  // `day` is a date: no time of day.
  assert.match(body, /\n\s*day\s+date NOT NULL,/);
  assert.ok(!/timestamp/i.test(body));
});
