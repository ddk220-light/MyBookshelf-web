import test from "node:test";
import assert from "node:assert/strict";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import {
  buildLinkQueue,
  confirmItemIdentity,
  verifyItemLink,
} from "./link-verification.mjs";
const job = {
  jobId: "j",
  libraryId: "koha:x",
  connectionId: "primary",
  recordId: "123",
  nativeId: "123",
  title: "Physics",
  url: "https://catalog.test/cgi-bin/koha/opac-detail.pl?biblionumber=123",
  kind: "record",
  sourceEvents: ["original-event"],
  sourceObservedAt: "2026-11-01T00:00:00Z",
};
const descriptor = { origins: ["https://catalog.test"] };
const response = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html", ...headers },
  });
test("link queue deduplicates repeated observations and retains native identity, dates and source-event provenance", () => {
  const record = {
    recordId: "123",
    sourceId: "123",
    title: "Physics",
    catalogUrl: job.url,
    linkKind: "record",
  };
  const jobs = buildLinkQueue(
    [1, 2].map((i) => ({
      eventId: String(i),
      type: "search_completed",
      libraryId: job.libraryId,
      at: job.sourceObservedAt,
      records: [record],
    })),
  );
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].sourceEvents, ["1", "2"]);
  assert.equal(jobs[0].sourceObservedAt, job.sourceObservedAt);
  assert.equal(jobs[0].nativeId, "123");
});
test("HTTP 200 alone or a redirect to a different item cannot establish link identity", () => {
  assert.equal(
    confirmItemIdentity(job, { url: job.url, text: "<h1>Physics</h1>" })
      .identityConfirmed,
    true,
  );
  assert.equal(
    confirmItemIdentity(job, {
      url: job.url,
      text: "<h1>Library homepage</h1>",
    }).identityConfirmed,
    false,
  );
  assert.equal(
    confirmItemIdentity(job, {
      url: job.url.replace("123", "456"),
      text: "<h1>Physics</h1>",
    }).identityConfirmed,
    false,
  );
});
test("link checks never contact generic handoffs, and PDFs are cancelled before reading content", async () => {
  let called = 0,
    cancelled = false;
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => {
      called++;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/pdf" }),
        body: {
          cancel: async () => {
            cancelled = true;
          },
          [Symbol.asyncIterator]: () => {
            throw Error("must not download PDF");
          },
        },
      };
    },
  });
  const handoff = await verifyItemLink(
    { ...job, kind: "catalog" },
    coordinator,
    descriptor,
  );
  assert.equal(handoff.tested, false);
  assert.equal(called, 0);
  const pdf = await verifyItemLink(job, coordinator, descriptor);
  assert.equal(pdf.outcome, "non_html_content_not_downloaded");
  assert.equal(pdf.identityConfirmed, false);
  assert.equal(cancelled, true);
  assert.equal(called, 1);
});
test("per-item verification preserves real access failures and prevents cross-origin redirect requests", async () => {
  let calls = 0;
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => {
      calls++;
      return response("", 302, { location: "https://other.test/book/123" });
    },
  });
  const redirect = await verifyItemLink(job, coordinator, descriptor);
  assert.equal(redirect.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(calls, 1);
  assert.equal(redirect.identityConfirmed, false);
  const restricted = new Coordinator({
    minGapMs: 0,
    fetchImpl: async (url) => {
      assert.equal(url.pathname, "/robots.txt");
      return response("User-agent: *\nDisallow: /");
    },
  });
  const denied = await verifyItemLink(job, restricted, descriptor);
  assert.equal(denied.code, "ROBOTS_DISALLOWED");
  assert.equal(denied.tested, false);
});
test("a supported public item page confirms only that item's native URL and title", async () => {
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => response("<h1>Physics</h1>"),
  });
  const result = await verifyItemLink(job, coordinator, descriptor);
  assert.equal(result.outcome, "item_identity_confirmed");
  assert.equal(result.tested, true);
  assert.equal(result.nativeId, "123");
});
