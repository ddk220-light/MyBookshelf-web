import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  easylibPageSize,
  fetchNativeEasylib,
} from "../../server/services/providers/easylibNative.js";
import {
  searchNativeCatalog,
  parseAcademicResponse,
} from "../../server/services/providers/discoveryAcademic.js";
import { academicFidelity } from "../../server/services/catalog-connectors/academic-fidelity.js";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import { assessBook } from "./runner.mjs";
import recipes from "../../server/services/catalog-connectors/recipe-contracts.json" with { type: "json" };
const fixture = (name) =>
  readFileSync(
    new URL("../../server/test/fixtures/" + name, import.meta.url),
    "utf8",
  );
const client = fixture("catalog-audit/easylib-native-client.js");
// Runtime evidence removes script elements. Restore only the public URL
// separately retained in website_client_contract_captured.sameOriginScriptLeads.
const page =
  fixture("catalog-audit/easylib-native-page.html") +
  '<script src="https://sjccb.easylib.net/assets/js/homepage/OpacHomeSearchResults.js"></script>';
const payload = () => JSON.parse(fixture("discovery-academic/easylib.json"));
function requestMock(data, { html = page, js = client } = {}) {
  const calls = [];
  return {
    calls,
    request: async (url, options = {}) => {
      const u = new URL(url);
      calls.push({ url: u.toString(), options });
      const body = u.pathname.endsWith("/searchResultPage")
        ? html
        : u.pathname.endsWith(".js")
          ? js
          : JSON.stringify(data);
      return {
        url: u.toString(),
        ok: true,
        status: 200,
        headers: new Headers(),
        text: body,
      };
    },
  };
}
test("saved Easylib primary client binds the recipe; offered defaults and duplicate controls match native lookup", () => {
  assert.equal(
    createHash("sha256").update(client).digest("hex"),
    recipes.easylib.clientSha256,
  );
  assert.equal(easylibPageSize(page), 5);
  const select =
    '<select id="dropDownOfRowsPerPage"><option value="5">5</option><option selected value="25">25</option></select>';
  assert.equal(easylibPageSize(select + page), 25);
  assert.throws(() => easylibPageSize('<select id="other"></select>'), {
    code: "EQUIVALENCE_UNPROVEN",
  });
});
test("native Easylib sends the actual keyword, five-row offset and omitted empty filters", async () => {
  const data = payload();
  data.search = "Wings + #";
  data.recordsFiltered = 12;
  const mock = requestMock(data);
  const result = await connectorContext.run(
    { deadlineAt: Date.now() + 120000, request: mock.request },
    () =>
      searchNativeCatalog({ academicCatalogId: "easylib:sjccb" }, data.search, {
        offset: 5,
      }),
  );
  assert.equal(mock.calls.length, 3);
  assert.equal(mock.calls[2].options.method, "POST");
  const form = Object.fromEntries(
    new URLSearchParams(mock.calls[2].options.body),
  );
  assert.deepEqual(form, {
    search: "Wings + #",
    pageId: "2",
    start: "5",
    length: "5",
  });
  assert.equal(result.nativeProfile.field, "keyword");
  assert.equal(result.nativeProfile.material, "mixed");
  assert.equal(result.nextOffset, 10);
  assert.equal(result.total, 12);
  assert.equal(result.records[0].sourceId, "025629");
  assert.equal(
    new URL(result.records[0].catalogUrl).searchParams.get("tlno"),
    "025629",
  );
  assert.equal(
    new URL(result.records[0].catalogUrl).searchParams.get("search"),
    data.search,
  );
  assert.equal(
    academicFidelity(
      { academicCatalogId: "easylib:sjccb" },
      { url: mock.calls[2].url, text: JSON.stringify(data) },
      result.records,
      result.nativeProfile,
    ).verified,
    true,
  );
});
test("changed Easylib clients or controls stop before a query is sent; off-origin clients are never fetched", async () => {
  for (const options of [
    { js: client + "\n// changed client" },
    {
      html: page.replaceAll(
        "/assets/js/homepage/OpacHomeSearchResults.js",
        "https://unreviewed.example/OpacHomeSearchResults.js",
      ),
    },
  ]) {
    const mock = requestMock(payload(), options);
    await assert.rejects(
      fetchNativeEasylib(
        { url: "https://sjccb.easylib.net/" },
        "Wings",
        mock.request,
      ),
      { code: "EQUIVALENCE_UNPROVEN" },
    );
    assert.ok(mock.calls.every((c) => !c.options.method));
    assert.ok(
      mock.calls.every((c) => new URL(c.url).hostname === "sjccb.easylib.net"),
    );
  }
  const mock = requestMock(payload());
  await assert.rejects(
    fetchNativeEasylib(
      { url: "https://sjccb.easylib.net/" },
      "Wings",
      mock.request,
      3,
    ),
    { code: "UNSUPPORTED_PROFILE" },
  );
  assert.equal(mock.calls.length, 1);
});

