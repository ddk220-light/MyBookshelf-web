import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import {
  failure,
  hash,
} from "../../server/services/catalog-connectors/contracts.js";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { bibliographicMaterialType } from "../../server/services/providers/catalogMarkup.js";
import * as koha from "../../server/services/providers/koha.js";
import { parseIndcatRecord } from "../../server/services/providers/indcat.js";
import { assessBook, run } from "./runner.mjs";
const fixture = (p) =>
  readFileSync(
    new URL("../../server/test/fixtures/" + p, import.meta.url),
    "utf8",
  );

test("valid native empty pages do not need a result table and cannot hide invented records", async () => {
  const { parseAcademicResponse } = await import(
      "../../server/services/providers/discoveryAcademicParsers.js"
    ),
    { verifyNativePage } = await import(
      "../../server/services/catalog-connectors/fidelity.js"
    );
  const configs = JSON.parse(
    readFileSync(
      new URL(
        "../../server/services/providers/discoveryAcademicConfigs.json",
        import.meta.url,
      ),
    ),
  );
  for (const [kind, path] of [
    ["processcube", "catalog-audit/processcube-empty.html"],
    ["bmu", "discovery-academic/bmu-empty.html"],
    ["mizoram", "discovery-academic/mizoram-empty.html"],
  ]) {
    const [academicCatalogId, c] = Object.entries(configs).find(
        ([, c]) => c.kind === kind,
      ),
      html = fixture(path),
      records = parseAcademicResponse(kind, html, { native: true }).records;
    assert.equal(records.length, 0);
    const responses = [{ url: c.url, status: 200, text: html }];
    assert.equal(
      verifyNativePage("discovery-academic", responses, records, {
        academicCatalogId,
      }).verified,
      true,
      kind,
    );
    assert.throws(
      () =>
        verifyNativePage(
          "discovery-academic",
          responses,
          [{ title: "Invented book" }],
          { academicCatalogId },
        ),
      { code: "FIDELITY_MISMATCH" },
    );
  }
});

test("Darshan public record IDs preserve documented dollar characters and remain pinned to the source origin", async () => {
  const { parseAcademicResponse } = await import(
      "../../server/services/providers/discoveryAcademicParsers.js"
    ),
    { verifyNativePage } = await import(
      "../../server/services/catalog-connectors/fidelity.js"
    );
  const html = fixture("catalog-audit/darshan-dollar-id.html"),
    records = parseAcademicResponse("darshan", html, { native: true }).records;
  assert.ok(records.length > 20);
  assert.ok(records.some((r) => r.sourceId.includes("$")));
  const configs = JSON.parse(
      readFileSync(
        new URL(
          "../../server/services/providers/discoveryAcademicConfigs.json",
          import.meta.url,
        ),
      ),
    ),
    [academicCatalogId, c] = Object.entries(configs).find(
      ([, c]) => c.kind === "darshan",
    );
  assert.equal(
    verifyNativePage(
      "discovery-academic",
      [{ url: c.url, status: 200, text: html }],
      records,
      { academicCatalogId },
    ).verified,
    true,
  );
  assert.throws(
    () =>
      parseAcademicResponse(
        "darshan",
        html.replaceAll(
          "/Home/BookInformation?",
          "https://other.test/Home/BookInformation?",
        ),
        { native: true },
      ),
    { code: "CATALOG_UNRECOGNIZED" },
  );
});

test("explicit bibliographic Text type is separate from a local Medicine category", async () => {
  const html = fixture("catalog-audit/srhu-material.html");
  assert.equal(bibliographicMaterialType(html), "Text");
  const library = {
    id: "koha:srhu",
    name: "SRHU",
    platform: "koha",
    baseUrl: "https://library.srhu.edu.in",
  };
  const record = await connectorContext.run(
    {
      request: async (url) => ({
        url: String(url),
        status: 200,
        ok: true,
        text: html,
        headers: new Headers(),
      }),
    },
    () => koha.resolveCatalogRecord(library, "875"),
  );
  assert.equal(record.materialType, "Text");
  assert.equal(record.observation.format, "Medicine");
  assert.equal(assessBook(record, "History", []).formatConfirmed, true);
  assert.equal(
    assessBook({ ...record, materialType: "Serial" }, "History", []).reason,
    "not_a_book",
  );
});

