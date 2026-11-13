import { forwardRef } from 'react';
import { DashGlyph, ExternalGlyph, FoundGlyph, LibraryGlyph, NotCheckedGlyph, PinGlyph, RetryGlyph, SpinnerGlyph, UnsureGlyph } from '../home/homeIcons';
import type { CardAnswer, LibraryCardModel } from './useLibraryAnswer';

/** What the card says to assistive technology, in one phrase. */
export function answerLabel(answer: CardAnswer, name: string): string {
  const library = name || 'your library';
  switch (answer) {
    case 'found': return 'Found in ' + library;
    case 'not_found': return 'Not found in ' + library;
    case 'unconfirmed': return 'Couldn’t confirm in ' + library;
    case 'checking': return 'Checking ' + library;
    default: return 'Couldn’t check ' + library;
  }
}

const TONE: Record<CardAnswer, string> = { found: 'found', not_found: 'not-found', unconfirmed: 'grey', unknown: 'grey', unsupported: 'grey', checking: 'grey' };

/**
 * The library card on the book page (Book, BookChecked and BookStates
 * boards). With no library chosen: "Is it in your library?" and "Find my
 * library". With one: a single row with a status icon, the library's name
 * and a Catalog link. The board's library icon tile is drawn only for a
 * library with an icon; the directory has none yet, so there is no tile.
 * Green is found, white is not found, grey is checking, couldn't check (with
 * an icon-only Try again, or a broken circle when trying again would not
 * help) and couldn't confirm. Each state has its own mark, so colour is
 * never the only difference from "not found". No copies, due dates, floors
 * or shelf numbers.
 */
export const LibraryAnswerCard = forwardRef<HTMLDivElement, { model: LibraryCardModel; onFindLibrary: () => void }>(
  function LibraryAnswerCard({ model, onFindLibrary }, ref) {
    if (model.kind === 'none') return <section className="library-ask" aria-labelledby="library-ask-heading">
      <h2 id="library-ask-heading">Is it in your library?</h2>
      <button type="button" className="home-button home-button-outline library-ask-button" aria-haspopup="dialog" onClick={onFindLibrary}><PinGlyph />Find my library</button>
    </section>;
    const { answer, name, catalogUrl, retry } = model;
    const label = answerLabel(answer, name);
    return <div ref={ref} tabIndex={-1} className={'library-answer library-answer-' + TONE[answer]} role="group" aria-label={label} aria-busy={answer === 'checking' || undefined} data-answer={answer}>
      {retry ? <button type="button" className="library-answer-retry" aria-label="Try again" onClick={retry}><RetryGlyph /></button>
        : <span className="library-answer-icon" aria-hidden="true">
          {answer === 'found' ? <FoundGlyph /> : answer === 'not_found' ? <DashGlyph /> : answer === 'checking' ? <span className="library-answer-spin"><SpinnerGlyph /></span>
            : answer === 'unconfirmed' ? <UnsureGlyph /> : <NotCheckedGlyph />}
        </span>}
      <span className="library-answer-name">{name || <span className="library-answer-pending" aria-hidden="true"><LibraryGlyph size={16} /></span>}</span>
      {catalogUrl && <a className="library-answer-catalog" href={catalogUrl} target="_blank" rel="noopener noreferrer" aria-label={'Catalog' + (name ? ', ' + name : '') + ', opens in a new tab'}>
        Catalog<ExternalGlyph size={16} strokeWidth={2} /></a>}
    </div>;
  });
