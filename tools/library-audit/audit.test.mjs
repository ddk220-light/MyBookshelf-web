import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { inventory } from "../../server/services/catalog-connectors/inventory.js";
import {
  EvidenceStore,
  sanitizeBody,
  safeUrl,
} from "../../server/services/catalog-connectors/evidence.js";
import {
  Coordinator,
  robotsRules,
  robotsAllowed,
} from "../../server/services/catalog-connectors/transport.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import {
  cachedTask,
  getText,
  clearHttpCache,
} from "../../server/services/providers/http.js";
import {
  tokens,
  searchProfile,
  hash,
} from "../../server/services/catalog-connectors/contracts.js";
import { createConnectorApi } from "../../server/services/catalog-connectors/api.js";
import {
  parseCatalogSearch,
  searchForm,
} from "../../server/services/providers/egranthalaya.js";
import { parseExpandedKohaCatalogSearch } from "../../server/services/providers/koha.js";
import { parseIndcatSearch } from "../../server/services/providers/indcat.js";
import { run, reduceRun, assessBook } from "./runner.mjs";
import { report, csvCell } from "./report.mjs";
import { dueJobs, defaultSchedule, tick } from "./schedule.mjs";
import { verifyNativePage } from "../../server/services/catalog-connectors/fidelity.js";
const fixture = (p) =>
  readFileSync(
    new URL(`../../server/test/fixtures/${p}`, import.meta.url),
    "utf8",
  );
