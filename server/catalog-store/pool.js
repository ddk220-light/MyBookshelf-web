import { Pool } from 'pg';

// A lazy pg pool for the catalog store (plan 4.1): one small pool per function
// instance, created on first use. Every query has a hard client-side timeout
// on top of the server's statement_timeout, so a slow or sleeping database
// costs a reader at most that long, and callers fail open.

const coded = (message, code) => Object.assign(new Error(message), { code });

export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(coded('Catalog store timed out', 'CATALOG_STORE_TIMEOUT')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// A transaction-mode pooler (Neon's `-pooler` host, PgBouncer) refuses a
// connection whose startup packet carries `statement_timeout` ("unsupported
// startup parameter"), which would turn every catalog query into a store
// failure. There the server-side limit comes from the role
// (runtime-grants.sql: ALTER ROLE ... SET statement_timeout) and the
// client-side `query_timeout` below still bounds each call.
export function isPoolerConnection(connectionString) {
  try { return /-pooler\./i.test(new URL(connectionString).hostname); } catch { return false; }
}

export function poolSettings(connectionString, { max = 3, statementTimeoutMs = 1500 } = {}) {
  return { connectionString, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 3_000,
    ...(isPoolerConnection(connectionString) ? {} : { statement_timeout: statementTimeoutMs }), application_name: 'mybookshelf-catalog' };
}

export function createCatalogDatabase(connectionString, { max = 3, statementTimeoutMs = 1500, PoolClass = Pool } = {}) {
  let pool = null;
  const get = () => {
    if (!pool) {
      pool = new PoolClass(poolSettings(connectionString, { max, statementTimeoutMs }));
      // An idle client that drops must never crash the process.
      pool.on('error', () => {});
    }
    return pool;
  };
  return Object.freeze({
    // `timeoutMs` bounds the whole call, including waiting for a connection.
    query(text, values = [], { timeoutMs = statementTimeoutMs + 500 } = {}) {
      const work = get().query({ text, values, query_timeout: timeoutMs });
      work.catch(() => {});
      return withTimeout(work, timeoutMs);
    },
    async transaction(task) {
      const client = await get().connect();
      try {
        await client.query('BEGIN');
        const result = await task(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async end() { if (pool) { const current = pool; pool = null; await current.end(); } },
  });
}
