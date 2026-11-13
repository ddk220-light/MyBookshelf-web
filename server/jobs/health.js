import { statementTimeoutOption } from "../db/pool-options.js";
// Public aggregate readiness for the independent monitor. No identities,
// queue contents, timestamps or credentials are returned to the caller.
export function createAccountHealthMiddleware({ env = process.env } = {}) {
  let pool;
  const middleware = async (req, res, next) => {
    if (req.path !== "/api/account/health") return next();
    res.set({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    });
    if (req.method !== "GET") return res.status(405).end();
    const unavailable = () => res.status(503).json({ status: "unavailable" });
    if (
      !env.ACCOUNTS_WORKER_DATABASE_URL ||
      !env.ACCOUNTS_AUTH_DATABASE_URL ||
      !env.ACCOUNTS_READING_DATABASE_URL ||
      !env.BETTER_AUTH_SECRET ||
      !env.ACCOUNTS_JOB_SECRET ||
      !env.RESEND_API_KEY ||
      !env.ACCOUNTS_MAIL_FROM ||
      !env.ACCOUNTS_DELETION_LEDGER_READ_WRITE_TOKEN
    )
      return unavailable();
    try {
      if (!pool) {
        const { Pool } = await import("pg");
        pool = new Pool({
          connectionString: env.ACCOUNTS_WORKER_DATABASE_URL,
          max: 1,
          connectionTimeoutMillis: 3000,
          ...statementTimeoutOption(env.ACCOUNTS_WORKER_DATABASE_URL, 3000),
        });
        pool.on("error", () => {});
      }
      const role = (
        await pool.query(
          `SELECT rolsuper,rolbypassrls,pg_has_role(current_user,c.relowner,'USAGE') AS owns_jobs FROM pg_roles r CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='account_job_health'::regclass`,
        )
      ).rows[0];
      if (!role || role.rolsuper || role.rolbypassrls || role.owns_jobs)
        return unavailable();
      const health = (
        await pool.query(
          `SELECT last_succeeded>=now()-interval '15 minutes' AS fresh FROM account_job_health WHERE name='account-maintenance'`,
        )
      ).rows[0];
      if (!health?.fresh) return unavailable();
      return res.json({ status: "ready" });
    } catch {
      return unavailable();
    }
  };
  middleware.close = async () => {
    await pool?.end();
  };
  return middleware;
}
