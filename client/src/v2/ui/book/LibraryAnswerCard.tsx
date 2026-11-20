import { forwardRef, useId } from 'react';
import { DashGlyph, ExternalGlyph, FoundGlyph, NotCheckedGlyph, PinGlyph } from '../home/homeIcons';
import type { CardAnswer, LibraryCardModel } from './useLibraryAnswer';
import type { CheckReason } from '../../api';

// Words for each answer (plan A3, the wording table). `unconfirmed` (the
// catalog answered but did not prove this book) reads as "Couldn't check
// right now", never as "not found", and offers no Try again.
export function answerLabel(answer: CardAnswer): string {
  switch (answer) {
    case 'found': return 'In your library';
    case 'not_found': return 'Not in your library';
    case 'checking': return 'Checking your library…';
    case 'unsupported': return 'This library can’t be checked from here.';
    default: return 'Couldn’t check right now';
  }
}

/** The sentence under "Checking your library…", true to the library's own time limit. */
export function checkingDescription(slow = false): string {
  return 'This library’s catalog can take up to ' + (slow ? 'a minute' : 'half a minute')
    + ' to answer. You can go back to your reading shelf: the answer will be there when it arrives.';
}

const descriptions: Partial<Record<CardAnswer, string>> = {
  not_found: 'We looked for this book in the library’s catalog and did not find it. The library may still have another edition.',
  unconfirmed: 'The library’s catalog answered, but we could not tell whether it has this book.',
};

const NOT_MISSING = ' This does not mean the book is missing.';

/**
 * The sentence under "Couldn’t check right now", true to why the check
 * could not answer. Only a check that ran out of time says the catalog did
 * not answer in time. `busy` (other checks were already waiting for this
 * catalog and its turn came too late) never blames the reader. A reader's
 * check has no request cap, so `budget` gets the general sentence.
 */
export function unknownDescription(reason?: CheckReason): string {
  switch (reason) {
    case 'timeout': return 'The library’s catalog did not answer in time.' + NOT_MISSING;
    case 'blocked': return 'This library does not allow outside checks of its catalog.' + NOT_MISSING;
    case 'unsupported':
    case 'unrecognized':
    case 'configuration': return 'We can’t read this library’s catalog for this book yet.' + NOT_MISSING;
    case 'busy': return 'The library’s catalog is busy with other checks. Try again in a minute.' + NOT_MISSING;
    case 'unavailable': return 'The library’s catalog is not answering right now.' + NOT_MISSING;
    default: return 'We couldn’t check the library’s catalog this time.' + NOT_MISSING;
  }
}

type LinkKind = Extract<LibraryCardModel, { kind: 'library' }>['catalogLinkKind'];

/** The catalog link's words say where it goes: the book's own record, a search, or the catalog. */
export function catalogLinkText(answer: CardAnswer, kind: LinkKind): string {
  if (answer === 'checking') return 'Open the library’s catalog instead';
  if (answer === 'unsupported') return 'Open the library’s catalog';
  if (answer === 'unknown' || answer === 'unconfirmed') return 'Open catalog';
  if (answer === 'not_found') return kind === 'search' ? 'Search the library’s catalog yourself' : 'Open the library’s catalog';
  return kind === 'record' ? 'See this book in the library’s catalog'
    : kind === 'search' ? 'Search the library’s catalog for this book' : 'Open the library’s catalog';
}

/** The words above a found book's rows from the library's catalog. */
export function matchesHeading(count: number): string {
  return count === 1 ? 'In the library’s catalog:' : 'Books with this title in the library’s catalog:';
}

export const LibraryAnswerCard = forwardRef<HTMLDivElement, { model: LibraryCardModel; onFindLibrary: () => void }>(
  function LibraryAnswerCard({ model, onFindLibrary }, ref) {
    const matchesId = useId();
    if (model.kind === 'none') return <section className="library-ask" aria-labelledby="library-ask-heading">
      <h2 id="library-ask-heading">Is it in your library?</h2>
      <button type="button" className="home-button home-button-outline library-ask-button" aria-haspopup="dialog" onClick={onFindLibrary}><PinGlyph />Find my library</button>
    </section>;
    const { answer, name, place, catalogUrl, catalogLinkKind, retry, slowCatalog, reason, matches } = model;
    const label = answerLabel(answer);
    const tone = answer === 'found' ? 'found' : answer === 'not_found' ? 'not-found' : 'grey';
    const caption = name && place && !name.includes(place) ? name + ' · ' + place : name;
    // A link-only library has no answer to show: no heading and no status mark.
    const linkOnly = answer === 'unsupported';
    const description = answer === 'checking' ? checkingDescription(slowCatalog) : linkOnly ? label
      : answer === 'unknown' ? unknownDescription(reason) : descriptions[answer];
    return <div ref={ref} tabIndex={-1} className={'library-answer library-answer-' + tone} role="group" aria-label={label}
      aria-busy={answer === 'checking' || undefined} data-answer={answer}>
      {!linkOnly && <h2><span className="library-answer-icon" aria-hidden="true">
        {answer === 'found' ? <FoundGlyph /> : answer === 'not_found' ? <DashGlyph /> : <NotCheckedGlyph />}
      </span>{label}</h2>}
      {caption && <p className="library-answer-name">{caption}</p>}
      {answer === 'checking' && <span className="library-answer-progress" aria-hidden="true" />}
      {description && <p>{description}</p>}
      {answer === 'found' && matches && matches.length > 0 && <>
        <p id={matchesId}>{matchesHeading(matches.length)}</p>
        <ul className="library-answer-matches" aria-labelledby={matchesId}>
          {matches.map((match, index) => <li key={index}>
            {match.url || catalogUrl
              ? <a href={match.url || catalogUrl} target="_blank" rel="noopener noreferrer">{match.title}<span className="visually-hidden">, opens in a new tab</span></a>
              : <span>{match.title}</span>}
            {match.author && <span className="library-answer-match-author">{match.author}</span>}
          </li>)}
        </ul>
      </>}
      <div className="library-answer-actions">
        {retry && <button type="button" className="home-text-button" onClick={retry}>Try again</button>}
        {catalogUrl && <a className="library-answer-catalog" href={catalogUrl} target="_blank" rel="noopener noreferrer">
          {catalogLinkText(answer, catalogLinkKind)}<ExternalGlyph size={16} strokeWidth={2} /><span className="visually-hidden">, opens in a new tab</span>
        </a>}
        {(answer === 'found' || answer === 'not_found') && <button type="button" className="home-text-button" onClick={onFindLibrary} aria-haspopup="dialog">
          {answer === 'found' ? 'Change library' : 'Try another library'}
        </button>}
      </div>
      {catalogUrl?.startsWith('http:') && <p>This catalog does not use a secure connection.</p>}
    </div>;
  });
