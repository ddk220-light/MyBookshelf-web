import { readCatalogStoreConfig } from './config.js';
import { createCatalogDatabase, withTimeout } from './pool.js';
import { createPgAnswerStore } from './holdings.js';
import { createPgHealthRecord } from './health.js';
import { createPgHostGate, createMemoryHostGate } from './hostGate.js';
import { createUsageLog } from './usageLog.js';
import { createOutcomeCounts } from './outcomeCounts.js';
import { createCheckBudget } from './checkBudget.js';
import { createSubmissions } from './requests.js';
import { createCatalogPolicy } from './policy.js';
import { waitUntil } from './waitUntil.js';
import { createMemoryAnswerStore, createMemoryHealthRecord } from '../services/catalog-lookup/record.js';

// The catalog store (plan 3.6): stored answers, the health record, the
// cross-instance host gate, the anonymous operational log with its daily
// outcome counts per library, submissions and the book-check request budget.
// Separate infrastructure from the account database, with its own roles;
// `/api/v2` stays cookie-free and never touches account data.
//
// Every call fails open: if the store is disabled, slow or down, lookups run
// live and nothing is stored; a store failure is never shown to the reader
// and never becomes "not found". Without CATALOG_STORE_ENABLED and
// CATALOG_DATABASE_URL the in-memory versions are used (answers are kept only
// for this instance's lifetime).
//
// Because the store fails open, a broken connection is silent to readers.
// `status()` makes it visible: one `SELECT 1` with a short limit, reported as
// one word ('ok', 'failed', or 'off' when no database is configured), never
// an error message, code or connection detail. `/api/health` and the admin
// summary show it. A result is reused for a few seconds and concurrent calls
// share one query, so the public health route stays cheap.
export const STORE_STATUS_TIMEOUT_MS = 2_500;
const STORE_STATUS_REUSE_MS = 15_000;

export function createStoreStatus(database, { timeoutMs = STORE_STATUS_TIMEOUT_MS, reuseMs = STORE_STATUS_REUSE_MS, now = () => Date.now() } = {}) {
  let last = null, pending = null;
  return async function status() {
    if (!database) return 'off';
    if (last && now() - last.at < reuseMs) return last.value;
    pending ||= Promise.resolve()
      .then(() => withTimeout(Promise.resolve(database.query('SELECT 1 AS ok', [], { timeoutMs })), timeoutMs))
      .then(result => (result?.rows?.[0]?.ok === 1 ? 'ok' : 'failed'), () => 'failed')
      .then(value => { last = { value, at: now() }; pending = null; return value; });
    return pending;
  };
}

export function createCatalogStore({ env = process.env, config = readCatalogStoreConfig(env), policy = createCatalogPolicy(),
  db = undefined, defer = waitUntil, usageSink = null, outcomeSink = null } = {}) {
  const database = db !== undefined ? db : config.storeEnabled ? createCatalogDatabase(config.databaseUrl) : null;
  const memoryGate = createMemoryHostGate();
  return Object.freeze({
    durable: Boolean(database),
    status: createStoreStatus(database),
    config,
    policyFor: policy.policyFor,
    policy,
    defer,
    answers: database ? createPgAnswerStore(database) : createMemoryAnswerStore(),
    health: database ? createPgHealthRecord(database) : createMemoryHealthRecord(),
    hostGate: database ? createPgHostGate(database, { fallback: memoryGate }) : memoryGate,
    usage: createUsageLog({ enabled: config.usageLogEnabled, db: database, sink: usageSink, defer }),
    // Daily counts per library: no book, text or reader (outcomeCounts.js).
    outcomes: createOutcomeCounts({ enabled: config.usageLogEnabled, db: database, sink: outcomeSink, defer }),
    // The tap endpoint's budget per library and per client (checkBudget.js).
    checkBudget: createCheckBudget({ db: database, secret: config.bucketSecret }),
    submissions: createSubmissions({ db: database, secret: config.bucketSecret, defer }),
    close: async () => { await database?.end?.(); },
  });
}
