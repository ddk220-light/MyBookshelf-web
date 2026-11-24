import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOG_PREFIX, frontPageHosts, frontPageResult, frontPageResults } from '../../server/catalog-store/frontPageCheck.js';

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

const RESULTS_FILE = fileURLToPath(new URL('../../server/data/front-page-results.json', import.meta.url));
const MARK = `${LOG_PREFIX} {`;

// The object starting at `start`: results hold no braces in their values.
function objectAt(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

function parseObject(segment) {
  try { return JSON.parse(segment); } catch { /* maybe escaped */ }
  // An escaped line inside a JSON log export: {\"host\":\"a.org\",...}.
  try { return JSON.parse(JSON.parse(`"${segment}"`)); } catch { return null; }
}

/** The results in saved log text, in order, and how many marked lines were not understood. */
export function parseLogLines(text) {
  const results = [];
  let rejected = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    let at = line.indexOf(MARK);
    while (at >= 0) {
      const segment = objectAt(line, at + MARK.length - 1);
      const result = segment ? frontPageResult(parseObject(segment)) : null;
      if (result) results.push(result);
      else rejected += 1;
      at = line.indexOf(MARK, at + MARK.length);
    }
  }
  return { results, rejected };
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
  const { results, rejected } = parseLogLines(readInput(positional[0]));
  const hosts = frontPageHosts();
  const merge = mergeResults(JSON.parse(readFileSync(resultsFile, 'utf8')), results, { hosts });
  if (!dryRun && merge.added.length) writeFileSync(resultsFile, `${JSON.stringify(merge.file, null, 1)}\n`);
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  console.log([
    `${dryRun ? 'Would add' : 'Added'} ${plural(merge.added.length, 'result')}${merge.added.length ? `: ${merge.added.join(', ')}` : ''}.`,
    `${plural(merge.kept, 'line')} for hosts that already had a result (kept as they were).`,
    ...(merge.unknown.length ? [`Skipped hosts not in front-page-hosts.json: ${merge.unknown.join(', ')}.`] : []),
    ...(rejected ? [`${plural(rejected, 'marked line')} not understood.`] : []),
    `${merge.missing.length} of ${hosts.length} hosts still have no result.`,
  ].join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
