import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { accountRequest, safeAccountReturn } from "../../auth/accountClient";
import { useAccountSession } from "../../auth/AccountSessionProvider";

export type AccountCapabilities = {
  google: boolean;
  apple: boolean;
  canonicalOrigin: string;
};
export function ProviderEntry({
  disabled = false,
  onError,
}: {
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [capabilities, setCapabilities] = useState<AccountCapabilities | null>(
      null,
    ),
    [pending, setPending] = useState(false);
  const location = useLocation(),
    account = useAccountSession(),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void accountRequest<AccountCapabilities>("/capabilities", {
      signal: controller.signal,
    })
      .then((value) => {
        if (alive.current) setCapabilities(value);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);
  if (!capabilities) return null;
  let canonical: URL;
  try {
    canonical = new URL(capabilities.canonicalOrigin);
    if (
      !["https:", "http:"].includes(canonical.protocol) ||
      canonical.pathname !== "/" ||
      canonical.username ||
      canonical.password
    )
      return null;
  } catch {
    return null;
  }
  if (canonical.origin !== window.location.origin) {
    const destination = new URL("/app/account/sign-in", canonical);
    destination.searchParams.set(
      "returnTo",
      safeAccountReturn(new URLSearchParams(location.search).get("returnTo")),
    );
    return (
      <p>
        Use the account site to sign in securely.{" "}
        <a href={destination.href}>Continue to sign in</a>
      </p>
    );
  }
  const start = async (provider: "google" | "apple") => {
    if (pending || disabled) return;
    setPending(true);
    onError("");
    try {
      const reply = await accountRequest<{ url: string }>("/sign-in/social", {
        method: "POST",
        body: {
          provider,
          returnTo: safeAccountReturn(
            new URLSearchParams(location.search).get("returnTo"),
          ),
        },
      });
      if (!alive.current) return;
      const target = new URL(reply.url);
      if (
        target.protocol !== "https:" ||
        target.hostname !==
          (provider === "google" ? "accounts.google.com" : "appleid.apple.com")
      )
        throw Error("Couldn’t start sign-in. Try again.");
      account.beginProviderRedirect();
      window.location.assign(target.href);
    } catch (error) {
      if (alive.current) {
        setPending(false);
        onError(
          error instanceof Error
            ? error.message
            : "Couldn’t start sign-in. Try again.",
        );
      }
    }
  };
  if (!capabilities.google && !capabilities.apple) return null;
  return (
    <div className="account-providers" aria-label="Other sign-in methods">
      {capabilities.google && (
        <button
          type="button"
          className="provider-button"
          disabled={disabled || pending}
          onClick={() => void start("google")}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.3 2.9-7.3Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 5-.9 6.7-2.5L15.4 17c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 13.8a6 6 0 0 1 0-3.6V7.6H3a10 10 0 0 0 0 8.8l3.4-2.6Z"
            />
            <path
              fill="#EA4335"
              d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.6l3.4 2.6A6 6 0 0 1 12 6.1Z"
            />
          </svg>
          Continue with Google
        </button>
      )}
      {capabilities.apple && (
        <button
          type="button"
          className="provider-button provider-apple"
          disabled={disabled || pending}
          onClick={() => void start("apple")}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M17 12.3c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.2.8-.6 0-1.6-.8-2.7-.7-1.4 0-2.7.8-3.4 2-1.5 2.5-.4 6.2 1 8.2.6 1 1.3 2 2.4 1.9 1-.1 1.4-.6 2.7-.6s1.7.6 2.8.6 1.7-.9 2.4-1.9c.7-1.1 1-2.1 1.1-2.2-.1 0-2.1-.8-2.1-3.4ZM14.8 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.8.6-2.4 1.3-.5.6-1 1.5-.9 2.4.9.1 1.9-.5 2.5-1.2Z"
            />
          </svg>
          Continue with Apple
        </button>
      )}
      {pending && <p role="status">Opening secure sign-in…</p>}
    </div>
  );
}
