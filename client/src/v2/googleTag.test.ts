import { describe, expect, it, vi } from 'vitest';
import { openedFrom, outcomeOf, trackEvent } from './googleTag';

describe('key events for the Google tag', () => {
  it('goes to the tag, and nowhere without it', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });
    trackEvent('barcode_scan', { step: 'opened' });
    expect(gtag.mock.calls).toEqual([['event', 'barcode_scan', { step: 'opened' }]]);
    vi.stubGlobal('window', {});
    expect(() => trackEvent('problem_report')).not.toThrow();
    vi.unstubAllGlobals();
  });
  it('how a book page was opened', () => {
    for (const [navigation, source] of [
      [null, 'link'], [{ from: 'shelf', source: 'direct' }, 'shelf'], [{ from: 'shelf', source: 'direct', suggested: true }, 'suggestion'], [{ from: 'shelf', source: 'direct', viewed: true }, 'viewed'],
      [{ from: 'search', source: 'search' }, 'search'], [{ from: 'shelf', source: 'isbn' }, 'search'], [{ from: 'shelf', source: 'search' }, 'search'], [{ from: 'shelf', source: 'camera' }, 'scan'], [{ overlay: 'library' }, 'other'],
    ] as Array<[any, string]>) expect(openedFrom(navigation)).toBe(source);
  });
  it('a library’s answer: anything but found and not found is "unknown"', () => {
    expect(['found', 'not_found', 'unconfirmed', 'unknown'].map(outcomeOf)).toEqual(['found', 'not_found', 'unknown', 'unknown']);
  });
});
