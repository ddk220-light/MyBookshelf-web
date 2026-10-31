import { getProvider } from '../services/providers/index.js';
import { createCatalogBookKey } from './contracts.js';
import { rankSearchResults } from '../services/searchRelevance.js';

export function createPublicCatalogBookService({ directory, providerFor = getProvider }) {
  function provider(libraryId) {
    const library = directory.resolve(libraryId);
    const entry = directory.entry(libraryId);
    if (!library?.capabilities.titleSearch || !entry) return null;
    const adapter = providerFor(entry);
    return adapter?.searchCatalog && adapter?.resolveCatalogRecord ? adapter : null;
  }

  function book(libraryId, record) {
    return { ...record, bookKey: createCatalogBookKey(libraryId, record.recordId) };
  }

  return Object.freeze({
    supports: (libraryId) => Boolean(provider(libraryId)),
    async search(libraryId, query, options = {}) {
      const adapter = provider(libraryId);
      if (!adapter) throw Object.assign(new Error('Catalog title search is not supported'), { code: 'CATALOG_UNSUPPORTED' });
      const result = await adapter.searchCatalog(query, options);
      const records = (Array.isArray(result) ? result : result.records).map(record => book(libraryId, record));
      // Put title/author hits ahead of broader catalog keyword matches, while
      // retaining every returned record (including subject-only searches).
      const ranked = rankSearchResults(records, { title: query, max: records.length });
      const keys = new Set(ranked.map(record => record.bookKey));
      return { kind: 'candidates', candidates: [...ranked, ...records.filter(record => !keys.has(record.bookKey))],
        ...(Number.isSafeInteger(result.nextOffset) && result.nextOffset > (options.offset || 0) ? { nextOffset: result.nextOffset } : {}),
        catalog: { libraryId, name: directory.resolve(libraryId).name, hasMore: !Array.isArray(result) && result.hasMore === true } };
    },
    async resolve({ libraryId, recordId }) {
      const adapter = provider(libraryId);
      if (!adapter) return null;
      return book(libraryId, await adapter.resolveCatalogRecord(recordId));
    },
  });
}
