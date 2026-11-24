// The date the Privacy and Terms texts (docs/policy/privacy.md, terms.md) take
// effect: the launch day, 23 November 2026 (owner decision), then 24 November
// 2026, when Privacy began to describe Google Analytics. It is committed
// here, not set as a build setting, so every build and the public export carry
// the same date. The app's bundle gets the texts with the date already in them
// (policyTextPlugin, in client/vite.config.js), and the public /privacy and
// /terms pages are built with it (tools/seo/build-pages.mjs). A changed policy
// text is published with a new date here, as both texts promise.
export const POLICY_EFFECTIVE_DATE = '24 November 2026';

const PLACEHOLDER = '[EFFECTIVE DATE]';
/** A bracketed placeholder left in a text, such as "[EFFECTIVE DATE]" or "[NAME]". */
export const PLACEHOLDER_PATTERN = /\[[A-Z][A-Z ]+\]/;

/** The date checked (a short date in words, as the texts show it), or null. */
export function policyEffectiveDate(value) {
  return typeof value === 'string' && /^[\p{L}\p{N} ,.-]{4,40}$/u.test(value.trim()) ? value.trim() : null;
}

/** A policy text with its effective date filled in; throws on a bad date or a placeholder left over. */
export function withEffectiveDate(text, date = POLICY_EFFECTIVE_DATE) {
  const value = policyEffectiveDate(date);
  if (!value) throw Error('A policy text is published only with its effective date.');
  const filled = String(text).split(PLACEHOLDER).join(value);
  if (PLACEHOLDER_PATTERN.test(filled)) throw Error('A policy text still has a placeholder.');
  return filled;
}

/** Vite plugin: the policy texts the app imports (docs/policy/*.md?raw) arrive with the date filled in. */
export function policyTextPlugin(date = POLICY_EFFECTIVE_DATE) {
  return {
    name: 'policy-effective-date',
    transform(code, id) {
      return /[\\/]docs[\\/]policy[\\/][^\\/?]+\.md\?(?:.*&)?raw(?:&|$)/.test(id) ? { code: withEffectiveDate(code, date), map: null } : null;
    },
  };
}
