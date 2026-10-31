import { cachedTask, getText, DEFAULT_TIMEOUT_MS } from './http.js';
import { isbnMatches, normalizeAvailability, notFound, unknown } from './contract.js';
import { validateAndNormalize } from '../isbn.js';

const CHAMO_TIMEOUT_MS = 60_000;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseChamoSearch(html) {
  if (/did not find any results|no results (?:were )?found/i.test(html)) return null;
  return html.match(/(?:href|data-url)=["']([^"']*(?:lib\/item\?id=|\/record\/|opac-detail|\/detail\/)[^"']*)["']/i)?.[1] || null;
}

function labeledValues(html, label) {
  const rows = [];
  const rowPattern = new RegExp(`<t[dh][^>]*>\\s*${label}\\s*:?</t[dh]>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'gi');
  let match;
  while ((match = rowPattern.exec(html))) rows.push(decodeHtml(match[1]));
  const inlinePattern = new RegExp(`${label}\\s*:?\\s*</?[^>]+>\\s*([0-9Xx -]{10,24})`, 'gi');
  while ((match = inlinePattern.exec(html))) rows.push(match[1]);
  return rows;
}

function recordIsbns(html) {
  const values = labeledValues(html, 'ISBN(?:-1[03])?');
  const metaPattern = /<meta[^>]+(?:name|property)=["'](?:isbn|books:isbn)["'][^>]+content=["']([^"']+)["']/gi;
  let match;
  while ((match = metaPattern.exec(html))) values.push(match[1]);
  // IIT Madras exposes the edition ISBN in MARC 020$a. The cancelled/invalid
  // identifier in 020$z is never evidence that this is the requested edition.
  let marcTag = null;
  const markup = withoutExecutableMarkup(html);
  for (const field of markup.matchAll(/<div\b([^>]*)>/gi)) {
    const classes = (attributes(field[1]).class || '').split(/\s+/);
    if (!classes.includes('marcTag') && !classes.includes('marcData')) continue;
    const contents = markup.slice(field.index + field[0].length).match(/^([\s\S]*?)<\/div\s*>/i)?.[1];
    if (contents === undefined) continue;
    if (classes.includes('marcTag')) marcTag = decodeHtml(contents);
    if (classes.includes('marcData') && marcTag === '020') {
      for (const subfield of decodeHtml(contents).matchAll(/\$a\s*([^$]*)/g)) values.push(subfield[1]);
    }
  }
  return values.flatMap((value) => value.match(/(?:97[89][\d -]{10,20}|\d[\d -]{8,16}[\dXx])/g) || []);
}

function availabilityCounts(text) {
  let match = text.match(/(\d+)\s+of\s+(?:the\s+)?(\d+)\s+copies?\s+(?:is|are)\s+available/i);
  if (match) return { recognized: true, availableCopies: Number(match[1]), copies: Number(match[2]) };
  match = text.match(/(\d+)\s+copies?\s+(?:is|are)\s+available/i)
    || text.match(/(\d+)\s+copies?\s+available/i)
    || text.match(/available\s*:?\s*(\d+)/i);
  if (match) return { recognized: true, availableCopies: Number(match[1]), copies: Number(match[1]) };
  match = text.match(/(\d+)\s+copies?\s+(?:is|are)\s+(?:checked out|unavailable)/i);
  if (match) return { recognized: true, availableCopies: 0, copies: Number(match[1]) };
  if (/no copies? (?:is|are )?available|all copies? (?:is|are )?(?:checked out|unavailable)/i.test(text)) {
    return { recognized: true, availableCopies: 0, copies: undefined };
  }
  return { recognized: false };
}

export function parseChamoRecord(html, isbn) {
  const isbns = recordIsbns(html);
  if (!isbns.some((candidate) => isbnMatches(candidate, isbn))) return { isbnMatch: false };
  const text = decodeHtml(html);
  const counts = availabilityCounts(text);
  const callNumber = labeledValues(html, 'Call Number')[0] || null;
  const branch = decodeHtml(html.match(/class=["'][^"']*(?:availabilityLocation|location)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1])
    || labeledValues(html, '(?:Branch|Location)')[0] || null;
  return { isbnMatch: true, ...counts, callNumber, branch };
}

export async function checkAvailability(library, isbn) {
  const base = library.baseUrl.replace(/\/$/, '');
  // IITM's record page is consistently much slower than its search page.
  const deadlineAt = Date.now() + Math.max(DEFAULT_TIMEOUT_MS, CHAMO_TIMEOUT_MS);
  const key = `availability:chamo:${library.slug || base}:${isbn}`;
  try {
    return await cachedTask(key, async () => {
      const searchUrl = `${base}/search/query?term_1=${encodeURIComponent(isbn)}&field_1=isbn&match_1=MUST&theme=iitm`;
      const search = await getText(searchUrl, { deadlineAt });
      if (!search.ok) return unknown();
      const recordPath = parseChamoSearch(search.text);
      if (!recordPath) return notFound();
      const recordUrl = new URL(recordPath.replace(/&amp;/gi, '&'), `${base}/`).toString();
      const parsedRecordUrl = new URL(recordUrl);
      const parsedBaseUrl = new URL(base);
      if (!['http:', 'https:'].includes(parsedRecordUrl.protocol)
          || parsedRecordUrl.host !== parsedBaseUrl.host) return unknown();
      const record = await getText(recordUrl, { deadlineAt });
      if (!record.ok) return unknown({ url: recordUrl });
      const parsed = parseChamoRecord(record.text, isbn);
      if (!parsed.isbnMatch) return notFound();
      if (!parsed.recognized) return unknown({ url: recordUrl, callNumber: parsed.callNumber, branch: parsed.branch });
      return normalizeAvailability({
        status: parsed.availableCopies > 0 ? 'available' : 'checked_out',
        branch: parsed.branch,
        copies: parsed.copies,
        availableCopies: parsed.availableCopies,
        heldCopies: 0,
        callNumber: parsed.callNumber,
        url: recordUrl,
        metadataId: recordUrl,
      });
    }, { deadlineAt, shouldCache: (value) => value.status !== 'unknown' });
  } catch (err) {
    console.error('Chamo availability check failed:', err.message);
    return unknown();
  }
}


function providerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function withoutExecutableMarkup(html) {
  return String(html || '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function attributes(value) {
  const result = {};
  for (const match of value.matchAll(/([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function elementContentsById(html, tagName, id) {
  const openings = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  const opening = [...html.matchAll(openings)].find((match) => attributes(match[1]).id === id);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 1, match;
  while ((match = tags.exec(html))) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index);
  }
  return null;
}

function copySection(html) {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)];
  const copies = links.filter((match) => decodeHtml(match[2]).toLowerCase() === 'copies'
    && /^#[A-Za-z0-9_-]+$/.test(attributes(match[1]).href || ''));
  if (copies.length !== 1) return null;
  return elementContentsById(html, 'div', attributes(copies[0][1]).href.slice(1));
}

function hasPagination(html) {
  for (const tag of html.matchAll(/<(?:a|div|span|nav|td|select)\b([^>]*)>/gi)) {
    const attrs = attributes(tag[1]);
    if (/(?:^|[\s_-])(?:pagination|paginator|pager|navigator|navigation)(?:$|[\s_-])/i.test(`${attrs.class || ''} ${attrs.id || ''}`)) return true;
    // Chamo leaves an empty pageLinks container even for a single-page search.
    // Populated page links mean this bounded reader has not seen every result.
    if ((attrs.class || '').split(/\s+/).includes('pageLinks')) {
      const contents = html.slice(tag.index + tag[0].length).match(/^([\s\S]*?)<\/(?:div|span|nav)\s*>/i)?.[1];
      if (contents && (/<a\b/i.test(contents) || /[^1\s]/.test(decodeHtml(contents)))) return true;
    }
    if (/\b(?:next|prev|previous|first|last)\b/i.test(attrs.rel || '')) return true;
    if (/(?:[?&](?:copies-page|page|offset|start)=|copies[^\s]*?(?:pageLink|navigator|navigation|next|previous))/i.test(attrs.href || '')) return true;
  }
  return false;
}

function copyStatus(value) {
  if (/^available$/i.test(value)) return 'available';
  // These are the two states observed in the public IITM copy table. New or
  // reference-only states remain unknown until their lending meaning is known.
  if (/^Due (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}$/i.test(value)) return 'unavailable';
  return 'unknown';
}

function rollupStatus(rows) {
  if (rows.some((row) => row.status === 'available')) return 'available';
  return rows.length && rows.every((row) => row.status === 'unavailable') ? 'unavailable' : 'unknown';
}

function exactUnknown() {
  return { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true };
}

// The public reader uses record-owned identifiers and a complete, labelled copy
// table. Neither a search echo nor a cover-image ISBN establishes edition identity.
export function parseChamoPublicRecord(html, value, { expectedCopies } = {}) {
  const isbn = validateAndNormalize(value);
  const markup = withoutExecutableMarkup(html);
  if (!isbn || !recordIsbns(markup).some((candidate) => validateAndNormalize(candidate) === isbn)) return null;
  const section = copySection(markup);
  if (!section) return null;
  if (hasPagination(section)) return exactUnknown();
  const tables = [...section.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)];
  const candidates = tables.filter((table) => /<thead\b/i.test(table[1]) && /<tbody\b/i.test(table[1]));
  if (candidates.length !== 1 || /<table\b/i.test(candidates[0][1])) return null;
  const table = candidates[0][1];
  const header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/i)?.[1];
  if (!header) return null;
  const headerRows = [...header.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)]
    .filter((row) => /<th\b/i.test(row[1]));
  if (headerRows.length !== 1) return null;
  const columns = [...headerRows[0][1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)]
    .map((cell) => decodeHtml(cell[1]).toLowerCase());
  if (['location', 'status'].some((name) => columns.filter((column) => column === name).length !== 1)) return null;
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/i)?.[1];
  if (body === undefined) return null;
  const rows = [];
  for (const row of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    const attrs = attributes(row[1]);
    if (Object.hasOwn(attrs, 'hidden') || attrs['aria-hidden'] === 'true' || /display\s*:\s*none/i.test(attrs.style || '')) {
      // Wicket emits an empty hidden placeholder. Hidden real copies would
      // make a visible-row census incomplete, so only skip the empty one.
      if (decodeHtml(row[2])) return exactUnknown();
      continue;
    }
    const cells = [...row[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)];
    if (!cells.length) continue;
    if (cells.length !== columns.length || cells.some((cell) => ['colspan', 'rowspan'].some((name) => {
      const span = attributes(cell[1])[name];
      return span !== undefined && span !== '1';
    }))) return exactUnknown();
    const values = cells.map((cell) => decodeHtml(cell[2]));
    const name = values[columns.indexOf('location')];
    if (!name) return null;
    rows.push({ name, status: copyStatus(values[columns.indexOf('status')]),
      callNumber: values[columns.indexOf('call number')], format: values[columns.indexOf('item class')] });
  }
  // Empty, truncated or paginated listings do not prove that no copy exists.
  if (!rows.length || (expectedCopies !== undefined && expectedCopies !== rows.length)) return exactUnknown();
  const status = rollupStatus(rows);
  const result = { outcome: status === 'unavailable' ? 'none_available' : status,
    matchKind: 'exact_isbn', recognizedExact: true, locations: [] };
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.name)) groups.set(row.name, []);
    groups.get(row.name).push(row);
  }
  for (const [name, grouped] of groups) {
    const location = { name, status: rollupStatus(grouped) };
    if (grouped.every((row) => row.status !== 'unknown')) {
      location.availableCopies = grouped.filter((row) => row.status === 'available').length;
      location.totalCopies = grouped.length;
    }
    result.locations.push(location);
  }
  if (rows.every((row) => row.status !== 'unknown')) {
    result.availableCopies = rows.filter((row) => row.status === 'available').length;
    result.totalCopies = rows.length;
  }
  const callNumbers = new Set(rows.map((row) => row.callNumber).filter(Boolean));
  if (callNumbers.size === 1) result.callNumber = [...callNumbers][0];
  const formats = new Set(rows.map((row) => row.format).filter(Boolean));
  if (formats.size === 1) result.format = [...formats][0];
  return result;
}

function publicConfiguration(library) {
  try {
    const base = new URL(library?.baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error();
    return base;
  } catch {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Chamo requires a configured HTTPS catalog origin');
  }
}

function publicRecordUrl(href, searchUrl) {
  try {
    const url = new URL(href, searchUrl);
    if (url.origin !== searchUrl.origin || url.protocol !== 'https:' || url.username || url.password
        || url.pathname !== '/lib/item' || !/^chamo:\d+$/.test(url.searchParams.get('id') || '')) throw new Error();
    return url;
  } catch {
    throw providerError('CATALOG_UNRECOGNIZED', 'Chamo returned an unsafe or unrecognized record link');
  }
}

function publicSearchResult(html, searchUrl) {
  const markup = withoutExecutableMarkup(html);
  const links = [...markup.matchAll(/<a\b([^>]*)>/gi)].map((match) => attributes(match[1]).href)
    .filter((href) => href && /(?:lib\/item\?id=|\/record\/|opac-detail|\/detail\/)/i.test(href));
  const urls = [...new Set(links.map((href) => publicRecordUrl(href, searchUrl).toString()))];
  if (urls.length !== 1 || hasPagination(markup)) throw providerError('CATALOG_UNRECOGNIZED', 'Chamo search did not prove one complete record result');
  let expectedCopies;
  const summaries = [...markup.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)]
    .filter((match) => (attributes(match[1]).class || '').split(/\s+/).includes('availabilityTotal'));
  if (summaries.length === 1) {
    const counts = decodeHtml(summaries[0][2]).match(/^(\d+) of (?:the )?(\d+) cop(?:y|ies) (?:is|are) available$/i);
    if (counts) {
      if (Number(counts[1]) > Number(counts[2])) throw providerError('CATALOG_UNRECOGNIZED', 'Chamo returned inconsistent copy counts');
      expectedCopies = Number(counts[2]);
    }
  }
  return { recordUrl: urls[0], expectedCopies };
}

async function publicPage(url, deadlineAt) {
  let response;
  try {
    response = await getText(url.toString(), { deadlineAt, maxResponseBytes: 1024 * 1024, redirect: 'manual', retries: 0 });
  } catch (error) {
    const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '')
      ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
    throw providerError(code, 'Chamo could not complete the public catalog request');
  }
  if ([401, 403, 429].includes(response.status)) throw providerError('CATALOG_PROVIDER_BLOCKED', `Chamo returned HTTP ${response.status}`);
  if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `Chamo returned HTTP ${response.status}`);
  if (response.url !== url.toString()) throw providerError('CATALOG_UNRECOGNIZED', 'Chamo returned an unexpected catalog page');
  return response.text;
}

export async function checkPublicAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'Chamo availability requires a valid ISBN');
  const base = publicConfiguration(library);
  const searchUrl = new URL('/search/query', base);
  for (const [name, content] of Object.entries({ term_1: isbn, field_1: 'isbn', match_1: 'MUST', theme: 'iitm' })) searchUrl.searchParams.set(name, content);
  // One shared public deadline; at most one search and one record request.
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`availability:chamo:public:${base.origin}:${isbn}`, async () => {
    const search = await publicPage(searchUrl, deadlineAt);
    const { recordUrl, expectedCopies } = publicSearchResult(search, searchUrl);
    const record = await publicPage(new URL(recordUrl), deadlineAt);
    const result = parseChamoPublicRecord(record, isbn, { expectedCopies });
    if (!result) throw providerError('CATALOG_UNRECOGNIZED', 'Chamo did not prove this ISBN and its public copy table');
    return { ...result, catalogUrl: recordUrl };
  }, { deadlineAt, shouldCache: (value) => value.outcome !== 'unknown' });
}
