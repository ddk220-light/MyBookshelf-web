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

// An ISBN check's observation as the rows of an ISBN search, for a library
// check (libraryBookSearch.js): one row when this library holds a record for
// the ISBN, none when the catalog recognizably lists none, otherwise a failure.
function isbnRows(check) {
  return async isbn => {
    const value = await check(isbn, '', '');
    const held = ['available', 'none_available', 'in_catalog'].includes(value?.outcome) ? value
      : ['available', 'checked_out', 'waitlist'].includes(value?.status)
        ? { outcome: value.status === 'available' ? 'available' : 'none_available', catalogUrl: value.url, catalogLinkKind: value.catalogLinkKind } : null;
    if (held) return [{ title: value.catalogTitle || '', authors: [], catalogUrl: held.catalogUrl, catalogLinkKind: held.catalogLinkKind, observation: held }];
    if (value?.outcome === 'not_found' && value.recognizedExact) return [];
    throw Object.assign(new Error('The catalog did not show whether it holds this ISBN'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  };
}

// Each catalog's methods. A library check uses only `searchTitle(title)`,
// `searchIsbn(isbn)` and, where search rows do not show this library's
// holding, `readRecord(recordId)`: one catalog request each.
function primaryProvider(library) {
  if (!library || !Array.isArray(library.capabilities) || !library.capabilities.includes('availability')) return null;
  const normalize = (check) => async (...args) => normalizeAvailability(await check(...args));
  const withIsbnRows = provider => ({ ...provider, searchIsbn: isbnRows(provider.checkAvailability) });
  switch (library.platform) {
    case 'vpl':
      // Record IDs here are reverified title/author identities, not catalog
      // record numbers: an own-record check is a title_author lookup. The
      // catalog has no ISBN field.
      return { checkAvailability: () => visakhapatnam.checkPublicAvailability(), recordLookupKind: 'title_author',
        searchTitle: title => visakhapatnam.searchBookCandidates(library, { title }),
        searchCatalog: query => visakhapatnam.searchPublicCatalog(library, query),
        resolveCatalogRecord: async recordId => ({ ...await visakhapatnam.resolvePublicCatalogRecord(library, recordId), observation: await visakhapatnam.checkPublicRecordAvailability(library, recordId) }),
        checkRecordAvailability: recordId => visakhapatnam.checkPublicRecordAvailability(library, recordId) };
    case 'bc':
    case 'bibliocommons':
      // The public v2 service needs the native-equivalent BiblioCommons
      // observation, including match confidence and provider failures. Legacy
      // routes are retired; their compatibility function remains exported by
      // the adapter for source-level consumers. A bare ISBN is a keyword
      // search (one request) whose print rows show their ISBNs.
      return { checkAvailability: (isbn, title, author) => bibliocommons.checkPublicAvailability(library.slug, isbn, title, author),
        searchTitle: title => bibliocommons.searchBookCandidates(library.slug, title), searchIsbn: isbn => bibliocommons.searchResultRows(library.slug, isbn),
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
      // The IIT Hyderabad API answers by ISBN only.
      if (library.publicCatalogApi === 'iith-opac-v1') return withIsbnRows({ ...marking, checkAvailability: isbn => iithKoha.checkPublicAvailability(library, isbn) });
      return { ...marking, checkAvailability: isbn => koha.checkPublicAvailability(library, isbn),
        searchTitle: title => koha.searchTitle(library, title), searchIsbn: isbn => koha.searchIsbn(library, isbn), readRecord: id => koha.readRecord(library, id),
        ...(library.publicCatalogCapabilities?.titleSearch ? {
          searchCatalog: (query, options) => koha.searchPublicCatalog(library, query, options),
          resolveCatalogRecord: (recordId) => koha.resolvePublicCatalogRecord(library, recordId),
          checkRecordAvailability: (recordId) => koha.checkPublicRecordAvailability(library, recordId),
        } : { searchCatalog: query => koha.searchCatalog(library, query), resolveCatalogRecord: id => koha.resolveCatalogRecord(library, id) }) };
    }
    case 'chamo':
      return withIsbnRows({ checkAvailability: (isbn) => chamo.checkPublicAvailability(library, isbn) });
    case 'libsys':
      return withIsbnRows({ checkAvailability: normalize((isbn) => libsys.checkAvailability(library, isbn)) });
    case 'vega':
      return withIsbnRows({ checkAvailability: (isbn) => vega.checkAvailability(library, isbn) });
    case 'aspen':
      return withIsbnRows({ checkAvailability: (isbn) => aspen.checkAvailability(library, isbn) });
    case 'calil':
      return withIsbnRows({ checkAvailability: (isbn) => calil.checkAvailability(library, isbn), checkMany: isbns => calil.checkMany(library, isbns) });
    case 'evergreen':
      return withIsbnRows({ checkAvailability: (isbn) => evergreen.checkAvailability(library, isbn) });
    case 'egranthalaya':
      return { checkAvailability: (isbn) => egranthalaya.checkAvailability(library, isbn), searchCatalog: query => egranthalaya.searchCatalog(library, query), resolveCatalogRecord: id => egranthalaya.resolveCatalogRecord(library, id),
        searchTitle: title => egranthalaya.searchTitle(library, title), searchIsbn: isbn => egranthalaya.searchIsbn(library, isbn) };
    case 'indcat':
      return { checkAvailability: isbn => indcat.checkAvailability(library, isbn), searchCatalog: query => indcat.searchCatalog(library, query), resolveCatalogRecord: id => indcat.resolveCatalogRecord(library, id),
        searchTitle: title => indcat.searchTitle(library, title), searchIsbn: isbn => indcat.searchIsbn(library, isbn), readRecord: id => indcat.readRecord(library, id) };
    case 'libman':
      return { checkAvailability: (isbn, title, author) => libman.checkAvailability(library, isbn, title, author),
        searchCatalog: query => libman.searchCatalog(library, query), resolveCatalogRecord: id => libman.resolveCatalogRecord(library, id),
        searchTitle: title => libman.searchTitle(library, title), searchIsbn: isbn => libman.searchIsbn(library, isbn) };
    case 'vufind':
      return { checkAvailability: (isbn, title, author) => vufind.checkAvailability(library, isbn, title, author),
        searchCatalog: query => vufind.searchCatalog(library, query), resolveCatalogRecord: id => vufind.resolveCatalogRecord(library, id),
        searchTitle: title => vufind.searchCatalog(library, title), searchIsbn: isbn => vufind.searchIsbn(library, isbn) };
    case 'discovery-academic':
      return { checkAvailability: (isbn, title, author) => discoveryAcademic.checkAvailability(library, isbn, title, author),
        searchCatalog: query => discoveryAcademic.searchCatalog(library, query), resolveCatalogRecord: id => discoveryAcademic.resolveCatalogRecord(library, id),
        searchTitle: title => discoveryAcademic.searchCatalog(library, title),
        ...(discoveryAcademic.isbnLookupSupported(library) ? { searchIsbn: isbn => discoveryAcademic.searchIsbn(library, isbn) } : {}) };
    case 'discovery-community':
      return { checkAvailability: (isbn, title, author) => discoveryCommunity.checkAvailability(library, isbn, title, author),
        searchCatalog: query => discoveryCommunity.searchCatalog(library, query), resolveCatalogRecord: id => discoveryCommunity.resolveCatalogRecord(library, id),
        searchTitle: title => discoveryCommunity.searchTitle(library, title), readRecord: id => discoveryCommunity.readRecord(library, id) };
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
  // A search asks each route in order until one lists rows; an empty later
  // route never hides a failed earlier one. Row record IDs carry the route.
  const searchRoutes = method => async (...args) => {
    let error;
    let completed = false;
    for (const route of routes) {
      if (!route.provider[method]) continue;
      try {
        const response = await executeRoute(route, method, () => route.provider[method](...args));
        const records = Array.isArray(response) ? response : response?.records;
        if (!Array.isArray(records)) throw new Error('Invalid catalog response');
        completed = true;
        if (records.length) return records.map(record => ({ ...record, ...(record.recordId ? { recordId: route.prefix + record.recordId } : {}) }));
      } catch (failure) { error = failure; }
    }
    if (error) throw error;
    if (completed) return [];
    throw Object.assign(new Error('Catalog search is unavailable'), { code: 'CATALOG_UNSUPPORTED' });
  };
  const anyRoute = method => routes.some(route => typeof route.provider[method] === 'function');
  return {
    ...inherited,
    catalogRoutes: Object.freeze(routes.map(publicRoute)),
    catalogRouteForRecord: id => publicRoute(routeForRecord(id)),
    searchCatalog: searchRoutes('searchCatalog'),
    ...(anyRoute('searchTitle') ? { searchTitle: searchRoutes('searchTitle') } : {}),
    ...(anyRoute('searchIsbn') ? { searchIsbn: searchRoutes('searchIsbn') } : {}),
    ...(anyRoute('readRecord') ? { async readRecord(id) {
      const route = routeForRecord(id);
      if (!route.provider?.readRecord) throw Object.assign(new Error('Catalog record cannot be opened'), { code: 'CATALOG_UNSUPPORTED' });
      const result = await executeRoute(route, 'readRecord', () => route.provider.readRecord(id.slice(route.prefix.length)));
      return result ? { ...result, recordId: id } : result;
    } } : {}),
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
