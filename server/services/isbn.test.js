import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isValidIsbn13, isValidIsbn10, toIsbn13, validateAndNormalize } from './isbn.js';

test('normalize strips hyphens, spaces, lowercases x', () => {
  assert.equal(normalize('978-0-307-94932-5'), '9780307949325');
  assert.equal(normalize(' 978 0307 949325 '), '9780307949325');
  assert.equal(normalize('030794932X'), '030794932X');
  assert.equal(normalize('030794932x'), '030794932X');
});

test('normalize returns null for falsy or non-digit-ish input', () => {
  assert.equal(normalize(null), null);
  assert.equal(normalize(''), null);
  assert.equal(normalize('abc'), null);
});

test('isValidIsbn13 accepts valid ISBN-13s', () => {
  assert.equal(isValidIsbn13('9780307949325'), true);
  assert.equal(isValidIsbn13('9780593135204'), true); // Project Hail Mary
});

test('isValidIsbn13 rejects bad check digit', () => {
  // Dog Stars hallucinated ISBN — should be rejected
  assert.equal(isValidIsbn13('9780307949322'), false);
});

test('isValidIsbn13 rejects wrong length / non-numeric', () => {
  assert.equal(isValidIsbn13('978030794932'), false);
  assert.equal(isValidIsbn13('97803079493255'), false);
  assert.equal(isValidIsbn13('978030794932X'), false);
  assert.equal(isValidIsbn13(null), false);
});

test('isValidIsbn13 rejects unknown prefix (must be 978/979)', () => {
  assert.equal(isValidIsbn13('1234567890128'), false);
});

test('isValidIsbn10 accepts valid ISBN-10s including X check digit', () => {
  assert.equal(isValidIsbn10('0306406152'), true);
  assert.equal(isValidIsbn10('097522980X'), true);
});

test('isValidIsbn10 rejects bad check digit', () => {
  assert.equal(isValidIsbn10('0306406151'), false);
});

test('toIsbn13 converts valid ISBN-10 to ISBN-13', () => {
  assert.equal(toIsbn13('0306406152'), '9780306406157');
});

test('toIsbn13 returns the input unchanged when already a valid ISBN-13', () => {
  assert.equal(toIsbn13('9780307949325'), '9780307949325');
});

test('toIsbn13 returns null for invalid input', () => {
  assert.equal(toIsbn13('not an isbn'), null);
  assert.equal(toIsbn13('9780307949322'), null); // bad check digit
});

test('validateAndNormalize end-to-end', () => {
  // ISBN-13 with hyphens
  assert.equal(validateAndNormalize('978-0-307-94932-5'), '9780307949325');
  // ISBN-10 → upgraded
  assert.equal(validateAndNormalize('0-306-40615-2'), '9780306406157');
  // Invalid → null
  assert.equal(validateAndNormalize('9780307949322'), null);
  assert.equal(validateAndNormalize(null), null);
});
