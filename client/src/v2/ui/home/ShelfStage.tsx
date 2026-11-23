import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMediaQuery } from '../../useMediaQuery';

const SLIDE_MS = 650;

/**
 * The space under the top bar: the reader's shelf, or search results in its
 * place. When a search opens, the saved shelf moves down and out while the
 * results come down from above; closing reverses it (Shelf board). Under
 * reduced motion, or where motion preference is unknown, the swap is instant.
 * The leaving pane is hidden from assistive technology and pointer input
 * while it moves, and removed when the slide ends.
 */
export function ShelfStage({ showResults, shelf, results }: { showResults: boolean; shelf: ReactNode; results: ReactNode }) {
  const motion = useMediaQuery('(prefers-reduced-motion: no-preference)');
  const stage = useRef<HTMLDivElement>(null);
  const [settled, setSettled] = useState(showResults);
  const [slide, setSlide] = useState<{ direction: 'down' | 'up'; run: number } | null>(null);
  const changing = settled !== showResults;

  useLayoutEffect(() => {
    if (!changing) return;
    setSettled(showResults);
    if (!motion || !stage.current) { setSlide(null); return; }
    // Both panes travel the visible height of the stage, so a long shelf
    // leaves at the same pace as the short results arrive.
    const top = stage.current.getBoundingClientRect().top;
    const distance = Math.max(240, Math.round(window.innerHeight - Math.max(0, top)));
    stage.current.style.setProperty('--stage-slide', distance + 'px');
    setSlide(current => ({ direction: showResults ? 'down' : 'up', run: (current?.run || 0) + 1 }));
  }, [changing, showResults, motion]);

  useEffect(() => {
    if (!slide) return;
    const timer = window.setTimeout(() => setSlide(null), SLIDE_MS + 50);
    return () => window.clearTimeout(timer);
  }, [slide]);

  const both = changing || Boolean(slide);
  const sliding = slide ? ' is-sliding slide-' + slide.direction : '';
  return <div ref={stage} className={'shelf-stage' + sliding}>
    {(showResults || both) && <div key="results" className="stage-pane stage-results" aria-hidden={showResults ? undefined : true}>{results}</div>}
    {(!showResults || both) && <div key="shelf" className="stage-pane stage-shelf" aria-hidden={showResults ? true : undefined}>{shelf}</div>}
  </div>;
}
