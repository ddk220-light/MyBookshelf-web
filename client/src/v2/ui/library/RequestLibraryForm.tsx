import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { publicApi, PublicApiError, type ContactDetails } from '../../api';
import { ContactFields, emailIsUsable } from '../contact/ContactFields';
import { TickGlyph } from '../home/homeIcons';
import { requestableText } from './requestableText';

type Status = 'idle' | 'sending' | 'sent' | 'failed' | 'refused' | 'limited';

/**
 * "Ask us to add a library" (RequestLibrary board), opened from "My library
 * isn't listed" or "Request to add …" in the library pop-up. The library's
 * name and city start as the typed text and can be changed; the name and
 * email are optional. Nothing is sent until Send request. The text, name and
 * email live in this form's state only: never in the address, browser
 * storage or analytics.
 */
export function RequestLibraryForm({ initialText, onCancel, onDone }: {
  initialText: string;
  /** Cancel: back to the list, nothing sent. */
  onCancel: () => void;
  /** Done, after the confirmation: closes the pop-up. */
  onDone: () => void;
}) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [contact, setContact] = useState<ContactDetails>({});
  const [status, setStatus] = useState<Status>('idle');
  const [checked, setChecked] = useState(false);
  const [sentText, setSentText] = useState('');
  const done = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (status === 'sent') done.current?.focus(); }, [status]);

  const library = requestableText(text);
  const emailOk = emailIsUsable(contact.email);
  const textError = checked && !library;
  const emailError = checked && !emailOk;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;
    setChecked(true);
    if (!library || !emailOk) return;
    setStatus('sending');
    try {
      await publicApi.libraryRequest(library, contact);
      if (!alive.current) return;
      setSentText(library);
      setStatus('sent');
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof PublicApiError ? failure.status : 0;
      setStatus(code === 400 ? 'refused' : code === 429 ? 'limited' : 'failed');
    }
  };

  if (status === 'sent') return <div className="library-request-form library-request-sent">
    <div role="status">
      <p className="library-requested"><TickGlyph size={20} />Request sent. Thank you.</p>
      <p className="library-request-intro">We have your request for “{sentText}”. We add libraries whose catalogs can be searched online, most requested first.
        {contact.email?.trim() ? ' We will write to you when it is added.' : ''}</p>
    </div>
    <button ref={done} type="button" className="home-button" onClick={onDone}>Done</button>
  </div>;

  return <form className="library-request-form" noValidate onSubmit={event => { void send(event); }}>
    <p className="library-request-intro">Tell us which library you use. We add libraries whose catalogs can be searched online, most requested first.</p>
    <div className="form-field">
      <label htmlFor={id + '-library'}>Library name and city</label>
      <input id={id + '-library'} autoComplete="off" spellCheck={false} maxLength={80} value={text} disabled={status === 'sending'}
        aria-invalid={textError || undefined} aria-describedby={textError ? id + '-library-error' : undefined}
        onChange={event => { setText(event.target.value); if (status !== 'sending') setStatus('idle'); }} />
      {textError && <small className="form-field-error" id={id + '-library-error'}>Type the library’s name and city, without an email, phone number or link.</small>}
    </div>
    <ContactFields value={contact} disabled={status === 'sending'} emailError={emailError}
      intro="Leave your details and we will write when the library is added. Both are optional. We delete them after 90 days."
      onChange={next => { setContact(next); if (status !== 'sending') setStatus('idle'); }} />
    {status === 'failed' && <p className="library-line" role="alert">Couldn’t send. Try again.</p>}
    {status === 'limited' && <p className="library-line" role="alert">Too many requests. Try again later.</p>}
    {status === 'refused' && <p className="library-line" role="alert">Couldn’t send this. Check the library name and the email.</p>}
    <button type="submit" className="home-button library-request-send" disabled={status === 'sending'} aria-busy={status === 'sending' || undefined}>
      {status === 'sending' ? 'Sending…' : 'Send request'}
    </button>
    <button type="button" className="home-text-button library-request-cancel" onClick={onCancel}>Cancel</button>
    <p className="form-footnote">Nothing is sent until you press Send request. See our <a href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>.</p>
  </form>;
}
