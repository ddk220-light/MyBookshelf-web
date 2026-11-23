import { expect, it } from 'vitest';
import { countOf, formatCount, formatPublishedDate } from './format';

it('writes singular and plural counts with English grouping', () => {
  expect(countOf(1, 'library', 'libraries')).toBe('1 library');
  expect(countOf(0, 'library', 'libraries')).toBe('0 libraries');
  expect(countOf(2, 'library', 'libraries')).toBe('2 libraries');
  expect(countOf(6700, 'library', 'libraries')).toBe('6,700 libraries');
  expect(formatCount(1234567)).toBe('1,234,567');
});

it('formats recognised catalog dates and leaves everything else as supplied', () => {
  expect(formatPublishedDate('2024-12-03')).toBe('3 Dec 2024');
  expect(formatPublishedDate('2024-12')).toBe('Dec 2024');
  expect(formatPublishedDate('1937')).toBe('1937');
  expect(formatPublishedDate('1937?')).toBe('c. 1937');
  expect(formatPublishedDate(' 1999-01-01 ')).toBe('1 Jan 1999');
  // Impossible or partial values never invent a date.
  expect(formatPublishedDate('2024-02-31')).toBe('Feb 2024');
  expect(formatPublishedDate('2024-13-01')).toBe('2024');
  expect(formatPublishedDate('2024-00')).toBe('2024');
  expect(formatPublishedDate('c1998.')).toBe('c1998.');
  expect(formatPublishedDate('Spring 2001')).toBe('Spring 2001');
});
