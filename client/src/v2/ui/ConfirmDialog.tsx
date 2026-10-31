// client/src/v2/ui/ConfirmDialog.tsx — the native cream confirm dialog.
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog
    ref={ref}
    className="cream-dialog"
    aria-labelledby={titleId}
    onCancel={(e) => { e.preventDefault(); onCancel(); }}
    onClose={() => { if (open) onCancel(); }}
  >
    <h2 id={titleId}>{title}</h2>
    <div>{body}</div>
    <div className="cream-dialog-actions">
      <button className="button-quiet" autoFocus onClick={onCancel}>Keep everything</button>
      <button className="button-destructive" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}
