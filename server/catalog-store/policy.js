import reviewed from '../data/catalog-policies.json' with { type: 'json' };

// Library opt-outs (plan 4.2, decision 8) and catalog systems whose terms do
// not allow storing availability (owner decision, 23 November 2026: "If the
// site does not allow us to store book availability, then check each time
// for the book availability, do not cache those."). A reviewed, versioned
// file, not a database flag: it is read before every answer write even when
// the database is down, changes are reviewed in Git, and a deploy that adds
// an opt-out also triggers the purge (the daily job deletes those answers).
//
//   { "schemaVersion": 1,
//     "platforms": {
//       "<platform>": { "storeAnswers": false, "reason": "...", "sourceUrl": "https://...", "reviewedOn": "YYYY-MM-DD" } },
//     "libraries": {
//       "<libraryId>": { "storeAnswers": false, "backgroundChecks": false,
//                        "reason": "...", "sourceUrl": "https://...", "reviewedOn": "YYYY-MM-DD" } } }
//
// A platform rule covers every library of that catalog system: the platform
// is the library ID's prefix ("bc" in "bc:sfpl"), which the directory always
// builds from the library's platform (services/directory.js). A library is
// held to the stricter of its platform's rule and its own.
//
// `storeAnswers: false` means nothing about a book's availability is kept for
// that library: no stored answers (none is written, any already stored is
// never read, and the daily job deletes them), no shared rows cache, no
// fallback copy and no adapter cache. Every check and search-list mark is
// then one live request. The health record and the operational log describe
// our own service and are still written. `backgroundChecks: false` turns off
// result marking for that library.

const OPEN = Object.freeze({ storeAnswers: true, backgroundChecks: true });
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
const PLATFORM_ID = /^[a-z][a-z0-9_-]{0,31}$/;

function parseRules(rules, valid, { needsSource = false } = {}) {
  const parsed = new Map();
  for (const [id, entry] of Object.entries(rules)) {
    if (!valid.test(id) || !entry || typeof entry !== 'object') throw new TypeError(`Invalid catalog policy entry: ${id}`);
    for (const field of ['storeAnswers', 'backgroundChecks']) {
      if (entry[field] !== undefined && typeof entry[field] !== 'boolean') throw new TypeError(`Invalid ${field} for ${id}`);
    }
    if (entry.storeAnswers === false && (typeof entry.reason !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn || ''))) {
      throw new TypeError(`An opt-out needs a reason and reviewedOn: ${id}`);
    }
    // A catalog system's rule cites the terms it follows.
    if (needsSource && entry.storeAnswers === false && !/^https:\/\/\S+$/.test(entry.sourceUrl || '')) {
      throw new TypeError(`A platform rule needs its sourceUrl: ${id}`);
    }
    parsed.set(id, Object.freeze({ storeAnswers: entry.storeAnswers !== false, backgroundChecks: entry.backgroundChecks !== false }));
  }
  return parsed;
}

function checkShape(value) {
  const object = item => item && typeof item === 'object' && !Array.isArray(item);
  if (!object(value) || value.schemaVersion !== 1 || !object(value.libraries) || (value.platforms !== undefined && !object(value.platforms))) {
    throw new TypeError('catalog-policies.json must be { schemaVersion: 1, platforms?: {}, libraries: {} }');
  }
}

/** The library rules, a Map by library ID; throws on a malformed file. */
export function parseCatalogPolicies(value) {
  checkShape(value);
  return parseRules(value.libraries, LIBRARY_ID);
}

/** The catalog-system rules, a Map by platform ID; throws on a malformed file. */
export function parsePlatformPolicies(value) {
  checkShape(value);
  return parseRules(value.platforms || {}, PLATFORM_ID, { needsSource: true });
}

/** The platform of a library ID: its prefix ("bc:sfpl" -> "bc"). */
export function platformOfLibrary(libraryId) {
  const id = String(libraryId || '');
  return id.includes(':') ? id.slice(0, id.indexOf(':')) : '';
}

// Imported (not read at run time) so the function bundle always carries it.
export function createCatalogPolicy({ policies = reviewed } = {}) {
  const libraries = parseCatalogPolicies(policies);
  const platforms = parsePlatformPolicies(policies);
  return Object.freeze({
    policyFor: libraryId => {
      const own = libraries.get(libraryId), system = platforms.get(platformOfLibrary(libraryId));
      if (!system) return own || OPEN;
      if (!own) return system;
      return Object.freeze({ storeAnswers: own.storeAnswers && system.storeAnswers, backgroundChecks: own.backgroundChecks && system.backgroundChecks });
    },
    // Libraries whose stored answers must be purged (their own rule).
    optedOut: () => [...libraries].filter(([, policy]) => !policy.storeAnswers).map(([libraryId]) => libraryId),
    // Catalog systems whose stored answers must be purged, for every library of each.
    noStorePlatforms: () => [...platforms].filter(([, policy]) => !policy.storeAnswers).map(([platform]) => platform),
  });
}

// The reviewed file. The lookup layer, the adapters and the tools use it when
// no policy is passed, so no caller can keep what the file forbids.
export const reviewedPolicy = createCatalogPolicy();

/** Whether availability may be kept for this library: stored answers, the rows cache and adapter caches. */
export function storesAvailability(libraryId, policyFor = reviewedPolicy.policyFor) {
  try { return policyFor(libraryId)?.storeAnswers !== false; } catch { return false; }
}
