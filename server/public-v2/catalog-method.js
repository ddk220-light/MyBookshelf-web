export function searchableCatalog(entry) {
  if (entry.publicCatalogSearch?.isbn || entry.publicCatalogSearch?.title) return true;
  if (entry.publicCatalogValidated || entry.publicCatalogDemo || ['bc', 'bibliocommons'].includes(entry.platform)) return true;
  // Published website-only catalogs are useful destinations, even without an inline adapter.
  return Boolean(entry.catalogUrl && ['catalog', 'koha', 'aspen', 'chamo'].includes(entry.platform));
}
