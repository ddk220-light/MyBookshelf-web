import http from 'node:http';
import https from 'node:https';
import { Agent } from 'undici';

// Node 20+ races IPv6 and IPv4 ("happy eyeballs") and abandons each address
// after 250 ms by default. Many Indian catalogs publish an AAAA record that is
// unreachable from US hosting and answer IPv4 only after a ~270 ms round trip,
// so every connection failed with ETIMEDOUT in under 300 ms although curl
// connected in under a second (amguricollege.webopac.online and 11 other
// webopac hosts, 15 Nov 2026). Give each address attempt 2.5 s instead; the
// request deadlines in http.js still bound the whole operation.
//
// Only library-catalog connections get it (the dispatcher and agents below,
// used by http.js for catalog requests, by robots.js for robots.txt and by the
// KALNET transport). Node's process-wide default is left alone, so database
// and book-metadata connections keep their own behaviour.
export const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 2_500;
export const CATALOG_CONNECT_OPTIONS = Object.freeze({
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS,
});

let dispatcher;
const agents = new Map();

/** The fetch dispatcher for catalog requests (undici `connect` options). */
export function catalogDispatcher() {
  dispatcher ||= new Agent({ connect: { ...CATALOG_CONNECT_OPTIONS } });
  return dispatcher;
}

/** The node:http or node:https agent for catalog requests made without fetch. */
export function catalogAgent(protocol) {
  if (!agents.has(protocol)) {
    const Module = protocol === 'https:' ? https : http;
    // Node's global agent settings, plus the catalog connection attempt.
    agents.set(protocol, new Module.Agent({ keepAlive: true, scheduling: 'lifo', timeout: 5_000, ...CATALOG_CONNECT_OPTIONS }));
  }
  return agents.get(protocol);
}
