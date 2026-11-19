import { useId, useLayoutEffect, useRef } from 'react';
import { PlusGlyph, TickGlyph } from '../home/homeIcons';

export function SaveButton({ saved, busy, full, popTick, onToggle }: { saved: boolean; busy: boolean; full: boolean; popTick: boolean; onToggle: () => void }) {
  const reason = useId();
  const nextFocus = useRef<'saved' | 'add' | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (busy || !nextFocus.current) return;
    (saved && nextFocus.current === 'saved' ? status.current : add.current)?.focus();
    nextFocus.current = null;
  }, [busy, saved]);
  if (saved) return <div className="book-saved-actions">
    <p ref={status} tabIndex={-1} className="book-saved-status"><span className={'save-tick' + (popTick ? ' tick-pop' : '')}><TickGlyph /></span>On my reading shelf</p>
    <button type="button" className="home-text-button" disabled={busy} onClick={event => { if (event.detail === 0) nextFocus.current = 'add'; onToggle(); }}>Remove from my reading shelf</button>
  </div>;
  return <>
    <button ref={add} type="button" className="home-button save-button" aria-busy={busy || undefined}
      disabled={full || busy} aria-describedby={full ? reason : undefined} onClick={event => { if (event.detail === 0) nextFocus.current = 'saved'; onToggle(); }}>
      <PlusGlyph />Add to my reading shelf
    </button>
    {full && <span id={reason} className="visually-hidden">Shelf full</span>}
  </>;
}
