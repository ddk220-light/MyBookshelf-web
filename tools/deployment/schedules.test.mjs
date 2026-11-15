import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

// Work that runs on a timer when nobody uses the app must not run more often
// than once an hour: every scheduled run can wake the databases (the accounts
// database never slept while two five-minute schedules touched it). No
// exceptions: a faster schedule needs this test, and the reason, changed.
const root = new URL('../../', import.meta.url);
const MINUTES_PER_WEEK = 7 * 24 * 60;

function field(text, min, max) {
  const values = new Set();
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    assert.ok(Number.isInteger(step) && step > 0, `bad step in "${text}"`);
    let from = min, to = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number);
      from = a;
      to = b === undefined ? (stepText === undefined ? a : max) : b;
    }
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from >= min && to <= max && from <= to, `bad range in "${text}"`);
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}

// Shortest gap, in minutes, between two runs of a five-field cron expression
// over a week. Day of month and month are treated as "every day", which can
// only make the gap look shorter, never longer.
export function shortestGap(expression) {
  const parts = expression.trim().split(/\s+/);
  assert.equal(parts.length, 5, `"${expression}" is not a five-field schedule`);
  const minutes = field(parts[0], 0, 59), hours = field(parts[1], 0, 23);
  const weekdays = parts[4] === '*' ? field('*', 0, 6) : new Set([...field(parts[4], 0, 7)].map(day => day % 7));
  const runs = [];
  for (let day = 0; day < 7; day++) {
    if (!weekdays.has(day)) continue;
    for (const hour of [...hours].sort((a, b) => a - b))
      for (const minute of [...minutes].sort((a, b) => a - b)) runs.push(day * 1440 + hour * 60 + minute);
  }
  if (runs.length < 2) return MINUTES_PER_WEEK;
  let gap = runs[0] + MINUTES_PER_WEEK - runs[runs.length - 1];
  for (let i = 1; i < runs.length; i++) gap = Math.min(gap, runs[i] - runs[i - 1]);
  return gap;
}

function schedules() {
  const found = [];
  const vercel = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  for (const cron of vercel.crons ?? []) found.push({ where: `vercel.json ${cron.path}`, expression: cron.schedule });
  const workflows = new URL('.github/workflows/', root);
  for (const name of readdirSync(workflows).filter(file => /\.ya?ml$/.test(file))) {
    const lines = readFileSync(new URL(name, workflows), 'utf8').split('\n');
    lines.forEach((line, index) => {
      const match = /^\s*-?\s*cron:\s*(['"]?)(.+?)\1\s*(?:#.*)?$/.exec(line);
      if (match) found.push({ where: `.github/workflows/${name}:${index + 1}`, expression: match[2] });
    });
  }
  return found;
}

test('the cron reader measures gaps correctly', () => {
  assert.equal(shortestGap('*/5 * * * *'), 5);
  assert.equal(shortestGap('2,7,12 * * * *'), 5);
  assert.equal(shortestGap('43 * * * *'), 60);
  assert.equal(shortestGap('46 */6 * * *'), 360);
  assert.equal(shortestGap('17 21 * * *'), 1440);
  assert.equal(shortestGap('0 9-17 * * 1-5'), 60);
  assert.equal(shortestGap('59 23 * * 0,1'), 1440);
  assert.equal(shortestGap('0,30 3 * * *'), 30);
});

test('no schedule in vercel.json or a GitHub workflow runs more often than hourly', () => {
  const found = schedules();
  assert.ok(found.some(item => item.where.startsWith('vercel.json')), 'vercel.json crons were read');
  assert.ok(found.some(item => item.where.startsWith('.github/')), 'workflow schedules were read');
  for (const { where, expression } of found)
    assert.ok(shortestGap(expression) >= 60, `${where} runs "${expression}", more often than once an hour`);
});

test('the reader would have caught the old five-minute schedules', () => {
  for (const expression of ['*/5 * * * *', '2,7,12,17,22,27,32,37,42,47,52,57 * * * *'])
    assert.ok(shortestGap(expression) < 60);
});
