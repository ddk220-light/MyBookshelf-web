import { readCatalogStoreConfig } from './config.js';
import { createCatalogDatabase } from './pool.js';
import { createPgAnswerStore } from './holdings.js';
import { createPgHealthRecord } from './health.js';
import { createPgHostGate, createMemoryHostGate } from './hostGate.js';
import { createUsageLog } from './usageLog.js';
import { createSubmissions } from './requests.js';
import { createCatalogPolicy } from './policy.js';
import { waitUntil } from './waitUntil.js';
import { createMemoryAnswerStore, createMemoryHealthRecord } from '../services/catalog-lookup/record.js';

// The catalog store (plan 3.6): stored answers, the health record, the
// cross-instance host gate, the anonymous operational log and submissions.
// Separate infrastructure from the account database, with its own roles;
// `/api/v2` stays cookie-free and never touches account data.
//
// Every call fails open: if the store is disabled, slow or down, lookups run
// live and nothing is stored; a store failure is never shown to the reader
// and never becomes "not found". Without CATALOG_STORE_ENABLED and
// CATALOG_DATABASE_URL the in-memory versions are used (answers are kept only
// for this instance's lifetime).
export function createCatalogStore({ env = process.env, config = readCatalogStoreConfig(env), policy = createCatalogPolicy(),
  db = undefined, defer = waitUntil, usageSink = null } = {}) {
  const database = db !== undefined ? db : config.storeEnabled ? createCatalogDatabase(config.databaseUrl) : null;
  const memoryGate = createMemoryHostGate();
  return Object.freeze({
    durable: Boolean(database),
    config,
    policyFor: policy.policyFor,
    policy,
    defer,
    answers: database ? createPgAnswerStore(database) : createMemoryAnswerStore(),
    health: database ? createPgHealthRecord(database) : createMemoryHealthRecord(),
    hostGate: database ? createPgHostGate(database, { fallback: memoryGate }) : memoryGate,
    usage: createUsageLog({ enabled: config.usageLogEnabled, db: database, sink: usageSink, defer }),
    submissions: createSubmissions({ db: database, secret: config.bucketSecret, defer }),
    close: async () => { await database?.end?.(); },
  });
}
