import { beforeEach, describe, expect, it } from 'vitest';
import { DOG_ANIMATION_STORAGE_KEY, readDogAnimation, writeDogAnimation } from './dogAnimation';

describe('dog animation preference', () => {
  beforeEach(() => localStorage.clear());

  it('requires explicit opt-in, including for existing or corrupt browser state', () => {
    expect(readDogAnimation()).toBe(false);
    for (const value of ['false', 'TRUE', '1', 'enabled', 'null']) {
      localStorage.setItem(DOG_ANIMATION_STORAGE_KEY, value);
      expect(readDogAnimation()).toBe(false);
    }
  });

  it('persists both opt-in and opt-out without touching other preferences', () => {
    localStorage.setItem('mybookshelf.anonymous-web.reading-light', 'lamplight');
    expect(writeDogAnimation(true)).toBe(true);
    expect(readDogAnimation()).toBe(true);
    expect(writeDogAnimation(false)).toBe(true);
    expect(readDogAnimation()).toBe(false);
    expect(localStorage.getItem('mybookshelf.anonymous-web.reading-light')).toBe('lamplight');
  });

  it('stays off when storage is unavailable and handles read/write failures', () => {
    expect(readDogAnimation(null)).toBe(false);
    expect(writeDogAnimation(true, null)).toBe(false);
    const blocked = {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage blocked'); },
      removeItem: () => undefined,
    };
    expect(readDogAnimation(blocked)).toBe(false);
    expect(writeDogAnimation(true, blocked)).toBe(false);
  });
});
