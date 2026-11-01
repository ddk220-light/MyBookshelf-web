// client/src/v2/ui/ConfirmDialog.tsx — the native cream confirm dialog.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  pending = false,
  cancelLabel = "Keep everything",
  error,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  pending?: boolean;
  cancelLabel?: string;
  error?: string | null;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [submitting, setSubmitting] = useState(false),
    [failure, setFailure] = useState("");
  const busy = pending || submitting,
    message = error || failure;
  useEffect(() => {
    if (open) setFailure("");
  }, [open]);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (open && message) errorRef.current?.focus();
  }, [open, message]);
  const confirm = async () => {
    if (busy) return;
    setSubmitting(true);
    setFailure("");
    try {
      await onConfirm();
    } catch {
      setFailure("Couldn’t finish this change. Try again.");
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="cream-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClose={() => {
        if (open) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div>{body}</div>
      {message && (
        <p role="alert" tabIndex={-1} ref={errorRef} className="account-error">
          {message}
        </p>
      )}
      <div className="cream-dialog-actions">
        <button
          className="button-quiet"
          autoFocus
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          className="button-destructive"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Please wait…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
