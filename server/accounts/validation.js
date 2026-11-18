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
  // No password rules (owner's decision): any non-empty password up to the
  // maximum. The sign-in limit (5 tries per address per 15 minutes) guards it.
  if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 128 || /[\ud800-\udfff]/u.test(value)) throw invalid('Use 128 characters or fewer for your password.');
  return value; // Never trim or rewrite a password.
}
export function accountToken(value) {
  if (typeof value !== 'string' || !value || value.length > 8192 || /[\s\u0000-\u001f]/.test(value)) throw invalid('This link is invalid. Request a new one.');
  return value;
}
