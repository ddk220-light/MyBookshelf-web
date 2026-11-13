import { useEffect, type ReactNode } from 'react';
import { useLibrary } from './context';
import { HoldingsProvider } from './holdings';
import { runOneShelfMigration } from './oneShelfState';

// One migration attempt per page load. It is idempotent (a completed run is
// recorded under mybookshelf.one-shelf.v1), so a remount never repeats work.
let migration: Promise<unknown> | null = null;
export function startOneShelfMigration(): Promise<unknown> {
  migration ??= runOneShelfMigration().catch(() => 'unavailable');
  return migration;
}

/**
 * Root of the one-shelf tree (VITE_ONE_SHELF on). It runs the browser-storage
 * migration and provides the in-memory library answers for the chosen library.
 * It renders no markup of its own; the screens arrive in later phases.
 */
export function OneShelfRoot({ children }: { children: ReactNode }) {
  const { state } = useLibrary();
  useEffect(() => { void startOneShelfMigration(); }, []);
  return <HoldingsProvider libraryId={state.selectedLibraryId}>{children}</HoldingsProvider>;
}
