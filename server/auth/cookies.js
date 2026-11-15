// The auth library names its session cookie `<prefix>.session_token`, with a
// `__Secure-` prefix when secure cookies are on (auth.js sets the prefix;
// cookies.test.js checks these names against the library). Without that cookie
// the library can only answer "guest", so the session route answers that
// without starting the account service or touching its database.
export const AUTH_COOKIE_PREFIX = "mybookshelf_auth";
export const SESSION_COOKIE_NAMES = Object.freeze([
  `${AUTH_COOKIE_PREFIX}.session_token`,
  `__Secure-${AUTH_COOKIE_PREFIX}.session_token`,
]);

export function hasSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== "string" || !cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const name = part.slice(0, part.indexOf("=") >>> 0).trim();
    return SESSION_COOKIE_NAMES.includes(name);
  });
}
