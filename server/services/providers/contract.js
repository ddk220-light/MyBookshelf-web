const STATUSES = new Set(['available', 'checked_out', 'waitlist', 'not_found', 'unknown']);

export function unknown(overrides = {}) {
  return normalizeAvailability({ status: 'unknown', branch: null, callNumber: null, url: null, ...overrides });
}

export function notFound(overrides = {}) {
  return normalizeAvailability({ status: 'not_found', branch: null, callNumber: null, url: null, ...overrides });
}

function nullableString(value) {
  if (value == null) return null;
  const result = String(value).trim();
  return result || null;
}

function nonnegativeNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeAvailability(value = {}) {
  const result = {
    status: STATUSES.has(value.status) ? value.status : 'unknown',
    branch: nullableString(value.branch),
    callNumber: nullableString(value.callNumber),
    url: safeUrl(value.url),
  };
  for (const key of ['copies', 'availableCopies', 'heldCopies']) {
    const count = nonnegativeNumber(value[key]);
    if (count !== undefined) result[key] = count;
  }
  const metadataId = nullableString(value.metadataId);
  if (metadataId) result.metadataId = metadataId;
  return result;
}

function isbn10To13(isbn10) {
  if (!/^\d{9}[\dX]$/.test(isbn10)) return null;
  const stem = `978${isbn10.slice(0, 9)}`;
  const sum = [...stem].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
  return `${stem}${(10 - (sum % 10)) % 10}`;
}

export function isbnVariants(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^\dX]/g, '');
  const variants = new Set(normalized ? [normalized] : []);
  if (normalized.length === 10) {
    const converted = isbn10To13(normalized);
    if (converted) variants.add(converted);
  }
  return variants;
}

export function isbnMatches(candidate, expected) {
  const expectedVariants = isbnVariants(expected);
  for (const variant of isbnVariants(candidate)) if (expectedVariants.has(variant)) return true;
  return false;
}
