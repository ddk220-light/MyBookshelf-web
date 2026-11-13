import { useId } from 'react';
import { PlusGlyph, TickGlyph } from '../home/homeIcons';

/**
 * "Add to my shelf" ↔ "On my shelf" (BookChecked board). A tap adds or
 * removes at once, with no confirmation; the tick pops in after an add
 * (not under reduced motion). At the guest cap the button is disabled with
 * "Shelf full" as its accessible reason (plan section 9, row 32).
 */
export function SaveButton({ saved, busy, full, popTick, onToggle }: { saved: boolean; busy: boolean; full: boolean; popTick: boolean; onToggle: () => void }) {
  const reason = useId();
  const blocked = !saved && full;
  return <>
    <button type="button" className={'home-button save-button' + (saved ? ' is-saved' : '')} aria-pressed={saved} aria-busy={busy || undefined}
      disabled={blocked} aria-describedby={blocked ? reason : undefined} onClick={() => { if (!busy) onToggle(); }}>
      {saved ? <span className={'save-tick' + (popTick ? ' tick-pop' : '')}><TickGlyph /></span> : <PlusGlyph />}
      {saved ? 'On my shelf' : 'Add to my shelf'}
    </button>
    {blocked && <span id={reason} className="visually-hidden">Shelf full</span>}
  </>;
}
