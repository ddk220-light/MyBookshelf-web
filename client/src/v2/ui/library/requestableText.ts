// The same rules as the server (server/catalog-store/requests.js), so a
// request is offered and sent only for text the server will take.
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URLISH = /(?:https?:\/\/|www\.)|\b[\p{L}\p{N}-]+\.(?:com|org|net|in|io|co|gov|edu|info|me|app|dev|uk|us|jp)\b/iu;
const CONTROL = /[\p{Cc}‪-‮⁦-⁩]/u;

/** What the server accepts as a request: 2–80 characters with a letter, no email, link or phone number. */
export function requestableText(value: string): string | null {
  if (CONTROL.test(value.replace(/[\t\n\r]/g, ' '))) return null;
  const text = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (text.length < 2 || text.length > 80 || !/\p{L}/u.test(text)) return null;
  if (/@/.test(text) || EMAIL.test(text) || URLISH.test(text) || (text.match(/\d/g) || []).length >= 7) return null;
  if (text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().length < 2) return null;
  return text;
}
