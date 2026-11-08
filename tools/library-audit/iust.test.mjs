import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  fetchNativeIust,
  parseIustDetails,
  iustAuthors,
} from "../../server/services/providers/iustNative.js";
import { searchNativeCatalog } from "../../server/services/providers/discoveryAcademic.js";
import { academicFidelity } from "../../server/services/catalog-connectors/academic-fidelity.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { connectorContext } from "../../server/services/catalog-connectors/context.js";
import { assessBook } from "./runner.mjs";
import { confirmItemIdentity, verifyItemLink } from "./link-verification.mjs";
import recipes from "../../server/services/catalog-connectors/recipe-contracts.json" with { type: "json" };
const fixture = (name) =>
  readFileSync(
    new URL(
      "../../server/test/fixtures/catalog-audit/" + name,
      import.meta.url,
    ),
    "utf8",
  );
const page =
  fixture("iust-native-page.html") +
  '<script src="/Scripts/pagination.js"></script>';
const client = fixture("iust-native-client.js"),
  details = fixture("iust-native-details.html");
const entry = { academicCatalogId: "soul:iust" };
const rows = Array.from({ length: 25 }, (_, i) => ({
  RecID: String(25831 + i),
  Title: i ? "Wings " + i : "Naarae Pakhae (Wings Of fire)",
  Author: "Kalam Abdul .;",
  Publisher: "Publisher",
  Year: "2019",
  isbn: "",
  TypeofMaterial: "Textual Documents",
}));
function mock({ found = "1", js = client, payload = rows } = {}) {
  const calls = [];
  const request = async (url, options = {}) => {
    const u = new URL(url);
    calls.push({ url: u.toString(), options });
    const result = u.pathname === "/result.aspx",
      text = result
        ? page
        : u.pathname === "/Scripts/pagination.js"
          ? js
          : u.pathname === "/ViewDetails.aspx"
            ? details
            : JSON.stringify(payload);
    return {
      url: u.toString(),
      text,
      ok: true,
      status: 200,
      headers: new Headers(
        result ? { "set-cookie": "dtfound=" + found + "; Path=/" } : {},
      ),
    };
  };
  const read = Object.assign(request, { cookie: () => found });
  return { calls, read, request };
}
test("IUST primary client hash, default twenty-row source order and displayed author transformation are retained", async () => {
  assert.equal(
    createHash("sha256").update(client).digest("hex"),
    recipes.iust.clientSha256,
  );
  assert.deepEqual(iustAuthors("One;Two;"), ["One", "Two"]);
  const m = mock();
  const result = await connectorContext.run(
    { request: m.request, deadlineAt: Date.now() + 120000 },
    () => searchNativeCatalog(entry, "Wings", { offset: 20 }),
  );
  assert.deepEqual(
    result.records.map((r) => r.sourceId),
    ["25851", "25852", "25853", "25854", "25855"],
  );
  assert.equal(result.total, 25);
  assert.equal(result.nextOffset, null);
  assert.deepEqual(result.records[0].authors, ["Kalam Abdul ."]);
  const url = new URL(m.calls[0].url);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    cmbval: "Title",
    search: "Wings",
    RDB: "Contains",
    Typemate: "All",
    colltype: "All",
  });
  assert.equal(m.calls.length, 3);
  const fidelity = academicFidelity(
    entry,
    { url: m.calls.at(-1).url, text: JSON.stringify(rows) },
    result.records,
    result.nativeProfile,
  );
  assert.equal(fidelity.verified, true);
  assert.throws(
    () =>
      academicFidelity(
        entry,
        { url: m.calls.at(-1).url, text: JSON.stringify(rows) },
        [...result.records].reverse(),
        result.nativeProfile,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.equal(
    assessBook(result.records[0], "Wings", []).formatConfirmed,
    false,
  );
  assert.equal(result.records[0].linkKind, "metadata_fragment");
});
test("IUST refuses changed native clients, unsupported paging and unknown search-cookie state before loading results", async () => {
  for (const options of [{ js: client + " changed" }, { found: "unknown" }]) {
    const m = mock(options);
    await assert.rejects(
      fetchNativeIust({ url: "https://webopac.iust.ac.in" }, "Wings", m.read),
      { code: "EQUIVALENCE_UNPROVEN" },
    );
    assert.equal(
      m.calls.some((c) => c.url.includes("EmployeeDataHandler")),
      false,
    );
  }
  const m = mock();
  await assert.rejects(
    fetchNativeIust({ url: "https://webopac.iust.ac.in" }, "Wings", m.read, 10),
    { code: "UNSUPPORTED_PROFILE" },
  );
});
test("native no-data cookie avoids the stale session handler and is distinct from an unknown result", async () => {
  const m = mock({ found: "0" }),
    result = await fetchNativeIust(
      { url: "https://webopac.iust.ac.in" },
      "No match",
      m.read,
    );
  assert.deepEqual(result.payload, []);
  assert.equal(result.nativePage.emptyFromNativeCookie, true);
  assert.equal(m.calls.length, 2);
  assert.equal(
    academicFidelity(
      entry,
      { url: "https://webopac.iust.ac.in/Scripts/pagination.js", text: client },
      [],
      result.nativePage,
    ).verified,
    true,
  );
});
test("each IUST book requires its own matching native ID/title and monograph MARC leader; serials and missing leaders do not pass", () => {
  const record = {
    sourceId: "25831",
    recordId: "a",
    title: rows[0].Title,
    authors: ["Kalam Abdul ."],
    format: "Textual Documents",
    materialTypeProofPending: true,
    observation: { outcome: "in_catalog" },
  };
  assert.equal(assessBook(record, "Wings", []).formatConfirmed, false);
  const book = parseIustDetails(details, record);
  assert.equal(book.materialType, "Monograph");
  assert.equal(assessBook(book, "Wings", []).formatConfirmed, true);
  assert.throws(() => parseIustDetails(details, { ...record, sourceId: "2" }), {
    code: "CATALOG_HOLDING_UNCONFIRMED",
  });
  assert.throws(
    () => parseIustDetails(details, { ...record, title: "Other" }),
    { code: "CATALOG_HOLDING_UNCONFIRMED" },
  );
  const serial = parseIustDetails(
    details.replace("nam a22", "nas a22"),
    record,
  );
  assert.equal(assessBook(serial, "Wings", []).reason, "not_a_book");
  assert.equal(
    assessBook(
      parseIustDetails(details.replace("nam a22", "n?? a22"), record),
      "Wings",
      [],
    ).formatConfirmed,
    false,
  );
});
test("actual audit service resolves native details and retains metadata-fragment kind without app publication changes", async () => {
  const m = mock({ payload: [rows[0]] });
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      const r = await m.request(url, options);
      return new Response(r.text, {
        status: 200,
        headers: {
          "content-type": String(url).includes("EmployeeDataHandler")
            ? "application/json"
            : "text/html",
          ...Object.fromEntries(r.headers),
        },
      });
    },
  });
  const service = new ConnectorService({
    coordinator,
    secret: "iust-test-signing-secret-is-at-least-32-characters",
  });
  const result = await service.search({
    libraryId: "discovery-academic:soul-iust",
    query: "Wings",
    field: "title",
  });
  assert.equal(result.fidelityCheck.verified, true);
  const resolved = await service.resolve(result.records[0].recordRef);
  assert.equal(resolved.record.materialType, "Monograph");
  assert.equal(resolved.record.linkKind, "metadata_fragment");
  assert.equal(
    resolved.record.observation.catalogLinkKind,
    "metadata_fragment",
  );
  assert.equal(m.calls.filter((c) => c.url.includes("ViewDetails")).length, 1);
});
test("governed IUST fragment links verify native ID and labelled title while preserving the actual link kind", async () => {
  const job = {
    jobId: "j",
    libraryId: "discovery-academic:soul-iust",
    recordId: "r",
    nativeId: "25831",
    title: rows[0].Title,
    url: "https://webopac.iust.ac.in/ViewDetails.aspx?ID=25831",
    kind: "metadata_fragment",
  };
  assert.equal(
    confirmItemIdentity(job, { url: job.url, text: details }).identityConfirmed,
    true,
  );
  assert.equal(
    confirmItemIdentity(
      { ...job, nativeId: "2" },
      { url: job.url, text: details },
    ).identityConfirmed,
    false,
  );
  assert.equal(
    confirmItemIdentity(job, {
      url: job.url,
      text: "<h1>" + job.title + "</h1>",
    }).identityConfirmed,
    false,
  );
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async () =>
      new Response(details, { headers: { "content-type": "text/html" } }),
  });
  const result = await verifyItemLink(job, coordinator, {
    origins: ["https://webopac.iust.ac.in"],
  });
  assert.equal(result.tested, true);
  assert.equal(result.identityConfirmed, true);
  assert.equal(result.linkKind, "metadata_fragment");
});
