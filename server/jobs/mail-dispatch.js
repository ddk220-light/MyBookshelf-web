import { AsyncLocalStorage } from "node:async_hooks";
import { statementTimeoutOption } from "../db/pool-options.js";
import { waitUntil } from "../catalog-store/waitUntil.js";
import { runMailBatch } from "./mail.js";

// Account mail is sent right after the response of the request that queued it,
// so a reader does not wait for the scheduled job. The runtime role only queues
// the row (often inside a transaction that commits just before the response);
// the worker role then leases and sends it with the same lease and idempotency
// key as the job, so the two can never send one mail twice. Any failure leaves
// the row queued for the scheduled job. Nothing about a mail is ever logged.
const scope = new AsyncLocalStorage();

// Called by enqueueAccountMail once its row is written. Outside a tracked
// request (the scheduled job's own deletion mail) it does nothing: that job's
// mail batch sends it.
export function noteQueuedMail(id, config) {
  scope.getStore()?.(id, config);
}

const ready = (config) =>
  Boolean(
    config?.workerDatabaseURL &&
      config.resendKey &&
      config.mailFrom &&
      typeof config.jobSecret === "string" &&
      config.jobSecret.length >= 32,
  );

export function createMailDispatcher({
  transport,
  defer = waitUntil,
  createPool = async (url) => {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 3000,
      // Close the connection soon after sending: an idle connection is no
      // reason to keep the database awake.
      idleTimeoutMillis: 1000,
      ...statementTimeoutOption(url, 5000),
    });
    pool.on("error", () => {});
    return pool;
  },
} = {}) {
  let pool, poolURL, verified;
  async function workerPool(url) {
    if (pool && poolURL !== url) {
      await pool.end().catch(() => {});
      pool = undefined;
    }
    if (!pool) {
      pool = await createPool(url);
      poolURL = url;
      verified = false;
    }
    if (!verified) {
      // The same role guard as the scheduled job: never send as an owner,
      // superuser or BYPASSRLS role.
      const role = (
        await pool.query(
          `SELECT rolsuper,rolbypassrls,pg_has_role(current_user,c.relowner,'USAGE') AS owns_jobs FROM pg_roles r CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='account_mail_jobs'::regclass`,
        )
      ).rows[0];
      if (!role || role.rolsuper || role.rolbypassrls || role.owns_jobs)
        throw Error("Privileged worker role.");
      verified = true;
    }
    return pool;
  }
  async function deliver(ids, config) {
    try {
      const current = await workerPool(config.workerDatabaseURL);
      for (const jobId of ids)
        await runMailBatch(current, config, {
          transport,
          jobId,
          limit: 1,
          cleanup: false,
        });
    } catch {
      /* Left queued for the scheduled job; no details are logged. */
    }
  }
  return {
    // Runs `handle` for one request; mail queued during it is sent once the
    // response has finished (so every transaction that queued it has ended).
    track(res, handle) {
      let ids, config;
      const note = (id, value) => {
        if (!ready(value)) return;
        config = value;
        if (ids) return void ids.push(id);
        ids = [id];
        const finished = new Promise((resolve) => {
          if (res.writableFinished || res.destroyed) return resolve();
          res.once("finish", resolve);
          res.once("close", resolve);
        });
        defer(() => finished.then(() => deliver(ids, config)));
      };
      return scope.run(note, handle);
    },
    async close() {
      await pool?.end().catch(() => {});
      pool = undefined;
    },
  };
}
