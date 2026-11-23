// Old links that carried typed text in the address (plan Phase 12): the
// landing page's former `/app/libraries?q=` form, `/app/search?q=` links from
// the old app and the hidden free-reading pages. The redirect takes the text
// out of the address at once (a `replace` navigation, so the old address
// leaves the session history too) and hands it to the home screen through
// this same-tab memory. The history entry carries only which kind of handoff
// is waiting, never the text, and nothing is written to browser storage. A
// reload finds nothing here and simply shows the shelf.

export type LegacyTextKind = 'search' | 'library';

const MAX_LENGTH = 200;
const waiting = new Map<LegacyTextKind, string>();

/** Keep `text` (trimmed, at most 200 characters) for the next home screen; empty text is dropped. */
export function handOffLegacyText(kind: LegacyTextKind, text: string | null | undefined): boolean {
  const value = (text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  if (!value) { waiting.delete(kind); return false; }
  waiting.set(kind, value);
  return true;
}

/** The waiting text, without removing it (safe to call twice while rendering). */
export function peekLegacyText(kind: LegacyTextKind): string | undefined {
  return waiting.get(kind);
}

/** Forget the waiting text once it has been used. */
export function clearLegacyText(kind: LegacyTextKind): void {
  waiting.delete(kind);
}