test("native academic HTML rows retain copy rows and website order across reviewed variants", async () => {
  const { parseAcademicResponse } = await import(
    "../../server/services/providers/discoveryAcademicParsers.js"
  );
  const { verifyNativePage } = await import(
    "../../server/services/catalog-connectors/fidelity.js"
  );
  const configs = JSON.parse(
    readFileSync(
      new URL(
        "../../server/services/providers/discoveryAcademicConfigs.json",
        import.meta.url,
      ),
    ),
  );
  for (const kind of [
    "libaitech",
    "rps",
    "libsoft",
    "nios",
    "librarika",
    "mizoram",
    "processcube",
    "bmu",
    "darshan",
  ]) {
    const [academicCatalogId, c] = Object.entries(configs).find(
        ([, c]) => c.kind === kind,
      ),
      html = fixture(`discovery-academic/${kind}.html`);
    const { records } = parseAcademicResponse(kind, html, {
      query: "Mathematics",
      native: true,
    });
    if (kind === "libaitech")
      assert.ok(
        records.every(
          (r) =>
            r.materialType === "Textual Documents" &&
            r.materialTypeProof ===
              "labeled_public_bibliographic_material_type",
        ),
      );
    const responses = [{ url: c.url, status: 200, text: html }];
    assert.equal(
      verifyNativePage("discovery-academic", responses, records, {
        academicCatalogId,
      }).verified,
      true,
      kind,
    );
    assert.throws(
      () =>
        verifyNativePage("discovery-academic", responses, records.slice(1), {
          academicCatalogId,
        }),
      { code: "FIDELITY_MISMATCH" },
      kind,
    );
  }
  const html = fixture("discovery-academic/rps.html"),
    row = html
      .match(/<tbody>([^]*?)<\/tbody>/i)[1]
      .match(/<tr\b[^>]*>[^]*?<\/tr>/i)[0];
  const many = html.replace(
    /<tbody>[^]*?<\/tbody>/i,
    "<tbody>" + row.repeat(27) + "</tbody>",
  );
  assert.equal(
    parseAcademicResponse("rps", many, { native: true }).records.length,
    27,
  );
  assert.equal(parseAcademicResponse("rps", many).records.length, 1);
  const { nativeAcademicPage } = await import(
    "../../server/services/providers/discoveryAcademic.js"
  );
  const page = nativeAcademicPage(
    "rps",
    parseAcademicResponse("rps", many, { native: true }).records,
    10,
  );
  assert.equal(page.records.length, 10);
  assert.equal(page.total, 27);
  assert.equal(page.nextOffset, 20);
  const [academicCatalogId, c] = Object.entries(configs).find(
    ([, c]) => c.kind === "rps",
  );
  assert.equal(
    verifyNativePage(
      "discovery-academic",
      [{ url: c.url, status: 200, text: many }],
      page.records,
      { academicCatalogId },
      page.nativePage,
    ).verified,
    true,
  );
  assert.equal(
    nativeAcademicPage(
      "rps",
      parseAcademicResponse("rps", many, { native: true }).records,
      20,
    ).records.length,
    7,
  );
  assert.throws(() => nativeAcademicPage("rps", [], 1), {
    code: "UNSUPPORTED_PROFILE",
  });
});

