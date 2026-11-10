import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { text } from "../../server/services/providers/catalogMarkup.js";
import { rejectChallenge } from "../../server/services/providers/discoveryAcademicParsers.js";
import { parseIndcatRecord } from "../../server/services/providers/indcat.js";
import { parsePmbRecord } from "../../server/services/providers/communityPmb.js";
import { getLibraryById } from "../../server/services/directory.js";
import { VMEDU_CLIENT } from "../../server/services/providers/catalogNative.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { csvCell } from "./report.mjs";

function normalized(value) {
  return text(value)
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function candidateLink(record) {
  if (
    record.nativeLookup?.kind === "metadata_post_lookup" &&
    record.nativeLookup.operation === "getPublicLinkIndividualResourceData" &&
    record.nativeLookup.path === "/api/library/publicLink.php"
  )
    return {
      url: VMEDU_CLIENT.origin + record.nativeLookup.path,
      kind: "metadata_post_lookup",
    };
  const observation = record.observation || record.availability || {};
  if (observation.catalogLinkKind === "record" && observation.catalogUrl)
    return { url: observation.catalogUrl, kind: "record" };
  return {
    url: record.catalogUrl || observation.catalogUrl || null,
    kind: record.linkKind || observation.catalogLinkKind || "missing",
  };
}
export function buildLinkQueue(events) {
  const jobs = new Map();
  for (const event of events) {
    const records =
      event.type === "search_completed"
        ? event.records || []
        : event.type === "book_accepted"
          ? [event.book]
          : [];
    for (const record of records.filter(Boolean)) {
      if (!event.libraryId || !record.recordId) continue;
      const link = candidateLink(record),
        connectionId = event.connectionId || "primary";
      const nativeId =
        record.nativeRecordId ||
        record.sourceId ||
        (!/^(?:a1_|c1_)/.test(record.recordId) ? record.recordId : null);
      const key = hash([
        event.libraryId,
        connectionId,
        record.recordId,
        link.url,
        link.kind,
      ]);
      const existing = jobs.get(key);
      if (existing) {
        existing.sourceEvents.push(event.eventId);
        continue;
      }
      jobs.set(key, {
        jobId: key,
        libraryId: event.libraryId,
        connectionId,
        recordId: record.recordId,
        nativeId,
        title: record.title,
        url: link.url,
        kind: link.kind,
        ...(record.nativeLookup ? { nativeLookup: record.nativeLookup } : {}),
        sourceObservedAt: event.at,
        sourceEvents: [event.eventId],
      });
    }
  }
  return [...jobs.values()];
}
export function confirmItemIdentity(job, response) {
  let initial, final;
  try {
    initial = new URL(job.url);
    final = new URL(response.url);
  } catch {
    return { identityConfirmed: false, reason: "invalid_item_url" };
  }
  const sameItemUrl =
    initial.origin === final.origin &&
    initial.pathname === final.pathname &&
    [...initial.searchParams].every(([key, value]) =>
      final.searchParams.getAll(key).includes(value),
    );
  const nativeId = String(job.nativeId || "");
  let nativeIdInUrl =
    Boolean(nativeId) &&
    ([...final.searchParams].some(
      ([key, value]) =>
        /^(?:biblionumber|id|tlno|record|recordid|titleid|title_no|enc_materialid)$/i.test(
          key,
        ) && value === nativeId,
    ) ||
      final.pathname.split("/").includes(nativeId));
  const headings = [
    ...response.text.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/gi),
  ].map((m) => text(m[1]));
  if (
    final.origin === "https://indcat.inflibnet.ac.in" &&
    final.pathname === "/index.php/search/book_search"
  ) {
    headings.length = 0;
    const library = getLibraryById(job.libraryId),
      alternate = /^alternate-([1-9]\d*)$/.exec(job.connectionId || "primary");
    const entry = alternate
      ? library?.alternateCatalogs?.[Number(alternate[1]) - 1]
      : library;
    try {
      const identity = JSON.parse(
        Buffer.from(
          final.searchParams.get("getDetails") || "",
          "base64",
        ).toString("utf8"),
      );
      nativeIdInUrl =
        entry?.platform === "indcat" &&
        String(identity.book_detail) === nativeId &&
        (identity.singleclg || identity.university) ===
          entry.indcatInstitutionCode;
      // The saved source event supplies scoped-search provenance; the actual
      // detail must independently retain this member's book/holding identity.
      const record = nativeIdInUrl
        ? parseIndcatRecord(response.text, entry, nativeId, null, {
            confirmedMemberRecord: true,
          })
        : null;
      if (record)
        headings.push(
          record.title.replace(/\s*\/\s*(?:by|edited by)\s+.+$/i, ""),
        );
      else nativeIdInUrl = false;
    } catch {
      nativeIdInUrl = false;
    }
  }
  // IUST's advertised More Details link is an inline metadata fragment. It
  // carries an explicit native ID and a labelled Title cell, not a heading.
  if (
    job.kind === "metadata_fragment" &&
    final.origin === "https://webopac.iust.ac.in" &&
    final.pathname === "/ViewDetails.aspx"
  ) {
    headings.length = 0;
    const id = response.text.match(
      /<span\b[^>]*\bid=['"]id['"][^>]*>([\s\S]*?)<\/span>/i,
    );
    const title = response.text.match(
      /<th\b[^>]*>\s*Title\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i,
    );
    nativeIdInUrl = nativeIdInUrl && text(id?.[1] || "") === nativeId;
    if (nativeIdInUrl && title) headings.push(text(title[1]));
  }
  if (
    final.origin === "https://mediatheques-afinde.org" &&
    final.pathname === "/index.php" &&
    final.searchParams.get("lvl") === "notice_display"
  ) {
    headings.length = 0;
    const library = getLibraryById(job.libraryId),
      alternate = /^alternate-([1-9]\d*)$/.exec(job.connectionId || "primary"),
      entry = alternate
        ? library?.alternateCatalogs?.[Number(alternate[1]) - 1]
        : library;
    // PMB's title is a labelled catalog field, not an HTML heading. Require
    // canonical native identity, the requested branch view and actual local
    // holdings; a matching title elsewhere in this network is insufficient.
    nativeIdInUrl =
      entry?.communityCatalog?.family === "pmb" &&
      final.searchParams.getAll("id").length === 1 &&
      final.searchParams.get("id") === nativeId &&
      final.searchParams.getAll("opac_view").length === 1 &&
      final.searchParams.get("opac_view") === entry.communityCatalog.scope;
    try {
      const record = nativeIdInUrl
        ? parsePmbRecord(response.text, entry, nativeId)
        : null;
      if (record) headings.push(record.title);
      else nativeIdInUrl = false;
    } catch {
      nativeIdInUrl = false;
    }
  }
  const titleConfirmed =
    Boolean(normalized(job.title)) &&
    headings.some((h) => normalized(h) === normalized(job.title));
  return {
    identityConfirmed: sameItemUrl && nativeIdInUrl && titleConfirmed,
    sameItemUrl,
    nativeIdInUrl,
    titleConfirmed,
    reason: !sameItemUrl
      ? "redirect_changed_item_identity"
      : !nativeIdInUrl
        ? "native_identity_not_confirmed"
        : !titleConfirmed
          ? "item_title_not_confirmed"
          : "native_item_url_and_heading_match",
  };
}
export async function verifyItemLink(
  job,
  coordinator,
  descriptor,
  { signal } = {},
) {
  const base = {
    jobId: job.jobId,
    libraryId: job.libraryId,
    connectionId: job.connectionId,
    recordId: job.recordId,
    nativeId: job.nativeId,
    title: job.title,
    url: job.url,
    linkKind: job.kind,
    sourceObservedAt: job.sourceObservedAt,
    sourceEvents: job.sourceEvents,
  };
  if (job.kind === "metadata_post_lookup")
    return {
      ...base,
      method: "POST",
      tested: false,
      identityConfirmed: false,
      outcome: "post_only_metadata_lookup_no_item_url",
      permanentItemURL: null,
      itemUrlAvailable: false,
      nativeLookup: job.nativeLookup,
      reason:
        "Native public modal metadata uses POST; separate native lookup evidence does not create a permanent item URL",
      evidence: [],
    };
  if (
    !job.url ||
    !["record", "metadata_fragment", "metadata_post_lookup"].includes(job.kind)
  )
    return {
      ...base,
      tested: false,
      identityConfirmed: false,
      outcome: job.url ? "search_or_catalog_handoff_only" : "missing_item_link",
      evidence: [],
    };
  const ctx = coordinator.context({
    libraryId: job.libraryId,
    allowedOrigins: descriptor.origins,
    signal,
    timeoutMs: 120000,
  });
  const hops = [];
  try {
    let url = new URL(job.url);
    for (let i = 0; i < 4; i++) {
      const response = await ctx.request(url.toString(), {
        headers: { Accept: "text/html, application/xhtml+xml" },
        allowedResponseTypes: ["text/html", "application/xhtml+xml"],
        maxResponseBytes: 2 * 1024 * 1024,
      });
      hops.push({
        url: response.url,
        status: response.status,
        contentType: response.headers.get("content-type") || null,
        bodySkipped: response.bodySkipped || null,
      });
      if (response.bodySkipped)
        return {
          ...base,
          tested: true,
          outcome: "non_html_content_not_downloaded",
          identityConfirmed: false,
          hops,
          evidence: ctx.evidence,
        };
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        url = new URL(response.headers.get("location"), url);
        continue;
      }
      if (!response.ok)
        return {
          ...base,
          tested: true,
          outcome: "http_error",
          identityConfirmed: false,
          hops,
          evidence: ctx.evidence,
        };
      rejectChallenge(response.text);
      const proof = confirmItemIdentity(job, response);
      return {
        ...base,
        tested: true,
        outcome: proof.identityConfirmed
          ? "item_identity_confirmed"
          : "http_success_identity_unconfirmed",
        ...proof,
        finalUrl: response.url,
        hops,
        evidence: ctx.evidence,
      };
    }
    return {
      ...base,
      tested: true,
      outcome: "redirect_limit",
      identityConfirmed: false,
      hops,
      evidence: ctx.evidence,
    };
  } catch (error) {
    if (error.code === "CATALOG_PROVIDER_BLOCKED") {
      const origin = new URL(hops.at(-1)?.url || job.url).origin;
      coordinator.refusals.set(origin, {
        status: null,
        kind: "html_access_guard",
        reason:
          "An HTML access guard was triggered; review the saved primary evidence before another request",
        at: new Date().toISOString(),
        evidence: ctx.evidence,
        attemptId: ctx.attemptId,
        sourceRunDirectory: coordinator.store?.root,
      });
    }
    return {
      ...base,
      attempted: true,
      tested:
        hops.length > 0 ||
        ctx.responses.some(
          (r) => !new URL(r.url).pathname.endsWith("/robots.txt"),
        ),
      outcome: signal?.aborted ? "interrupted" : "blocked_or_failed",
      identityConfirmed: false,
      code: error.code || error.name,
      reason: error.message,
      retryAfterAt: error.retryAfterAt || null,
      causeAttemptId: error.causeAttemptId || null,
      causeRunDirectory: error.causeRunDirectory || null,
      hops,
      evidence: ctx.evidence,
    };
  }
}

