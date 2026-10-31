import { describe, expect, it } from 'vitest';
import { candidatesFor, catalogForCandidates, queryForCandidates, rememberCandidates, mergeCandidatePage, markIncompletePage, pageForCandidates, updateSearchView, viewForCandidates } from './searchMemory';

describe('same-tab search memory', () => {
  it('retains failed page offsets without advancing the cursor or replacing successful books', () => {
    const book = { bookKey: 'v1:openlibrary:OL1W', title: 'First', authors: [] };
    const id = rememberCandidates([book], undefined, 'original query', { nextOffset: 40, libraryId: 'anna' });
    markIncompletePage(id, 40);
    expect(pageForCandidates(id)).toMatchObject({ nextOffset: 40, fetchedThrough: 0, partial: true, incompleteOffsets: [40], libraryId: 'anna' });
    expect(candidatesFor(id)).toEqual([book]);
    mergeCandidatePage(id, 40, { candidates: [book], nextOffset: null });
    expect(pageForCandidates(id)).toMatchObject({ nextOffset: null, partial: false, incompleteOffsets: [] });
  });
  it('retries incomplete earlier pages without losing later results or their cursor', () => {
    const first = { bookKey: 'v1:openlibrary:OL1W', title: 'First', authors: [] };
    const second = { ...first, bookKey: 'v1:openlibrary:OL2W', title: 'Second' };
    const id = rememberCandidates([first], undefined, 'private query', { nextOffset: 40, partial: true, libraryId: 'anna' });
    mergeCandidatePage(id, 40, { candidates: [second], nextOffset: 80, partial: true });
    expect(pageForCandidates(id).incompleteOffsets).toEqual([0, 40]);
    mergeCandidatePage(id, 0, { candidates: [first], nextOffset: 40 });
    expect(pageForCandidates(id)).toMatchObject({ nextOffset: 80, partial: true, incompleteOffsets: [40], libraryId: 'anna' });
    mergeCandidatePage(id, 40, { candidates: [second], nextOffset: 80 });
    expect(candidatesFor(id)).toEqual([first, second]);
    expect(pageForCandidates(id).partial).toBe(false);
    updateSearchView(id, { visibleCount: 15, expandedKeys: [first.bookKey], scrollTop: 640, visited: true });
    expect(viewForCandidates(id)).toMatchObject({ visibleCount: 15, scrollTop: 640 });
    for (let index = 0; index < 20; index++) rememberCandidates([]);
    expect(viewForCandidates(id).visited).toBe(false);
  });
  it('keeps candidate books out of URLs and persistent state', () => {
    const id = rememberCandidates([{ bookKey: 'v1:googlebooks:volume1', title: 'Example', authors: [] }]);
    expect(id).toMatch(/^c[a-z0-9]+$/);
    expect(candidatesFor(id)).toEqual([{ bookKey: 'v1:googlebooks:volume1', title: 'Example', authors: [] }]);
  });
  it('retains the original result scope when the reader changes their selected library', () => {
    const id = rememberCandidates([], { name: 'Chennai catalog', hasMore: true }, 'Tamil book title');
    expect(queryForCandidates(id)).toBe('Tamil book title');
    rememberCandidates([], { name: 'Madurai catalog', hasMore: false });
    expect(catalogForCandidates(id)).toEqual({ name: 'Chennai catalog', hasMore: true });
    for (let index = 0; index < 20; index++) rememberCandidates([]);
    expect(catalogForCandidates(id)).toBeUndefined();
    expect(candidatesFor(id)).toBeNull();
    expect(queryForCandidates(id)).toBe('');
  });
});
