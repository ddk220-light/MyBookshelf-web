// A catalog is not necessarily a building. Keep approximate campus/system points
// explicit and never publish unreviewed India geocodes as destination pins.
import { createHash } from 'node:crypto';
const locationId = (entry, name) => `${entry.id}:location:${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
export function libraryBranches(entry) {
  const source = entry.publicBranches || entry.branches || [];
  const branches = [...new Map(source.map(branch => {
    const kind = branch.kind || (/locker|dispenser/i.test(branch.name) ? 'locker' : /bookmobile|mobile library/i.test(branch.name) ? 'mobile' : /technical services|administration|staff/i.test(branch.name) ? 'service' : 'unknown');
    const name = branch.name.replace(/ - ADA Accessible$/i, '');
    return [name, { id: locationId(entry, name), name, kind, ...(branch.address ? { address: branch.address } : {}) }];
  })).values()];
  const complete = entry.branchClassificationComplete === true && branches.every(branch => branch.kind !== 'unknown');
  return { branches, branchClassification: complete ? 'complete' : 'incomplete', branchCount: complete ? branches.filter(b => b.kind === 'branch').length : null };
}
export function libraryLocations(entry) {
  const valid = point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  if (entry.nearbyEligible === false || (entry.country === 'IN' && entry.nearbyEligible !== true)) return [];
  const branches = (entry.branches || []).filter(branch => valid(branch) && !entry.withheldLocationNames?.includes(branch.name)).map((branch) => ({
    id: locationId(entry, branch.name), name: branch.name, lat: branch.lat, lon: branch.lon,
    precision: branch.locationReviewed ? 'branch' : 'area', reviewed: branch.locationReviewed === true,
  }));
  if (branches.length) return branches;
  return valid(entry) ? [{ id: `${entry.id}:location`, name: entry.name, lat: entry.lat, lon: entry.lon,
    precision: entry.addressScope === 'library' ? 'library' : entry.addressScope === 'campus' ? 'campus' : 'area',
    reviewed: entry.nearbyEligible === true || entry.locationReviewed === true }] : [];
}
