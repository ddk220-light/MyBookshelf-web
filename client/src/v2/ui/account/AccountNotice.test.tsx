import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibraryStateContext, type LibraryState } from '../../context';
import { AccountNotice } from './AccountNotice';

afterEach(() => { cleanup(); });

const offerState = (answerMerge: (add: boolean) => Promise<void>) => ({
  state: { version: 2, selectedLibraryId: null, savedBooks: [], recentBooks: [], savedContent: [] },
  library: null,
  mutationNotice: null,
  mergeResult: { savedAdded: 0 },
  mergeOffer: { count: 2, email: 'someone@example.test' },
  answerMerge,
}) as unknown as LibraryState;

it('asks once on the shelf before adding this browser’s books to an account it did not ask for', async () => {
  const answer = vi.fn(async () => {});
  render(<MemoryRouter initialEntries={['/']}><LibraryStateContext.Provider value={offerState(answer)}><AccountNotice /></LibraryStateContext.Provider></MemoryRouter>);
  expect(screen.getByText('Add the 2 books saved in this browser to someone@example.test?')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Not now' })); });
  expect(answer).toHaveBeenCalledWith(false);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add them' })); });
  expect(answer).toHaveBeenLastCalledWith(true);
});

it('the shelf line leaves the question to Welcome on the Welcome page', () => {
  render(<MemoryRouter initialEntries={['/app/account/welcome']}><LibraryStateContext.Provider value={offerState(async () => {})}><AccountNotice /></LibraryStateContext.Provider></MemoryRouter>);
  expect(screen.queryByText(/books saved in this browser/)).not.toBeInTheDocument();
});
