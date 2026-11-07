import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  rejectChallenge,
  parseAcademicResponse,
} from "../../server/services/providers/discoveryAcademicParsers.js";
import { parseExpandedKohaCatalogSearch } from "../../server/services/providers/koha.js";
import { verifyNativePage } from "../../server/services/catalog-connectors/fidelity.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { assessBook } from "./runner.mjs";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import { searchNativeCatalog as academicSearch } from "../../server/services/providers/discoveryAcademic.js";
import { getProvider } from "../../server/services/providers/index.js";
import { nativeAcademicPage } from "../../server/services/providers/discoveryAcademic.js";
import { academicFidelity } from "../../server/services/catalog-connectors/academic-fidelity.js";
import recipes from "../../server/services/catalog-connectors/recipe-contracts.json" with { type: "json" };

const fixture = (name) =>
  readFileSync(
    new URL(
      "../../server/test/fixtures/catalog-audit/" + name,
      import.meta.url,
    ),
    "utf8",
  );

test("SRMS native recipe retains the captured public client and all ten operator mappings", () => {
  assert.equal(
    createHash("sha256").update(fixture("srms-title-client.js")).digest("hex"),
    recipes.srms.clientSha256,
  );
  const colleges = JSON.parse(fixture("srms-public-colleges.json"));
  const configs = JSON.parse(
    readFileSync(
      new URL(
        "../../server/services/providers/discoveryAcademicConfigs.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const normalized = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const srms = Object.values(configs).filter((c) => c.kind === "srms");
  assert.equal(srms.length, 10);
  for (const config of srms) {
    const row = colleges.find((c) => c.colg_cd === config.collegeId);
    assert.ok(row, config.collegeId);
    assert.equal(normalized(row.college), normalized(config.name));
  }
  assert.match(fixture("srms-title-client.js"), /searchbookbytitle/);
  assert.match(fixture("srms-title-client.js"), /category == 'Title'/);
});

test("SRMS native oracle verifies ten-row client pages and rejects clipping or reordering", () => {
  const raw = Array.from({ length: 23 }, (_, i) => ({
    title: `Mathematics ${i + 1}`,
    author_name: `Author ${i + 1}`,
  }));
  const parsed = parseAcademicResponse("srms", raw, { native: true }).records;
  const entry = { academicCatalogId: "srms:1" },
    response = {
      url: "https://myportal.srms.ac.in/Library/OPACPanel/searchbookbytitle",
      text: JSON.stringify(raw),
    };
  for (const offset of [0, 10, 20]) {
    const page = nativeAcademicPage("srms", parsed, offset);
    assert.equal(page.records.length, Math.min(10, raw.length - offset));
    assert.equal(
      academicFidelity(entry, response, page.records, page.nativePage).verified,
      true,
    );
    if (page.records.length > 1)
      assert.throws(
        () =>
          academicFidelity(
            entry,
            response,
            [...page.records].reverse(),
            page.nativePage,
          ),
        { code: "FIDELITY_MISMATCH" },
      );
    assert.throws(
      () =>
        academicFidelity(
          entry,
          response,
          page.records.slice(1),
          page.nativePage,
        ),
      { code: "FIDELITY_MISMATCH" },
    );
  }
  assert.equal(
    academicFidelity(entry, { ...response, text: "[]" }, [], { offset: 0 })
      .verified,
    true,
  );
});

test("native SRMS title requests retain literal input, selected college and page order", async () => {
  const raw = Array.from({ length: 21 }, (_, i) => ({
      title: `Constitution ${i + 1}`,
      author_name: "Author",
    })),
    calls = [];
  const context = {
    deadlineAt: Date.now() + 120000,
    request: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        url: String(url),
        ok: true,
        status: 200,
        headers: new Headers(),
        text: JSON.stringify(raw),
      };
    },
  };
  const result = await connectorContext.run(context, () =>
    academicSearch({ academicCatalogId: "srms:4" }, "Constitution", {
      offset: 10,
    }),
  );
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, recipes.srms.request.path);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    searchvalue: "Constitution",
    colg: "4",
  });
  assert.equal(result.records[0].title, "Constitution 11");
  assert.equal(result.records.length, 10);
  assert.equal(result.nextOffset, 20);
  assert.equal(result.nativeProfile.material, "Books");
});

