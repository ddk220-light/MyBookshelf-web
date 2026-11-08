import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { readManifest } from "./runner.mjs";
import { linkVerificationReport } from "./link-verification.mjs";

const BRANCH = "feat/library-connector-audit";
export function publishLinkCheckpoint({
  git,
  path,
  expectedLocal,
  branch = BRANCH,
}) {
  if (
    branch !== BRANCH ||
    !/^docs\/research\/india-library-audit\/(?:runs|revalidation)\//.test(
      path,
    ) ||
    path.split("/").includes("..")
  )
    throw Error("Unapproved audit publication scope");
  if (git(["diff", "--cached", "--name-only"]))
    throw Error("Unrelated staged changes must be preserved");
  if (git(["rev-parse", "HEAD"]) !== expectedLocal)
    throw Error("Local branch changed; reconcile before publishing");
  git(["fetch", "origin", branch]);
  if (git(["rev-parse", "FETCH_HEAD"]) !== expectedLocal)
    throw Error("Remote branch changed; reconcile without force push");
  git(["add", "--", path]);
  const staged = git(["diff", "--cached", "--name-only"]);
  if (!staged) return expectedLocal;
  if (staged.split("\n").some((name) => !name.startsWith(path + "/")))
    throw Error("Checkpoint includes unrelated staged files");
  git([
    "commit",
    "-m",
    "Checkpoint India item-link verification [skip ci] [skip vercel]",
  ]);
  const next = git(["rev-parse", "HEAD"]);
  git(["push", "origin", "HEAD:refs/heads/" + branch]);
  return next;
}

export async function superviseLinks(args = process.argv.slice(2)) {
  const option = (name, fallback) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? fallback : args[i + 1];
  };
  const directory = resolve(
    option("dir", "docs/research/india-library-audit/revalidation/20261107"),
  );
  const stateDirectory = resolve(
    option("state-dir", "/workspace/library-audit-review/link-supervisor"),
  );
  const batchSize = Number(option("batch-size", "1000")),
    concurrency = Number(option("concurrency", "6")),
    publish = args.includes("--publish");
  if (
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 1000 ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8
  )
    throw Error("Invalid link supervisor budgets");
  const path = relative(process.cwd(), directory);
  if (
    !/^docs\/research\/india-library-audit\/(?:runs|revalidation)\//.test(
      path,
    ) ||
    path.split("/").includes("..")
  )
    throw Error("Use a tracked India audit directory");
  const leader = new EvidenceStore(stateDirectory),
    store = new EvidenceStore(directory),
    machine = new EvidenceStore(
      join(tmpdir(), "mybookshelf-library-connector-coordinator"),
    );
  const pausePath = join(stateDirectory, "pause");
  const git = (argv) => {
    const r = spawnSync("git", argv, {
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    if (r.status !== 0)
      throw Object.assign(
        Error(
          "Git " +
            argv[0] +
            " failed; committed and uncommitted evidence remain preserved",
        ),
        { code: "GIT_CHECKPOINT_FAILED" },
      );
    return r.stdout.trim();
  };
  let phase = "starting",
    child = null,
    stop = false,
    expectedLocal = null,
    batches = 0;
  const read = (path) =>
    existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const state = (extra) =>
    leader.save("progress.json", {
      schemaVersion: 1,
      kind: "provider_link_batch_supervisor",
      pid: process.pid,
      host: leader.owner.host,
      startedAt: leader.owner.startedAt,
      at: new Date().toISOString(),
      phase,
      childPid: child?.pid || null,
      directory,
      publishing: publish,
      pauseRequested: stop || existsSync(pausePath),
      batches,
      lastPublishedCommit: expectedLocal,
      childProgress: read(join(directory, "link-verification-progress.json")),
      ...extra,
    });
  const signal = () => {
    stop = true;
    if (child && child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  };
  leader.acquire();
  process.once("SIGTERM", signal);
  process.once("SIGINT", signal);
  try {
    readManifest(store);
    store.validate();
    if (git(["branch", "--show-current"]) !== BRANCH)
      throw Error("Use the isolated audit branch");
    expectedLocal = git(["rev-parse", "HEAD"]);
    if (publish) {
      git(["fetch", "origin", BRANCH]);
      if (git(["rev-parse", "FETCH_HEAD"]) !== expectedLocal)
        throw Error(
          "Fetch/reconcile the audit branch before publishing collection",
        );
    }
    while (!stop && !existsSync(pausePath)) {
      if (
        git([
          "status",
          "--porcelain",
          "--",
          "server",
          "shared",
          "tools/library-audit",
        ])
      )
        throw Error(
          "Implementation edits must be checkpointed before collection",
        );
      if (git(["rev-parse", "HEAD"]) !== expectedLocal)
        throw Error("Local branch changed during link supervision");
      phase = "collecting";
      child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./verify-links.mjs", import.meta.url)),
          "--dir",
          directory,
          "--limit",
          String(batchSize),
          "--concurrency",
          String(concurrency),
        ],
        { stdio: ["ignore", "inherit", "inherit"] },
      );
      state();
      const heartbeat = setInterval(() => state(), 10000);
      let code;
      try {
        code = await new Promise((done, reject) => {
          child.once("error", reject);
          child.once("close", done);
        });
      } finally {
        clearInterval(heartbeat);
        child = null;
      }
      if (code !== 0)
        throw Error(
          "Link collector stopped with an error; inspect its saved evidence before resuming",
        );
      const lastRun = read(join(directory, "link-verification-last-run.json"));
      let machineHeld = false,
        runHeld = false,
        summary;
      try {
        // No provider child is alive during Git operations. Never steal a lock
        // if another operator starts a writer in this checkpoint window.
        machine.acquire();
        machineHeld = true;
        store.acquire();
        runHeld = true;
        store.validate();
        readManifest(store);
        summary = linkVerificationReport(store);
        const goal = read(join(directory, "repair-goal.json"));
        if (goal) {
          goal.updatedAt = new Date().toISOString();
          goal.linkVerification = {
            ...goal.linkVerification,
            latestCompletedSummary: summary,
            queueAssessed: summary.remaining === 0,
            complete: false,
          };
          store.save("repair-goal.json", goal);
        }
        phase = "publishing";
        state({ summary });
        if (publish)
          expectedLocal = publishLinkCheckpoint({ git, path, expectedLocal });
        batches++;
      } finally {
        if (runHeld) store.release();
        if (machineHeld) machine.release();
      }
      state({ summary });
      if (lastRun?.interrupted) {
        phase = "paused_after_interruption";
        state({ summary });
        return;
      }
      if (!summary.remaining) {
        phase = "link_queue_assessed";
        state({ summary, wholeAuditComplete: false });
        return;
      }
    }
    phase = "paused_at_checkpoint";
    state();
  } catch (error) {
    phase = "interrupted";
    state({
      error: { code: error.code || error.name, reason: error.message },
      wholeAuditComplete: false,
    });
    throw error;
  } finally {
    process.removeListener("SIGTERM", signal);
    process.removeListener("SIGINT", signal);
    leader.release();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await superviseLinks();
