import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PROBLEM_SCREENS, PublicApiError, publicApi, type ProblemScreen } from '../../api';
import { useLibrary } from '../../context';
import { TickGlyph } from '../home/homeIcons';
import { FormAlert, PanelPage } from './PanelPage';
import { appVersion } from './buildInfo';

/** Where the report was opened from; the side panel passes the screen under it. */
export type ReportOrigin = { reportScreen?: ProblemScreen; reportBookKey?: string };

const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
const BOOK_KEY = /^v1:[\x21-\x7e]{1,509}$/;
const LIMIT = 2000;

type Status = 'idle' | 'sending' | 'sent' | 'offline' | 'limited' | 'rejected';

/**
 * ReportProblem board: one text box and Send, which turns into "Sent" with a
 * tick. Only the screen, the chosen library and the book shown go with the
 * words (plan Phase 9); never the account, email or anything typed elsewhere.
 */
export function ReportProblemPage() {
  const location = useLocation();
  const origin = (location.state || {}) as ReportOrigin;
  const { state } = useLibrary();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const field = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const send = async () => {
    const words = text.trim();
    if (!words || status === 'sending') { field.current?.focus(); return; }
    setStatus('sending');
    const screen = origin.reportScreen && PROBLEM_SCREENS.includes(origin.reportScreen) ? origin.reportScreen : 'panel';
    const libraryId = state.selectedLibraryId && LIBRARY_ID.test(state.selectedLibraryId) ? state.selectedLibraryId : undefined;
    const bookKey = origin.reportBookKey && BOOK_KEY.test(origin.reportBookKey) ? origin.reportBookKey : undefined;
    const version = appVersion();
    try {
      await publicApi.problemReport({ text: words, screen, ...(libraryId ? { libraryId } : {}), ...(bookKey ? { bookKey } : {}), ...(version ? { appVersion: version } : {}) });
      if (alive.current) setStatus('sent');
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof PublicApiError ? error.status : 0;
      setStatus(code === 429 ? 'limited' : code === 400 ? 'rejected' : 'offline');
    }
  };

  const sent = status === 'sent';
  return <PanelPage title="Report a problem" documentTitle="Report a problem" className="report-page">
    <textarea ref={field} className="report-text" aria-labelledby="panel-page-title" rows={6} maxLength={LIMIT} value={text}
      onChange={event => { setText(event.target.value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/gu, '')); if (status !== 'sending') setStatus('idle'); }} />
    {status === 'offline' && <FormAlert offline action={<button type="button" className="home-text-button" onClick={() => { void send(); }}>Try again</button>}>Couldn’t connect</FormAlert>}
    {status === 'limited' && <FormAlert>Too many reports. Try later</FormAlert>}
    {status === 'rejected' && <FormAlert>Couldn’t send this text</FormAlert>}
    {sent
      ? <button type="button" className="home-button sent-button" aria-disabled="true" aria-live="polite"><span className="tick-pop"><TickGlyph /></span>Sent</button>
      : <button type="button" className="home-button" aria-live="polite" disabled={status === 'sending'} onClick={() => { void send(); }}>{status === 'sending' ? 'Sending…' : 'Send'}</button>}
  </PanelPage>;
}
