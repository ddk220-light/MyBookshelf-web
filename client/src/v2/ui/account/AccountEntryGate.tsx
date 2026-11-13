import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccountSession } from "../../auth/AccountSessionProvider";
import { accountRequest } from "../../auth/accountClient";
import { AccountEntryPending } from "../../auth/entryReadiness";
import { AccountForm } from "./AccountPages";
import { ProviderEntry, type AccountCapabilities } from "./ProviderEntry";

type Capabilities = AccountCapabilities & { email: boolean };

// Keep private-identity recovery in the session provider. This boundary only
// prevents entry forms from promising operations the current service cannot run.
export function AccountEntryGate({
  children,
  needsEmail = false,
  allowProviders = false,
}: {
  children: ReactNode;
  needsEmail?: boolean;
  allowProviders?: boolean;
}) {
  const account = useAccountSession(),
    navigate = useNavigate();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const unavailable =
    account.session.status === "unavailable" ||
    Boolean(account.session.availability);
  const checking = account.session.status === "checking";
  useEffect(() => {
    if (!needsEmail || unavailable || checking) return;
    const controller = new AbortController();
    let active = true;
    setCapabilities(null);
    setFailed(false);
    void accountRequest<Capabilities>("/capabilities", {
      signal: controller.signal,
    })
      .then((value) => {
        if (
          typeof value.email !== "boolean" ||
          typeof value.google !== "boolean" ||
          typeof value.apple !== "boolean"
        )
          throw Error("Invalid account capabilities.");
        if (active) setCapabilities(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [needsEmail, unavailable, checking, account.session.epoch, attempt]);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    await account.refresh();
    if (alive.current) {
      setAttempt((value) => value + 1);
      setRetrying(false);
    }
  };
  const continueGuest = () => {
    account.continueGuest();
    navigate("/app/shelf", { replace: true, state: null });
  };
  if (
    unavailable ||
    failed ||
    (needsEmail &&
      capabilities?.email === false &&
      !(allowProviders && (capabilities.google || capabilities.apple)))
  )
    return (
      <AccountForm title="Accounts aren’t available right now" busy={retrying}>
        <p>
          {account.session.availability === "disabled"
            ? "Accounts aren’t enabled here yet. You can keep your books in this browser."
            : needsEmail && capabilities?.email === false
              ? "Email accounts aren’t available right now. You can keep your books in this browser."
              : "We can’t open your account right now. Try again, or keep using this browser’s shelf."}
        </p>
        <button type="button" disabled={retrying} onClick={() => void retry()}>
          {retrying ? "Checking…" : "Try again"}
        </button>
        <button type="button" className="button-quiet" onClick={continueGuest}>
          Continue using this browser
        </button>
        <a href="/app/privacy">Privacy</a>
      </AccountForm>
    );
  if (needsEmail && capabilities?.email === false && allowProviders)
    return (
      <AccountForm title="Create account" error={error}>
        <p>
          Email signup isn’t available right now. Continue with an available
          sign-in method.
        </p>
        <ProviderEntry onError={setError} />
        <Link to="/app/account/sign-in">Already have an account? Sign in</Link>
        <button type="button" className="button-quiet" onClick={continueGuest}>
          Continue using this browser
        </button>
      </AccountForm>
    );
  return (
    <AccountEntryPending.Provider
      value={checking || retrying || (needsEmail && capabilities === null)}
    >
      {needsEmail && capabilities === null && !checking && (
        <p role="status" className="account-sync-notice">
          Checking email availability…
        </p>
      )}
      {children}
    </AccountEntryPending.Provider>
  );
}
