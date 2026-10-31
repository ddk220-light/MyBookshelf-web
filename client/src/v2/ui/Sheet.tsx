import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Sheet({ open, title, children, onClose, className = '' }: { open: boolean; title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog className={`reader-sheet ${className}`} ref={ref} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose}>×</button></header>
    {open && children}
  </dialog>;
}
