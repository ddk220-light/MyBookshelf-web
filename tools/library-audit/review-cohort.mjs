#!/usr/bin/env node
// Read-only source replay and classification. This never contacts providers or
// rewrites the original audit findings, and never calls replay a fresh query.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { readManifest, assessBook } from "./runner.mjs";
import { getLibraryById } from "../../server/services/directory.js";
import {
  robotsRules,
  robotsAllowed,
} from "../../server/services/catalog-connectors/transport.js";
import { parseIndcatRecord } from "../../server/services/providers/indcat.js";
import { bibliographicMaterialType } from "../../server/services/providers/catalogMarkup.js";
import { verifyNativePage } from "../../server/services/catalog-connectors/fidelity.js";
import { scopeSearch } from "../../server/services/providers/koha.js";
import { csvCell } from "./report.mjs";
const directory = resolve(
  process.argv[2] || "docs/research/india-library-audit/revalidation/20261107",
);
const target = new EvidenceStore(directory);
target.acquire();
try {
  const cohort = readManifest(target),
    root = resolve(cohort.sourceRunDirectory),
    source = new EvidenceStore(root),
    events = source.events();
  source.validate();
  const baseline = JSON.parse(readFileSync(join(directory, "baseline.json"))),
    cut = events.slice(0, baseline.sourceEvents),
    byLibrary = new Map(),
    starts = new Map(),
    responsesByHash = new Map(),
    policies = new Map();
  for (const e of cut) {
    if (e.libraryId) {
      if (!byLibrary.has(e.libraryId)) byLibrary.set(e.libraryId, []);
      byLibrary.get(e.libraryId).push(e);
    }
    if (e.type === "request_started") starts.set(e.requestId, e);
    if (e.type === "response_received") {
      const request = starts.get(e.requestId);
      for (const ref of e.evidence || [])
        responsesByHash.set(ref.sha256, { ...e, url: request?.url });
      if (
        request &&
        new URL(request.url).pathname === "/robots.txt" &&
        e.status === 200
      )
        policies.set(new URL(request.url).origin, {
          rules: robotsRules(
            readFileSync(join(root, e.evidence[0].path), "utf8"),
          ),
          evidence: e.evidence[0],
          observedAt: e.at,
        });
    }
  }
  const rows = [];
  for (const entry of cohort.inventory.libraries) {
    const id = entry.libraryId,
      library = getLibraryById(id),
      history = byLibrary.get(id) || [],
      last = [...history]
        .reverse()
        .find((e) => e.type === "library_checkpoint"),
      blocker = last?.blocker || null;
    let diagnosis = blocker?.code || null,
      classification = "needs_live_recheck";
    const accepted = [],
      proofs = [],
      fixed = [];
    const primaryOrigin = entry.connections[0].origins[0];
    const policy = policies.get(primaryOrigin);
    if (library.platform === "koha" && policy) {
      const url = scopeSearch(
        new URL("/cgi-bin/koha/opac-search.pl", primaryOrigin),
        library,
      );
      if (!robotsAllowed(policy.rules, url)) {
        diagnosis = "ROBOTS_DISALLOWED";
        classification = "confirmed_policy_block";
        proofs.push(policy.evidence);
        if (blocker?.code !== "ROBOTS_DISALLOWED")
          fixed.push("policy_error_was_misclassified");
      }
    }
    for (const e of history.filter(
      (e) =>
        ["book_accepted", "book_rejected"].includes(e.type) &&
        e.book &&
        e.observationKind === "live_http",
    )) {
      let record = { ...e.book, connectionId: e.connectionId || "primary" };
      const refs = e.evidence || [];
      let typeProof = null;
      for (const ref of [...refs].reverse()) {
        const response = responsesByHash.get(ref.sha256);
        if (!response?.url) continue;
        const url = new URL(response.url);
        if (
          library.platform === "indcat" &&
          url.pathname.endsWith("/search/book_search")
        ) {
          let data;
          try {
            data = JSON.parse(
              Buffer.from(url.searchParams.get("getDetails"), "base64"),
            );
          } catch {
            continue;
          }
          if (String(data.book_detail) !== record.recordId) continue;
          const parsed = parseIndcatRecord(
            readFileSync(join(root, ref.path), "utf8"),
            library,
            record.recordId,
            null,
            { confirmedMemberRecord: true },
          );
          if (parsed) {
            record = { ...parsed, connectionId: record.connectionId };
            typeProof = ref;
            break;
          }
        }
        if (
          library.platform === "koha" &&
          url.pathname.endsWith("/opac-detail.pl") &&
          url.searchParams.get("biblionumber") === record.recordId
        ) {
          const materialType = bibliographicMaterialType(
            readFileSync(join(root, ref.path), "utf8"),
          );
          if (materialType) {
            record.materialType = materialType;
            typeProof = ref;
            break;
          }
        }
      }
      if (
        library.platform === "egranthalaya" &&
        !record.materialType &&
        history.some(
          (q) =>
            q.type === "search_completed" &&
            q.query === e.query &&
            q.profile?.nativeProfile?.material === "Books" &&
            q.records?.some((r) => r.recordId === record.recordId),
        )
      ) {
        record.materialType = "Book";
        record.materialTypeProof = "verified_native_books_search";
      }
      const check = assessBook(record, e.query, accepted);
      if (check.accepted && check.formatConfirmed) {
        accepted.push(record);
        proofs.push(...refs);
        if (e.type === "book_rejected" && typeProof)
          fixed.push("material_type_extraction");
      }
    }
    let sourceReturned = 0,
      verifiedSearches = 0;
    for (const e of history.filter((e) => e.type === "search_completed")) {
      sourceReturned += e.records?.length || 0;
      const raw = (e.evidence || [])
        .map((ref) => {
          const response = responsesByHash.get(ref.sha256);
          return response
            ? {
                url: response.url,
                status: response.status,
                text: readFileSync(join(root, ref.path), "utf8"),
              }
            : null;
        })
        .filter(Boolean);
      try {
        if (
          verifyNativePage(
            library.platform,
            raw,
            e.records || [],
            library,
            e.profile?.nativeProfile,
          ).verified
        )
          verifiedSearches++;
      } catch {}
    }
    if (classification !== "confirmed_policy_block") {
      if (accepted.length >= 20 && verifiedSearches)
        classification = "verified_20_replayed";
      else if (
        blocker?.code === "EQUIVALENCE_UNPROVEN" &&
        (verifiedSearches || library.platform === "koha")
      ) {
        classification = "needs_live_recheck";
        fixed.push("native_display_contract");
      } else if (
        blocker?.code === "CATALOG_CONFIGURATION_REQUIRED" &&
        !library.baseUrl &&
        library.catalogUrl?.startsWith("https:")
      ) {
        classification = "needs_live_recheck";
        fixed.push("catalog_only_origin_configuration");
      } else if (
        [
          "UNSUPPORTED_PROFILE",
          "CATALOG_CONFIGURATION_REQUIRED",
          "EQUIVALENCE_UNPROVEN",
          "CATALOG_UNRECOGNIZED",
          "NO_VERIFIED_BOOKS",
        ].includes(blocker?.code)
      )
        classification = "tooling_or_evidence_gap";
      else if (blocker?.code === "ROBOTS_DISALLOWED")
        classification = "confirmed_policy_block";
      else if (
        blocker?.code === "CATALOG_PROVIDER_BLOCKED" ||
        blocker?.code === "SOURCE_ACCESS_BLOCKED"
      )
        classification = "confirmed_access_block";
      else if (blocker) classification = "needs_live_connection_recheck";
      else if (last?.state !== "interrupted" && sourceReturned === 0)
        classification = "clean_zero_replayed";
    }
    if (
      fixed.includes("material_type_extraction") &&
      accepted.length < 20 &&
      classification === "tooling_or_evidence_gap"
    )
      classification = "needs_live_recheck";
    const findings = {
      libraryId: id,
      name: entry.name,
      family: entry.connections[0].family,
      classification,
      reportedCode: blocker?.code || null,
      diagnosedCode: diagnosis,
      previousVerifiedBooks: last?.verifiedBooks || 0,
      replayedVerifiedBooks: Math.min(20, accepted.length),
      sourceReturnedRows: sourceReturned,
      verifiedNativeSearches: verifiedSearches,
      fixesDemonstrated: [...new Set(fixed)],
      method: "saved_source_replay_not_fresh_provider_contact",
      sourceObservedThrough: history.at(-1)?.at || null,
      evidence: [...new Map(proofs.map((r) => [r.sha256, r])).values()],
      books: accepted.slice(0, 20),
    };
    rows.push(findings);
  }
  const counts = {};
  for (const r of rows)
    counts[r.classification] = (counts[r.classification] || 0) + 1;
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    cohortTotal: rows.length,
    cohortHash: cohort.inventory.inventoryHash,
    method: "saved_source_replay",
    sourceObservedThrough: cut.at(-1)?.at,
    fullAuditMayResume: false,
    counts,
    libraries: rows,
  };
  target.save("replay-review.json", result);
  const fields = [
    "libraryId",
    "name",
    "family",
    "classification",
    "reportedCode",
    "diagnosedCode",
    "previousVerifiedBooks",
    "replayedVerifiedBooks",
    "sourceReturnedRows",
    "verifiedNativeSearches",
    "fixesDemonstrated",
    "method",
  ];
  writeFileSync(
    join(directory, "replay-review.csv"),
    [
      fields,
      ...rows.map((r) =>
        fields.map((k) => (Array.isArray(r[k]) ? r[k].join(";") : r[k])),
      ),
    ]
      .map((r) => r.map(csvCell).join(","))
      .join("\n") + "\n",
  );
  const goal = JSON.parse(readFileSync(join(directory, "repair-goal.json")));
  target.save("repair-goal.json", {
    ...goal,
    phase: "cohort_replay_complete_live_revalidation_pending",
    replayCounts: counts,
    fullAuditPaused: true,
    completedFixes: [
      "policy_error_preservation",
      "explicit_bibliographic_material_type",
      "indcat_native_book_kind",
      "catalog_only_koha_origin",
      "reviewed_libman_native_client_order",
      "enforced_owner_pause_gate",
    ],
    remaining: rows
      .filter(
        (r) =>
          ![
            "verified_20_replayed",
            "confirmed_policy_block",
            "confirmed_access_block",
            "clean_zero_replayed",
          ].includes(r.classification),
      )
      .map((r) => r.libraryId),
  });
  console.log(
    JSON.stringify({
      cohortTotal: rows.length,
      counts,
      fullAuditMayResume: false,
    }),
  );
} finally {
  target.release();
}
