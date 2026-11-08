import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { runOriginJobs } from "./origin-jobs.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("independent origins progress together while source-order jobs on one origin remain serial and unique", async () => {
  const release = { a: deferred(), b: deferred() },
    starts = [],
    ends = [],
    busy = new Set();
  let maxActive = 0;
  const jobs = [
    { id: "a1", origin: "a" },
    { id: "a2", origin: "a" },
    { id: "b1", origin: "b" },
  ];
  const pending = runOriginJobs(jobs, {
    concurrency: 2,
    originFor: (j) => j.origin,
    run: async (j) => {
      assert.equal(busy.has(j.origin), false);
      busy.add(j.origin);
      maxActive = Math.max(maxActive, busy.size);
      starts.push(j.id);
      if (j.id.endsWith("1")) await release[j.origin].promise;
      ends.push(j.id);
      busy.delete(j.origin);
    },
  });
  await setImmediate();
  assert.deepEqual(starts, ["a1", "b1"]);
  release.a.resolve();
  await setImmediate();
  assert.ok(starts.includes("a2"));
  assert.ok(ends.indexOf("a1") < ends.indexOf("a2"));
  release.b.resolve();
  await pending;
  assert.equal(maxActive, 2);
  assert.equal(new Set(ends).size, 3);
});
test("a job error stops new scheduling and still awaits already active work before returning", async () => {
  const fail = deferred(),
    finish = deferred(),
    starts = [];
  let activeFinished = false;
  const pending = runOriginJobs(
    [
      { id: 1, origin: "a" },
      { id: 2, origin: "b" },
      { id: 3, origin: "c" },
    ],
    {
      concurrency: 2,
      originFor: (j) => j.origin,
      run: async (j) => {
        starts.push(j.id);
        if (j.id === 1) {
          await fail.promise;
          throw Error("saved job error");
        }
        await finish.promise;
        activeFinished = true;
      },
    },
  );
  await setImmediate();
  fail.resolve();
  await setImmediate();
  assert.deepEqual(starts, [1, 2]);
  finish.resolve();
  await assert.rejects(pending, /saved job error/);
  assert.equal(activeFinished, true);
});
test("cancelled queues start no work and invalid concurrency is refused", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await runOriginJobs([1, 2], {
    concurrency: 3,
    signal: controller.signal,
    originFor: () => 1,
    run: async () => calls++,
  });
  assert.equal(calls, 0);
  await assert.rejects(
    runOriginJobs([], { concurrency: 9 }),
    /Invalid job concurrency/,
  );
});
