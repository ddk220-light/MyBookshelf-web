import test from 'node:test';
import assert from 'node:assert/strict';
import { identitiesFor, askedIdentity, storedAnswer, answerRows, createMemoryAnswerStore, createMemoryHealthRecord, createLookupRecorder,
  flagState, ANSWER_TTL_MS } from './record.js';
import { createRedactedTelemetrySink } from '../../public-v2/telemetry.js';

const DAY = 24 * 60 * 60 * 1000;
const book = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', workId: 'OL123W', title: 'Wings of Fire', authors: ['Kalam'] };

test('identities are record, ISBN-13 and Open Library work only, never titles or authors', () => {
  assert.deepEqual(identitiesFor('lib', book), [{ kind: 'isbn13', value: '9788173711466' }, { kind: 'ol_work', value: 'OL123W' }]);
  assert.deepEqual(identitiesFor('lib', { title: 'Wings of Fire', authors: ['Kalam'] }), []);
  assert.deepEqual(identitiesFor('lib', { recordId: '42', recordLibraryId: 'lib' })[0], { kind: 'catalog_record', value: 'lib:42' });
  assert.deepEqual(identitiesFor('lib', { recordId: '42', recordLibraryId: 'other' }), []);
  assert.deepEqual(identitiesFor('lib', { isbn13: 'not-an-isbn', workId: 'Wings of Fire' }), []);
  for (const value of JSON.stringify(identitiesFor('lib', book))) assert.ok(!/Wings|Kalam/.test(value));
});

test('found from any identity; not found only from the identity that was asked', () => {
  const asked = askedIdentity('lib', book, 'work');
  assert.deepEqual(asked, { kind: 'ol_work', value: 'OL123W' });
  const isbnAbsent = [{ kind: 'isbn13', value: '9788173711466', answer: 'not_found', evidence: 'isbn_not_listed' }];
  // An ISBN that is not listed says nothing about the work.
  assert.equal(storedAnswer(isbnAbsent, asked), null);
  assert.deepEqual(storedAnswer(isbnAbsent, askedIdentity('lib', book, 'exact')), { outcome: 'not_found', evidence: 'isbn_not_listed' });
  assert.equal(storedAnswer([...isbnAbsent, { kind: 'ol_work', value: 'OL123W', answer: 'found', evidence: 'work_isbn' }], asked).outcome, 'found');
});

test('write rules follow plan 4.3 and nothing is written for couldn’t check', () => {
  const now = 1_000;
  const profile = { isbns: ['9788173711466', '9788173711460'] };
  const rows = answerRows({ libraryId: 'lib', book, profile, now, answer: { outcome: 'found', evidence: 'exact_isbn' } });
  assert.deepEqual(rows.map(row => [row.kind, row.value, row.answer]), [['isbn13', '9788173711466', 'found'], ['ol_work', 'OL123W', 'found']]);
  assert.ok(rows.every(row => row.expiresAt === now + ANSWER_TTL_MS && ANSWER_TTL_MS === 180 * DAY));
  assert.deepEqual(answerRows({ libraryId: 'lib', book, now, answer: { outcome: 'found', evidence: 'work_isbn', matchedIsbn13: '9780140328721' } })
    .map(row => [row.kind, row.value]), [['ol_work', 'OL123W'], ['isbn13', '9780140328721']]);
  assert.deepEqual(answerRows({ libraryId: 'lib', book: { recordId: '7' }, answer: { outcome: 'found', evidence: 'catalog_record' } }).map(row => row.value), ['lib:7']);
  assert.deepEqual(answerRows({ libraryId: 'lib', book, answer: { outcome: 'not_found', evidence: 'isbn_not_listed' } }).map(row => [row.kind, row.answer]), [['isbn13', 'not_found']]);
  assert.deepEqual(answerRows({ libraryId: 'lib', book, answer: { outcome: 'not_found', evidence: 'work_no_match' } }).map(row => [row.kind, row.answer]), [['ol_work', 'not_found']]);
  for (const reason of ['unconfirmed', 'timeout', 'budget', 'blocked']) {
    assert.deepEqual(answerRows({ libraryId: 'lib', book, answer: { outcome: 'couldnt_check', reason } }), []);
  }
});

test('not found never replaces an unexpired found, and both expire after 180 days', async () => {
  let clock = 0;
  const store = createMemoryAnswerStore({ now: () => clock });
  const ids = [{ kind: 'isbn13', value: '9788173711466' }];
  await store.writeAnswers(answerRows({ libraryId: 'lib', book, now: clock, answer: { outcome: 'found', evidence: 'exact_isbn' } }));
  await store.writeAnswers(answerRows({ libraryId: 'lib', book, now: clock, answer: { outcome: 'not_found', evidence: 'isbn_not_listed' } }));
  assert.equal((await store.readAnswers('lib', ids))[0].answer, 'found');
  clock = 180 * DAY - 1;
  assert.equal((await store.readAnswers('lib', ids)).length, 1);
  clock = 180 * DAY;
  assert.deepEqual(await store.readAnswers('lib', ids), []);
  await store.writeAnswers(answerRows({ libraryId: 'lib', book, now: clock, answer: { outcome: 'not_found', evidence: 'isbn_not_listed' } }));
  assert.equal((await store.readAnswers('lib', ids))[0].answer, 'not_found');
  await store.writeAnswers(answerRows({ libraryId: 'lib', book, now: clock, answer: { outcome: 'found', evidence: 'exact_isbn' } }));
  assert.equal((await store.readAnswers('lib', ids))[0].answer, 'found');
  assert.deepEqual(await store.readAnswers('other-library', ids), []);
});

