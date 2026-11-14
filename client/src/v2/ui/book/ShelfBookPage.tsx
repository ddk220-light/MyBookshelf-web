import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { publicApi } from '../../api';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import type { BookNavigation } from '../../bookNavigation';
import { useCatalogMetadata } from '../../catalogMetadata';
import { goodreadsUrl, messageFor, sourceFromLocation, useLibrary } from '../../context';
import { SAVED_BOOKS_CAP } from '../../localState';
import { findSavedBook } from '../../oneShelfState';
import { reportSuggestion } from '../../suggestions/serverSource';
import type { PublicBook } from '../../types';
import { useCoverImage } from '../BookCard';
import { useDeskSlot } from '../desk/layoutMode';
import { BackGlyph, ExternalGlyph } from '../home/homeIcons';
import { SlotClose } from '../panel/PanelPage';
import { useHistoryOverlay } from '../home/useHistoryOverlay';
import { LibraryPickerDialog } from '../library/LibraryPickerDialog';
import { spinePalette } from '../shelf/spineColors';
import { answerLabel, LibraryAnswerCard } from './LibraryAnswerCard';
import { LibraryAttribution } from '../LibraryAttribution';
import { SaveButton } from './SaveButton';
import { useLibraryAnswer } from './useLibraryAnswer';
import '../home/home.css';
import './book.css';

const SHORT_ABOUT = 450;

/** The year from the public record's date ("1999", "1999-05-01", "May 1999"). */
export function firstPublishedYear(value?: string): string | null {
  return /\b(\d{4})\b/.exec(value || '')?.[1] || null;
}

/**
 * "First published 1999" only for an Open Library work, whose date is the
 * work's first publication. Any other record (an ISBN, a catalog record) is
 * one edition, and its date is that edition's: "Published 2002".
 */
export function publishedLine(book: Pick<PublicBook, 'bookKey' | 'publishedDate'>): string | null {
  const year = firstPublishedYear(book.publishedDate);
  if (!year) return null;
  return (/^v1:openlibrary:OL\d+W$/.test(book.bookKey) ? 'First published ' : 'Published ') + year;
}

/** Open Library: the work page when the work is known, else the ISBN page, else nothing. */
export function openLibraryUrl(book: Pick<PublicBook, 'bookKey' | 'workId' | 'isbn13'>): string | null {
  const work = book.workId || /^v1:openlibrary:(OL\d+W)$/.exec(book.bookKey)?.[1];
  if (work && /^OL\d+W$/.test(work)) return 'https://openlibrary.org/works/' + work;
  return book.isbn13 ? 'https://openlibrary.org/isbn/' + book.isbn13 : null;
}

/**
 * The one-shelf book page (Book, BookChecked and BookStates boards): the
 * cover standing up, title, author, first published and ISBN; one button to
 * add the book to the shelf or take it off; the chosen library's answer (or
 * "Find my library"); About this book when there is a description; and
 * Goodreads and Open Library. A placeholder record (no public data for an
 * ISBN) shows only what is known. Choosing a library here opens the library
 * pop-up over the page and checks this book without leaving it.
 *
 * In the desktop middle slot (DeskBook board) the page has a close button (×)
 * instead of Back, the library picker is the layout's (the left column at
 * wide widths), and no "Added to your shelf" notice is needed at wide widths:
 * the shelf beside the book shows it.
 */
