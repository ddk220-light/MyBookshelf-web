import { useId } from 'react';
import type { ContactDetails } from '../../api';
import './contact.css';

/** One address, as the server takes it (server/catalog-store/requests.js ONE_EMAIL). */
const ONE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const CONTACT_NAME_LIMIT = 80;
export const CONTACT_EMAIL_LIMIT = 254;

/** True when the optional email is empty or one address the server will take. */
export function emailIsUsable(value: string | undefined): boolean {
  const email = (value || '').trim();
  return !email || (email.length <= CONTACT_EMAIL_LIMIT && ONE_EMAIL.test(email));
}

/**
 * "Want a reply?" (RequestLibrary and ReportProblem boards): an optional name
 * and email, both kept for 90 days and sent only with the form they sit in.
 * They are held in the form's state, never in browser storage.
 */
export function ContactFields({ value, onChange, intro, emailError = false, disabled = false }: {
  value: ContactDetails;
  onChange: (next: ContactDetails) => void;
  /** The line after "Want a reply?", ending with the 90-day promise. */
  intro: string;
  emailError?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return <div className="contact-fields" role="group" aria-labelledby={id + '-intro'}>
    <p className="contact-intro" id={id + '-intro'}><strong>Want a reply?</strong> {intro}</p>
    <div className="contact-field">
      <label htmlFor={id + '-name'}>Your name (optional)</label>
      <input id={id + '-name'} name="name" autoComplete="name" maxLength={CONTACT_NAME_LIMIT} disabled={disabled}
        value={value.name || ''} onChange={event => onChange({ ...value, name: event.target.value })} />
    </div>
    <div className="contact-field">
      <label htmlFor={id + '-email'}>Your email (optional)</label>
      <input id={id + '-email'} name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} maxLength={CONTACT_EMAIL_LIMIT} disabled={disabled}
        aria-invalid={emailError || undefined} aria-describedby={emailError ? id + '-email-error' : undefined}
        value={value.email || ''} onChange={event => onChange({ ...value, email: event.target.value })} />
      {emailError && <small className="contact-error" id={id + '-email-error'}>Check the email address, or leave it empty.</small>}
    </div>
  </div>;
}
