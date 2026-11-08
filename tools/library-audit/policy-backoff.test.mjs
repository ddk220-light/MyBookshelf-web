import test from "node:test";
import assert from "node:assert/strict";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { verifyItemLink } from "./link-verification.mjs";
import { linkVerificationReport } from "./link-verification.mjs";
import { saveLinkResult } from "./link-verification.mjs";
import { pendingLinkRetries } from "./link-verification.mjs";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("failed policy refresh backs off across jobs and saved state while independent origins continue; expired permission is never reused", async () => {
  let now = 0,
    unavailable = false,
    policyReads = 0,
    itemReads = 0;
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") {
      policyReads++;
      return new Response(
        unavailable && u.hostname === "a.test"
          ? "Temporary policy outage"
          : "User-agent: *\nAllow: /",
        { status: unavailable && u.hostname === "a.test" ? 503 : 200 },
      );
    }
    itemReads++;
    return new Response("catalog");
  };
  const coordinator = new Coordinator({
    minGapMs: 0,
    policyClock: () => now,
    fetchImpl,
  });
  const context = (c, host = "a.test") =>
    c.context({ allowedOrigins: ["https://" + host] });
  await context(coordinator).request("https://a.test/item");
  assert.equal(itemReads, 1);
  now = 24 * 60 * 60 * 1000;
  unavailable = true;
  const original = context(coordinator);
  await assert.rejects(original.request("https://a.test/item"), {
    code: "ROBOTS_UNAVAILABLE",
  });
  assert.equal(policyReads, 2);
  assert.equal(itemReads, 1);
  const resumed = new Coordinator({
    minGapMs: 0,
    policyClock: () => now,
    fetchImpl,
  });
  resumed.policyFailures = new Map(
    JSON.parse(JSON.stringify([...coordinator.policyFailures])),
  );
  await assert.rejects(
    context(resumed).request("https://a.test/another-item"),
    (e) =>
      e.code === "ROBOTS_UNAVAILABLE" &&
      e.causeAttemptId === original.attemptId &&
      Boolean(e.retryAfterAt),
  );
  assert.equal(policyReads, 2);
  assert.equal(itemReads, 1);
  await context(resumed, "b.test").request("https://b.test/item");
  assert.equal(itemReads, 2);
  now += 5 * 60 * 1000 + 1;
  unavailable = false;
  await context(resumed).request("https://a.test/item");
  assert.equal(itemReads, 3);
  assert.equal(resumed.policyFailures.has("https://a.test"), false);
});
test("an operator cancellation during policy collection does not become a provider outage cooldown", async () => {
  const controller = new AbortController(),
    coordinator = new Coordinator({
      minGapMs: 0,
      fetchImpl: async () => {
        controller.abort();
        throw Object.assign(Error("operator cancellation"), {
          name: "AbortError",
        });
      },
    });
  const ctx = coordinator.context({
    allowedOrigins: ["https://a.test"],
    signal: controller.signal,
  });
  await assert.rejects(ctx.request("https://a.test/item"));
  assert.equal(coordinator.policyFailures.size, 0);
});
test("an HTML access guard stops further item requests to that origin without calling the library offline or blocking independent catalogs", async () => {
  let requests = 0;
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url) => {
      requests++;
      return new Response(
        new URL(url).hostname === "a.test"
          ? "<title>Just a moment</title><div>cf-chl-challenge</div>"
          : "<h1>Physics</h1>",
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const job = {
    jobId: "1",
    libraryId: "koha:test",
    nativeId: "123",
    recordId: "123",
    title: "Physics",
    url: "https://a.test/cgi-bin/koha/opac-detail.pl?biblionumber=123",
    kind: "record",
  };
  const first = await verifyItemLink(job, coordinator, {
    origins: ["https://a.test"],
  });
  assert.equal(first.code, "CATALOG_PROVIDER_BLOCKED");
  assert.equal(first.tested, true);
  const second = await verifyItemLink({ ...job, jobId: "2" }, coordinator, {
    origins: ["https://a.test"],
  });
  assert.equal(second.tested, false);
  assert.equal(second.code, "SOURCE_ACCESS_BLOCKED");
  assert.equal(requests, 1);
  assert.match(second.reason, /HTML access guard/);
  const independent = await verifyItemLink(
    { ...job, jobId: "3", url: job.url.replace("a.test", "b.test") },
    coordinator,
    { origins: ["https://b.test"] },
  );
  assert.equal(independent.identityConfirmed, true);
  assert.equal(requests, 2);
});
test("link summary separates processed jobs from actual item responses and confirmed identities", (t) => {
  const path = mkdtempSync(join(tmpdir(), "link-response-counts-")),
    store = new EvidenceStore(path);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(path, { recursive: true, force: true });
  });
  store.save("link-verification-queue.json", {
    jobs: [1, 2, 3, 4].map((id) => ({
      jobId: String(id),
      libraryId: "fixture",
      recordId: String(id),
    })),
  });
  for (const event of [
    {
      jobId: "1",
      outcome: "search_or_catalog_handoff_only",
      tested: false,
      identityConfirmed: false,
    },
    {
      jobId: "2",
      outcome: "item_identity_confirmed",
      tested: true,
      identityConfirmed: true,
    },
    {
      jobId: "3",
      outcome: "blocked_or_failed",
      tested: false,
      identityConfirmed: false,
      code: "ROBOTS_UNAVAILABLE",
    },
  ])
    store.append({
      type: "link_verification_completed",
      observationKind: "fixture",
      ...event,
    });
  const summary = linkVerificationReport(store);
  assert.equal(summary.processed, 3);
  assert.equal(summary.itemResponsesObserved, 1);
  assert.equal(summary.classifiedWithoutItemResponse, 2);
  assert.equal(summary.identityConfirmed, 1);
  assert.equal(summary.remaining, 1);
});
test("source pacing survives a saved coordinator restart without delaying independent origins", async () => {
  const first = new Coordinator({
    robots: false,
    minGapMs: 200,
    fetchImpl: async () => new Response("catalog"),
  });
  await first
    .context({ allowedOrigins: ["https://a.test"] })
    .request("https://a.test/item");
  const readyAt = first.originReadyAt.get("https://a.test"),
    times = {};
  const resumed = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url) => {
      times[new URL(url).hostname] = Date.now();
      return new Response("catalog");
    },
  });
  resumed.originReadyAt = new Map(
    JSON.parse(JSON.stringify([...first.originReadyAt])),
  );
  await Promise.all(
    ["a.test", "b.test"].map((host) =>
      resumed
        .context({ allowedOrigins: ["https://" + host] })
        .request("https://" + host + "/item"),
    ),
  );
  assert.ok(times["a.test"] >= readyAt);
  assert.ok(times["b.test"] < readyAt);
});
test("interrupted item jobs remain resumable and retain their attempt before a later successful check", async (t) => {
  const path = mkdtempSync(join(tmpdir(), "link-interrupted-")),
    store = new EvidenceStore(path);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(path, { recursive: true, force: true });
  });
  const job = {
    jobId: "j",
    libraryId: "koha:fixture",
    recordId: "123",
    nativeId: "123",
    title: "Physics",
    url: "https://a.test/item?id=123",
    kind: "record",
  };
  store.save("link-verification-queue.json", { jobs: [job] });
  const controller = new AbortController(),
    interrupted = new Coordinator({
      robots: false,
      minGapMs: 0,
      fetchImpl: async () => {
        controller.abort();
        throw Object.assign(Error("operator cancellation"), {
          name: "AbortError",
        });
      },
    });
  const first = await verifyItemLink(
    job,
    interrupted,
    { origins: ["https://a.test"] },
    { signal: controller.signal },
  );
  assert.equal(first.outcome, "interrupted");
  assert.equal(
    saveLinkResult(store, first, { observationKind: "fixture" }),
    false,
  );
  assert.equal(linkVerificationReport(store).remaining, 1);
  const resumed = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () =>
      new Response("<h1>Physics</h1>", {
        headers: { "content-type": "text/html" },
      }),
  });
  const second = await verifyItemLink(job, resumed, {
    origins: ["https://a.test"],
  });
  assert.equal(
    saveLinkResult(store, second, { observationKind: "fixture" }),
    true,
  );
  assert.equal(linkVerificationReport(store).identityConfirmed, 1);
  assert.equal(linkVerificationReport(store).remaining, 0);
  assert.deepEqual(
    store.events().map((e) => e.type),
    ["link_verification_interrupted", "link_verification_completed"],
  );
});

