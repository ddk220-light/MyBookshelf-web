import express from "express";
import { timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inventory } from "./inventory.js";
import { failure, hash } from "./contracts.js";
import { run, readManifest } from "../../../tools/library-audit/runner.mjs";
import { report } from "../../../tools/library-audit/report.mjs";

export function createConnectorApi({ service, store, apiKey }) {
  if (!apiKey || apiKey.length < 32)
    throw new Error("Internal API key must be at least 32 characters");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  const keyHash = Buffer.from(hash(apiKey), "hex");
  let active = null,
    inFlight = 0;
  app.use((req, res, next) => {
    const actual = Buffer.from(
      hash((req.get("authorization") || "").replace(/^Bearer /, "")),
      "hex",
    );
    if (!timingSafeEqual(actual, keyHash))
      return res.status(401).json({ code: "API_UNAUTHORIZED" });
    if (inFlight >= 16)
      return res
        .status(429)
        .set("Retry-After", "5")
        .json({ code: "QUEUE_FULL" });
    inFlight++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight--;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    res.set("Cache-Control", "no-store");
    next();
  });
  const route = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  const prefix = "/api/catalog/v1";
  app.get(
    prefix + "/libraries",
    route(async (req, res) => {
      const data = inventory({ country: req.query.country || "IN" });
      let offset = 0;
      if (req.query.cursor) {
        const c = service.refs.read(req.query.cursor);
        if (c.kind !== "directory" || c.inventoryHash !== data.inventoryHash)
          throw failure("INVALID_CURSOR", "Directory changed", 400);
        offset = c.offset;
      }
      res.json({
        total: data.total,
        libraries: data.libraries.slice(offset, offset + 50),
        nextCursor:
          offset + 50 < data.total
            ? service.refs.sign({
                kind: "directory",
                inventoryHash: data.inventoryHash,
                offset: offset + 50,
                expiresAt: Date.now() + 3600000,
              })
            : null,
      });
    }),
  );
  app.get(
    prefix + "/libraries/:id/capabilities",
    route(async (req, res) => res.json(service.capabilities(req.params.id))),
  );
  app.get(
    prefix + "/libraries/:id/health",
    route(async (req, res) => {
      service.connection(req.params.id);
      const p = join(store.root, "progress.json"),
        row = existsSync(p)
          ? JSON.parse(readFileSync(p)).libraries.find(
              (l) => l.libraryId === req.params.id,
            )
          : null;
      res.json({
        libraryId: req.params.id,
        health: row?.lastHealth || null,
        qualification: row
          ? {
              status: row.status,
              books: row.books.length,
              lastCheckedAt: row.lastCheckedAt,
            }
          : null,
      });
    }),
  );
  app.post(
    prefix + "/search",
    route(async (req, res) => res.json(await service.search(req.body))),
  );
  app.post(
    prefix + "/records/resolve",
    route(async (req, res) =>
      res.json(await service.resolve(req.body?.recordRef)),
    ),
  );
  app.post(
    prefix + "/audit-runs",
    route(async (req, res) => {
      const id = req.get("idempotency-key");
      if (!id || id.length > 128)
        throw failure("INVALID_QUERY", "Idempotency-Key required", 400);
      const path = join(store.root, "submissions.json"),
        saved = existsSync(path) ? JSON.parse(readFileSync(path)) : {};
      const key = hash(id),
        bodyHash = hash(req.body);
      if (saved[key]) {
        if (saved[key].bodyHash !== bodyHash)
          throw failure(
            "IDEMPOTENCY_CONFLICT",
            "Key reused with another request",
            409,
          );
        return res.status(202).json(saved[key]);
      }
      if (active)
        throw failure("RUN_ACTIVE", "An audit is already running", 409);
      if (
        !["qualify", "health"].includes(req.body?.mode) ||
        !Array.isArray(req.body.libraryIds) ||
        !req.body.libraryIds.length ||
        req.body.libraryIds.length > 100
      )
        throw failure(
          "INVALID_QUERY",
          "Choose mode and 1–100 explicit library IDs",
          400,
        );
      const manifest = readManifest(store);
      if (
        req.body.libraryIds.some(
          (id) => !manifest.inventory.libraries.some((l) => l.libraryId === id),
        )
      )
        throw failure("LIBRARY_NOT_FOUND", "Unknown run target", 404);
      const controller = new AbortController();
      const submission = { runId: manifest.runId, bodyHash, state: "accepted" };
      saved[key] = submission;
      store.save("submissions.json", saved);
      active = { controller, runId: manifest.runId };
      active.promise = run(store, service, {
        libraryIds: req.body.libraryIds,
        mode: req.body.mode,
        signal: controller.signal,
      })
        .then(() => {
          saved[key].state = controller.signal.aborted
            ? "interrupted"
            : "completed";
          report(store);
        })
        .catch((error) => {
          saved[key].state = "failed";
          saved[key].code = error.code || error.name;
        })
        .finally(() => {
          store.save("submissions.json", saved);
          active = null;
        });
      res.status(202).json(submission);
    }),
  );
  app.get(
    prefix + "/audit-runs/:id",
    route(async (req, res) => {
      const m = readManifest(store);
      if (req.params.id !== m.runId)
        throw failure("RUN_NOT_FOUND", "Unknown run", 404);
      const p = join(store.root, "progress.json");
      res.json({
        active: active?.runId === m.runId,
        progress: existsSync(p) ? JSON.parse(readFileSync(p)) : null,
      });
    }),
  );
  app.get(
    prefix + "/audit-runs/:id/report",
    route(async (req, res) => {
      const m = readManifest(store);
      if (req.params.id !== m.runId)
        throw failure("RUN_NOT_FOUND", "Unknown run", 404);
      const format = req.query.format || "json",
        file = {
          json: "progress.json",
          csv: "library-status.csv",
          html: "report.html",
        }[format];
      if (!file) throw failure("INVALID_QUERY", "Unknown report format", 400);
      if (!existsSync(join(store.root, file)))
        throw failure("REPORT_NOT_READY", "Generate a report first", 409);
      res
        .type({ json: "json", csv: "csv", html: "html" }[format])
        .send(readFileSync(join(store.root, file)));
    }),
  );
  app.post(
    prefix + "/audit-runs/:id/cancel",
    route(async (req, res) => {
      if (active?.runId !== req.params.id)
        throw failure("RUN_NOT_ACTIVE", "Run is not active", 409);
      active.controller.abort();
      res.status(202).json({ state: "cancelling" });
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 502).json({
      code: error.code || "CONNECTOR_ERROR",
      message: error.status
        ? error.message
        : "Catalog operation failed; inspect internal evidence",
      requestId: error.attemptId || null,
    });
  });
  app.locals.stopAudit = async () => {
    if (active) {
      active.controller.abort();
      await active.promise;
    }
  };
  return app;
}
