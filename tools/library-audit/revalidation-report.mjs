import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { implementationHash } from "../../server/services/catalog-connectors/service.js";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { readManifest, reduceRun } from "./runner.mjs";
import { csvCell } from "./report.mjs";

const closedReplay = new Set([
  "verified_20_replayed",
  "confirmed_policy_block",
  "confirmed_access_block",
  "clean_zero_replayed",
]);
const tooling =
  /UNSUPPORTED|CONFIGURATION|EQUIVALENCE|UNRECOGNIZED|FIDELITY|INVALID_|NO_VERIFIED_BOOKS|RESPONSE_TOO_LARGE|HOLDING_UNCONFIRMED/;
export function classifyRevalidation(replay, live, events) {
  const history = events.filter((e) => e.libraryId === replay.libraryId),
    queries = history.filter((e) => e.type === "search_completed");
  const checkpoint = [...history]
    .reverse()
    .find((e) => e.type === "library_checkpoint");
  if (checkpoint && checkpoint.state !== "interrupted") {
    const equivalent = (e) =>
      e.fidelity === "website_equivalent" || e.fidelity?.verified === true;
    const fidelity = queries.some(equivalent),
      blocker = live.blocker;
    if (live.books.length >= 20 && fidelity)
      return {
        classification: "verified_20_live",
        closed: true,
        books: live.books.length,
        reason:
          "Twenty distinct books with native query, relevance and membership evidence",
      };
    if (blocker) {
      if (tooling.test(blocker.code))
        return {
          classification: "tooling_or_evidence_gap",
          closed: false,
          books: live.books.length,
          code: blocker.code,
          reason: blocker.reason,
        };
      if (
        /ROBOTS_DISALLOWED|SOURCE_ACCESS_BLOCKED|CATALOG_PROVIDER_BLOCKED/.test(
          blocker.code,
        )
      )
        return {
          classification: "confirmed_policy_or_access_block",
          closed: true,
          books: live.books.length,
          code: blocker.code,
          reason: blocker.reason,
        };
      const failedSearch = [...history]
        .reverse()
        .find((e) => e.type === "search_failed");
      const transport =
        failedSearch &&
        history.some(
          (e) =>
            e.attemptId === failedSearch.attemptId &&
            (e.type === "request_failed" ||
              (e.type === "response_received" && e.status >= 400)),
        );
      if (transport)
        return {
          classification: "observed_connection_or_http_block",
          closed: true,
          books: live.books.length,
          code: blocker.code,
          reason: blocker.reason,
          scope:
            "Observed from this audit environment; not proof of worldwide downtime or book absence",
        };
      return {
        classification: "needs_investigation",
        closed: false,
        books: live.books.length,
        code: blocker.code,
        reason: blocker.reason,
      };
    }
    if (queries.length && queries.every(equivalent)) {
      if (live.books.length)
        return {
          classification: "verified_partial_live",
          closed: true,
          books: live.books.length,
          reason:
            "Supported queries verified fewer than twenty distinct books; target not met",
        };
      if (queries.every((e) => !e.records?.length))
        return {
          classification: "confirmed_empty_live",
          closed: true,
          books: 0,
          reason:
            "Completed native searches returned no items for the recorded terms; no catalog-wide absence claim",
        };
    }
  }
  if (
    closedReplay.has(replay.classification) &&
    (replay.classification !== "clean_zero_replayed" ||
      replay.verifiedNativeSearches > 0) &&
    !history.some(
      (e) => e.type === "search_failed" && tooling.test(e.code || ""),
    )
  )
    return {
      classification: replay.classification,
      closed: true,
      books: replay.replayedVerifiedBooks,
      reason:
        "Evidence replay with original observation dates; not a fresh provider request",
    };
  return {
    classification:
      checkpoint?.state === "interrupted"
        ? "interrupted"
        : replay.classification,
    closed: false,
    books: Math.max(replay.replayedVerifiedBooks || 0, live?.books.length || 0),
    code: replay.diagnosedCode,
    reason: "Live recheck or semantic adapter review remains open",
  };
}

