import type { PublicLibrary } from '../../types';
export function distanceLabel(km: number, country?: string | null, approximate = false): string {
  const miles = country === 'US', value = miles ? km / 1.609344 : km;
  return (approximate ? 'About ' : '') + (value < 0.1 ? '<0.1' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)) + (miles ? ' mi' : ' km');
}
