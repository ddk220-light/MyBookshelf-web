import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_LABELS, LAST_TIER, formatKind, formatTier, rowFormatKind } from './rowFormats.js';
import { getProvider } from './providers/index.js';
import { getAllLibraries } from './directory.js';
import { matchingRows, orderMatches, searchLibraryBook } from './libraryBookSearch.js';

test('every adapter label in the table has one of the kinds', () => {
  for (const [family, labels] of Object.entries(FORMAT_LABELS)) {
    for (const [label, kind] of Object.entries(labels)) assert.equal(formatKind(label), kind, `${family} ${label}`);
  }
});

test('BiblioCommons codes (Seattle, "the hobbit"), TLC labels and Polaris labels', () => {
  const bc = { BK: 'book', GRAPHIC_NOVEL: 'book', LPRINT: 'book', EBOOK: 'ebook', GRAPHIC_NOVEL_DOWNLOAD: 'ebook', BOOK_CD: 'audiobook',
    EAUDIOBOOK: 'audiobook', DVD: 'video', MUSIC_CD: 'music', MUSIC_DOWNLOAD: 'music' };
  for (const [code, kind] of Object.entries(bc)) assert.equal(formatKind(code), kind, code);
  const tlc = { Book: 'book', 'Large Print': 'book', eBook: 'ebook', 'Book on CD': 'audiobook', 'Book on Tape': 'audiobook', eAudioBook: 'audiobook',
    Audiobook: 'audiobook', Playaway: 'audiobook', DVD: 'video', 'Video Recording': 'video', eVideo: 'video', 'Music CD': 'music', eMusic: 'music', Score: 'music' };
  for (const [label, kind] of Object.entries(tlc)) assert.equal(formatKind(label), kind, label);
  for (const [label, kind] of Object.entries({ Ebook: 'ebook', Eaudiobook: 'audiobook' })) assert.equal(formatKind(label), kind, label);
});

test('Koha material types (the MARC21 XSLT labels, providers/koha.js): films and music last, a spoken recording with the e-books', () => {
  const koha = { Text: 'book', Book: 'book', Sound: 'audiobook', 'Visual material': 'video', Film: 'video', Music: 'music', Score: 'music',
    'Computer file': 'other', Kit: 'other', Map: 'other', 'Mixed materials': 'other', 'Continuing resource': 'other' };
  for (const [label, kind] of Object.entries(koha)) assert.equal(formatKind(label), kind, label);
  assert.deepEqual(['Text', 'Sound', 'Kit', 'Visual material', 'Music'].map(format => formatTier({ format })), [0, 1, 2, LAST_TIER, LAST_TIER]);
});

test('Aspen Discovery formats (a related manifestation\'s data-format, providers/aspen.js): the ones seen at Greenville, and the names the words would misread', () => {
  const seen = { Book: 'book', 'Large Print': 'book', 'Audiobook on CD': 'audiobook', Playaway: 'audiobook', 'Online Content': 'ebook', DVD: 'video', 'Music CD': 'music' };
  for (const [label, kind] of Object.entries(seen)) assert.equal(formatKind(label), kind, label);
  const named = { 'Playaway View': 'video', 'Book Club Kit': 'other', eComic: 'ebook', Kindle: 'ebook', eAudiobook: 'audiobook', 'Video Game': 'other', 'Board Book': 'book' };
  for (const [label, kind] of Object.entries(named)) assert.equal(formatKind(label), kind, label);
  assert.deepEqual(['Book', 'Audiobook on CD', 'Online Content', 'Book Club Kit', 'DVD', 'Music CD'].map(format => formatTier({ format })), [0, 1, 1, 2, LAST_TIER, LAST_TIER]);
});

test('labels not in the table are read by their words; no label is no format', () => {
  const words = { 'Blu-ray 4K': 'video', 'Video cassette': 'video', videorecording: 'video', 'Motion picture': 'video', 'DVD (Region 1)': 'video', VCD: 'video',
    'Musical sound recording': 'music', 'Sheet music': 'music', 'Sound recording of music': 'music',
    // Music words before the e-book words: a music download is not an e-book.
    'Music download': 'music', 'Downloadable music': 'music', Music: 'music', 'MUSIC_STREAMING': 'music',
    'Audio book': 'audiobook', 'Sound recording': 'audiobook', 'Talking book': 'audiobook',
    'E-book': 'ebook', 'Downloadable e-book': 'ebook', 'Electronic resource': 'ebook',
    'Hardcover book': 'book', 'Large print book': 'book', 'Text book': 'book', 'TEXTBOOK': 'book', 'Reference': 'book',
    Magazine: 'other', 'Board game': 'other', Kit: 'other' };
  for (const [label, kind] of Object.entries(words)) assert.equal(formatKind(label), kind, label);
  for (const none of [undefined, null, '', '0', ' - ', 42]) assert.equal(formatKind(none), null, String(none));
});

