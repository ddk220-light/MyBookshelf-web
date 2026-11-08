import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readManifest, reduceRun } from "./runner.mjs";

export const assessed = (row) =>
  row.books.length >= 20 ||
  ["qualified", "blocked", "needs_review"].includes(row.lastAttemptState);
export function selectBatch(progress, size = 10) {
  const groups = new Map();
  for (const row of progress.libraries) {
    const origin = row.connections[0]?.origins?.[0] || row.libraryId;
    if (!groups.has(origin))
      groups.set(origin, { origin, checked: 0, pending: [] });
    const group = groups.get(origin);
    if (assessed(row)) group.checked++;
    else group.pending.push(row.libraryId);
  }
  const candidates = [...groups.values()]
    .filter((g) => g.pending.length)
    .sort((a, b) => a.checked - b.checked || a.origin.localeCompare(b.origin));
  const selected = [];
  while (selected.length < size && candidates.some((g) => g.pending.length))
    for (const group of candidates) {
      if (group.pending.length) selected.push(group.pending.shift());
      if (selected.length === size) break;
    }
  return selected;
}
export function auditSummary(progress) {
  const checked = progress.libraries.filter(assessed).length;
  return {
    total: progress.total,
    assessed: checked,
    remaining: progress.total - checked,
    verifiedBooks: progress.booksVerified,
    counts: progress.counts,
  };
}
export function finalReport(store) {
  store.validate();
  const manifest = readManifest(store),
    events = store.events(),
    progress = reduceRun(manifest, events),
    summary = auditSummary(progress);
  if (summary.remaining)
    throw new Error("Final report requires an outcome for every target");
  const families = {},
    causes = {};
  for (const row of progress.libraries) {
    const family = row.connections[0].family;
    const group = (families[family] ||= {
      total: 0,
      qualified: 0,
      partial: 0,
      empty: 0,
      blocked: 0,
      books: 0,
    });
    group.total++;
    group.books += row.books.length;
    if (row.books.length >= 20) group.qualified++;
    else if (row.books.length) group.partial++;
    else if (row.blocker) group.blocked++;
    else group.empty++;
    if (row.blocker) {
      const c = (causes[row.blocker.code] ||= {
        libraries: 0,
        reason: row.blocker.reason,
        nextAction: row.nextAction,
      });
      c.libraries++;
    }
  }
  const searches = events.filter((e) =>
    ["search_completed", "search_failed", "search_interrupted"].includes(
      e.type,
    ),
  );
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    kind: "final_initial_audit_report",
    runId: manifest.runId,
    ...summary,
    allLibrariesHaveOutcome: true,
    allLibrariesHaveTwentyBooks: progress.libraries.every(
      (l) => l.books.length >= 20,
    ),
    families,
    blockerCauses: causes,
    searches: {
      attempts: searches.length,
      queriesWithItems: searches.filter(
        (e) => e.type === "search_completed" && e.records?.length,
      ).length,
      returnedItems: searches.reduce(
        (count, e) =>
          count + (e.type === "search_completed" ? e.records?.length || 0 : 0),
        0,
      ),
      empty: searches.filter(
        (e) => e.type === "search_completed" && !e.records?.length,
      ).length,
      failed: searches.filter((e) => e.type === "search_failed").length,
      interrupted: searches.filter((e) => e.type === "search_interrupted")
        .length,
    },
    historicalOmittedMappings: manifest.inventory.reconciliation.filter(
      (r) => !r.libraryId,
    ).length,
  };
  store.save("final-report.json", result);
  const safe = (x) => String(x ?? "").replace(/[|\r\n]/g, " ");
  const lines = [
    "# Final India library search audit",
    "",
    `Generated ${result.generatedAt}. Every one of the **${summary.total.toLocaleString("en-US")} configured libraries** has an outcome. **${progress.counts["20 verified"] || 0} libraries reached 20 distinct verified books**; ${summary.verifiedBooks.toLocaleString("en-US")} library/book findings were verified.`,
    "",
    "This completes the initial audit pass. Partial results, unavailable catalogs, policy blocks and missing adapter support remain unresolved; a completed queue does not mean every library works. Historical pilot findings were not substituted for this run.",
    "",
    "| Catalog family | Libraries | 20 verified | 1–19 found | No verified books, no error | Blocked/failed | Verified books |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(families).map(
      ([family, g]) =>
        `| ${safe(family)} | ${g.total} | ${g.qualified} | ${g.partial} | ${g.empty} | ${g.blocked} | ${g.books} |`,
    ),
    "",
    "## Full evidence and per-library results",
    "",
    "- [Library outcomes and counts](library-status.csv)",
    "- [Every attempted query, returned count and evidence](searches.csv)",
    "- [Verified books and native identities](books.csv)",
    "- [Failed requests and record checks](failures.csv)",
    "- [Machine-readable final report](final-report.json)",
    "- [Full current library details](progress.json)",
    "- [Append-only history](events.jsonl)",
    "",
    "## Blockers and next actions",
    "",
    "| Reason | Libraries affected | Explanation | Next action |",
    "| --- | ---: | --- | --- |",
    ...Object.entries(causes).map(
      ([code, c]) =>
        `| ${safe(code)} | ${c.libraries} | ${safe(c.reason)} | ${safe(c.nextAction)} |`,
    ),
    "",
    `The frozen denominator excludes ${result.historicalOmittedMappings} historical omitted connection rows that still need identity reconciliation. It does not claim all institutions in India are included. Catalog presence and current borrowing availability remain distinct. No browser control, account creation, access-control bypass, bulk books/audio collection or production release was used.`,
    "",
  ];
  writeFileSync(join(store.root, "final-report.md"), lines.join("\n"));
  return result;
}
