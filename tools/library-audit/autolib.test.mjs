import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import {
  autolibContract,
  autolibSmartMatch,
} from "../../server/services/providers/autolibNative.js";
import {
  searchNativeCatalog,
  parseAcademicResponse,
} from "../../server/services/providers/discoveryAcademic.js";
import { academicFidelity } from "../../server/services/catalog-connectors/academic-fidelity.js";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { assessBook } from "./runner.mjs";
import recipes from "../../server/services/catalog-connectors/recipe-contracts.json" with { type: "json" };
const body = (sha) =>
  readFileSync(
    new URL(
      `../../docs/research/india-library-audit/revalidation/20261107/bodies/${sha}.txt`,
      import.meta.url,
    ),
    "utf8",
  );
const script = body(recipes.autolib.inlineEvidenceSha256);
// Evidence sanitization removes scripts; reconstruct only the separately
// captured primary inline block and advertised pinned DataTables URL.
const page =
  body("1652594005c7746802defeb872f617f4233ffe5be0fdc80508dbdd07798af279") +
  `<script src="${recipes.autolib.dataTablesUrl}"></script><script>${script}</script>`;
const sample = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../server/test/fixtures/discovery-academic/autolib.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
function row(title, id, format = "Text Book") {
  return [
    id,
    "",
    String(id),
    String(id),
    "",
    title,
    "Author",
    "Subject",
    "Publisher",
    "1",
    "2",
    format,
  ];
}
function mockRequest(payload, html = page) {
  const calls = [];
  return {
    calls,
    request: async (url, options = {}) => {
      url = String(url);
      calls.push({ url, options });
      return {
        url,
        status: 200,
        ok: true,
        headers: new Headers(),
        text: url.endsWith("/getallbook") ? JSON.stringify(payload) : html,
      };
    },
  };
}
test("Autolib smart title filters match the actual advertised DataTables 1.13.5 client offline", () => {
  const dom = new JSDOM(
    '<table id="books"><thead><tr><th>Title</th></tr></thead></table>',
    { runScripts: "outside-only" },
  );
  try {
    for (const sha of [
      recipes.autolib.jqueryEvidenceSha256,
      recipes.autolib.dataTablesEvidenceSha256,
    ]) {
      const js = body(sha);
      assert.equal(createHash("sha256").update(js).digest("hex"), sha);
      dom.window.eval(js);
    }
    const titles = [
      "Wings of Fire",
      "FIRE and WINGS",
      "wings fire",
      "C++ guide",
      "café",
      "cafe",
      "A.B",
      "Cœur &amp; science",
      "A\nB",
      "<b>India</b> history",
      "wings of earth fire",
      'quote "alpha"',
      "“Wings of Fire”",
    ];
    const table = dom.window.jQuery("#books").DataTable({
      data: titles.map((t) => [t]),
      pageLength: 25,
      order: [],
      dom: "t",
    });
    for (const query of [
      "wings fire",
      '"Wings of Fire"',
      "fire wings",
      '"fire wings"',
      "C++",
      "#?",
      "A.B",
      "café",
      "cafe",
      "Cœur & science",
      "“Wings of Fire”",
      "wings  fire",
      "AB",
      "India history",
      '"alpha"',
    ]) {
      table.column(0).search(query).draw();
      assert.deepEqual(
        Array.from(
          table.rows({ search: "applied", order: "applied" }).data(),
          (r) => r[0],
        ),
        titles.filter((t) => autolibSmartMatch(t, query)),
        query,
      );
    }
  } finally {
    dom.window.close();
  }
});
test("Autolib uses the canonical public page, native title control and 25-row source order", async () => {
  const data = {
      data: Array.from({ length: 28 }, (_, i) =>
        row(i % 2 ? "Fire and wings" : "Wings of fire", 9000 - i),
      ),
    },
    mock = mockRequest(data);
  const result = await connectorContext.run(
    { deadlineAt: Date.now() + 120000, request: mock.request },
    () =>
      searchNativeCatalog(
        { academicCatalogId: "autolib-patna:hdjain" },
        "wings fire",
        { offset: 25 },
      ),
  );
  assert.deepEqual(
    mock.calls.map((c) => new URL(c.url).pathname),
    ["/index.php/booksearch", "/index.php/Booksearch/getallbook"],
  );
  assert.equal(result.total, 28);
  assert.equal(result.records.length, 3);
  assert.equal(result.nextOffset, null);
  assert.equal(result.records[0].sourceId, "8975");
  assert.equal(result.records[0].recordIdKind, "native_copy_barcode");
  assert.equal(result.nativeProfile.material, "mixed");
  assert.equal(
    academicFidelity(
      { academicCatalogId: "autolib-patna:hdjain" },
      { url: mock.calls[1].url, text: JSON.stringify(data) },
      result.records,
      result.nativeProfile,
    ).verified,
    true,
  );
  assert.throws(
    () =>
      academicFidelity(
        { academicCatalogId: "autolib-patna:hdjain" },
        { url: mock.calls[1].url, text: JSON.stringify(data) },
        [...result.records].reverse(),
        result.nativeProfile,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
});
test("Autolib changed columns, JS version or inline client remain an open equivalence gap before export", async () => {
  for (const html of [
    page.replace("Book Title", "Article Title"),
    page.replace("/1.13.5/", "/2.0.0/"),
    page.replace("iDisplayLength: 25", "iDisplayLength: 50"),
  ]) {
    const mock = mockRequest(sample(), html);
    await assert.rejects(
      connectorContext.run(
        { deadlineAt: Date.now() + 120000, request: mock.request },
        () =>
          searchNativeCatalog(
            { academicCatalogId: "autolib-patna:hdjain" },
            "Wings",
          ),
      ),
      { code: "EQUIVALENCE_UNPROVEN" },
    );
    assert.equal(mock.calls.length, 1);
  }
  assert.equal(
    autolibContract(
      page.replaceAll("hdjc.autolib.org", "rcsc.autolib.org"),
      "https://rcsc.autolib.org/index.php/booksearch",
    ).pageSize,
    25,
  );
});
test("Autolib preserves copy identities and explicit material without giving copies extra book credit", () => {
  const data = {
    data: [
      row("Physics", 1),
      row("Physics", 2),
      row("Physics review", 3, "Journal"),
      row("Physics unknown", 4, ""),
    ],
  };
  const records = parseAcademicResponse("autolib", data, {
    query: "Physics",
    native: true,
  }).records.map((r) => ({
    ...r,
    recordId: r.sourceId,
    observation: { outcome: "in_catalog" },
  }));
  assert.equal(records.length, 4);
  assert.equal(
    assessBook(records[1], "Physics", [records[0]]).reason,
    "duplicate_book",
  );
  assert.equal(assessBook(records[2], "Physics", []).reason, "not_a_book");
  assert.equal(assessBook(records[3], "Physics", []).formatConfirmed, false);
  assert.deepEqual(
    parseAcademicResponse("autolib", data, {
      query: "unobtainable",
      native: true,
    }).records,
    [],
  );
  data.data[0][2] = "NA";
  assert.throws(
    () =>
      parseAcademicResponse("autolib", data, {
        query: "Physics",
        native: true,
      }),
    { code: "EQUIVALENCE_UNPROVEN" },
  );
  assert.equal(
    parseAcademicResponse("autolib", data, { query: "unknown", native: true })
      .records.length,
    1,
    "An unrelated incomplete barcode cannot invalidate another native title query",
  );
});
test("the app-facing connector search and lookup retain the selected native copy without a false item URL", async () => {
  const mock = mockRequest(
    sample(),
    page.replaceAll("hdjc.autolib.org", "rcsc.autolib.org"),
  );
  const coordinator = new Coordinator({
    minGapMs: 0,
    robots: false,
    fetchImpl: async (url, options) => {
      const r = await mock.request(url, options);
      return new Response(r.text, {
        status: 200,
        headers: {
          "content-type": String(url).endsWith("/getallbook")
            ? "application/json"
            : "text/html",
        },
      });
    },
  });
  const service = new ConnectorService({
    coordinator,
    secret: "test-secret-for-offline-evidence-only",
  });
  const search = await service.search({
    libraryId: "discovery-academic:autolib-patna-rcs",
    query: "wings fire",
  });
  assert.equal(search.fidelity, "website_equivalent");
  assert.equal(search.records.length, 1);
  const detail = await service.resolve(search.records[0].recordRef);
  assert.equal(detail.record.sourceId, "660007300");
  assert.equal(detail.record.title, "AGNIK PANKHI WINGS FIRE");
  assert.equal(detail.record.linkKind, "catalog");
  assert.equal(detail.record.recordId, search.records[0].recordId);
});
