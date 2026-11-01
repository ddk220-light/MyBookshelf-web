// client/src/v2/ui/ConfirmDialog.tsx — the native cream confirm dialog.
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel,pending=false,cancelLabel='Keep everything' }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string;
  onConfirm: () => void|Promise<unknown>; onCancel: () => void;pending?:boolean;cancelLabel?:string;
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
    aria-busy={pending}
    onCancel={(e) => { e.preventDefault(); if(!pending)onCancel(); }}
    onClose={() => { if (open) onCancel(); }}
  >
    <h2 id={titleId}>{title}</h2>
    <div>{body}</div>
    <div className="cream-dialog-actions">
      <button className="button-quiet" autoFocus disabled={pending} onClick={onCancel}>{cancelLabel}</button>
      <button className="button-destructive" disabled={pending} onClick={()=>void onConfirm()}>{pending?'Please wait…':confirmLabel}</button>
    </div>
  </dialog>;
}
