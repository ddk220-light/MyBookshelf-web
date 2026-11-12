// Build-time client flags. Vite replaces import.meta.env.VITE_* when the
// bundle is built, so a flag can only change with a new build.

/** True when the build was made with VITE_ONE_SHELF=true (one-shelf redesign). */
export function oneShelfEnabled(environment: Record<string, unknown> = import.meta.env): boolean {
  return environment.VITE_ONE_SHELF === 'true';
}
