import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { run } from "./runner.mjs";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { parseIndcatSearch } from "../../server/services/providers/indcat.js";
import { verifyNativePage } from "../../server/services/catalog-connectors/fidelity.js";
import { revalidationAttemptKey } from "./revalidation-plans.mjs";
import { confirmItemIdentity } from "./link-verification.mjs";
import { recordUrl } from "../../server/services/providers/indcat.js";
const fixture = (name) =>
  readFileSync(
    new URL(
      "../../server/test/fixtures/catalog-audit/" + name,
      import.meta.url,
    ),
    "utf8",
  );
const titlePage = fixture("indcat-barkhetri-title-chemistry.html"),
  missingPage = fixture("indcat-barkhetri-allfields-missing.html");
const code = "BARK_781126",
  entry = { indcatInstitutionCode: code };
test("saved IndCat native Title query exposes eight real scoped record links; count-only All-fields response remains unresolved", () => {
  const parsed = parseIndcatSearch(titlePage, code, Infinity);
  assert.equal(parsed.total, 8);
  assert.equal(parsed.records.length, 8);
  assert.deepEqual(
    parsed.records.map((r) => r.recordId),
    [
      "24736726",
      "24736731",
      "24736727",
      "24736735",
      "24736739",
      "24736728",
      "24736730",
      "24736738",
    ],
  );
  assert.ok(
    parsed.records.every(
      (r) =>
        r.catalogUrl.includes("/search/book_search?getDetails=") &&
        r.linkKind === "record",
    ),
  );
  const profile = { field: "title", query: "Chemistry" };
  assert.equal(
    verifyNativePage(
      "indcat",
      [
        {
          url: "https://indcat.inflibnet.ac.in/index.php/search/checkuniv",
          status: 200,
          text: titlePage,
        },
      ],
      parsed.records,
      entry,
      profile,
    ).verified,
    true,
  );
  assert.throws(
    () =>
      verifyNativePage(
        "indcat",
        [
          {
            url: "https://indcat.inflibnet.ac.in/index.php/search/checkuniv",
            status: 200,
            text: titlePage.replace(
              'value="title" selected=selected',
              'value="title"',
            ),
          },
        ],
        parsed.records,
        entry,
        profile,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.throws(
    () =>
      verifyNativePage(
        "indcat",
        [
          {
            url: "https://indcat.inflibnet.ac.in/index.php/search/checkuniv",
            status: 200,
            text: titlePage,
          },
        ],
        parsed.records,
        entry,
        { ...profile, query: "Physics" },
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.throws(
    () => parseIndcatSearch(missingPage, code, Infinity),
    /Missing catalog records/,
  );
});
test("actual service forwards explicit IndCat Title field and native blank page control without changing keyword semantics", async () => {
  const calls = [];
  const home = titlePage.replace(
    "[form state omitted]",
    '<input type="hidden" name="csrf_test_name" value="fixtureStateIsNotACredential12345">',
  );
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      const posted = options.method === "POST",
        fields = new URLSearchParams(options.body);
      return new Response(
        posted
          ? fields.get("field") === "title"
            ? titlePage
            : missingPage
          : home,
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const service = new ConnectorService({
    coordinator,
    secret: "indcat-fixture-signing-secret-length-at-least-32",
  });
  const result = await service.search({
    libraryId: "indcat:indcat-bark-781126",
    query: "Chemistry",
    field: "title",
  });
  assert.equal(result.fidelity, "website_equivalent");
  assert.equal(result.records.length, 8);
  assert.equal(result.effectiveProfile.nativeProfile.field, "title");
  const body = new URLSearchParams(
    calls.find((c) => c.options.method === "POST").options.body,
  );
  assert.equal(body.get("part_uni"), code);
  assert.equal(body.get("field"), "title");
  assert.equal(body.get("title"), "Chemistry");
  assert.equal(body.get("cPageNo"), "");
  assert.ok(
    result.records.every(
      (r) =>
        r.linkKind === "record" &&
        r.catalogUrl.includes("/search/book_search?getDetails="),
    ),
  );
  await assert.rejects(
    service.search({
      libraryId: "indcat:indcat-bark-781126",
      query: "Chemistry",
      field: "keyword",
    }),
    /Missing catalog records/,
  );
});
test("changing a planned search field creates a new attempt while its review timestamp does not", () => {
  const plan = { queries: ["Chemistry"], field: "title" };
  assert.notEqual(
    revalidationAttemptKey("x", "impl", plan),
    revalidationAttemptKey("x", "impl", { ...plan, field: "keyword" }),
  );
  assert.equal(
    revalidationAttemptKey("x", "impl", plan),
    revalidationAttemptKey("x", "impl", { ...plan, reviewedAt: "later" }),
  );
});
test("shared runner keeps per-library Title plans separate from another library keyword search", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "indcat-field-plan-")),
    store = new EvidenceStore(root);
  store.acquire();
  t.after(() => {
    store.release();
    rmSync(root, { recursive: true, force: true });
  });
  const libraries = ["one", "two"].map((libraryId) => ({
    libraryId,
    name: libraryId,
    country: "IN",
    connections: [
      { connectionId: "primary", family: "indcat", mode: "native_http" },
    ],
  }));
  store.save("manifest.json", {
    target: 20,
    inventory: { libraries, total: 2, inventoryHash: hash(libraries) },
  });
  const calls = [],
    service = {
      implementationHash: "fixture",
      search: async (input) => {
        calls.push(input);
        return {
          records: [],
          fidelity: "website_equivalent",
          observationKind: "fixture",
          effectiveProfile: input,
          total: { value: 0 },
          page: { hasMore: false },
          freshness: { sourceContacted: true },
          evidence: [],
        };
      },
    };
  await run(store, service, {
    mode: "health",
    queries: ["Chemistry"],
    field: "keyword",
    fieldsByLibrary: { one: "title" },
    allowFixtureEvidence: true,
  });
  assert.deepEqual(
    calls.map((c) => [c.libraryId, c.field]),
    [
      ["one", "title"],
      ["two", "keyword"],
    ],
  );
});
test("IndCat item checks decode the native book/member URL and require the actual scoped detail, not a generic HTTP200 page", () => {
  const html = readFileSync(
    new URL(
      "../../server/test/fixtures/indcat/abhayapuri-record.html",
      import.meta.url,
    ),
    "utf8",
  );
  const url = recordUrl("ABHA_783384", "24736067"),
    job = {
      libraryId: "indcat:indcat-abha-783384",
      connectionId: "primary",
      nativeId: "24736067",
      title: "Fundamentals of Computers",
      url,
      kind: "record",
    };
  assert.equal(
    confirmItemIdentity(job, { url, text: html }).identityConfirmed,
    true,
  );
  assert.equal(
    confirmItemIdentity(job, { url, text: "<h1>Catalog</h1>" })
      .identityConfirmed,
    false,
  );
  assert.equal(
    confirmItemIdentity(
      { ...job, url: recordUrl("AMIT_303002", "24736067") },
      { url: recordUrl("AMIT_303002", "24736067"), text: html },
    ).identityConfirmed,
    false,
  );
  assert.equal(
    confirmItemIdentity(job, {
      url,
      text: html.replaceAll("bk_24736067", "bk_2"),
    }).identityConfirmed,
    false,
  );
});