const secret = "test-only-signing-secret-0123456789abcdef";
function storeFor(t) {
  const path = mkdtempSync(join(tmpdir(), "catalog-audit-"));
  const store = new EvidenceStore(path);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(path, { recursive: true, force: true });
  });
  return store;
}
function smallManifest(store) {
  const libraries = [
    {
      libraryId: "koha:test",
      name: "Test Engineering Library",
      country: "IN",
      region: "Tamil Nadu",
      connections: [
        { connectionId: "primary", family: "koha", mode: "native_http" },
      ],
    },
  ];
  const m = {
    schemaVersion: 1,
    runId: "test-run",
    target: 20,
    inventory: { libraries, total: 1, inventoryHash: hash(libraries) },
  };
  store.save("manifest.json", m);
  return m;
}
test("inventory accounts for all entries, alternative routes and omissions without inflating totals", () => {
  const m = inventory();
  assert.equal(m.total, 6703);
  assert.equal(new Set(m.libraries.map((l) => l.libraryId)).size, 6703);
  assert.equal(m.reconciliation.length, 379);
  assert.equal(
    m.libraries.filter((l) => l.connections[0].family === "egranthalaya")
      .length,
    5036,
  );
  assert.equal(m.inventoryHash, hash(m.libraries));
});
test("literal queries and unsupported profiles are not silently rewritten", () => {
  const q = "தமிழ் மொழி";
  assert.equal(searchProfile({ libraryId: "koha:a", query: q }).query, q);
  for (const input of [
    { query: " term " },
    { query: "x", filters: { branch: "other" } },
    { query: "x", sort: "relevance" },
    { query: "x", freshness: "cached_ok" },
    { query: "x", locale: "en" },
    { query: "x", url: "https://evil.invalid" },
  ])
    assert.throws(() => searchProfile({ libraryId: "koha:a", ...input }));
});
test("signed references reject modification and expiry", () => {
  const t = tokens(secret),
    signed = t.sign({ kind: "page", expiresAt: Date.now() + 10000 });
  assert.equal(t.read(signed).kind, "page");
  assert.throws(() => t.read(signed + "x"));
  assert.throws(() => t.read(t.sign({ expiresAt: 0 })), {
    code: "CURSOR_EXPIRED",
  });
});
test("provider caches cannot masquerade as a fresh audit call", async () => {
  clearHttpCache();
  let n = 0;
  await cachedTask("audit-test", () => ++n);
  await connectorContext.run(
    {
      request: async () => ({ ok: true, text: "live", headers: new Headers() }),
    },
    async () => {
      assert.equal(await cachedTask("audit-test", () => ++n), 2);
      assert.equal((await getText("https://example.org")).text, "live");
    },
  );
  assert.equal(await cachedTask("audit-test", () => ++n), 1);
  clearHttpCache();
});
test("robots groups, longest paths, allow ties and wildcards are respected", () => {
  const rules = robotsRules(
    "User-agent: *\nDisallow: /search\nAllow: /search/public\nDisallow: /*?private=*$\nUser-agent: unrelated\nDisallow: /",
  );
  assert.equal(robotsAllowed(rules, "https://a.test/search?q=x"), false);
  assert.equal(robotsAllowed(rules, "https://a.test/search/public?q=x"), true);
  assert.equal(robotsAllowed(rules, "https://a.test/a?private=yes"), false);
  assert.equal(
    robotsAllowed(
      robotsRules(
        "User-agent: MyBookshelfAudit\nDisallow: /\nUser-agent: *\nAllow: /",
      ),
      "https://a.test/",
    ),
    false,
  );
});
test("transport serializes one origin and allows independent origins concurrently", async () => {
  let active = 0,
    max = 0;
  const per = new Map();
  const c = new Coordinator({
    robots: false,
    minGapMs: 0,
    concurrency: 2,
    fetchImpl: async (url) => {
      const o = url.origin;
      assert.equal(per.get(o) || 0, 0);
      per.set(o, 1);
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      per.set(o, 0);
      return new Response("ok");
    },
  });
  const ctx = c.context({
    libraryId: "test",
    allowedOrigins: ["https://a.test", "https://b.test"],
  });
  await Promise.all(
    ["https://a.test/1", "https://a.test/2", "https://b.test/1"].map((u) =>
      ctx.request(u),
    ),
  );
  assert.equal(max, 2);
  assert.equal(ctx.requests, 3);
  await assert.rejects(ctx.request("https://a.test@evil.test/"), {
    code: "ORIGIN_NOT_ALLOWED",
  });
});
test("robots refusal and 429 prevent follow-up traffic; response limits stop oversized data", async () => {
  let calls = 0;
  const c = new Coordinator({
    minGapMs: 0,
    fetchImpl: async () => {
      calls++;
      return new Response("User-agent: *\nDisallow: /search");
    },
  });
  const ctx = c.context({ libraryId: "x", allowedOrigins: ["https://a.test"] });
  await assert.rejects(ctx.request("https://a.test/search"), {
    code: "ROBOTS_DISALLOWED",
  });
  assert.equal(calls, 1);
  const d = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () =>
      new Response("slow", { status: 429, headers: { "Retry-After": "30" } }),
  });
  const x = d.context({ libraryId: "x", allowedOrigins: ["https://a.test"] });
  await assert.rejects(x.request("https://a.test/"), {
    code: "PROVIDER_COOLDOWN",
  });
  await assert.rejects(x.request("https://a.test/"), {
    code: "PROVIDER_COOLDOWN",
  });
  assert.equal(x.requests, 1);
  const big = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => new Response("abcdef"),
  });
  await assert.rejects(
    big
      .context({ allowedOrigins: ["https://a.test"] })
      .request("https://a.test/", { maxResponseBytes: 3 }),
    { code: "RESPONSE_TOO_LARGE" },
  );
});
test("redacted evidence retains member controls, verifies hashes and recovers an incomplete trailing event", (t) => {
  const s = storeFor(t);
  const raw =
    '<input type="hidden" name="part_uni" value="ABHA_783384"><input name="__VIEWSTATE" value="secret"><script>token="secret"</script><b>Book</b>';
  const ref = s.body(raw, "text/html");
  assert(!sanitizeBody(raw).includes("secret"));
  assert(sanitizeBody(raw).includes("ABHA_783384"));
  s.append({ type: "test", evidence: [ref] });
  assert.equal(s.validate().events, 1);
  appendFileSync(s.eventsPath, '{"incomplete":');
  assert.throws(() => s.events());
  assert.equal(s.events({ repairTail: true }).length, 1);
  writeFileSync(join(s.root, ref.path), "changed");
  assert.throws(() => s.validate());
  assert(!safeUrl("https://a.test/?token=SECRET&q=math").includes("SECRET"));
});
test("exclusive writer does not silently steal a lock", (t) => {
  const s = storeFor(t);
  assert.throws(() => new EvidenceStore(s.root).acquire(), {
    code: "WRITER_ACTIVE",
  });
});
test("native page parsers do not clip after the tenth result", () => {
  const rows = Array.from(
    { length: 21 },
    (_, i) =>
      `<a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=${i + 1}">Mathematics ${i + 1}</a>`,
  ).join("");
  assert.equal(
    parseExpandedKohaCatalogSearch(
      `<body id="results">${rows}</body>`,
      new URL("https://catalog.test/"),
      Infinity,
    ).length,
    21,
  );
  const code = "ABHA_783384";
  const links = Array.from({ length: 21 }, (_, i) => {
    const payload = Buffer.from(
      JSON.stringify({ book_detail: String(i + 1), singleclg: code }),
    ).toString("base64");
    return `<a href="https://indcat.inflibnet.ac.in/index.php/search/book_search?getDetails=${payload}">Book ${i}</a>`;
  }).join("");
  assert.equal(
    parseIndcatSearch(
      `<input name="part_uni" value="${code}">Total 21 Records found${links}`,
      code,
      Infinity,
    ).records.length,
    21,
  );
  assert.throws(() =>
    parseIndcatSearch(
      `<input name="part_uni" value="OTHER">Total 0 Records found`,
      code,
    ),
  );
});
test("native Koha service preserves order and validates pagination against query and config", async (t) => {
  const s = storeFor(t),
    entry = {
      id: "koha:test",
      platform: "koha",
      slug: "test",
      name: "Test",
      country: "IN",
      baseUrl: "https://catalog.test",
      catalogUrl: "https://catalog.test",
      capabilities: ["availability"],
    };
  const html =
    '<body id="results"><h1>Your search returned 3 results.</h1><a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=9">Zoo</a><a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=2">Algebra</a><a rel="next" href="?offset=2">Next</a></body>';
  const c = new Coordinator({
      store: s,
      robots: false,
      minGapMs: 0,
      fetchImpl: async () => new Response(html),
    }),
    svc = new ConnectorService({ coordinator: c, secret, lookup: () => entry });
  const result = await svc.search({ libraryId: entry.id, query: "math" });
  assert.deepEqual(
    result.records.map((r) => r.recordId),
    ["9", "2"],
  );
  assert.equal(result.freshness.sourceContacted, true);
  assert(result.page.nextCursor);
  await assert.rejects(
    svc.search({
      libraryId: entry.id,
      query: "different",
      cursor: result.page.nextCursor,
    }),
    { code: "INVALID_CURSOR" },
  );
  assert.equal(s.validate().valid, true);
});
test("book acceptance rejects wrong membership, irrelevant items, serials and duplicate copies", () => {
  const r = {
    recordId: "1",
    title: "Applied Mathematics",
    format: "Book",
    observation: { outcome: "in_catalog" },
  };
  assert.equal(assessBook(r, "Mathematics", []).accepted, true);
  assert.equal(
    assessBook({ ...r, observation: null }, "Mathematics", []).accepted,
    false,
  );
  assert.equal(
    assessBook({ ...r, format: "Journal" }, "Mathematics", []).accepted,
    false,
  );
  assert.equal(assessBook(r, "Poetry", []).accepted, false);
  assert.equal(
    assessBook({ ...r, recordId: "2" }, "Mathematics", [r]).accepted,
    false,
  );
});
test("20-book run checkpoints, resumes without double counting and exposes report evidence", async (t) => {
  const s = storeFor(t),
    m = smallManifest(s),
    evidence = s.body("fixture data; synthetic test only", "text/plain");
  let calls = 0;
  const svc = {
    search: async (p) => {
      calls++;
      return {
        records: Array.from({ length: 20 }, (_, i) => ({
          recordId: String(i),
          recordRef: `r${i}`,
          title: `${p.query} Volume ${i}`,
        })),
        fidelity: "website_equivalent",
        effectiveProfile: { query: p.query },
        page: { nextCursor: null },
        total: { value: 20 },
        evidence: [evidence],
      };
    },
    resolve: async (ref) => ({
      record: {
        recordId: ref.slice(1),
        title: `Wings of Fire Volume ${ref.slice(1)}`,
        format: "Book",
        observation: { outcome: "in_catalog" },
      },
      evidence: [evidence],
    }),
  };
  const result = await run(s, svc, { allowFixtureEvidence: true });
  assert.equal(result.booksVerified, 20);
  assert.equal(result.counts["20 verified"], 1);
  await run(s, svc);
  assert.equal(calls, 1);
  assert.equal(reduceRun(m, s.events()).booksVerified, 20);
  assert.equal(report(s).booksVerified, 20);
  assert(readFileSync(join(s.root, "report.html"), "utf8").includes("20/20"));
  assert.equal(s.validate().valid, true);
});
test("API rejects anonymous use and malformed search before any provider request", async (t) => {
  const s = storeFor(t);
  smallManifest(s);
  const c = new Coordinator({
    store: s,
    fetchImpl: () => {
      throw new Error("must not request");
    },
  });
  const svc = new ConnectorService({ coordinator: c, secret });
  const api = createConnectorApi({ service: svc, store: s, apiKey: secret });
  await request(api).get("/api/catalog/v1/libraries").expect(401);
  const r = await request(api)
    .get("/api/catalog/v1/libraries?country=IN")
    .set("Authorization", `Bearer ${secret}`)
    .expect(200);
  assert.equal(r.body.libraries.length, 50);
  assert.equal(r.body.total, 6703);
  await request(api)
    .post("/api/catalog/v1/search")
    .set("Authorization", `Bearer ${secret}`)
    .send({ libraryId: "koha:test", query: "x", url: "https://elsewhere.test" })
    .expect(400);
});
test("CSV and HTML outputs cannot execute source-supplied formulas or markup", () => {
  assert.equal(csvCell("=SUM(1,2)"), '"\'=SUM(1,2)"');
  assert.equal(csvCell(" +1"), '"\' +1"');
});
test("independent fidelity check catches native result clipping and reordering", () => {
  const responses = [
    {
      url: "https://a.test/search",
      status: 200,
      text: '<a class="title" href="?biblionumber=9">Z</a><a class="title" href="?biblionumber=2">A</a>',
    },
  ];
  assert(
    verifyNativePage("koha", responses, [{ recordId: "9" }, { recordId: "2" }])
      .verified,
  );
  assert.throws(
    () =>
      verifyNativePage("koha", responses, [
        { recordId: "2" },
        { recordId: "9" },
      ]),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.throws(
    () => verifyNativePage("koha", responses, [{ recordId: "9" }]),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.equal(verifyNativePage("discovery-academic", responses, []).verified, false);
});
test("health checks never establish initial twenty-book qualification", async (t) => {
  const s = storeFor(t);
  const m = smallManifest(s);
  const e = s.body("test fixture", "text/plain");
  const svc = {
    search: async () => ({
      records: [],
      effectiveProfile: {},
      fidelity: "website_equivalent",
      freshness: { sourceContacted: true },
      page: {},
      total: { value: 0 },
      evidence: [e],
    }),
  };
  await run(s, svc, { mode: "health" });
  const p = reduceRun(m, s.events());
  assert.equal(p.counts["Not checked/checking"], 1);
  assert.equal(p.booksVerified, 0);
  assert.equal(p.libraries[0].lastHealth.outcome, "empty");
});
test("fixture responses cannot qualify a library in a real run", async (t) => {
  const s = storeFor(t);
  smallManifest(s);
  const e = s.body("fixture", "text/plain");
  const svc = {
    search: async () => ({
      records: [],
      observationKind: "fixture",
      fidelity: "website_equivalent",
      effectiveProfile: {},
      page: {},
      evidence: [e],
    }),
  };
  const result = await run(s, svc);
  assert.equal(result.booksVerified, 0);
  assert.equal(result.counts["Blocked/failed"], 1);
});
test("schedule stays disabled and exposes due work without issuing requests", async (t) => {
  const s = storeFor(t);
  smallManifest(s);
  const svc = {
    search: () => {
      throw new Error("must not run");
    },
  };
  const plan = await tick(s, svc);
  assert.equal(plan.enabled, false);
  assert.equal(plan.due, 1);
  await assert.rejects(tick(s, svc, { execute: true }), /disabled/);
  const jobs = dueJobs(
    {
      libraries: [
        {
          libraryId: "x",
          books: Array(20).fill({}),
          lastQualifiedAt: new Date().toISOString(),
          lastHealth: null,
        },
      ],
    },
    defaultSchedule,
  );
  assert.equal(jobs[0].mode, "health");
});
test("missing accepted-book proof fails validation", (t) => {
  const s = storeFor(t);
  s.append({ type: "book_accepted", book: { recordId: "1", title: "Book" } });
  assert.throws(() => s.validate(), /Incomplete/);
});

test("eGranthalaya title profile uses an offered website control and preserves the literal query", () => {
  const html =
    '<form method="post"><input name="__VIEWSTATE" value="test"><input name="txt_Search"><input type="submit" name="Basic_Search_Bttn"><select name="DDL_Library"><option value="TEST">Test</option></select><select name="DDL_Field"><option value="ALL">ALL</option><option value="TITLE">Title</option></select></form>';
  const query = "தமிழ் மொழி";
  const fields = searchForm(html, {
    libraryCode: "TEST",
    query,
    field: "TITLE",
  });
  assert.equal(fields.get("DDL_Field"), "TITLE");
  assert.equal(fields.get("txt_Search"), query);
  assert.equal(
    searchForm(html.replace('value="TITLE"', 'value="REMOVED"'), {
      libraryCode: "TEST",
      query,
      field: "TITLE",
    }),
    null,
  );
});

test("audit workers keep independent hosts moving when many members share a catalog", async (t) => {
  const s = storeFor(t),
    m = smallManifest(s),
    base = m.inventory.libraries[0];
  m.inventory.libraries = [1, 2, 3, 4].map((i) => ({
    ...base,
    libraryId: `test:${i}`,
    connections: [
      {
        ...base.connections[0],
        origins: [i === 4 ? "https://other.test" : "https://union.test"],
      },
    ],
  }));
  m.inventory.total = 4;
  m.inventory.inventoryHash = hash(m.inventory.libraries);
  s.save("manifest.json", m);
  const started = [];
  let unionActive = false;
  const svc = {
    search: async (p) => {
      started.push(p.libraryId);
      if (p.libraryId !== "test:4") {
        assert.equal(unionActive, false);
        unionActive = true;
        await new Promise((r) => setTimeout(r, 15));
        unionActive = false;
      }
      return {
        records: [],
        effectiveProfile: {},
        fidelity: "unverified",
        page: {},
        evidence: [],
      };
    },
  };
  await run(s, svc, { mode: "health", concurrency: 2 });
  assert.deepEqual(started.slice(0, 2), ["test:1", "test:4"]);
  assert.equal(started.length, 4);
});

test("an alternative route can recover a parser failure without retaining a stale blocker", async (t) => {
  const s = storeFor(t),
    m = smallManifest(s);
  m.inventory.libraries[0].connections.push({
    connectionId: "alternate-1",
    family: "koha",
    mode: "native_http",
  });
  m.inventory.inventoryHash = hash(m.inventory.libraries);
  s.save("manifest.json", m);
  const e = s.body("synthetic alternate result", "text/plain");
  const svc = {
    search: async (p) => {
      if (p.connectionId === "primary")
        throw Object.assign(new Error("parser changed"), {
          code: "CATALOG_UNRECOGNIZED",
        });
      return {
        records: [],
        fidelity: "website_equivalent",
        effectiveProfile: {},
        page: {},
        evidence: [e],
      };
    },
  };
  const result = await run(s, svc, {
    queries: ["Mathematics"],
    allowFixtureEvidence: true,
  });
  assert.equal(result.libraries[0].blocker, null);
  assert.equal(result.libraries[0].attempts, 2);
});

test("review shortfalls do not monopolize every later scheduled tick", () => {
  const jobs = dueJobs(
    {
      libraries: [
        { libraryId: "review", books: [], lastAttemptState: "needs_review" },
        { libraryId: "new", books: [] },
        { libraryId: "resume", books: [{}], lastAttemptState: "interrupted" },
      ],
    },
    defaultSchedule,
  );
  assert.deepEqual(
    jobs.map((j) => j.libraryId),
    ["new", "resume"],
  );
});

test("cancelled operator jobs are idempotent, checkpointed and resumable without a false provider blocker", async (t) => {
  const store = storeFor(t);
  smallManifest(store);
  let started = 0;
  const service = {
    search: async (_input, { signal }) => {
      started++;
      await new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          { once: true },
        );
      });
    },
  };
  const app = createConnectorApi({ service, store, apiKey: secret });
  const body = { mode: "qualify", libraryIds: ["koha:test"] };
  const submit = () =>
    request(app)
      .post("/api/catalog/v1/audit-runs")
      .set("Authorization", `Bearer ${secret}`)
      .set("Idempotency-Key", "one-job");
  await submit().send(body).expect(202);
  await submit().send(body).expect(202);
  assert.equal(started, 1);
  await submit()
    .send({ ...body, mode: "health" })
    .expect(409);
  await request(app)
    .post("/api/catalog/v1/audit-runs/test-run/cancel")
    .set("Authorization", `Bearer ${secret}`)
    .expect(202);
  await app.locals.stopAudit();
  const progress = JSON.parse(readFileSync(join(store.root, "progress.json")));
  assert.equal(progress.libraries[0].blocker, null);
  assert.equal(progress.libraries[0].lastAttemptState, "interrupted");
  assert.equal(progress.libraries[0].status, "Not checked/checking");
  assert.equal(
    store.events().filter((e) => e.type === "search_interrupted").length,
    1,
  );
  assert.equal(
    JSON.parse(readFileSync(join(store.root, "submissions.json")))[
      hash("one-job")
    ].state,
    "interrupted",
  );
});

