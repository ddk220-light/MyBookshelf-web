// Some public catalogs identify a work only by its displayed title and author.
// Encode that tuple, never a row number, URL, status or shelf location. Every
// resolution must re-find the exact tuple in the configured public catalog.
export function createTitleAuthorId(title, author) {
  const fields = [title, author];
  if (fields.some((value, i) => typeof value !== 'string' || !value || value.length > [500, 240][i]
      || value !== value.normalize('NFC').replace(/\s+/g, ' ').trim() || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value))) {
    throw new TypeError('A bounded canonical title and author are required');
  }
  return Buffer.from(JSON.stringify(fields), 'utf8').toString('base64url');
}

export function parseTitleAuthorId(value) {
  if (typeof value !== 'string' || value.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const fields = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(fields) || fields.length !== 2 || createTitleAuthorId(...fields) !== value) return null;
    return { title: fields[0], author: fields[1] };
  } catch { return null; }
}
