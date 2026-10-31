import { useEffect, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { publicApi } from '../../api';
import { useCatalogMetadata } from '../../catalogMetadata';
import { messageFor, sourceFromLocation, useLibrary } from '../../context';
import { isSaved } from '../../localState';
import { cacheAvailability, currentAvailability, rememberBookLookup } from '../../readerState';
import { libraryReturn, type BookNavigation } from '../../bookNavigation';
import type { Availability, PublicBook } from '../../types';

export function withCatalogTitle(book: PublicBook, availability: Availability | null): PublicBook {
  if (book.metadataStatus && availability?.matchKind === 'exact_isbn' && availability.freshness === 'fresh' && !availability.errorCode
    && availability.catalogTitle?.trim()) return { ...book, title: availability.catalogTitle.trim() };
  return book;
}

// The model lives above responsive presentation. Viewport changes never restart requests.
export function useBookScreen() {
  const { bookKey } = useParams();
  const libraryState = useLibrary();
  const { library, state, rememberBook, reportStorageFailure } = libraryState;
  const location = useLocation();
  const navigation = location.state as BookNavigation | null;
  const supplied = navigation?.book && navigation.book.bookKey === bookKey ? navigation.book : null;
  const [catalogBook, setBook] = useState<PublicBook | null>(supplied);
  const enriched = useCatalogMetadata(catalogBook);
  const book = enriched?.bookKey === bookKey ? enriched : null;
  const [preferences, setPreferences] = useSearchParams();
  const exactIsbn = Boolean(book?.isbn13 && !book.bookKey.startsWith('v1:catalog:') && preferences.get('edition') === 'exact');
  const language = /^[a-z]{3}$/.test(preferences.get('language') || '') ? preferences.get('language')! : '';
  const selectedLanguage = language || book?.language || (book?.languages?.includes('eng') ? 'eng' : book?.languages?.[0]) || '';
  const from = navigation?.from || (navigation?.source === 'search' || navigation?.searchState ? 'search' : 'shelf');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    let active = true;
    setBook(supplied); setError(null); setAvailability(null); setAvailabilityError(null); setAnnouncement('');
    if (!bookKey) { setError('Book details could not load.'); return; }
    publicApi.resolveBook(bookKey).then(resolved => {
      if (!active) return;
      const result = resolved.metadataStatus && supplied ? { ...supplied, metadataStatus: resolved.metadataStatus } : resolved;
      setBook(result); rememberBook(result, sourceFromLocation(navigation));
    }).catch(failure => { if (active && !supplied) setError(messageFor(failure, 'Book details could not load.')); });
    return () => { active = false; };
    // Navigation state and URL preferences do not change the selected book's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, rememberBook]);
  const availabilityBookKey = book?.bookKey, libraryId = library?.id;
  const lookupBookKey = exactIsbn && book?.isbn13 ? 'v1:isbn:' + book.isbn13 : availabilityBookKey;
  useEffect(() => {
    let active = true;
    setAvailability(null); setAvailabilityError(null);
    if (!availabilityBookKey || !libraryId) return;
    const options = availabilityBookKey.startsWith('v1:catalog:') ? undefined : { editionScope: exactIsbn ? 'exact' as const : 'work' as const, ...(selectedLanguage ? { language: selectedLanguage } : {}) };
    if (!rememberBookLookup(availabilityBookKey, options)) reportStorageFailure();
    const store = (result: Availability) => {
      if (!active) return;
      setAvailability(currentAvailability(result));
      if (!cacheAvailability(libraryId, availabilityBookKey, options, result)) reportStorageFailure();
    };
    publicApi.availability(libraryId, lookupBookKey!, options).then(store).catch(failure => {
      if (!active) return;
      setAvailabilityError(messageFor(failure, 'The library catalog could not be checked.'));
      store({ outcome: 'unknown', matchKind: null, lookupKind: exactIsbn ? 'exact_isbn' : 'title_author', freshness: 'none', attemptedAt: new Date().toISOString(), errorCode: failure?.code || 'CATALOG_UNAVAILABLE' });
    });
    return () => { active = false; };
  }, [availabilityBookKey, lookupBookKey, libraryId, exactIsbn, selectedLanguage, attempt, reportStorageFailure]);
  useEffect(() => {
    if (!book) return;
    const result = withCatalogTitle(book, availability);
    if (result !== book) rememberBook(result, sourceFromLocation(navigation));
  }, [book, availability, rememberBook, navigation]);
  const changePreference = (key: string, value: string) => {
    const next = new URLSearchParams(preferences);
    if (value) next.set(key, value); else next.delete(key);
    setPreferences(next, { replace: true, state: location.state });
  };
  const saved = Boolean(book && isSaved(state, book.bookKey));
  const toggleSaved = () => {
    if (!book) return;
    if (saved) { libraryState.unsaveBook(book.bookKey); setAnnouncement(libraryState.recoveryMode ? 'Reload your saved shelf before making changes.' : 'Removed from your shelf'); }
    else {
      const result = libraryState.saveBook(withCatalogTitle(book, availability));
      setAnnouncement(result === 'full' ? 'Your shelf is full. Remove a book before adding another.' : result === 'recovery' ? 'Reload your saved shelf before making changes.' : 'Saved to your shelf');
    }
  };
  return { ...libraryState, book: book && withCatalogTitle(book, availability), error, availability, availabilityError, exactIsbn, selectedLanguage,
    from, backState: navigation?.searchState, saved, announcement, toggleSaved, changePreference, retryAvailability: () => setAttempt(count => count + 1),
    libraryPath: '/app/libraries?book=' + encodeURIComponent(bookKey || ''), returnState: libraryReturn(location.pathname, location.search, { ...navigation, from, ...(book ? { book } : {}) }) };
}
