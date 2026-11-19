import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; name: string };

/**
 * A password field with an eye button that shows or hides what was typed
 * (plan B1, CreateAccount / LogIn / DeleteAccount boards). No rules and no
 * helper text under it. The button says what it will do ("Show password",
 * "Hide password") and aria-pressed says whether the password is shown.
 */
export function PasswordInput({ id, name, className, ...input }: Props) {
  const [shown, setShown] = useState(false);
  return <div className={'password-input' + (className ? ' ' + className : '')}>
    <input {...input} id={id} name={name} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
    <button type="button" className="password-eye" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} aria-controls={id}
      onClick={() => setShown(value => !value)}>
      {shown ? <EyeOffGlyph /> : <EyeGlyph />}
    </button>
  </div>;
}

function EyeGlyph() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>;
}

function EyeOffGlyph() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" />
  </svg>;
}
