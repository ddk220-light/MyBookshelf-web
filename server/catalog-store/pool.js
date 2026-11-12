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

export function createCatalogDatabase(connectionString, { max = 3, statementTimeoutMs = 1500, PoolClass = Pool } = {}) {
  let pool = null;
  const get = () => {
    if (!pool) {
      pool = new PoolClass({ connectionString, max, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 3_000,
        statement_timeout: statementTimeoutMs, application_name: 'mybookshelf-catalog' });
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
