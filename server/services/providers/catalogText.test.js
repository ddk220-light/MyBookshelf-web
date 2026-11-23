import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, cleanAuthor, cleanPublishedDate, cleanEdition, cleanFormat, cleanCallNumber, cleanPublisher, titleCaseShouting } from './catalogText.js';

// Values below are copied from the 12 November 2026 production responses
// for Anna Centenary, Kalaignar Centenary, Ernakulam and Visakhapatnam.
test('ISBD separators are removed from the end of titles without touching the rest', () => {
  assert.equal(cleanTitle('Wings of fire: an autobiography /'), 'Wings of fire: an autobiography');
  assert.equal(cleanTitle('Ponniyin selvan - 1/'), 'Ponniyin selvan - 1');
  assert.equal(cleanTitle('Ponniyin selvan -4/'), 'Ponniyin selvan -4');
  assert.equal(cleanTitle('பொன்னியின் செல்வன் /'), 'பொன்னியின் செல்வன்');
  assert.equal(cleanTitle('Wings of Fire '), 'Wings of Fire');
  assert.equal(cleanTitle('Kalki\'s Ponniyin Selvan (Volume-i, Volume-ii, Volume-iii )'), 'Kalki\'s Ponniyin Selvan (Volume-i, Volume-ii, Volume-iii )');
});

test('all-capital Latin titles are title-cased conservatively; other scripts and mixed case are left alone', () => {
  assert.equal(titleCaseShouting('WINGS OF FIRE: AN AUTOBIOGRAPHY'), 'Wings of Fire: An Autobiography');
  assert.equal(titleCaseShouting('RANDAMOOZHAM'), 'Randamoozham');
  assert.equal(titleCaseShouting('HISTORY OF INDIA VOLUME II'), 'History of India Volume II');
  // Initials are names, not the article "a".
  assert.equal(titleCaseShouting('WINGS OF FIRE BY A.P.J. ABDUL KALAM'), 'Wings of Fire by A.P.J. Abdul Kalam');
  assert.equal(titleCaseShouting('LIFE OF A. K. GOPALAN'), 'Life of A. K. Gopalan');
  assert.equal(titleCaseShouting('THE U.S.A. AND INDIA'), 'The U.S.A. and India');
  assert.equal(titleCaseShouting('A HISTORY OF KERALA. A NEW EDITION'), 'A History of Kerala. A New Edition');
  assert.equal(titleCaseShouting('SAMAADHAANA JEEVITHA SASTHRAM - NATURIST SOCIALIST MANIFESTO ജീവിതം സന്തോഷകരവും'),
    'Samaadhaana Jeevitha Sasthram - Naturist Socialist Manifesto ജീവിതം സന്തോഷകരവും');
  assert.equal(titleCaseShouting('WINGS OF FIRE: Darkness Of Dragons Book 10'), 'WINGS OF FIRE: Darkness Of Dragons Book 10');
  assert.equal(titleCaseShouting('മഞ്ഞുമലകളും സമതലങ്ങളും'), 'മഞ്ഞുമലകളും സമതലങ്ങളും');
  assert.equal(titleCaseShouting('பொன்னியின் செல்வன்'), 'பொன்னியின் செல்வன்');
  assert.equal(titleCaseShouting('DC'), 'DC');
  assert.equal(titleCaseShouting('panchatantra'), 'panchatantra');
});

test('NULL placeholders and stray punctuation are removed from author names', () => {
  assert.equal(cleanAuthor('NULL'), '');
  assert.equal(cleanAuthor('NULL, Abdul Kalam.A.P.J.'), 'Abdul Kalam.A.P.J.');
  assert.equal(cleanAuthor('.Abdul kalam.'), 'Abdul kalam.');
  assert.equal(cleanAuthor('Abdul Kalam, A. P. J'), 'Abdul Kalam, A. P. J');
  assert.equal(cleanAuthor('Nullarbor, Jane'), 'Nullarbor, Jane');
});

test('dates, editions, publishers, formats and call numbers are handed over clean', () => {
  assert.equal(cleanPublishedDate('2008/01/01'), '2008');
  assert.equal(cleanPublishedDate('1985/07/04'), '1985-07-04');
  assert.equal(cleanPublishedDate('2019.'), '2019');
  assert.equal(cleanPublishedDate('2013'), '2013');
  assert.equal(cleanPublishedDate('c2019'), 'c2019');
  assert.equal(cleanEdition('0'), '');
  assert.equal(cleanEdition('ix. 79 p.;ill, 23 cm'), '');
  assert.equal(cleanEdition('23rd ed.'), '23rd ed.');
  assert.equal(cleanEdition('2ம் பதிப்பு'), '2ம் பதிப்பு');
  assert.equal(cleanEdition('1'), '1');
  assert.equal(cleanPublisher('Universities Press Private Limited,'), 'Universities Press Private Limited');
  assert.equal(cleanPublisher('Jaico Publishing House ;'), 'Jaico Publishing House');
  assert.equal(cleanPublisher('நிலா காமிக்ஸ்,'), 'நிலா காமிக்ஸ்');
  assert.equal(cleanFormat('GRATIS'), '');
  assert.equal(cleanFormat('Lending'), 'Lending');
  assert.equal(cleanCallNumber('A'), '');
  assert.equal(cleanCallNumber('A SHA'), 'A SHA');
  assert.equal(cleanCallNumber('923'), '923');
});
