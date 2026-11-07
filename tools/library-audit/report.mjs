import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readManifest, reduceRun } from "./runner.mjs";
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
const csv = (fields, rows) =>
  [
    fields,
    ...rows.map((r) =>
      fields.map((f) =>
        typeof r[f] === "object" ? JSON.stringify(r[f]) : r[f],
      ),
    ),
  ]
    .map((r) => r.map(csvCell).join(","))
    .join("\n") + "\n";
export function report(store) {
  store.validate();
  const events = store.events(),
    summary = reduceRun(readManifest(store), events);
  const rows = summary.libraries.map((l) => ({
    libraryId: l.libraryId,
    name: l.name,
    country: l.country,
    region: l.region,
    family: l.connections[0].family,
    status: l.status,
    verifiedBooks: l.books.length,
    target: 20,
    attempts: l.attempts,
    lastCheckedAt: l.lastCheckedAt,
    health: l.lastHealth?.outcome || "not_checked",
    healthAt: l.lastHealth?.at || "",
    healthCode: l.lastHealth?.code || "",
    blocker: l.blocker?.code || "",
    blockerReason: l.blocker?.reason || "",
    nextAction: l.nextAction,
  }));
  const searches = events
    .filter((e) =>
      ["search_completed", "search_failed", "search_interrupted"].includes(
        e.type,
      ),
    )
    .map((e) => ({
      libraryId: e.libraryId,
      at: e.at,
      query: e.query,
      connectionId: e.connectionId,
      outcome: e.type,
      attemptId: e.attemptId,
      returned: e.records?.length || 0,
      nativeTotal: e.total?.value ?? "",
      code: e.code || "",
      reason: e.reason || "",
      usage: e.usage,
      profile: e.profile,
      evidence: e.evidence,
    }));
  const books = events
    .filter((e) => e.type === "book_accepted")
    .map((e) => ({
      libraryId: e.libraryId,
      query: e.query,
      ...e.book,
      connectionId: e.connectionId || "primary",
      evidence: e.evidence,
    }));
  const failures = events
    .filter((e) => /failed$/.test(e.type))
    .map((e) => ({
      libraryId: e.libraryId,
      at: e.at,
      type: e.type,
      query: e.query,
      code: e.code,
      causeCode: e.causeCode || "",
      reason: e.reason || "",
      evidence: e.evidence,
    }));
  store.save("progress.json", summary);
  for (const [name, fields, data] of [
    [
      "library-status",
      [
        "libraryId",
        "name",
        "country",
        "region",
        "family",
        "status",
        "verifiedBooks",
        "target",
        "attempts",
        "lastCheckedAt",
        "health",
        "healthAt",
        "healthCode",
        "blocker",
        "blockerReason",
        "nextAction",
      ],
      rows,
    ],
    [
      "searches",
      [
        "libraryId",
        "at",
        "query",
        "connectionId",
        "outcome",
        "attemptId",
        "returned",
        "nativeTotal",
        "code",
        "reason",
        "usage",
        "profile",
        "evidence",
      ],
      searches,
    ],
    [
      "books",
      [
        "libraryId",
        "query",
        "connectionId",
        "recordId",
        "title",
        "authors",
        "isbn",
        "catalogUrl",
        "observation",
        "evidence",
      ],
      books,
    ],
    [
      "failures",
      [
        "libraryId",
        "at",
        "type",
        "query",
        "code",
        "causeCode",
        "reason",
        "evidence",
      ],
      failures,
    ],
  ])
    writeFileSync(join(store.root, `${name}.csv`), csv(fields, data));
  const requests = events.filter((e) => e.type === "response_received");
  const durations = requests.map((e) => e.durationMs).sort((a, b) => a - b);
  const metrics = {
    sourceResponses: requests.length,
    sourceBytes: requests.reduce((a, e) => a + e.bytes, 0),
    p50UpstreamMs: durations[Math.floor(durations.length * 0.5)] ?? null,
    p95UpstreamMs: durations[Math.floor(durations.length * 0.95)] ?? null,
    failedSearches: failures.filter((e) => e.type === "search_failed").length,
    verifiedBooks: summary.booksVerified,
    libraries: summary.counts,
  };
  metrics.byFamily = {};
  for (const row of summary.libraries) {
    const family = row.connections[0].family,
      group = (metrics.byFamily[family] ||= {
        total: 0,
        booksVerified: 0,
        statuses: {},
        health: {},
      });
    group.total++;
    group.booksVerified += row.books.length;
    group.statuses[row.status] = (group.statuses[row.status] || 0) + 1;
    const health = row.lastHealth?.outcome || "not_checked";
    group.health[health] = (group.health[health] || 0) + 1;
  }
  store.save("metrics.json", metrics);
  const body = summary.libraries
    .map(
      (l) =>
        `<details data-search="${escape([l.libraryId, l.name, l.country, l.region, l.connections[0].family, l.status, l.blocker?.code].join(" ").toLowerCase())}"><summary>${escape(l.name)} — ${l.books.length}/20 — ${escape(l.status)}</summary><p>${escape(l.libraryId)} · ${escape(l.nextAction)}</p><h3>Books</h3><ul>${l.books.map((b) => `<li>${escape(b.title)} (${escape(b.recordId)})</li>`).join("")}</ul><h3>Search attempts</h3><ul>${l.queries.map((q) => `<li>${escape(q.query)} — ${escape(q.code || `${q.returned || 0} returned`)} · ${escape(q.at)}</li>`).join("")}</ul></details>`,
    )
    .join("\n");
  writeFileSync(
    join(store.root, "report.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Library connector audit</title><style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:1rem}input{font:inherit;width:95%;padding:.7rem}details{border-bottom:1px solid #ccc;padding:1rem 0}summary{cursor:pointer}h1{font-size:1.7rem}</style><h1>Library connector audit</h1><p>${summary.total} libraries · ${summary.booksVerified} verified books · ${escape(summary.generatedAt)}</p><p>${escape(JSON.stringify(summary.counts))}</p><label>Filter by library, country, region, family or status <input id="filter" type="search"></label><p><a href="library-status.csv">Libraries CSV</a> · <a href="searches.csv">Searches CSV</a> · <a href="books.csv">Books CSV</a> · <a href="failures.csv">Failures CSV</a></p>${body}<script>document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('details').forEach(d=>d.hidden=!d.dataset.search.includes(q))})</script></html>`,
  );
  return {
    total: summary.total,
    counts: summary.counts,
    booksVerified: summary.booksVerified,
    metrics,
  };
}