test("PMB native result rows are not clipped to the legacy ten-book list and retain branch ownership", async () => {
  const { parsePmbSearch, parsePmbRecord } = await import(
    "../../server/services/providers/communityPmb.js"
  );
  const { verifyNativePage } = await import(
    "../../server/services/catalog-connectors/fidelity.js"
  );
  const library = {
    platform: "discovery-community",
    baseUrl: "https://mediatheques-afinde.org",
    communityCatalog: { family: "pmb", scope: "12" },
  };
  const html = fixture("community/pmb-search.html"),
    records = parsePmbSearch(html, library, { native: true });
  assert.equal(records.length, 15);
  assert.equal(
    verifyNativePage(
      library.platform,
      [{ url: library.baseUrl + "/index.php", status: 200, text: html }],
      records,
      library,
    ).verified,
    true,
  );
  assert.throws(
    () =>
      verifyNativePage(
        library.platform,
        [{ url: library.baseUrl + "/index.php", status: 200, text: html }],
        records.slice(0, 10),
        library,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  const detail = fixture("community/pmb-record.html"),
    id = detail.match(/lvl=notice_display(?:&amp;|&)id=(\d+)/)?.[1];
  assert.equal(parsePmbRecord(detail, library, id).materialType, "Book");
  assert.throws(
    () =>
      parsePmbSearch(
        html,
        { ...library, communityCatalog: { family: "pmb", scope: "5" } },
        { native: true },
      ),
    { code: "CATALOG_HOLDING_UNCONFIRMED" },
  );
});

test("Visakhapatnam audit uses only the literal title form and preserves every native row", async () => {
  const vpl = await import("../../server/services/providers/visakhapatnam.js");
  const { verifyNativePage } = await import(
    "../../server/services/catalog-connectors/fidelity.js"
  );
  const library = {
    id: "vpl:visakhapatnam-public-library",
    baseUrl: "https://visakhapatnampubliclibrary.org",
  };
  let called;
  const html = fixture("vpl/title-9.html").replace(
    'value="Premante enti ? - nee drustilo"',
    'value="wings"',
  );
  const result = await connectorContext.run(
    {
      request: async (url) => {
        called = String(url);
        return {
          url: called,
          status: 200,
          ok: true,
          headers: new Headers(),
          text: html,
        };
      },
    },
    () => vpl.searchNativeCatalog(library, "wings"),
  );
  assert.equal(result.records.length, 1);
  assert.equal(new URL(called).searchParams.get("title"), "wings");
  assert.equal(new URL(called).searchParams.get("author"), "");
  assert.equal(
    verifyNativePage(
      "vpl",
      [{ url: called, status: 200, text: html }],
      result.records,
    ).verified,
    true,
  );
  await assert.rejects(vpl.searchNativeCatalog(library, "wings' fire"), {
    code: "UNSUPPORTED_PROFILE",
  });
});

test("material type is not guessed from an item category or contradictory labels", () => {
  assert.equal(bibliographicMaterialType("<td>Medicine</td>"), null);
  assert.equal(
    bibliographicMaterialType(
      '<span class="label">Material type:</span>Text</span><span class="label">Material type:</span>Serial</span>',
    ),
    null,
  );
});

test("Koha preserves audit policy and origin failures instead of reporting network outages", async () => {
  const library = { platform: "koha", baseUrl: "https://catalog.test" };
  for (const code of [
    "ROBOTS_DISALLOWED",
    "ROBOTS_UNAVAILABLE",
    "SOURCE_ACCESS_BLOCKED",
    "PROVIDER_COOLDOWN",
    "ORIGIN_NOT_ALLOWED",
  ])
    await assert.rejects(
      connectorContext.run(
        {
          request: async () => {
            throw failure(code, "Scoped audit error", 503);
          },
        },
        () => koha.searchNativeCatalog(library, "Mathematics"),
      ),
      { code },
    );
});

test("catalog-only HTTPS configuration uses its existing public origin without changing the query", async () => {
  let called;
  const query = "Mathematics";
  const result = await connectorContext.run(
    {
      request: async (url) => {
        called = String(url);
        return {
          url: String(url),
          status: 200,
          ok: true,
          headers: new Headers(),
          text: '<body id="results">No results found!</body>',
        };
      },
    },
    () =>
      koha.searchNativeCatalog(
        { platform: "koha", catalogUrl: "https://catalog.test/" },
        query,
      ),
  );
  assert.equal(new URL(called).origin, "https://catalog.test");
  assert.equal(new URL(called).searchParams.get("q"), query);
  assert.equal(result.records.length, 0);
});

test("IndCat book material proof requires its native book identity and institution ownership", () => {
  const html = fixture("indcat/abhayapuri-record.html"),
    library = {
      name: "Abhayapuri College",
      baseUrl: "https://indcat.inflibnet.ac.in",
      indcatInstitutionCode: "ABHA_783384",
    };
  const record = parseIndcatRecord(html, library, "24736067");
  assert.equal(record.materialType, "Book");
  assert.equal(record.materialTypeProof, "indcat_books_bk_record_kind");
  assert.equal(
    parseIndcatRecord(
      html.replaceAll("bk_24736067", "sr_24736067"),
      library,
      "24736067",
    ),
    null,
  );
});

test("owner repair gate prevents collection even if an old automation attempts a restart", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "audit-gate-")),
    store = new EvidenceStore(root);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(root, { recursive: true, force: true });
  });
  const libraries = [];
  store.save("manifest.json", {
    runId: "test",
    target: 20,
    inventory: { total: 0, libraries, inventoryHash: hash(libraries) },
  });
  store.save("audit-control.json", { resumeAllowed: false });
  await assert.rejects(
    run(store, {
      search: () => {
        throw new Error("must not contact sources");
      },
    }),
    { code: "AUDIT_REPAIR_GATE" },
  );
  assert.equal(store.events().length, 0);
});

