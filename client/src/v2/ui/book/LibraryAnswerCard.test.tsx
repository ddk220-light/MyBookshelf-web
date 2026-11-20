import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { LibraryAnswerCard } from './LibraryAnswerCard';
import type { CardAnswer, LibraryCardModel } from './useLibraryAnswer';

afterEach(cleanup);

const icon = (answer: CardAnswer) => {
  const { container } = render(<LibraryAnswerCard model={{ kind: 'library', answer, name: 'Anna Centenary Library' }} onFindLibrary={() => {}} />);
  const markup = container.querySelector('.library-answer-icon')?.innerHTML || '';
  cleanup();
  return markup;
};

describe('library answer card', () => {
  // Colour is never the only signal: a library the app cannot check must not
  // show the same mark as "Not found" on a grey card instead of a white one.
  it('draws "couldn’t check" with a different mark from "not found"', () => {
    const notFound = icon('not_found');
    expect(notFound).not.toBe('');
    expect(icon('unsupported')).not.toBe(notFound);
    expect(icon('unknown')).not.toBe(notFound);
    expect(icon('unsupported')).not.toBe(icon('found'));
  });

  const show = (model: Partial<Extract<LibraryCardModel, { kind: 'library' }>> & { answer: CardAnswer }) =>
    render(<LibraryAnswerCard model={{ kind: 'library', name: 'Anna Centenary Library', ...model }} onFindLibrary={() => {}} />);

  // The words of the plan's wording table (A3), exactly.
  it('says Checking, Couldn’t check and unconfirmed in the table’s words', () => {
    show({ answer: 'checking', catalogUrl: 'https://catalog.example.test/' });
    let card = screen.getByRole('group');
    expect(within(card).getByRole('heading')).toHaveTextContent('Checking your library…');
    expect(within(card).getByText('Anna Centenary Library')).toBeInTheDocument();
    expect(within(card).getByText('This library’s catalog can take up to half a minute to answer. You can go back to your reading shelf: the answer will be there when it arrives.')).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveTextContent('Open the library’s catalog instead');
    cleanup();

    show({ answer: 'checking', slowCatalog: true });
    expect(screen.getByText('This library’s catalog can take up to a minute to answer. You can go back to your reading shelf: the answer will be there when it arrives.')).toBeInTheDocument();
    cleanup();

    show({ answer: 'unknown', reason: 'timeout', catalogUrl: 'https://catalog.example.test/', retry: () => {} });
    card = screen.getByRole('group');
    expect(within(card).getByRole('heading')).toHaveTextContent('Couldn’t check right now');
    expect(within(card).getByText('The library’s catalog did not answer in time. This does not mean the book is missing.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveTextContent('Open catalog');
    cleanup();

    show({ answer: 'unconfirmed', catalogUrl: 'https://catalog.example.test/' });
    card = screen.getByRole('group');
    expect(within(card).getByRole('heading')).toHaveTextContent('Couldn’t check right now');
    expect(within(card).getByText('The library’s catalog answered, but we could not tell whether it has this book.')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  // Only a check that ran out of time says the catalog did not answer in time.
  it('says why a check could not answer, in plain words', () => {
    const notMissing = ' This does not mean the book is missing.';
    for (const [reason, words] of [
      ['timeout', 'The library’s catalog did not answer in time.' + notMissing],
      ['blocked', 'This library does not allow outside checks of its catalog.' + notMissing],
      ['unsupported', 'We can’t read this library’s catalog for this book yet.' + notMissing],
      ['unrecognized', 'We can’t read this library’s catalog for this book yet.' + notMissing],
      // Other checks were already waiting for this catalog: never the reader's fault.
      ['busy', 'The library’s catalog is busy with other checks. Try again in a minute.' + notMissing],
      // A reader's check has no request cap: a request cap never explains it.
      ['budget', 'We couldn’t check the library’s catalog this time.' + notMissing],
      ['unavailable', 'The library’s catalog is not answering right now.' + notMissing],
      [undefined, 'We couldn’t check the library’s catalog this time.' + notMissing],
    ] as const) {
      show({ answer: 'unknown', reason });
      const card = screen.getByRole('group');
      expect(within(card).getByRole('heading')).toHaveTextContent('Couldn’t check right now');
      expect(within(card).getByText(words)).toBeInTheDocument();
      if (reason !== 'timeout') expect(within(card).queryByText(/did not answer in time/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/Too many checks/)).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('shows a link-only library without an answer heading or status mark', () => {
    const { container } = show({ answer: 'unsupported', catalogUrl: 'https://catalog.example.test/' });
    const card = screen.getByRole('group', { name: 'This library can’t be checked from here.' });
    expect(within(card).queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('.library-answer-icon')).toBeNull();
    expect(within(card).getByText('This library can’t be checked from here.')).toBeInTheDocument();
    expect(within(card).getByRole('link')).toHaveTextContent('Open the library’s catalog');
  });

  it('labels the catalog link by where it goes: the book’s record only for a record link', () => {
    for (const [kind, words] of [
      ['record', 'See this book in the library’s catalog'],
      ['search', 'Search the library’s catalog for this book'],
      ['catalog', 'Open the library’s catalog'],
      [undefined, 'Open the library’s catalog'],
    ] as const) {
      show({ answer: 'found', catalogUrl: 'https://catalog.example.test/x', catalogLinkKind: kind });
      expect(screen.getByRole('link')).toHaveTextContent(words);
      cleanup();
    }
    show({ answer: 'not_found', catalogUrl: 'https://catalog.example.test/x', catalogLinkKind: 'search' });
    expect(screen.getByRole('link')).toHaveTextContent('Search the library’s catalog yourself');
  });
});
