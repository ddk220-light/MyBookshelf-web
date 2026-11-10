import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { selectBatch, finalReport, auditSummary } from "./final-report.mjs";

function storeFor(t) {
  const root = mkdtempSync(join(tmpdir(), "library-full-test-"));
  const store = new EvidenceStore(root);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(root, { recursive: true, force: true });
  });
  return store;
}
const row = (id, origin, state = null) => ({
  libraryId: id,
  name: id,
  country: "IN",
  connections: [{ family: "koha", origins: [origin] }],
  books: [],
  lastAttemptState: state,
});
test("batches prioritize untested hosts and never repeat assessed targets", () => {
  const rows = [
    row("a1", "https://a.test", "needs_review"),
    row("a2", "https://a.test"),
    row("a3", "https://a.test"),
    row("b1", "https://b.test"),
    row("c1", "https://c.test"),
  ];
  assert.deepEqual(selectBatch({ libraries: rows }, 3), ["b1", "c1", "a2"]);
  assert.equal(
    auditSummary({ total: 5, libraries: rows, booksVerified: 0 }).remaining,
    4,
  );
});
test("final report cannot be generated before all libraries have an outcome", (t) => {
  const store = storeFor(t),
    libraries = [row("a", "https://a.test")];
  store.save("manifest.json", {
    runId: "test",
    target: 20,
    inventory: {
      total: 1,
      libraries,
      inventoryHash: hash(libraries),
      reconciliation: [],
    },
  });
  assert.throws(() => finalReport(store), /outcome for every target/);
});
test("completed pass reports blocked libraries honestly without claiming twenty-book completion", (t) => {
  const store = storeFor(t),
    libraries = [row("a", "https://a.test")];
  store.save("manifest.json", {
    runId: "test",
    target: 20,
    inventory: {
      total: 1,
      libraries,
      inventoryHash: hash(libraries),
      reconciliation: [],
    },
  });
  store.append({
    type: "library_checkpoint",
    mode: "qualify",
    libraryId: "a",
    state: "blocked",
    blocker: { code: "ROBOTS_DISALLOWED", reason: "Provider rules" },
    nextAction: "Wait",
  });
  // Query counts and candidate-row counts have different grains. Repeated
  // books across queries remain returned observations, never distinct books.
  for (const [query, count] of [
    ["History", 2],
    ["Science", 3],
    ["Poetry", 0],
  ])
    store.append({
      type: "search_completed",
      libraryId: "a",
      query,
      records: Array.from({ length: count }, (_, i) => ({
        recordId: String(i),
        title: query + " " + i,
      })),
      evidence: [],
    });
  store.append({
    type: "search_failed",
    libraryId: "a",
    query: "Mathematics",
    code: "SOURCE_ACCESS_BLOCKED",
    evidence: [],
  });
  const result = finalReport(store);
  assert.equal(result.remaining, 0);
  assert.equal(result.allLibrariesHaveOutcome, true);
  assert.equal(result.allLibrariesHaveTwentyBooks, false);
  assert.equal(result.blockerCauses.ROBOTS_DISALLOWED.libraries, 1);
  assert.equal(result.searches.queriesWithItems, 2);
  assert.equal(result.searches.returnedItems, 5);
  assert.equal(result.searches.attempts, 4);
  assert.equal(result.searches.empty, 1);
  assert.equal(result.searches.failed, 1);
  assert(
    readFileSync(join(store.root, "final-report.md"), "utf8").includes(
      "Blocked/failed",
    ),
  );
});
test("HTTP access refusals are retained beyond a timed cooldown until a permitted recovery", async () => {
  const c = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => new Response("Forbidden", { status: 403 }),
  });
  const ctx = c.context({ allowedOrigins: ["https://a.test"] });
  await assert.rejects(ctx.request("https://a.test/search"), {
    code: "SOURCE_ACCESS_BLOCKED",
  });
  c.cooldowns.clear();
  await assert.rejects(ctx.request("https://a.test/search"), {
    code: "SOURCE_ACCESS_BLOCKED",
  });
  assert.equal(ctx.requests, 1);
});