test("reviewed LIBMAN client contract preserves native duplicate rows and their exact order", async () => {
  const { parseLibmanSearch } = await import(
    "../../server/services/providers/libman.js"
  );
  const { verifyNativePage } = await import(
    "../../server/services/catalog-connectors/fidelity.js"
  );
  const json = [
    { TitleNo: 9, Title1: "Mathematics" },
    { TitleNo: 2, Title1: "Applied mathematics" },
    { TitleNo: 9, Title1: "Mathematics" },
  ];
  const records = parseLibmanSearch(json, { native: true }).records;
  assert.deepEqual(
    records.map((r) => r.recordId),
    ["9", "2", "9"],
  );
  const responses = [
    {
      url: "https://libcloud.mastersofterp.in/OPAC_V3/GetBookSearchData/?Libraryid=100",
      status: 200,
      text: JSON.stringify(json),
    },
  ];
  assert.equal(verifyNativePage("libman", responses, records).verified, true);
  assert.throws(
    () => verifyNativePage("libman", responses, records.slice(0, 2)),
    { code: "FIDELITY_MISMATCH" },
  );
});

test("native Koha single-result redirect proves website selection only for the exact same-origin record", async () => {
  const { verifyNativePage } = await import(
    "../../server/services/catalog-connectors/fidelity.js"
  );
  const responses = [
    {
      url: "https://catalog.test/cgi-bin/koha/opac-search.pl?q=Mathematics",
      status: 302,
      location:
        "https://catalog.test/cgi-bin/koha/opac-detail.pl?biblionumber=42",
      text: "",
    },
    {
      url: "https://catalog.test/cgi-bin/koha/opac-detail.pl?biblionumber=42",
      status: 200,
      text: '<h1 class="title">Mathematics</h1>',
    },
  ];
  assert.equal(
    verifyNativePage("koha", responses, [{ recordId: "42" }]).verified,
    true,
  );
  assert.equal(
    verifyNativePage("koha", responses, [{ recordId: "43" }]).verified,
    false,
  );
  assert.equal(
    verifyNativePage(
      "koha",
      [
        {
          ...responses[0],
          location:
            "https://other.test/cgi-bin/koha/opac-detail.pl?biblionumber=42",
        },
        responses[1],
      ],
      [{ recordId: "42" }],
    ).verified,
    false,
  );
});

