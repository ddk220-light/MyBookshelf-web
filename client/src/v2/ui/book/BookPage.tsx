import { useState } from 'react';
import { Link } from 'react-router-dom';
import { goodreadsUrl } from '../../context';
import { BookmarkIcon, ShareIcon } from '../icons';
import { Cover } from '../BookCard';
import { CatalogDetails, DueSlip } from '../journal/DueSlip';
import { LibraryAttribution } from '../LibraryAttribution';
import { Notice } from '../Notice';
import { Sheet } from '../Sheet';
import { DogAnimation } from '../DogAnimation';
import { useBookScreen } from './useBookScreen';
import { AlsoFree } from '../content/AlsoFree';
import {useAccountSession} from '../../auth/AccountSessionProvider';
import { countOf, formatPublishedDate, languageName } from '../../format';
export { withCatalogTitle } from './useBookScreen';

export function BookPage() {
  const {session}=useAccountSession();
  const model = useBookScreen();
  const { book, error, from, backState, library, loadingLibrary, libraryError, retryLibrary, availability, availabilityError,
    retryAvailability, saved, saving, toggleSaved, announcement, libraryPath, returnState, exactIsbn, selectedLanguage, changePreference } = model;
  const [editionOpen, setEditionOpen] = useState(false);
  const [fullStory, setFullStory] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const back = <Link className="back-link" aria-label={'Back to ' + (from === 'search' ? 'search' : 'shelf')} to={from === 'search' ? '/app/search' : '/app/shelf'} state={from === 'search' ? backState : undefined}>← {from === 'search' ? 'Search' : 'Shelf'}</Link>;
  if (error) return <section className="page-section">{back}<h1>Book unavailable</h1><Notice tone="error">{error}</Notice></section>;
  if (!book) return <section className="page-section">{back}<p role="status">Loading book…</p><div className="book-loading skeleton" /></section>;
  const description = book.description?.trim();
  const short = description && description.length > 450 ? description.slice(0, 450).replace(/\s+\S*$/, '') + '…' : description;
  const catalog = book.bookKey.startsWith('v1:catalog:');
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: book.title, url });
      else { await navigator.clipboard.writeText(url); setShareMessage('Link copied'); }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setShareUrl(url); setShareMessage('Copy this book link');
    }
  };
  return <section className="page-section reader-book">
    <div className="book-back">{back}</div>
    <div className="reader-book-layout">
      <div className="reader-book-cover-column">
        <div className="reader-book-hero"><Cover book={book} fallback={<span className="typeset-cover"><strong>{book.title}</strong><small>{book.authors.join(', ')}</small></span>} /></div>
        <div className="reader-book-actions">
          <button className="save-book-button" disabled={saving||(model.recoveryMode&&session.status!=='guest')} aria-busy={saving} aria-label={saved ? 'On your shelf' : 'Save book'} aria-pressed={saved} onClick={()=>void toggleSaved()}><span className="book-action-icon" aria-hidden="true"><BookmarkIcon /></span><span className="book-action-label">{saving?'Saving…':saved ? '✓ On your shelf' : '+ Save book'}</span></button>
          <button className="button-quiet" aria-label="Share" onClick={() => void share()}><span className="book-action-icon" aria-hidden="true"><ShareIcon /></span><span className="book-action-label">Share</span></button>
        </div>
        {shareMessage && <p className="form-hint" role="status">{shareMessage}</p>}
        {shareUrl && <input className="share-url" aria-label="Book link" readOnly value={shareUrl} onFocus={event => event.target.select()} />}
        <DogAnimation pose="peek" className="book-companion" />
      </div>
      <div className="reader-book-main">
        <header className="reader-book-heading"><h1>{book.title}</h1>{book.authors.length > 0 && <p className="authors">{book.authors.join(', ')}</p>}
          <p className="book-meta">{[book.publishedDate && formatPublishedDate(book.publishedDate), book.editionCount && book.editionCount > 1 ? countOf(book.editionCount, 'edition', 'editions') : null].filter(Boolean).join(' · ')}</p>
        </header>
        {announcement && <p className="book-announcement" role="status">{announcement}</p>}
        <section className="reader-availability" aria-label="At your library">
          {library && <div className="availability-library-line"><strong>{library.name}</strong><Link className="text-link" to={libraryPath} state={returnState}>Change</Link></div>}
          <DueSlip library={library} availability={availability} error={availabilityError} loadingLibrary={loadingLibrary} libraryError={libraryError}
            onRetryLibrary={retryLibrary} onRetry={retryAvailability} showIdentity={false} lookupKey={book.bookKey + ':' + exactIsbn + ':' + selectedLanguage} />
          {library && <CatalogDetails library={library} availability={availability} saved={saved} showIdentity={false} showChange={false} />}
          <LibraryAttribution attribution={availability?.attribution || library?.attribution} />
        </section>
        {import.meta.env.VITE_CONTENT_DISCOVERY_ENABLED === 'true' && <AlsoFree book={book}/>}
        <section className="reader-book-about"><h2>About this book</h2>
          <p className={description ? 'story-text' : 'story-text story-empty'}>{description ? fullStory ? description : short : 'No description available.'}</p>
          {short !== description && <button className="inline-disclosure" aria-expanded={fullStory} onClick={() => setFullStory(value => !value)}>{fullStory ? 'Less' : 'More'}</button>}
        </section>
        <section className="reader-book-details"><h2>Details</h2>
          <dl className="book-facts">
            {book.publishedDate && <><dt>Published</dt><dd>{formatPublishedDate(book.publishedDate)}</dd></>}
            {book.editionCount && <><dt>Editions</dt><dd>{book.editionCount}</dd></>}
            {book.edition && <><dt>Edition</dt><dd>{book.edition}</dd></>}
            {book.publisher && <><dt>Publisher</dt><dd>{book.publisher}</dd></>}
            {book.pageCount && <><dt>Length</dt><dd>{book.pageCount} pages</dd></>}
            {book.isbn13 && <><dt>ISBN</dt><dd>{book.isbn13}</dd></>}
          </dl>
          {!catalog && <button className="edition-settings-row" onClick={() => setEditionOpen(true)}><span>Edition settings</span><span>{exactIsbn ? 'Only this ISBN' : selectedLanguage ? languageName(selectedLanguage) : 'Any language'} ›</span></button>}
          {book.metadataStatus && <p className="form-hint">Some book details are unavailable.</p>}
          <div className="book-external-links"><a href={goodreadsUrl(book)} target="_blank" rel="noopener noreferrer">Goodreads <span aria-hidden="true">↗</span></a>
            <a href={'https://www.google.com/search?q=' + encodeURIComponent([book.title, ...book.authors].join(' '))} target="_blank" rel="noopener noreferrer">Search the web <span aria-hidden="true">↗</span></a></div>
        </section>
      </div>
    </div>
    <Sheet open={editionOpen} title="Edition settings" onClose={() => setEditionOpen(false)}>
      {book.isbn13 && <label className="edition-option"><input type="checkbox" checked={exactIsbn} onChange={event => changePreference('edition', event.target.checked ? 'exact' : '')} />Only this ISBN <span>{book.isbn13}</span></label>}
      {!exactIsbn && Boolean(book.languages?.length) && <label className="edition-language">Book language<select value={selectedLanguage} onChange={event => changePreference('language', event.target.value)}>{[...new Set([selectedLanguage, ...(book.languages || [])])].sort().map(code => <option key={code} value={code}>{languageName(code)}</option>)}</select></label>}
      <Link className="text-link" to="/app/search" state={{ focusSearch: true }}>Scan or enter an ISBN</Link>
      <button onClick={() => setEditionOpen(false)}>Done</button>
    </Sheet>
  </section>;
}

