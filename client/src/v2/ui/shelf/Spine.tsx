import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookLink } from '../book/BookLink';
import type { RecentBook } from '../../types';
import { spinePalette } from './spineColors';
import { uiMessages as m } from '../../uiMessages';
import { Cover } from '../BookCard';
import { layoutShelves, spineGeometry } from './shelfLayout';

export function Spine({ book, faceOut = false, stacked = false, scale = 1 }: { book: RecentBook; faceOut?: boolean; stacked?: boolean; scale?: number }) {
  const palette = spinePalette(book.bookKey);
  const author = book.authors.join(', ');
  const label = author ? `${book.title} ${m.byAuthor(author)}` : book.title;
  const geometry = spineGeometry({ ...book, faceOut, stacked });
  const tipId = useId();
  const [tip, setTip] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const close = () => { clearTimeout(closeTimer.current); setTip(null); };
  const open = (element: HTMLElement) => {
    clearTimeout(closeTimer.current);
    const rect = element.getBoundingClientRect();
    setTip({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)), top: rect.top > 160 ? rect.top - 8 : rect.bottom + 8, above: rect.top > 160 });
  };
  useEffect(() => {
    if (!tip) return;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { clearTimeout(closeTimer.current); document.removeEventListener('keydown', escape); document.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [tip]);
  return <><BookLink className={`spine${faceOut ? ' face-out' : ''}${stacked ? ' stacked' : ''}${book.title.length > 30 ? ' wide-spine' : ''}`}
    to={`/app/books/${encodeURIComponent(book.bookKey)}?page=cover`} state={{ from: 'shelf', book }}
    aria-label={label} aria-describedby={tip ? tipId : undefined}
    onFocus={event => open(event.currentTarget)} onBlur={close}
    onPointerEnter={event => { if (event.pointerType !== 'touch') open(event.currentTarget); }}
    onPointerLeave={event => { if (document.activeElement !== event.currentTarget) closeTimer.current = setTimeout(close, 120); }}
    style={{ background: `linear-gradient(to bottom, ${palette.top}, ${palette.bottom})`, color: palette.ink, width: `${geometry.width * scale}rem`, height: `${geometry.height * scale}rem` }}>
    {faceOut ? <Cover book={book} fallback={<span className="typeset-cover"><strong>{book.title}</strong>{author && <small>{author}</small>}</span>} />
      : <><span className="spine-title">{book.title}</span>{author && <span className="visually-hidden spine-author">{m.byAuthor(author)}</span>}</>}
  </BookLink>{tip && createPortal(<span className="spine-tooltip" id={tipId} role="tooltip" style={{ left: tip.left, top: tip.top, transform: tip.above ? 'translateY(-100%)' : undefined }}
    onPointerEnter={() => clearTimeout(closeTimer.current)} onPointerLeave={close}><strong>{book.title}</strong>{author && <small>{author}</small>}</span>, document.body)}</>;
}

export function BookcaseRows({ books, label, saved = false }: { books: RecentBook[]; label: string; saved?: boolean }) {
  const element = useRef<HTMLUListElement>(null);
  const [width, setWidth] = useState(18);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = element.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const available = Math.max(2, (el.clientWidth - 24) / parseFloat(getComputedStyle(document.documentElement).fontSize));
      setWidth(available); setScale(window.innerWidth >= 1024 && available >= 28 ? 1.2 : 1);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const items = saved
    ? books.map((book, index) => ({ ...book, faceOut: index === 0, stacked: false, entries: [book] }))
    : books.map(book => ({ ...book, faceOut: false, stacked: false, entries: [book] }));
  // Two recent reads share one horizontal stack; the remaining books stand upright.
  if (!saved && books.length) items.splice(0, Math.min(2, books.length), { ...items[0], stacked: true, entries: books.slice(0, 2) });
  return <ul className="bookcase-rows" ref={element} aria-label={label}>
    {layoutShelves(items, width, scale).map((row, index) => <li className="bookcase-row" key={row[0].bookKey}>
      <ul className="shelf-books" aria-label={`Row ${index + 1}`}>{row.map(item => <li key={item.bookKey}><div className={item.stacked ? 'book-stack' : undefined}>{item.entries.map(book => <Spine key={book.bookKey} book={book} faceOut={item.faceOut} stacked={item.stacked} scale={scale} />)}</div></li>)}</ul>
      <div className="plank" aria-hidden="true" />
    </li>)}
  </ul>;
}
