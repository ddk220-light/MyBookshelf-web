import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CATALOG_LINK_PREFIX, LOG_PREFIX, MEMBER_LIST_PREFIX, catalogLinkItems, catalogLinkPart, catalogLinkResults, frontPageHosts, frontPageResult,
  frontPageResults, memberListItems, memberListPart, memberListResults } from '../../server/catalog-store/frontPageCheck.js';

// Merges the front-page check's log lines into server/data/front-page-results.json
// (server/catalog-store/frontPageCheck.js). The production job writes one
// stderr line per host, `front-page-check {json}`; paste the lines from the
// runtime logs into a file, or pipe them in:
//
//   node tools/deployment/front-page-results.mjs saved-lines.txt
//   pbpaste | node tools/deployment/front-page-results.mjs
//   node tools/deployment/front-page-results.mjs --dry-run saved-lines.txt
//
// Lines may carry a timestamp or other text before the prefix, or be a JSON
// log export where the line is an escaped string. A host keeps the result it
// already has ("record it once"); a host seen twice in the input keeps its
// earliest result; hosts not in front-page-hosts.json are skipped. Then
// review the change and commit it: the deployed job skips every host with a
// result, and once all have one it does nothing.
//
// The same input may hold the member-list and catalog-link lines
// (`front-page-member-list {json}`, `front-page-catalog-link {json}`), one or
// more parts per read: a read is merged once all its parts are in, keyed by
// the item (memberLists id, catalogLinks libraryId) as "record it once".
// Then tools/directory/front-page-proposals.mjs turns them into proposed
// listing changes.

const RESULTS_FILE = fileURLToPath(new URL('../../server/data/front-page-results.json', import.meta.url));
const KINDS = [
  { prefix: LOG_PREFIX, read: frontPageResult, into: 'results' },
  { prefix: MEMBER_LIST_PREFIX, read: memberListPart, into: 'memberParts' },
  { prefix: CATALOG_LINK_PREFIX, read: catalogLinkPart, into: 'linkParts' },
];

// The JSON object starting at `start`, its strings read as strings (a page's
// text may hold braces), or null.
function objectAt(text, start) {
  let depth = 0, inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === '\\') index += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

// An escaped line inside a JSON export ({\"host\":\"a.org\",...}): its braces,
// counted without reading strings (the wall results hold no braces).
function escapedObjectAt(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

function parseObject(segment) {
  try { return JSON.parse(segment); } catch { /* maybe escaped */ }
  try { return JSON.parse(JSON.parse(`"${segment}"`)); } catch { return null; }
}

// The texts of one input line: the line itself, and, when it is a JSON log
// export, every string in it (the message holds the logged line).
function textsOf(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const strings = [];
      const walk = value => {
        if (typeof value === 'string') strings.push(value);
        else if (value && typeof value === 'object') for (const item of Object.values(value)) walk(item);
      };
      walk(JSON.parse(trimmed));
      if (strings.some(value => KINDS.some(kind => value.includes(`${kind.prefix} {`)))) return { texts: strings, escaped: false };
    } catch { /* not a JSON export line */ }
  }
  return { texts: [line], escaped: true };
}

/**
 * The results in saved log text, in order, and how many marked lines were not
 * understood: `results` (front-page wall checks), `memberParts` and
 * `linkParts` (the parts of member-list and catalog-link reads).
 */
export function parseLogLines(text) {
  const found = { results: [], memberParts: [], linkParts: [] };
  let rejected = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    const { texts, escaped } = textsOf(line);
    for (const value of texts) {
      for (const kind of KINDS) {
        const mark = `${kind.prefix} {`;
        let at = value.indexOf(mark);
        while (at >= 0) {
          const start = at + mark.length - 1;
          const raw = objectAt(value, start);
          let item = raw ? kind.read(parseObject(raw)) : null;
          if (!item && escaped) {
            const segment = escapedObjectAt(value, start);
            item = segment ? kind.read(parseObject(segment)) : null;
          }
          if (item) found[kind.into].push(item);
          else rejected += 1;
          at = value.indexOf(mark, at + mark.length);
        }
      }
    }
  }
  return { ...found, rejected };
}

// Whole reads from parts: a read is whole when parts 1..n of one key, date
// and host are all in; its list is the parts' lists in order, its header
// part 1's. Returns the whole reads (earliest first) and the keys with parts
// missing.
function wholeReads(parts, keyOf, field) {
  const groups = new Map();
  for (const part of parts) {
    const group = `${keyOf(part)}\u0000${part.date}\u0000${part.host}\u0000${part.parts}`;
    if (!groups.has(group)) groups.set(group, new Map());
    if (!groups.get(group).has(part.part)) groups.get(group).set(part.part, part);
  }
  const whole = [], incomplete = new Set();
  for (const byPart of groups.values()) {
    const first = byPart.get(1);
    const count = [...byPart.values()][0].parts;
    if (!first || byPart.size !== count) { incomplete.add(keyOf([...byPart.values()][0])); continue; }
    const { part, parts, ...head } = first;
    whole.push({ ...head, [field]: Array.from({ length: count }, (_, index) => byPart.get(index + 1)[field]).flat() });
  }
  whole.sort((a, b) => a.date.localeCompare(b.date));
  return { whole, incomplete: [...incomplete] };
}

