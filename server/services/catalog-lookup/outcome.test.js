import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFromResponse, answerFromCheck, couldntCheckFor, errorCodeFor, isHealthFailure, reasonForError } from './outcome.js';

const coded = code => Object.assign(new Error(code), { code });

test('the 3.5 projection: proven copies are found, whatever the lending state', () => {
  for (const outcome of ['available', 'none_available', 'in_catalog']) {
    assert.deepEqual(answerFromResponse({ outcome, lookupKind: 'exact_isbn', matchKind: 'exact_isbn' }), { outcome: 'found', evidence: 'exact_isbn' });
    assert.deepEqual(answerFromResponse({ outcome, lookupKind: 'verified_work', matchKind: 'verified_work', matchedBook: { isbn13: '9788173711466' } }),
      { outcome: 'found', evidence: 'work_isbn', matchedIsbn13: '9788173711466' });
    assert.deepEqual(answerFromResponse({ outcome, lookupKind: 'catalog_record', matchKind: 'catalog_record' }, { recordId: '42' }),
      { outcome: 'found', evidence: 'catalog_record', recordId: '42' });
  }
  // A work search's title match is found like an ISBN match; only the
  // evidence differs, and it carries the catalog's matching rows.
  for (const outcome of ['available', 'none_available', 'in_catalog']) {
    assert.deepEqual(answerFromResponse({ outcome, lookupKind: 'title', matchKind: 'verified_work', matchedBook: { title: 'Wings of Fire' },
      matches: [{ title: 'Wings of fire', author: 'Kalam' }] }),
      { outcome: 'found', evidence: 'title_match', matches: [{ title: 'Wings of fire', author: 'Kalam' }] });
  }
  // ... but a possible match is not, nor one with no holding shown.
  assert.deepEqual(answerFromResponse({ outcome: 'in_catalog', lookupKind: 'title', matchKind: 'possible_match' }), { outcome: 'couldnt_check', reason: 'unconfirmed' });
  assert.deepEqual(answerFromResponse({ outcome: 'unknown', lookupKind: 'title', matchKind: 'verified_work' }), { outcome: 'couldnt_check', reason: 'unconfirmed' });
  // A reader's own record identified by title and author (Visakhapatnam) stays a catalog record.
  assert.equal(answerFromResponse({ outcome: 'in_catalog', lookupKind: 'title_author', matchKind: 'verified_work' }, { recordId: 'r1' }).evidence, 'catalog_record');
  // Not for loan is still a holding.
  assert.equal(answerFromResponse({ outcome: 'unknown', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', loanRestriction: 'not_for_loan' }).outcome, 'found');
});

test('not found: an exact recognized ISBN not listed, or a work search whose every search was answered with no match', () => {
  assert.deepEqual(answerFromResponse({ outcome: 'not_found', lookupKind: 'exact_isbn', matchKind: 'none' }), { outcome: 'not_found', evidence: 'isbn_not_listed' });
  // libraryBookSearch.js returns no_match only when every search it made was answered.
  assert.deepEqual(answerFromResponse({ outcome: 'no_match', matchKind: 'none' }), { outcome: 'not_found', evidence: 'work_no_match' });
});

test('title/author matches are unconfirmed, never found', () => {
  for (const outcome of ['available', 'in_catalog', 'none_available']) {
    const answer = answerFromResponse({ outcome, lookupKind: 'title_author', matchKind: 'possible_match', catalogUrl: 'https://c.example/r/1' });
    assert.deepEqual(answer, { outcome: 'couldnt_check', reason: 'unconfirmed', catalogUrl: 'https://c.example/r/1', catalogLinkKind: 'catalog' });
  }
});

test('failures are couldn’t check with a class, never not found', () => {
  const cases = {
    CATALOG_TIMEOUT: 'timeout', CATALOG_REQUEST_BUDGET: 'budget', CATALOG_PROVIDER_BLOCKED: 'blocked',
    CATALOG_UNRECOGNIZED: 'unrecognized', CATALOG_HOLDING_UNCONFIRMED: 'unrecognized', CATALOG_UNSUPPORTED: 'unsupported',
    CATALOG_EXACT_ISBN_REQUIRED: 'unsupported', CATALOG_CONFIGURATION_REQUIRED: 'configuration', CATALOG_UNAVAILABLE: 'unavailable',
    CATALOG_ABORTED: 'cancelled', SOMETHING_ELSE: 'unavailable',
  };
  for (const [code, reason] of Object.entries(cases)) {
    assert.deepEqual(answerFromCheck({ error: coded(code) }), { outcome: 'couldnt_check', reason }, code);
    assert.deepEqual(answerFromResponse({ outcome: 'unknown', matchKind: null, errorCode: code }), { outcome: 'couldnt_check', reason }, code);
  }
  assert.equal(reasonForError(Object.assign(new Error('x'), { name: 'AbortError' })), 'timeout');
  assert.equal(reasonForError(new Error('request deadline exceeded')), 'timeout');
  for (const value of [null, undefined, {}, { outcome: 'surprise' }, { outcome: 'not_found', matchKind: 'none', lookupKind: 'verified_work' }]) {
    assert.equal(answerFromResponse(value).outcome, 'couldnt_check');
  }
  // A recognized edition with no copy shown is not a failure and not an answer.
  assert.deepEqual(answerFromResponse({ outcome: 'unknown', lookupKind: 'exact_isbn', matchKind: 'exact_isbn' }), { outcome: 'couldnt_check', reason: 'unconfirmed' });
});

test('only real failures count against a library’s health', () => {
  for (const reason of ['timeout', 'unavailable', 'blocked', 'unrecognized', 'configuration']) assert.equal(isHealthFailure(reason), true, reason);
  // Our own request cap and our own cross-reader pacing are not the library's failures.
  for (const reason of ['unconfirmed', 'unsupported', 'cancelled', 'busy', 'budget', undefined]) assert.equal(isHealthFailure(reason), false, String(reason));
});

test('the provider error code reaches the failure log only, never a response', () => {
  const robots = couldntCheckFor(coded('CATALOG_ROBOTS_DISALLOWED'));
  assert.deepEqual(robots, { outcome: 'couldnt_check', reason: 'blocked' });
  assert.equal(robots.errorCode, 'CATALOG_ROBOTS_DISALLOWED');
  assert.equal(JSON.stringify(robots).includes('ROBOTS'), false);
  assert.equal(Object.keys({ ...robots }).includes('errorCode'), false);
  const network = Object.assign(new Error('fetch failed'), { code: 'CATALOG_UNAVAILABLE', cause: { code: 'ECONNREFUSED' } });
  assert.equal(errorCodeFor(network), 'CATALOG_UNAVAILABLE:ECONNREFUSED');
  assert.equal(errorCodeFor(Object.assign(new Error('x'), { name: 'AbortError' })), 'AbortError');
  // Anything that is not a plain code is dropped rather than logged.
  assert.equal(errorCodeFor({ code: 'has spaces <b>' }), null);
  assert.equal(couldntCheckFor(new Error('plain')).errorCode, undefined);
});
