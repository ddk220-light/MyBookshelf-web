import { createHash } from 'node:crypto';
import { AccountRequestError } from './security.js';
const invalid = (message) => new AccountRequestError(422, 'INVALID_INPUT', message);
export function strictObject(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) throw invalid('Check the submitted fields.');
  return value;
}
export function privateName(value) {
  if (typeof value !== 'string') throw invalid('Enter your name.');
  const name = value.trim();
  if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw invalid('Use a name between 1 and 80 characters.');
  return name;
}
export function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw invalid('Enter a valid email address.');
  return value.trim().toLowerCase();
}
export function accountPassword(value) {
  if (typeof value !== 'string' || [...value].length < 15 || [...value].length > 128 || /[\ud800-\udfff]/u.test(value)) throw invalid('Use between 15 and 128 characters for your password.');
  return value; // Never trim or rewrite a password.
}
export function accountToken(value) {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\s\u0000-\u001f]/.test(value)) throw invalid('This link is invalid. Request a new one.');
  return value;
}
export async function checkCompromisedPassword(password, fetcher = fetch) {
  // Only the first five SHA-1 hex characters leave the server; never send the
  // password or full hash. SHA-1 here is a range lookup, not password storage.
  const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
  let response;
  try { response = await fetcher('https://api.pwnedpasswords.com/range/' + digest.slice(0, 5), {
    headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(4000),
  }); } catch { throw new AccountRequestError(503, 'PASSWORD_CHECK_UNAVAILABLE', 'We could not check this password. Try again shortly.'); }
  if (!response.ok) throw new AccountRequestError(503, 'PASSWORD_CHECK_UNAVAILABLE', 'We could not check this password. Try again shortly.');
  const text = await response.text();
  if (text.length > 2_000_000 || !text.trim()) throw new AccountRequestError(503, 'PASSWORD_CHECK_UNAVAILABLE', 'We could not check this password. Try again shortly.');
  const lines = text.trim().split(/\r?\n/);
  if (!lines.every((line) => /^[A-F0-9]{35}:\d+$/.test(line.trim()))) throw new AccountRequestError(503, 'PASSWORD_CHECK_UNAVAILABLE', 'We could not check this password. Try again shortly.');
  const found = lines.some((line) => {
    const [suffix, count] = line.trim().split(':');
    return suffix === digest.slice(5) && Number(count) > 0;
  });
  if (found) throw invalid('This password has appeared in a known breach. Choose a different password.');
}
