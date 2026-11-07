import { readFileSync, readdirSync } from "node:fs";
import { getLibraryById } from "../directory.js";
import { getProvider } from "../providers/index.js";
import * as koha from "../providers/koha.js";
import * as eg from "../providers/egranthalaya.js";
import * as indcat from "../providers/indcat.js";
import * as libman from "../providers/libman.js";
import * as vufind from "../providers/vufind.js";
import { connectorContext } from "./context.js";
import { describe } from "./inventory.js";
import { searchProfile, tokens, hash, failure, VERSION } from "./contracts.js";
import { verifyNativePage } from "./fidelity.js";

const implementationFiles = [
  "./",
  "../providers/",
  "../../../tools/library-audit/",
].flatMap((dir) => {
  const base = new URL(dir, import.meta.url);
  return readdirSync(base)
    .filter((name) => /\.(?:js|mjs)$/.test(name) && !name.includes(".test."))
    .sort()
    .map((name) => [dir + name, readFileSync(new URL(name, base), "utf8")]);
});
const implementationHash = hash(implementationFiles);

const native = { koha, egranthalaya: eg, indcat, libman, vufind };
export class ConnectorService {
  constructor({
    coordinator,
    secret,
    lookup = getLibraryById,
    providerFor = getProvider,
  }) {
    this.implementationHash = implementationHash;
    this.coordinator = coordinator;
    this.refs = tokens(secret);
    this.lookup = lookup;
    this.providerFor = providerFor;
  }
  connection(libraryId, connectionId = "primary") {
    const library = this.lookup(libraryId);
    if (!library) throw failure("LIBRARY_NOT_FOUND", "Unknown library", 404);
    const match = /^alternate-([1-9]\d*)$/.exec(connectionId);
    const entry =
      connectionId === "primary"
        ? library
        : match
          ? library.alternateCatalogs?.[Number(match[1]) - 1]
          : null;
    if (!entry)
      throw failure("CONNECTION_NOT_FOUND", "Unknown catalog connection", 404);
    return {
      library,
      entry: { ...entry, alternateCatalogs: [] },
      descriptor: describe(entry, connectionId),
    };
  }
  capabilities(id) {
    const { library } = this.connection(id);
    return {
      libraryId: id,
      connections: [
        describe(library),
        ...(library.alternateCatalogs || []).map((e, i) =>
          describe(e, `alternate-${i + 1}`),
        ),
      ],
    };
  }
  async execute(libraryId, connectionId, operation, task, options = {}) {
    const route = this.connection(libraryId, connectionId),
      started = Date.now();
    const ctx = this.coordinator.context({
      libraryId,
      allowedOrigins: route.descriptor.origins,
      signal: options.signal,
      attemptId: options.attemptId,
    });
    try {
      const value = await connectorContext.run(ctx, () => task(route, ctx));
      const at = new Date().toISOString();
      return {
        ...value,
        requestId: ctx.attemptId,
        schemaVersion: 1,
        adapterVersion: VERSION,
        implementationHash,
        observationKind: this.coordinator.observationKind,
        libraryId,
        connectionId,
        freshness: {
          observedAt: at,
          servedAt: at,
          cacheStatus: "miss",
          sourceContacted: ctx.requests > 0,
        },
        timing: {
          totalMs: Date.now() - started,
          queueMs: ctx.queueMs,
          upstreamMs: ctx.upstreamMs,
          processingMs: Math.max(
            0,
            Date.now() - started - ctx.queueMs - ctx.upstreamMs,
          ),
        },
        usage: { requests: ctx.requests, bytes: ctx.bytes },
        evidence: ctx.evidence,
      };
    } catch (e) {
      e.attemptId = ctx.attemptId;
      e.evidence = ctx.evidence;
      this.coordinator.store?.append({
        type: "operation_failed",
        operation,
        attemptId: ctx.attemptId,
        libraryId,
        code: e.code || "CONNECTOR_ERROR",
        evidence: ctx.evidence,
        usage: { requests: ctx.requests, bytes: ctx.bytes },
      });
      throw e;
    }
  }
  async search(input, options = {}) {
    const profile = searchProfile(input),
      route = this.connection(profile.libraryId, profile.connectionId);
    const field = input.field || route.descriptor.fields[0];
    if (!route.descriptor.fields.includes(field))
      throw failure(
        "UNSUPPORTED_PROFILE",
        "This connector does not support the requested field",
      );
    profile.field = field;
    const profileHash = hash({ ...profile, cursor: null }),
      configHash = hash(route.entry);
    let paging = {};
    if (profile.cursor) {
      const c = this.refs.read(profile.cursor);
      if (
        c.kind !== "page" ||
        c.profileHash !== profileHash ||
        c.configHash !== configHash ||
        c.version !== VERSION
      )
        throw failure(
          "INVALID_CURSOR",
          "Cursor belongs to another profile/version",
          400,
        );
      paging = c.paging;
    }
    return this.execute(
      profile.libraryId,
      profile.connectionId,
      "search",
      async ({ entry, descriptor }, ctx) => {
        if (descriptor.mode === "unsupported")
          throw failure(
            "UNSUPPORTED_PROFILE",
            "No implemented public HTTP search for this library",
          );
        const adapter = native[entry.platform];
        if (profile.cursor && !adapter)
          throw failure(
            "UNSUPPORTED_PROFILE",
            "This legacy connector has no native pagination",
          );
        const result =
          descriptor.mode === "native_http"
            ? await adapter.searchNativeCatalog(entry, profile.query, {
                ...paging,
                field: profile.field,
              })
            : await this.providerFor(entry).searchCatalog(profile.query);
        const rows = Array.isArray(result) ? result : result.records;
        if (!Array.isArray(rows))
          throw failure(
            "INVALID_SOURCE_RESPONSE",
            "No recognized result page",
            502,
          );
        if (
          rows.some(
            (r) =>
              typeof r.recordId !== "string" ||
              !r.recordId ||
              typeof r.title !== "string" ||
              !r.title,
          )
        )
          throw failure(
            "INVALID_SOURCE_RESPONSE",
            "Invalid record identity or title",
            502,
          );
        if (
          result.total != null &&
          (!Number.isSafeInteger(result.total) || result.total < rows.length)
        )
          throw failure("INVALID_SOURCE_RESPONSE", "Invalid native total", 502);
        const fidelityCheck =
          descriptor.mode === "native_http"
            ? verifyNativePage(entry.platform, ctx.responses, rows)
            : { verified: false, reason: "legacy_request_recipe_pending" };
        const records = rows.map((r, index) => ({
          ...r,
          catalogUrl: r.catalogUrl || descriptor.catalogUrl,
          linkKind: r.catalogUrl ? "record" : "catalog",
          nativeRank: index + 1,
          recordRef: this.refs.sign({
            kind: "record",
            libraryId: profile.libraryId,
            connectionId: profile.connectionId,
            recordId: r.recordId,
            configHash,
            version: VERSION,
            expiresAt: Date.now() + 86400000,
          }),
        }));
        const nextPaging =
          result.nextOffset != null
            ? { offset: result.nextOffset }
            : result.nextPage != null
              ? { page: result.nextPage }
              : null;
        return {
          requestedProfile: profile,
          effectiveProfile: {
            ...profile,
            cursor: undefined,
            nativeProfile:
              entry.platform === "egranthalaya"
                ? {
                    material: "Books",
                    field: profile.field === "title" ? "TITLE" : "ALL",
                    operator: "LIKE",
                    sort: "TITLE ASC",
                    pageSize: 20,
                  }
                : entry.platform === "indcat"
                  ? { field: "allfields", operator: "free", pageSize: 10 }
                  : entry.platform === "vufind"
                    ? { field: "Title", pageSize: 10 }
                    : entry.platform === "libman"
                      ? { field: "TITLE" }
                      : { field: "kw" },
          },
          fidelity: fidelityCheck.verified
            ? "website_equivalent"
            : "unverified",
          fidelityCheck,
          records,
          total: {
            value: result.total ?? null,
            relation: result.total == null ? "unknown" : "exact",
          },
          page: {
            returned: records.length,
            hasMore: result.hasMore ?? null,
            complete: fidelityCheck.verified,
            continuationUnsupported: result.continuationUnsupported || false,
            nextCursor: nextPaging
              ? this.refs.sign({
                  kind: "page",
                  profileHash,
                  configHash,
                  version: VERSION,
                  paging: nextPaging,
                  expiresAt: Date.now() + 3600000,
                })
              : null,
          },
        };
      },
      options,
    );
  }
  async resolve(recordRef, options = {}) {
    const ref = this.refs.read(recordRef);
    if (ref.kind !== "record")
      throw failure("INVALID_CURSOR", "Expected a record reference", 400);
    return this.execute(
      ref.libraryId,
      ref.connectionId,
      "resolve",
      async ({ entry }) => {
        if (hash(entry) !== ref.configHash || ref.version !== VERSION)
          throw failure("CONFIG_CHANGED", "Catalog configuration changed", 409);
        const provider = this.providerFor(entry);
        if (!provider?.resolveCatalogRecord)
          throw failure(
            "UNSUPPORTED_PROFILE",
            "Record resolution not supported",
          );
        const record = await provider.resolveCatalogRecord(ref.recordId);
        if (!record || record.recordId !== ref.recordId)
          throw failure(
            "INVALID_SOURCE_RESPONSE",
            "Record identity changed",
            502,
          );
        return {
          record: {
            ...record,
            catalogUrl: record.catalogUrl || entry.catalogUrl,
            linkKind: record.catalogUrl ? "record" : "catalog",
          },
        };
      },
      options,
    );
  }
}