test("an explicit recovery retry survives interruption without deleting the earlier failure or repeating other failures", (t) => {
  const path = mkdtempSync(join(tmpdir(), "link-retry-")),
    store = new EvidenceStore(path);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(path, { recursive: true, force: true });
  });
  store.save("link-verification-queue.json", {
    jobs: [{ jobId: "a" }, { jobId: "b" }],
  });
  for (const jobId of ["a", "b"])
    saveLinkResult(
      store,
      {
        jobId,
        outcome: "blocked_or_failed",
        tested: false,
        identityConfirmed: false,
        code: "ROBOTS_UNAVAILABLE",
      },
      { observationKind: "fixture" },
    );
  store.append({
    type: "link_verification_retry_requested",
    jobIds: ["a"],
    reason: "Policy recovery observed in a separate permitted canary",
  });
  saveLinkResult(
    store,
    {
      jobId: "a",
      outcome: "interrupted",
      tested: false,
      identityConfirmed: false,
    },
    { observationKind: "fixture" },
  );
  assert.deepEqual([...pendingLinkRetries(store.events())], ["a"]);
  assert.equal(linkVerificationReport(store).remaining, 1);
  saveLinkResult(
    store,
    {
      jobId: "a",
      outcome: "item_identity_confirmed",
      tested: true,
      identityConfirmed: true,
    },
    { observationKind: "fixture" },
  );
  const summary = linkVerificationReport(store);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.identityConfirmed, 1);
  assert.equal(summary.outcomes.blocked_or_failed, 1);
  assert.equal(
    store.events().filter((e) => e.code === "ROBOTS_UNAVAILABLE").length,
    2,
  );
});
