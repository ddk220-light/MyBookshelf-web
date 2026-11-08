import { hash } from "../../server/services/catalog-connectors/contracts.js";
import { text } from "../../server/services/providers/catalogMarkup.js";
import { rejectChallenge } from "../../server/services/providers/discoveryAcademicParsers.js";
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
  const nativeIdInUrl =
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
  // IUST's advertised More Details link is an inline metadata fragment. It
  // carries an explicit native ID and a labelled Title cell, not a heading.
  if (
    job.kind === "metadata_fragment" &&
    final.origin === "https://webopac.iust.ac.in" &&
    final.pathname === "/ViewDetails.aspx"
  ) {
    const id = response.text.match(
      /<span\b[^>]*\bid=['"]id['"][^>]*>([\s\S]*?)<\/span>/i,
    );
    const title = response.text.match(
      /<th\b[^>]*>\s*Title\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i,
    );
    if (text(id?.[1] || "") === nativeId && title)
      headings.push(text(title[1]));
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
  if (!job.url || !["record", "metadata_fragment"].includes(job.kind))
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
    return {
      ...base,
      attempted: true,
      tested:
        hops.length > 0 ||
        ctx.responses.some(
          (r) => !new URL(r.url).pathname.endsWith("/robots.txt"),
        ),
      outcome: "blocked_or_failed",
      identityConfirmed: false,
      code: error.code || error.name,
      reason: error.message,
      hops,
      evidence: ctx.evidence,
    };
  }
}

export function linkVerificationReport(store) {
  const latest = new Map();
  for (const event of store.events({ cached: true }))
    if (event.type === "link_verification_completed")
      latest.set(event.jobId, event);
  const queuePath = join(store.root, "link-verification-queue.json");
  const queue = existsSync(queuePath)
    ? JSON.parse(readFileSync(queuePath)).jobs
    : [];
  const rows = queue.map((job) => ({
    ...job,
    ...latest.get(job.jobId),
    outcome: latest.get(job.jobId)?.outcome || "unchecked",
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
    "tested",
    "outcome",
    "identityConfirmed",
    "finalUrl",
    "code",
    "reason",
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
    checked: rows.filter((row) => row.outcome !== "unchecked").length,
    remaining: rows.filter((row) => row.outcome === "unchecked").length,
    identityConfirmed: rows.filter((row) => row.identityConfirmed).length,
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
