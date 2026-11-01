import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export class AccountRequestError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function csrfForSession(secret, sessionId) {
  return createHmac("sha256", secret)
    .update("account-csrf-v1:" + sessionId)
    .digest("hex");
}

export function requireOrigin(req, baseURL) {
  if (req.get("Origin") !== baseURL)
    throw new AccountRequestError(
      403,
      "ORIGIN_REJECTED",
      "The request origin is not allowed.",
    );
}

export function requireMutation(req, identity, config) {
  if (identity.status !== "authenticated")
    throw new AccountRequestError(
      401,
      "SIGN_IN_REQUIRED",
      "Sign in to continue.",
    );
  requireOrigin(req, config.baseURL);
  if (!req.is("application/json"))
    throw new AccountRequestError(415, "JSON_REQUIRED", "Send a JSON request.");
  const provided = req.get("X-Account-CSRF");
  const expected = csrfForSession(config.secret, identity.sessionId);
  if (
    typeof provided !== "string" ||
    !/^[a-f0-9]{64}$/.test(provided) ||
    !timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"))
  ) {
    throw new AccountRequestError(
      403,
      "CSRF_REJECTED",
      "Refresh this page and try again.",
    );
  }
}
// This is a reject-only view precondition, never an owner selector. Ownership
// still comes exclusively from the verified server session.
export function requireIdentityView(req, identity) {
  const expected = req.get("X-Account-Identity");
  if (expected !== undefined && expected !== identity.user.id)
    throw new AccountRequestError(
      409,
      "IDENTITY_CHANGED",
      "Your account changed. Refresh to continue.",
    );
}

export function requestIP(req, env = process.env) {
  // Vercel supplies this header at the edge. Outside Vercel, ignore all forwarded
  // headers; Express's public-router trust-proxy setting is not this boundary.
  const edge =
    env.VERCEL === "1" ? req.get("x-vercel-forwarded-for") : undefined;
  if (edge && isIP(edge)) return edge;
  return req.socket.remoteAddress || "unknown";
}

export function safeReturnPath(value, fallback = "/app/shelf") {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    !value.startsWith("/app/")
  )
    return fallback;
  let inspected = value;
  for (let n = 0; n < 4; n++) {
    if (
      /[\\\u0000-\u001f\u007f]/.test(inspected) ||
      !inspected.startsWith("/app/")
    )
      return fallback;
    const path = inspected.split(/[?#]/)[0];
    if (path.split("/").some((part) => part === "." || part === ".."))
      return fallback;
    try {
      const next = decodeURIComponent(inspected);
      if (next === inspected) break;
      inspected = next;
    } catch {
      return fallback;
    }
  }
  const url = new URL(value, "https://return.invalid");
  const decodedURL = new URL(inspected, "https://return.invalid");
  if (
    url.origin !== "https://return.invalid" ||
    !url.pathname.startsWith("/app/") ||
    /^\/app\/account\/(?:sign-in|sign-up|verify|reset-password|return)(?:\/|$)/.test(
      decodedURL.pathname,
    )
  )
    return fallback;
  return url.pathname + url.search + url.hash;
}

export async function consumeLimits(pool, secret, checks) {
  // One database authority across instances. Count rejected attempts too, cap
  // counters to avoid integer overflow and store no plain address/IP identifiers.
  for (const { scope, subject, max, seconds } of checks) {
    const bucket = createHmac("sha256", secret)
      .update(JSON.stringify(["limit-v1", scope, subject, seconds]))
      .digest("hex");
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO account_rate_buckets(bucket,count,reset_at)
      VALUES ($1,1,now()+($2::int * interval '1 second')) ON CONFLICT(bucket) DO UPDATE SET
      count=CASE WHEN account_rate_buckets.reset_at<=now() THEN 1 ELSE LEAST(account_rate_buckets.count+1,$3::int+1) END,
      reset_at=CASE WHEN account_rate_buckets.reset_at<=now() THEN EXCLUDED.reset_at ELSE account_rate_buckets.reset_at END
      RETURNING count, GREATEST(1,ceil(extract(epoch FROM reset_at-now())))::int AS retry_after`,
      [bucket, seconds, max],
    );
    if (row.count > max)
      throw new AccountRequestError(
        429,
        "RATE_LIMITED",
        "Too many attempts. Try again later.",
        row.retry_after,
      );
  }
}
