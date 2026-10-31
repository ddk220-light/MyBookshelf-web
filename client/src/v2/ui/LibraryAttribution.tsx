import type { PublicLibrary } from '../types';

export function LibraryAttribution({ attribution }: { attribution?: PublicLibrary['attribution'] }) {
  return attribution ? <p className="catalog-time library-attribution">Library data from <a className="text-link inline" href={attribution.url} target="_blank" rel="noopener noreferrer">{attribution.label}</a>.</p> : null;
}
