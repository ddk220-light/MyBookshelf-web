export type ShelfItem = { bookKey: string; title: string; faceOut?: boolean; stacked?: boolean };

// Dimensions in rem, including a minimum 44px target at the default text size.
export function spineGeometry(book: ShelfItem) {
  let hash = 0;
  for (const char of book.bookKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { width: book.faceOut ? 8 : book.stacked ? 10 : book.title.length > 30 ? 3.25 : 2.75,
    height: book.faceOut ? 11.75 : book.stacked ? 3.25 : 9 + hash % 49 / 16 };
}

export function layoutShelves<T extends ShelfItem>(books: T[], width: number, scale = 1): T[][] {
  const rows: T[][] = []; let row: T[] = [], used = 0;
  for (const book of books) {
    const size = Math.min(width, spineGeometry(book).width * scale);
    if (row.length && used + .375 + size > width) { rows.push(row); row = []; used = 0; }
    used += (row.length ? .375 : 0) + size; row.push(book);
  }
  if (row.length) rows.push(row);
  return rows;
}

// One-shelf bookcase (plan Phase 4): face-out covers stand three to a bay on
// a phone column. Order is kept; the last bay may be partly empty.
export const BOOKS_PER_BAY = 3;
export function bayRows<T>(items: readonly T[], perBay = BOOKS_PER_BAY): T[][] {
  const size = Math.max(1, Math.floor(perBay));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

// Above this many saved items, bays are added as the reader scrolls instead of
// all at once (rows that are rendered also skip layout off screen).
export const EAGER_SHELF_ITEMS = 200;
export function initialBayCount(itemCount: number, perBay = BOOKS_PER_BAY): number {
  const rows = Math.ceil(itemCount / Math.max(1, perBay));
  return itemCount > EAGER_SHELF_ITEMS ? Math.ceil(EAGER_SHELF_ITEMS / perBay) : rows;
}

// "Viewed before" spines, in CSS pixels: 44–52 wide (never under the 44 px
// target) and 120–132 tall, fixed per book so the row does not shuffle.
export function viewedSpineSize(bookKey: string) {
  let hash = 0;
  for (let i = 0; i < bookKey.length; i += 1) hash = (hash * 31 + bookKey.charCodeAt(i)) >>> 0;
  return { width: 44 + hash % 9, height: 120 + (hash >>> 4) % 13 };
}
