#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { hostname, tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { run, readManifest, reduceRun } from "./runner.mjs";
import { report } from "./report.mjs";
import { selectBatch, auditSummary, finalReport } from "./final-report.mjs";

const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf("--" + key);
  return index < 0 ? fallback : args[index + 1];
};
const directory = resolve(
  option("dir", "docs/research/india-library-audit/runs/india-20261107"),
);
const publish = args.includes("--publish"),
  batchSize = Number(option("batch-size", "10")),
  concurrency = Number(option("concurrency", "6"));
if (
  !Number.isSafeInteger(batchSize) ||
  batchSize < 1 ||
  batchSize > 50 ||
  !Number.isSafeInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 8
)
  throw new Error("Invalid worker budgets");
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const store = new EvidenceStore(directory),
  machine = new EvidenceStore(
    join(tmpdir(), "mybookshelf-library-connector-coordinator"),
  );
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let runHeld = false,
  machineHeld = false,
  coordinator;
const branch = "feat/library-connector-audit";
function git(argv, network = false) {
  const env = { ...process.env };
  if (network && env.GH_TOKEN) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = "Authorization: Bearer " + env.GH_TOKEN;
  }
  const result = spawnSync("git", argv, {
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0)
    throw Object.assign(
      new Error(`Git ${argv[0]} failed; saved evidence is intact`),
      { code: result.error?.code || "GIT_CHECKPOINT_FAILED" },
    );
  return result.stdout.trim();
}
let expectedRemote = null,
  expectedLocal = null;
const at = () => new Date().toISOString();
function state(phase, extra = {}) {
  const progress = reduceRun(
    readManifest(store),
    store.events({ cached: true }),
  );
  const saved = {
    schemaVersion: 1,
    phase,
    at: at(),
    pid: process.pid,
    host: hostname(),
    branch,
    runDirectory: relative(process.cwd(), directory),
    ...auditSummary(progress),
    ...extra,
  };
  store.save("execution.json", saved);
  console.log(JSON.stringify(saved));
  return saved;
}
function checkpoint(label) {
  if (!publish) return;
  if (
    git(["branch", "--show-current"]) !== branch ||
    git(["rev-parse", "HEAD"]) !== expectedLocal
  )
    throw Object.assign(
      new Error(
        "Git branch/head changed while collecting; another writer may be active",
      ),
      { code: "CONCURRENT_GIT_WRITER" },
    );
  const remote = git(["ls-remote", "--heads", "origin", branch], true).split(
    /\s/,
  )[0];
  if (remote !== expectedRemote)
    throw Object.assign(
      new Error(
        "Remote branch advanced; stop before overlapping another writer",
      ),
      { code: "REMOTE_WRITER_DETECTED" },
    );
  if (git(["diff", "--cached", "--name-only"]))
    throw Object.assign(
      new Error("Unrelated staged changes must be preserved"),
      { code: "STAGED_CHANGES_PRESENT" },
    );
  const path = relative(process.cwd(), directory);
  if (
    path.startsWith("..") ||
    !path.startsWith("docs/research/india-library-audit/runs/")
  )
    throw new Error("Published run must use the tracked audit run root");
  git(["add", "--", path]);
  if (!git(["diff", "--cached", "--name-only"])) return;
  git(["commit", "-m", `${label} [skip ci] [skip vercel]`]);
  expectedLocal = git(["rev-parse", "HEAD"]);
  git(["push", "origin", `HEAD:refs/heads/${branch}`], true);
  expectedRemote = expectedLocal;
  console.log(
    JSON.stringify({
      at: at(),
      type: "checkpoint_pushed",
      commit: expectedRemote,
    }),
  );
}
try {
  machine.acquire();
  machineHeld = true;
  store.acquire();
  runHeld = true;
  if (publish) {
    if (git(["branch", "--show-current"]) !== branch)
      throw new Error("Use the isolated audit branch");
    expectedLocal = git(["rev-parse", "HEAD"]);
    expectedRemote = git(
      ["ls-remote", "--heads", "origin", branch],
      true,
    ).split(/\s/)[0];
    if (expectedRemote !== expectedLocal)
      throw new Error("Fetch/reconcile the audit branch before launching");
  }
  store.events({ repairTail: true });
  store.validate();
  readManifest(store);
  coordinator = new Coordinator({ store });
  const service = new ConnectorService({
    coordinator,
    secret: randomBytes(32).toString("hex"),
  });
  const policyPath = join(directory, "origin-state.json");
  if (existsSync(policyPath)) {
    const saved = JSON.parse(readFileSync(policyPath));
    for (const [origin, until] of saved.cooldowns || [])
      coordinator.cooldowns.set(origin, until);
    for (const [origin, refusal] of saved.refusals || [])
      coordinator.refusals.set(origin, refusal);
  }
  state("running", {
    batchSize,
    concurrency,
    implementationHash: service.implementationHash,
  });
  checkpoint("Start comprehensive India library audit");
  while (!controller.signal.aborted) {
    const progress = reduceRun(
        readManifest(store),
        store.events({ cached: true }),
      ),
      ids = selectBatch(progress, batchSize);
    if (!ids.length) {
      report(store);
      const final = finalReport(store);
      state("audit_pass_complete", {
        finalReport: "final-report.md",
        allLibrariesHaveTwentyBooks: final.allLibrariesHaveTwentyBooks,
      });
      checkpoint("Publish final India library audit report");
      break;
    }
    await run(store, service, {
      libraryIds: ids,
      concurrency,
      signal: controller.signal,
    });
    store.save("origin-state.json", {
      at: at(),
      cooldowns: [...coordinator.cooldowns],
      refusals: [...coordinator.refusals],
    });
    const result = report(store);
    state(controller.signal.aborted ? "interrupted" : "running", {
      lastBatch: ids,
    });
    checkpoint(
      `Checkpoint India library audit: ${result.total - selectBatch(reduceRun(readManifest(store), store.events({ cached: true })), result.total).length} assessed`,
    );
  }
  if (controller.signal.aborted) {
    report(store);
    state("interrupted");
    checkpoint("Checkpoint interrupted India library audit");
  }
} catch (error) {
  if (runHeld) {
    try {
      if (coordinator)
        store.save("origin-state.json", {
          at: at(),
          cooldowns: [...coordinator.cooldowns],
          refusals: [...coordinator.refusals],
        });
      state("interrupted", {
        error: { code: error.code || error.name, reason: error.message },
      });
    } catch {}
  }
  console.error(error.code || error.name, error.message);
  process.exitCode = 1;
} finally {
  if (runHeld) store.release();
  if (machineHeld) machine.release();
}