test("scoped book-list evidence avoids needless per-book detail calls after one detail probe", async (t) => {
  const store = storeFor(t);
  smallManifest(store);
  let details = 0;
  const evidence = store.body(
    "synthetic scoped book-list evidence",
    "text/plain",
  );
  const records = Array.from({ length: 20 }, (_, i) => ({
    recordId: String(i),
    recordRef: String(i),
    title: `Mathematics ${i}`,
    format: "Book",
    observation: { outcome: "in_catalog" },
  }));
  const service = {
    search: async () => ({
      records,
      fidelity: "website_equivalent",
      effectiveProfile: {},
      page: {},
      evidence: [evidence],
    }),
    resolve: async (ref) => {
      details++;
      return { record: records[Number(ref)], evidence: [evidence] };
    },
  };
  const result = await run(store, service, {
    queries: ["Mathematics"],
    allowFixtureEvidence: true,
  });
  assert.equal(result.booksVerified, 20);
  assert.equal(details, 1);
});

test("record IDs are local to a connection while duplicate book titles remain shared", () => {
  const a = {
    connectionId: "primary",
    recordId: "1",
    title: "Applied Mathematics",
    format: "Book",
    observation: { outcome: "in_catalog" },
  };
  const b = {
    ...a,
    connectionId: "alternate-1",
    title: "Discrete Mathematics",
  };
  assert.equal(assessBook(b, "Mathematics", [a]).accepted, true);
  assert.equal(
    assessBook({ ...b, title: a.title }, "Mathematics", [a]).reason,
    "duplicate_book",
  );
});
