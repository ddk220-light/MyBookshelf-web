import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  confirmItemIdentity,
  saveLinkResult,
  linkVerificationReport,
} from "./link-verification.mjs";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
const examples = [
  {
    libraryId: "discovery-community:pmb-afindia-11",
    nativeId: "122298",
    title: "Douce France : Ces paysages qu'on aime",
    sha: "7c044481c4aa54046d8367cc645f388e7de5683ea4809343104fcf50273a710b",
  },
  {
    libraryId: "discovery-community:pmb-afindia-14",
    nativeId: "118579",
    title: "France Collection",
    sha: "df5bcdb15d9c8b1ca198a12b08757a179502acce3855a17967b9a2d1214eef9d",
  },
];
const fixture = (e) =>
  readFileSync(
    new URL(
      "../../docs/research/india-library-audit/revalidation/20261107/bodies/" +
        e.sha +
        ".txt",
      import.meta.url,
    ),
    "utf8",
  );
const job = (e) => ({
  ...e,
  recordId: e.nativeId,
  connectionId: "primary",
  kind: "record",
  url:
    "https://mediatheques-afinde.org/index.php?lvl=notice_display&id=" +
    e.nativeId +
    "&opac_view=" +
    e.libraryId.split("-").at(-1),
});

test("PMB saved successful item responses prove canonical ID, local holdings and labelled title without a book heading", () => {
  for (const example of examples) {
    const j = job(example),
      result = confirmItemIdentity(j, { url: j.url, text: fixture(example) });
    assert.equal(result.identityConfirmed, true);
    assert.equal(result.nativeIdInUrl, true);
    assert.equal(result.titleConfirmed, true);
  }
});
test("PMB identity still rejects another branch, canonical item, title or ambiguous URL even with a matching heading", () => {
  const e = examples[0],
    j = job(e),
    html = fixture(e);
  for (const [changed, body] of [
    [{ ...j, libraryId: examples[1].libraryId }, html],
    [j, html.replaceAll("122298", "122299")],
    [{ ...j, title: "A different France title" }, html],
    [{ ...j, url: j.url + "&id=122299" }, html],
    [j, html.replaceAll("AF - Panjim", "AF - Elsewhere")],
  ])
    assert.equal(
      confirmItemIdentity(changed, {
        url: changed.url,
        text: body + "<h1>" + changed.title + "</h1>",
      }).identityConfirmed,
      false,
    );
});
test("saved-response identity reanalysis retains original observation date/failure and counts one job without a fresh request", () => {
  const root = mkdtempSync(join(tmpdir(), "pmb-link-reanalysis-")),
    s = new EvidenceStore(root);
  s.acquire();
  try {
    const j = {
      ...job(examples[0]),
      jobId: "one-fixture-job",
      sourceObservedAt: "2026-11-07T10:00:00.000Z",
      sourceEvents: ["source-fixture-event"],
    };
    s.save("link-verification-queue.json", { jobs: [j] });
    const old = "2026-11-08T01:34:33.893Z";
    saveLinkResult(
      s,
      {
        ...j,
        at: old,
        tested: true,
        outcome: "http_success_identity_unconfirmed",
        identityConfirmed: false,
      },
      { observationKind: "fixture" },
    );
    saveLinkResult(
      s,
      {
        ...j,
        at: old,
        tested: true,
        outcome: "item_identity_confirmed",
        ...confirmItemIdentity(j, { url: j.url, text: fixture(examples[0]) }),
      },
      {
        observationKind: "saved_response_reanalysis",
        analysedAt: "2026-11-08T01:38:00.000Z",
      },
    );
    const summary = linkVerificationReport(s);
    assert.equal(summary.processed, 1);
    assert.equal(summary.identityConfirmed, 1);
    assert.equal(s.events().length, 2);
    assert.equal(s.events()[0].outcome, "http_success_identity_unconfirmed");
    assert.equal(s.events()[1].at, old);
    assert.equal(s.events()[1].observationKind, "saved_response_reanalysis");
  } finally {
    s.release();
    rmSync(root, { recursive: true, force: true });
  }
});
