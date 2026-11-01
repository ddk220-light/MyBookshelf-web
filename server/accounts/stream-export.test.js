import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { streamAccountExport } from "./stream-export.js";
test("JSON attachment stays complete with a slow consumer and bounded stream backpressure", async () => {
  const response = new PassThrough({ highWaterMark: 16 }),
    value = {
      schemaVersion: 1,
      profile: { name: "Private “reader” 🌱" },
      savedBooks: [
        { bookKey: "v1:catalog:" + "x".repeat(4096), title: 'Quoted "book"' },
        {},
      ],
      recentlyViewed: [],
    };
  const read = (async () => {
    let text = "";
    for await (const chunk of response) {
      text += chunk.toString();
      await delay(1);
    }
    return JSON.parse(text);
  })();
  await streamAccountExport(response, value);
  assert.deepEqual(await read, value);
  assert.equal(response.listenerCount("drain"), 0);
});
test("an interrupted export stops waiting for drain without leaving stream listeners", async () => {
  const response = new PassThrough({ highWaterMark: 1 }),
    writing = streamAccountExport(response, { savedBooks: ["x".repeat(4096)] });
  setImmediate(() => response.destroy());
  await assert.rejects(writing, /connection closed/);
  assert.equal(response.listenerCount("drain"), 0);
});