test('flag rule: 3 failed attempts, 30 minutes apart, on 2 days within 7 days, no success since', () => {
  const at = Date.UTC(2026, 10, 12, 12);
  const failure = time => ({ at: time, reason: 'timeout' });
  // Three retries in one minute are one attempt.
  assert.equal(flagState([failure(at), failure(at + 20_000), failure(at + 40_000)], { at: at + 60_000 }).flagged, false);
  // Three attempts on one day are not enough.
  assert.equal(flagState([failure(at - 3 * 3600_000), failure(at - 2 * 3600_000), failure(at)], { at }).flagged, false);
  const spread = [failure(at - DAY), failure(at - 2 * 3600_000), failure(at)];
  assert.deepEqual(flagState(spread, { at }), { attempts: 3, days: 2, flagged: true });
  // A success after the first failure resets the count.
  assert.equal(flagState(spread, { at, lastSuccessAt: at - DAY + 1 }).flagged, false);
  // Older than seven days does not count.
  assert.equal(flagState([failure(at - 8 * DAY), failure(at - 2 * 3600_000), failure(at)], { at }).flagged, false);
});

test('the in-memory health record flags, clears on success and ignores non-failures', async () => {
  let clock = Date.UTC(2026, 10, 10, 9);
  const health = createMemoryHealthRecord({ now: () => clock });
  const fail = reason => health.recordOutcome({ libraryId: 'lib', platform: 'koha', host: 'h', ok: false, reason, at: clock });
  await fail('unconfirmed');
  await fail('unsupported');
  assert.equal((await health.libraryHealth('lib'))?.failures7d ?? 0, 0);
  await fail('timeout'); clock += DAY;
  await fail('blocked'); clock += 3600_000;
  assert.equal((await health.libraryHealth('lib')).flagged, false);
  await fail('unavailable');
  const state = await health.libraryHealth('lib');
  assert.equal(state.flagged, true);
  assert.deepEqual(state.failures7dByReason, { timeout: 1, blocked: 1, unavailable: 1 });
  assert.deepEqual(await health.flaggedLibraries(), ['lib']);
  await health.recordOutcome({ libraryId: 'lib', ok: true, at: clock });
  assert.equal((await health.libraryHealth('lib')).flagged, false);
  assert.equal((await health.libraryHealth('lib')).failuresSinceSuccess, 0);
});

test('the recorder fails open, honours storeAnswers: false and emits only allowlisted counters', async () => {
  const pending = [];
  const telemetry = createRedactedTelemetrySink();
  const answers = createMemoryAnswerStore();
  const broken = { readAnswers: async () => { throw new Error('store down'); }, writeAnswers: async () => { throw new Error('store down'); } };
  const health = createMemoryHealthRecord();
  const recorder = createLookupRecorder({ answers, health, telemetry, defer: task => pending.push(task()), policyFor: id => ({ storeAnswers: id !== 'opted-out' }) });
  recorder.record({ entry: { id: 'lib' }, platform: 'koha', book, answer: { outcome: 'found', evidence: 'exact_isbn' }, durationMs: 12 });
  recorder.record({ entry: { id: 'opted-out' }, platform: 'koha', book, answer: { outcome: 'found', evidence: 'exact_isbn' } });
  recorder.record({ entry: { id: 'lib2' }, platform: 'koha', book, answer: { outcome: 'couldnt_check', reason: 'timeout' }, durationMs: 9 });
  await Promise.all(pending);
  // No edition profile was given, so only the ISBN row is written.
  assert.equal(answers.size(), 1);
  assert.deepEqual(await answers.readAnswers('opted-out', [{ kind: 'isbn13', value: book.isbn13 }]), []);
  // Health is still recorded for an opted-out library.
  assert.ok(await health.libraryHealth('opted-out'));
  assert.equal((await health.libraryHealth('lib2')).failuresSinceSuccess, 1);
  const events = telemetry.events();
  assert.deepEqual(events.map(event => Object.keys(event).sort()).sort((a, b) => a.length - b.length), [
    ['durationMs', 'libraryId', 'operation', 'outcome', 'platform'],
    ['durationMs', 'libraryId', 'operation', 'outcome', 'platform'],
    ['durationMs', 'errorCode', 'libraryId', 'operation', 'outcome', 'platform']]);
  assert.ok(!JSON.stringify(events).includes('Wings') && !JSON.stringify(events).includes('9788173711466'));
  const failing = createLookupRecorder({ answers: broken, health: { recordOutcome: async () => { throw new Error('down'); } },
    telemetry: { emit() { throw new Error('down'); } }, defer: task => pending.push(task()) });
  assert.deepEqual(await failing.readAnswers('lib', identitiesFor('lib', book)), []);
  failing.record({ entry: { id: 'lib' }, book, answer: { outcome: 'found', evidence: 'exact_isbn' } });
  await Promise.all(pending);
});
