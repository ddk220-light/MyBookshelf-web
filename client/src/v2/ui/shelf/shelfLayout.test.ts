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

import { bayRows, initialBayCount, viewedSpineSize, EAGER_SHELF_ITEMS } from './shelfLayout';
it('stands books three to a bay in order, the last bay partly empty', () => {
  const items = Array.from({ length: 8 }, (_, index) => index);
  expect(bayRows(items)).toEqual([[0, 1, 2], [3, 4, 5], [6, 7]]);
  expect(bayRows([])).toEqual([]);
  expect(bayRows(items, 0).flat()).toEqual(items);
});
it('renders every bay up to 200 books, then adds bays on demand', () => {
  expect(initialBayCount(8)).toBe(3);
  expect(initialBayCount(EAGER_SHELF_ITEMS)).toBe(67);
  expect(initialBayCount(1000)).toBe(67);
});
it('keeps viewed spines at least 44 px wide and stable per book', () => {
  for (let index = 0; index < 200; index += 1) {
    const size = viewedSpineSize('v1:openlibrary:OL' + index + 'W');
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeLessThanOrEqual(52);
    expect(size.height).toBeGreaterThanOrEqual(120);
    expect(size.height).toBeLessThanOrEqual(132);
  }
  expect(viewedSpineSize('stable')).toEqual(viewedSpineSize('stable'));
});