test("multi-day audit refreshes robots before using permission older than 24 hours", async () => {
  let now = 0,
    policyReads = 0,
    searchReads = 0;
  const coordinator = new Coordinator({
    minGapMs: 0,
    policyClock: () => now,
    fetchImpl: async (url) => {
      if (url.pathname === "/robots.txt") {
        policyReads++;
        return new Response(
          policyReads === 1
            ? "User-agent: *\nAllow: /"
            : "User-agent: *\nDisallow: /search",
        );
      }
      searchReads++;
      return new Response("catalog response");
    },
  });
  const context = () =>
    coordinator.context({ allowedOrigins: ["https://catalog.test"] });
  await context().request("https://catalog.test/search");
  now = 23 * 60 * 60 * 1000;
  await context().request("https://catalog.test/search");
  assert.equal(policyReads, 1);
  now = 24 * 60 * 60 * 1000;
  await assert.rejects(context().request("https://catalog.test/search"), {
    code: "ROBOTS_DISALLOWED",
  });
  assert.equal(policyReads, 2);
  assert.equal(searchReads, 2);
});

test("expired robots permission is not reused if the refresh fails", async () => {
  let now = 0,
    policyReads = 0,
    searchReads = 0;
  const coordinator = new Coordinator({
    minGapMs: 0,
    policyClock: () => now,
    fetchImpl: async (url) => {
      if (url.pathname === "/robots.txt") {
        policyReads++;
        return new Response(
          policyReads === 1 ? "User-agent: *\nAllow: /" : "Unavailable",
          { status: policyReads === 1 ? 200 : 503 },
        );
      }
      searchReads++;
      return new Response("catalog response");
    },
  });
  await coordinator
    .context({ allowedOrigins: ["https://catalog.test"] })
    .request("https://catalog.test/search");
  now = 24 * 60 * 60 * 1000;
  await assert.rejects(
    coordinator
      .context({ allowedOrigins: ["https://catalog.test"] })
      .request("https://catalog.test/search"),
    { code: "ROBOTS_UNAVAILABLE" },
  );
  assert.equal(searchReads, 1);
  assert.equal(policyReads, 2);
});

test("an interrupted job with a saved review blocker can resume instead of being selected forever without work", async (t) => {
  const store = storeFor(t),
    libraries = [row("a", "https://a.test")];
  libraries[0].connections[0].mode = "native_http";
  libraries[0].connections[0].connectionId = "primary";
  store.save("manifest.json", {
    runId: "test",
    target: 20,
    inventory: {
      total: 1,
      libraries,
      inventoryHash: hash(libraries),
      reconciliation: [],
    },
  });
  store.append({
    type: "library_checkpoint",
    mode: "qualify",
    libraryId: "a",
    state: "interrupted",
    blocker: { code: "NO_VERIFIED_BOOKS", reason: "Incomplete proof" },
    nextAction: "Resume",
  });
  const evidence = store.body("synthetic empty native page", "text/plain");
  let calls = 0;
  const service = {
    search: async () => {
      calls++;
      return {
        records: [],
        fidelity: "website_equivalent",
        effectiveProfile: {},
        page: {},
        evidence: [evidence],
      };
    },
  };
  const { run } = await import("./runner.mjs");
  const result = await run(store, service, {
    queries: ["Mathematics"],
    allowFixtureEvidence: true,
  });
  assert.equal(calls, 1);
  assert.equal(result.libraries[0].lastAttemptState, "needs_review");
  assert.equal(result.libraries[0].blocker, null);
});

test("cancellation after candidates arrive does not manufacture a terminal review blocker", async (t) => {
  const store = storeFor(t),
    libraries = [row("a", "https://a.test")];
  libraries[0].connections[0].mode = "native_http";
  libraries[0].connections[0].connectionId = "primary";
  store.save("manifest.json", {
    runId: "test",
    target: 20,
    inventory: {
      total: 1,
      libraries,
      inventoryHash: hash(libraries),
      reconciliation: [],
    },
  });
  const evidence = store.body("synthetic unreviewed candidates", "text/plain"),
    controller = new AbortController();
  const service = {
    search: async () => {
      controller.abort();
      return {
        records: [{ recordId: "1", title: "Unreviewed book" }],
        fidelity: "website_equivalent",
        effectiveProfile: {},
        page: {},
        evidence: [evidence],
      };
    },
  };
  const { run } = await import("./runner.mjs");
  const result = await run(store, service, {
    queries: ["Mathematics"],
    allowFixtureEvidence: true,
    signal: controller.signal,
  });
  assert.equal(result.libraries[0].lastAttemptState, "interrupted");
  assert.equal(result.libraries[0].blocker, null);
  assert.equal(selectBatch(result, 1)[0], "a");
});