/**
 * The results file with whole member-list and catalog-link reads added: an
 * item keeps the result it has ("record it once"), the earliest whole read of
 * an item seen twice is used, reads for items not in front-page-hosts.json
 * are skipped. Sorted by key.
 */
export function mergeReads(file, { memberParts = [], linkParts = [] } = {}, { memberIds = memberListItems().map(item => item.id),
  libraryIds = catalogLinkItems().map(item => item.libraryId), today = new Date().toISOString().slice(0, 10) } = {}) {
  const lists = [
    { field: 'memberLists', key: 'id', items: new Set(memberIds), existing: memberListResults(file), reads: wholeReads(memberParts, part => part.id, 'options') },
    { field: 'catalogLinks', key: 'libraryId', items: new Set(libraryIds), existing: catalogLinkResults(file), reads: wholeReads(linkParts, part => part.libraryId, 'links') },
  ];
  const next = { ...file };
  const report = {};
  for (const { field, key, items, existing, reads } of lists) {
    const merged = new Map(existing);
    const added = [], unknown = [];
    let kept = 0;
    for (const read of reads.whole) {
      const id = read[key];
      if (!items.has(id)) { if (!unknown.includes(id)) unknown.push(id); continue; }
      if (merged.has(id)) { if (existing.has(id)) kept += 1; continue; }
      merged.set(id, read);
      added.push(id);
    }
    if (merged.size || file[field]) next[field] = [...merged.values()].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    report[field] = { added: added.sort(), kept, unknown: unknown.sort(), incomplete: reads.incomplete.filter(id => !merged.has(id)).sort(),
      missing: [...items].filter(id => !merged.has(id)) };
  }
  if (report.memberLists.added.length || report.catalogLinks.added.length) next.updatedOn = today;
  return { file: next, ...report };
}

/**
 * The results file with new results added. Existing results are kept; the
 * earliest result of a host seen more than once is used; unknown hosts are
 * skipped. Results are sorted by host.
 */
export function mergeResults(file, incoming, { hosts = frontPageHosts(), today = new Date().toISOString().slice(0, 10) } = {}) {
  const known = new Set(hosts);
  const existing = frontPageResults(file);
  const merged = new Map(existing);
  const added = [], unknown = [];
  let kept = 0;
  const ordered = incoming.map((result, index) => ({ result, index })).sort((a, b) => a.result.date.localeCompare(b.result.date) || a.index - b.index);
  for (const { result } of ordered) {
    if (!known.has(result.host)) { if (!unknown.includes(result.host)) unknown.push(result.host); continue; }
    if (merged.has(result.host)) { if (existing.has(result.host)) kept += 1; continue; }
    merged.set(result.host, result);
    added.push(result.host);
  }
  const results = [...merged.values()].sort((a, b) => a.host.localeCompare(b.host));
  return {
    file: { ...file, updatedOn: added.length ? today : file.updatedOn, results },
    added: added.sort(), kept, unknown: unknown.sort(), missing: hosts.filter(host => !merged.has(host)),
  };
}

function readInput(path) {
  return path && path !== '-' ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
}

function main(args) {
  let resultsFile = RESULTS_FILE, dryRun = false;
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--dry-run') dryRun = true;
    else if (args[index] === '--results') resultsFile = args[++index];
    else positional.push(args[index]);
  }
  const { results, memberParts, linkParts, rejected } = parseLogLines(readInput(positional[0]));
  const hosts = frontPageHosts();
  const merge = mergeResults(JSON.parse(readFileSync(resultsFile, 'utf8')), results, { hosts });
  const reads = mergeReads(merge.file, { memberParts, linkParts });
  const changed = merge.added.length || reads.memberLists.added.length || reads.catalogLinks.added.length;
  if (!dryRun && changed) writeFileSync(resultsFile, `${JSON.stringify(reads.file, null, 1)}\n`);
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const kinds = [['memberLists', 'member list', 'member lists'], ['catalogLinks', 'catalog-link read', 'catalog-link reads']];
  console.log([
    `${dryRun ? 'Would add' : 'Added'} ${plural(merge.added.length, 'result')}${merge.added.length ? `: ${merge.added.join(', ')}` : ''}.`,
    `${plural(merge.kept, 'line')} for hosts that already had a result (kept as they were).`,
    ...(merge.unknown.length ? [`Skipped hosts not in front-page-hosts.json: ${merge.unknown.join(', ')}.`] : []),
    ...(rejected ? [`${plural(rejected, 'marked line')} not understood.`] : []),
    `${merge.missing.length} of ${hosts.length} hosts still have no result.`,
    ...kinds.flatMap(([field, one, many]) => {
      const item = reads[field];
      const total = item.missing.length + (reads.file[field] || []).length;
      if (!total) return [];
      return [`${dryRun ? 'Would add' : 'Added'} ${item.added.length} ${item.added.length === 1 ? one : many}${item.added.length ? `: ${item.added.join(', ')}` : ''}; ${item.kept} kept as they were; ${item.missing.length} of ${total} still to read.`,
        ...(item.incomplete.length ? [`Parts missing for ${item.incomplete.join(', ')} (paste every part of a read).`] : []),
        ...(item.unknown.length ? [`Skipped ${many} not in front-page-hosts.json: ${item.unknown.join(', ')}.`] : [])];
    }),
  ].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
