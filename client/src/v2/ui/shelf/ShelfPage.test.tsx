import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShelfPage } from './ShelfPage';

vi.mock('../../context', () => ({ useLibrary: () => ({
  library: { id: 'fixture', name: 'Fixture library' },
  state: { recentBooks: [], savedBooks: Array.from({ length: 25 }, (_, index) => ({
    bookKey: `v1:openlibrary:OL${index}W`, title: `Saved book ${index + 1}`, authors: index === 0 ? [] : ['Reader'],
    source: 'direct', viewedAt: '2026-10-03T00:00:00Z',
  })) },
  clearRecentBooks: vi.fn(), removeRecentBook: vi.fn(),
}) }));
afterEach(cleanup);

it('keeps every saved book reachable beyond the former twelve-book cap', () => {
  render(<MemoryRouter><ShelfPage /></MemoryRouter>);
  const shelf = screen.getByRole('region', { name: 'Saved books' });
  expect(within(shelf).getAllByRole('link')).toHaveLength(26);
  expect(within(shelf).getByRole('link', { name: 'Saved book 1' })).toHaveTextContent('Saved book 1');
  expect(within(shelf).queryByText(/author unavailable/)).not.toBeInTheDocument();
  expect(within(shelf).getByRole('link', { name: 'Saved book 25' }))
    .toHaveAttribute('href', '/app/books/v1%3Aopenlibrary%3AOL24W');
});
