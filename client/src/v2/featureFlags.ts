// Build-time client flags. Vite replaces import.meta.env.VITE_* when the
// bundle is built, so a flag can only change with a new build.
import { createContext, useContext } from 'react';

/** True when the build was made with VITE_ONE_SHELF=true (one-shelf redesign). */
export function oneShelfEnabled(environment: Record<string, unknown> = import.meta.env): boolean {
  return environment.VITE_ONE_SHELF === 'true';
}

/**
 * True inside the one-shelf tree. Shared screens (the account forms) read it
 * to switch to the one-shelf layout; with the flag off it is always false.
 */
export const OneShelfContext = createContext(false);
export const useOneShelf = () => useContext(OneShelfContext);
