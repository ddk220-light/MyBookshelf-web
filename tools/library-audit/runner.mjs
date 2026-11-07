import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { inventory } from "../../server/services/catalog-connectors/inventory.js";
import { hash } from "../../server/services/catalog-connectors/contracts.js";

export function initialize(
  store,
  { country = "IN", target = 20, libraryIds = null } = {},
) {
  if (existsSync(join(store.root, "manifest.json")))
    throw new Error("Run already initialized; resume it");
  if (target !== 20)
    throw new Error("Qualification target is 20 distinct books");
  const data = inventory({ country });
  if (libraryIds) {
    const selected = new Set(libraryIds);
    if (
      [...selected].some(
        (id) => !data.libraries.some((l) => l.libraryId === id),
      )
    )
      throw new Error("Unknown pilot target");
    data.universeTotal = data.total;
    data.libraries = data.libraries.filter((l) => selected.has(l.libraryId));
    data.total = data.libraries.length;
    data.inventoryHash = hash(data.libraries);
    data.scope = "selected_pilot";
  }
  const manifest = {
    schemaVersion: 1,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    target,
    inventory: data,
  };
  store.save("manifest.json", manifest);
  store.append({
    type: "run_initialized",
    runId: manifest.runId,
    inventoryHash: data.inventoryHash,
    total: data.total,
  });
  return manifest;
}
export function readManifest(store) {
  const m = JSON.parse(readFileSync(join(store.root, "manifest.json")));
  if (hash(m.inventory.libraries) !== m.inventory.inventoryHash)
    throw new Error("Inventory hash mismatch");
  return m;
}
export function withModes(events) {
  let mode = "qualify";
  return events.map((e) => {
    if (e.type === "run_started") mode = e.mode || "qualify";
    return { ...e, mode: e.mode || mode };
  });
}
export function termsFor(library) {
  let topics = [];
  if (/medical|health|nurs|pharma/i.test(library.name))
    topics = ["Anatomy", "Physiology", "Public health", "Medicine"];
  else if (/law|judicial/i.test(library.name))
    topics = ["Constitution", "Criminal law", "Jurisprudence"];
  else if (/engineering|technology|polytechnic|science/i.test(library.name))
    topics = ["Mathematics", "Physics", "Computer", "Engineering"];
  else if (/school|children/i.test(library.name))
    topics = ["Science", "Stories", "English", "Mathematics"];
  else topics = ["History", "Literature", "Education", "Science"];
  const local = /tamil/i.test(library.region || "")
    ? ["தமிழ்"]
    : /uttar|madhya|bihar|rajasthan|delhi/i.test(library.region || "")
      ? ["हिन्दी"]
      : [];
  return [
    ...new Set([
      "Wings of Fire",
      "The Discovery of India",
      ...topics,
      "Godan",
      "Malgudi Days",
      "India",
      "History",
      "Economics",
      "Poetry",
      ...local,
    ]),
  ];
}
function key(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function assessBook(record, query, existing) {
  if (!record?.recordId || !record.title)
    return { accepted: false, reason: "missing_identity" };
  const observation = record.observation || record.availability;
  const format = record.format || observation?.format || "";
  if (
    /journal|periodical|thesis|dissertation|article|serial|map|audio|video/i.test(
      format,
    )
  )
    return { accepted: false, reason: "not_a_book" };
  const candidates = [record.title, ...(record.authors || [])]
    .map(key)
    .join(" ");
  const terms = key(query).split(" ").filter(Boolean);
  if (!terms.length || !terms.every((t) => candidates.includes(t)))
    return { accepted: false, reason: "relevance_needs_review" };
  // Conservative within-library duplicate check. Keep every source record in
  // events; only the target counter groups identical titles/ISBNs.
  const title = key(
    record.title
      .split(/\s+\/\s+/)[0]
      .replace(/\b\d+(?:st|nd|rd|th)?\s+ed(?:ition)?\.?\b/gi, ""),
  );
  if (
    existing.some(
      (r) =>
        (r.recordId === record.recordId &&
          (r.connectionId || "primary") ===
            (record.connectionId || "primary")) ||
        key(
          r.title
            .split(/\s+\/\s+/)[0]
            .replace(/\b\d+(?:st|nd|rd|th)?\s+ed(?:ition)?\.?\b/gi, ""),
        ) === title ||
        (record.isbn && r.isbn === record.isbn),
    )
  )
    return { accepted: false, reason: "duplicate_book" };
  if (
    !["available", "none_available", "in_catalog"].includes(
      observation?.outcome,
    )
  )
    return { accepted: false, reason: "membership_unconfirmed" };
  return {
    accepted: true,
    reason: format
      ? "verified_book_record"
      : "catalog_record_format_needs_review",
    formatConfirmed: /book|print|monograph|text/i.test(format),
  };
}
export function reduceRun(manifest, events) {
  const rows = new Map(
    manifest.inventory.libraries.map((l) => [
      l.libraryId,
      {
        ...l,
        status: "Not checked/checking",
        books: [],
        attempts: 0,
        queries: [],
        blocker: null,
        nextAction: "Run initial qualification",
        lastCheckedAt: null,
      },
    ]),
  );
  const completed = new Set();
  for (const e of withModes(events)) {
    const row = rows.get(e.libraryId);
    if (!row) continue;
    if (e.type === "qualification_started") {
      row.previousQualifiedBooks = row.books.length;
      row.books = [];
      row.blocker = null;
      row.qualificationCycle = e.cycle;
      completed.delete(e.libraryId);
    }
    if (
      ["search_completed", "search_failed", "search_interrupted"].includes(
        e.type,
      )
    ) {
      row.attempts++;
      const { records, ...summary } = e;
      row.queries.push({ ...summary, returned: records?.length || 0 });
      row.lastCheckedAt = e.at;
    }
    if (
      e.type === "book_accepted" &&
      !row.books.some(
        (b) =>
          b.recordId === e.book.recordId &&
          (b.connectionId || "primary") === (e.connectionId || "primary"),
      )
    )
      row.books.push({ ...e.book, connectionId: e.connectionId || "primary" });
    if (e.type === "library_checkpoint" && e.mode !== "health") {
      row.blocker = e.blocker || null;
      row.nextAction = e.nextAction;
      row.lastAttemptState = e.state || "needs_review";
      row.lastCheckedAt = e.at;
      completed.add(e.libraryId);
      if (row.books.length >= manifest.target) row.lastQualifiedAt = e.at;
    }
    if (e.type === "health_completed" || e.type === "health_failed") {
      row.lastHealth = {
        at: e.at,
        outcome: e.outcome || "failed",
        code: e.code || null,
        fidelity: e.fidelity || null,
      };
    }
    if (e.type === "library_checkpoint" && e.mode === "health" && e.blocker)
      row.lastHealth = { at: e.at, outcome: "failed", code: e.blocker.code };
  }
  for (const r of rows.values()) {
    if (r.books.length >= manifest.target) r.status = "20 verified";
    else if (r.books.length) r.status = "1–19 found";
    else if (r.blocker) r.status = "Blocked/failed";
    else if (
      completed.has(r.libraryId) &&
      r.lastAttemptState !== "interrupted" &&
      !r.queries.some((q) => q.returned)
    )
      r.status = "No books found";
  }
  const libraries = [...rows.values()],
    counts = {};
  for (const r of libraries) counts[r.status] = (counts[r.status] || 0) + 1;
  return {
    runId: manifest.runId,
    generatedAt: new Date().toISOString(),
    total: libraries.length,
    target: manifest.target,
    counts,
    booksVerified: libraries.reduce((a, r) => a + r.books.length, 0),
    libraries,
  };
}

export async function run(
  store,
  service,
  {
    libraryIds = null,
    limit = Infinity,
    mode = "qualify",
    cycle = null,
    queries = null,
    field = null,
    signal: externalSignal,
    concurrency = 3,
    retryBlocked = false,
    retryReason = null,
    maxRecordsPerQuery = 40,
    allowFixtureEvidence = false,
  } = {},
) {
  const controller = new AbortController();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, controller.signal])
    : controller.signal;
  if (mode === "requalify" && !cycle)
    throw new Error("A stable qualification cycle ID is required");
  if (retryBlocked && !retryReason)
    throw new Error("A concrete retry reason is required");
  const manifest = readManifest(store);
  store.events({ repairTail: true });
  store.validate();
  const previous = reduceRun(manifest, store.events());
  const triedByLibrary = new Map();
  for (const e of withModes(store.events({ cached: true })))
    if (e.type === "query_checkpoint" && e.mode !== "health" && !e.partial) {
      if (!triedByLibrary.has(e.libraryId))
        triedByLibrary.set(e.libraryId, new Set());
      triedByLibrary
        .get(e.libraryId)
        .add(
          `${e.connectionId || "primary"}:${e.field || "default"}:${e.query}`,
        );
    }
  const requested = libraryIds ? new Set(libraryIds) : null;
  if (
    requested &&
    [...requested].some(
      (id) => !previous.libraries.some((l) => l.libraryId === id),
    )
  )
    throw new Error("Unknown target library");
  const work = previous.libraries
    .filter(
      (l) =>
        (!requested || requested.has(l.libraryId)) &&
        (mode === "health" ||
          (mode === "requalify" && l.qualificationCycle !== cycle) ||
          l.books.length < manifest.target) &&
        (!l.blocker || retryBlocked),
    )
    .slice(0, limit);
  const runAttempt = randomUUID();
  store.append({
    type: "run_started",
    runAttempt,
    mode,
    targets: work.length,
    retryReason,
    implementationHash: service.implementationHash || null,
  });
  const pending = [...work],
    busyOrigins = new Set();
  let startedLibraries = 0,
    completedLibraries = 0;
  const originFor = (l) => l.connections[0]?.origins?.[0] || l.libraryId;
  async function worker() {
    while (pending.length && !signal?.aborted) {
      // Do not let thousands of members on one union catalog occupy every
      // worker while independent catalog hosts could make progress.
      const index = pending.findIndex((l) => !busyOrigins.has(originFor(l)));
      if (index < 0) {
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      const [library] = pending.splice(index, 1),
        origin = originFor(library);
      busyOrigins.add(origin);
      startedLibraries++;
      let blocker = null;
      try {
        const reset =
          mode === "requalify" && library.qualificationCycle !== cycle;
        if (reset)
          store.append({
            type: "qualification_started",
            libraryId: library.libraryId,
            cycle,
          });
        const books = reset ? [] : [...library.books];
        const tried =
          mode === "requalify"
            ? new Set()
            : triedByLibrary.get(library.libraryId) || new Set();
        const routes = library.connections.filter(
          (c) => c.mode !== "unsupported",
        );
        if (!routes.length)
          blocker = {
            code: "UNSUPPORTED_PROFILE",
            reason: "No implemented public HTTP search method",
            action: "Review an official permitted catalog route",
          };
        const seeds =
          queries ||
          (mode === "health"
            ? [
                library.queries.find((q) => q.returned)?.query ||
                  termsFor(library)[0],
              ]
            : termsFor(library));
        for (const route of routes) {
          blocker = null;
          const routeField =
            field ||
            (mode === "health"
              ? library.queries.find(
                  (q) => q.returned && q.connectionId === route.connectionId,
                )?.profile?.field
              : null) ||
            (route.family === "egranthalaya" ? "title" : null);
          if (
            signal?.aborted ||
            (books.length >= manifest.target && mode !== "health")
          )
            break;
          for (const query of seeds) {
            if (
              signal?.aborted ||
              (books.length >= manifest.target && mode !== "health")
            )
              break;
            if (
              mode !== "health" &&
              !retryBlocked &&
              tried.has(
                `${route.connectionId}:${routeField || "default"}:${query}`,
              )
            )
              continue;
            let nextCursor = null,
              checked = 0;
            const seenPages = new Set();
            do {
              const attemptId = randomUUID();
              try {
                const result = await service.search(
                  {
                    libraryId: library.libraryId,
                    connectionId: route.connectionId,
                    query,
                    ...(routeField ? { field: routeField } : {}),
                    cursor: nextCursor,
                  },
                  { signal, attemptId },
                );
                const pageKey = hash(result.records.map((r) => r.recordId));
                if (seenPages.has(pageKey))
                  throw new Error("Repeated native page");
                seenPages.add(pageKey);
                store.append({
                  type: "search_completed",
                  mode,
                  libraryId: library.libraryId,
                  connectionId: route.connectionId,
                  query,
                  attemptId,
                  profile: result.effectiveProfile,
                  records: result.records.map(({ recordRef, ...r }) => r),
                  total: result.total,
                  page: { ...result.page, nextCursor: undefined },
                  fidelity: result.fidelity,
                  timing: result.timing,
                  usage: result.usage,
                  evidence: result.evidence,
                });
                if (mode === "health") {
                  store.append({
                    type: "health_completed",
                    libraryId: library.libraryId,
                    outcome:
                      result.freshness?.sourceContacted === false
                        ? "unknown"
                        : result.records.length
                          ? "positive"
                          : "empty",
                    fidelity: result.fidelity,
                    evidence: result.evidence,
                  });
                  break;
                }
                if (result.fidelity !== "website_equivalent") {
                  blocker = {
                    code: "EQUIVALENCE_UNPROVEN",
                    reason:
                      "Requests work but native website equivalence needs review",
                    action:
                      "Review request/display transformations and native result completeness",
                  };
                  break;
                }
                if (
                  !allowFixtureEvidence &&
                  (result.observationKind !== "live_http" ||
                    !result.freshness?.sourceContacted ||
                    !result.evidence?.length)
                )
                  throw new Error(
                    "Qualification requires fresh live HTTP evidence",
                  );
                for (const nativeRecord of result.records) {
                  const candidate = {
                    ...nativeRecord,
                    connectionId: route.connectionId,
                  };
                  if (
                    signal?.aborted ||
                    books.length >= manifest.target ||
                    checked >= maxRecordsPerQuery
                  )
                    break;
                  if (
                    books.some(
                      (b) =>
                        b.recordId === candidate.recordId &&
                        (b.connectionId || "primary") === route.connectionId,
                    )
                  )
                    continue;
                  checked++;
                  try {
                    const preliminary = assessBook(candidate, query, books);
                    // A duplicate or a title/author mismatch cannot gain the required
                    // title relevance from another request. Keep it for review cheaply.
                    if (
                      ["duplicate_book", "relevance_needs_review"].includes(
                        preliminary.reason,
                      )
                    ) {
                      store.append({
                        type: "book_rejected",
                        libraryId: library.libraryId,
                        connectionId: route.connectionId,
                        query,
                        book: (({ recordRef, ...record }) => record)(candidate),
                        observationKind: result.observationKind,
                        reason: preliminary.reason,
                        evidence: result.evidence,
                      });
                      continue;
                    }
                    const sufficient =
                      books.length > 0 &&
                      preliminary.accepted &&
                      preliminary.formatConfirmed;
                    const detail = sufficient
                      ? {
                          record: candidate,
                          evidence: [],
                          observationKind: result.observationKind,
                        }
                      : await service.resolve(candidate.recordRef, { signal });
                    if (
                      !allowFixtureEvidence &&
                      detail.observationKind !== "live_http"
                    )
                      throw new Error(
                        "Record proof requires live HTTP evidence",
                      );
                    const { recordRef: unusedRecordRef, ...record } =
                      detail.record;
                    const provedRecord = {
                      ...record,
                      connectionId: route.connectionId,
                    };
                    const decision = assessBook(provedRecord, query, books);
                    // Unknown material types remain review candidates, not passes.
                    const explicitBookScope =
                      result.effectiveProfile.nativeProfile?.material ===
                      "Books";
                    const accepted =
                      decision.accepted &&
                      (decision.formatConfirmed || explicitBookScope);
                    store.append({
                      type: accepted ? "book_accepted" : "book_rejected",
                      libraryId: library.libraryId,
                      connectionId: route.connectionId,
                      query,
                      book: provedRecord,
                      observationKind: allowFixtureEvidence
                        ? "fixture"
                        : result.observationKind,
                      reason: accepted
                        ? "identity_membership_relevance_and_book_proved"
                        : decision.reason,
                      evidence: [...result.evidence, ...detail.evidence],
                    });
                    if (accepted) books.push(provedRecord);
                  } catch (error) {
                    store.append({
                      type: signal.aborted
                        ? "record_interrupted"
                        : "record_failed",
                      libraryId: library.libraryId,
                      query,
                      recordId: candidate.recordId,
                      code: error.code || error.name,
                      evidence: error.evidence || [],
                    });
                  }
                }
                nextCursor =
                  checked >= maxRecordsPerQuery ? null : result.page.nextCursor;
              } catch (error) {
                const code = error.code || error.name || "CONNECTOR_ERROR";
                store.append({
                  type: signal.aborted ? "search_interrupted" : "search_failed",
                  mode,
                  libraryId: library.libraryId,
                  connectionId: route.connectionId,
                  query,
                  attemptId,
                  code,
                  reason: error.message,
                  evidence: error.evidence || [],
                });
                blocker = signal.aborted
                  ? null
                  : {
                      code,
                      reason: error.message,
                      action: /ROBOTS|BLOCKED|COOLDOWN/.test(code)
                        ? "Wait for permitted access or documented recovery"
                        : "Inspect evidence and fix request/parser before retry",
                    };
                nextCursor = null;
              }
            } while (
              nextCursor &&
              !signal?.aborted &&
              books.length < manifest.target &&
              !blocker
            );
            if (!signal?.aborted && !blocker)
              store.append({
                type: "query_checkpoint",
                mode,
                libraryId: library.libraryId,
                connectionId: route.connectionId,
                query,
                field: routeField || "default",
                checked,
                partial: checked >= maxRecordsPerQuery,
              });
            if (blocker || mode === "health") break;
          }
          if (blocker && /ROBOTS|BLOCKED|COOLDOWN/.test(blocker.code)) break;
        }
        if (
          !blocker &&
          !books.length &&
          store
            .events({ cached: true })
            .some(
              (e) =>
                e.type === "search_completed" &&
                e.libraryId === library.libraryId &&
                e.mode !== "health" &&
                e.records?.length,
            )
        )
          blocker = {
            code: "NO_VERIFIED_BOOKS",
            reason:
              "Catalog returned candidates, but none met the required book, relevance and membership evidence checks",
            action: "Review rejected records and institution-specific queries",
          };
        const nextAction =
          books.length >= manifest.target
            ? "Schedule fresh health checks"
            : blocker?.action ||
              "Review rejected candidates and add institution-specific queries";
        if (mode === "health" && blocker)
          store.append({
            type: "health_failed",
            libraryId: library.libraryId,
            code: blocker.code,
          });
        store.append({
          type: "library_checkpoint",
          mode,
          libraryId: library.libraryId,
          verifiedBooks: books.length,
          blocker,
          nextAction,
          state: signal?.aborted
            ? "interrupted"
            : books.length >= manifest.target
              ? "qualified"
              : blocker
                ? "blocked"
                : "needs_review",
        });
        if (++completedLibraries % 10 === 0)
          store.save(
            "progress.json",
            reduceRun(manifest, store.events({ cached: true })),
          );
      } finally {
        busyOrigins.delete(origin);
      }
    }
  }
  // Await every worker even if a local persistence operation fails. Releasing
  // the writer lock while another worker is still appending is unsafe.
  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.max(1, Math.min(concurrency, 8)) }, async () => {
      try {
        await worker();
      } catch (error) {
        controller.abort();
        throw error;
      }
    }),
  );
  const fatal = outcomes.find((result) => result.status === "rejected");
  if (fatal) throw fatal.reason;
  store.append({
    type: signal?.aborted ? "run_interrupted" : "run_completed",
    runAttempt,
    mode,
    processed: completedLibraries,
    started: startedLibraries,
  });
  const progress = reduceRun(manifest, store.events({ cached: true }));
  store.save("progress.json", progress);
  return progress;
}
