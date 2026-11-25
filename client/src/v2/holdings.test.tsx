import { describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { createHoldingsStore, HoldingsProvider, useHoldingsAnswer, useHoldingsStore, type HoldingsStore } from './holdings';

afterEach(cleanup);

describe('holdings store', () => {
  it('keeps answers for the chosen library only', () => {
    const store = createHoldingsStore('lib:a');
    store.set('lib:a', { 'v1:isbn:1': 'found', 'v1:isbn:2': 'not_found' });
    store.set('lib:b', { 'v1:isbn:3': 'found' });
    expect(store.get('v1:isbn:1')).toBe('found');
    expect(store.get('v1:isbn:2')).toBe('not_found');
    expect(store.get('v1:isbn:3')).toBeUndefined();
  });

  it('clears every answer when the library changes', () => {
    const store = createHoldingsStore('lib:a');
    store.set('lib:a', { 'v1:isbn:1': 'found' });
    store.setLibrary('lib:b');
    expect(store.get('v1:isbn:1')).toBeUndefined();
    store.setLibrary('lib:a');
    expect(store.get('v1:isbn:1')).toBeUndefined();
    store.setLibrary(null);
    store.set('lib:a', { 'v1:isbn:1': 'found' });
    expect(store.get('v1:isbn:1')).toBeUndefined();
  });

  it('ignores unknown answers and notifies only on change', () => {
    const store = createHoldingsStore('lib:a');
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.set('lib:a', { 'v1:isbn:1': 'checking' });
    store.set('lib:a', { 'v1:isbn:1': 'checking' });
    store.set('lib:a', { 'v1:isbn:2': 'maybe' as never });
    expect(calls).toBe(1);
    expect(store.get('v1:isbn:2')).toBeUndefined();
    store.clear();
    expect(calls).toBe(2);
  });

  it('never lets an unconfirmed or failed check replace a proven answer', () => {
    const store = createHoldingsStore('lib:a');
    store.set('lib:a', { 'v1:isbn:1': 'found', 'v1:isbn:2': 'not_found' }, { 'v1:isbn:1': 'https://catalog.example.test/record/1' });
    store.set('lib:a', { 'v1:isbn:1': 'unconfirmed', 'v1:isbn:2': 'unconfirmed' });
    store.set('lib:a', { 'v1:isbn:1': 'unknown', 'v1:isbn:2': 'unknown' });
    expect(store.get('v1:isbn:1')).toBe('found');
    expect(store.recordUrl('v1:isbn:1')).toBe('https://catalog.example.test/record/1');
    expect(store.get('v1:isbn:2')).toBe('not_found');
    store.set('lib:a', { 'v1:isbn:3': 'unconfirmed' });
    expect(store.get('v1:isbn:3')).toBe('unconfirmed');
  });

  it('a find, its record link and its rows are never taken away, and a not-found answer can still become found', () => {
    const store = createHoldingsStore('lib:a');
    const rows = [{ title: 'Wings of fire', url: 'https://catalog.example.test/record/1' }];
    store.set('lib:a', { 'v1:isbn:1': 'found', 'v1:isbn:2': 'not_found' }, { 'v1:isbn:1': rows[0].url }, { 'v1:isbn:1': rows, 'v1:isbn:2': rows });
    store.set('lib:a', { 'v1:isbn:1': 'not_found' });
    expect([store.get('v1:isbn:1'), store.recordUrl('v1:isbn:1'), store.matches('v1:isbn:1')]).toEqual(['found', rows[0].url, rows]);
    expect(store.matches('v1:isbn:2')).toBeUndefined();
    store.set('lib:a', { 'v1:isbn:2': 'found' });
    expect(store.get('v1:isbn:2')).toBe('found');
  });

  it('keeps the catalog’s rows of a find in memory, for the chosen library only; an answer without rows leaves them', () => {
    const store = createHoldingsStore('lib:a');
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    const key = 'v1:isbn:1', rows = [{ title: 'One' }], better = [{ title: 'Two' }];
    store.set('lib:a', { [key]: 'found' });
    expect(store.matches(key)).toBeUndefined();
    // Asked, and the answer had none (a stored one).
    store.set('lib:a', { [key]: 'found' }, undefined, { [key]: [] });
    expect(store.matches(key)).toEqual([]);
    store.set('lib:a', { [key]: 'found' }, undefined, { [key]: rows });
    expect(calls).toBe(3);
    store.set('lib:a', { [key]: 'found' }, undefined, { [key]: [] });
    expect([store.matches(key), calls]).toEqual([rows, 3]);
    store.set('lib:a', { [key]: 'found' }, undefined, { [key]: better });
    expect(store.matches(key)).toBe(better);
    store.setLibrary('lib:b');
    expect(store.matches(key)).toBeUndefined();
    store.set('lib:a', { [key]: 'found' }, undefined, { [key]: rows });
    store.setLibrary('lib:a');
    expect(store.matches(key)).toBeUndefined();
  });
});

describe('HoldingsProvider', () => {
  it('re-renders readers and clears on library change', () => {
    let store!: HoldingsStore;
    function Answer() { store = useHoldingsStore(); return <p>{useHoldingsAnswer('v1:isbn:1') || 'none'}</p>; }
    const view = render(<HoldingsProvider libraryId="lib:a"><Answer /></HoldingsProvider>);
    expect(screen.getByText('none')).toBeInTheDocument();
    act(() => store.set('lib:a', { 'v1:isbn:1': 'found' }));
    expect(screen.getByText('found')).toBeInTheDocument();
    view.rerender(<HoldingsProvider libraryId="lib:b"><Answer /></HoldingsProvider>);
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});