export function ShelfBookPage() {
  const slot = useDeskSlot();
  const { bookKey } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = location.state as BookNavigation | null;
  const libraryState = useLibrary();
  const { state, rememberBook, saveBook, unsaveBook } = libraryState;
  const { session } = useAccountSession();
  const supplied = navigation?.book && navigation.book.bookKey === bookKey ? navigation.book : null;
  const [resolved, setResolved] = useState<PublicBook | null>(supplied);
  const [error, setError] = useState<string | null>(null);
  const enriched = useCatalogMetadata(resolved);
  const book = enriched?.bookKey === bookKey ? enriched : null;

  useEffect(() => {
    let active = true;
    setResolved(supplied); setError(null);
    if (!bookKey) { setError('Book details could not load.'); return; }
    publicApi.resolveBook(bookKey, state.selectedLibraryId).then(result => {
      if (active) setResolved(result.metadataStatus && supplied ? { ...supplied, metadataStatus: result.metadataStatus } : result);
    }).catch(failure => { if (active && !supplied) setError(messageFor(failure, 'Book details could not load.')); });
    return () => { active = false; };
    // Navigation state does not change which book this is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  // Opening a book records it in Viewed before (the browser's, or the account's when signed in), once per visible open.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!book?.bookKey || libraryState.loadingAccount) return;
    const key = book.bookKey;
    const record = () => { if (document.visibilityState === 'visible' && opened.current !== key) { opened.current = key; void rememberBook(book, sourceFromLocation(navigation)); } };
    record();
    document.addEventListener('visibilitychange', record);
    return () => document.removeEventListener('visibilitychange', record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.bookKey, rememberBook, libraryState.loadingAccount]);
  // Opened from a shelf suggestion (router state only): counted once per open
  // in the anonymous log, with the book key and nothing else.
  const fromSuggestion = Boolean(navigation?.suggested && navigation.book?.bookKey === bookKey);
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!fromSuggestion || !bookKey || counted.current === bookKey) return;
    counted.current = bookKey;
    reportSuggestion('opened', bookKey);
  }, [fromSuggestion, bookKey]);
  useEffect(() => {
    if (book && opened.current === book.bookKey && libraryState.updateRecentDisplay) void libraryState.updateRecentDisplay(book);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.bookKey, book?.title, book?.authors.join('\u0000'), book?.coverUrl, book?.isbn13, libraryState.updateRecentDisplay]);

  // Back: to the same results (no new search) or the shelf.
  const from = navigation?.from || (navigation?.source === 'search' || navigation?.searchState ? 'search' : 'shelf');
  const backState = from === 'search' && navigation?.searchState?.shelf && navigation.searchState.candidateId ? { search: { candidateId: navigation.searchState.candidateId } } : null;
  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    // Opened from inside the app: the previous entry is that screen, as it was.
    if (navigation?.from && location.key !== 'default' && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(-1);
    }
  };
  const back = slot ? <SlotClose label="Close the book" onClose={slot.close} />
    : <Link className="back-link shelf-book-back" to="/app/shelf" state={backState} onClick={goBack}><BackGlyph size={20} />Back</Link>;

  // Library pop-up over the book (its own history entry).
  const picker = useHistoryOverlay('library');
  const card = useLibraryAnswer(book?.bookKey);
  const cardRef = useRef<HTMLDivElement>(null);
  // Focus goes back to the library card. When a library was just chosen, the
  // "Find my library" button it returns to is replaced by the card a moment
  // later; focus then moves to the card instead of falling to the page.
  const cardFocusUntil = useRef(0);
  const pickerReturn = useCallback(() => {
    if (cardRef.current) return cardRef.current;
    cardFocusUntil.current = Date.now() + 3000;
    return document.querySelector<HTMLElement>('.library-ask-button');
  }, []);
  useEffect(() => {
    if (card.kind !== 'library' || Date.now() > cardFocusUntil.current) return;
    cardFocusUntil.current = 0;
    const active = document.activeElement;
    if (cardRef.current && (!active || active === document.body || !active.isConnected)) cardRef.current.focus();
  }, [card.kind]);

  // Add and remove.
  const savedItem = book ? findSavedBook(state.savedBooks, book) : undefined;
  const saved = Boolean(savedItem);
  const [busy, setBusy] = useState(false);
  const [popTick, setPopTick] = useState(false);
  const [added, setAdded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const full = session.status === 'guest' && state.savedBooks.length + state.savedContent.length >= SAVED_BOOKS_CAP;
  useEffect(() => { setPopTick(false); setAdded(false); setSaveError(null); }, [bookKey]);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 8000);
    return () => clearTimeout(timer);
  }, [added]);
  const toggle = async () => {
    if (!book || busy) return;
    setBusy(true); setSaveError(null);
    try {
      if (savedItem) {
        setAdded(false); setPopTick(false);
        if (await unsaveBook(savedItem.bookKey)) setAnnouncement('Removed from your shelf');
        else { setSaveError('Couldn’t remove this book. Try again.'); setAnnouncement('Couldn’t remove this book. Try again.'); }
        return;
      }
      const result = await saveBook(book);
      if (result === 'saved' && fromSuggestion) reportSuggestion('saved', book.bookKey);
      if (result === 'saved' || result === 'already-saved') { setPopTick(true); setAdded(true); setAnnouncement('Added to your shelf'); return; }
      const message = result === 'full' ? 'Shelf full' : result === 'recovery' ? 'Reload your saved shelf before making changes.' : 'Couldn’t save this book. Try again.';
      setSaveError(message); setAnnouncement(message);
    } finally { setBusy(false); }
  };

  // The library answer is announced once it settles.
  const settled = card.kind === 'library' && card.answer !== 'checking' ? answerLabel(card.answer, card.name) : '';
  useEffect(() => { if (settled) setAnnouncement(settled); }, [settled]);

  const [fullAbout, setFullAbout] = useState(false);
  if (error) return <section className="shelf-book">{back}<h1 className="shelf-book-title">Book unavailable</h1><p className="shelf-book-line">{error}</p></section>;
  if (!book) return <section className="shelf-book" aria-busy="true">{back}<p className="visually-hidden" role="status">Loading book</p>
    <div className="shelf-book-head"><span className="book-stand book-stand-ghost" aria-hidden="true" /><span className="shelf-book-ghost-lines" aria-hidden="true"><span /><span /></span></div></section>;

  const placeholder = book.metadataStatus === 'missing';
  const authors = book.authors.filter(Boolean).join(', ');
  const published = publishedLine(book);
  const description = placeholder ? '' : book.description?.trim() || '';
  const shortAbout = description.length > SHORT_ABOUT ? description.slice(0, SHORT_ABOUT).replace(/\s+\S*$/, '') + '…' : description;
  const olUrl = openLibraryUrl(book);
  const showIsbn = book.isbn13 && !book.title.includes(book.isbn13);

  return <section className="shelf-book">
    {back}
    <div className="shelf-book-head">
      <StandingCover book={book} />
      <div className="shelf-book-heading">
        <h1 className="shelf-book-title">{book.title}</h1>
        {authors && <p className="shelf-book-author">{authors}</p>}
        {published && <p className="shelf-book-meta">{published}</p>}
        {showIsbn && <p className="shelf-book-meta">ISBN {book.isbn13}</p>}
      </div>
    </div>

    <SaveButton saved={saved} busy={busy} full={full} popTick={popTick} onToggle={() => { void toggle(); }} />
    {saveError && <p className="shelf-book-line shelf-book-error">{saveError}</p>}

    <LibraryAnswerCard ref={cardRef} model={card} onFindLibrary={picker.show} />
    {card.kind === 'library' && <LibraryAttribution attribution={libraryState.library?.attribution} />}

    {description && <section className="shelf-book-section" aria-labelledby="about-heading">
      <h2 id="about-heading">About this book</h2>
      <p className="shelf-book-about">{fullAbout ? description : shortAbout}</p>
      {shortAbout !== description && <button type="button" className="home-text-button shelf-book-more" aria-expanded={fullAbout} onClick={() => setFullAbout(value => !value)}>{fullAbout ? 'Less' : 'More'}</button>}
    </section>}

    <section className="shelf-book-section shelf-book-elsewhere" aria-labelledby="elsewhere-heading">
      <h2 id="elsewhere-heading">Read more elsewhere</h2>
      <a href={goodreadsUrl(book)} target="_blank" rel="noopener noreferrer">Reviews on Goodreads<ExternalGlyph /><span className="visually-hidden">, opens in a new tab</span></a>
      {olUrl && <a href={olUrl} target="_blank" rel="noopener noreferrer">All editions on Open Library<ExternalGlyph /><span className="visually-hidden">, opens in a new tab</span></a>}
    </section>

    <p className="visually-hidden" role="status">{announcement}</p>
    {added && saved && slot?.mode !== 'wide' && <div className="undo-notice shelf-book-toast"><span>Added to your shelf</span>
      {slot ? <button type="button" onClick={slot.close}>See my shelf</button> : <Link to="/app/shelf">See my shelf</Link>}</div>}
    {!slot && <LibraryPickerDialog open={picker.open} onClose={picker.close} returnFocus={pickerReturn} />}
  </section>;
}

