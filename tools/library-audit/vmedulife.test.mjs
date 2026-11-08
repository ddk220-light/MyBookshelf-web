import test from "node:test";
import request from "supertest";
import { createConnectorApi } from "../../server/services/catalog-connectors/api.js";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getLibraryById } from "../../server/services/directory.js";
import {
  VMEDU_CLIENT,
  catalogNativeProfile,
  parseVmeduSearch,
  parseVmeduRecord,
  vmeduSearchParameters,
} from "../../server/services/providers/catalogNative.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { describe } from "../../server/services/catalog-connectors/inventory.js";
import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { catalogFidelity } from "../../server/services/catalog-connectors/catalog-fidelity.js";
import { run, assessBook } from "./runner.mjs";
import { buildLinkQueue, verifyItemLink } from "./link-verification.mjs";
const root = new URL(
    "../../docs/research/india-library-audit/revalidation/20261107/",
    import.meta.url,
  ),
  provenance = JSON.parse(
    readFileSync(
      new URL(
        "prepared-repairs/shared-native-methods/vmedulife-fixture-provenance.json",
        root,
      ),
      "utf8",
    ),
  );
const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(provenance.find((p) => p.name === name).evidence.path, root),
      "utf8",
    ),
  );
const client = readFileSync(
  new URL("bodies/" + VMEDU_CLIENT.sha256 + ".txt", root),
  "utf8",
);
const entry = getLibraryById("catalog:adhiparasakthi-kalavai"),
  scott = getLibraryById("catalog:scott-christian-nagercoil");
