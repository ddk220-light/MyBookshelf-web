export function decode(value) {
  return String(value || '').replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (entity, numeric, named) => {
    if (numeric) {
      const point = numeric[0].toLowerCase() === 'x' ? Number.parseInt(numeric.slice(1), 16) : Number(numeric);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}

export function text(html) {
  return decode(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function attrs(value) {
  const result = {};
  for (const match of value.matchAll(/([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

export function markupOnly(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

// Balanced element boundaries matter: Koha nests its ISBN label and value in
// spans. Stopping at the first closing span loses the actual identifier.
export function contents(html, opening, name) {
  const start = opening.index + opening[0].length;
  const pattern = new RegExp(`<\\/?${name}\\b[^>]*>`, 'gi');
  pattern.lastIndex = start;
  let depth = 1, match;
  while ((match = pattern.exec(html))) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index);
  }
  return null;
}

