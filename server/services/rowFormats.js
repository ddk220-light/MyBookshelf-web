// What kind of item a catalog row is, from the format the catalog gives it.
// The one place format labels are read. A format never decides whether a row
// is a find: every row passing the title rule is one, films and music
// included (owner decisions, 23 November 2026: "Wrongly saying something is
// found is okay. It's worse to say that something is not there"; films and
// music "still count as a find, but show last"). The format only orders the
// card (`formatTier`). Adapters pass the catalog's own label through
// untouched, as `row.format`; libraryBookSearch.js asks what it is.
//
// Kinds, and their place on the card (`formatTier`):
//   book       print book, large print, graphic novel, board book, textbook   0
//   null       the catalog gave no format: with the books                     0
//   ebook      e-book, downloadable graphic novel                             1
//   audiobook  book on CD or tape, e-audiobook, Playaway, a plain "sound recording"  1
//   other      anything else the catalog names (a serial, a kit, a map)       2
//   video      DVD, Blu-ray, video recording, film, e-video                   3 (last)
//   music      music CD, e-music, score, sheet music, sound recording of music  3 (last)
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
    // MUSIC_DOWNLOAD: SFPL's soundtrack rows (live check, 23 November 2026).
    MUSIC_CD: 'music', MUSIC_DOWNLOAD: 'music', MUSIC_ONLINE: 'music', MUSIC_SCORE: 'music', LP: 'music', VINYL: 'music',
    MAG: 'other', KIT: 'other', MAP: 'other', BOARD_GAME: 'other', EQUIPMENT: 'other',
  }),
  // TLC LS2 PAC / CARL.X `resources[].format` (research, 23 November 2026:
  // LAPL and Frederick, 1,665 rows; the adapter's live checks of 24 November
  // 2026, providers/tlc.js, saw no other label).
  tlc: Object.freeze({
    Book: 'book', 'Large Print': 'book',
    eBook: 'ebook',
    'Book on CD': 'audiobook', 'Book on Tape': 'audiobook', eAudioBook: 'audiobook', Audiobook: 'audiobook', Playaway: 'audiobook',
    DVD: 'video', 'Video Recording': 'video', eVideo: 'video',
    'Music CD': 'music', eMusic: 'music', Score: 'music',
  }),
  // Koha's material types (providers/koha.js `materialType`): the label its
  // MARC21 XSLT shows on a search row or record page, from the record's
  // leader. "Text" covers print books and e-books alike; "Sound" is a
  // spoken (non-musical) recording, so an audiobook; "Music" a musical one;
  // "Visual material" (older releases) and "Film" are mostly DVDs. Read for
  // the US Koha libraries at ByWater (USA plan step 4) and for the Indian
  // Koha catalogs that show the line (Madurai, Dharwad).
  koha: Object.freeze({
    Text: 'book', Book: 'book',
    Sound: 'audiobook',
    'Visual material': 'video', Film: 'video',
    Music: 'music', Score: 'music',
    'Computer file': 'other', Kit: 'other', Map: 'other', 'Mixed materials': 'other', 'Continuing resource': 'other', Article: 'other',
    Set: 'other', Picture: 'other', Object: 'other',
  }),
  // Aspen Discovery formats (providers/aspen.js: a related manifestation's
  // data-format). Seen at Greenville (research item 7 and the adapter's live
  // checks, 24 November 2026): Book, Large Print, Audiobook on CD, Playaway,
  // Online Content (a web or e-content edition of the work: with the e-books),
  // DVD and Music CD. The rest are Aspen's own format names that the word
  // patterns below would misread ("Playaway View" is a video player,
  // "Book Club Kit" a kit, "eComic" and "Kindle" e-books).
  aspen: Object.freeze({
    Book: 'book', 'Large Print': 'book', 'Board Book': 'book', 'Graphic Novel': 'book',
    'Online Content': 'ebook', eBook: 'ebook', Kindle: 'ebook', eComic: 'ebook',
    'Audiobook on CD': 'audiobook', Playaway: 'audiobook', eAudiobook: 'audiobook',
    DVD: 'video', 'Blu-ray': 'video', eVideo: 'video', 'Playaway View': 'video',
    'Music CD': 'music', eMusic: 'music', 'Musical Score': 'music',
    'Book Club Kit': 'other', eMagazine: 'other', Magazine: 'other', 'Video Game': 'other',
  }),
  // Polaris PowerPAC result rows (providers/polaris.js: the row's format icon
  // label). Seen at Denver and Fairfax (research item 4 and the adapter's live
  // checks, 24 November 2026): Book, Large Print, Ebook, Eaudiobook, Audio
  // Book on CD, Playaway, Read-along, Electronic Resources (with the e-books),
  // Kit (a book group kit). The rest are Polaris's own
  // format (TOM) names (research item 4: the PAC's CQL access points, version
  // 7.0) and the limits the sites offer, where the word patterns below would
  // misread them: "Book + DVD" is a book, "Nonmusical sound recording" an
  // audiobook, "Projected medium" a video, "Printed music" music. ("Book +
  // CD" reads as BiblioCommons' BOOK_CD, an audiobook: one label, one kind.)
  polaris: Object.freeze({
    Book: 'book', 'Large Print': 'book', Braille: 'book', 'Book + Cassette': 'book', 'Book + DVD': 'book', 'Read-along': 'book',
    ReadAlongs: 'book',
    Ebook: 'ebook', Ebooks: 'ebook', 'Electronic resource': 'ebook', 'Electronic resources': 'ebook',
    Eaudiobook: 'audiobook', 'Audio eBook': 'audiobook', 'Audio book': 'audiobook', 'Audio book on CD': 'audiobook', 'Audio book on cassette': 'audiobook',
    Playaway: 'audiobook', 'Nonmusical sound recording': 'audiobook',
    'Blu-Ray Disc': 'video', 'Blu-Ray + DVD': 'video', Videorecording: 'video', Videotape: 'video', 'Motion picture': 'video', 'Streaming video': 'video',
    'Projected medium': 'video', 'Visual materials': 'video',
    'Musical sound recording': 'music', 'Printed music': 'music', 'Manuscript music': 'music', 'Printed or manuscript music': 'music',
    'Streaming music': 'music', Vinyl: 'music',
    Abstract: 'other', Atlas: 'other', 'Cartographic material': 'other', 'Digital media collection': 'other', Emagazine: 'other', Globe: 'other',
    'Manuscript material': 'other', Microform: 'other', Newspaper: 'other', Periodical: 'other', Serial: 'other', 'Three-dimensional object': 'other',
    'Two-dimensional nonprojected graphic': 'other', 'Framed art': 'other',
  }),
  // Apollo (Biblionix) rows (providers/apollo.js: the downloadable kind `ms`
  // when there is one, else the medium `m`; an empty medium is a print book,
  // so the row has no format and sits with the books). Seen in research item
  // 8 and the adapter's live checks (Clear Lake IA, Lawton OK, 23 and 24
  // November 2026): large print, sound recording, videorecording, eBook,
  // Audiobook; and the catalogs' own medium lists: board book, graphic novel,
  // Vox (a picture book with its own audio player, a read-along), kit,
  // music recording, periodical(s), Playaway, puzzle, Tablet, LoT (library of
  // things), electronic resource, Magazine. A "sound recording" is spoken
  // (Clear Lake lists "music recording" beside it).
  apollo: Object.freeze({
    'large print': 'book', 'board book': 'book', 'graphic novel': 'book', Vox: 'book',
    eBook: 'ebook', 'electronic resource': 'ebook',
    'sound recording': 'audiobook', Audiobook: 'audiobook', Playaway: 'audiobook',
    videorecording: 'video',
    'music recording': 'music',
    kit: 'other', periodical: 'other', periodicals: 'other', puzzle: 'other', Tablet: 'other', LoT: 'other', Magazine: 'other',
  }),
  // Evergreen (Georgia PINES) rows (providers/evergreen.js: the record's
  // MODS type of resource, from its MARC leader, in the brief record the
  // gateway gives). Seen in the live checks of 24 November 2026: text (print
  // and large print books alike) and sound recording-nonmusical (a book on
  // CD); the rest are MODS's other values. A text whose physical description
  // is an online resource is set as an e-book by the adapter.
  evergreen: Object.freeze({
    text: 'book',
    'sound recording-nonmusical': 'audiobook', 'sound recording': 'audiobook',
    'moving image': 'video',
    'sound recording-musical': 'music', 'notated music': 'music',
    cartographic: 'other', 'still image': 'other', 'three dimensional object': 'other', 'software, multimedia': 'other',
    'mixed material': 'other', kit: 'other',
  }),
  // Indian catalogs' free-text material types (LIBMAN DOCUMENTTYPE,
  // e-Granthalaya Format/Medium, IndCat leader, discovery TypeofMaterial).
  india: Object.freeze({ 'Text book': 'book', TEXTBOOK: 'book', Reference: 'book', Book: 'book', 'Book (reference use only)': 'book',
    Serial: 'other', 'Textual Documents': 'book' }),
});

