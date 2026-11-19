import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import {
  accountRequest,
  safeAccountReturn,
} from "../../auth/accountClient";
import { useLinkToken } from "../../auth/linkToken";
import { useAccountEntryPending } from "../../auth/entryReadiness";
import { BackLink, FormAlert } from "../panel/PanelPage";

/** The heading of an account screen: focused when it changes (a new step), and the page title. */
function useAccountHeading(title: string) {
  const id = useId(),
    ref = useRef<HTMLHeadingElement>(null),
    previous = useRef(title);
  useEffect(() => {
    document.title = title + " — MyBookshelf";
    if (previous.current !== title) {
      previous.current = title;
      ref.current?.focus();
    }
  }, [title]);
  return { id, ref };
}

/**
 * One account form (CreateAccount / DeleteAccount boards): Back, a serif
 * heading, an optional sentence saying what the screen is for, the fields,
 * and what comes after the form.
 */
export function AccountForm({
  title,
  children,
  onSubmit,
  busy,
  error,
  noValidate = false,
  formRef,
  lede,
  after,
}: {
  title: string;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: ReactNode;
  noValidate?: boolean;
  formRef?: RefObject<HTMLFormElement>;
  lede?: ReactNode;
  after?: ReactNode;
}) {
  const entryPending = useAccountEntryPending();
  const heading = useAccountHeading(title);
  const guardDoubleTap = (event: MouseEvent<HTMLFormElement>) => {
    // A submit can collapse the mobile keyboard or replace this form.
    // Ignore the second tap of that gesture if another action moves
    // beneath the pointer. Keyboard activation still has detail 0.
    if (
      event.detail > 1 &&
      event.target instanceof Element &&
      event.target.closest("button, a")
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return (
    <section className="panel-page account-v2">
      <BackLink />
      <form
        ref={formRef}
        className="account-v2-form"
        aria-labelledby={heading.id}
        onClickCapture={guardDoubleTap}
        onSubmit={(event) => {
          if (entryPending) event.preventDefault();
          else if (onSubmit) onSubmit(event);
          else event.preventDefault();
        }}
        aria-busy={busy || entryPending}
        noValidate={noValidate}
      >
        <h1 id={heading.id} ref={heading.ref} tabIndex={-1}>
          {title}
        </h1>
        {lede && <p className="account-lede">{lede}</p>}
        {error && <FormAlert>{error}</FormAlert>}
        {children}
      </form>
      {after && <div className="account-v2-after">{after}</div>}
    </section>
  );
}

/** An account screen that is not one form (Log in has two; Welcome has none). */
export function AccountScreen({
  title,
  children,
  busy,
  className = "",
  icon,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  className?: string;
  icon?: ReactNode;
}) {
  const heading = useAccountHeading(title);
  return (
    <section
      className={"panel-page account-v2 " + className}
      aria-labelledby={heading.id}
      aria-busy={busy || undefined}
    >
      {icon ? <span className="account-icon">{icon}</span> : <BackLink />}
      <div className="account-v2-form">
        <h1 id={heading.id} ref={heading.ref} tabIndex={-1}>
          {title}
        </h1>
        {children}
      </div>
    </section>
  );
}

/** The link in the new address's email: one tap confirms the change. */
export function EmailChangePage() {
  const token = useLinkToken(),
    account = useAccountSession(),
    navigate = useNavigate(),
    location = useLocation(),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await accountRequest("/email-change/confirm", {
        method: "POST",
        body: { token },
      });
      setDone(true);
      // Used: the token leaves the address now (plan B4).
      navigate(location.pathname, { replace: true, state: null });
      await account.refresh(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t confirm this email change.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccountForm
      title={done ? "Email updated" : "Confirm your new email"}
      busy={busy}
      error={error}
      onSubmit={(event) => void submit(event)}
    >
      {done ? (
        <>
          <p>
            Your new email is confirmed. Other devices were logged out, and we
            sent a notice to your previous address.
          </p>
          <Link className="home-button" to="/app/settings/account" replace>
            Go to your account
          </Link>
        </>
      ) : (
        <>
          <p>
            Your email changes only when you continue. Other devices where you
            are logged in will be logged out.
          </p>
          {token ? (
            <button type="submit" className="home-button" disabled={busy}>
              {busy ? "Confirming…" : "Confirm new email"}
            </button>
          ) : (
            <FormAlert>Link expired</FormAlert>
          )}
          <Link className="home-text-button account-v2-link" to="/app/settings/account">
            Back to your account
          </Link>
        </>
      )}
    </AccountForm>
  );
}

export function ProviderReturnPage() {
  const account = useAccountSession(),
    location = useLocation(),
    navigate = useNavigate();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const providerError = new URLSearchParams(location.search).get("error");
  const message =
    providerError === "access_denied"
      ? "Sign-in was cancelled. You can try again or keep using this browser."
      : providerError &&
          [
            "account_not_linked",
            "email_already_in_use",
            "account_already_linked_to_different_user",
          ].includes(providerError)
        ? "This email belongs to an existing account. Log in with its email and password."
        : providerError
          ? "We couldn’t finish provider sign-in. Restart from sign in."
          : "";
  const complete = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const checked = await account.refresh(true);
      if (!alive.current) return;
      if (checked.status !== "authenticated")
        throw Error(
          checked.status === "unverified"
            ? "Your provider did not confirm a verified email. Check your email for a verification link, then sign in again."
            : "Couldn’t check your account. Restart sign-in.",
        );
      const destination = safeAccountReturn(
        new URLSearchParams(location.search).get("returnTo"),
      );
      // The books in this browser join the account on their own (plan B5).
      navigate(
        checked.needsProfileCompletion
          ? "/app/account/complete-profile?returnTo=" +
              encodeURIComponent(destination)
          : destination,
        { replace: true, state: null },
      );
    } catch (failure) {
      if (!alive.current) return;
      setError(
        failure instanceof Error ? failure.message : "Couldn’t finish sign-in.",
      );
      setBusy(false);
    }
  };
  return (
    <AccountForm
      title={
        providerError ? "Sign-in needs another try" : "Continue to your account"
      }
      busy={busy}
      error={message || error}
    >
      {!providerError && (
        <>
          <p>
            Your provider has returned you to MyBookshelf. Continue to open
            your account.
          </p>
          <button type="button" disabled={busy} onClick={() => void complete()}>
            {busy ? "Checking…" : "Continue to my account"}
          </button>
        </>
      )}
      <Link to="/app/account/sign-in" replace>
        Back to sign in
      </Link>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          account.continueGuest();
          navigate("/app/shelf", { replace: true, state: null });
        }}
      >
        Continue using this browser
      </button>
    </AccountForm>
  );
}
export function CompleteProfilePage() {
  const account = useAccountSession(),
    navigate = useNavigate(),
    location = useLocation();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const name = String(new FormData(event.currentTarget).get("name") || "");
    setBusy(true);
    setError("");
    try {
      const profile = await accountRequest<{ profileRevision: number }>(
        "/profile",
        { identity: account.session.user?.id },
      );
      await accountRequest("/profile", {
        method: "PATCH",
        identity: account.session.user?.id,
        csrf: account.session.csrfToken,
        body: { name, profileRevision: profile.profileRevision },
      });
      const checked = await account.refresh();
      if (!alive.current) return;
      if (checked.status !== "authenticated" || checked.needsProfileCompletion)
        throw Error("Couldn’t confirm your name. Try again.");
      navigate(
        safeAccountReturn(new URLSearchParams(location.search).get("returnTo")),
        { replace: true, state: null },
      );
    } catch (failure) {
      if (alive.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t save your name.",
        );
        setBusy(false);
      }
    }
  };
  return (
    <AccountForm
      title="Add your name"
      busy={busy}
      error={error}
      onSubmit={(event) => void submit(event)}
    >
      <p>
        Your provider didn’t share a name. Choose the private name you want to
        use here. Only you can see it.
      </p>
      <div className="account-field">
        <label htmlFor="provider-private-name">Your name</label>
        <input
          id="provider-private-name"
          name="name"
          autoComplete="name"
          required
          maxLength={160}
        />
      </div>
      <button disabled={busy || account.session.status !== "authenticated"}>
        {busy ? "Saving…" : "Save and continue"}
      </button>
      {account.session.status !== "checking" &&
        account.session.status !== "authenticated" && (
          <Link to="/app/account/sign-in">Sign in to continue</Link>
        )}
    </AccountForm>
  );
}
