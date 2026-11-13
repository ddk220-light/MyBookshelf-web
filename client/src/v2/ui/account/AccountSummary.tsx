import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import { useLibrary } from "../../context";

export function AccountSummary() {
  const { session, signOut, refresh, continueGuest } = useAccountSession(),
    navigate = useNavigate();
  return (
    <section className="account-card" aria-labelledby="account-summary-title">
      <h2 id="account-summary-title">
        {session.status === "authenticated"
          ? "Your account"
          : "Keep your shelf across devices"}
      </h2>
      {session.status === "authenticated" ? (
        <>
          <p>
            <strong>{session.user?.name}</strong>
            <br />
            {session.user?.email}
          </p>
          <p>
            Your library and saved books sync when changes are confirmed.
            Reading history is your choice.
          </p>
          <div className="account-actions">
            <Link to="/app/settings/account">Manage account</Link>
            <Link to="/app/account/import">Bring books from this browser</Link>
            <button
              className="text-button"
              onClick={() => {
                void signOut();
                navigate("/app/shelf", { replace: true, state: null });
              }}
            >
              Sign out
            </button>
          </div>
        </>
      ) : session.status === "checking" ? (
        <p role="status">Checking your account…</p>
      ) : session.status === "guest" && !session.availability ? (
        <>
          <p>
            A free account keeps your library and saved books on every device.
            Your shelf here keeps working without one.
          </p>
          <div className="account-actions">
            <Link className="button-link" to="/app/account/sign-up">
              Create account
            </Link>
            <Link to="/app/account/sign-in">Sign in</Link>
          </div>
        </>
      ) : (
        <>
          <p>
            Accounts aren’t available right now. You can keep browsing and use
            this browser’s shelf.
          </p>
          <div className="account-actions">
            <button onClick={() => void refresh()}>Try again</button>
            <button className="button-quiet" onClick={continueGuest}>
              Continue using this browser
            </button>
            <Link to="/app/account/sign-in">Sign in</Link>
          </div>
        </>
      )}
    </section>
  );
}
// When accounts are switched off the reader just uses the app as a guest;
// there is nothing to say and nothing to press.
export function AccountNotice() {
  const location = useLocation();
  const { session, refresh, continueGuest, signOut } = useAccountSession(),
    library = useLibrary();
  if (session.availability === "disabled") return null;
  const entry =
    /^\/app\/account\/(sign-up|sign-in|forgot-password|reset-password|verify)$/.test(
      location.pathname,
    );
  if (entry && (session.status === "unavailable" || session.availability))
    return null;
  if (session.status === "checking")
    return (
      <div className="account-sync-notice" role="status">
        Checking your account…
        <button className="text-button" onClick={continueGuest}>
          Continue using this browser
        </button>
      </div>
    );
  if (session.status === "signout-unconfirmed")
    return (
      <div className="account-sync-notice" role="alert">
        <span>
          Couldn’t finish signing out. Account content is hidden on this
          browser.
        </span>
        <button onClick={() => void signOut()}>Retry sign out</button>
        <button className="button-quiet" onClick={continueGuest}>
          Continue as guest
        </button>
      </div>
    );
  if (session.status === "unavailable" || session.status === "unverified")
    return (
      <div className="account-sync-notice" role="status">
        <span>
          {session.status === "unverified"
            ? "Verify your email before using your account shelf."
            : "Couldn’t check your account. Your account content is hidden until this is resolved."}
        </span>
        <button onClick={() => void refresh()}>Try again</button>
        <button className="button-quiet" onClick={continueGuest}>
          Continue as guest
        </button>
      </div>
    );
  if (session.logoutPending)
    return (
      <div className="account-sync-notice" role="status">
        Using this browser’s shelf. Server sign-out is still unconfirmed.
        <button className="text-button" onClick={() => void refresh()}>
          Retry sign out
        </button>
      </div>
    );
  if (session.sessionEnded)
    return (
      <div className="account-sync-notice" role="status">
        <span>
          You’ve been signed out. Sign in to see your account shelf, or continue
          with this browser’s shelf.
        </span>
        <Link to="/app/account/sign-in">Sign in</Link>
        <button className="text-button" onClick={() => void refresh()}>
          Continue as guest
        </button>
      </div>
    );
  if (library.loadingAccount)
    return (
      <div className="account-sync-notice" role="status">
        Loading your account shelf…
      </div>
    );
  return library.mutationNotice ? (
    <div
      className="account-sync-notice"
      role="status"
      aria-busy={library.pending}
    >
      <span>{library.mutationNotice}</span>
      {library.retryMutation ? (
        <button
          onClick={() => void library.retryMutation?.()}
          disabled={library.pending}
        >
          Retry change
        </button>
      ) : !library.pending && library.mutationNotice !== "Saved" ? (
        <button onClick={library.reloadShelf}>Refresh account</button>
      ) : null}
    </div>
  ) : null;
}
