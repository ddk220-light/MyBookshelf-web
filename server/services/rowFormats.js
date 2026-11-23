// What kind of item a catalog row is, from the format the catalog gives it.
// The one place format labels are read (owner decision, 23 November 2026:
// "video and music rows never count as a find, where the catalog gives a
// format"; audiobooks and e-books still count). Adapters pass the catalog's
// own label through untouched, as `row.format`; libraryBookSearch.js asks
// `formatKind` what it is.
//
// Kinds:
//   book       print book, large print, graphic novel, board book, textbook
//   ebook      e-book, downloadable graphic novel
//   audiobook  book on CD or tape, e-audiobook, Playaway, a plain "sound recording"
//   video      DVD, Blu-ray, video recording, film, e-video        (never a find)
//   music      music CD, e-music, score, sheet music, sound recording of music  (never a find)
//   other      anything else the catalog names (a serial, a kit, a map)
//   null       the catalog gave no format: the row is treated as it always was
//
// A format not listed below is read by the word patterns after the table, so
// a new label such as "Blu-ray 4K" or "Video cassette" is still video.

// Labels each adapter's catalog gives, by family. Keys are compared after
// `labelKey` (lower case, punctuation and underscores as spaces).
export const FORMAT_LABELS = Object.freeze({
  // BiblioCommons gateway `briefInfo.format` codes (providers/bibliocommons.js).
  bibliocommons: Object.freeze({
    BK: 'book', LPRINT: 'book', GRAPHIC_NOVEL: 'book', BOARD_BOOK: 'book', PICTURE_BOOK: 'book', BOOK_PLUS_CD: 'book', BOOK_KIT: 'book',
    EBOOK: 'ebook', GRAPHIC_NOVEL_DOWNLOAD: 'ebook', EMAGAZINE: 'other',
    AB: 'audiobook', BOOK_CD: 'audiobook', BOOK_TAPE: 'audiobook', EAUDIOBOOK: 'audiobook', AUDIOBOOK: 'audiobook', PLAYAWAY: 'audiobook',
    DVD: 'video', BLURAY: 'video', UHD_BLURAY: 'video', VIDEO_ONLINE: 'video', VHS: 'video', VIDEO_GAME: 'other',
    MUSIC_CD: 'music', MUSIC_ONLINE: 'music', MUSIC_SCORE: 'music', LP: 'music', VINYL: 'music',
    MAG: 'other', KIT: 'other', MAP: 'other', BOARD_GAME: 'other', EQUIPMENT: 'other',
  }),
  // TLC LS2 PAC / CARL.X `resources[].format` (research, 23 November 2026:
  // LAPL and Frederick, 1,665 rows).
  tlc: Object.freeze({
    Book: 'book', 'Large Print': 'book',
    eBook: 'ebook',
    'Book on CD': 'audiobook', 'Book on Tape': 'audiobook', eAudioBook: 'audiobook', Audiobook: 'audiobook', Playaway: 'audiobook',
    DVD: 'video', 'Video Recording': 'video', eVideo: 'video',
    'Music CD': 'music', eMusic: 'music', Score: 'music',
  }),
  // Polaris PowerPAC result rows (research, Denver and Fairfax).
  polaris: Object.freeze({ Book: 'book', 'Large Print': 'book', Ebook: 'ebook', Eaudiobook: 'audiobook', Playaway: 'audiobook' }),
  // Apollo (Biblionix): an empty format is a print book.
  apollo: Object.freeze({ 'large print': 'book', 'sound recording': 'audiobook', videorecording: 'video', eBook: 'ebook' }),
  // Indian catalogs' free-text material types (LIBMAN DOCUMENTTYPE,
  // e-Granthalaya Format/Medium, IndCat leader, discovery TypeofMaterial).
  india: Object.freeze({ 'Text book': 'book', TEXTBOOK: 'book', Reference: 'book', Book: 'book', 'Book (reference use only)': 'book',
    Serial: 'other', 'Textual Documents': 'book' }),
});

export const FORMAT_KINDS = Object.freeze(['book', 'ebook', 'audiobook', 'video', 'music', 'other']);
// Rows of these kinds are never a find.
export const NOT_A_FIND = Object.freeze(new Set(['video', 'music']));

const labelKey = value => String(value).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const TABLE = new Map();
for (const labels of Object.values(FORMAT_LABELS)) {
  for (const [label, kind] of Object.entries(labels)) {
    const key = labelKey(label);
    if (TABLE.has(key) && TABLE.get(key) !== kind) throw new Error(`Format label ${label} has two kinds`);
    TABLE.set(key, kind);
  }
}

// Word patterns for labels the table does not list, tried in this order (a
// "Music CD" is music before it is a CD; a "Book on CD" is an audiobook
// before it is a book).
const PATTERNS = [
  ['video', /\b(?:e ?video\w*|videos?|video ?recordings?|videorecordings?|video ?cassettes?|videocassettes?|dvds?|vcds?|blu ?rays?|bluray\w*|vhs|uhd|films?|motion pictures?)\b/],
  ['music', /\b(?:e ?music\w*|musical\w*|sound recordings? of music|scores?|sheet music)\b/],
  ['audiobook', /\b(?:e ?audio\w*|audio\w*|books? on (?:cd|tape|cassette)|playaway\w*|talking books?|spoken word|sound recordings?)\b/],
  ['ebook', /\b(?:e ?books?|ebook\w*|e ?pubs?|downloads?|downloadable|electronic (?:books?|resources?))\b/],
  ['book', /\b(?:books?|bk|large print|lprint|graphic novels?|text ?books?|paperbacks?|hardcovers?|hardbacks?|print|reference|manga|comics?|picture books?)\b/],
];

/** The kind of a catalog's format label (see above), or null when there is no label. */
export function formatKind(label) {
  if (typeof label !== 'string') return null;
  const key = labelKey(label);
  // "0", "-" or an empty field is no format at all.
  if (!/[a-z]/.test(key)) return null;
  if (TABLE.has(key)) return TABLE.get(key);
  for (const [kind, pattern] of PATTERNS) if (pattern.test(key)) return kind;
  return 'other';
}

/** The kind of a row: its adapter's `formatKind` when set, else its `format` label. */
export function rowFormatKind(row) {
  if (FORMAT_KINDS.includes(row?.formatKind)) return row.formatKind;
  return formatKind(row?.format);
}

/** False for a row whose catalog-given format is video or music; true otherwise (no format included). */
export function countsAsFind(row) {
  return !NOT_A_FIND.has(rowFormatKind(row));
}

/** A book row, or a row with no format (shown with the book rows, as before). */
export function isBookRow(row) {
  const kind = rowFormatKind(row);
  return kind === null || kind === 'book';
}
