// Search text belongs to this tab's memory. Addresses and navigation state
// carry an opaque reference so Back and source changes can reuse a search.
const queries = new Map<string, string>();
const MAX_QUERIES = 64;

export function readContentSearch(params: URLSearchParams): string {
  return queries.get(params.get('search') || '') ?? params.get('q')?.trim().slice(0, 300) ?? '';
}

export function contentSearchAddress(
  filters: Record<string, string> | URLSearchParams,
  query: string,
): string {
  const params = new URLSearchParams(filters);
  params.delete('q');
  params.delete('search');
  const text = query.trim().slice(0, 300);
  if (text) {
    const existing = [...queries].find(([, value]) => value === text)?.[0];
    const id = existing ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(36)).join('-');
    if (!existing) {
      queries.set(id, text);
      if (queries.size > MAX_QUERIES) queries.delete(queries.keys().next().value!);
    }
    params.set('search', id);
  }
  const search = params.toString();
  return search ? '/app/search?' + search : '/app/search';
}