test("a catalog-only native library can resolve its own book without changing app availability flags", async () => {
  const entry = {
    id: "koha:metadata-only",
    name: "Metadata library",
    platform: "koha",
    baseUrl: "https://library.cutn.ac.in",
    catalogUrl: "https://library.cutn.ac.in",
    capabilities: ["catalogSearch"],
  };
  assert.equal(getProvider(entry), null);
  const detail =
    '<h1 class="title">Introduction to algorithms</h1>' +
    fixture("../koha/cutn-record.html");
  const search =
    '<body id="results"><h1>Your search returned 1 result.</h1><a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=22365">Introduction to algorithms</a></body>';
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url) =>
      new Response(String(url).includes("opac-search.pl") ? search : detail),
  });
  const service = new ConnectorService({
    coordinator,
    secret: "test".repeat(8),
    lookup: () => entry,
  });
  const page = await service.search({
    libraryId: entry.id,
    query: "algorithms",
  });
  const result = await service.resolve(page.records[0].recordRef);
  assert.equal(result.record.recordId, "22365");
  assert.ok(result.record.title.toLowerCase().includes("algorithms"));
  assert.ok(
    ["available", "in_catalog", "none_available"].includes(
      result.record.observation.outcome,
    ),
  );
  assert.equal(
    getProvider(entry),
    null,
    "app publication and borrowing capabilities remain unchanged",
  );
});

test("multi-request academic searches use their governed deadline so provider crawl delays fit", async () => {
  const deadlineAt = Date.now() + 120000,
    calls = [];
  const context = {
    deadlineAt,
    request: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      assert.equal(options.deadlineAt, deadlineAt);
      assert.ok(options.deadlineAt - Date.now() > 100000);
      return {
        url: String(url),
        status: 200,
        ok: true,
        headers: new Headers(),
        text:
          options.method === "POST"
            ? fixture("../discovery-academic/librarika.html")
            : fixture("librarika-bncollege-landing.html"),
      };
    },
  };
  const result = await connectorContext.run(context, () =>
    academicSearch({ academicCatalogId: "librarika:bncollege" }, "Organic"),
  );
  assert.equal(result.records.length, 10);
  assert.deepEqual(
    calls.map((c) => c.options.method || "GET"),
    ["GET", "POST"],
  );
  assert.equal(
    new URLSearchParams(calls[1].options.body).get("data[Filter][q]"),
    "Organic",
  );
  assert.equal(
    new URLSearchParams(calls[1].options.body).get(
      "data[Filter][media_type_id]",
    ),
    "1",
  );
});

test("BN College saved landing is a public search form, not proof that a search succeeded or failed", () => {
  const html = fixture("librarika-bncollege-landing.html");
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "636134fdd614fd07f0d1a9e60f36d5745a3bcd6dff340e37778ae93edcf8acd6",
  );
  assert.match(html, /id="FilterIndexForm"/);
  assert.match(html, /name="data\[Filter\]\[q\]"/);
  assert.doesNotThrow(() => rejectChallenge(html));
  // A landing page alone cannot be turned into a successful/empty result.
  assert.throws(() => parseAcademicResponse("librarika", html), {
    code: "CATALOG_UNRECOGNIZED",
  });
});

test("ordinary CAPTCHA loaders and bibliography words do not assert a denied request", () => {
  for (const html of [
    '<title>Catalog Search</title><script src="https://www.google.com/recaptcha/api.js"></script><form id="FilterIndexForm"><input name="data[Filter][q]"></form>',
    "<title>Library results</title><table><tr><td>CAPTCHA Recognition and Computer Vision</td></tr></table>",
    "<title>Library results</title><style>.captcha-hidden { display:none }</style><p>Just a moment in history</p>",
  ])
    assert.doesNotThrow(() => rejectChallenge(html));
});

test("real challenges and active CAPTCHA controls remain blocked", () => {
  for (const html of [
    "<title>Just a moment…</title>",
    '<script src="/cdn-cgi/challenge-platform/x"></script>',
    '<div id="cf-chl-widget"></div>',
    '<title>Catalog</title><form><div class="g-recaptcha" data-sitekey="public-key"></div></form>',
    '<title>Catalog</title><textarea name="g-recaptcha-response"></textarea>',
    '<title>Catalog</title><input name="txt_captcha">',
    '<title>Catalog</title><iframe src="/verify" class="h-captcha"></iframe>',
    "<h1>Verify you are human</h1><p>Please continue the check.</p>",
    "Checking your browser before proceeding",
  ])
    assert.throws(() => rejectChallenge(html), {
      code: "CATALOG_PROVIDER_BLOCKED",
    });
  assert.throws(() => rejectChallenge("<title>Access denied</title>"), {
    code: "CATALOG_UNAVAILABLE",
  });
});

