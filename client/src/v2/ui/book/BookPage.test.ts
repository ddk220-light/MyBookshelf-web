import { expect, it } from 'vitest';
import type { Availability, PublicBook } from '../../types';
import { withCatalogTitle } from '../book/BookPage';

const book: PublicBook = { bookKey: 'v1:isbn:9788123413419', isbn13: '9788123413419', title: 'ISBN 9788123413419', authors: [], metadataStatus: 'missing' };
const observation: Availability = { outcome: 'available', matchKind: 'exact_isbn', lookupKind: 'exact_isbn', freshness: 'fresh', attemptedAt: '2026-10-27T00:00:00Z', catalogTitle: 'பரமார்த்த குரு கதைகள்' };

it('uses a verified catalog title when public metadata is missing without changing the edition key', () => {
  expect(withCatalogTitle(book, observation)).toEqual({ ...book, title: observation.catalogTitle });
  expect(withCatalogTitle({ ...book, metadataStatus: 'unavailable' }, observation).title).toBe(observation.catalogTitle);
});

it('does not overwrite known metadata or use stale, ambiguous or absent catalog titles', () => {
  const enriched = { ...book, title: 'Known title', metadataStatus: undefined };
  expect(withCatalogTitle(enriched, observation)).toBe(enriched);
  for (const change of [{ freshness: 'stale' }, { freshness: 'none' }, { matchKind: 'possible_match' }, { catalogTitle: '' }] as Partial<Availability>[]) {
    expect(withCatalogTitle(book, { ...observation, ...change })).toBe(book);
  }
  expect(withCatalogTitle(book, null)).toBe(book);
});
