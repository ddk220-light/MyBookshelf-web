import { validateAndNormalize } from '../isbn.js';

export function decode(value = '') {
  return String(value).replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (_, numeric, named) => {
    if (numeric) { const n = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}
export const text = value => decode(String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function attributes(value) {
  const result = {};
  for (const m of value.matchAll(/([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) result[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return result;
}
export function firstIsbn(value) {
  return (text(value).match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || [])
    .map(validateAndNormalize).find(Boolean) || null;
}
export const catalogError = (message, code = 'CATALOG_UNRECOGNIZED') => Object.assign(new Error(message), { code });
export function recordMetadata(html) {
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const isbnFields = [...html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)]
    .filter(m => /\bisbn\b/i.test(attributes(m[1]).class || '') || attributes(m[1]).property === 'isbn');
  return { title, authors: [], isbn: isbnFields.map(m => firstIsbn(m[2])).find(Boolean) || null };
}

// Some catalogs put the search text into SQL unescaped, so a quote character
// gives a database error page. The words before the first quoted word (or
// else the longest run without one) are a contains-search for a superset of
// the title's records, which the caller then matches row by row. Removing
// only the quote ("Philosopher s") would search for text no record has.
const QUOTE = /['\u2018\u2019"`\u201c\u201d]/;
export function quoteFreeQuery(q) {
  if (!QUOTE.test(q)) return q;
  const runs = [[]];
  for (const word of q.split(' ')) { if (QUOTE.test(word)) runs.push([]); else runs.at(-1).push(word); }
  const joined = run => run.join(' ');
  const first = runs[0], longest = runs.reduce((a, b) => (joined(b).length > joined(a).length ? b : a));
  const chosen = first.length >= 2 && joined(first).length >= 8 ? first : longest;
  if (joined(chosen).replace(/[^\p{L}\p{N}]/gu, '').length < 4) throw catalogError('This title cannot be searched in this catalog', 'CATALOG_QUERY_UNSUPPORTED');
  return joined(chosen);
}

// Catalogs often file a title under its main word ("Discovery of India, The",
// "DISCOVERY OF INDIA"): a contains-search for "The discovery of India" then
// finds nothing although the book is there (SRMS, Santhom, 19 Nov 2026). For
// a catalog whose title search matches anywhere in the title, the words after
// a leading English article find a superset, matched row by row afterwards.
export function withoutLeadingArticle(q) {
  const m = /^(?:the|an?)\s+(.+)$/i.exec(q);
  return m && m[1].replace(/[^\p{L}\p{N}]/gu, '').length >= 3 ? m[1] : q;
}
export const startsWithArticle = q => withoutLeadingArticle(q) !== q;

// Library filing form "Discovery of India, The" (ISBD inverted article) is
// the title "The Discovery of India". Read it as the title so the book's own
// title can be matched; nothing else in the title changes.
// A one-word "Hepatitis, A" is left alone: there "A" is part of the title.
export function uninvertedTitle(value) {
  const m = /^(.+?),\s*(the|an?)\.?\s*$/i.exec(value);
  if (!m || (!/^the$/i.test(m[2]) && !/\s/.test(m[1].trim()))) return value;
  return `${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()} ${m[1]}`;
}