test("revalidation never closes a tooling gap or uses an unrelated old network failure as proof", async () => {
  const { classifyRevalidation } = await import("./revalidation-report.mjs");
  const replay = {
      libraryId: "a",
      classification: "needs_live_recheck",
      replayedVerifiedBooks: 0,
    },
    live = {
      books: [],
      blocker: {
        code: "CATALOG_UNAVAILABLE",
        reason: "Unknown parser/application failure",
      },
    };
  const checkpoint = {
    type: "library_checkpoint",
    libraryId: "a",
    state: "blocked",
  };
  let events = [
    { type: "request_failed", libraryId: "a", attemptId: "old" },
    { type: "search_failed", libraryId: "a", attemptId: "current" },
    checkpoint,
  ];
  assert.equal(classifyRevalidation(replay, live, events).closed, false);
  events = [
    {
      type: "response_received",
      libraryId: "a",
      attemptId: "current",
      status: 503,
    },
    ...events,
  ];
  assert.equal(
    classifyRevalidation(replay, live, events).classification,
    "observed_connection_or_http_block",
  );
  assert.equal(
    classifyRevalidation(
      replay,
      { ...live, blocker: { code: "EQUIVALENCE_UNPROVEN" } },
      events,
    ).closed,
    false,
  );
  assert.equal(
    classifyRevalidation(
      { ...replay, classification: "clean_zero_replayed" },
      live,
      [],
    ).closed,
    false,
  );
  assert.equal(
    classifyRevalidation(
      { ...replay, classification: "confirmed_policy_block" },
      live,
      [],
    ).closed,
    true,
  );
});

test("live revalidation understands saved website-equivalent fidelity and keeps partial findings below target", async () => {
  const { classifyRevalidation } = await import("./revalidation-report.mjs");
  const replay = { libraryId: "a", classification: "needs_live_recheck" },
    events = [
      {
        type: "search_completed",
        libraryId: "a",
        fidelity: "website_equivalent",
        records: [{ recordId: "1" }],
      },
      { type: "library_checkpoint", libraryId: "a", state: "qualified" },
    ];
  assert.equal(
    classifyRevalidation(
      replay,
      {
        books: Array.from({ length: 20 }, (_, i) => ({ recordId: String(i) })),
      },
      events,
    ).classification,
    "verified_20_live",
  );
  assert.equal(
    classifyRevalidation(replay, { books: [{ recordId: "1" }] }, events).closed,
    false,
  );
  events.push({ type: "revalidation_attempt_completed", libraryId: "a" });
  assert.equal(
    classifyRevalidation(replay, { books: [{ recordId: "1" }] }, events)
      .classification,
    "verified_partial_live",
  );
  assert.equal(
    classifyRevalidation(replay, { books: [] }, events).closed,
    false,
  );
});

test("timeouts use a stable transport cause rather than DOMException numeric codes", async () => {
  const { Coordinator } = await import(
    "../../server/services/catalog-connectors/transport.js"
  );
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () => {
      throw new DOMException("Timed out", "TimeoutError");
    },
  });
  const ctx = coordinator.context({ allowedOrigins: ["https://catalog.test"] });
  await assert.rejects(
    ctx.request("https://catalog.test/search"),
    (e) => e.code === "UPSTREAM_TIMEOUT" && e.cause.name === "TimeoutError",
  );
});

test("a timeout invalidated by a scheduler bug remains open until a later completed recheck", async () => {
  const { classifyRevalidation } = await import("./revalidation-report.mjs");
  const replay = { libraryId: "a", classification: "needs_live_recheck" },
    live = { books: [], blocker: { code: 23, reason: "Timed out" } };
  const events = [
    {
      type: "response_received",
      libraryId: "a",
      attemptId: "one",
      status: 503,
    },
    { type: "search_failed", libraryId: "a", attemptId: "one" },
    {
      type: "library_checkpoint",
      libraryId: "a",
      state: "blocked",
      at: "2026-11-07T13:00:00Z",
    },
    {
      type: "revalidation_outcome_invalidated",
      libraryId: "a",
      at: "2026-11-07T14:00:00Z",
      reason: "Same-origin scheduler bug; recheck required",
    },
  ];
  assert.equal(classifyRevalidation(replay, live, events).closed, false);
  events.push({
    type: "library_checkpoint",
    libraryId: "a",
    state: "blocked",
    at: "2026-11-07T15:00:00Z",
  });
  assert.equal(classifyRevalidation(replay, live, events).closed, false);
  events.push(
    {
      type: "response_received",
      libraryId: "a",
      attemptId: "two",
      status: 503,
      at: "2026-11-07T15:00:01Z",
    },
    {
      type: "search_failed",
      libraryId: "a",
      attemptId: "two",
      at: "2026-11-07T15:00:02Z",
    },
  );
  assert.equal(
    classifyRevalidation(replay, live, events).classification,
    "observed_connection_or_http_block",
  );
});
