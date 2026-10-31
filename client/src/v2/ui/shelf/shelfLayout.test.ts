import { expect, it } from 'vitest';
import { layoutShelves, spineGeometry } from './shelfLayout';

it('keeps every book in order on narrow, wide and zoomed shelves', () => {
  const books = Array.from({ length: 100 }, (_, index) => ({ bookKey: String(index), title: `A very long title for book ${index}`, faceOut: index === 0 }));
  for (const width of [7, 12, 18, 60]) for (const scale of [1, 1.2]) {
    const rows = layoutShelves(books, width, scale);
    expect(rows.flat()).toEqual(books);
    for (const row of rows) expect(row.reduce((size, book) => size + Math.min(width, spineGeometry(book).width * scale), (row.length - 1) * .375)).toBeLessThanOrEqual(width);
  }
});
it('keeps deterministic geometry and fills a row without dropping an oversize book', () => {
  const book = { bookKey: 'stable', title: 'A book', faceOut: true };
  expect(spineGeometry(book)).toEqual(spineGeometry({ ...book }));
  expect(layoutShelves([book], 2)).toEqual([[book]]);
  expect(layoutShelves([], 20)).toEqual([]);
});
