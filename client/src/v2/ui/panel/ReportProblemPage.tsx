import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PROBLEM_SCREENS, PublicApiError, publicApi, type ContactDetails, type ProblemScreen } from '../../api';
import { useLibrary } from '../../context';
import { trackEvent } from '../../googleTag';
import { readReaderPreferences } from '../../readerState';
import { ContactFields, emailIsUsable } from '../contact/ContactFields';
import { TickGlyph } from '../home/homeIcons';
import { FormAlert, PanelPage } from './PanelPage';
import { appVersion } from './buildInfo';

/** Where the report was opened from; the side panel passes the screen under it. */
export type ReportOrigin = { reportScreen?: ProblemScreen; reportBookKey?: string };

const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
const BOOK_KEY = /^v1:[\x21-\x7e]{1,509}$/;
const LIMIT = 2000;

/** The screen a report names, as the reader knows it. */
const SCREEN_NAMES: Record<ProblemScreen, string> = {
  shelf: 'Reading shelf', search: 'Search results', book: 'Book page', library: 'Find your library',
  panel: 'Settings', account: 'Account', scan: 'Scan', other: 'Other',
};

type Status = 'idle' | 'sending' | 'sent' | 'offline' | 'limited' | 'rejected';

/** "a, b and c" */
function listed(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

/**
 * ReportProblem board: "What happened?", a line saying exactly what goes with
 * the words (the screen, the chosen library and the book shown), an optional
 * name and email for a reply (kept 90 days), and Send report, which turns into
 * "Sent" with a tick. Never the account, anything typed elsewhere or a device
 * identifier. The name and email live in this page's state only.
 */
export function ReportProblemPage() {
  const location = useLocation();
  const origin = (location.state || {}) as ReportOrigin;
  const { state, library } = useLibrary();
  const [text, setText] = useState('');
  const [contact, setContact] = useState<ContactDetails>({});
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  // An empty Send report: a line under the field says what is missing.
  const [empty, setEmpty] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const screen = origin.reportScreen && PROBLEM_SCREENS.includes(origin.reportScreen) ? origin.reportScreen : 'panel';
  const libraryId = state.selectedLibraryId && LIBRARY_ID.test(state.selectedLibraryId) ? state.selectedLibraryId : undefined;
  const bookKey = origin.reportBookKey && BOOK_KEY.test(origin.reportBookKey) ? origin.reportBookKey : undefined;
  const cachedLibrary = readReaderPreferences().selectedLibrary;
  const libraryName = libraryId ? (library?.id === libraryId ? library.name : cachedLibrary?.id === libraryId ? cachedLibrary.name : null) : null;
  const bookTitle = bookKey ? [...state.savedBooks, ...state.recentBooks].find(book => book.bookKey === bookKey)?.title : undefined;
  const sentWith = listed([
    `the screen you were on (${SCREEN_NAMES[screen]})`,
    ...(libraryId ? [libraryName ? `your library (${libraryName})` : 'your library'] : []),
    ...(bookKey ? [bookTitle ? `the book (${bookTitle})` : 'the book you were looking at'] : []),
  ]) + '.';
  const emailOk = emailIsUsable(contact.email);

  const send = async () => {
    const words = text.trim();
    if (status === 'sending') return;
    if (!words) { setEmpty(true); field.current?.focus(); return; }
    setEmpty(false);
    setChecked(true);
    if (!emailOk) return;
    setStatus('sending');
    const version = appVersion();
    try {
      await publicApi.problemReport({ text: words, screen, ...(libraryId ? { libraryId } : {}), ...(bookKey ? { bookKey } : {}), ...(version ? { appVersion: version } : {}), ...contact });
      trackEvent('problem_report');
      if (alive.current) setStatus('sent');
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof PublicApiError ? error.status : 0;
      setStatus(code === 429 ? 'limited' : code === 400 ? 'rejected' : 'offline');
    }
  };
  const edited = () => { if (status !== 'sending') setStatus('idle'); };

  const sent = status === 'sent';
  return <PanelPage title="Report a problem" documentTitle="Report a problem" className="report-page">
    <p className="report-intro">Tell us what went wrong: a wrong library answer, a book that is missing, or something that looks broken.</p>
    <form className="report-form" noValidate onSubmit={event => { event.preventDefault(); void send(); }}>
      <div className="form-field">
        <label htmlFor="report-text">What happened?</label>
        <textarea ref={field} id="report-text" className="report-text" rows={4} maxLength={LIMIT} value={text}
          aria-invalid={empty || undefined} aria-describedby={empty ? 'report-text-error' : undefined}
          placeholder="For example: the app says Wings of Fire is not in my library, but the library has it."
          onChange={event => { setText(event.target.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/gu, '')); if (event.target.value.trim()) setEmpty(false); edited(); }} />
        {empty && <small className="contact-error" id="report-text-error" role="alert">Tell us what happened first.</small>}
      </div>
      <p className="report-context"><strong>Sent with your message:</strong> {sentWith}</p>
      <ContactFields value={contact} emailError={checked && !emailOk} intro="Both are optional. We delete them after 90 days."
        onChange={next => { setContact(next); edited(); }} />
      {status === 'offline' && <FormAlert offline action={<button type="button" className="home-text-button" onClick={() => { void send(); }}>Try again</button>}>Couldn’t connect</FormAlert>}
      {status === 'limited' && <FormAlert>Too many reports. Try later</FormAlert>}
      {status === 'rejected' && <FormAlert>Couldn’t send this. Check the message and the email</FormAlert>}
      {sent
        ? <button type="button" className="home-button sent-button" aria-disabled="true" aria-live="polite"><span className="tick-pop"><TickGlyph /></span>Sent</button>
        : <button type="submit" className="home-button" aria-live="polite" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send report'}</button>}
    </form>
    <p className="form-footnote report-footnote">Please leave out passwords and library card numbers. See our <Link to="/app/privacy">privacy policy</Link>.</p>
  </PanelPage>;
}
