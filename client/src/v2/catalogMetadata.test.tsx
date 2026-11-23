import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mergeCatalogMetadata, useCatalogMetadata } from './catalogMetadata';
import { publicApi } from './api';
import { Cover } from './ui/BookCard';
import type { PublicBook } from './types';

vi.mock('./api', () => ({ publicApi: { enrichBook: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const book: PublicBook = { bookKey: 'v1:catalog:koha:anna-centenary-library:497990', title: 'Wings of Fire', authors: ['Kalam'], isbn13: '9788173711466' };
function Result({ value }: { value: PublicBook }) {
  const enriched = useCatalogMetadata(value)!;
  return <div><span>{enriched.title}</span><span>{enriched.description}</span><Cover book={enriched} /></div>;
}

it('shares a single optional metadata request without delaying the catalog title', async () => {
  let finish!: (value: PublicBook) => void;
  vi.mocked(publicApi.enrichBook).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<><Result value={book} /><Result value={book} /></>);
  expect(screen.getAllByText(book.title)).toHaveLength(2);
  expect(publicApi.enrichBook).toHaveBeenCalledTimes(1);
  finish({ ...book, description: 'An autobiography.', coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg' });
  await waitFor(() => expect(screen.getAllByText('An autobiography.')).toHaveLength(2));
  expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', 'https://covers.openlibrary.org/b/id/123-M.jpg');
});

it('ignores late metadata from a different selected record and keeps catalog identity intact', () => {
  expect(mergeCatalogMetadata(book, { ...book, bookKey: 'other', description: 'Wrong book' })).toBe(book);
  expect(mergeCatalogMetadata(book, { ...book, isbn13: '9780545349260', description: 'Wrong edition' })).toBe(book);
  const result = mergeCatalogMetadata(book, { ...book, title: 'Other title', authors: ['Other author'], description: 'Book details' });
  expect(result.title).toBe(book.title);
  expect(result.authors).toEqual(book.authors);
  expect(result.description).toBe('Book details');
});

it('falls back to another catalog record cover in a group and then a clean placeholder', () => {
  const alternate = { ...book, isbn13: undefined, coverUrl: 'https://covers.openlibrary.org/b/id/2-M.jpg' };
  render(<Cover book={{ title: book.title, coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg' }} alternatives={[alternate]} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img')).toHaveAttribute('src', alternate.coverUrl);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
