#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { hostname, tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import {
  ConnectorService,
  implementationHash,
} from "../../server/services/catalog-connectors/service.js";
import { getLibraryById } from "../../server/services/directory.js";
import { readManifest, run, termsFor } from "./runner.mjs";
import { report } from "./report.mjs";
import { revalidationReport } from "./revalidation-report.mjs";
import {
  revalidationAttemptKey,
  completedRevalidationKeys,
} from "./revalidation-plans.mjs";
const args = process.argv.slice(2),
  option = (k, d) => {
    const i = args.indexOf("--" + k);
    return i < 0 ? d : args[i + 1];
  };
const directory = resolve(
    option("dir", "docs/research/india-library-audit/revalidation/20261107"),
  ),
  publish = args.includes("--publish");
const batchSize = Number(option("batch-size", "10")),
  concurrency = Number(option("concurrency", "6"));
if (
  !Number.isSafeInteger(batchSize) ||
  batchSize < 1 ||
  batchSize > 25 ||
  !Number.isSafeInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 8
)
  throw new Error("Invalid revalidation budgets");
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const store = new EvidenceStore(directory),
  machine = new EvidenceStore(
    join(tmpdir(), "mybookshelf-library-connector-coordinator"),
  ),
  controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let held = false,
  machineHeld = false,
  coordinator,
  expectedLocal,
  expectedRemote;
const branch = "feat/library-connector-audit",
  at = () => new Date().toISOString();
