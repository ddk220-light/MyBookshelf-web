import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { accountRequest } from '../../auth/accountClient';
import { dismissAccountInvite, readOneShelfState } from '../../oneShelfState';

/**
 * "Take your shelf with you": shown to guests once they have saved a book,
 * only when the service can create email accounts. "Not now" hides it for good.
 */
export function shouldInviteAccount({ guest, savedCount, emailAccounts, dismissed }: { guest: boolean; savedCount: number; emailAccounts: boolean | null; dismissed: boolean }): boolean {
  return guest && savedCount > 0 && emailAccounts === true && !dismissed;
}

export function AccountInvite({ savedCount }: { savedCount: number }) {
  const { session } = useAccountSession();
  const guest = session.status === 'guest';
  const [dismissed, setDismissed] = useState(() => Boolean(readOneShelfState().accountInviteDismissed));
  const [emailAccounts, setEmailAccounts] = useState<boolean | null>(null);
  const wanted = guest && savedCount > 0 && !dismissed;
  useEffect(() => {
    if (!wanted || emailAccounts !== null) return;
    const controller = new AbortController();
    accountRequest<{ email?: unknown }>('/capabilities', { signal: controller.signal })
      .then(value => setEmailAccounts(value.email === true))
      .catch(() => { if (!controller.signal.aborted) setEmailAccounts(false); });
    return () => controller.abort();
  }, [wanted, emailAccounts]);
  if (!shouldInviteAccount({ guest, savedCount, emailAccounts, dismissed })) return null;
  return <section className="account-invite" aria-labelledby="account-invite-heading">
    <div className="account-invite-text">
      <h2 id="account-invite-heading">Take your shelf with you</h2>
      <p>Open it on any phone or computer.</p>
    </div>
    <div className="account-invite-actions">
      <Link className="home-button" to="/app/account/sign-up">Create a free account</Link>
      <button type="button" className="home-text-button" onClick={() => { dismissAccountInvite(); setDismissed(true); document.getElementById('my-shelf-heading')?.focus({ preventScroll: true }); }}>Not now</button>
    </div>
  </section>;
}
