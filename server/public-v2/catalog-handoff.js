import { academicCatalogHandoff } from '../services/providers/discoveryAcademic.js';

function trustedCatalogUrl(entry, library) {
  const value = entry?.catalogUrl || library?.catalogUrl;
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function catalogQuery(book) {
  if (typeof book?.isbn13 === 'string' && /^\d{13}$/.test(book.isbn13)) return book.isbn13;
  const values = [book?.title, ...(Array.isArray(book?.authors) ? book.authors : [])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
  const query = values.join(' ').replace(/\s+/g, ' ').trim();
  return query ? query.slice(0, 500) : null;
}

function searchUrl(platform, catalogUrl, query, hasIsbn, entry) {
  let url;
  switch (platform) {
    case 'bc':
    case 'bibliocommons':
      url = new URL('/search', catalogUrl);
      url.searchParams.set('query', query);
      url.searchParams.set('searchType', 'keyword');
      return url;
    case 'aspen':
      url = new URL('/Search/Results', catalogUrl);
      url.searchParams.set('lookfor', query);
      url.searchParams.set('searchIndex', hasIsbn ? 'ISBN' : 'AllFields');
      return url;
    case 'vufind':
      url = new URL(`${entry.baseUrl.replace(/\/$/, '')}/Search/Results`);
      url.searchParams.set('lookfor', query);
      url.searchParams.set('type', hasIsbn ? 'ISN' : 'Title');
      if (entry.vufindInstitution) url.searchParams.append('filter[]', `institution:"${entry.vufindInstitution}"`);
      if (entry.vufindBuilding) url.searchParams.append('filter[]', `building:"${entry.vufindBuilding}"`);
      return url;
    case 'koha':
      url = new URL('/cgi-bin/koha/opac-search.pl', catalogUrl);
      url.searchParams.set('idx', hasIsbn ? 'nb' : 'kw');
      url.searchParams.set('q', query);
      for (const key of entry.kohaSearchUnscoped ? [] : ['limit', 'branch_group_limit']) {
        const scope = catalogUrl.searchParams.get(key);
        if (scope?.startsWith('branch:')) url.searchParams.set(key, scope);
      }
      if (entry.kohaBranchCode && !entry.kohaSearchUnscoped) {
        url.searchParams.set(entry.kohaLegacyHoldings ? 'branch_group_limit' : 'limit', `branch:${entry.kohaBranchCode}`);
      }
      return url;
    case 'chamo':
      if (!hasIsbn) return null;
      url = new URL('/search/query', catalogUrl);
      url.searchParams.set('term_1', query);
      url.searchParams.set('field_1', 'isbn');
      url.searchParams.set('match_1', 'MUST');
      return url;
    default:
      return null;
  }
}

// This builds a browser handoff from a trusted directory entry and a canonical
// book DTO. It never accepts a URL or a query from the browser request.
// Browser links do not grant provider access. Anonymous HTTP reads require a
// separately reviewed library/origin pair in the provider policy.
export function catalogHandoffFor({ entry, library, book } = {}) {
  entry = entry?.alternateCatalogs?.find(route => route.preferForLookup) || entry;
  const catalogUrl = trustedCatalogUrl(entry, library);
  if (!catalogUrl) return null;
  if (entry?.platform === 'discovery-academic') return academicCatalogHandoff(entry, book);
  if (entry?.platform === 'egranthalaya' && catalogUrl.origin === 'https://eg4.nic.in'
      && /^[A-Za-z0-9_]{1,48}$/.test(entry.egranthalayaCluster || '')
      && /^[A-Z0-9_]{1,32}$/.test(entry.egranthalayaLibraryCode || '')) {
    const member = new URL('/OPAC/Default.aspx', catalogUrl);
    member.searchParams.set('CL_NAME', entry.egranthalayaCluster);
    member.searchParams.set('LIB_CODE', entry.egranthalayaLibraryCode);
    return { catalogUrl: member.toString(), catalogLinkKind: 'catalog' };
  }
  const query = catalogQuery(book);
  const search = query && entry?.publicCatalogApi !== 'iith-opac-v1'
    && searchUrl(entry?.platform, catalogUrl, query, Boolean(book?.isbn13), entry);
  return {
    catalogUrl: (search || catalogUrl).toString(),
    catalogLinkKind: search ? 'search' : 'catalog',
  };
}
