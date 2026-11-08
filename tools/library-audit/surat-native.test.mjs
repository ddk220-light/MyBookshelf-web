import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  SURAT_NATIVE_CLIENT,
  suratNativeParams,
  parseNativeSurat,
} from "../../server/services/providers/communitySuratNative.js";
import { communityFidelity } from "../../server/services/catalog-connectors/community-fidelity.js";
import { getLibraryById } from "../../server/services/directory.js";
import { describe } from "../../server/services/catalog-connectors/inventory.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { assessBook } from "./runner.mjs";
const entry = getLibraryById("discovery-community:surat-1");
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../../server/test/fixtures/community/surat.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const profile = { query: "Wings of Fire", offset: 0 };
const response = (data = fixture(), offset = 0) => ({
  url:
    "https://office.suratmunicipal.org/LMS/Home/GetSearchData?" +
    suratNativeParams(entry, profile.query, offset),
  text: JSON.stringify(data),
});

test("Surat saved public scripts establish ten-row display, one-page pipeline, source rendering and native controls", () => {
  const sources = Object.fromEntries(
    Object.entries(SURAT_NATIVE_CLIENT).map(([name, sha]) => {
      const value = readFileSync(
        new URL(
          "../../docs/research/india-library-audit/revalidation/20261107/bodies/" +
            sha +
            ".txt",
          import.meta.url,
        ),
        "utf8",
      );
      assert.equal(createHash("sha256").update(value).digest("hex"), sha);
      return [name, value];
    }),
  );
  assert.match(sources.search, /pages:\s*1/);
  assert.match(sources.search, /"order":\s*\[\[1,\s*'asc'\]\]/);
  assert.match(sources.search, /row\.BookName \+ "<br\/>" \+ row\.AuthorName/);
  assert.match(sources.search, /"LibraryId": \$\('#drpLibrary'\)\.val\(\)/);
  assert.match(
    sources.pipeline,
    /request\.length = requestLength \* conf\.pages/,
  );
  assert.match(sources.dataTables, /DataTables 1\.10\.4/);
  assert.match(sources.dataTables, /"iDisplayLength": 10/);
});
test("Surat requests literal title, native branch/default classification and exact ten-row controls, rejecting unsupported profiles", () => {
  const p = suratNativeParams(entry, "History of India", 10);
  for (const [k, v] of Object.entries({
    start: "10",
    length: "10",
    draw: "2",
    "CustomData[SearchType]": "BookName",
    "CustomData[SearchBy]": "History of India",
    "CustomData[LibraryId]": "1",
    "CustomData[bookCLSVal]": "",
    "order[0][column]": "1",
    "order[0][dir]": "asc",
    "columns[1][data]": "BookName",
    "columns[1][search][value]": "",
    "columns[1][search][regex]": "false",
  }))
    assert.equal(p.get(k), v, k);
  assert.throws(() => suratNativeParams(entry, "x".repeat(51)), {
    code: "UNSUPPORTED_PROFILE",
  });
  assert.throws(() => suratNativeParams(entry, "India", 3), {
    code: "UNSUPPORTED_PROFILE",
  });
});
test("Surat retains all native copy identities and source order without awarding unknown material or duplicate books", () => {
  const data = fixture(),
    r = parseNativeSurat(data, entry);
  assert.equal(r.records.length, 10);
  assert.equal(r.total, 58);
  assert.equal(r.nextOffset, 10);
  assert.deepEqual(
    r.records.map((x) => x.nativeRecordId),
    data.data.map((x) => String(x.BookId)),
  );
  assert.ok(
    r.records.every(
      (x) => x.nativeIdKind === "copy" && x.materialTypeProofPending,
    ),
  );
  assert.equal(
    assessBook(r.records[0], "Wings of Fire", []).formatConfirmed,
    false,
  );
  assert.equal(
    assessBook(r.records[1], "Wings of Fire", [r.records[0]]).reason,
    "duplicate_book",
  );
});
test("Surat validates branch, complete page, native totals and copy identity before treating any response as searchable", () => {
  assert.throws(
    () =>
      parseNativeSurat(fixture(), {
        ...entry,
        communityCatalog: { family: "surat", scope: "2" },
      }),
    { code: "CATALOG_HOLDING_UNCONFIRMED" },
  );
  for (const data of [
    { ...fixture(), data: [] },
    { ...fixture(), iTotalDisplayRecords: 1 },
    { ...fixture(), data: [...fixture().data, ...fixture().data] },
    { ...fixture(), data: [fixture().data[0], fixture().data[0]] },
  ])
    assert.throws(() => parseNativeSurat(data, entry));
  assert.equal(
    parseNativeSurat(
      { status: 200, data: [], iTotalRecords: 0, iTotalDisplayRecords: 0 },
      entry,
    ).hasMore,
    false,
  );
});
test("independent Surat native fidelity rejects omitted/reordered copy rows and changed query/scope/page controls", () => {
  const data = fixture(),
    records = parseNativeSurat(data, entry).records;
  assert.equal(
    communityFidelity(entry, response(), records, profile).verified,
    true,
  );
  for (const changed of [records.slice(1), [...records].reverse()])
    assert.throws(
      () => communityFidelity(entry, response(), changed, profile),
      { code: "FIDELITY_MISMATCH" },
    );
  for (const key of [
    "CustomData[LibraryId]",
    "CustomData[SearchBy]",
    "length",
    "start",
  ]) {
    const r = response(),
      u = new URL(r.url);
    u.searchParams.set(key, "wrong");
    assert.throws(
      () =>
        communityFidelity(entry, { ...r, url: String(u) }, records, profile),
      { code: "FIDELITY_MISMATCH" },
    );
  }
});
test("actual connector service exposes scoped Surat Title paging and durable lookup without enabling app libraries or counting copy rows as books", async () => {
  const calls = [],
    coordinator = new Coordinator({
      robots: false,
      minGapMs: 0,
      fetchImpl: async (url) => {
        const u = new URL(url);
        calls.push(u);
        return new Response(JSON.stringify(fixture()), {
          headers: { "content-type": "application/json" },
        });
      },
    });
  const service = new ConnectorService({
    coordinator,
    secret: "surat-fixture-secret-longer-than-thirty-two-bytes",
  });
  const r = await service.search({
    libraryId: entry.id,
    query: profile.query,
    field: "title",
  });
  assert.equal(r.fidelity, "website_equivalent");
  assert.equal(r.records.length, 10);
  assert.equal(r.effectiveProfile.nativeProfile.totalUnit, "copy_rows");
  assert.equal(describe(entry).paging, "native");
  assert.deepEqual(describe(entry).fields, ["title"]);
  assert.ok(r.page.nextCursor);
  const next = await service.search({
    libraryId: entry.id,
    query: profile.query,
    field: "title",
    cursor: r.page.nextCursor,
  });
  assert.equal(calls.at(-1).searchParams.get("start"), "10");
  assert.equal(next.records.length, 10);
  const resolved = await service.resolve(r.records[0].recordRef);
  assert.equal(resolved.record.recordId, r.records[0].recordId);
  assert.equal(
    calls.at(-1).searchParams.get("CustomData[SearchType]"),
    "BookCode",
  );
  await assert.rejects(
    service.search({
      libraryId: entry.id,
      query: profile.query,
      field: "keyword",
    }),
    { code: "UNSUPPORTED_PROFILE" },
  );
});
