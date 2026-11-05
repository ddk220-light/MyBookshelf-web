import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { accountRequest } from "./accountClient";
import { useAccountSession } from "./AccountSessionProvider";
export type DeletionStatus =
  | "unknown"
  | "pending"
  | "accepted"
  | "cleaned"
  | "unavailable";
type Receipt = {
  operationId: string;
  receiptNonce: string;
  status: DeletionStatus;
  busy: boolean;
  error: string;
};
type Reply = {
  status: DeletionStatus;
  accessEnded?: boolean;
  cleanupComplete?: boolean;
};
const Context = createContext<{
  receipt: Receipt | null;
  submit: (input: {
    proof: string;
    csrfToken: string;
    identity: string;
  }) => Promise<void>;
  check: () => Promise<void>;
}>({ receipt: null, submit: async () => {}, check: async () => {} });
export const useDeletionReceipt = () => useContext(Context);
export function DeletionReceiptProvider({ children }: { children: ReactNode }) {
  const account = useAccountSession(),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    current = useRef(receipt),
    accessEnd = useRef<{ operationId: string; acknowledge: (confirmed: boolean) => void } | null>(null);
  const publish = (value: Receipt) => {
    current.current = value;
    setReceipt(value);
  };
  const submit = async (input: {
    proof: string;
    csrfToken: string;
    identity: string;
  }) => {
    // This capability lives above identity remounts, only in this tab's memory.
    // Never put it in a URL, browser storage, telemetry or history state.
    const bytes = crypto.getRandomValues(new Uint8Array(32)),
      nonce = btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    const value: Receipt = {
      operationId: crypto.randomUUID(),
      receiptNonce: nonce,
      status: "unknown",
      busy: true,
      error: "",
    };
    const acknowledge = account.captureAccessEnd(input.identity);
    accessEnd.current = {operationId: value.operationId, acknowledge};
    let accessEnded = false;
    publish(value);
    try {
      const reply = await accountRequest<Reply>("/deletion", {
        method: "POST",
        csrf: input.csrfToken,
        identity: input.identity,
        body: {
          proof: input.proof,
          operationId: value.operationId,
          receiptNonce: nonce,
          confirmation: "delete-account",
        },
      });
      accessEnded = reply.accessEnded === true;
      if (current.current?.operationId === value.operationId)
        publish({
          ...value,
          status: reply.status,
          receiptNonce: reply.status === "cleaned" ? "" : nonce,
          busy: false,
        });
    } catch {
      if (current.current?.operationId === value.operationId)
        publish({
          ...value,
          busy: false,
          error:
            "Couldn’t confirm the response. Check this request’s status before trying another deletion.",
        });
    } finally {
      if (current.current?.operationId === value.operationId) acknowledge(accessEnded);
    }
  };
  const check = async () => {
    const value = current.current;
    if (!value || value.busy) return;
    publish({ ...value, busy: true, error: "" });
    try {
      const reply = await accountRequest<Reply>("/deletion/status", {
        method: "POST",
        body: {
          operationId: value.operationId,
          receiptNonce: value.receiptNonce,
        },
      });
      if (current.current?.operationId === value.operationId) {
        if (reply.accessEnded && accessEnd.current?.operationId === value.operationId)
          accessEnd.current.acknowledge(true);
        publish({
          ...value,
          status: reply.status,
          receiptNonce: reply.status === "cleaned" ? "" : value.receiptNonce,
          busy: false,
        });
      }
    } catch {
      if (current.current?.operationId === value.operationId)
        publish({
          ...value,
          busy: false,
          error:
            "Couldn’t check status. Your existing request continues if it was received. Try checking again.",
        });
    }
  };
  return (
    <Context.Provider value={{ receipt, submit, check }}>
      {children}
    </Context.Provider>
  );
}