export function saveLinkResult(store, result, metadata = {}) {
  const complete = result.outcome !== "interrupted";
  store.append({
    type: complete
      ? "link_verification_completed"
      : "link_verification_interrupted",
    ...metadata,
    ...result,
  });
  return complete;
}

export function pendingLinkRetries(events) {
  const pending = new Set();
  for (const event of events) {
    if (event.type === "link_verification_retry_requested")
      for (const id of event.jobIds) pending.add(id);
    if (event.type === "link_verification_completed")
      pending.delete(event.jobId);
  }
  return pending;
}

export function linkVerificationReport(store) {
  const pending = pendingLinkRetries(store.events({ cached: true }));
  const latest = new Map();
  for (const event of store.events({ cached: true }))
    if (event.type === "link_verification_completed")
      latest.set(event.jobId, event);
  const queuePath = join(store.root, "link-verification-queue.json");
  const queue = existsSync(queuePath)
    ? JSON.parse(readFileSync(queuePath)).jobs
    : [];
  if ([...pending].some((id) => !queue.some((job) => job.jobId === id)))
    throw Error(
      "A pending retry no longer maps to the current link queue; reconcile its saved identity",
    );
  const rows = queue.map((job) => ({
    ...job,
    ...latest.get(job.jobId),
    outcome: pending.has(job.jobId)
      ? "retry_pending"
      : latest.get(job.jobId)?.outcome || "unchecked",
  }));
  const fields = [
    "jobId",
    "libraryId",
    "connectionId",
    "recordId",
    "nativeId",
    "title",
    "url",
    "kind",
    "method",
    "permanentItemURL",
    "itemUrlAvailable",
    "nativeLookup",
    "tested",
    "outcome",
    "identityConfirmed",
    "finalUrl",
    "code",
    "reason",
    "retryAfterAt",
    "causeAttemptId",
    "causeRunDirectory",
    "sourceObservedAt",
    "at",
    "hops",
    "evidence",
    "sourceEvents",
  ];
  const cell = (v) =>
    csvCell(typeof v === "object" ? JSON.stringify(v) : (v ?? ""));
  writeFileSync(
    join(store.root, "link-verification.csv"),
    [fields, ...rows.map((row) => fields.map((k) => row[k]))]
      .map((row) => row.map(cell).join(","))
      .join("\n") + "\n",
  );
  const summary = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    total: queue.length,
    processed: rows.filter(
      (row) => !["unchecked", "retry_pending"].includes(row.outcome),
    ).length,
    checked: rows.filter(
      (row) => !["unchecked", "retry_pending"].includes(row.outcome),
    ).length,
    checkedDefinition:
      "Legacy processed-job count, including handoffs and refusals; not successful item requests",
    itemResponsesObserved: rows.filter(
      (row) => row.tested === true && row.outcome !== "retry_pending",
    ).length,
    classifiedWithoutItemResponse: rows.filter(
      (row) =>
        !["unchecked", "retry_pending"].includes(row.outcome) &&
        row.tested !== true,
    ).length,
    pendingRetries: pending.size,
    remaining: rows.filter((row) =>
      ["unchecked", "retry_pending"].includes(row.outcome),
    ).length,
    identityConfirmed: rows.filter(
      (row) => row.identityConfirmed && row.outcome !== "retry_pending",
    ).length,
    getItemLinksConfirmed: rows.filter(
      (row) =>
        row.identityConfirmed &&
        row.kind !== "metadata_post_lookup" &&
        row.outcome !== "retry_pending",
    ).length,
    postOnlyMetadataLookups: rows.filter(
      (row) =>
        row.kind === "metadata_post_lookup" &&
        row.outcome !== "unchecked" &&
        row.outcome !== "retry_pending",
    ).length,
    outcomes: Object.fromEntries(
      [...new Set(rows.map((row) => row.outcome))].map((outcome) => [
        outcome,
        rows.filter((row) => row.outcome === outcome).length,
      ]),
    ),
  };
  store.save("link-verification-summary.json", summary);
  return summary;
}
