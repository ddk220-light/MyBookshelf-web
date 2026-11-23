import { expect, it } from 'vitest';
import { safeBookReturn } from './bookNavigation';
it('retains only a local book and supported edition preferences', () => {
  expect(safeBookReturn('/app/books/v1%3Aisbn%3A9788173711466?edition=exact&language=hin&page=library&tracking=extra'))
    .toBe('/app/books/v1%3Aisbn%3A9788173711466?edition=exact&language=hin');
  expect(safeBookReturn('/app/books/v1%3Aisbn%3A9788173711466?edition=other&language=invalid'))
    .toBe('/app/books/v1%3Aisbn%3A9788173711466');
});
it.each(['https://example.com/books/v1:isbn:9788173711466', '//example.com/books/v1:isbn:9788173711466', '/app/books/%E0%A4%A', '/app/books/../settings', '/app/books/invalid'])('rejects an unsafe or malformed book return: %s', path => {
  expect(safeBookReturn(path)).toBeNull();
});
