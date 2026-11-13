import { ListViewGlyph, ShelfViewGlyph } from '../home/homeIcons';

export type ShelfView = 'shelf' | 'list';

export function ViewSwitch({ view, onChange }: { view: ShelfView; onChange: (view: ShelfView) => void }) {
  return <div className="view-toggle" role="group" aria-label="View">
    <button type="button" aria-label="Shelf view" aria-pressed={view === 'shelf'} onClick={() => onChange('shelf')}><ShelfViewGlyph /></button>
    <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => onChange('list')}><ListViewGlyph /></button>
  </div>;
}
