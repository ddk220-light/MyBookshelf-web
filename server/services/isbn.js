// ISBN validation and normalization.
// Used to reject hallucinated/garbled ISBNs from Gemini before they propagate
// downstream to Goodreads and Google Books lookups.

export function normalize(input) {
  if (input == null) return null;
  const cleaned = String(input).replace(/[\s-]/g, '').toUpperCase();
  if (!cleaned) return null;
  if (!/^[0-9X]+$/.test(cleaned)) return null;
  return cleaned;
}

export function isValidIsbn13(input) {
  const s = normalize(input);
  if (!s || s.length !== 13 || !/^\d{13}$/.test(s)) return false;
  if (!s.startsWith('978') && !s.startsWith('979')) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(s[12]);
}

export function isValidIsbn10(input) {
  const s = normalize(input);
  if (!s || s.length !== 10 || !/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
  const last = s[9] === 'X' ? 10 : Number(s[9]);
  sum += last;
  return sum % 11 === 0;
}

export function toIsbn13(input) {
  const s = normalize(input);
  if (!s) return null;
  if (s.length === 13) return isValidIsbn13(s) ? s : null;
  if (s.length === 10) {
    if (!isValidIsbn10(s)) return null;
    const core = '978' + s.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
    const check = (10 - (sum % 10)) % 10;
    return core + String(check);
  }
  return null;
}

// Convenience: take any input, return a valid normalized ISBN-13 or null.
export function validateAndNormalize(input) {
  return toIsbn13(input);
}
