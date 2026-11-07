#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { EvidenceStore } from "../../server/services/catalog-connectors/evidence.js";
import { Coordinator } from "../../server/services/catalog-connectors/transport.js";
import { ConnectorService } from "../../server/services/catalog-connectors/service.js";
import { inventory } from "../../server/services/catalog-connectors/inventory.js";
import { initialize, run, readManifest } from "./runner.mjs";
import { report } from "./report.mjs";
import { createConnectorApi } from "../../server/services/catalog-connectors/api.js";
import { tick } from "./schedule.mjs";

const args = process.argv.slice(2),
  command = args.shift();
function arg(name, fallback) {
  const i = args.indexOf("--" + name);
  return i < 0 ? fallback : args[i + 1];
}
if (!command || command === "help") {
  console.log(
    "library-audit init|inventory|preflight|run|health|report|validate|serve|schedule --dir PATH [--country IN] [--libraries id,id] [--limit N] [--concurrency 3]\nHTTP only. run is an explicit live operation; init/preflight make no provider requests. serve binds localhost and requires LIBRARY_CONNECTOR_API_KEY (32+ chars).",
  );
  process.exit(0);
}
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)
  setGlobalDispatcher(new EnvHttpProxyAgent());
const directory = resolve(
  arg("dir", "docs/research/india-library-audit/runs/india-20261107"),
);
const store = new EvidenceStore(directory);
let held = false,
  coordinatorLock = null;
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
try {
  if (command === "inventory") {
    console.log(
      JSON.stringify(inventory({ country: arg("country", "IN") }), null, 2),
    );
  } else if (command === "validate") {
    const manifest = readManifest(store);
    console.log(
      JSON.stringify({
        ...store.validate(),
        total: manifest.inventory.total,
        inventoryHash: manifest.inventory.inventoryHash,
      }),
    );
  } else {
    store.acquire();
    held = true;
    if (command === "init") {
      const m = initialize(store, {
        country: arg("country", "IN"),
        libraryIds: arg("libraries", null)?.split(",") || null,
      });
      console.log(
        JSON.stringify({
          runId: m.runId,
          total: m.inventory.total,
          ...report(store),
        }),
      );
    } else if (command === "preflight") {
      const m = JSON.parse(readFileSync(join(directory, "manifest.json")));
      const counts = {};
      for (const l of m.inventory.libraries) {
        const mode = l.connections.some((c) => c.mode === "native_http")
          ? "native_http"
          : l.connections.some((c) => c.mode === "legacy_http_review")
            ? "legacy_http_review"
            : "unsupported";
        counts[mode] = (counts[mode] || 0) + 1;
      }
      const controlPath = join(directory, "audit-control.json");
      const control = existsSync(controlPath)
        ? JSON.parse(readFileSync(controlPath))
        : null;
      const result = {
        at: new Date().toISOString(),
        total: m.inventory.total,
        counts,
        readyToCollect: control?.resumeAllowed !== false,
        repairGate: control?.resumeAllowed === false ? control.reason : null,
        readyToClaimAllQualified: false,
        unresolvedOmittedMappings: m.inventory.reconciliation.filter(
          (r) => !r.libraryId,
        ).length,
      };
      store.save("preflight.json", result);
      console.log(JSON.stringify(result));
    } else if (command === "report") {
      console.log(JSON.stringify(report(store)));
    } else if (["run", "health", "serve", "schedule"].includes(command)) {
      if (!existsSync(join(directory, "manifest.json")))
        throw new Error("Initialize a run first");
      // Separate run directories/worktrees still share provider budgets. Only
      // one live CLI/API coordinator may own this machine at a time.
      if (command !== "schedule" || args.includes("--execute")) {
        coordinatorLock = new EvidenceStore(
          join(tmpdir(), "mybookshelf-library-connector-coordinator"),
        );
        coordinatorLock.acquire();
      }
      const coordinator = new Coordinator({ store }),
        service = new ConnectorService({
          coordinator,
          secret:
            process.env.LIBRARY_CONNECTOR_SIGNING_SECRET ||
            randomBytes(32).toString("hex"),
        });
      if (command === "schedule")
        console.log(
          JSON.stringify(
            await tick(store, service, {
              execute: args.includes("--execute"),
              signal: controller.signal,
            }),
          ),
        );
      else if (command === "serve") {
        const app = createConnectorApi({
          store,
          service,
          apiKey: process.env.LIBRARY_CONNECTOR_API_KEY,
        });
        const server = app.listen(
          Number(arg("port", "4321")),
          "127.0.0.1",
          () => console.log("Internal connector API listening on localhost"),
        );
        await new Promise((r) =>
          controller.signal.addEventListener(
            "abort",
            () => {
              app.locals.stopAudit().finally(() => server.close(r));
            },
            { once: true },
          ),
        );
      } else {
        const limit = arg("limit", null),
          concurrency = Number(arg("concurrency", "3"));
        if (
          limit != null &&
          (!Number.isSafeInteger(Number(limit)) || Number(limit) < 1)
        )
          throw new Error("Invalid limit");
        if (
          !Number.isSafeInteger(concurrency) ||
          concurrency < 1 ||
          concurrency > 8
        )
          throw new Error("Concurrency must be 1–8");
        await run(store, service, {
          libraryIds: arg("libraries", null)?.split(",") || null,
          limit: limit == null ? Infinity : Number(limit),
          mode: command === "health" ? "health" : "qualify",
          queries: arg("query", null) ? [arg("query")] : null,
          field: arg("field", null),
          concurrency,
          signal: controller.signal,
          retryBlocked: args.includes("--retry-blocked"),
          retryReason: arg("retry-reason", null),
        });
        console.log(JSON.stringify(report(store)));
      }
    } else throw new Error("Unknown command");
  }
} catch (error) {
  console.error(error.code || error.name, error.message);
  process.exitCode = 1;
} finally {
  coordinatorLock?.release();
  if (held) store.release();
}
