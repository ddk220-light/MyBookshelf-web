// Groups library requests so the same town or library typed differently sits
// together in the admin view (plan section 6). Requests are already merged by
// their normalised key (case, punctuation and spacing); this goes one step
// further for display only: two requests share a group when they share a
// distinctive word, allowing one typing slip in longer words ("Pune",
// "puna"; "Thiruvananthapuram", "Thiruvanathapuram"). Nothing is merged in the
// database: each request keeps its own row, count, status and note.

// Words that say "library" or describe one rather than name a place or library.
const GENERIC = new Set([
  'the', 'of', 'and', 'in', 'at', 'near', 'for', 'a', 'an', 'my', 'our', 'to',
  'library', 'libraries', 'libary', 'librery', 'lib', 'public', 'central', 'city', 'district', 'state', 'county',
  'municipal', 'corporation', 'branch', 'main', 'regional', 'national', 'government', 'govt', 'college', 'university',
  'school', 'institute', 'reading', 'room', 'books', 'book', 'please', 'add', 'request',
  'bibliothek', 'biblioteca', 'bibliotheque',
  'granthalaya', 'grantha', 'pustakalaya', 'nulagam', 'grandhalayam',
]);

const words = key => String(key || '').split(' ').filter(word => [...word].length >= 3 && !GENERIC.has(word));

// True when two words are equal, or both have 5+ characters and differ by one
// insertion, deletion or substitution.
export function similarWords(a, b) {
  if (a === b) return true;
  const x = [...a], y = [...b];
  if (x.length < 5 || y.length < 5 || Math.abs(x.length - y.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (x.length > y.length) i += 1;
    else if (y.length > x.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

// `requests`: [{ requestKey, displayText, requestCount, lastRequestedOn, ... }].
// Returns groups sorted by total count, each with its requests sorted by count:
// [{ label, words, totalCount, lastRequestedOn, requests }].
export function groupLibraryRequests(requests) {
  const items = requests.map(request => ({ request, words: words(request.requestKey) }));
  const parent = items.map((_, index) => index);
  const find = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  for (let a = 0; a < items.length; a += 1) {
    for (let b = a + 1; b < items.length; b += 1) {
      if (find(a) === find(b)) continue;
      if (items[a].words.some(x => items[b].words.some(y => similarWords(x, y)))) parent[find(b)] = find(a);
    }
  }
  const groups = new Map();
  items.forEach((item, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  });
  const latest = (a, b) => (String(a || '') > String(b || '') ? a : b);
  return [...groups.values()].map(members => {
    const sorted = members.map(member => member.request)
      .sort((a, b) => b.requestCount - a.requestCount || String(b.lastRequestedOn).localeCompare(String(a.lastRequestedOn)) || a.requestKey.localeCompare(b.requestKey));
    const shared = members.length > 1
      ? [...new Set(members.flatMap(member => member.words))].filter(word => members.filter(member => member.words.some(other => similarWords(word, other))).length > 1)
      : [];
    return {
      label: sorted[0].displayText,
      words: shared.slice(0, 5),
      totalCount: sorted.reduce((sum, request) => sum + request.requestCount, 0),
      lastRequestedOn: sorted.reduce((value, request) => latest(value, request.lastRequestedOn), null),
      requests: sorted,
    };
  }).sort((a, b) => b.totalCount - a.totalCount || String(b.lastRequestedOn).localeCompare(String(a.lastRequestedOn)) || a.label.localeCompare(b.label));
}
