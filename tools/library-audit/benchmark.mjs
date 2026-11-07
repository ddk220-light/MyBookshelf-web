#!/usr/bin/env node
// Offline replay of retained real search responses. Never contacts a provider.
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { parseCatalogSearch } from "../../server/services/providers/egranthalaya.js";
import { parseIndcatSearch } from "../../server/services/providers/indcat.js";
import { verifyNativePage } from "../../server/services/catalog-connectors/fidelity.js";

const root = resolve(
  process.argv[2] ||
    "docs/research/india-library-audit/runs/pilot-http-20261107",
);
const iterations = Number(process.argv[3] || 100);
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 1000)
  throw new Error("Use 1–1000 replay iterations");
const store = new EvidenceStore(root);
store.acquire();
try {
  store.validate();
  const events = store.events(),
    cases = [];
  for (const family of ["egranthalaya", "indcat"]) {
    const search = [...events]
      .reverse()
      .find(
        (e) =>
          e.type === "search_completed" &&
          e.libraryId.startsWith(family + ":") &&
          e.records.length,
      );
    if (!search) continue;
    const ref = search.evidence.at(-1),
      text = readFileSync(join(root, ref.path), "utf8");
    const request = [...events]
      .reverse()
      .find(
        (e) =>
          e.type === "request_started" &&
          e.attemptId === search.attemptId &&
          e.method === "POST",
      );
    const code =
      family === "egranthalaya"
        ? request.bodyFields.DDL_Library
        : request.bodyFields.part_uni;
    const durations = [];
    let records;
    for (let i = 0; i < iterations + 5; i++) {
      const start = performance.now();
      records =
        family === "egranthalaya"
          ? parseCatalogSearch(text, code, Infinity)
          : parseIndcatSearch(text, code, Infinity).records;
      const verified = verifyNativePage(
        family,
        [{ url: request.url, status: 200, text }],
        records,
      );
      if (!verified.verified)
        throw new Error("Replay did not establish native page fidelity");
      if (i >= 5) durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    cases.push({
      family,
      libraryId: search.libraryId,
      query: search.query,
      capturedAt: search.at,
      evidence: ref,
      iterations,
      records: records.length,
      nativeIds: records.map((r) => r.recordId),
      p50ParseAndFidelityMs: durations[Math.floor(iterations * 0.5)],
      p95ParseAndFidelityMs:
        durations[Math.min(iterations - 1, Math.floor(iterations * 0.95))],
    });
  }
  const result = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    kind: "offline_replay_not_live_health",
    node: process.version,
    sourceRequests: 0,
    cases,
  };
  store.save("benchmark.json", result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  store.release();
}
