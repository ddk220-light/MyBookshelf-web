import * as bibliocommons from './bibliocommons.js';
import * as koha from './koha.js';
import * as iithKoha from './iithKoha.js';
import * as chamo from './chamo.js';
import * as libsys from './libsys.js';
import * as vega from './vega.js';
import * as aspen from './aspen.js';
import * as calil from './calil.js';
import * as evergreen from './evergreen.js';
import * as indcat from './indcat.js';
import * as egranthalaya from './egranthalaya.js';
import * as visakhapatnam from './visakhapatnam.js';
import * as libman from './libman.js';
import * as vufind from './vufind.js';
import * as discoveryAcademic from './discoveryAcademic.js';
import * as discoveryCommunity from './discoveryCommunity.js';
import { createHash } from 'node:crypto';
import { normalizeAvailability } from './contract.js';

function primaryProvider(library) {
  if (!library || !Array.isArray(library.capabilities) || !library.capabilities.includes('availability')) return null;
  const normalize = (check) => async (...args) => normalizeAvailability(await check(...args));
  switch (library.platform) {
    case 'vpl':
      return { checkAvailability: () => visakhapatnam.checkPublicAvailability(), isbnLookup: false,
        findBookCandidates: book => visakhapatnam.searchBookCandidates(library, book),
        searchCatalog: query => visakhapatnam.searchPublicCatalog(library, query),
        resolveCatalogRecord: async recordId => ({ ...await visakhapatnam.resolvePublicCatalogRecord(library, recordId), observation: await visakhapatnam.checkPublicRecordAvailability(library, recordId) }),
        checkRecordAvailability: recordId => visakhapatnam.checkPublicRecordAvailability(library, recordId) };
    case 'bc':
    case 'bibliocommons':
      // The public v2 service needs the native-equivalent BiblioCommons
      // observation, including match confidence and provider failures. Legacy
      // routes are retired; their compatibility function remains exported by
      // the adapter for source-level consumers.
      return { checkAvailability: (isbn, title, author) => bibliocommons.checkPublicAvailability(library.slug, isbn, title, author), searchBookCandidates: query => bibliocommons.searchBookCandidates(library.slug, query), login: (card, pin) => bibliocommons.login(library.slug, card, pin) };
    case 'koha': {
      // Result marking (catalog-lookup) reads one keyword search page whose
      // rows may show ISBNs, or the RSS form for libraries that opt in. Rows
      // of an unscoped shared catalog do not prove this branch's holding.
      const markable = !library.publicCatalogApi && !(library.kohaSearchUnscoped && library.kohaBranchCode);
      const marking = markable ? { searchResultRows: query => (library.kohaRssRows === true
        ? koha.searchRssRows(library, query) : koha.searchPublicCatalog(library, query)) } : {};
      if (!library.publicCatalogCapabilities?.titleSearch) return { ...(library.publicCatalogApi ? {} : { searchCatalog: query => koha.searchCatalog(library, query), resolveCatalogRecord: id => koha.resolveCatalogRecord(library, id) }), ...marking, checkAvailability: isbn => (library.publicCatalogApi === 'iith-opac-v1' ? iithKoha : koha).checkPublicAvailability(library, isbn) };
      return { ...marking, checkAvailability: (isbn) => koha.checkPublicAvailability(library, isbn),
        searchCatalog: (query, options) => koha.searchPublicCatalog(library, query, options),
        findBookCandidates: book => koha.searchBookCandidates(library, book),
        resolveCatalogRecord: (recordId) => koha.resolvePublicCatalogRecord(library, recordId),
        checkRecordAvailability: (recordId) => koha.checkPublicRecordAvailability(library, recordId) };
    }
    case 'chamo':
      return { checkAvailability: (isbn) => chamo.checkPublicAvailability(library, isbn) };
    case 'libsys':
      return { checkAvailability: normalize((isbn) => libsys.checkAvailability(library, isbn)) };
    case 'vega':
      return { checkAvailability: (isbn) => vega.checkAvailability(library, isbn) };
    case 'aspen':
      return { checkAvailability: (isbn) => aspen.checkAvailability(library, isbn) };
    case 'calil':
      return { checkAvailability: (isbn) => calil.checkAvailability(library, isbn), checkMany: isbns => calil.checkMany(library, isbns) };
    case 'evergreen':
      return { checkAvailability: (isbn) => evergreen.checkAvailability(library, isbn) };
    case 'egranthalaya':
      return { checkAvailability: (isbn) => egranthalaya.checkAvailability(library, isbn), searchCatalog: query => egranthalaya.searchCatalog(library, query), resolveCatalogRecord: id => egranthalaya.resolveCatalogRecord(library, id) };
    case 'indcat':
      return { checkAvailability: isbn => indcat.checkAvailability(library, isbn), searchCatalog: query => indcat.searchCatalog(library, query), resolveCatalogRecord: id => indcat.resolveCatalogRecord(library, id) };
    case 'libman':
    case 'vufind':
    case 'discovery-academic':
    case 'discovery-community': {
      const adapter = { libman, vufind, 'discovery-academic': discoveryAcademic, 'discovery-community': discoveryCommunity }[library.platform];
      return { checkAvailability: (isbn, title, author) => adapter.checkAvailability(library, isbn, title, author),
        searchCatalog: query => adapter.searchCatalog(library, query),
        resolveCatalogRecord: id => adapter.resolveCatalogRecord(library, id) };
    }
    default:
      return null;
  }
}