test("CMD native MARC result links retain the same ordered public bibliographic identities", () => {
  const html = fixture("cmd-koha-marc-search.html");
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "ffd0655082dfbfd19affc025905df702ecb7e1919238a86a005e4549a7472633",
  );
  const url = new URL(
    "https://opac.cmd.kerala.gov.in/cgi-bin/koha/opac-search.pl?idx=kw&q=History",
  );
  const records = parseExpandedKohaCatalogSearch(html, url, Infinity);
  assert.equal(records.length, 20);
  assert.equal(records[0].recordId, "1478");
  assert.equal(
    records[0].title,
    "Social, cultural and economic history of India",
  );
  assert.equal(
    verifyNativePage(
      "koha",
      [{ url: url.toString(), status: 200, text: html }],
      records,
    ).verified,
    true,
  );
  assert.throws(
    () =>
      verifyNativePage(
        "koha",
        [{ url: url.toString(), status: 200, text: html }],
        records.slice(1),
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  // Extracting a native result is not a resolved holding or a twenty-book pass.
  assert.ok(records.every((record) => !record.observation));
});

test("MARC link support preserves strict same-origin and unique-ID validation", () => {
  const url = new URL(
    "https://library.example/cgi-bin/koha/opac-search.pl?idx=kw&q=History",
  );
  for (const href of [
    "https://elsewhere.example/cgi-bin/koha/opac-MARCdetail.pl?biblionumber=1",
    "/cgi-bin/koha/opac-MARCdetail.pl?biblionumber=1&biblionumber=2",
    "/cgi-bin/koha/opac-MARCdetail.pl?biblionumber=bad",
    "/other/opac-MARCdetail.pl?biblionumber=1",
  ])
    assert.throws(
      () =>
        parseExpandedKohaCatalogSearch(
          `<body id="results"><a href="${href}" class="title">History</a></body>`,
          url,
          Infinity,
        ),
      { code: "CATALOG_UNRECOGNIZED" },
    );
});

test("untitled native Koha rows remain visible as rejected metadata, never invented or counted as books", async () => {
  const html = fixture("bhatkhande-empty-titles.html");
  assert.equal(
    createHash("sha256").update(html).digest("hex"),
    "77b95dfdd2d050489afe9f61237a6fc1af74c44bf291cd2ffb468a2353e43944",
  );
  const entry = {
    id: "koha:bhatkhande",
    platform: "koha",
    slug: "bhatkhande",
    name: "Bhatkhande Sanskriti Vishwavidyalaya Library",
    country: "IN",
    baseUrl: "https://library.bhatkhandeuniversity.ac.in",
    catalogUrl: "https://library.bhatkhandeuniversity.ac.in",
    capabilities: ["availability"],
  };
  const service = new ConnectorService({
    coordinator: new Coordinator({
      robots: false,
      minGapMs: 0,
      fetchImpl: async () => new Response(html),
    }),
    secret: "test".repeat(8),
    lookup: () => entry,
  });
  const result = await service.search({
    libraryId: entry.id,
    query: "The Discovery of India",
  });
  assert.equal(result.fidelity, "website_equivalent");
  assert.equal(result.records.length, 19);
  const empty = result.records.filter((r) =>
    r.metadataWarnings?.includes("missing_title"),
  );
  assert.deepEqual(
    empty.map((r) => r.recordId),
    ["11517", "12052"],
  );
  assert.ok(empty.every((r) => r.title === ""));
  assert.ok(
    empty.every(
      (r) => assessBook(r, "The Discovery of India", []).accepted === false,
    ),
  );
  const url = new URL(
    entry.baseUrl +
      "/cgi-bin/koha/opac-search.pl?idx=kw&q=The+Discovery+of+India",
  );
  assert.equal(
    parseExpandedKohaCatalogSearch(html, url, Infinity).length,
    17,
    "ordinary app parser does not display invented titles",
  );
  const invented = result.records.map((r, i) =>
    i ? r : { ...r, title: "", metadataWarnings: ["missing_title"] },
  );
  assert.throws(
    () =>
      verifyNativePage(
        "koha",
        [{ url: url.toString(), status: 200, text: html }],
        invented,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.throws(
    () =>
      verifyNativePage(
        "koha",
        [{ url: url.toString(), status: 200, text: html }],
        result.records.filter((r) => r.title),
      ),
    { code: "FIDELITY_MISMATCH" },
  );
});
