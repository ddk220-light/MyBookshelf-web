import type { PublicLibrary } from '../../types';
export function libraryFeatures(library: PublicLibrary): string[] {
  const c = library.capabilities;
  return [c.titleSearch && 'Search by title or author', c.isbnLookup && 'Look up an ISBN',
    c.publicAvailability && 'Check availability', c.copyCounts && 'Copy counts',
    c.locationAvailability && 'Location information', c.callNumber && 'Call numbers',
    !c.publicAvailability && 'Open the library’s own catalog'].filter((value): value is string => Boolean(value));
}
export function distanceLabel(km: number, country?: string | null, approximate = false): string {
  const miles = country === 'US', value = miles ? km / 1.609344 : km;
  return (approximate ? 'About ' : '') + (value < 0.1 ? '<0.1' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)) + (miles ? ' mi' : ' km');
}