function git(argv, network = false) {
  const env = { ...process.env };
  if (network && env.GH_TOKEN)
    Object.assign(env, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: "Authorization: Bearer " + env.GH_TOKEN,
    });
  const result = spawnSync("git", argv, {
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw Object.assign(
      new Error(`Git ${argv[0]} failed; evidence remains saved`),
      { code: "GIT_CHECKPOINT_FAILED" },
    );
  return result.stdout.trim();
}
function checkpoint() {
  if (!publish) return;
  const remote = git(["ls-remote", "--heads", "origin", branch], true).split(
    /\s/,
  )[0];
  if (
    git(["branch", "--show-current"]) !== branch ||
    git(["rev-parse", "HEAD"]) !== expectedLocal ||
    remote !== expectedRemote
  )
    throw Object.assign(
      new Error("Another Git writer changed the checkpoint; stop safely"),
      { code: "CONCURRENT_GIT_WRITER" },
    );
  if (git(["diff", "--cached", "--name-only"]))
    throw new Error("Preserve unrelated staged changes");
  const path = relative(process.cwd(), directory);
  if (
    path.startsWith("..") ||
    !path.startsWith("docs/research/india-library-audit/revalidation/")
  )
    throw new Error("Invalid research publish directory");
  git(["add", "--", path]);
  if (!git(["diff", "--cached", "--name-only"])) return;
  git([
    "commit",
    "-m",
    "Checkpoint India audit repair revalidation [skip ci] [skip vercel]",
  ]);
  expectedLocal = git(["rev-parse", "HEAD"]);
  git(["push", "origin", `HEAD:refs/heads/${branch}`], true);
  expectedRemote = expectedLocal;
  console.log(
    JSON.stringify({
      type: "checkpoint_pushed",
      at: at(),
      commit: expectedRemote,
    }),
  );
}
function state(phase, extra = {}) {
  const review = revalidationReport(store);
  const value = {
    schemaVersion: 1,
    phase,
    at: at(),
    pid: process.pid,
    host: hostname(),
    implementationHash,
    cohortTotal: review.cohortTotal,
    reviewed: review.closed,
    remaining: review.remaining,
    fullAuditPaused: true,
    ...extra,
  };
  store.save("execution.json", value);
  console.log(JSON.stringify(value));
  return review;
}
try {
  machine.acquire();
  machineHeld = true;
  store.acquire();
  held = true;
  store.events({ repairTail: true });
  store.validate();
  const manifest = readManifest(store),
    fullControl = JSON.parse(
      readFileSync(
        join(resolve(manifest.sourceRunDirectory), "audit-control.json"),
      ),
    );
  if (fullControl.resumeAllowed !== false)
    throw new Error("Full audit must remain paused during revalidation");
  if (publish) {
    expectedLocal = git(["rev-parse", "HEAD"]);
    expectedRemote = git(
      ["ls-remote", "--heads", "origin", branch],
      true,
    ).split(/\s/)[0];
    if (
      git(["branch", "--show-current"]) !== branch ||
      expectedLocal !== expectedRemote
    )
      throw new Error(
        "Fetch/reconcile isolated audit branch before publishing",
      );
  }
  coordinator = new Coordinator({ store });
  for (const path of [
    join(resolve(manifest.sourceRunDirectory), "origin-state.json"),
    join(directory, "origin-state.json"),
  ])
    if (existsSync(path)) {
      const saved = JSON.parse(readFileSync(path));
      for (const [origin, until] of saved.cooldowns || [])
        coordinator.cooldowns.set(origin, until);
      for (const [origin, refusal] of saved.refusals || [])
        coordinator.refusals.set(origin, refusal);
    }
  const service = new ConnectorService({
    coordinator,
    secret: randomBytes(32).toString("hex"),
  });
  let review = state("revalidating_cohort");
  checkpoint();
  while (!controller.signal.aborted) {
    const completed = completedRevalidationKeys(store.events({ cached: true }));
    const goal = JSON.parse(readFileSync(join(directory, "repair-goal.json")));
    const pending = review.libraries.filter((r) => {
      if (
        r.closed ||
        completed.has(
          revalidationAttemptKey(
            r.libraryId,
            implementationHash,
            goal.queryPlans?.[r.libraryId],
          ),
        ) ||
        goal.deferredRevalidation?.[r.libraryId]
      )
        return false;
      // A known unsupported/legacy recipe cannot acquire native fidelity by
      // repeating the same API call. Leave it open for semantic repair; a
      // newly implemented native recipe automatically becomes eligible.
      try {
        return service
          .capabilities(r.libraryId)
          .connections.some((connection) => connection.mode === "native_http");
      } catch {
        return false;
      }
    });
    const priorities = new Map(
      (
        JSON.parse(readFileSync(join(directory, "repair-goal.json")))
          .priorityLibraryIds || []
      ).map((id, index) => [id, index]),
    );
    // Corrected native adapters first, then other reachable research gaps. Each
    // library gets one deliberate pass per implementation, never an infinite retry.
    pending.sort(
      (a, b) =>
        (priorities.get(a.libraryId) ?? Number.MAX_SAFE_INTEGER) -
          (priorities.get(b.libraryId) ?? Number.MAX_SAFE_INTEGER) ||
        Number(
          service
            .capabilities(b.libraryId)
            .connections.some((c) => c.mode === "native_http"),
        ) -
          Number(
            service
              .capabilities(a.libraryId)
              .connections.some((c) => c.mode === "native_http"),
          ) ||
        a.liveAttempts - b.liveAttempts ||
        a.libraryId.localeCompare(b.libraryId),
    );
    const batch = pending.slice(0, batchSize);
    if (!batch.length) {
      report(store);
      state(
        review.remaining
          ? "semantic_repairs_remaining"
          : "cohort_reviewed_reconciliation_pending",
      );
      checkpoint();
      break;
    }
    for (const row of batch) {
      const entry = getLibraryById(row.libraryId),
        variants =
          entry.communityCatalog?.family === "pmb"
            ? ["France", "Paris", "histoire", "roman", "français"]
            : entry.platform === "libman"
              ? ["Science", "History", "Mathematics", "Computer"]
              : null;
      const old = store
        .events({ cached: true })
        .filter(
          (e) =>
            e.libraryId === row.libraryId &&
            e.type === "search_completed" &&
            e.records?.length,
        )
        .map((e) => e.query);
      row.queries = [
        ...new Set([
          ...(goal.queryPlans?.[row.libraryId]?.queries || []),
          ...old,
          ...(variants || termsFor(row)),
        ]),
      ];
      row.attemptKey = revalidationAttemptKey(
        row.libraryId,
        implementationHash,
        goal.queryPlans?.[row.libraryId],
      );
      store.append({
        type: "revalidation_plan_selected",
        libraryId: row.libraryId,
        implementationHash,
        attemptKey: row.attemptKey,
        queries: row.queries,
        field: goal.queryPlans?.[row.libraryId]?.field || null,
        planSourceEvents: goal.queryPlans?.[row.libraryId]?.sourceEvents || [],
      });
    }
    // One runner owns the whole batch: its shared busyOrigins scheduler keeps
    // same-host jobs from consuming their request deadlines in a local queue.
    await run(store, service, {
      libraryIds: batch.map((row) => row.libraryId),
      queriesByLibrary: Object.fromEntries(
        batch.map((row) => [row.libraryId, row.queries]),
      ),
      fieldsByLibrary: Object.fromEntries(
        batch
          .filter((row) => goal.queryPlans?.[row.libraryId]?.field)
          .map((row) => [row.libraryId, goal.queryPlans[row.libraryId].field]),
      ),
      concurrency,
      retryBlocked: true,
      retryReason:
        "Owner-authorized adapter and shared-origin scheduler repairs with bounded cohort revalidation",
      signal: controller.signal,
    });
    if (!controller.signal.aborted)
      for (const row of batch)
        store.append({
          type: "revalidation_attempt_completed",
          libraryId: row.libraryId,
          implementationHash,
          attemptKey: row.attemptKey,
        });
    store.save("origin-state.json", {
      at: at(),
      cooldowns: [...coordinator.cooldowns],
      refusals: [...coordinator.refusals],
    });
    report(store);
    review = state(
      controller.signal.aborted ? "interrupted" : "revalidating_cohort",
      { lastBatch: batch.map((r) => r.libraryId) },
    );
    checkpoint();
  }
  if (controller.signal.aborted) {
    report(store);
    state("interrupted");
    checkpoint();
  }
} catch (error) {
  if (held) {
    try {
      store.append({
        type: "revalidation_worker_failed",
        code: error.code || error.name,
        reason: error.message,
      });
      state("repair_worker_stopped", {
        code: error.code || error.name,
        reason: error.message,
      });
    } catch {}
  }
  console.error(
    JSON.stringify({
      at: at(),
      code: error.code || error.name,
      reason: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  if (coordinator && held)
    store.save("origin-state.json", {
      at: at(),
      cooldowns: [...coordinator.cooldowns],
      refusals: [...coordinator.refusals],
    });
  if (held) store.release();
  if (machineHeld) machine.release();
}
