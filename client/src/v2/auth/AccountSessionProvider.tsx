import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { accountRequest } from "./accountClient";
import { setReaderIdentityScope } from "../readerState";
import { clearSearchMemory } from "../searchMemory";
import { clearCatalogMetadata } from "../catalogMetadata";
import { resetLibrarySearchSession } from "../ui/library/useLibraryDiscovery";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};
export type AccountSession = {
  status:
    | "checking"
    | "guest"
    | "unverified"
    | "authenticated"
    | "unavailable"
    | "signout-unconfirmed";
  user?: AccountUser;
  csrfToken?: string;
  epoch: number;
  logoutPending?: boolean;
};
type SessionReply = {
  status: "guest" | "unverified" | "authenticated" | "unavailable";
  user?: AccountUser;
  csrfToken?: string;
};
type SessionContext = {
  session: AccountSession;
  refresh: (explicitSignin?: boolean) => Promise<void>;
  signOut: () => Promise<boolean>;
  continueGuest: () => void;
  invalidate: () => void;
};
const fallback: SessionContext = {
  session: { status: "guest", epoch: 0 },
  refresh: async () => {},
  signOut: async () => true,
  continueGuest: () => {},
  invalidate: () => {},
};
const Context = createContext<SessionContext>(fallback);
export const useAccountSession = () => useContext(Context);
const OVERRIDE = "mybookshelf.local-guest-override.v1",
  EVENT = "mybookshelf.identity-invalidation.v1";
function override() {
  for (const name of ["localStorage", "sessionStorage"] as const)
    try {
      if (window[name].getItem(OVERRIDE) === "true") return true;
    } catch {
      /* Try the other storage. */
    }
  return false;
}
function writeOverride(value: boolean) {
  for (const storage of ["localStorage", "sessionStorage"] as const)
    try {
      if (value) window[storage].setItem(OVERRIDE, "true");
      else window[storage].removeItem(OVERRIDE);
    } catch {
      /* The active tab still remains locked. */
    }
}
function broadcast(guestOverride: boolean) {
  try {
    const channel = new BroadcastChannel(EVENT);
    channel.postMessage({ type: "invalidate", guest: guestOverride });
    channel.close();
  } catch {
    /* Storage/focus fallback below. */
  }
  try {
    localStorage.setItem(EVENT, crypto.randomUUID());
  } catch {
    /* Focus always revalidates. */
  }
}
const key = (s: Pick<AccountSession, "status" | "user">) =>
  s.status === "authenticated" || s.status === "unverified"
    ? s.status + ":" + s.user?.id
    : s.status;

export function AccountSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccountSession>(() => {
    setReaderIdentityScope("checking");
    return { status: "checking", epoch: 0 };
  });
  const current = useRef(session),
    request = useRef(0),
    guestLock = useRef(override()),
    pending = useRef<Promise<void> | null>(null);
  const logoutCsrf = useRef<string>();
  const publish = useCallback((reply: Omit<AccountSession, "epoch">) => {
    const changed = key(reply) !== key(current.current),
      epoch = current.current.epoch + (changed ? 1 : 0);
    if (changed) {
      setReaderIdentityScope(reply.status === "guest" ? null : key(reply));
      clearSearchMemory();
      clearCatalogMetadata();
      resetLibrarySearchSession();
    }
    const next = { ...reply, epoch };
    current.current = next;
    setSession(next);
  }, []);
  const refresh = useCallback(
    async (explicitSignin = false) => {
      if (explicitSignin) {
        guestLock.current = false;
        writeOverride(false);
        request.current++;
        pending.current = null;
      }
      if (pending.current) return pending.current;
      const version = ++request.current;
      const run = async () => {
        try {
          const reply = await accountRequest<SessionReply>("/session");
          if (version !== request.current) return;
          if (guestLock.current) {
            if (reply.status === "guest") {
              guestLock.current = false;
              writeOverride(false);
              publish(reply);
              return;
            }
            // Retry a previously unconfirmed logout before private hydration.
            if (
              reply.status === "authenticated" ||
              reply.status === "unverified"
            ) {
              try {
                await accountRequest("/sign-out", {
                  method: "POST",
                  body: {},
                  csrf: reply.csrfToken,
                });
                if (version === request.current) {
                  guestLock.current = false;
                  writeOverride(false);
                  publish({ status: "guest" });
                  broadcast(false);
                }
              } catch {
                if (version === request.current)
                  publish({ status: "guest", logoutPending: true });
              }
            } else publish({ status: "guest", logoutPending: true });
            return;
          }
          publish(reply);
          if (explicitSignin) broadcast(false);
        } catch {
          if (version === request.current)
            publish(
              guestLock.current
                ? { status: "guest", logoutPending: true }
                : { status: "unavailable" },
            );
        }
      };
      const promise = run();
      pending.current = promise;
      try {
        await promise;
      } finally {
        if (pending.current === promise) pending.current = null;
      }
    },
    [publish],
  );
  const continueGuest = useCallback(() => {
    request.current++;
    pending.current = null;
    guestLock.current = true;
    writeOverride(true);
    publish({ status: "guest", logoutPending: true });
    broadcast(true);
  }, [publish]);
  const invalidate = useCallback(() => {
    request.current++;
    pending.current = null;
    publish({ status: "unavailable" });
    void refresh();
  }, [publish, refresh]);
  const signOut = useCallback(async () => {
    const csrf = current.current.csrfToken ?? logoutCsrf.current;
    logoutCsrf.current = csrf;
    request.current++;
    pending.current = null;
    guestLock.current = true;
    writeOverride(true);
    publish({ status: "signout-unconfirmed" });
    broadcast(true);
    try {
      await accountRequest("/sign-out", { method: "POST", body: {}, csrf });
      guestLock.current = false;
      writeOverride(false);
      publish({ status: "guest" });
      broadcast(false);
      return true;
    } catch {
      publish({ status: "signout-unconfirmed" });
      return false;
    }
  }, [publish]);
  useEffect(() => {
    setReaderIdentityScope("checking");
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const changed = (event: StorageEvent) => {
      if (event.key === EVENT || event.key === OVERRIDE) {
        guestLock.current = override();
        invalidate();
      }
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(EVENT);
      channel.onmessage = (event) => {
        guestLock.current =
          event.data?.type === "invalidate" &&
          typeof event.data.guest === "boolean"
            ? event.data.guest
            : override();
        writeOverride(guestLock.current);
        invalidate();
      };
    } catch {
      /* Storage/focus fallback. */
    }
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("storage", changed);
    return () => {
      request.current++;
      pending.current = null;
      channel?.close();
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("storage", changed);
    };
  }, [refresh, invalidate]);
  return (
    <Context.Provider
      value={{ session, refresh, signOut, continueGuest, invalidate }}
    >
      {children}
    </Context.Provider>
  );
}
