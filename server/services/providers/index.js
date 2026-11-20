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
import { AsyncLocalStorage } from 'node:async_hooks';
import { normalizeAvailability } from './contract.js';

const routeExecutors = new AsyncLocalStorage();

// The lookup layer can apply the selected catalog's budget and host guard.
// Callers without this scope keep the existing provider and fallback behavior.
export function withProviderRouteExecution(executor, task) {
  return routeExecutors.run(executor, task);
}

function executeRoute(route, method, task) {
  const executor = routeExecutors.getStore();
  return executor ? executor({ entry: route.entry, prefix: route.prefix, method }, task) : task();
}

function primaryProvider(library) {
  if (!library || !Array.isArray(library.capabilities) || !library.capabilities.includes('availability')) return null;
  const normalize = (check) => async (...args) => normalizeAvailability(await check(...args));
  switch (library.platform) {
    case 'vpl':
      // Record IDs here are reverified title/author identities, not catalog
      // record numbers: an own-record check is a title_author lookup.
      return { checkAvailability: () => visakhapatnam.checkPublicAvailability(), isbnLookup: false, recordLookupKind: 'title_author',
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
      return { checkAvailability: (isbn, title, author) => bibliocommons.checkPublicAvailability(library.slug, isbn, title, author), searchBookCandidates: query => bibliocommons.searchBookCandidates(library.slug, query),
        searchResultRows: query => bibliocommons.searchResultRows(library.slug, query), login: (card, pin) => bibliocommons.login(library.slug, card, pin) };
    case 'koha': {
      // Result marking (catalog-lookup) reads one keyword search page whose
      // rows may show ISBNs, or the RSS form for libraries that opt in. Rows
      // of an unscoped shared catalog do not prove this branch's holding.
      const markable = !library.publicCatalogApi && !(library.kohaSearchUnscoped && library.kohaBranchCode);
      // `resultMarking: false` stops result marking falling back to the
      // title search, which for these catalogs is not scoped to the branch.
      const marking = markable ? { searchResultRows: query => (library.kohaRssRows === true
        ? koha.searchRssRows(library, query) : koha.searchPublicCatalog(library, query)) } : { resultMarking: false };
      // The OPAC ISBN search covers both forms of an edition and answers up to
      // eight editions in one OR search (koha.checkPublicAvailabilityForIsbns).
      if (!library.publicCatalogCapabilities?.titleSearch) return { ...(library.publicCatalogApi ? {} : { searchCatalog: query => koha.searchCatalog(library, query), resolveCatalogRecord: id => koha.resolveCatalogRecord(library, id),
        checkIsbns: isbns => koha.checkPublicAvailabilityForIsbns(library, isbns), isbn10Lookup: false }), ...marking, checkAvailability: isbn => (library.publicCatalogApi === 'iith-opac-v1' ? iithKoha : koha).checkPublicAvailability(library, isbn) };
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
      // Vega's search finds an edition by either ISBN form (checked against
      // DC Public Library on 2026-11-12), so the ISBN-10 form is not asked.
      return { checkAvailability: (isbn) => vega.checkAvailability(library, isbn), isbn10Lookup: false };
    case 'aspen':
      return { checkAvailability: (isbn) => aspen.checkAvailability(library, isbn) };
    case 'calil':
      return { checkAvailability: (isbn) => calil.checkAvailability(library, isbn), checkMany: isbns => calil.checkMany(library, isbns) };
    case 'evergreen':
      return { checkAvailability: (isbn) => evergreen.checkAvailability(library, isbn) };
    case 'egranthalaya':
      // A work check is one member title search (its rows carry this member's
      // presence and often the ISBN), not one slow ISBN search per edition.
      return { checkAvailability: (isbn) => egranthalaya.checkAvailability(library, isbn), searchCatalog: query => egranthalaya.searchCatalog(library, query), resolveCatalogRecord: id => egranthalaya.resolveCatalogRecord(library, id),
        findBookCandidates: book => egranthalaya.searchBookCandidates(library, book), isbnLookup: false };
    case 'indcat':
      // One scoped search covers both ISBN forms and up to eight editions;
      // search rows show the record's own title (rowTitlesReliable).
      return { checkAvailability: isbn => indcat.checkAvailability(library, isbn), searchCatalog: query => indcat.searchCatalog(library, query), resolveCatalogRecord: id => indcat.resolveCatalogRecord(library, id),
        checkIsbns: isbns => indcat.checkAvailabilityForIsbns(library, isbns), isbn10Lookup: false, rowTitlesReliable: true };
    case 'libman':
    case 'vufind':
    case 'discovery-academic':
    case 'discovery-community': {
      const adapter = { libman, vufind, 'discovery-academic': discoveryAcademic, 'discovery-community': discoveryCommunity }[library.platform];
      return { checkAvailability: (isbn, title, author) => adapter.checkAvailability(library, isbn, title, author),
        searchCatalog: query => adapter.searchCatalog(library, query),
        resolveCatalogRecord: id => adapter.resolveCatalogRecord(library, id),
        // LIBMAN's one search already covers both ISBN forms.
        ...(library.platform === 'libman' ? { isbn10Lookup: false } : {}),
        ...(typeof adapter.isbnLookupSupported === 'function' && !adapter.isbnLookupSupported(library) ? { isbnLookup: false } : {}) };
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
  const routeForRecord = id => {
    const alternate = alternates.find(route => id.startsWith(route.prefix));
    if (id.startsWith('alt.') && !alternate) throw Object.assign(new Error('Unknown catalog route'), { code: 'CATALOG_UNRECOGNIZED' });
    return alternate || main;
  };
  const publicRoute = route => Object.freeze({ entry: route.entry, prefix: route.prefix,
    hasRecordAvailability: typeof route.provider?.checkRecordAvailability === 'function' });
  const inherited = { ...primary };
  for (const [method, value] of Object.entries(inherited)) {
    if (typeof value !== 'function') continue;
    inherited[method] = function (...args) {
      return executeRoute(main, method, () => value.apply(this, args));
    };
  }
  // A primary checker must not receive another route's prefixed identity.
  // Preserve absence of this method so existing lookupKind selection is stable.
  if (typeof primary?.checkRecordAvailability === 'function') {
    inherited.checkRecordAvailability = async id => {
      const route = routeForRecord(id), ownId = id.slice(route.prefix.length);
      if (route.provider?.checkRecordAvailability) {
        return executeRoute(route, 'checkRecordAvailability', () => route.provider.checkRecordAvailability(ownId));
      }
      if (!route.provider?.resolveCatalogRecord) throw Object.assign(new Error('Catalog record cannot be opened'), { code: 'CATALOG_UNSUPPORTED' });
      return (await executeRoute(route, 'resolveCatalogRecord', () => route.provider.resolveCatalogRecord(ownId)))?.observation;
    };
  }
  return {
    ...inherited,
    catalogRoutes: Object.freeze(routes.map(publicRoute)),
    catalogRouteForRecord: id => publicRoute(routeForRecord(id)),
    // Structured candidate search covers only the primary route.
    findBookCandidates: undefined,
    async searchCatalog(query) {
      let error;
      let completed = false;
      for (const route of routes) {
        if (!route.provider.searchCatalog) continue;
        try {
          const response = await executeRoute(route, 'searchCatalog', () => route.provider.searchCatalog(query));
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
      const route = routeForRecord(id);
      if (!route.provider?.resolveCatalogRecord) throw Object.assign(new Error('Catalog record cannot be opened'), { code: 'CATALOG_UNSUPPORTED' });
      const result = await executeRoute(route, 'resolveCatalogRecord', () => route.provider.resolveCatalogRecord(id.slice(route.prefix.length)));
      return result ? { ...result, recordId: id } : result;
    },
    async checkAvailability(...args) {
      let error, negative, uncertain, possible;
      for (const route of routes) {
        if (!route.provider.checkAvailability) continue;
        try {
          const result = await executeRoute(route, 'checkAvailability', () => route.provider.checkAvailability(...args));
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
