import { createContext, useContext, useState, type ReactNode } from "react";
import {
  useAccountSession,
  type AccountSession,
} from "./AccountSessionProvider";
export type RecentAction =
  | "password-change"
  | "password-setup"
  | "email-change"
  | "provider-link"
  | "provider-unlink"
  | "session-revoke"
  | "signout-all"
  | "export"
  | "delete";
export type RecentResult = {
  action: RecentAction;
  target?: string;
  proof: string;
  csrfToken: string;
};
type Pending = RecentResult & {
  owner: string;
  epoch: number;
  expiresAt: number;
};
const Context = createContext<{
  pending: Pending | null;
  set: (result: RecentResult, session: AccountSession) => void;
  clear: () => void;
}>({ pending: null, set: () => {}, clear: () => {} });
export const useRecentAuth = () => useContext(Context);
export function RecentAuthProvider({ children }: { children: ReactNode }) {
  const { session } = useAccountSession(),
    [value, setValue] = useState<Pending | null>(null);
  const pending =
    value &&
    value.owner === session.user?.id &&
    value.epoch === session.epoch &&
    value.expiresAt > Date.now()
      ? value
      : null;
  return (
    <Context.Provider
      value={{
        pending,
        set: (result, checked) => {
          if (checked.status === "authenticated" && checked.user)
            setValue({
              ...result,
              owner: checked.user.id,
              epoch: checked.epoch,
              expiresAt: Date.now() + 300000,
            });
        },
        clear: () => setValue(null),
      }}
    >
      {children}
    </Context.Provider>
  );
}
