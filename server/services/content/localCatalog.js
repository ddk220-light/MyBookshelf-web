import { readFileSync } from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CONTENT_POLICY_REVISION, parseContentSearch, parseContentResolve, readingActions, observedAccess } from './contracts.js';

function failure(code, message, status = 503) { return Object.assign(new Error(message), { code, status }); }
function folded(value) { return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export function readGutenbergSnapshot() {
  return JSON.parse(readFileSync(new URL('../../data/content/gutenberg.json', import.meta.url), 'utf8'));
}

export function createLocalContentService({ loadSnapshot = readGutenbergSnapshot,
  enabled = process.env.CONTENT_DISCOVERY_ENABLED === 'true', cursorSecret = process.env.CONTENT_CURSOR_SECRET,
  now = () => Date.now() } = {}) {
  let catalog;
  let indexed;
  let byKey;
  function ensure() {
    if (!enabled) throw failure('CONTENT_DISABLED', 'Free-content discovery is not connected yet.');
    if (typeof cursorSecret !== 'string' || cursorSecret.length < 32) throw failure('CONTENT_UNAVAILABLE', 'Free-content discovery is temporarily unavailable.');
    if (catalog) return;
    const data = loadSnapshot();
    if (data.schemaVersion !== 1 || data.sourceId !== 'gutenberg' || !/^[a-f0-9]{64}$/.test(data.revision)
      || !Array.isArray(data.records) || data.records.length !== data.recordCount || !data.recordCount || data.recordCount > 10000) throw failure('CONTENT_UNAVAILABLE', 'The free-book catalog is temporarily unavailable.');
    byKey = new Map(data.records.map(item => [item.key, item]));
    if (byKey.size !== data.recordCount) throw failure('CONTENT_UNAVAILABLE', 'The free-book catalog is temporarily unavailable.');
    indexed = data.records.map(item => ({ item, title: folded(item.title),
      text: folded([item.title, ...item.contributors.map(c => c.name), ...item.subjects].join(' ')) }));
    catalog = data;
  }
  function present(item, context) {
    return { ...item, readingActions: readingActions(item, { ...context, now: now() }),
      access: item.locations.some(l => observedAccess(l, { ...context, now: now() }) === 'free_full_text') ? 'free_full_text' : 'unknown' };
  }
  function signature(value) { return createHmac('sha256', cursorSecret).update(value).digest('base64url'); }
  function cursorState(cursor, binding) {
    if (!cursor) return { offset: 0, expires: now() + 900_000 };
    const [payload, mac, extra] = cursor.split('.');
    if (extra || !payload || !/^[A-Za-z0-9_-]{43}$/.test(mac || '')) throw failure('CONTENT_CURSOR_INVALID', 'Start this search again.', 409);
    const expected = signature(payload);
    if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw failure('CONTENT_CURSOR_INVALID', 'Start this search again.', 409);
    try {
      const state = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (state.binding !== binding || state.revision !== catalog.revision || state.expires <= now()
        || !Number.isInteger(state.offset) || state.offset < 0 || state.offset > 10000) throw new Error();
      return state;
    } catch { throw failure('CONTENT_CURSOR_EXPIRED', 'This search has expired or changed. Search again to continue.', 409); }
  }
  return {
    search(input) {
      const query = parseContentSearch(input);
      ensure();
      const binding = hash(JSON.stringify({ ...query, cursor: null, policy: CONTENT_POLICY_REVISION }));
      const state = cursorState(query.cursor, binding);
      const chosen = query.kinds.includes('book');
      const terms = folded(query.query).split(/\s+/);
      const matching = chosen ? indexed.filter(row => terms.every(term => row.text.includes(term))
        && (!query.languages.length || row.item.languages.some(l => query.languages.includes(l))))
        .sort((a,b) => Number(b.title === folded(query.query)) - Number(a.title === folded(query.query)) || a.title.localeCompare(b.title) || a.item.key.localeCompare(b.item.key)) : [];
      let hiddenUnclear = 0;
      const eligible = [];
      for (const { item } of matching) {
        const value = present(item, query);
        if (value.access === 'free_full_text') eligible.push(value);
        else if (item.locations.some(l => ['unknown', 'metadata_only'].includes(observedAccess(l, { ...query, now: now() })))) {
          hiddenUnclear++;
          if (query.includeUnclear) eligible.push(value);
        }
      }
      if (!chosen) throw failure('CONTENT_UNAVAILABLE', 'Paper search is not connected yet. Please try the free-book catalog.');
      const items = eligible.slice(state.offset, state.offset + query.limit);
      let nextCursor = null;
      if (state.offset + items.length < eligible.length) {
        const payload = Buffer.from(JSON.stringify({ binding, revision: catalog.revision, expires: state.expires, offset: state.offset + items.length })).toString('base64url');
        nextCursor = payload + '.' + signature(payload);
      }
      return { items, nextCursor, hiddenUnclear, coverage: 'partial', policyRevision: CONTENT_POLICY_REVISION,
        sources: [{ id:'gutenberg',name:'Project Gutenberg',status:'ok',returned:items.length,
          catalogRecords:catalog.recordCount,complete:catalog.complete,importedAt:catalog.importedAt,
          freshness:now() - Date.parse(catalog.importedAt) <= 86400_000 ? 'fresh' : 'stale' },
          ...['open-textbook-library','europepmc','doaj','arxiv','openalex'].map(id => ({id,status:'disabled',returned:0}))] };
    },
    resolve(input) {
      const request = parseContentResolve(input);
      ensure();
      const item = byKey.get(request.key);
      if (!item) throw failure('CONTENT_NOT_FOUND', 'This item is not in the current free-book catalog.', 404);
      return { item: present(item, request), policyRevision:CONTENT_POLICY_REVISION };
    },
  };
}