test('a format only orders the card: books and rows with no format, then e-books and audiobooks, then others, films and music last', () => {
  for (const format of ['BK', 'Large Print', 'Text book', undefined, '0']) assert.equal(formatTier({ format }), 0, String(format));
  for (const format of ['EBOOK', 'eBook', 'EAUDIOBOOK', 'Book on CD', 'Playaway']) assert.equal(formatTier({ format }), 1, format);
  for (const format of ['Magazine', 'Kit', 'VIDEO_GAME']) assert.equal(formatTier({ format }), 2, format);
  for (const format of ['DVD', 'Blu-ray', 'eVideo', 'MUSIC_CD', 'MUSIC_DOWNLOAD', 'Music download', 'Score']) assert.equal(formatTier({ format }), LAST_TIER, format);
  // An adapter may say the kind itself.
  assert.equal(rowFormatKind({ formatKind: 'video', format: 'Book' }), 'video');
  assert.equal(rowFormatKind({ formatKind: 'nonsense', format: 'Book' }), 'book');
});

test('one format table for every library, Indian and US alike: a label two catalogs could read differently is read the way that ranks books first', () => {
  // The labels the US families brought that the word patterns alone read otherwise: the reading kept puts the books first.
  const kept = { Text: 'book', text: 'book', Braille: 'book', 'Read-along': 'book', ReadAlongs: 'book', Vox: 'book', 'Book + DVD': 'book',
    'Book Club Kit': 'other', Sound: 'audiobook', 'Online Content': 'ebook', Kindle: 'ebook', eComic: 'ebook',
    'Visual material': 'video', 'Visual materials': 'video', 'Playaway View': 'video', Videotape: 'video', 'Projected medium': 'video', 'moving image': 'video' };
  for (const [label, kind] of Object.entries(kept)) assert.equal(formatKind(label), kind, label);
  // A book-like label is never read as anything but a book.
  for (const label of ['Text', 'Braille', 'Book + DVD', 'Text book', 'TEXTBOOK', 'Textual Documents', 'Book (reference use only)']) assert.equal(formatTier({ format: label }), 0, label);
  // No provider carries a family of its own: an Indian library's rows are ranked as a US library's.
  for (const entry of [getAllLibraries().find(item => item.country === 'IN' && item.platform === 'koha' && item.capabilities?.includes('availability')),
    getAllLibraries().find(item => item.country === 'IN' && item.platform === 'egranthalaya'), getAllLibraries().find(item => item.id === 'tlc:lapl')]) {
    assert.equal('formatFamily' in getProvider(entry), false, entry.id);
  }
  const rows = [{ title: 'Wings of Fire', format: 'eBook' }, { title: 'Wings of Fire', format: 'Braille' }];
  assert.deepEqual(orderMatches(rows, 'Wings of Fire').map(row => row.format), ['Braille', 'eBook']);
});

test('a format never decides a find: every row that passes the title rule is a find, whatever its label, in India as in the US', async () => {
  // Every label any family or the Indian catalogs give, and the ones they share, on rows that pass and rows that do not.
  const labels = [...new Set(Object.values(FORMAT_LABELS).flatMap(family => Object.keys(family))), 'Text', 'Sound', 'Kit', 'Map', 'CD', 'DVD', 'Thesis',
    'Visual material', 'Computer file', undefined, '', '0'];
  const rows = labels.flatMap((format, index) => [
    { recordId: `a${index}`, title: 'Wings of fire : an autobiography', format },
    { recordId: `b${index}`, title: 'Kalam: Wings of Fire', format },
    { recordId: `c${index}`, title: 'Ignited minds', format }]);
  const book = { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
  const finds = matchingRows(rows, book).map(row => row.recordId).sort();
  const withoutFormats = matchingRows(rows.map(({ format, ...row }) => row), book).map(row => row.recordId).sort();
  assert.deepEqual(finds, withoutFormats);
  assert.equal(finds.length, labels.length * 2);
  assert.ok(finds.every(id => !id.startsWith('c')));
  // The answer: found, with the same rows, whatever the formats; films and music still count.
  const provider = list => ({ search: async () => list });
  for (const list of [rows, rows.map(({ format, ...row }) => row), rows.map(row => ({ ...row, format: 'Visual material' }))]) {
    assert.equal((await searchLibraryBook(provider(list), book)).outcome, 'in_catalog');
  }
  assert.deepEqual(await searchLibraryBook(provider(rows.filter(row => row.recordId.startsWith('c'))), book), { outcome: 'no_match' });
});
