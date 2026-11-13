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
  AccountApiError,
  safeAccountReturn,
} from "../../auth/accountClient";
import { useLibrary } from "../../context";
import { readAnonymousWebStateWithStatus } from "../../localState";
import { removeAcknowledgedDeviceCopy } from "../../storage/importCleanup";
import { useLinkToken } from "../../auth/LinkTokenProvider";
import { ProviderEntry } from "./ProviderEntry";
import { useAccountEntryPending } from "../../auth/entryReadiness";
import {
  useRecentAuth,
  type RecentResult,
} from "../../auth/RecentAuthProvider";
import { BackLink, FormAlert } from "../panel/PanelPage";

export function AccountForm({
  title,
  children,
  onSubmit,
  busy,
  error,
  noValidate = false,
  formRef,
}: {
  title: string;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  busy?: boolean;
  error?: ReactNode;
  noValidate?: boolean;
  formRef?: RefObject<HTMLFormElement>;
}) {
  const entryPending = useAccountEntryPending();
  // The AccountStates board's layout: Back, serif heading, one-line errors.
  const heading = useId(),
    headingRef = useRef<HTMLHeadingElement>(null),
    previousTitle = useRef(title);
  useEffect(() => {
    document.title = title + " — MyBookshelf";
    if (previousTitle.current !== title) {
      previousTitle.current = title;
      headingRef.current?.focus();
    }
  }, [title]);
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
          aria-labelledby={heading}
          onClickCapture={guardDoubleTap}
          onSubmit={(event) => {
            if (entryPending) event.preventDefault();
            else if (onSubmit) onSubmit(event);
            else event.preventDefault();
          }}
          aria-busy={busy || entryPending}
          noValidate={noValidate}
        >
          <h1 id={heading} ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
          {error && <FormAlert>{error}</FormAlert>}
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
  error,
  id: inputId,
}: {
  label?: string;
  autoComplete?: string;
  name?: string;
  hint?: string;
  error?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false),
    generatedId = useId(),
    id = inputId || generatedId;
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
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            error ? id + "-error" : hint ? id + "-hint" : undefined
          }
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
      {error && (
        <small className="account-field-error" id={id + "-error"}>
          {error}
        </small>
      )}
    </div>
  );
}
export function EmailField({
  label = "Email",
  error,
  id: inputId,
}: { label?: string; error?: string; id?: string } = {}) {
  const generatedId = useId(),
    id = inputId || generatedId;
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
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? id + "-error" : undefined}
      />
      {error && (
        <small className="account-field-error" id={id + "-error"}>
          {error}
        </small>
      )}
    </div>
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
  // One-shelf (plan 4.7, section 9 row 5): guest Viewed before comes over
  // with the saved books; there is no separate history checkbox.
  const history = true;
  const [deviceLibrary, setDeviceLibrary] = useState(false),
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
      if (!alive.current) return;
      if (!result) {
        setError(
          "Couldn’t confirm the import. Your browser copy is unchanged. Retry this import to check the same request.",
        );
        return;
      }
      let suffix = "Your copy in this browser is unchanged.";
      if (remove) {
        const retained = history
          ? await accountRequest<{ books: Array<{ bookKey: string }> }>(
              "/history",
              { identity: session.user?.id },
            )
          : { books: [] };
        if (!alive.current) return;
        const cleaned = await removeAcknowledgedDeviceCopy(frozen.state, {
          includeHistory: history,
          deviceLibrary,
          retainedHistory: new Set(retained.books.map((b) => b.bookKey)),
          isCurrent: () => alive.current,
        });
        if (!alive.current) return;
        suffix = cleaned
          ? "Removed unchanged imported copies here. Any newer device changes were kept."
          : "Imported successfully. The copy here could not be removed; it is still safe to keep it.";
      }
      setDone(
        `${result.savedAdded} saved ${result.savedAdded === 1 ? "book" : "books"} imported. ${result.historyAccepted} recent ${result.historyAccepted === 1 ? "book" : "books"} accepted${result.historyExpired ? `; ${result.historyExpired} older entries skipped` : ""}. ${suffix}`,
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
            {frozen.state.savedBooks.length} saved{" "}
            {frozen.state.savedBooks.length === 1 ? "book" : "books"} ·{" "}
            {frozen.state.recentBooks.length} recent{" "}
            {frozen.state.recentBooks.length === 1 ? "book" : "books"}
          </p>
          {frozen.state.savedContent.length>0&&<p>Free books and papers stay on this browser’s shelf. They are not included in this account import.</p>}
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
          {frozen.state.selectedLibraryId && (
            <label className="account-check">
              <input
                type="checkbox"
                checked={deviceLibrary}
                disabled={busy || library.pendingImportId === id}
                onChange={(event) => setDeviceLibrary(event.target.checked)}
              />
              Use this browser’s library instead of my account library
            </label>
          )}
          <label className="account-check">
            <input
              type="checkbox"
              checked={remove}
              disabled={busy || library.pendingImportId === id}
              onChange={(event) => setRemove(event.target.checked)}
            />
            Remove the copy here after the import is confirmed
          </label>
          <button
            disabled={
              busy ||
              (library.recoveryMode && library.pendingImportId !== id) ||
              frozen.status !== "ok" ||
              bytes > 2 * 1024 * 1024
            }
          >
            {busy
              ? "Importing…"
              : library.pendingImportId === id
                ? "Retry import"
                : "Bring books over"}
          </button>
          <button
            type="button"
            className="button-quiet"
            disabled={busy}
            onClick={() => navigate("/app/shelf", { replace: true })}
          >
            {library.pendingImportId === id
              ? "Check later"
              : "Keep them here for now"}
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

/** Where a fresh sign-in goes: the import step when this browser holds guest data, else returnTo. */
export function afterProviderSignIn(returnTo: string) {
  const guest = readAnonymousWebStateWithStatus().state;
  return guest.savedBooks.length ||
    guest.recentBooks.length ||
    guest.selectedLibraryId
    ? "/app/account/import"
    : returnTo;
}
export function ProviderReturnPage() {
  const account = useAccountSession(),
    location = useLocation(),
    navigate = useNavigate();
  const recent = useRecentAuth();
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
        ? "This email belongs to an existing account. Sign in with its current method, then connect the provider from account settings."
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
      const flowId = new URLSearchParams(location.search).get("flow");
      if (flowId) {
        const result = await accountRequest<
          RecentResult & { kind: "confirmed" | "linked" }
        >("/provider/result", {
          method: "POST",
          identity: checked.user?.id,
          csrf: checked.csrfToken,
          body: { flowId },
        });
        if (!alive.current) return;
        if (result.kind === "confirmed") recent.set(result, checked);
        navigate("/app/settings/account", { replace: true, state: null });
        return;
      }
      const destination = safeAccountReturn(
        new URLSearchParams(location.search).get("returnTo"),
      );
      navigate(
        checked.needsProfileCompletion
          ? "/app/account/complete-profile?returnTo=" +
              encodeURIComponent(destination)
          : afterProviderSignIn(destination),
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
            Your provider has returned you to MyBookshelf. Continue to check
            your account and choose what to bring over from this browser.
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
        afterProviderSignIn(
          safeAccountReturn(
            new URLSearchParams(location.search).get("returnTo"),
          ),
        ),
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
