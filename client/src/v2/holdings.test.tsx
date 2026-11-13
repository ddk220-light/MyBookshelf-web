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