export function revalidationReport(store) {
  store.validate();
  const manifest = readManifest(store),
    events = store.events({ cached: true }),
    progress = reduceRun(manifest, events);
  const replay = JSON.parse(
      readFileSync(join(store.root, "replay-review.json")),
    ),
    source = new EvidenceStore(resolve(manifest.sourceRunDirectory));
  source.validate();
  if (
    replay.cohortHash !== manifest.inventory.inventoryHash ||
    replay.cohortTotal !== manifest.inventory.total
  )
    throw new Error("Revalidation cohort mismatch");
  const mapping = new Map(replay.libraries.map((r) => [r.libraryId, r]));
  if (mapping.size !== manifest.inventory.total)
    throw new Error("Duplicate or missing cohort reviews");
  const libraries = progress.libraries.map((row) => {
    const original = mapping.get(row.libraryId);
    if (!original) throw new Error("Missing cohort review");
    return {
      libraryId: row.libraryId,
      name: row.name,
      family: row.connections[0].family,
      ...classifyRevalidation(original, row, events),
      liveAttempts: row.attempts,
      replayMethod: original.method,
      sourceObservedThrough: original.sourceObservedThrough,
      nextAction: row.nextAction,
    };
  });
  const counts = {};
  for (const row of libraries)
    counts[row.classification] = (counts[row.classification] || 0) + 1;
  const closed = libraries.filter((r) => r.closed).length,
    checksPath = join(store.root, "regression-check.json"),
    checks = existsSync(checksPath)
      ? JSON.parse(readFileSync(checksPath))
      : null;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cohortTotal: libraries.length,
    cohortHash: manifest.inventory.inventoryHash,
    implementationHash,
    closed,
    remaining: libraries.length - closed,
    counts,
    regressionChecksCurrent:
      checks?.implementationHash === implementationHash &&
      checks.exitCode === 0,
    // Applying corrected outcomes to the original journal is a separate, audited
    // step. A completed collector or a green test run cannot silently open it.
    fullAuditMayResume: false,
    resumeBlockers: [
      ...(closed < libraries.length
        ? ["Cohort entries still need adapter/evidence review"]
        : []),
      ...(!(
        checks?.implementationHash === implementationHash &&
        checks.exitCode === 0
      )
        ? ["Current implementation regression attestation missing"]
        : []),
      "Corrected outcomes have not yet been reconciled into the original run",
    ],
    libraries,
  };
  store.save("gate-report.json", report);
  store.save("repair-goal.json", {
    ...JSON.parse(readFileSync(join(store.root, "repair-goal.json"))),
    phase: report.remaining
      ? "revalidating_cohort"
      : "cohort_reviewed_reconciliation_pending",
    updatedAt: report.generatedAt,
    fullAuditPaused: true,
    revalidationCounts: counts,
    remaining: libraries.filter((r) => !r.closed).map((r) => r.libraryId),
  });
  const fields = [
    "libraryId",
    "name",
    "family",
    "classification",
    "closed",
    "books",
    "liveAttempts",
    "code",
    "reason",
    "scope",
    "sourceObservedThrough",
    "nextAction",
  ];
  writeFileSync(
    join(store.root, "revalidation-status.csv"),
    [fields, ...libraries.map((r) => fields.map((k) => r[k] ?? ""))]
      .map((r) => r.map(csvCell).join(","))
      .join("\n") + "\n",
  );
  const body = [
    "# Paused India audit: repair and revalidation",
    `Generated ${report.generatedAt}. Full collection remains paused.`,
    `Frozen cohort: ${libraries.length}; evidence-backed reviewed outcomes: ${closed}; still open: ${report.remaining}.`,
    "",
    "| Result | Libraries |",
    "|---|---:|",
    ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "Replayed evidence keeps its original observation date. Connection failures describe this audit environment, not worldwide library downtime. Partial findings do not meet the twenty-book target. Missing adapters and unproven website semantics remain open tooling gaps.",
    "",
    "See revalidation-status.csv for every library. The original negative evidence is preserved.",
  ];
  writeFileSync(join(store.root, "repair-report.md"), body.join("\n") + "\n");
  return report;
}
