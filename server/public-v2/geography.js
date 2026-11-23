import aliases from '../../data/india-administrative-aliases.json' with { type: 'json' };
export const normalizePlaceName = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const alias = (value, values) => Object.entries(values || {}).find(([name]) => normalizePlaceName(name) === normalizePlaceName(value))?.[1] || value;
// Older or "&" spellings of state and Union Territory names, so one state has
// one name everywhere ("Jammu & Kashmir" is "Jammu and Kashmir"). The data
// file's aliases (data/india-administrative-aliases.json) apply after these.
const SPELLINGS = Object.freeze({
  Pondicherry: 'Puducherry',
  'Andaman and Nicobar': 'Andaman and Nicobar Islands',
  'Daman and Diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'Dadra and Nagar Haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'NCT of Delhi': 'Delhi',
});
export const canonicalRegion = value => {
  if (typeof value !== 'string' || !value.trim()) return value;
  const spelled = value.trim().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ');
  return alias(alias(spelled, SPELLINGS), aliases.states);
};
export const canonicalDistrict = (value, region) => alias(String(value || '').replace(/\s+District$/i, ''), aliases.districts[canonicalRegion(region)]);
