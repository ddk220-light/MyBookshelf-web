// Reader-facing cleanup for catalog leftovers (ISBD punctuation, placeholder
// values and all-capital Latin titles). These helpers only change display
// values: record identities, ISBNs and holdings are parsed separately and
// never derived from the cleaned text.

const NULL_TOKEN = /^(?:null|undefined|n\/a)$/i;

// ISBD separates title, responsibility and publication fields with " /",
// " :", " ;", " =" and ",". A trailing separator is punctuation, not title.
export function cleanTitle(value) {
  const cleaned = String(value ?? '').replace(/\s+/g, ' ').replace(/[\s/:;,=]+$/u, '').trim();
  return titleCaseShouting(cleaned);
}

const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'over', 'the', 'to', 'upon', 'with']);
const ROMAN = /^(?=[IVXLC]+$)C{0,3}(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;

// Some catalogs (Ernakulam Public Library) record every Latin title in
// capitals. Convert only when every Latin letter in the title is a capital
// and there are enough of them to be shouting rather than an acronym. Other
// scripts have no letter case and are left untouched; Roman numerals and
// words containing digits keep their form.
export function titleCaseShouting(value) {
  const title = String(value ?? '');
  const latin = title.match(/\p{Script=Latin}/gu) || [];
  if (latin.length < 4 || latin.some(letter => letter !== letter.toUpperCase()) || latin.every(letter => letter === letter.toLowerCase())) return title;
  let first = true;
  return title.replace(/\p{Script=Latin}[\p{Script=Latin}\p{M}'’]*/gu, (word, offset) => {
    const before = title.slice(0, offset);
    // A period after an initial ("A.P.J.", "U.S.A.") does not end a clause.
    const startsClause = first || /[:!?(\-–—]\s*$/.test(before) || /(?:\p{L}{2,}|\d)\.\s*$/u.test(before);
    first = false;
    // Initials keep their capital: "BY A. P. J. ABDUL KALAM" -> "by A. P. J. Abdul Kalam".
    if (word.length === 1 && title[offset + 1] === '.') return word;
    if (ROMAN.test(word) && word.length > 1) return word;
    if (/\d/.test(word)) return word;
    const lower = word.toLowerCase();
    if (!startsClause && MINOR.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

// "NULL", "NULL, Abdul Kalam.A.P.J." and leading stray periods are database
// placeholders, not part of a name.
export function cleanAuthor(value) {
  const parts = String(value ?? '').replace(/\s+/g, ' ').split(',').map(part => part.trim()).filter(part => part && !NULL_TOKEN.test(part));
  const author = parts.join(', ').replace(/^[\s.,;:/]+/, '').replace(/[\s,;:/]+$/, '').trim();
  return NULL_TOKEN.test(author) ? '' : author;
}

export function cleanAuthors(values) {
  return [...new Set((values || []).map(cleanAuthor).filter(Boolean))];
}

export function cleanPublisher(value) {
  const publisher = String(value ?? '').replace(/\s+/g, ' ').replace(/^[\s[]+|[\s,;:/\]]+$/g, '').trim();
  return NULL_TOKEN.test(publisher) ? '' : publisher;
}

// Hand the client plain ISO-style dates. "2008/01/01" is a year-only record
// padded with January 1 by the cataloguing software; "1985/07/04" is a full
// date. Trailing ISBD periods ("2019.") are removed; anything else is kept.
export function cleanPublishedDate(value) {
  const date = String(value ?? '').replace(/\s+/g, ' ').replace(/[\s.,;:]+$/, '').trim();
  const full = date.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (full) {
    const [, year, month, day] = full;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return year;
    if (Number(month) === 1 && Number(day) === 1) return year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return NULL_TOKEN.test(date) ? '' : date;
}

// "0" is the Koha default for an unrecorded edition, and physical
// descriptions ("ix. 79 p.;ill, 23 cm") are sometimes entered in this field.
export function cleanEdition(value) {
  const edition = String(value ?? '').replace(/\s+/g, ' ').replace(/[\s,;:/]+$/, '').trim();
  if (!edition || /^0+$/.test(edition) || NULL_TOKEN.test(edition)) return '';
  if (/^\d+[\s,]*(?:pages\b|p[.;:])/i.test(edition) || /\b\d+\s*p\.|\b\d+\s*cm\b/i.test(edition)) return '';
  return edition;
}

// Koha item types that describe how a copy was acquired, not what it is.
const NON_FORMATS = new Set(['gratis']);
export function cleanFormat(value) {
  const format = String(value ?? '').replace(/\s+/g, ' ').trim();
  return NON_FORMATS.has(format.toLowerCase()) ? '' : format;
}

// A single class letter ("A") cannot locate a book on a shelf.
export function cleanCallNumber(value) {
  const callNumber = String(value ?? '').replace(/\s+/g, ' ').trim();
  return callNumber.replace(/[^\p{L}\p{N}]/gu, '').length < 2 ? '' : callNumber;
}
