#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import {
  ConnectorService,
  implementationHash,
} from "../../server/services/catalog-connectors/service.js";
import { readManifest } from "./runner.mjs";
import {
  buildLinkQueue,
  verifyItemLink,
  linkVerificationReport,
} from "./link-verification.mjs";
const args = process.argv.slice(2),
  option = (name, def) => {
    const i = args.indexOf("--" + name);
    return i < 0 ? def : args[i + 1];
  };
const directory = resolve(
    option("dir", "docs/research/india-library-audit/revalidation/20261107"),
  ),
  limit = Number(option("limit", "100"));
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
  throw Error("Invalid link verification budget");
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
  coordinator;
try {
  machine.acquire();
  machineHeld = true;
  store.acquire();
  held = true;
  const manifest = readManifest(store),
    own = store.events();
  store.validate();
  const roots = [
      ...(manifest.sourceRunDirectory
        ? [resolve(manifest.sourceRunDirectory)]
        : []),
      directory,
    ],
    events = [];
  const ids = new Set(manifest.inventory.libraries.map((l) => l.libraryId));
  for (const root of roots) {
    const source = new EvidenceStore(root);
    source.validate();
    events.push(...source.events().filter((e) => ids.has(e.libraryId)));
  }
  const jobs = buildLinkQueue(events),
    completed = new Set(
      own
        .filter((e) => e.type === "link_verification_completed")
        .map((e) => e.jobId),
    );
  store.save("link-verification-queue.json", {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inventoryHash: manifest.inventory.inventoryHash,
    scope:
      "Every saved returned item and accepted book in this frozen cohort, deduplicated by library/connection/record/URL/kind. Handoffs are never item-link passes.",
    jobs,
  });
  coordinator = new Coordinator({ store });
  for (const root of roots)
    if (existsSync(join(root, "origin-state.json"))) {
      const s = JSON.parse(readFileSync(join(root, "origin-state.json")));
      for (const [k, v] of s.cooldowns || []) coordinator.cooldowns.set(k, v);
      for (const [k, v] of s.refusals || []) coordinator.refusals.set(k, v);
    }
  const service = new ConnectorService({
    coordinator,
    secret: randomBytes(32).toString("hex"),
  });
  const libraryFilter = option("libraries", null)?.split(",");
  let processed = 0;
  for (const job of jobs
    .filter(
      (j) =>
        !completed.has(j.jobId) &&
        (!libraryFilter || libraryFilter.includes(j.libraryId)) &&
        (!args.includes("--item-only") || j.kind === "record"),
    )
    .slice(0, limit)) {
    if (controller.signal.aborted) break;
    const descriptor = service.connection(
      job.libraryId,
      job.connectionId,
    ).descriptor;
    const result = await verifyItemLink(job, coordinator, descriptor, {
      signal: controller.signal,
    });
    store.append({
      type: "link_verification_completed",
      implementationHash,
      observationKind: coordinator.observationKind,
      ...result,
    });
    completed.add(job.jobId);
    processed++;
    store.save("link-verification-progress.json", {
      schemaVersion: 1,
      at: new Date().toISOString(),
      implementationHash,
      total: jobs.length,
      processed: completed.size,
      remaining: jobs.filter((j) => !completed.has(j.jobId)).length,
      lastJobId: job.jobId,
      scope:
        "Link outcomes do not change library qualification counts; unconfirmed identities remain unresolved",
    });
    console.log(
      JSON.stringify({
        jobId: job.jobId,
        libraryId: job.libraryId,
        outcome: result.outcome,
        identityConfirmed: result.identityConfirmed,
      }),
    );
  }
  console.log(JSON.stringify({ processed, ...linkVerificationReport(store) }));
} finally {
  if (held && coordinator)
    store.save("origin-state.json", {
      at: new Date().toISOString(),
      cooldowns: [...coordinator.cooldowns],
      refusals: [...coordinator.refusals],
    });
  if (held) store.release();
  if (machineHeld) machine.release();
}
