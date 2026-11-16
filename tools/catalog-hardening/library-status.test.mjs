import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTED, LISTED_STATUSES, RECORDED, REVISIT_DAYS, STATUSES, addDays, buildAllowlist, buildRows, describeAttempt, loadInputs, renderCsv, renderAllowedCsv, renderReadme } from './library-status.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = resolve(ROOT, 'docs/research/india-library-hardening');

test('a failed or stopped check is never read as empty', () => {
  assert.equal(describeAttempt({ status: 'failed', discovery: [{ query: 'science', ok: true, records: 0 }, { query: 'india', ok: true, records: 0 }], books: [] }).revisit, 'empty');
  const errored = describeAttempt({ status: 'failed', discovery: [{ query: 'science', ok: true, records: 0 }, { query: 'india', ok: false, code: 'CATALOG_TIMEOUT' }], books: [] });
  assert.equal(errored.revisit, 'unreachable');
  assert.match(errored.reason, /CATALOG_TIMEOUT/);
  assert.match(describeAttempt({ status: 'not_attempted', reason: 'Shared host refused.' }).reason, /^not tested/);
  assert.equal(describeAttempt(null).reason, 'not tested');
  // Koha runner shape: rows as arrays, errors as objects.
  assert.equal(describeAttempt({ status: 'failed', discovery: [{ query: 'history', records: [], error: { code: 'AbortError' } }], books: [] }).revisit, 'unreachable');
  assert.equal(describeAttempt({ status: 'failed', discovery: [{ query: 'history', records: [] }], books: [] }).revisit, 'empty');
  assert.equal(describeAttempt({ status: 'failed', discovery: [{ query: 'history', ok: true, records: 3 }], books: [{}] }).revisit, 'inconclusive');
  // An answer the adapter did not recognize is inconclusive, not unreachable.
  assert.equal(describeAttempt({ status: 'failed', discovery: [{ query: 'history', ok: false, records: 0, code: 'CATALOG_UNRECOGNIZED' }], books: [] }).revisit, 'inconclusive');
});

test('revisit dates follow the stated rules', () => {
  assert.equal(addDays('2026-11-15', REVISIT_DAYS.unreachable), '2026-11-22');
  assert.equal(addDays('2026-11-15', REVISIT_DAYS.slow), '2026-12-15');
  assert.equal(addDays('2026-11-15', REVISIT_DAYS.empty), '2027-02-13');
  assert.equal(addDays('2026-11-15', REVISIT_DAYS.refusal), '2027-05-14');
  assert.equal(addDays('2026-11-15', REVISIT_DAYS.login), 'never');
});

test('the tracker has one row per Indian directory entry and matches the committed files', async () => {
  const inputs = await loadInputs();
  const rows = buildRows(inputs);
  assert.equal(rows.length, inputs.entries.length);
  assert.equal(new Set(rows.map((row) => row.library_id)).size, rows.length);
  const hidden = new Set(inputs.hidden.libraryIds);
  const listed = new Set(rows.allowlist.libraryIds);
  for (const row of rows) {
    assert.ok(STATUSES.includes(row.status), row.library_id);
    assert.equal(row.in_finder, listed.has(row.library_id) ? 'yes' : 'no', row.library_id);
    assert.equal(row.status === 'empty-catalog', hidden.has(row.library_id), row.library_id);
    // Verified and audit-found libraries are always listed; nothing else is listed unless it was listed before.
    if (LISTED_STATUSES.has(row.status)) assert.equal(row.in_finder, 'yes', row.library_id);
    assert.ok(row.reason, row.library_id);
    if (!row.last_checked) assert.match(row.reason, /not tested|link-only/, row.library_id);
    if (row.evidence_file) assert.ok(existsSync(resolve(EVIDENCE, row.evidence_file)), row.evidence_file);
    assert.match(row.revisit_after, /^(\d{4}-\d{2}-\d{2}|now|never)$/, row.library_id);
  }
  // Generated, never hand-edited.
  assert.deepEqual(JSON.parse(readFileSync(resolve(ROOT, LISTED), 'utf8')), rows.allowlist);
  assert.equal(readFileSync(resolve(ROOT, 'docs/research/india-library-status/status.csv'), 'utf8'), renderCsv(rows));
  const allowed = readFileSync(resolve(ROOT, 'docs/research/india-library-status/allowed-libraries.csv'), 'utf8');
  assert.equal(allowed, renderAllowedCsv(rows));
  assert.equal(allowed.trim().split('\n').length - 1, rows.allowlist.count);
  assert.equal(readFileSync(resolve(ROOT, 'docs/research/india-library-status/README.md'), 'utf8'), renderReadme(rows));
});

test('every recorded cause names an ID or host that its evidence file mentions', () => {
  for (const [host, rule] of Object.entries(RECORDED.hosts)) assert.ok(readFileSync(resolve(EVIDENCE, rule.file), 'utf8').includes(host), host);
  for (const [id, rule] of Object.entries(RECORDED.ids)) {
    const text = readFileSync(resolve(EVIDENCE, rule.file), 'utf8');
    assert.ok(text.includes(id) || text.includes(id.split(':')[1]), id);
    assert.ok(Object.hasOwn(REVISIT_DAYS, rule.revisit), id);
  }
});

test('the allowlist only grows: a listed library stays listed when its evidence lapses', () => {
  const rows = [
    { library_id: 'a', platform: 'koha', status: 'verified' },
    { library_id: 'b', platform: 'egranthalaya', status: 'audit-found' },
    { library_id: 'c', platform: 'koha', status: 'unreachable' },
    { library_id: 'd', platform: 'koha', status: 'blocked' },
  ];
  const first = buildAllowlist(rows, null);
  assert.deepEqual(first.libraryIds, ['a', 'b']);
  assert.deepEqual(first.egranthalayaAuditOnly, ['b']);
  // Later 'a' fails and 'b' becomes strictly verified: both stay, 'a' is retained for review.
  const later = buildAllowlist([{ ...rows[0], status: 'unreachable' }, { ...rows[1], status: 'verified' }, rows[2], rows[3]], first);
  assert.deepEqual(later.libraryIds, ['a', 'b']);
  assert.deepEqual(later.egranthalayaAuditOnly, []);
  assert.deepEqual(later.retainedWithoutCurrentEvidence, ['a']);
  // An ID removed by hand from the previous list is not re-added unless it qualifies again.
  const edited = buildAllowlist([{ ...rows[0], status: 'unreachable' }, rows[1], rows[2], rows[3]], { ...first, libraryIds: ['b'] });
  assert.deepEqual(edited.libraryIds, ['b']);
});
