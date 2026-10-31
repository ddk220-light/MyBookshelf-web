import aliases from '../../data/india-administrative-aliases.json' with { type: 'json' };
export const normalizePlaceName = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const alias = (value, values) => Object.entries(values || {}).find(([name]) => normalizePlaceName(name) === normalizePlaceName(value))?.[1] || value;
export const canonicalRegion = value => alias(value, aliases.states);
export const canonicalDistrict = (value, region) => alias(String(value || '').replace(/\s+District$/i, ''), aliases.districts[canonicalRegion(region)]);
