import { Link, useLocation } from "react-router-dom";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import { useLibrary } from "../../context";
import { ACCOUNT_ENTRY_PATH } from "../desk/layoutMode";
import { MergeOffer } from "./OneShelfAccountPages";

// One line above the screen about the account: checking, signed out, a change
// being saved. When accounts are switched off the reader just uses the app as
// a guest; there is nothing to say and nothing to press. The account forms
// show none of these (they say what they need themselves), so a line never
// enters or leaves above a form.
export function AccountNotice() {
  const location = useLocation();
  const { session, refresh, continueGuest, signOut, dismissSessionEnded } = useAccountSession(),
    library = useLibrary();
  if (session.availability === "disabled") return null;
  const entry = ACCOUNT_ENTRY_PATH.test(location.pathname);
  if (entry && (session.status === "unavailable" || session.availability || session.sessionEnded))
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
            ? "Verify your email before using your reading shelf."
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
        Using the reading shelf saved in this browser. Server sign-out is still unconfirmed.
        <button className="text-button" onClick={() => void refresh()}>
          Retry sign out
        </button>
      </div>
    );
  if (session.sessionEnded)
    return (
      <div className="account-sync-notice" role="status">
        <span>
          You’ve been signed out. Log in to see your reading shelf, or keep
          using the one saved in this browser.
        </span>
        <Link to="/app/account/sign-in">Log in</Link>
        <button className="text-button" onClick={dismissSessionEnded}>
          Dismiss
        </button>
      </div>
    );
  // Books saved in this browser and an account this browser did not ask to
  // sign in to: asked here once (Welcome asks on its own page).
  if (library.mergeOffer && !entry && location.pathname !== "/app/account/welcome")
    return <MergeOffer className="account-sync-notice account-merge-offer" />;
  if (!library.mutationNotice) return null;
  return (
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
      ) : !library.pending && library.mutationError ? (
        <button onClick={library.reloadShelf}>Refresh account</button>
      ) : null}
    </div>
  );
}
