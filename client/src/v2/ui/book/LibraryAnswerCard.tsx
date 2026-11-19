import { forwardRef } from 'react';
import { DashGlyph, ExternalGlyph, FoundGlyph, NotCheckedGlyph, PinGlyph } from '../home/homeIcons';
import type { CardAnswer, LibraryCardModel } from './useLibraryAnswer';

export function answerLabel(answer: CardAnswer): string {
  switch (answer) {
    case 'found': return 'In your library';
    case 'not_found': return 'Not in your library';
    case 'checking': return 'Checking your library…';
    case 'unsupported': return 'This library can’t be checked from here.';
    default: return 'Couldn’t check right now';
  }
}

const descriptions: Partial<Record<CardAnswer, string>> = {
  not_found: 'We looked for this book in the library’s catalog and did not find it. The library may still have another edition.',
  checking: 'This library’s catalog may take a while to answer. You can go back to your reading shelf while we check.',
  unknown: 'The library’s catalog couldn’t be checked. This does not mean the book is missing.',
  unconfirmed: 'We couldn’t confirm a match in the library’s catalog. This does not mean the book is missing.',
};

export const LibraryAnswerCard = forwardRef<HTMLDivElement, { model: LibraryCardModel; onFindLibrary: () => void }>(
  function LibraryAnswerCard({ model, onFindLibrary }, ref) {
    if (model.kind === 'none') return <section className="library-ask" aria-labelledby="library-ask-heading">
      <h2 id="library-ask-heading">Is it in your library?</h2>
      <button type="button" className="home-button home-button-outline library-ask-button" aria-haspopup="dialog" onClick={onFindLibrary}><PinGlyph />Find my library</button>
    </section>;
    const { answer, name, place, catalogUrl, catalogLinkKind, retry } = model;
    const label = answerLabel(answer);
    const tone = answer === 'found' ? 'found' : answer === 'not_found' ? 'not-found' : 'grey';
    const caption = name && place && !name.includes(place) ? name + ' · ' + place : name;
    const linkText = answer === 'checking' ? 'Open the library’s catalog instead'
      : answer === 'unsupported' ? 'Open the library’s catalog'
        : catalogLinkKind === 'record' ? 'See this book in the library’s catalog'
          : catalogLinkKind === 'search' ? 'Search the library’s catalog yourself' : 'Open catalog';
    return <div ref={ref} tabIndex={-1} className={'library-answer library-answer-' + tone} role="group" aria-label={label}
      aria-busy={answer === 'checking' || undefined} data-answer={answer}>
      <h2><span className="library-answer-icon" aria-hidden="true">
        {answer === 'found' ? <FoundGlyph /> : answer === 'not_found' ? <DashGlyph /> : <NotCheckedGlyph />}
      </span>{label}</h2>
      {caption && <p className="library-answer-name">{caption}</p>}
      {answer === 'checking' && <span className="library-answer-progress" aria-hidden="true" />}
      {descriptions[answer] && <p>{descriptions[answer]}</p>}
      <div className="library-answer-actions">
        {retry && <button type="button" className="home-text-button" onClick={retry}>Try again</button>}
        {catalogUrl && <a className="library-answer-catalog" href={catalogUrl} target="_blank" rel="noopener noreferrer">
          {linkText}<ExternalGlyph size={16} strokeWidth={2} /><span className="visually-hidden">, opens in a new tab</span>
        </a>}
        {(answer === 'found' || answer === 'not_found') && <button type="button" className="home-text-button" onClick={onFindLibrary} aria-haspopup="dialog">
          {answer === 'found' ? 'Change library' : 'Try another library'}
        </button>}
      </div>
      {catalogUrl?.startsWith('http:') && <p>This catalog does not use a secure connection.</p>}
    </div>;
  });
