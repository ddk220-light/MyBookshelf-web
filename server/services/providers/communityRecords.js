import { createHash } from 'node:crypto';
import { catalogError, text } from './catalogMarkup.js';

export const normalized = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function boundedQuery(value) {
  const query = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  let result = '';
  for (const ch of query) {
    if (result.length >= 64 || Buffer.byteLength(result + ch) > 72) break;
    result += ch;
  }
  if (result.length < 2 || /[\x00-\x1f\x7f]/.test(result)) throw catalogError('A title is required', 'CATALOG_UNSUPPORTED');
  return result;
}
export function replayId(query, sourceId) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(sourceId))) throw catalogError('Invalid source record');
  const id = `r1_${Buffer.from(JSON.stringify([boundedQuery(query), String(sourceId)])).toString('base64url')}`;
  if (id.length > 180) throw catalogError('Catalog record identifier too long');
  return id;
}
export function parseReplayId(id) {
  if (!/^r1_[A-Za-z0-9_-]{1,176}$/.test(id || '')) throw catalogError('Invalid catalog record identifier');
  let data;
  try { data = JSON.parse(Buffer.from(id.slice(3), 'base64url').toString()); } catch { throw catalogError('Invalid catalog record identifier'); }
  if (!Array.isArray(data) || data.length !== 2 || typeof data[0] !== 'string' || typeof data[1] !== 'string'
      || replayId(...data) !== id) throw catalogError('Invalid catalog record identifier');
  return { query: data[0], sourceId: data[1] };
}
export const fingerprint = values => createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 20);

export function observation(library, catalogUrl, status = 'unknown', callNumber = null) {
  return { outcome: status === 'available' ? 'available' : status === 'unavailable' ? 'none_available' : 'in_catalog',
    matchKind: 'verified_work', recognizedExact: true, catalogUrl, catalogLinkKind: 'search',
    ...(callNumber ? { callNumber: text(callNumber) } : {}), locations: [{ name: library.name, status }] };
}

// A positive copy is sufficient evidence; a negative requires every relevant
// record to have completed. Separate bibliographic rows can repeat physical
// copies, so their counts must never be added without copy identities.
export function aggregateObservations(values, { complete = true } = {}) {
  const observations = values.filter(Boolean);
  if (!observations.length) return undefined;
  complete = complete && observations.length === values.length;
  const available = observations.find(value => value.outcome === 'available');
  const result = { ...(available || observations.find(value => value.outcome === 'in_catalog') || observations[0]) };
  result.outcome = available ? 'available'
    : complete && observations.every(value => value.outcome === 'none_available') ? 'none_available' : 'in_catalog';
  if (!complete || observations.length > 1) {
    delete result.availableCopies;
    delete result.totalCopies;
  }
  const locations = new Map();
  for (const value of observations) for (const location of value.locations || []) {
    const group = locations.get(location.name) || [];
    group.push(location);
    locations.set(location.name, group);
  }
  if (locations.size) result.locations = [...locations].map(([name, group]) => ({ name,
    status: group.some(location => location.status === 'available') ? 'available'
      : complete && group.every(location => location.status === 'unavailable') ? 'unavailable' : 'unknown' }));
  return result;
}

export function distinctRecords(records) {
  const distinct = new Map();
  for (const record of records.filter(r => r.title && r.recordId)) {
    const previous = distinct.get(record.recordId);
    distinct.set(record.recordId, previous ? { ...previous,
      observation: aggregateObservations([previous.observation, record.observation]) } : record);
  }
  return [...distinct.values()].slice(0, 10);
}

export function markSearchComplete(records, complete) {
  // Internal parser evidence, omitted from JSON and public book DTOs.
  Object.defineProperty(records, 'searchComplete', { value: complete === true });
  return records;
}
