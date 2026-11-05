import { readFileSync } from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readChildrenManifest, validateChildrenManifest } from './children.js';
import { CONTENT_POLICY_REVISION, parseContentSearch, parseContentResolve, parseContentLocate, parseContentKey, readingActions, observedAccess, itemAccess, isReadableAccess } from './contracts.js';

function failure(code, message, status = 503) { return Object.assign(new Error(message), { code, status }); }
function folded(value) { return value.normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').replace(/[\u2018\u2019]/g, "'").toLocaleLowerCase(); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }

const wordCharacter = /[\p{L}\p{M}\p{N}]/u;
function termMatch(text, term) {
  let offset = text.indexOf(term);
  let prefix = false;
  while (offset !== -1) {
    const before = offset ? Array.from(text.slice(0, offset)).at(-1) : '';
    const after = Array.from(text.slice(offset + term.length))[0] || '';
    if (!wordCharacter.test(before)) {
      if (!wordCharacter.test(after)) return 2;
      // Short queries such as AI or art must not match unrelated words.
      if (Array.from(term).length >= 4) prefix = true;
    }
    offset = text.indexOf(term, offset + 1);
  }
  return prefix ? 1 : 0;
}
function rankedMatch(row, terms, phrase) {
  const fields = row.fields.map(field => ({...field, matches: terms.map(term => termMatch(field.text, term))}));
  if (!terms.length || terms.some((_, index) => !fields.some(field => field.matches[index]))) return null;
  const title = fields[0];
  const titleCount = title.matches.filter(Boolean).length;
  const candidates = fields.map(field => {
    const count = field.matches.filter(Boolean).length;
    if (!count) return {...field, score: 0};
    const all = count === terms.length, exactWords = field.matches.every(match => match === 2);
    let score;
    if (field.field === 'title') {
      score = field.text === phrase ? 10000 : all && exactWords && termMatch(field.text, phrase) === 2 ? 8000
        : all ? exactWords ? 6000 : 5000 : 3000 * count / terms.length;
      score += 100 * phrase.length / Math.max(phrase.length, field.text.length);
    } else if (field.field === 'contributor') score = all ? 4500 : 1500 * count / terms.length;
    else score = all ? field.text === phrase ? 2200 : 1800 : 1000 * count / terms.length;
    return {...field, score};
  }).sort((a,b) => b.score - a.score);
  const best = candidates[0];
  return {item: row.item, title: row.title, score: best.score + titleCount,
    searchMatch: {field: best.field, value: best.value}};
}

const LOCAL_SOURCES = { gutenberg: { name: 'Project Gutenberg', kind: 'book' },
  'open-textbook-library': { name: 'Open Textbook Library', kind: 'learning_resource' },
  bookdash: { name: 'Book Dash', kind: 'book' },
  storyweaver: { name: 'StoryWeaver reviewed starter set', kind: 'book' } };

export function readLocalSnapshots({includeChildren = process.env.CONTENT_CHILDREN_ENABLED === 'true', now = Date.now()} = {}) {
  const snapshots = ['gutenberg','open-textbook-library','bookdash'].map(sourceId => {
    try { return JSON.parse(readFileSync(new URL(`../../data/content/${sourceId}.json`, import.meta.url), 'utf8')); }
    catch { return { sourceId, unavailable: true }; }
  });
  if (includeChildren) {
    try {
      const records = validateChildrenManifest(readChildrenManifest(), {now});
      snapshots.push({schemaVersion:1,sourceId:'storyweaver',revision:hash(JSON.stringify(records)),
        importedAt:records.map(item=>item.provenance[0].retrievedAt).sort()[0],recordCount:records.length,complete:false,records});
    } catch { snapshots.push({sourceId:'storyweaver',unavailable:true}); }
  }
  return snapshots;
}

export function createLocalContentService({ loadSnapshot = readLocalSnapshots,
  enabled = process.env.CONTENT_DISCOVERY_ENABLED === 'true', cursorSecret = process.env.CONTENT_CURSOR_SECRET,
  now = () => Date.now() } = {}) {
  let catalog;
  let indexed;
  let byKey;
  function ensure() {
    if (!enabled) throw failure('CONTENT_DISABLED', 'Free-content discovery is not connected yet.');
    if (typeof cursorSecret !== 'string' || cursorSecret.length < 32) throw failure('CONTENT_UNAVAILABLE', 'Free-content discovery is temporarily unavailable.');
    if (catalog) return;
    const loaded = loadSnapshot();
    const snapshots = Array.isArray(loaded) ? loaded : [loaded];
    const valid = [], unavailable = new Set();
    for (const data of snapshots) {
      const source = LOCAL_SOURCES[data?.sourceId];
      if (!source || valid.some(s => s.sourceId === data.sourceId)) throw failure('CONTENT_UNAVAILABLE', 'The free-book catalog is temporarily unavailable.');
      if (data.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(data.revision)
        || !Number.isFinite(Date.parse(data.importedAt)) || !Array.isArray(data.records)
        || data.records.length !== data.recordCount || !data.recordCount || data.recordCount > 10000
        || new Set(data.records.map(item => item?.key)).size !== data.recordCount
        || data.records.some(item => parseContentKey(item?.key)?.sourceId !== data.sourceId || item.kind !== source.kind
          || typeof item.title !== 'string' || !Array.isArray(item.contributors) || !Array.isArray(item.languages)
          || !Array.isArray(item.subjects) || !Array.isArray(item.identifiers) || !Array.isArray(item.locations))) {
        unavailable.add(data.sourceId); continue;
      }
      valid.push(data);
    }
    const records = valid.flatMap(data => data.records);
    byKey = new Map(records.map(item => [item.key, item]));
    indexed = records.map(item => ({ item, title: folded(item.title), fields: [
      {field:'title', value:item.title},
      ...item.contributors.map(c => ({field:'contributor',value:c.name})),
      ...item.subjects.map(value => ({field:'subject',value})),
    ].filter(field => typeof field.value === 'string').map(field => ({...field,text:folded(field.value)})) }));
    // Invalidate old offsets when the ordering algorithm changes.
    catalog = { snapshots: valid, unavailable, revision: hash(JSON.stringify(['title-relevance-v2',valid.map(s => [s.sourceId, s.revision])])) };
  }
  function present(item, context) {
    return { ...item, readingActions: readingActions(item, { ...context, now: now() }),
      access: itemAccess(item, { ...context, now: now() }) };
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
        || !Number.isInteger(state.offset) || state.offset < 0 || state.offset > 20000) throw new Error();
      return state;
    } catch { throw failure('CONTENT_CURSOR_EXPIRED', 'This search has expired or changed. Search again to continue.', 409); }
  }
  return {
    search(input) {
      const query = parseContentSearch(input);
      ensure();
      const binding = hash(JSON.stringify({ ...query, cursor: null, policy: CONTENT_POLICY_REVISION }));
      const state = cursorState(query.cursor, binding);
      const chosen = Object.entries(LOCAL_SOURCES).filter(([id,source]) => query.kinds.includes(source.kind)&&(!query.sourceIds||query.sourceIds.includes(id))).map(([id]) => id);
      if (!chosen.length) throw failure('CONTENT_UNAVAILABLE', 'Paper search is not connected yet. Please try the free-book catalog.');
      if (!catalog.snapshots.some(source => chosen.includes(source.sourceId))) throw failure('CONTENT_UNAVAILABLE', 'The selected free-book catalogs are temporarily unavailable.');
      const phrase = folded(query.query).trim().replace(/\s+/g, ' ');
      const terms = [...new Set(phrase.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+|[+#]+)*/gu) || [])];
      const matching = indexed.filter(row => query.kinds.includes(row.item.kind)&&chosen.includes(parseContentKey(row.item.key).sourceId)
        && (!query.languages.length || row.item.languages.some(l => query.languages.includes(l))))
        .map(row => rankedMatch(row, terms, phrase)).filter(Boolean)
        .sort((a,b) => b.score - a.score || a.title.localeCompare(b.title) || a.item.key.localeCompare(b.item.key));
      let hiddenUnclear = 0;
      const eligible = [];
      for (const { item, searchMatch } of matching) {
        const value = {...present(item, query),searchMatch};
        if (isReadableAccess(value.access) && (query.access !== 'free_full_text' || value.access === 'free_full_text')) eligible.push(value);
        else if (item.locations.some(l => ['unknown', 'metadata_only'].includes(observedAccess(l, { ...query, now: now() })))) {
          hiddenUnclear++;
          if (query.includeUnclear) eligible.push(value);
        }
      }
      const items = eligible.slice(state.offset, state.offset + query.limit);
      let nextCursor = null;
      if (state.offset + items.length < eligible.length) {
        const payload = Buffer.from(JSON.stringify({ binding, revision: catalog.revision, expires: state.expires, offset: state.offset + items.length })).toString('base64url');
        nextCursor = payload + '.' + signature(payload);
      }
      return { items, nextCursor, hiddenUnclear, coverage: 'partial', policyRevision: CONTENT_POLICY_REVISION,
        sources: [...Object.entries(LOCAL_SOURCES).map(([id,source]) => {
          const snapshot = catalog.snapshots.find(s => s.sourceId === id);
          return { id, name:source.name, status:!chosen.includes(id)?'not_selected':catalog.unavailable.has(id)?'unavailable':snapshot?'ok':'disabled',
            returned:items.filter(item => parseContentKey(item.key).sourceId === id).length,
            ...(snapshot && chosen.includes(id) ? {catalogRecords:snapshot.recordCount,complete:snapshot.complete,importedAt:snapshot.importedAt,
              freshness:now()-Date.parse(snapshot.importedAt)<=86400_000?'fresh':'stale'} : {}) };
        }), ...['europepmc','doaj','arxiv','openalex'].map(id => ({id,status:'disabled',returned:0}))] };
    },
    resolve(input) {
      const request = parseContentResolve(input);
      ensure();
      const item = byKey.get(request.key);
      if (!item) throw failure('CONTENT_NOT_FOUND', 'This item is not in the current free-book catalog.', 404);
      return { item: present(item, request), policyRevision:CONTENT_POLICY_REVISION };
    },
    locate(input) {
      const request=parseContentLocate(input);ensure();
      const items=[];
      for(const {item} of indexed){
        const match=request.identifiers.find(wanted=>item.identifiers.some(identity=>identity.scheme===wanted.scheme&&identity.value===wanted.value));
        if(!match||!['book','learning_resource'].includes(item.kind))continue;
        const value=present(item,request);
        if(isReadableAccess(value.access))items.push({...value,match});
        if(items.length===3)break;
      }
      return {items,policyRevision:CONTENT_POLICY_REVISION};
    },
  };
}
