import { Component, type RefObject } from 'react';
import type { LayoutMode } from './layoutMode';

/**
 * Where the reader is on the shelf: the first book cover or heading still in
 * view, and how far below the top of the scrolling area it stands.
 */
export type ShelfPlace = { selector: string; offset: number };

// What a place is kept by: a book cover (by its shelf key) or a heading with an id.
const ANCHORS = '[data-shelf-key], h1[id], h2[id]';

/**
 * The element the shelf scrolls in: the screen itself on phones (as
 * released), the shelf's own area at rail and wide widths.
 */
export function shelfScroller(root: HTMLElement | null, mode: LayoutMode): HTMLElement | null {
  return root?.querySelector<HTMLElement>(mode === 'phone' ? 'main' : '.desk-shelf') || null;
}

// The top of what the reader sees: under the top bar, which stays at the top
// while the shelf scrolls (except on the cold open).
function visibleTop(scroller: HTMLElement): number {
  const top = scroller.getBoundingClientRect().top;
  const bar = scroller.querySelector<HTMLElement>('.home-top');
  return bar && getComputedStyle(bar).position === 'sticky' ? Math.max(top, bar.getBoundingClientRect().bottom) : top;
}

export function readShelfPlace(scroller: HTMLElement | null): ShelfPlace | null {
  if (!scroller || scroller.scrollTop < 1) return null;
  const top = visibleTop(scroller);
  for (const element of scroller.querySelectorAll<HTMLElement>(ANCHORS)) {
    const box = element.getBoundingClientRect();
    if (box.height <= 0 || box.bottom <= top) continue;
    const key = element.dataset.shelfKey;
    const selector = key !== undefined ? `[data-shelf-key="${CSS.escape(key)}"]` : '#' + CSS.escape(element.id);
    return { selector, offset: box.top - top };
  }
  return null;
}

export function restoreShelfPlace(scroller: HTMLElement | null, place: ShelfPlace): void {
  const element = scroller?.querySelector<HTMLElement>(place.selector);
  if (!scroller || !element) return;
  scroller.scrollTop += element.getBoundingClientRect().top - visibleTop(scroller) - place.offset;
}

/**
 * Keeps the reader's place on the shelf when the layout changes under it (the
 * window crosses 640 or 1100 px): the shelf stays drawn, but it scrolls in a
 * different element and its bays hold a different number of books. The place
 * is read just before the change is drawn and put back at the next frame,
 * once the bays have been measured again; nothing moves smoothly, so there is
 * no motion to reduce.
 */
export class ShelfPlaceKeeper extends Component<{ mode: LayoutMode; root: RefObject<HTMLElement | null> }> {
  private frame = 0;
  private restored: { scroller: HTMLElement; scrollTop: number; place: ShelfPlace } | null = null;

  getSnapshotBeforeUpdate(previous: Readonly<{ mode: LayoutMode }>): ShelfPlace | null {
    if (previous.mode === this.props.mode) return null;
    const scroller = shelfScroller(this.props.root.current, previous.mode);
    // On a wider bay the anchor might no longer be the first book in its
    // row. A second resize keeps the same anchor until the reader scrolls.
    const last = this.restored;
    if (scroller && last?.scroller === scroller && Math.abs(scroller.scrollTop - last.scrollTop) <= 8) {
      const book = scroller.querySelector<HTMLElement>(last.place.selector);
      if (book) return { selector: last.place.selector, offset: book.getBoundingClientRect().top - visibleTop(scroller) };
    }
    return readShelfPlace(scroller);
  }

  componentDidUpdate(_previous: unknown, _state: unknown, place: ShelfPlace | null): void {
    if (!place) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const scroller = shelfScroller(this.props.root.current, this.props.mode);
      restoreShelfPlace(scroller, place);
      this.restored = scroller ? { scroller, scrollTop: scroller.scrollTop, place } : null;
      // A focused search field can scroll again as WebKit lays out the
      // new sticky header. Restore after that layout as well.
      if (scroller) this.frame = requestAnimationFrame(() => {
        restoreShelfPlace(scroller, place);
        this.restored = { scroller, scrollTop: scroller.scrollTop, place };
      });
    });
  }

  componentWillUnmount(): void {
    cancelAnimationFrame(this.frame);
  }

  render() {
    return null;
  }
}