test("reviewed Easylib client variants preserve the request, native identity and order contract", async () => {
  for (const variant of recipes.easylib.reviewedClientVariants) {
    const js = readFileSync(
      new URL(
        `../../docs/research/india-library-audit/revalidation/20261107/bodies/${variant.sha256}.txt`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(createHash("sha256").update(js).digest("hex"), variant.sha256);
    const data = payload(),
      mock = requestMock(data, { js });
    const result = await connectorContext.run(
      { deadlineAt: Date.now() + 120000, request: mock.request },
      () =>
        searchNativeCatalog({ academicCatalogId: "easylib:sjccb" }, "Wings"),
    );
    assert.equal(result.nativeProfile.clientSha256, variant.sha256);
    assert.equal(result.records[0].sourceId, "025629");
    assert.equal(
      academicFidelity(
        { academicCatalogId: "easylib:sjccb" },
        { url: mock.calls[2].url, text: JSON.stringify(data) },
        result.records,
        result.nativeProfile,
      ).verified,
      true,
    );
  }
});

test("unreviewed JavaScript widget templates are a client-contract gap, not a demonstrated access challenge", async () => {
  const mock = requestMock(payload(), {
    js:
      client + "\nconst unusedTemplate = '<div class=\"g-recaptcha\"></div>';",
  });
  const request = async (url, options) => {
    const response = await mock.request(url, options);
    if (new URL(url).pathname.endsWith(".js"))
      response.headers.set("content-type", "application/javascript");
    return response;
  };
  await assert.rejects(
    connectorContext.run({ deadlineAt: Date.now() + 120000, request }, () =>
      searchNativeCatalog({ academicCatalogId: "easylib:sjccb" }, "Wings"),
    ),
    { code: "EQUIVALENCE_UNPROVEN" },
  );
  assert.equal(mock.calls.length, 2);
});
test("Easylib fidelity rejects wrong query, changed native IDs, clipping and reordered rows", () => {
  const data = payload(),
    records = parseAcademicResponse("easylib", data, {
      query: "Wings",
      native: true,
    }).records;
  const response = {
      url: "https://sjccb.easylib.net/index.php/OpacController/advancedSearchFunc",
      text: JSON.stringify(data),
    },
    profile = {
      offset: 0,
      pageSize: 5,
      query: "Wings",
      clientSha256: recipes.easylib.clientSha256,
    };
  assert.equal(
    academicFidelity(
      { academicCatalogId: "easylib:sjccb" },
      response,
      records,
      profile,
    ).verified,
    true,
  );
  for (const modified of [
    records.slice(1),
    [...records].reverse(),
    records.map((r, i) => (i ? r : { ...r, sourceId: "wrong" })),
  ])
    assert.throws(
      () =>
        academicFidelity(
          { academicCatalogId: "easylib:sjccb" },
          response,
          modified,
          profile,
        ),
      { code: "FIDELITY_MISMATCH" },
    );
  assert.throws(
    () =>
      academicFidelity(
        { academicCatalogId: "easylib:sjccb" },
        response,
        records,
        { ...profile, query: "Other" },
      ),
    { code: "FIDELITY_MISMATCH" },
  );
});
test("mixed Easylib materials remain explicit; journals and unknown formats cannot gain book proof", () => {
  const data = payload();
  data.realdata[0].Fld_NB_Type = "Journal";
  delete data.realdata[1].Fld_NB_Type;
  const records = parseAcademicResponse("easylib", data, {
    query: "Wings",
    native: true,
  }).records.map((r) => ({
    ...r,
    recordId: r.sourceId,
    observation: { outcome: "in_catalog" },
  }));
  assert.equal(assessBook(records[0], "Wings", []).reason, "not_a_book");
  assert.equal(assessBook(records[1], "Wings", []).formatConfirmed, false);
  const empty = requestMock({
    search: "Wings",
    realdata: [],
    recordsFiltered: 0,
    recordsTotal: 0,
  });
  return connectorContext.run(
    { deadlineAt: Date.now() + 120000, request: empty.request },
    async () => {
      const result = await searchNativeCatalog(
        { academicCatalogId: "easylib:sjccb" },
        "Wings",
      );
      assert.equal(result.records.length, 0);
      assert.equal(result.hasMore, false);
      assert.equal(result.nextOffset, null);
    },
  );
});
