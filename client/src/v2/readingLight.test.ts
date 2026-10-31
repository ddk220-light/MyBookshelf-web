import { beforeEach, describe, expect, it } from 'vitest';
import { READING_LIGHT_STORAGE_KEY, readReadingLight, writeReadingLight } from './readingLight';

describe('reading light preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to daylight', () => {
    expect(readReadingLight()).toBe('daylight');
  });

  it('persists lamplight and reads it back', () => {
    expect(writeReadingLight('lamplight')).toBe(true);
    expect(readReadingLight()).toBe('lamplight');
    expect(localStorage.getItem(READING_LIGHT_STORAGE_KEY)).toBe('lamplight');
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem(READING_LIGHT_STORAGE_KEY, 'neon');
    expect(readReadingLight()).toBe('daylight');
  });

  it('treats unavailable storage as read-only daylight', () => {
    expect(writeReadingLight('lamplight', null)).toBe(false);
    expect(readReadingLight(null)).toBe('daylight');
  });

  it('reports quota/storage failures without throwing', () => {
    const blockedWrite = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); }, removeItem: () => undefined };
    expect(writeReadingLight('lamplight', blockedWrite)).toBe(false);

    const blockedRead = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => undefined, removeItem: () => undefined };
    expect(readReadingLight(blockedRead)).toBe('daylight');
  });
});
