import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Cover } from './BookCard';

afterEach(cleanup);

it('distinguishes a pending cover from an unavailable one and handles a successful image', () => {
  const view = render(<Cover book={{ title: 'Wings of Fire', coverUrl: 'https://covers.example.test/first.jpg' }} />);
  expect(view.container.querySelector('[data-cover="loading"]')).toBeInTheDocument();
  const image = screen.getByRole('img');
  Object.defineProperty(image, 'naturalWidth', { value: 200 });
  fireEvent.load(image);
  expect(view.container.querySelector('[data-cover="ready"]')).toBeInTheDocument();
  expect(screen.queryByText('Loading cover')).toBeNull();
  view.rerender(<Cover book={{ title: 'Wings of Fire', coverUrl: 'https://covers.example.test/second.jpg' }} />);
  expect(view.container.querySelector('[data-cover="loading"]')).toBeInTheDocument();
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByText('No cover')).toBeInTheDocument();
});

it('retains a failed cover placeholder across book updates and tries a different cover', () => {
  const book = { title: 'A book', coverUrl: 'https://covers.example.test/missing.jpg' };
  const view = render(<Cover book={book} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(view.container.querySelector('.cover-placeholder')).toBeInTheDocument();
  view.rerender(<Cover book={{ ...book, title: 'A revised title' }} />);
  expect(screen.queryByRole('img')).toBeNull();
  view.rerender(<Cover book={{ ...book, coverUrl: 'https://covers.example.test/new.jpg' }} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://covers.example.test/new.jpg');
  fireEvent.error(screen.getByRole('img'));
  expect(view.container.querySelector('.cover-placeholder')).toBeInTheDocument();
});
