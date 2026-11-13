import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab and Shift+Tab inside a modal dialog (side panel, scan pop-up):
 * from the last visible control focus wraps to the first, and back.
 */
export function trapTab(event: KeyboardEvent<HTMLElement>, dialog: HTMLElement | null) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) || []).filter(element => element.getClientRects().length > 0);
  const first = controls[0], last = controls[controls.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
