import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import {
  accountRequest,
  AccountApiError,
  safeAccountReturn,
} from "../../auth/accountClient";
import { useLibrary } from "../../context";
import { readAnonymousWebStateWithStatus } from "../../localState";
import { removeAcknowledgedDeviceCopy } from "../../storage/importCleanup";
import { useLinkToken } from "../../auth/LinkTokenProvider";

export function AccountForm({
  title,
  children,
  onSubmit,
  busy,
  error,
}: {
  title: string;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: string;
}) {
  const heading = useId(),
    errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <section className="page-section account-page">
      <Link className="back-link" to="/app/settings">
        ← Settings
      </Link>
      <form
        className="account-form"
        aria-labelledby={heading}
        onSubmit={onSubmit || ((event) => event.preventDefault())}
        aria-busy={busy}
      >
        <h1 id={heading}>{title}</h1>
        {error && (
          <p
            className="account-error"
            ref={errorRef}
            tabIndex={-1}
            role="alert"
          >
            {error}
          </p>
        )}
        {children}
      </form>
    </section>
  );
}
export function PasswordField({
  label = "Password",
  autoComplete = "current-password",
  name = "password",
  hint,
}: {
  label?: string;
  autoComplete?: string;
  name?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false),
    id = useId();
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      <div className="account-password">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          aria-describedby={hint ? id + "-hint" : undefined}
        />
        <button
          type="button"
          className="button-quiet"
          aria-label={(show ? "Hide " : "Show ") + label.toLowerCase()}
          aria-pressed={show}
          onClick={() => setShow(!show)}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function EmailField({ label = "Email" }: { label?: string } = {}) {
  const id = useId();
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
    </div>
  );
}
export function SignInPage({ signup = false }: { signup?: boolean }) {
  const { refresh, continueGuest, prepareSignIn } = useAccountSession(),
    navigate = useNavigate(),
    location = useLocation();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [sent, setSent] = useState(false),
    [email, setEmail] = useState("");
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
    const data = new FormData(event.currentTarget),
      address = String(data.get("email") || "");
    setBusy(true);
    setError("");
    setEmail(address);
    if (!signup) prepareSignIn();
    try {
      const result = await accountRequest<{ returnTo?: string }>(
        signup ? "/sign-up" : "/sign-in",
        {
          method: "POST",
          body: {
            email: address,
            password: String(data.get("password") || ""),
            ...(signup
              ? { name: String(data.get("name") || "") }
              : {
                  returnTo: safeAccountReturn(
                    new URLSearchParams(location.search).get("returnTo"),
                  ),
                }),
          },
        },
      );
      if (!alive.current) return;
      if (signup) {
        setSent(true);
        return;
      }
      // Session publication deliberately remounts private screens. No email is put in history state.
      const checked = await refresh(true);
      if (!alive.current) return;
      if (checked.status !== "authenticated")
        throw new AccountApiError(
          "ACCOUNT_UNAVAILABLE",
          "Couldn’t check your account. Try again or continue using this browser.",
        );
      const destination = safeAccountReturn(result.returnTo || null),
        guest = readAnonymousWebStateWithStatus().state;
      navigate(
        guest.savedBooks.length ||
          guest.recentBooks.length ||
          guest.selectedLibraryId
          ? "/app/account/import"
          : destination,
        { replace: true, state: null },
      );
    } catch (failure) {
      if (alive.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not finish. Try again.",
        );
        setErrorCode(failure instanceof AccountApiError ? failure.code : "");
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const resend = async () => {
    if (!email || busy) return;
    setBusy(true);
    setError("");
    try {
      await accountRequest("/resend-verification", {
        method: "POST",
        body: { email },
      });
      if (alive.current) setSent(true);
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error ? failure.message : "Could not send a link.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (sent)
    return (
      <AccountForm title="Check your email" busy={busy} error={error}>
        <p>
          Check <strong>{email}</strong> for the next step. Verification links
          work for 24 hours.
        </p>
        <p>Check your spam folder if the email hasn’t arrived.</p>
        <button type="button" disabled={busy} onClick={() => void resend()}>
          {busy ? "Sending…" : "Send a new link"}
        </button>
        <Link to="/app/account/sign-in">Sign in after verifying</Link>
        <button
          type="button"
          className="button-quiet"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </AccountForm>
    );
  return (
    <AccountForm
      title={signup ? "Create account" : "Sign in"}
      onSubmit={(event) => void submit(event)}
      busy={busy}
      error={error}
    >
      {signup && (
        <>
          <p>
            Keep your library and saved books across devices. Your name stays
            private.
          </p>
          <div className="account-field">
            <label htmlFor="account-private-name">Your name</label>
            <input
              id="account-private-name"
              name="name"
              autoComplete="name"
              required
              maxLength={160}
            />
          </div>
        </>
      )}
      <EmailField />
      <PasswordField
        autoComplete={signup ? "new-password" : "current-password"}
        hint={
          signup
            ? "Use 15–128 characters. Spaces and paste are welcome."
            : undefined
        }
      />
      {!signup && (
        <Link className="text-link" to="/app/account/forgot-password">
          Forgot password?
        </Link>
      )}
      <button disabled={busy} type="submit">
        {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
      </button>
      {errorCode === "VERIFY_EMAIL_REQUIRED" && (
        <button
          type="button"
          className="button-quiet"
          disabled={busy}
          onClick={() => void resend()}
        >
          Send verification link
        </button>
      )}
      <Link
        className="text-link"
        to={signup ? "/app/account/sign-in" : "/app/account/sign-up"}
      >
        {signup
          ? "Already have an account? Sign in"
          : "New here? Create account"}
      </Link>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          continueGuest();
          navigate("/app/shelf", { replace: true, state: null });
        }}
      >
        Continue using this browser
      </button>
    </AccountForm>
  );
}
export function VerifyPage() {
  const token = useLinkToken(),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return (
    <AccountForm
      title={done ? "Email verified" : "Verify your email"}
      busy={busy}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void accountRequest("/verify-email", {
          method: "POST",
          body: { token },
        })
          .then(() => setDone(true))
          .catch((failure) =>
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not verify this link.",
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      {done ? (
        <>
          <p>Your email is verified. Sign in to continue.</p>
          <Link className="button-link" to="/app/account/sign-in">
            Sign in
          </Link>
        </>
      ) : token ? (
        <>
          <p>
            Continue to confirm this email address. Opening this page does not
            use the link.
          </p>
          <button disabled={busy}>
            {busy ? "Verifying…" : "Verify email"}
          </button>
        </>
      ) : (
        <p>
          This link is missing or was already opened here. Request a new link
          from sign in.
        </p>
      )}
      <Link to="/app/account/sign-in">Back to sign in</Link>
    </AccountForm>
  );
}
export function RecoveryPage({ reset = false }: { reset?: boolean }) {
  const token = useLinkToken(),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await accountRequest(reset ? "/reset-password" : "/forgot-password", {
        method: "POST",
        body: reset
          ? { token, password: String(data.get("password") || "") }
          : { email: String(data.get("email") || "") },
      });
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not finish. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <AccountForm
      title={
        done
          ? reset
            ? "Password updated"
            : "Check your email"
          : reset
            ? "Choose a new password"
            : "Forgot password?"
      }
      busy={busy}
      error={error}
      onSubmit={(event) => void submit(event)}
    >
      {done ? (
        <p>
          {reset
            ? "Sign in again. Existing devices were signed out."
            : "If this address can receive a reset link, we’ll send one. Reset links work for 30 minutes."}
        </p>
      ) : reset ? (
        <>
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint="Use 15–128 characters."
          />
          <button disabled={busy || !token}>
            {busy ? "Updating…" : "Update password"}
          </button>
          {!token && <p>This link is missing. Request a new reset link.</p>}
        </>
      ) : (
        <>
          <p>We’ll email the next step if this address can receive it.</p>
          <EmailField />
          <button disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </>
      )}
      <Link to="/app/account/sign-in">Back to sign in</Link>
    </AccountForm>
  );
}
export function ImportPage() {
  const { session } = useAccountSession(),
    library = useLibrary(),
    navigate = useNavigate();
  const [frozen] = useState(() =>
      structuredClone(readAnonymousWebStateWithStatus()),
    ),
    [id] = useState(() => crypto.randomUUID());
  const [history, setHistory] = useState(false),
    [deviceLibrary, setDeviceLibrary] = useState(false),
    [remove, setRemove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const bytes = new TextEncoder().encode(
    JSON.stringify(frozen.state),
  ).byteLength;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !library.importGuest) return;
    setBusy(true);
    setError("");
    try {
      const result = await library.importGuest(
        id,
        frozen.state,
        history,
        deviceLibrary ? "use-device" : "keep-account",
      );
      if (!result || !alive.current) return;
      let suffix = "Your copy in this browser is unchanged.";
      if (remove) {
        const retained = history
          ? await accountRequest<{ books: Array<{ bookKey: string }> }>(
              "/history",
              { identity: session.user?.id },
            )
          : { books: [] };
        if (!alive.current) return;
        const cleaned = removeAcknowledgedDeviceCopy(frozen.state, {
          includeHistory: history,
          deviceLibrary,
          retainedHistory: new Set(retained.books.map((b) => b.bookKey)),
        });
        suffix = cleaned
          ? "Removed unchanged imported copies here. Any newer device changes were kept."
          : "Imported successfully. The copy here could not be removed; it is still safe to keep it.";
      }
      setDone(
        `${result.savedAdded} saved books imported. ${result.historyAccepted} recent books accepted${result.historyExpired ? `; ${result.historyExpired} older entries skipped` : ""}. ${suffix}`,
      );
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Import could not finish. Your device copy is unchanged.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (session.status !== "authenticated")
    return (
      <AccountForm title="Bring books over">
        <p>Sign in to choose what to bring into your account.</p>
        <Link to="/app/account/sign-in">Sign in</Link>
      </AccountForm>
    );
  return (
    <AccountForm
      title={done ? "Books imported" : "Bring books over"}
      busy={busy}
      error={error}
      onSubmit={(event) => void submit(event)}
    >
      {done ? (
        <>
          <p role="status">{done}</p>
          <Link className="button-link" to="/app/shelf" replace>
            Go to your shelf
          </Link>
        </>
      ) : (
        <>
          <p>
            Bring this browser’s books into{" "}
            <strong>{session.user?.email}</strong>.
          </p>
          <p>
            {frozen.state.savedBooks.length} saved books ·{" "}
            {frozen.state.recentBooks.length} recent books
          </p>
          {frozen.status !== "ok" && (
            <p role="alert">
              The device shelf could not be read safely. Keep it here and
              recover it as a guest before importing.
            </p>
          )}
          {bytes > 2 * 1024 * 1024 && (
            <p role="alert">
              This device snapshot exceeds the 2 MiB import limit. Your copy
              here is unchanged.
            </p>
          )}
          <label className="account-check">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => setHistory(event.target.checked)}
            />
            Include recently viewed books from the last 30 days
          </label>
          <p className="form-hint">
            This does not turn on future reading history.
          </p>
          {frozen.state.selectedLibraryId && (
            <label className="account-check">
              <input
                type="checkbox"
                checked={deviceLibrary}
                onChange={(event) => setDeviceLibrary(event.target.checked)}
              />
              Use this browser’s library instead of my account library
            </label>
          )}
          <label className="account-check">
            <input
              type="checkbox"
              checked={remove}
              onChange={(event) => setRemove(event.target.checked)}
            />
            Remove the copy here after the import is confirmed
          </label>
          <button
            disabled={
              busy ||
              library.recoveryMode ||
              frozen.status !== "ok" ||
              bytes > 2 * 1024 * 1024
            }
          >
            {busy ? "Importing…" : "Bring books over"}
          </button>
          <button
            type="button"
            className="button-quiet"
            disabled={busy}
            onClick={() => navigate("/app/shelf", { replace: true })}
          >
            Keep them here for now
          </button>
        </>
      )}
    </AccountForm>
  );
}

export function EmailChangePage() {
  const token = useLinkToken(),
    account = useAccountSession(),
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
            Your new email is verified and your other signed-in devices were
            signed out. We sent a security notice to your previous address.
          </p>
          <Link className="button-link" to="/app/settings/account" replace>
            Go to your account
          </Link>
        </>
      ) : (
        <>
          <p>
            Your login email changes only when you continue. Other signed-in
            devices will be signed out.
          </p>
          {token ? (
            <button disabled={busy}>
              {busy ? "Confirming…" : "Confirm new email"}
            </button>
          ) : (
            <p>
              This link is missing or was already opened here. Request a new
              change from account settings.
            </p>
          )}
          <Link to="/app/settings/account">Back to your account</Link>
        </>
      )}
    </AccountForm>
  );
}