function mockTransport({
  changedClient = false,
  wrongScope = false,
  search = fixture("apce-search"),
} = {}) {
  const calls = [];
  const coordinator = new Coordinator({
    robots: false,
    minGapMs: 0,
    fetchImpl: async (url, options) => {
      const u = new URL(url),
        fields =
          options.body instanceof FormData
            ? Object.fromEntries(options.body)
            : null,
        parameters = fields
          ? JSON.parse(Buffer.from(fields.data, "base64").toString("utf8"))
          : null;
      calls.push({ url: String(url), fields, parameters });
      if (u.pathname === VMEDU_CLIENT.page)
        return new Response(
          '<script src="' + VMEDU_CLIENT.script + '"></script>',
          { headers: { "content-type": "text/html" } },
        );
      if (u.pathname === VMEDU_CLIENT.script)
        return new Response(changedClient ? client + "changed" : client, {
          headers: { "content-type": "text/javascript" },
        });
      const data = fields.getInstituteDataByURL
        ? fixture(wrongScope ? "scott-bootstrap" : "apce-bootstrap")
        : fields.getPublicLinkResourceData
          ? search
          : fixture("apce-detail");
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  return {
    calls,
    coordinator,
    service: new ConnectorService({
      coordinator,
      secret: "fixture-vmedulife-secret-more-than-thirty-two-bytes",
    }),
  };
}
test("captured public vmedulife client defines base64 multipart institute search, thirty rows and real resource lookup", () => {
  assert.equal(hash(client), VMEDU_CLIENT.sha256);
  assert.match(client, /\.append\(t,!0\)/);
  assert.match(client, /append\("data",m\.a\.encode\(JSON\.stringify\(s\)\)\)/);
  assert.match(client, /limit:30,pageIndex:1/);
  assert.match(client, /Object\.values\(this\.state\.bookDetails\)/);
  assert.match(client, /getPublicLinkIndividualResourceData/);
  assert.equal(catalogNativeProfile(entry).instituteId, 1252);
  assert.equal(catalogNativeProfile(scott).instituteId, 1085);
  assert.equal(
    catalogNativeProfile({ ...entry, catalogUrl: scott.catalogUrl }).supported,
    false,
  );
});
test("native result map preserves all visible identities/order and empty-title slots without treating copies or untyped list rows as books", () => {
  const p = fixture("apce-search"),
    r = parseVmeduSearch(p, entry);
  assert.equal(r.records.length, 30);
  assert.equal(r.total, 2846);
  assert.equal(r.hasMore, true);
  assert.equal(r.continuationUnsupported, true);
  assert.deepEqual(
    r.records.map((r) => r.recordId),
    Object.values(p.data).map((r) => String(r.uniqueId)),
  );
  assert.ok(r.records.every((r) => r.materialTypeProofPending));
  const rows = Object.values(p.data);
  const partial = {
    ...p,
    data: {
      a: { ...rows[0], Title: null },
      b: { ...rows[1], Title: "" },
      c: rows[2],
    },
  };
  const kept = parseVmeduSearch(partial, entry).records;
  assert.equal(kept.length, 2);
  assert.equal(kept[0].title, "");
  assert.deepEqual(kept[0].metadataWarnings, ["missing_title"]);
  assert.equal(assessBook(kept[0], "Engineering", []).accepted, false);
  const empty = parseVmeduSearch(
    { success: "true", data: [], totalCount: 0 },
    entry,
  );
  assert.equal(empty.records.length, 0);
  assert.equal(empty.hasMore, false);
  assert.throws(() =>
    parseVmeduSearch({ success: "false", data: [], totalCount: 0 }, entry),
  );
});
test("individual resource type and institution lookup prove books while General and foreign/changed IDs remain unresolved", () => {
  const book = parseVmeduRecord(fixture("apce-detail"), entry, "2399262");
  assert.equal(book.materialType, "Book");
  assert.equal(book.nativeMaterialLabel, "Text Book");
  assert.equal(book.nativeLookup.kind, "metadata_post_lookup");
  assert.equal(book.linkKind, "catalog");
  assert.equal(assessBook(book, "Engineering", []).formatConfirmed, true);
  assert.equal(
    assessBook({ ...book, recordId: "another-copy" }, "Engineering", [book])
      .reason,
    "duplicate_book",
  );
  const general = parseVmeduRecord(fixture("scott-detail"), scott, "3181551");
  assert.equal(general.nativeMaterialLabel, "General");
  assert.equal(general.materialTypeProofPending, true);
  assert.equal(assessBook(general, "History", []).formatConfirmed, false);
  assert.throws(
    () =>
      parseVmeduRecord(fixture("scott-foreign-detail-empty"), scott, "2399262"),
    { code: "CATALOG_HOLDING_UNCONFIRMED" },
  );
  assert.throws(() =>
    parseVmeduRecord(fixture("apce-detail"), entry, "2399263"),
  );
});
test("actual connector search and durable lookup use the public institution-bound multipart API without runtime app activation", async () => {
  const m = mockTransport(),
    r = await m.service.search({
      libraryId: entry.id,
      query: "Engineering",
      field: "title",
    });
  assert.equal(r.fidelity, "website_equivalent");
  assert.equal(r.records.length, 30);
  assert.equal(r.page.continuationUnsupported, true);
  assert.equal(r.page.nextCursor, null);
  assert.deepEqual(
    m.calls.find((c) => c.fields?.getPublicLinkResourceData).parameters,
    vmeduSearchParameters("Apce-ranipet", "Engineering"),
  );
  const resolved = await m.service.resolve(r.records[0].recordRef);
  assert.equal(resolved.record.recordId, r.records[0].recordId);
  assert.equal(resolved.record.materialType, "Book");
  assert.equal(resolved.record.scopeProof.instituteId, 1252);
  assert.deepEqual(describe(entry).fields, ["title"]);
  assert.equal(describe(entry).mode, "native_http");
  assert.equal(
    describe(getLibraryById("catalog:slim-hsncu-bttc")).mode,
    "unsupported",
  );
  await assert.rejects(
    m.service.search({
      libraryId: entry.id,
      query: "Engineering",
      field: "keyword",
    }),
    { code: "UNSUPPORTED_PROFILE" },
  );
});
test("changed active public client and wrong native institute binding stop before searching metadata", async () => {
  for (const options of [{ changedClient: true }, { wrongScope: true }]) {
    const m = mockTransport(options);
    await assert.rejects(
      m.service.search({ libraryId: entry.id, query: "Engineering" }),
      {
        code: options.changedClient
          ? "EQUIVALENCE_UNPROVEN"
          : "CATALOG_HOLDING_UNCONFIRMED",
      },
    );
    assert.ok(!m.calls.some((c) => c.fields?.getPublicLinkResourceData));
  }
});
test("independent fidelity rejects changed query, row order and scope instead of trusting adapter labels", async () => {
  const m = mockTransport(),
    r = await m.service.search({ libraryId: entry.id, query: "Engineering" }),
    last = m.calls.at(-1),
    params = last.parameters,
    bootstrap = m.calls.find((c) => c.fields?.getInstituteDataByURL);
  const responses = [
    {
      url: VMEDU_CLIENT.origin + VMEDU_CLIENT.script,
      status: 200,
      text: client,
    },
    {
      url: bootstrap.url,
      status: 200,
      text: JSON.stringify(fixture("apce-bootstrap")),
      bodyFields: bootstrap.fields,
    },
    {
      url: last.url,
      status: 200,
      method: "POST",
      text: JSON.stringify(fixture("apce-search")),
      bodyFields: last.fields,
    },
  ];
  assert.equal(
    catalogFidelity(
      entry,
      responses,
      r.records,
      r.effectiveProfile.nativeProfile,
    ).verified,
    true,
  );
  assert.throws(
    () =>
      catalogFidelity(
        entry,
        responses,
        [...r.records].reverse(),
        r.effectiveProfile.nativeProfile,
      ),
    { code: "FIDELITY_MISMATCH" },
  );
  assert.throws(
    () =>
      catalogFidelity(entry, responses, r.records, {
        ...r.effectiveProfile.nativeProfile,
        query: "Physics",
      }),
    { code: "FIDELITY_MISMATCH" },
  );
  const bad = structuredClone(responses);
  bad.at(-1).bodyFields.data = Buffer.from(
    JSON.stringify({ ...params, instituteUrl: "scott-christian-nagercoil" }),
  ).toString("base64");
  assert.throws(
    () =>
      catalogFidelity(entry, bad, r.records, r.effectiveProfile.nativeProfile),
    { code: "FIDELITY_MISMATCH" },
  );
});
test("frozen unsupported inventory can use a newly repaired native route with the same identity/origins, without editing its hash", async () => {
  const path = mkdtempSync(join(tmpdir(), "vmedu-frozen-upgrade-")),
    s = new EvidenceStore(path);
  s.acquire();
  try {
    const old = { ...describe(entry), mode: "unsupported" },
      libraries = [
        {
          libraryId: entry.id,
          name: entry.name,
          country: "IN",
          connections: [old],
        },
      ],
      manifest = {
        schemaVersion: 1,
        runId: "fixture",
        target: 20,
        inventory: { libraries, total: 1, inventoryHash: hash(libraries) },
      };
    s.save("manifest.json", manifest);
    let calls = 0;
    const svc = {
      capabilities: () => ({ connections: [describe(entry)] }),
      search: async () => {
        calls++;
        return {
          records: [],
          fidelity: "website_equivalent",
          effectiveProfile: { nativeProfile: {} },
          page: {},
          evidence: [],
          observationKind: "fixture",
        };
      },
    };
    await run(s, svc, { queries: ["Engineering"], allowFixtureEvidence: true });
    assert.equal(calls, 1);
    assert.equal(
      JSON.parse(readFileSync(join(path, "manifest.json"))).inventory
        .inventoryHash,
      manifest.inventory.inventoryHash,
    );
    svc.capabilities = () => ({
      connections: [
        {
          ...describe(entry),
          origins: ["https://another-institution.invalid"],
        },
      ],
    });
    calls = 0;
    await run(s, svc, {
      queries: ["Physics"],
      retryBlocked: true,
      retryReason:
        "Fixture demonstrates changed current origin remains excluded",
      allowFixtureEvidence: true,
    });
    assert.equal(calls, 0);
  } finally {
    s.release();
    rmSync(path, { recursive: true, force: true });
  }
});
test("governed transport records real multipart fields with redaction and retains decoded native parameters for evidence", async () => {
  const path = mkdtempSync(join(tmpdir(), "vmedu-form-evidence-")),
    s = new EvidenceStore(path);
  s.acquire();
  try {
    const c = new Coordinator({
        store: s,
        robots: false,
        minGapMs: 0,
        fetchImpl: async (url, o) => {
          assert.equal(o.body.get("getPublicLinkResourceData"), "true");
          return new Response("{}", {
            headers: { "content-type": "application/json" },
          });
        },
      }),
      ctx = c.context({
        libraryId: entry.id,
        allowedOrigins: [VMEDU_CLIENT.origin],
      }),
      body = new FormData();
    body.append("getPublicLinkResourceData", "true");
    body.append(
      "data",
      Buffer.from(JSON.stringify({ title: "Physics" })).toString("base64"),
    );
    body.append("access_token", "fixture-not-a-real-key");
    await ctx.request(VMEDU_CLIENT.origin + "/api/library/publicLink.php", {
      method: "POST",
      body,
    });
    const sent = s.events().find((e) => e.type === "request_started");
    assert.equal(sent.bodyFields.getPublicLinkResourceData, "true");
    assert.equal(sent.bodyFields.access_token, "[redacted]");
    assert.equal(
      JSON.parse(Buffer.from(sent.bodyFields.data, "base64").toString()).title,
      "Physics",
    );
    assert.equal(ctx.responses[0].method, "POST");
  } finally {
    s.release();
    rmSync(path, { recursive: true, force: true });
  }
});

test("per-item report classifies public POST-only metadata without fetching JSON or inventing a permanent book URL", async () => {
  const native = parseVmeduRecord(fixture("apce-detail"), entry, "2399262"),
    jobs = buildLinkQueue([
      {
        type: "book_accepted",
        eventId: "fixture-book",
        at: "2026-11-08T00:00:00.000Z",
        libraryId: entry.id,
        book: native,
      },
    ]);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].kind, "metadata_post_lookup");
  const m = mockTransport(),
    r = await verifyItemLink(jobs[0], m.coordinator, describe(entry));
  assert.equal(r.identityConfirmed, false);
  assert.equal(r.tested, false);
  assert.equal(r.method, "POST");
  assert.equal(r.permanentItemURL, null);
  assert.equal(r.itemUrlAvailable, false);
  assert.equal(r.outcome, "post_only_metadata_lookup_no_item_url");
  assert.equal(m.calls.length, 0);
  assert.equal(r.nativeLookup.parameters.uniqueId, 2399262);
});

test("actual internal HTTP search and record-resolve routes retain the requested institution, native IDs and POST-only handoff disclosure", async () => {
  const path = mkdtempSync(join(tmpdir(), "vmedu-http-api-")),
    store = new EvidenceStore(path),
    m = mockTransport(),
    apiKey = "fixture-internal-api-key-at-least-thirty-two-characters",
    app = createConnectorApi({ service: m.service, store, apiKey });
  try {
    const response = await request(app)
      .post("/api/catalog/v1/search")
      .set("Authorization", "Bearer " + apiKey)
      .send({ libraryId: entry.id, query: "Engineering", field: "title" })
      .expect(200);
    assert.equal(response.body.libraryId, entry.id);
    assert.equal(response.body.records[0].nativeRecordId, "2399262");
    assert.equal(response.body.fidelity, "website_equivalent");
    const detail = await request(app)
      .post("/api/catalog/v1/records/resolve")
      .set("Authorization", "Bearer " + apiKey)
      .send({ recordRef: response.body.records[0].recordRef })
      .expect(200);
    assert.equal(detail.body.record.title, "Engineering Mechanics");
    assert.equal(detail.body.record.nativeLookup.kind, "metadata_post_lookup");
    assert.equal(detail.body.record.scopeProof.instituteId, 1252);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
