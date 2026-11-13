import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LibraryAnswerCard } from './LibraryAnswerCard';
import type { CardAnswer } from './useLibraryAnswer';

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
    expect(icon('unsupported')).not.toBe(icon('unconfirmed'));
    expect(icon('unsupported')).not.toBe(icon('found'));
  });
});