function alternatePrefix(entry) {
  return `alt.${createHash('sha256').update(entry.sourceConnectionId).digest('hex').slice(0, 12)}.`;
}

// Keep saved library IDs and old provider record IDs stable while adding a
// better institution catalog. An alternate record carries a stable route ID,
// never a URL or a temporary provider session.
export function providerWithAlternates(library, providerFor = primaryProvider) {
  const primary = providerFor(library);
  const alternates = (library?.alternateCatalogs || []).map(entry => ({ entry,
    prefix: alternatePrefix(entry), provider: providerFor(entry) })).filter(route => route.provider);
  if (!alternates.length) return primary;
  const main = { entry: library, prefix: '', provider: primary };
  const routes = [...alternates.filter(r => r.entry.preferForLookup), main,
    ...alternates.filter(r => !r.entry.preferForLookup)].filter(r => r.provider);
  return {
    ...primary,
    // Structured candidate search covers only the primary route.
    findBookCandidates: undefined,
    async searchCatalog(query) {
      let error;
      let completed = false;
      for (const route of routes) {
        if (!route.provider.searchCatalog) continue;
        try {
          const response = await route.provider.searchCatalog(query);
          const records = Array.isArray(response) ? response : response?.records;
          if (!Array.isArray(records)) throw new Error('Invalid catalog response');
          completed = true;
          if (records.length) return records.map(record => ({ ...record, recordId: route.prefix + record.recordId }));
        } catch (failure) { error = failure; }
      }
      // An empty second route must not hide a failed first route.
      if (error) throw error;
      if (completed) return [];
      throw Object.assign(new Error('Catalog search is unavailable'), { code: 'CATALOG_UNSUPPORTED' });
    },
    async resolveCatalogRecord(id) {
      const alternate = alternates.find(route => id.startsWith(route.prefix));
      if (id.startsWith('alt.') && !alternate) throw Object.assign(new Error('Unknown catalog route'), { code: 'CATALOG_UNRECOGNIZED' });
      const route = alternate || main;
      if (!route.provider?.resolveCatalogRecord) throw Object.assign(new Error('Catalog record cannot be opened'), { code: 'CATALOG_UNSUPPORTED' });
      const result = await route.provider.resolveCatalogRecord(id.slice(route.prefix.length));
      return result ? { ...result, recordId: id } : result;
    },
    async checkAvailability(...args) {
      let error, negative, uncertain, possible;
      for (const route of routes) {
        if (!route.provider.checkAvailability) continue;
        try {
          const result = await route.provider.checkAvailability(...args);
          if (['available', 'none_available', 'in_catalog'].includes(result?.outcome)
              || ['available', 'checked_out', 'waitlist'].includes(result?.status)) {
            if (result?.matchKind !== 'possible_match') return result;
            possible ||= result;
            continue;
          }
          if (result?.outcome === 'not_found') negative = result;
          else uncertain = result || { outcome: 'unknown' };
        } catch (failure) { error = failure; }
      }
      if (possible) return possible;
      if (uncertain) return uncertain;
      if (error) throw error;
      return negative || { outcome: 'unknown' };
    },
  };
}

export function getProvider(library) { return providerWithAlternates(library); }

export { bibliocommons, koha, chamo, libsys, vega, aspen, calil, evergreen, egranthalaya };
export { normalizeAvailability } from './contract.js';
