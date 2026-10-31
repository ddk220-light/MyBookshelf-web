export type CatalogHealth = 'operational' | 'degraded' | 'unknown';

export type PublicLibrary = {
  id: string;
  name: string;
  selectionPath?: string;
  city: string | null;
  region: string | null;
  district?: string | null;
  distanceKm?: number;
  distanceApproximate?: boolean;
  placeId?: string;
  locationMatch?: { scope: 'point' | 'campus' | 'locality' | 'postcode' | 'district' | 'area'; label: string; placeId?: string; city?: string };
  branchCount?: number | null;
  branchClassification?: 'complete' | 'incomplete';
  branches?: Array<{ id: string; name: string; kind: 'branch' | 'mobile' | 'locker' | 'service' | 'unknown'; address?: string }>;
  locations?: LibraryLocation[];
  search?: { isbn: boolean; title: boolean; mode: 'inline' | 'external' };
  country: string | null;
  catalogUrl?: string;
  attribution?: { label: string; url: string };
  accessNote?: string;
  address?: string;
  addressScope?: 'library' | 'campus' | 'locality';
  addressSourceUrl?: string;
  health: CatalogHealth;
  capabilities: {
    catalogLookup: boolean;
    publicAvailability: boolean;
    copyCounts: boolean;
    locationAvailability: boolean;
    callNumber: boolean;
    catalogLink: boolean;
    titleSearch?: boolean;
    isbnLookup?: boolean;
  };
};

export type PublicLibraryPage = {
  libraries: PublicLibrary[];
  total: number;
  nextOffset: number | null;
  nearby?: boolean;
  radiusKm?: number;
  area?: Place & { scope: 'locality' | 'district'; requestedRadiusKm: number; radiusKm: number; expanded: boolean };
  attribution?: { label: string; url: string };
  empty?: { reason: string; canExpand: boolean; canBrowseArea: boolean };
};

export type LibraryLocation = { id: string; name: string; lat: number; lon: number; precision: 'branch' | 'library' | 'campus' | 'area' };
export type MapBounds = { north: number; south: number; east: number; west: number };
export type Place = { id: string; label: string; lat: number; lon: number; country?: string; region?: string; district?: string; regionId?: string; districtId?: string; attribution?: { label: string; url: string } };
export type LibraryDiscovery = { query?: string; country?: string; region?: string; district?: string; placeId?: string; lat?: number; lon?: number; radiusKm?: number; bounds?: MapBounds; offset?: number };
export type LibraryAreas = { countries: string[]; regions: string[]; districts: string[]; counts?: { countries: Record<string, number>; regions: Record<string, number>; districts: Record<string, number> } };

export type PublicBook = {
  bookKey: string;
  title: string;
  authors: string[];
  metadataStatus?: 'missing' | 'unavailable';
  isbn13?: string;
  workId?: string;
  searchMatch?: 'spelling';
  editionCount?: number;
  language?: string;
  languages?: string[];
  format?: string;
  coverUrl?: string;
  description?: string;
  publisher?: string;
  publishedDate?: string;
  edition?: string;
  pageCount?: number;
  subjects?: string[];
  rating?: { average: number; count: number };
};

export type Availability = {
  outcome: 'available' | 'none_available' | 'in_catalog' | 'no_match' | 'not_found' | 'unknown';
  lookupKind: 'exact_isbn' | 'catalog_record' | 'verified_work' | 'title_author';
  matchKind: 'exact_isbn' | 'catalog_record' | 'verified_work' | 'possible_match' | 'none' | null;
  freshness: 'fresh' | 'stale' | 'none';
  observedAt?: string;
  attemptedAt: string;
  errorCode?: string;
  matchedBook?: { title: string; isbn13?: string };
  searchSummary?: { isbnQueries: number; titleQueries: number; recordsChecked: number; partial: boolean; editionsComplete: boolean };
  availableCopies?: number;
  notForLoanCopies?: number;
  totalCopies?: number;
  callNumber?: string;
  format?: string;
  loanRestriction?: 'not_for_loan';
  catalogMatchCount?: number;
  catalogTitle?: string;
  catalogUrl?: string;
  catalogLinkKind?: 'record' | 'search' | 'catalog';
  attribution?: { label: string; url: string };
  locations?: Array<{ name: string; availableCopies?: number; notForLoanCopies?: number; totalCopies?: number; status?: 'available' | 'unavailable' | 'unknown' }>;
};

export type RecentSource = 'camera' | 'isbn' | 'search' | 'direct';

export type RecentBook = Pick<PublicBook, 'bookKey' | 'title' | 'authors' | 'isbn13' | 'coverUrl'> & {
  source: RecentSource;
  viewedAt: string;
};