/** The book standing up (108 × 162): the real cover when one loads, else a typeset cover; page edges on top and right. */
function StandingCover({ book }: { book: PublicBook }) {
  const { url, ready, fail, onLoad } = useCoverImage(book);
  const palette = spinePalette(book.bookKey);
  const author = book.authors.filter(Boolean).join(', ');
  const longest = (text: string) => Math.max(0, ...text.split(/\s+/).map(word => word.length));
  const fit = (longest(book.title) >= 12 ? ' title-xs' : longest(book.title) >= 10 ? ' title-sm' : '') + (longest(author) >= 11 ? ' author-sm' : '');
  return <span className="cover3d book-stand" aria-hidden="true" style={{ '--cover-bg': palette.top, '--cover-ink': palette.ink } as CSSProperties}>
    <span className="cover3d-top" />
    <span className="cover3d-side" />
    <span className="cover3d-face" data-cover={ready ? 'ready' : url ? 'loading' : 'missing'}>
      {!ready && <span className={'cover3d-type' + fit}><span className="cover3d-title">{book.title}</span>{author && <><span className="cover3d-rule" /><span className="cover3d-author">{author}</span></>}</span>}
      {url && <img className="cover3d-image" src={url} alt="" width={108} height={162} decoding="async" referrerPolicy="no-referrer" onError={fail} onLoad={onLoad} />}
    </span>
  </span>;
}
