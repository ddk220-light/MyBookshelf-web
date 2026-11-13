import reviewed from '../data/catalog-policies.json' with { type: 'json' };

// Library opt-outs (plan 4.2, decision 8). A reviewed, versioned file, not a
// database flag: it is read before every answer write even when the database
// is down, changes are reviewed in Git, and a deploy that adds an opt-out
// also triggers the purge (the daily job deletes that library's answers).
//
//   { "schemaVersion": 1, "libraries": {
//       "<libraryId>": { "storeAnswers": false, "backgroundChecks": false,
//                        "reason": "...", "sourceUrl": "https://...", "reviewedOn": "YYYY-MM-DD" } } }
//
// `storeAnswers: false` stops and purges stored answers only; the health record
// and the operational log describe our own service and are still written.
// `backgroundChecks: false` turns off result marking for that library.

const OPEN = Object.freeze({ storeAnswers: true, backgroundChecks: true });

export function parseCatalogPolicies(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || !value.libraries || typeof value.libraries !== 'object' || Array.isArray(value.libraries)) {
    throw new TypeError('catalog-policies.json must be { schemaVersion: 1, libraries: {} }');
  }
  const libraries = new Map();
  for (const [libraryId, entry] of Object.entries(value.libraries)) {
    if (!/^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/.test(libraryId) || !entry || typeof entry !== 'object') {
      throw new TypeError(`Invalid catalog policy entry: ${libraryId}`);
    }
    for (const field of ['storeAnswers', 'backgroundChecks']) {
      if (entry[field] !== undefined && typeof entry[field] !== 'boolean') throw new TypeError(`Invalid ${field} for ${libraryId}`);
    }
    if (entry.storeAnswers === false && (typeof entry.reason !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedOn || ''))) {
      throw new TypeError(`An opt-out needs a reason and reviewedOn: ${libraryId}`);
    }
    libraries.set(libraryId, Object.freeze({ storeAnswers: entry.storeAnswers !== false, backgroundChecks: entry.backgroundChecks !== false }));
  }
  return libraries;
}

// Imported (not read at run time) so the function bundle always carries it.
export function createCatalogPolicy({ policies = reviewed } = {}) {
  const libraries = parseCatalogPolicies(policies);
  return Object.freeze({
    policyFor: libraryId => libraries.get(libraryId) || OPEN,
    // Libraries whose stored answers must be purged.
    optedOut: () => [...libraries].filter(([, policy]) => !policy.storeAnswers).map(([libraryId]) => libraryId),
  });
}
