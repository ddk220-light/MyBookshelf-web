import { describe, expect, it } from 'vitest';
import { candidatesFor, clearSearchMemory, queryForCandidates, rememberCandidates, rememberShelfMatches, shelfMatchesFor } from './searchMemory';

describe('same-tab search memory', () => {
  it('keeps candidate books out of URLs and persistent state, under an opaque ID', () => {
    const id = rememberCandidates([{ bookKey: 'v1:googlebooks:volume1', title: 'Example', authors: [] }]);
    expect(id).toMatch(/^c[a-z0-9]+$/);
    expect(candidatesFor(id)).toEqual([{ bookKey: 'v1:googlebooks:volume1', title: 'Example', authors: [] }]);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it('keeps the text and shelf matches with their results, and forgets the oldest of twenty', () => {
    const id = rememberCandidates([], 'Tamil book title');
    rememberShelfMatches(id, ['v1:openlibrary:OL1W']);
    expect(queryForCandidates(id)).toBe('Tamil book title');
    expect(shelfMatchesFor(id)).toEqual(['v1:openlibrary:OL1W']);
    for (let index = 0; index < 20; index++) rememberCandidates([]);
    expect(candidatesFor(id)).toBeNull();
    expect(queryForCandidates(id)).toBe('');
    expect(shelfMatchesFor(id)).toEqual([]);
  });
  it('clears everything at once (an account change)', () => {
    const id = rememberCandidates([], 'private query');
    clearSearchMemory();
    expect(candidatesFor(id)).toBeNull();
    expect(queryForCandidates(id)).toBe('');
  });
});
