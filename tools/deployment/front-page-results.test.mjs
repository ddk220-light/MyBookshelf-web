import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeResults, parseLogLines } from './front-page-results.mjs';
import hostList from '../../server/data/front-page-hosts.json' with { type: 'json' };

const script = fileURLToPath(new URL('./front-page-results.mjs', import.meta.url));
const [first, second, third] = hostList.hosts.map(item => item.host);
const line = result => `front-page-check ${JSON.stringify(result)}`;
const on = (host, values) => ({ host, date: '2026-11-24', status: 200, wall: 'none', ...values });

test('log lines: the prefix and the result, with or without text before it, raw or escaped in a JSON export', () => {
  const text = [
    line(on(first)),
    `2026-11-24T21:17:05.120Z  error  ${line(on(second, { status: 403, wall: '403' }))}`,
    JSON.stringify({ level: 'error', message: line(on(third, { status: 301, movedTo: 'catalog.elsewhere.org' })) }),
    'GET /api/internal/catalog-maintenance 200',
    'front-page-check {"host":"a.example.org","date":"2026-11-24","status":200,"wall":"blocked"}',
    'front-page-check {"host": broken',
  ].join('\r\n');
  const { results, rejected } = parseLogLines(text);
  assert.deepEqual(results, [on(first), on(second, { status: 403, wall: '403' }), on(third, { status: 301, movedTo: 'catalog.elsewhere.org' })]);
  assert.equal(rejected, 2);
  assert.deepEqual(parseLogLines(''), { results: [], rejected: 0 });
});

test('merge: a host keeps the result it has; the earliest of a host seen twice; unknown hosts skipped; sorted by host', () => {
  const file = { about: 'x', updatedOn: '2026-11-23', results: [on(second, { date: '2026-11-20', status: 200 })] };
  const merged = mergeResults(file, [
    on(third, { date: '2026-11-25', status: 500 }), on(third, { date: '2026-11-24', status: 200 }),
    on(second, { status: 429, wall: '429' }), on(first), on('not-listed.example.org')], { hosts: [first, second, third, 'z.example.org'], today: '2026-11-26' });
  assert.deepEqual(merged.added, [first, third].sort());
  assert.equal(merged.kept, 1);
  assert.deepEqual(merged.unknown, ['not-listed.example.org']);
  assert.deepEqual(merged.missing, ['z.example.org']);
  assert.equal(merged.file.updatedOn, '2026-11-26');
  assert.equal(merged.file.about, 'x');
  const byHost = new Map(merged.file.results.map(result => [result.host, result]));
  assert.deepEqual(byHost.get(second), on(second, { date: '2026-11-20', status: 200 }), 'kept as it was');
  assert.deepEqual(byHost.get(third), on(third, { date: '2026-11-24', status: 200 }), 'the earliest');
  assert.deepEqual(merged.file.results.map(result => result.host), [...merged.file.results.map(result => result.host)].sort());
  // Nothing new: the file is unchanged, date included.
  const again = mergeResults(merged.file, [on(first, { status: 503 })], { hosts: [first, second, third], today: '2026-11-30' });
  assert.deepEqual([again.added, again.kept, again.file], [[], 1, merged.file]);
});

test('the script reads a saved file or stdin, writes the results file, and --dry-run writes nothing', t => {
  const directory = mkdtempSync(join(tmpdir(), 'mybookshelf-front-page-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const results = join(directory, 'results.json');
  const empty = { about: 'test', updatedOn: '2026-01-01', results: [] };
  writeFileSync(results, `${JSON.stringify(empty, null, 1)}\n`);
  const saved = join(directory, 'lines.txt');
  writeFileSync(saved, `${line(on(second))}\n${line(on(first, { status: null, wall: 'unreachable' }))}\n`);
  const run = (args, input) => spawnSync(process.execPath, [script, ...args, '--results', results], { input, encoding: 'utf8' });

  const dry = run(['--dry-run', saved]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^Would add 2 results/);
  assert.deepEqual(JSON.parse(readFileSync(results, 'utf8')), empty);

  const wrote = run([saved]);
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.match(wrote.stdout, /^Added 2 results/);
  assert.match(wrote.stdout, new RegExp(`${hostList.hosts.length - 2} of ${hostList.hosts.length} hosts still have no result`));
  const file = JSON.parse(readFileSync(results, 'utf8'));
  assert.deepEqual(file.results.map(result => result.host), [first, second].sort());
  assert.match(file.updatedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(file.updatedOn, '2026-01-01');

  const piped = run([], `${line(on(first, { status: 200 }))}\n${line(on(third))}\n`);
  assert.equal(piped.status, 0, piped.stderr);
  assert.match(piped.stdout, /^Added 1 result: /);
  assert.match(piped.stdout, /1 line for hosts that already had a result/);
  const after = JSON.parse(readFileSync(results, 'utf8'));
  assert.deepEqual(after.results.find(result => result.host === first), on(first, { status: null, wall: 'unreachable' }), 'record once');
});
