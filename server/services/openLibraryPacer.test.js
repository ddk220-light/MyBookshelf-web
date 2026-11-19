import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpenLibraryPacer } from './openLibraryPacer.js';

test('three reads of one search start together and the next search waits for the sliding window', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const pace = createOpenLibraryPacer();
  const starts = [];
  const read = group => pace(() => starts.push(Date.now()), { group });
  const first = {};
  await Promise.all([read(first), read(first), read(first)]);
  const second = read({});
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.deepEqual(starts, [0, 0, 0]);
  t.mock.timers.tick(1);
  await second;
  assert.deepEqual(starts, [0, 0, 0, 1000]);
});

test('a waiting read expires even when all slots are busy, without reserving a turn', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const pace = createOpenLibraryPacer({ maxInFlight: 1 });
  const group = {};
  let release;
  const busy = pace(() => new Promise(resolve => { release = resolve; }), { group });
  await Promise.resolve();
  const expired = assert.rejects(pace(() => assert.fail('expired read ran'), { group: {}, deadlineAt: 50 }),
    { code: 'OPEN_LIBRARY_DEADLINE' });
  t.mock.timers.tick(50);
  await expired;

  const followup = pace(() => Date.now(), { group });
  release();
  await busy;
  assert.equal(await followup, 50);
});
