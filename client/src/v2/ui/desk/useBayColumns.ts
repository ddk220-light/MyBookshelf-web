import { useLayoutEffect, useRef, useState } from 'react';
import { BOOKS_PER_BAY } from '../shelf/shelfLayout';
import type { LayoutMode } from './layoutMode';

/** Books per bay at wide widths (DeskShelf board). */
export const WIDE_BOOKS_PER_BAY = 6;
// Rail widths: covers are 104 px with 20 px between them (desk.css).
const RAIL_COVER = 104;
const RAIL_GAP = 20;

/** As many rail covers as fit in `width`, from three up to six. */
export function railColumns(width: number): number {
  const fit = Math.floor((width + RAIL_GAP) / (RAIL_COVER + RAIL_GAP));
  return Math.max(BOOKS_PER_BAY, Math.min(WIDE_BOOKS_PER_BAY, Number.isFinite(fit) ? fit : BOOKS_PER_BAY));
}

/**
 * Books per bay: three on phones, six at wide widths and, on the rail, as
 * many as the home column holds (measured, and again when it is resized).
 * `ref` goes on the home column.
 */
export function useBayColumns(layout: LayoutMode) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(4);
  useLayoutEffect(() => {
    const node = ref.current;
    if (layout !== 'rail' || !node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const width = node.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (width > 0) setMeasured(railColumns(width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [layout]);
  return { ref, perBay: layout === 'wide' ? WIDE_BOOKS_PER_BAY : layout === 'rail' ? measured : BOOKS_PER_BAY };
}
