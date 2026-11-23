import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_LABELS, countsAsFind, formatKind, isBookRow, rowFormatKind } from './rowFormats.js';

test('every adapter label in the table has one of the kinds', () => {
  for (const [family, labels] of Object.entries(FORMAT_LABELS)) {
    for (const [label, kind] of Object.entries(labels)) assert.equal(formatKind(label), kind, `${family} ${label}`);
  }
});

test('BiblioCommons codes (Seattle, "the hobbit"), TLC labels and Polaris labels', () => {
  const bc = { BK: 'book', GRAPHIC_NOVEL: 'book', LPRINT: 'book', EBOOK: 'ebook', GRAPHIC_NOVEL_DOWNLOAD: 'ebook', BOOK_CD: 'audiobook',
    EAUDIOBOOK: 'audiobook', DVD: 'video', MUSIC_CD: 'music' };
  for (const [code, kind] of Object.entries(bc)) assert.equal(formatKind(code), kind, code);
  const tlc = { Book: 'book', 'Large Print': 'book', eBook: 'ebook', 'Book on CD': 'audiobook', 'Book on Tape': 'audiobook', eAudioBook: 'audiobook',
    Audiobook: 'audiobook', Playaway: 'audiobook', DVD: 'video', 'Video Recording': 'video', eVideo: 'video', 'Music CD': 'music', eMusic: 'music', Score: 'music' };
  for (const [label, kind] of Object.entries(tlc)) assert.equal(formatKind(label), kind, label);
  for (const [label, kind] of Object.entries({ Ebook: 'ebook', Eaudiobook: 'audiobook' })) assert.equal(formatKind(label), kind, label);
});

test('labels not in the table are read by their words; no label is no format', () => {
  const words = { 'Blu-ray 4K': 'video', 'Video cassette': 'video', videorecording: 'video', 'Motion picture': 'video', 'DVD (Region 1)': 'video', VCD: 'video',
    'Musical sound recording': 'music', 'Sheet music': 'music', 'Sound recording of music': 'music',
    'Audio book': 'audiobook', 'Sound recording': 'audiobook', 'Talking book': 'audiobook',
    'E-book': 'ebook', 'Downloadable e-book': 'ebook', 'Electronic resource': 'ebook',
    'Hardcover book': 'book', 'Large print book': 'book', 'Text book': 'book', 'TEXTBOOK': 'book', 'Reference': 'book',
    Magazine: 'other', 'Board game': 'other', Kit: 'other' };
  for (const [label, kind] of Object.entries(words)) assert.equal(formatKind(label), kind, label);
  for (const none of [undefined, null, '', '0', ' - ', 42]) assert.equal(formatKind(none), null, String(none));
});

test('only video and music rows are not a find; rows with no format stay with the books', () => {
  assert.equal(countsAsFind({ format: 'DVD' }), false);
  assert.equal(countsAsFind({ format: 'MUSIC_CD' }), false);
  for (const format of ['BK', 'EBOOK', 'EAUDIOBOOK', 'Playaway', 'Magazine', undefined]) assert.equal(countsAsFind({ format }), true, String(format));
  assert.equal(isBookRow({}), true);
  assert.equal(isBookRow({ format: 'Large Print' }), true);
  assert.equal(isBookRow({ format: 'eBook' }), false);
  // An adapter may say the kind itself.
  assert.equal(rowFormatKind({ formatKind: 'video', format: 'Book' }), 'video');
  assert.equal(rowFormatKind({ formatKind: 'nonsense', format: 'Book' }), 'book');
});
