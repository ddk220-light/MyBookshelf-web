// The account invite asks whether email accounts exist once a visit: the shelf
// is drawn again after every book page. Module memory only (no imports, so
// the test setup can reset it without loading the app).
let known: boolean | null = null;
export const knownEmailAccounts = (): boolean | null => known;
export function rememberEmailAccounts(value: boolean): void { known = value; }
/** Forgets the remembered answer (each unit test starts without it). */
export function forgetAccountCapabilities(): void { known = null; }
