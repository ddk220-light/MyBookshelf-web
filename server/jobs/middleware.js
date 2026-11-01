import { createHash, timingSafeEqual } from "node:crypto";
import { readAccountConfig } from "../accounts/config.js";
export function createJobMiddleware({ env = process.env } = {}) {
  let pool, maintenance;
  return async (req, res, next) => {
    if (req.path !== "/api/internal/account-jobs") return next();
    res.set({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    });
    const secret = env.ACCOUNTS_CRON_SECRET || env.CRON_SECRET,
      provided = req.get("Authorization") || "";
    if (
      typeof secret !== "string" ||
      secret.length < 32 ||
      !timingSafeEqual(
        createHash("sha256").update(provided).digest(),
        createHash("sha256")
          .update("Bearer " + secret)
          .digest(),
      )
    )
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "This endpoint is private." },
      });
    if (req.method !== "GET") return res.status(405).end();
    if (!env.ACCOUNTS_WORKER_DATABASE_URL || !env.ACCOUNTS_JOB_SECRET)
      return res.status(503).json({
        error: {
          code: "JOBS_UNAVAILABLE",
          message: "Account jobs are unavailable.",
        },
      });
    try {
      const [
        { Pool },
        { runMailBatch },
        { runProviderCleanupBatch },
        { runDeletionBatch },
      ] = await Promise.all([
        import("pg"),
        import("./mail.js"),
        import("./provider-cleanup.js"),
        import("./deletions.js"),
      ]);
      if (!pool) {
        pool = new Pool({
          connectionString: env.ACCOUNTS_WORKER_DATABASE_URL,
          max: 2,
          connectionTimeoutMillis: 3000,
          statement_timeout: 5000,
        });
        pool.on("error", () => {});
      }
      const role = (
        await pool.query(
          `SELECT rolsuper,rolbypassrls,pg_has_role(current_user,c.relowner,'USAGE') AS owns_jobs FROM pg_roles r CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='account_mail_jobs'::regclass`,
        )
      ).rows[0];
      if (!role || role.rolsuper || role.rolbypassrls || role.owns_jobs)
        throw Error("Privileged worker role.");
      await pool.query(
        `INSERT INTO account_job_health(name,last_started) VALUES('account-maintenance',now()) ON CONFLICT(name) DO UPDATE SET last_started=excluded.last_started`,
      );
      // Account entry may be disabled during an incident while cleanup continues.
      // The exact deployment/environment and role guards still apply.
      const config = readAccountConfig({ ...env, ACCOUNTS_ENABLED: "true" });
      if (!maintenance) {
        const { createAccountService } = await import("../accounts/service.js");
        maintenance = await createAccountService({
          ...config,
          readingDatabaseURL: undefined,
        });
      }
      const ledger = maintenance.maintenance.ledger;
      const deletion = ledger
        ? await runDeletionBatch(
            pool,
            { ledger, purge: maintenance.maintenance.purgeDeletion },
            { limit: 1 },
          )
        : { processed: 0, unavailable: true };
      const providers = await runProviderCleanupBatch(pool, config, {
        ledger,
        limit: 2,
      });
      const mail =
        env.RESEND_API_KEY && env.ACCOUNTS_MAIL_FROM
          ? await runMailBatch(pool, config, { limit: 2 })
          : { processed: 0, unavailable: true };
      await pool.query("SELECT public.account_retention()");
      if (ledger) {
        await ledger.providerJobs();
        await ledger.pruneExpired();
      }
      const alerts = (
        await pool.query(`SELECT
    EXISTS(SELECT 1 FROM account_deletions WHERE status<>'cleaned' AND "requestedAt"<now()-interval '24 hours') AS "deletionOverdue",
    EXISTS(SELECT 1 FROM account_provider_cleanup WHERE status IN ('queued','running','expired') AND "createdAt"<now()-interval '24 hours') AS "providerCleanupOverdue",
    EXISTS(SELECT 1 FROM account_mail_jobs WHERE status='queued' AND "createdAt"<now()-interval '1 hour') AS "mailDelayed"`)
      ).rows[0];
      const unhealthy =
        deletion.unavailable ||
        mail.unavailable ||
        Object.values(alerts).some(Boolean);
      if (!unhealthy)
        await pool.query(
          `UPDATE account_job_health SET last_succeeded=now() WHERE name='account-maintenance'`,
        );
      return res
        .status(unhealthy ? 503 : 200)
        .json({ deletion, providers, mail, alerts });
    } catch {
      return res.status(503).json({
        error: {
          code: "JOBS_UNAVAILABLE",
          message: "Account jobs are unavailable.",
        },
      });
    }
  };
}
