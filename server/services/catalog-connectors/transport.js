import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { failure } from "./contracts.js";
import { safeUrl, redact } from "./evidence.js";

const AGENT = "MyBookshelfAudit/1.0 (+https://mybookshelf.cloud/privacy)";
const ROBOTS_CACHE_MS = 24 * 60 * 60 * 1000;
export function robotsRules(text, userAgent = "mybookshelfaudit") {
  const groups = [];
  let group = null,
    hadRules = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line
      .replace(/#.*/, "")
      .trim()
      .match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase().trim(),
      value = m[2].trim();
    if (key === "user-agent") {
      if (!group || hadRules) {
        group = { agents: [], rules: [], delay: 0 };
        groups.push(group);
        hadRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      hadRules = true;
      if (["allow", "disallow"].includes(key) && value)
        group.rules.push({ allow: key === "allow", path: value });
      if (key === "crawl-delay" && Number.isFinite(Number(value)))
        group.delay = Math.max(0, Number(value) * 1000);
    }
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== "*" && userAgent.includes(a)),
  );
  const selected = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  return {
    rules: selected.flatMap((g) => g.rules),
    delay: Math.max(0, ...selected.map((g) => g.delay)),
  };
}
export function robotsAllowed(policy, url) {
  const u = new URL(url),
    path = u.pathname + u.search;
  const matches = policy.rules
    .filter((r) => {
      const escaped = r.path
        .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      return new RegExp("^" + escaped).test(path);
    })
    .sort(
      (a, b) =>
        b.path.replace(/[*$]/g, "").length -
          a.path.replace(/[*$]/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return !matches.length || matches[0].allow;
}
export class Coordinator {
  constructor({
    fetchImpl = fetch,
    minGapMs = 3000,
    concurrency = 8,
    store = null,
    robots = true,
    policyClock = Date.now,
  } = {}) {
    this.fetch = fetchImpl;
    this.minGapMs = minGapMs;
    this.concurrency = concurrency;
    this.store = store;
    this.robots = robots;
    this.policyClock = policyClock;
    this.observationKind = fetchImpl === fetch ? "live_http" : "fixture";
    this.lanes = new Map();
    this.policies = new Map();
    this.policyExpires = new Map();
    this.cooldowns = new Map();
    this.refusals = new Map();
    this.active = 0;
  }
  context({
    libraryId,
    allowedOrigins,
    signal,
    timeoutMs = 120000,
    attemptId = randomUUID(),
  }) {
    const ctx = {
      libraryId,
      allowedOrigins: new Set(allowedOrigins),
      signal,
      deadlineAt: Date.now() + timeoutMs,
      attemptId,
      evidence: [],
      responses: [],
      requests: 0,
      bytes: 0,
      upstreamMs: 0,
      queueMs: 0,
    };
    ctx.request = (url, options) => this.request(ctx, url, options);
    return ctx;
  }
  check(ctx, url) {
    const u = new URL(url);
    if (this.refusals.has(u.origin))
      throw failure(
        "SOURCE_ACCESS_BLOCKED",
        `Source returned HTTP ${this.refusals.get(u.origin).status}; a permitted recovery is required`,
        503,
      );
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      !ctx.allowedOrigins.has(u.origin)
    )
      throw failure(
        "ORIGIN_NOT_ALLOWED",
        "Request left the configured catalog origin",
        422,
      );
    if (ctx.signal?.aborted || Date.now() >= ctx.deadlineAt)
      throw failure(
        "UPSTREAM_TIMEOUT",
        "Request cancelled or deadline exceeded",
        504,
      );
    if ((this.cooldowns.get(u.origin) || 0) > Date.now())
      throw failure(
        "PROVIDER_COOLDOWN",
        "Provider is cooling down after a refusal or rate limit",
        429,
      );
    return u;
  }
  async request(ctx, value, options = {}) {
    const url = this.check(ctx, value);
    if (this.robots && url.pathname !== "/robots.txt") {
      if (
        (this.policyExpires.get(url.origin) ?? Infinity) <= this.policyClock()
      ) {
        this.policies.delete(url.origin);
        this.policyExpires.delete(url.origin);
      }
      if (!this.policies.has(url.origin)) {
        const policy = this.raw(
          ctx,
          new URL("/robots.txt", url),
          {},
          true,
        ).then((r) => {
          if (r.status === 404 || r.status === 410) {
            this.policyExpires.set(
              url.origin,
              this.policyClock() + ROBOTS_CACHE_MS,
            );
            return { rules: [], delay: 0 };
          }
          if (!r.ok)
            throw failure(
              "ROBOTS_UNAVAILABLE",
              "Cannot establish provider robots policy",
              503,
            );
          const parsed = robotsRules(r.text);
          this.policyExpires.set(
            url.origin,
            this.policyClock() + ROBOTS_CACHE_MS,
          );
          return parsed;
        });
        this.policies.set(url.origin, policy);
        policy.catch(() => {
          if (this.policies.get(url.origin) === policy) {
            this.policies.delete(url.origin);
            this.policyExpires.delete(url.origin);
          }
        });
      }
      const policy = await this.policies.get(url.origin);
      if (!robotsAllowed(policy, url))
        throw failure(
          "ROBOTS_DISALLOWED",
          "Provider robots rules disallow this search path",
          503,
        );
      ctx.crawlDelay = policy.delay;
    }
    return this.raw(ctx, url, options);
  }
  async raw(ctx, url, options = {}, policyRequest = false) {
    this.check(ctx, url);
    const origin = url.origin,
      prior = this.lanes.get(origin) || Promise.resolve(0);
    let release;
    const held = new Promise((r) => {
      release = r;
    });
    this.lanes.set(
      origin,
      prior.catch(() => 0).then(() => held),
    );
    const queuedAt = Date.now();
    let nextAt = 0,
      acquired = false;
    try {
      nextAt = await prior.catch(() => 0);
      const wait = Math.max(0, nextAt - Date.now());
      if (wait) await delay(wait, undefined, { signal: ctx.signal });
      while (this.active >= this.concurrency) {
        this.check(ctx, url);
        await delay(10, undefined, { signal: ctx.signal });
      }
      this.check(ctx, url);
      this.active++;
      acquired = true;
      ctx.queueMs += Date.now() - queuedAt;
      const deadline = Math.min(
        ctx.deadlineAt,
        options.deadlineAt || Infinity,
        Date.now() + (options.timeoutMs || 60000),
      );
      if (deadline <= Date.now())
        throw failure(
          "UPSTREAM_TIMEOUT",
          "Source request deadline exceeded",
          504,
        );
      const signal = AbortSignal.any([
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        ...(ctx.signal ? [ctx.signal] : []),
      ]);
      const requestId = randomUUID(),
        start = Date.now();
      ctx.requests++;
      let bodyFields;
      if (typeof options.body === "string") {
        try {
          bodyFields = redact(JSON.parse(options.body));
        } catch {
          bodyFields = redact(
            Object.fromEntries(new URLSearchParams(options.body)),
          );
        }
      }
      this.store?.append({
        type: "request_started",
        attemptId: ctx.attemptId,
        requestId,
        libraryId: ctx.libraryId,
        url: safeUrl(url),
        method: options.method || "GET",
        bodyFields,
        policyRequest,
      });
      try {
        const response = await this.fetch(url, {
          method: options.method || "GET",
          body: options.body,
          headers: { "User-Agent": AGENT, ...options.headers },
          signal,
          redirect: "manual",
        });
        const limit = Math.min(
          options.maxResponseBytes || 5 * 1024 * 1024,
          16 * 1024 * 1024,
        );
        if (Number(response.headers.get("content-length")) > limit) {
          await response.body?.cancel();
          throw failure(
            "RESPONSE_TOO_LARGE",
            "Source response exceeds limit",
            502,
          );
        }
        const chunks = [];
        let bytes = 0;
        if (response.body)
          for await (const chunk of response.body) {
            bytes += chunk.length;
            if (bytes > limit)
              throw failure(
                "RESPONSE_TOO_LARGE",
                "Source response exceeds limit",
                502,
              );
            chunks.push(Buffer.from(chunk));
          }
        const charset =
          response.headers
            .get("content-type")
            ?.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || "utf-8";
        const text = new TextDecoder(charset).decode(Buffer.concat(chunks));
        ctx.bytes += bytes;
        ctx.upstreamMs += Date.now() - start;
        ctx.responses.push({
          url: url.toString(),
          status: response.status,
          text,
        });
        if (ctx.responses.length > 3) ctx.responses.shift();
        const evidence = this.store?.body(
          text,
          response.headers.get("content-type") || "",
        );
        if (evidence) ctx.evidence.push(evidence);
        this.store?.append({
          type: "response_received",
          attemptId: ctx.attemptId,
          requestId,
          libraryId: ctx.libraryId,
          status: response.status,
          bytes,
          durationMs: Date.now() - start,
          evidence: evidence ? [evidence] : [],
        });
        if ([401, 403, 429].includes(response.status)) {
          if (response.status !== 429)
            this.refusals.set(origin, {
              status: response.status,
              at: new Date().toISOString(),
              evidence: ctx.evidence,
            });
          const retry = response.headers.get("retry-after"),
            seconds = Number(retry);
          const until =
            retry && !Number.isFinite(seconds)
              ? Date.parse(retry)
              : Date.now() +
                (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) *
                  1000;
          this.cooldowns.set(
            origin,
            Number.isFinite(until)
              ? Math.max(Date.now() + 30000, until)
              : Date.now() + 3600000,
          );
          throw failure(
            response.status === 429
              ? "PROVIDER_COOLDOWN"
              : "SOURCE_ACCESS_BLOCKED",
            `Source returned HTTP ${response.status}`,
            503,
          );
        }
        // Adapters must explicitly follow public redirects through request(),
        // so redirects cannot bypass origin, robots or admission checks.
        return {
          ok: response.ok,
          status: response.status,
          headers: response.headers,
          url: url.toString(),
          text,
        };
      } catch (error) {
        this.store?.append({
          type: "request_failed",
          attemptId: ctx.attemptId,
          requestId,
          libraryId: ctx.libraryId,
          code: error.code || error.name || "TRANSPORT_ERROR",
          causeCode: error.cause?.code || null,
          durationMs: Date.now() - start,
        });
        throw error;
      }
    } finally {
      if (acquired) this.active--;
      release(
        Math.max(
          nextAt,
          Date.now() + Math.max(this.minGapMs, ctx.crawlDelay || 0),
        ),
      );
    }
  }
}
