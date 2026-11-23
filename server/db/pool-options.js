// Server-side statement limit for an account database pool.
//
// node-postgres sends `statement_timeout` in the connection's startup packet.
// A transaction-mode pooler (Neon's `-pooler` host, PgBouncer) refuses such a
// connection ("unsupported startup parameter"). For a pooler host the
// parameter is left out and the limit comes from the role instead
// (server/db/runtime-grants.sql: ALTER ROLE ... SET statement_timeout). A
// direct connection keeps the parameter exactly as before.
// The same rule as the catalog store (server/catalog-store/pool.js).
export function isPoolerConnection(connectionString) {
  try { return /-pooler\./i.test(new URL(connectionString).hostname); } catch { return false; }
}

export function statementTimeoutOption(connectionString, statementTimeoutMs) {
  return isPoolerConnection(connectionString) ? {} : { statement_timeout: statementTimeoutMs };
}
