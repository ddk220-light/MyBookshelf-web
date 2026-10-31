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
