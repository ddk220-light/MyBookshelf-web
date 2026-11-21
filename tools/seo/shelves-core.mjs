// The pure parts of the library shelf checker (tools/seo/library-shelves.mjs):
// which libraries are candidates, which pool book a library is asked next,
// when a library is done, how a check's answer is recorded, the per-host
// pacing queue and the stable page slugs. No network, no files.

// The 80% title matcher and the any-field search are the app's own
// (server/services/libraryBookSearch.js); nothing here changes them.

export const SHELF_SIZE = 10;
// A library page is published with at least this many found books.
export const MIN_SHELF = 5;
// The four libraries the owner left out (21 November 2026): unfiltered
// shared catalogs or catalogs that cannot be checked.
export const EXCLUDED_IDS = Object.freeze([
  'discovery-academic:dlib-darshan',
  'koha:karnataka-samskrit-university',
  'koha:lbsnaa-gandhi-smriti',
  'koha:goa-dhe-cescaccs',
]);

export const today = (now = new Date()) => now.toISOString().slice(0, 10);

// A plain ASCII slug: lower case, hyphens, no leading or trailing hyphen.
export function slugify(value, max = 80) {
  return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, max).replace(/-+$/g, '');
}

const short = id => {
  let h = 2166136261;
  for (const c of String(id)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return h.toString(36).slice(0, 6);
};

// A new, unique slug from the given parts: the first part alone, then with
// the next parts, then with a short ID suffix. `taken` holds slugs in use.
export function uniqueSlug(parts, id, taken) {
  const words = parts.map(part => slugify(part)).filter(Boolean);
  for (let i = 1; i <= words.length; i += 1) {
    const slug = words.slice(0, i).join('-');
    if (slug && !taken.has(slug)) return slug;
  }
  const base = words[0] || 'item';
  let slug = `${base}-${short(id)}`;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${short(id)}-${n}`;
  return slug;
}

// Book slug: title plus the first author's surname (an ID suffix only on a clash).
export function bookSlug(book, taken) {
  const author = String(book.authors?.[0] || '').replace(/[.,]/g, ' ').trim().split(/\s+/).pop() || '';
  return uniqueSlug([[book.title, author].filter(Boolean).join(' ')], book.bookKey, taken);
}

// ---- Libraries -----------------------------------------------------------

// An academic library is asked a mix of academic and general books; any other
// library is asked the general books first. This only orders the questions.
const ACADEMIC = /universit|college|institut|\biit\b|\bnit\b|\biim\b|\biiit|\biiser|\baiims|school of|academy|vidyapith|polytechnic|medical|engineering|technolog|research|faculty|nursing|pharmac|law school|management/i;
export const libraryKind = name => ACADEMIC.test(String(name || '')) ? 'academic' : 'public';

// Names that are not enough for a public page on their own.
const GENERIC_NAME = /^\s*(?:the\s+)?(?:central|main|university|college|institute|general|reference|district|public)?\s*library\s*[.,]?\s*$/i;
const PART_OF_LIBRARY = /\bdepartment of\b|\buniversity department\b|\bdept\.?\b|\bschool of (?!management)|\bcentre for\b|\bcenter for\b|^cusat — (?!university library)/i;

/**
 * How well known a library is, from its directory name only (higher first).
 * State central and large public libraries, then national institutes, central
 * universities, universities, colleges; schools last. Parts of a library
 * (departments) and names that say nothing but "Central Library" are not
 * candidates (null).
 */
export function libraryScore(entry) {
  const name = String(entry?.name || '');
  if (!name || GENERIC_NAME.test(name) || PART_OF_LIBRARY.test(name)) return null;
  if (/vidyalaya|\bkv\b|\bschool\b(?! of)/i.test(name)) return 20;
  if (/state central|central state library|state library|centenary library|connemara|national library|city central|srs central|harekrushna mahtab|narmad central/i.test(name)) return 100;
  if (/\b(iit|iim|nit|iiit|iiser|aiims|niper|iisc)\b|indian institute of (technology|management|science)|national institute of technology|national law|tata institute/i.test(name)) return 90;
  if (/central university/i.test(name)) return 85;
  const academic = ACADEMIC.test(name);
  if (!academic && /public library|district library|municipal|pustakal|granthagar|granthalaya|research library/i.test(name)) return 85;
  if (/universit/i.test(name)) return 75;
  if (academic) return 50;
  if (/central library/i.test(name)) return 60;
  return 40;
}

// Default shares (about 150 candidates): spread across catalog systems and states.
export const PLATFORM_CAPS = Object.freeze({ egranthalaya: 45, indcat: 40, libman: 15, koha: 20, 'discovery-community': 15, 'discovery-academic': 14, vpl: 1 });
export const STATE_CAP = 12;
export const HOST_CAP = 4; // libraries on one small shared host (not the national shared catalogs)
const NATIONAL_HOSTS = new Set(['egranthalaya', 'indcat', 'libman']);

/**
 * The ranked candidate list. `entries` are directory rows; `listedIds` the
 * listed Indian IDs; `removed` the listed file's removed IDs; `answered` the
 * IDs that gave real answers in the phone test (always included first);
 * `hostOf(entry)` the catalog host. Deterministic: score, then ID.
 */
export function chooseCandidates(entries, { listedIds, removed = [], answered = [], hostOf = () => null, target = 150,
  platformCaps = PLATFORM_CAPS, stateCap = STATE_CAP, hostCap = HOST_CAP, excluded = EXCLUDED_IDS } = {}) {
  const listed = new Set(listedIds), out = new Set([...removed, ...excluded]), first = new Set(answered);
  const rows = [];
  for (const entry of entries) {
    if (entry?.country !== 'IN' || !listed.has(entry.id) || out.has(entry.id)) continue;
    if (!entry.publicCatalogCapabilities?.publicAvailability) continue;
    const score = libraryScore(entry);
    if (score === null || !entry.region) continue;
    rows.push({ entry, score: first.has(entry.id) ? 1000 + score : score });
  }
  rows.sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : 1));
  const platforms = {}, states = {}, hosts = {}, chosen = [];
  for (const { entry, score } of rows) {
    if (chosen.length >= target) break;
    const p = entry.platform, s = entry.region, h = NATIONAL_HOSTS.has(p) ? null : hostOf(entry);
    const forced = score >= 1000;
    if (!forced) {
      if ((platforms[p] || 0) >= (platformCaps[p] ?? 0)) continue;
      if ((states[s] || 0) >= stateCap) continue;
      if (h && (hosts[h] || 0) >= hostCap) continue;
    }
    platforms[p] = (platforms[p] || 0) + 1; states[s] = (states[s] || 0) + 1; if (h) hosts[h] = (hosts[h] || 0) + 1;
    chosen.push({ id: entry.id, name: entry.name, platform: p, state: s, city: entry.city || null, host: hostOf(entry), score: forced ? score - 1000 : score, phoneTested: forced, kind: libraryKind(entry.name) });
  }
  return chosen;
}

// ---- Which book to ask next ---------------------------------------------

// The fixed popularity order for a library: general books first for a public
// library; academic and general books alternating (academic first) for an
// academic one. `pool` is in popularity order within each shelf.
export function askOrder(pool, kind) {
  const general = pool.filter(book => book.shelf !== 'academic'), academic = pool.filter(book => book.shelf === 'academic');
  if (kind !== 'academic') return [...general, ...academic];
  const out = [];
  for (let i = 0; i < Math.max(general.length, academic.length); i += 1) {
    if (academic[i]) out.push(academic[i]);
    if (general[i]) out.push(general[i]);
  }
  return out;
}

const found = check => check?.outcome === 'found';
export const foundBooks = library => Object.entries(library?.checks || {}).filter(([, check]) => found(check)).map(([bookKey]) => bookKey);

/**
 * The next pool book to ask a library, or null when it is done (10 found, or
 * every book answered). Books already found at other libraries come first so
 * that book pages are shared; within each group the fixed order holds. A book
 * answered (found / not found) is not asked again unless its answer is older
 * than `refreshBefore`. A book that could not be checked is asked again only
 * on a later day than that failure (never twice in one day, never in a loop).
 */
export function nextBook(library, order, { foundElsewhere = new Map(), on, refreshBefore = null, skip = new Set() } = {}) {
  const checks = library?.checks || {};
  if (foundBooks(library).filter(key => !(refreshBefore && checks[key].on < refreshBefore)).length >= SHELF_SIZE) return null;
  const due = book => {
    if (skip.has(book.bookKey)) return false;
    const check = checks[book.bookKey];
    if (!check) return true;
    if (check.outcome === 'couldnt_check') return check.on < on;
    return Boolean(refreshBefore && check.on < refreshBefore);
  };
  const candidates = order.filter(due);
  // The preference stays within the kind of book the fixed order asks for
  // next, so a public library still hears general books first.
  const first = candidates[0];
  if (!first) return null;
  const kind = book => (book.shelf === 'academic' ? 'academic' : 'general');
  return candidates.find(book => kind(book) === kind(first) && (foundElsewhere.get(book.bookKey) || 0) > 0) || first;
}

/**
 * The record of one check, from the app's lookup answer. Only found and
 * not_found are answers; anything else is "couldn't check" with its reason,
 * and never replaces an earlier answer (a failed check is not absence).
 */
export function recordCheck(previous, answer, on) {
  if (answer?.outcome === 'found') {
    const first = answer.matches?.[0];
    const check = { outcome: 'found', on };
    if (first?.title) check.matchTitle = String(first.title).slice(0, 300);
    const link = answer.catalogLinkKind === 'record' && answer.catalogUrl ? answer.catalogUrl : first?.url || null;
    if (link && /^https?:\/\//.test(link)) check.catalogUrl = link;
    return check;
  }
  if (answer?.outcome === 'not_found') return { outcome: 'not_found', on };
  if (previous && previous.outcome !== 'couldnt_check') return { ...previous, lastFailure: { on, reason: answer?.reason || 'unknown' } };
  return { outcome: 'couldnt_check', on, reason: String(answer?.reason || answer?.errorCode || 'unknown').slice(0, 40) };
}

// A blocking sign from the catalog: robots refusal, access challenge or login.
export const isBlocking = answer => answer?.outcome === 'couldnt_check' && answer.reason === 'blocked';

/**
 * Per-host failure policy for one run: any blocking sign, or `limit`
 * couldn't-checks in a row, skips the host for the rest of the day. One
 * library failing `libraryLimit` times in a row is skipped for the day.
 */
export function createFailurePolicy({ limit = 4, libraryLimit = 3 } = {}) {
  const hostRun = new Map(), libraryRun = new Map(), skippedHosts = new Map(), skippedLibraries = new Map();
  return {
    note(host, libraryId, answer) {
      if (answer?.outcome === 'found' || answer?.outcome === 'not_found') { hostRun.set(host, 0); libraryRun.set(libraryId, 0); return null; }
      if (isBlocking(answer)) { skippedHosts.set(host, 'blocked'); return 'host'; }
      hostRun.set(host, (hostRun.get(host) || 0) + 1); libraryRun.set(libraryId, (libraryRun.get(libraryId) || 0) + 1);
      if (hostRun.get(host) >= limit) { skippedHosts.set(host, `${limit} failures in a row`); return 'host'; }
      if (libraryRun.get(libraryId) >= libraryLimit) { skippedLibraries.set(libraryId, `${libraryLimit} failures in a row`); return 'library'; }
      return null;
    },
    hostSkipped: host => skippedHosts.get(host) || null,
    librarySkipped: id => skippedLibraries.get(id) || null,
    skipHost: (host, reason) => skippedHosts.set(host, reason),
    skippedHosts: () => Object.fromEntries(skippedHosts),
  };
}

/**
 * One request at a time per host, with a fixed gap after each finishes;
 * different hosts run in parallel. `sleep` and `now` are injectable for tests.
 */
export function createHostQueue({ gapMs, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now() }) {
  const tails = new Map(), lastEnd = new Map();
  return {
    run(host, task) {
      const previous = tails.get(host) || Promise.resolve();
      const next = previous.catch(() => {}).then(async () => {
        const since = lastEnd.has(host) ? now() - lastEnd.get(host) : Infinity;
        if (since < gapMs) await sleep(gapMs - since);
        try { return await task(); } finally { lastEnd.set(host, now()); }
      });
      tails.set(host, next);
      return next;
    },
  };
}

// ---- Data file ------------------------------------------------------------

const sortKeys = value => Array.isArray(value) ? value.map(sortKeys)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;

// Deterministic JSON: sorted keys at every level, two-space indent, newline.
export function serializeShelves(data) {
  const { about, version, ...rest } = data;
  return JSON.stringify({ about, version, ...sortKeys(rest) }, null, 2) + '\n';
}

export const emptyShelves = () => ({
  about: 'Books found in Indian library catalogs, for the public library and book pages (tools/seo/build-pages.mjs). Generated by tools/seo/library-shelves.mjs with the app’s own library check (one any-field catalog search, the 80% title matcher); do not edit by hand. checks: the answer for each pool book asked (found / not_found / couldnt_check, a failed check is never "not found"), with the date. books: Open Library details of every found book.',
  version: 1, libraries: {}, books: {},
});

// How many libraries each book was found at.
export function foundCounts(data) {
  const counts = new Map();
  for (const library of Object.values(data.libraries || {})) for (const key of foundBooks(library)) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}

// The shelf of a library in pool order (at most 10), each with its check.
export function shelfOf(library, pool) {
  const checks = library?.checks || {};
  return pool.filter(book => found(checks[book.bookKey])).slice(0, SHELF_SIZE).map(book => ({ book, check: checks[book.bookKey] }));
}

// Description: at most `max` characters, ending at a sentence where possible.
export function shortDescription(text, max = 320) {
  const clean = String(text || '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…';
}
