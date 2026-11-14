import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useShelfFocusKeeper } from './useShelfFocusKeeper';

// A shelf with saved books, then suggestions in their own list (as bays are).
function Shelf({ saved, suggested, heading = true }: { saved: string[]; suggested: string[]; heading?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useShelfFocusKeeper(root, [...saved, '|', ...suggested].join('\n'));
  const cover = (key: string) => <li key={key}><a href={'#' + key} data-shelf-key={key}>{key}</a></li>;
  return <div ref={root}>
    <button type="button">Elsewhere</button>
    <div className="stage-shelf">
      {heading && <h1 id="my-shelf-heading" tabIndex={-1}>My shelf</h1>}
      <ul>{saved.map(cover)}</ul>
      <ul>{suggested.map(cover)}</ul>
    </div>
  </div>;
}
const link = (name: string) => screen.getByRole('link', { name });

afterEach(cleanup);

describe('keeping focus on the shelf when suggestions change', () => {
  it('a focused suggestion just saved: focus follows it to its saved cover', () => {
    const view = render(<Shelf saved={['a']} suggested={['s1', 's2']} />);
    act(() => link('s1').focus());
    view.rerender(<Shelf saved={['s1', 'a']} suggested={['s2', 's3']} />);
    expect(link('s1')).toHaveFocus();
  });

  it('a focused suggestion replaced by another book: focus goes to the shelf heading, never the page body', () => {
    const view = render(<Shelf saved={['a']} suggested={['s1', 's2']} />);
    act(() => link('s2').focus());
    view.rerender(<Shelf saved={['a']} suggested={['s1', 's9']} />);
    expect(screen.getByRole('heading', { name: 'My shelf' })).toHaveFocus();
    // Without a heading (the cold open): the shelf's first cover.
    const cold = render(<Shelf saved={[]} suggested={['t1', 't2']} heading={false} />);
    act(() => link('t2').focus());
    cold.rerender(<Shelf saved={[]} suggested={['t1', 't3']} heading={false} />);
    expect(link('t1')).toHaveFocus();
  });

  it('focus the reader moved elsewhere is left alone', async () => {
    const view = render(<Shelf saved={['a']} suggested={['s1', 's2']} />);
    act(() => link('s2').focus());
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());
    view.rerender(<Shelf saved={['a']} suggested={['s1', 's9']} />);
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    // Left to nowhere (a click on the page): not taken back later either.
    act(() => link('s1').focus());
    await act(async () => { link('s1').blur(); await new Promise(resolve => setTimeout(resolve, 0)); });
    view.rerender(<Shelf saved={['a']} suggested={['s8', 's9']} />);
    expect(document.activeElement).toBe(document.body);
  });
});
