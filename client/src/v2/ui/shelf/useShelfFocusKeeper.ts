import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const COVER = '.stage-shelf [data-shelf-key]';

/**
 * Keeps keyboard focus on the shelf when the cover that has it is drawn
 * again elsewhere or leaves (shelf suggestions refresh and move): focus goes
 * to the same book's cover (a suggestion just saved, or one moved to another
 * bay), else to the "My shelf" heading, else to the shelf's first cover;
 * never to the page body. `layout` stands for what is drawn: when it changes,
 * a cover that had focus and is gone is replaced.
 */
export function useShelfFocusKeeper(root: RefObject<HTMLElement | null>, layout: string): void {
  const focused = useRef<{ key: string; element: HTMLElement } | null>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const coverOf = (target: EventTarget | null) => {
      const cover = target instanceof Element ? target.closest<HTMLElement>(COVER) : null;
      return cover && node.contains(cover) ? cover : null;
    };
    const focusIn = (event: FocusEvent) => {
      const cover = coverOf(event.target);
      focused.current = cover ? { key: cover.dataset.shelfKey || '', element: cover } : null;
    };
    const focusOut = (event: FocusEvent) => {
      const left = focused.current;
      if (!left) return;
      if (event.relatedTarget) { if (!node.contains(event.relatedTarget as Node)) focused.current = null; return; }
      // Focus went nowhere: the reader left the cover (it is still there),
      // or it was taken off the page, which the layout effect below handles.
      setTimeout(() => { if (focused.current === left && left.element.isConnected) focused.current = null; }, 0);
    };
    node.addEventListener('focusin', focusIn);
    node.addEventListener('focusout', focusOut);
    return () => { node.removeEventListener('focusin', focusIn); node.removeEventListener('focusout', focusOut); };
  }, [root]);
  useLayoutEffect(() => {
    const left = focused.current;
    const node = root.current;
    if (!left || !node || left.element.isConnected) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const covers = [...node.querySelectorAll<HTMLElement>(COVER)];
    const target = covers.find(cover => cover.dataset.shelfKey === left.key) || node.querySelector<HTMLElement>('#my-shelf-heading') || covers[0];
    target?.focus({ preventScroll: true });
  }, [root, layout]);
}
