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
