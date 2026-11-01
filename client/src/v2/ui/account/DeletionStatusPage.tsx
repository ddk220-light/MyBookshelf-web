import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useDeletionReceipt } from "../../auth/DeletionReceiptProvider";
import { AccountForm } from "./AccountPages";
export function DeletionStatusPage() {
  const { receipt, check } = useDeletionReceipt();
  const automatic = useRef({ operationId: "", attempts: 0 });
  useEffect(() => {
    if (
      !receipt ||
      receipt.busy ||
      !["pending", "accepted"].includes(receipt.status)
    )
      return;
    if (automatic.current.operationId !== receipt.operationId)
      automatic.current = { operationId: receipt.operationId, attempts: 0 };
    if (automatic.current.attempts >= 12) return;
    const timer = setTimeout(() => {
      automatic.current.attempts++;
      void check();
    }, 5000);
    return () => clearTimeout(timer);
  }, [receipt, check]);
  return (
    <AccountForm
      title={
        receipt?.status === "cleaned"
          ? "Account cleanup complete"
          : "Account deletion status"
      }
      busy={receipt?.busy}
      error={receipt?.error}
    >
      {!receipt ? (
        <p>
          The status receipt was held only in the tab that submitted your
          request. Closing or refreshing that tab does not stop cleanup. If you
          already requested deletion, contact support for help rather than
          submitting another deletion.
        </p>
      ) : receipt.status === "cleaned" ? (
        <p>
          Your live account data has been removed and access has ended.
          Encrypted provider revocation work may continue for up to 30 days.
          Backups expire within 30 days, and restoration must honor the
          independent deletion record.
        </p>
      ) : receipt.status === "accepted" ? (
        <p>
          Your deletion request is durably recorded and account access has
          ended. Live account data is scheduled for cleanup within 24 hours.
          Keep this tab open to check progress.
        </p>
      ) : receipt.status === "pending" ? (
        <p>
          Account access has ended. The independent deletion record is still
          being retried, so durable acceptance and cleanup are pending. Keep
          this tab open and check again.
        </p>
      ) : receipt.status === "unavailable" ? (
        <p>
          This receipt could not confirm a deletion. The request may not have
          reached the server, or the status receipt may have expired. Check
          again or contact support before submitting another deletion.
        </p>
      ) : (
        <p>
          {receipt.busy
            ? "Submitting your confirmed request…"
            : "The response was uncertain. Check this existing request before taking another action."}
        </p>
      )}
      <p>
        Separate guest copies in this or other browsers, and files you
        downloaded, remain under your control.
      </p>
      {receipt && receipt.status !== "cleaned" && (
        <button
          type="button"
          disabled={receipt.busy}
          onClick={() => void check()}
        >
          {receipt.busy ? "Checking…" : "Check deletion status"}
        </button>
      )}
      <Link to="/app/shelf">Continue using this browser</Link>
      <a href="/support">Contact support</a>
    </AccountForm>
  );
}
