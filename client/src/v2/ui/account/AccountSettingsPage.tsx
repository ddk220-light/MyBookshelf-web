import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { accountRequest, AccountApiError } from "../../auth/accountClient";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import { useLibrary } from "../../context";
import { ConfirmDialog } from "../ConfirmDialog";
import { PasswordField, EmailField } from "./AccountPages";

type Profile = {
  name: string;
  email: string;
  profileRevision: number;
  pendingEmail?: { email: string; expiresAt: string } | null;
  methods: Array<{
    provider: "password" | "google" | "apple";
    usable: boolean;
  }>;
};
type Device = {
  id: string;
  device: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
};
type Sensitive = {
  action: "password-change" | "session-revoke" | "signout-all" | "email-change";
  target?: string;
  label: string;
};
type Proof = { proof: string; csrfToken: string };
export function AccountSettingsPage() {
  const account = useAccountSession(),
    library = useLibrary(),
    navigate = useNavigate();
  const sessionRef = useRef(account.session);
  sessionRef.current = account.session;
  const [profile, setProfile] = useState<Profile | null>(null),
    [devices, setDevices] = useState<Device[]>([]),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [action, setAction] = useState<Sensitive | null>(null),
    [proof, setProof] = useState<Proof | null>(null),
    [clear, setClear] = useState(false);
  const password = useRef(""),
    alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const [profile, devices] = await Promise.all([
        accountRequest<Profile>("/profile", {
          identity: sessionRef.current.user?.id,
        }),
        accountRequest<{ sessions: Device[] }>("/sessions", {
          identity: sessionRef.current.user?.id,
        }),
      ]);
      if (alive.current) {
        setProfile(profile);
        setName(profile.name);
        setDevices(devices.sessions);
      }
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t load account settings.",
        );
      if (
        failure instanceof AccountApiError &&
        (failure.status === 401 || failure.code === "IDENTITY_CHANGED")
      )
        account.invalidate();
    }
  }, [account.invalidate]);
  useEffect(() => {
    alive.current = true;
    if (account.session.status === "authenticated") void load();
    return () => {
      alive.current = false;
      password.current = "";
    };
  }, [load, account.session.status]);
  const begin = (next: Sensitive) => {
    setError("");
    setNotice("");
    setProof(null);
    password.current = "";
    setAction(next);
  };
  const cancel = () => {
    setAction(null);
    setProof(null);
    password.current = "";
    setError("");
  };
  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !action) return;
    setBusy(true);
    setError("");
    const value = String(
      new FormData(event.currentTarget).get("password") || "",
    );
    try {
      const result = await accountRequest<Proof>("/reauth/password", {
        method: "POST",
        body: { password: value, action: action.action },
        csrf: sessionRef.current.csrfToken,
      });
      if (alive.current) {
        password.current = action.action === "password-change" ? value : "";
        setProof(result);
      }
      await account.refresh(true);
      await load();
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t confirm it’s you.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const finish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !proof || !action) return;
    setBusy(true);
    setError("");
    try {
      const newPassword = String(
        new FormData(event.currentTarget).get("password") || "",
      );
      const path =
        action.action === "password-change"
          ? "/password"
          : action.action === "email-change"
            ? "/email-change"
            : action.action === "session-revoke"
              ? "/sessions/revoke"
              : "/sign-out-all";
      await accountRequest(path, {
        method: "POST",
        csrf: proof.csrfToken,
        body:
          action.action === "password-change"
            ? {
                password: newPassword,
                currentPassword: password.current,
                proof: proof.proof,
              }
            : action.action === "email-change"
              ? {
                  newEmail: String(
                    new FormData(event.currentTarget).get("email") || "",
                  ),
                  proof: proof.proof,
                }
              : action.action === "session-revoke"
                ? { sessionId: action.target, proof: proof.proof }
                : { proof: proof.proof },
      });
      if (!alive.current) return;
      password.current = "";
      setProof(null);
      setAction(null);
      setNotice(
        action.action === "password-change"
          ? "Password updated. Other devices were signed out."
          : action.action === "email-change"
            ? "Check your new address. Your current email stays valid until you confirm the change."
            : action.action === "session-revoke"
              ? "Signed out that device."
              : "Signed out all devices.",
      );
      await account.refresh(action.action === "password-change");
      await load();
      library.reloadShelf();
      if (action.action === "signout-all")
        navigate("/app/shelf", { replace: true, state: null });
    } catch (failure) {
      if (alive.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t finish this change.",
        );
        if (
          failure instanceof AccountApiError &&
          failure.code === "RECENT_AUTH_REQUIRED"
        ) {
          setProof(null);
          password.current = "";
        }
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await accountRequest<{
        name: string;
        profileRevision: number;
      }>("/profile", {
        method: "PATCH",
        body: { name, profileRevision: profile.profileRevision },
        csrf: sessionRef.current.csrfToken,
      });
      if (alive.current) {
        setProfile({ ...profile, ...result });
        setNotice("Name saved");
      }
      await account.refresh();
      library.reloadShelf();
    } catch (failure) {
      if (alive.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t save your name.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (account.session.status !== "authenticated")
    return (
      <section className="page-section">
        <h1>Your account</h1>
        <p>Sign in to manage your private account.</p>
        <Link to="/app/account/sign-in">Sign in</Link>
      </section>
    );
  return (
    <section className="page-section account-settings-page">
      <Link className="back-link" to="/app/settings">
        ← Settings
      </Link>
      <header className="page-heading">
        <h1>Your account</h1>
      </header>
      {error && !action && (
        <p role="alert" className="account-error">
          {error}
          <button className="text-button" onClick={() => void load()}>
            Refresh settings
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!profile ? (
        <p role="status">Loading account settings…</p>
      ) : (
        <>
          <section aria-labelledby="private-profile">
            <h2 id="private-profile" className="settings-label">
              Private details
            </h2>
            <form
              className="account-form"
              onSubmit={(event) => void saveName(event)}
            >
              <div className="account-field">
                <label htmlFor="private-name">Your name</label>
                <input
                  id="private-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={160}
                  required
                />
              </div>
              <p className="form-hint">
                Only you see this name. It isn’t a public profile.
              </p>
              <button disabled={busy || name === profile.name}>
                {busy ? "Saving…" : "Save name"}
              </button>
              <p>
                Email: <strong>{profile.email}</strong>
              </p>
              <button
                type="button"
                className="button-quiet"
                disabled={busy}
                onClick={() =>
                  begin({ action: "email-change", label: "Change email" })
                }
              >
                Change email
              </button>
              {profile.pendingEmail && (
                <div className="account-card">
                  <p>
                    Waiting for confirmation at{" "}
                    <strong>{profile.pendingEmail.email}</strong>. The link
                    expires{" "}
                    {new Date(profile.pendingEmail.expiresAt).toLocaleString()}.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await accountRequest("/email-change/cancel", {
                          method: "POST",
                          body: {},
                          csrf: sessionRef.current.csrfToken,
                        });
                        await load();
                        setNotice(
                          "Email change cancelled. Your current address is unchanged.",
                        );
                      } catch (failure) {
                        setError(
                          failure instanceof Error
                            ? failure.message
                            : "Couldn’t cancel this change.",
                        );
                      } finally {
                        if (alive.current) setBusy(false);
                      }
                    }}
                  >
                    Cancel email change
                  </button>
                </div>
              )}
            </form>
          </section>
          <section aria-labelledby="login-methods">
            <h2 id="login-methods" className="settings-label">
              Sign-in methods
            </h2>
            <ul>
              {profile.methods.map((method) => (
                <li key={method.provider}>
                  {method.provider === "password"
                    ? "Email and password"
                    : method.provider === "google"
                      ? "Google"
                      : "Apple"}
                  {!method.usable ? " — unavailable" : ""}
                </li>
              ))}
            </ul>
            {profile.methods.some(
              (m) => m.provider === "password" && m.usable,
            ) && (
              <button
                className="button-quiet"
                onClick={() =>
                  begin({ action: "password-change", label: "Change password" })
                }
              >
                Change password
              </button>
            )}
          </section>
          <section aria-labelledby="history-controls">
            <h2 id="history-controls" className="settings-label">
              Recently viewed
            </h2>
            <p>
              {library.historyEnabled
                ? "On: remember the newest 50 books you open for up to 30 days."
                : "Paused: opening books won’t add to your account history. Previously stored books stay until they expire or you remove them."}
            </p>
            <button
              role="switch"
              aria-checked={Boolean(library.historyEnabled)}
              disabled={library.recoveryMode}
              onClick={() =>
                void library.setHistoryEnabled?.(!library.historyEnabled)
              }
            >
              {library.historyEnabled
                ? "Pause recently viewed"
                : "Turn on recently viewed"}
            </button>
            <button
              className="text-button"
              disabled={library.recoveryMode}
              onClick={() => setClear(true)}
            >
              Clear recently viewed
            </button>
          </section>
          <section aria-labelledby="signed-in-devices">
            <h2 id="signed-in-devices" className="settings-label">
              Signed-in devices
            </h2>
            <ul className="account-devices">
              {devices.map((device) => (
                <li key={device.id}>
                  <strong>
                    {device.device}
                    {device.current ? " · This device" : ""}
                  </strong>
                  <p>
                    Signed in {new Date(device.createdAt).toLocaleDateString()}
                  </p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      device.current
                        ? void account.signOut()
                        : begin({
                            action: "session-revoke",
                            target: device.id,
                            label: "Sign out this device",
                          })
                    }
                  >
                    Sign out{device.current ? " here" : ""}
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="button-destructive"
              onClick={() =>
                begin({ action: "signout-all", label: "Sign out all devices" })
              }
            >
              Sign out all devices
            </button>
          </section>
          <p>
            <a href="/privacy#website">Privacy policy</a>
          </p>
        </>
      )}
      <ConfirmDialog
        open={clear}
        title="Clear recently viewed?"
        body={
          <p>
            This removes account history on every device. Your saved books stay.
          </p>
        }
        confirmLabel="Clear recently viewed"
        cancelLabel="Cancel"
        pending={library.pending}
        onConfirm={async () => {
          if (await library.clearRecentBooks()) setClear(false);
        }}
        onCancel={() => setClear(false)}
      />
      {action && (
        <AccountActionDialog
          action={action}
          proof={proof}
          busy={busy}
          error={error}
          onCancel={cancel}
          onConfirm={confirm}
          onFinish={finish}
        />
      )}
    </section>
  );
}
function AccountActionDialog({
  action,
  proof,
  busy,
  error,
  onCancel,
  onConfirm,
  onFinish,
}: {
  action: Sensitive;
  proof: Proof | null;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onFinish: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    previous = useRef<Element | null>(null);
  useEffect(() => {
    previous.current = document.activeElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="cream-dialog"
      aria-labelledby="sensitive-title"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="sensitive-title">{proof ? action.label : "Confirm it’s you"}</h2>
      <form
        className="account-form"
        onSubmit={(event) => void (proof ? onFinish(event) : onConfirm(event))}
      >
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {!proof ? (
          <>
            <p>
              Confirm your password to continue. You’ll review the change before
              it happens.
            </p>
            <PasswordField />
          </>
        ) : action.action === "email-change" ? (
          <>
            <p>
              We’ll verify the new address before changing your login email and
              notify your current address now.
            </p>
            <EmailField label="New email" />
          </>
        ) : action.action === "password-change" ? (
          <PasswordField
            label="New password"
            autoComplete="new-password"
            hint="Use 15–128 characters."
          />
        ) : (
          <p>
            {action.action === "signout-all"
              ? "Every signed-in device, including this one, will need to sign in again."
              : "This device will need to sign in again."}
          </p>
        )}
        <div className="cream-dialog-actions">
          <button
            className="button-quiet"
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button disabled={busy}>
            {busy ? "Please wait…" : proof ? action.label : "Continue"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