export const FORMAT_KINDS = Object.freeze(['book', 'ebook', 'audiobook', 'video', 'music', 'other']);
// A kind's place on the card; a row with no format is with the books.
export const FORMAT_TIERS = Object.freeze({ book: 0, ebook: 1, audiobook: 1, other: 2, video: 3, music: 3 });
// Video and music rows: shown after every other row.
export const LAST_TIER = 3;

const labelKey = value => String(value).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function tableOf(families) {
  const table = new Map();
  for (const labels of families.map(family => FORMAT_LABELS[family])) {
    for (const [label, kind] of Object.entries(labels)) {
      const key = labelKey(label);
      if (table.has(key) && table.get(key) !== kind) throw new Error(`Format label ${label} has two kinds`);
      table.set(key, kind);
    }
  }
  return table;
}
// One table for every library, in every country (owner, 24 November 2026:
// "anything we apply should apply to all libraries"). A label two catalogs
// could read differently is read the way that ranks books first: "Text",
// "Braille", "Read-along" and "Book + DVD" are books; "Book Club Kit" is a
// kit, "Visual material" a film, after the books. A format only orders the
// card: it never decides whether a row is a find.
const TABLE = tableOf(Object.keys(FORMAT_LABELS));

// Word patterns for labels the table does not list, tried in this order (a
// "Music CD" is music before it is a CD; a "Music download" is music before
// it is a download, which the e-book words would take; a "Book on CD" is an
// audiobook before it is a book).
const PATTERNS = [
  ['video', /\b(?:e ?video\w*|videos?|video ?recordings?|videorecordings?|video ?cassettes?|videocassettes?|dvds?|vcds?|blu ?rays?|bluray\w*|vhs|uhd|films?|motion pictures?)\b/],
  ['music', /\b(?:e ?music\w*|music|musical\w*|sound recordings? of music|scores?|sheet music)\b/],
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

/** A row's place on the card: 0 book or no format, 1 e-book or audiobook, 2 other, 3 video or music. */
export function formatTier(row) {
  const kind = rowFormatKind(row);
  return kind === null ? 0 : FORMAT_TIERS[kind];
}
