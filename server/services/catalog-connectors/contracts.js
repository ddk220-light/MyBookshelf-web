import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const VERSION = "1.0.0";
export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export function failure(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}
export function searchProfile(input) {
  const allowed = new Set([
    "libraryId",
    "connectionId",
    "query",
    "field",
    "filters",
    "locale",
    "sort",
    "pageSize",
    "cursor",
    "semantics",
    "freshness",
  ]);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.has(k))
  )
    throw failure("INVALID_QUERY", "Unknown request fields", 400);
  if (
    typeof input.libraryId !== "string" ||
    !input.libraryId ||
    input.libraryId.length > 250
  )
    throw failure("INVALID_QUERY", "Library ID required", 400);
  if (
    typeof input.query !== "string" ||
    !input.query.trim() ||
    input.query !== input.query.trim() ||
    input.query.length > 160 ||
    /[\x00-\x1f\x7f]/.test(input.query)
  )
    throw failure(
      "INVALID_QUERY",
      "Use 1–160 characters without surrounding whitespace or controls",
      400,
    );
  if (
    input.filters &&
    (typeof input.filters !== "object" ||
      Array.isArray(input.filters) ||
      Object.keys(input.filters).length)
  )
    throw failure(
      "UNSUPPORTED_PROFILE",
      "Filters are not implemented for this profile",
    );
  for (const [k, expected] of Object.entries({
    sort: "website_default",
    pageSize: "website_default",
    semantics: "website_native",
    freshness: "live",
  })) {
    if (input[k] != null && input[k] !== expected)
      throw failure("UNSUPPORTED_PROFILE", `Unsupported ${k}`);
  }
  if (input.locale != null)
    throw failure(
      "UNSUPPORTED_PROFILE",
      "Explicit locale selection is not implemented",
    );
  if (
    input.cursor != null &&
    (typeof input.cursor !== "string" || input.cursor.length > 4096)
  )
    throw failure("INVALID_CURSOR", "Invalid cursor", 400);
  return {
    libraryId: input.libraryId,
    connectionId: input.connectionId || "primary",
    query: input.query,
    field: input.field || "keyword",
    filters: {},
    sort: "website_default",
    pageSize: "website_default",
    semantics: "website_native",
    freshness: "live",
    cursor: input.cursor || null,
  };
}
export function tokens(secret) {
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new Error("A 32-byte signing secret is required");
  return {
    sign(value) {
      const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    },
    read(token) {
      try {
        if (typeof token !== "string" || token.length > 4096) throw new Error();
        const [payload, sig, extra] = token.split(".");
        const expected = createHmac("sha256", secret).update(payload).digest();
        const actual = Buffer.from(sig || "", "base64url");
        if (
          extra ||
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected)
        )
          throw new Error();
        const value = JSON.parse(Buffer.from(payload, "base64url"));
        if (value.expiresAt <= Date.now())
          throw failure(
            "CURSOR_EXPIRED",
            "Continuation expired; restart explicitly",
            410,
          );
        return value;
      } catch (e) {
        if (e.code === "CURSOR_EXPIRED") throw e;
        throw failure("INVALID_CURSOR", "Invalid signed reference", 400);
      }
    },
  };
}
