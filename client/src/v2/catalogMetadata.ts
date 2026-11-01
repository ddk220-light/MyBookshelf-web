import { useEffect, useMemo, useState } from 'react';
import { publicApi } from './api';
import type { PublicBook } from './types';

const requests = new Map<string, { expires: number; promise: Promise<PublicBook | null> }>();
export function clearCatalogMetadata():void { requests.clear(); }

export function mergeCatalogMetadata(book: PublicBook, extra: PublicBook | null): PublicBook {
  if (!extra || extra.bookKey !== book.bookKey || extra.isbn13 !== book.isbn13) return book;
  const result = { ...book };
  if (extra.coverUrl) result.coverUrl = extra.coverUrl;
  for (const field of ['description', 'pageCount', 'subjects', 'publisher', 'publishedDate'] as const) {
    if (book[field] == null && extra[field] != null) Object.assign(result, { [field]: extra[field] });
  }
  return result;
}

export function useCatalogMetadata(book: PublicBook | null): PublicBook | null {
  const [extra, setExtra] = useState<PublicBook | null>(null);
  const key = book?.bookKey, isbn = book?.isbn13;
  useEffect(() => {
    if (!key?.startsWith('v1:catalog:') || !isbn) return;
    let active = true;
    const cacheKey = `${key}:${isbn}`;
    let cached = requests.get(cacheKey);
    if (!cached || cached.expires < Date.now()) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const entry = { expires: Date.now() + 10 * 60_000, promise: Promise.resolve(null) as Promise<PublicBook | null> };
      entry.promise = publicApi.enrichBook(key, controller.signal).catch(() => {
        entry.expires = Date.now() + 60_000;
        return null;
      }).finally(() => clearTimeout(timer));
      requests.set(cacheKey, entry);
      if (requests.size > 100) requests.delete(requests.keys().next().value!);
      cached = entry;
    }
    void cached.promise.then(result => { if (active) setExtra(result); });
    return () => { active = false; };
  }, [key, isbn]);
  return useMemo(() => book ? mergeCatalogMetadata(book, extra) : null, [book, extra]);
}
