// Google Analytics through the Google tag (owner request, 24 November 2026:
// "install a google tag on the website", with key events). Everything the site
// sends to Google goes through this file, and nothing else may:
//
// - Where it runs: the live site only, never under an automated browser
//   (navigator.webdriver), never on /app/admin. On /app/account/* (emailed
//   links there carry one-use tokens) and on addresses that only redirect it
//   waits for the reader's next page.
// - The page address sent is scrubbed (shared/analytics.mjs): no query string
//   but four short utm_ values, no fragment, no book key. The title is a fixed
//   name for the kind of page, never document.title (it holds book titles),
//   and an outside referrer is reduced to its origin.
// - Events: only those in googleTagEvents(), each with only the parameters and
//   values listed there. Anything else is dropped, so search text, typed
//   ISBNs, books, places, emails and account IDs cannot be sent.
// - Consent mode: advertising storage and use are denied everywhere, and
//   Google sets no cookie in the EEA, the UK or Switzerland. No user ID or
//   user property is ever set.
//
// Google being blocked changes nothing: the script is async, nothing waits for
// it, and every call is guarded.
//
// The exported functions but trackPage and trackEvent are self-contained (no
// module-level references) because build-pages.mjs writes their source into
// the public pages' /google-tag.js.
import { scrubAnalyticsUrl } from './analytics.mjs';

/** The owner's Google tag. Public: it is in every page that loads it. */
export const GOOGLE_TAG_ID = 'G-G2QJ7MKTQ9';
/** The only host the site serves pages on: www redirects to it (vercel.json). */
export const GOOGLE_TAG_HOST = 'mybookshelf.cloud';

/**
 * The kind of page at a scrubbed path: `type` for reports, `title` as the page title.
 * @param {string} path @returns {{ type: string, title: string }}
 */
export function googleTagPage(path) {
  var named = {
    '/': ['shelf', 'Reading shelf'], '/app/books/[book]': ['book', 'Book'], '/app/read/[item]': ['free_reading', 'Free reading'],
    '/app/settings/account': ['account_settings', 'Account settings'], '/app/report': ['report', 'Report a problem'],
    '/app/privacy': ['privacy', 'Privacy'], '/privacy': ['privacy', 'Privacy'], '/app/terms': ['terms', 'Terms'], '/terms': ['terms', 'Terms'],
    '/app/about': ['about', 'About'], '/about': ['about', 'About'], '/how-it-works': ['how_it_works', 'How it works'],
    '/open-source': ['open_source', 'Open source'], '/support': ['help', 'Help'],
    '/libraries': ['libraries', 'Libraries'], '/books': ['books', 'Books']
  };
  var page = Object.prototype.hasOwnProperty.call(named, path) ? named[path]
    : /^\/libraries\//.test(path) ? ['library_page', 'Library page']
      : /^\/books\//.test(path) ? ['book_page', 'Book page']
        : /^\/select(?:\/|$)/.test(path) ? ['library_link', 'Library link'] : ['other', 'Other page'];
  return { type: page[0], title: page[1] };
}

/**
 * Every event there is and, for each, every parameter and the values it may
 * have: a list, or (library ID and country) a strict pattern.
 * @returns {Record<string, Record<string, readonly string[] | RegExp>>}
 */
export function googleTagEvents() {
  // The directory's own IDs: a known catalog family, ":" and its plain key.
  var ID = /^(?:apollo|aspen|bc|calil|catalog|chamo|discovery-academic|discovery-community|egranthalaya|evergreen|indcat|koha|libman|libsys|polaris|tlc|vega|vpl|vufind):[A-Za-z0-9_-]{1,80}$/;
  var COUNTRY = /^[A-Z]{2}$/;
  var PAGES = ['shelf', 'book', 'free_reading', 'account_settings', 'report', 'privacy', 'terms', 'about', 'how_it_works', 'open_source', 'help',
    'libraries', 'library_page', 'books', 'book_page', 'library_link', 'other'];
  var FOUND = ['results', 'none', 'error'];
  var ANSWERS = ['found', 'not_found', 'unknown'];
  // How the book page was opened.
  var OPENED = ['search', 'shelf', 'suggestion', 'viewed', 'scan', 'link', 'other'];
  return {
    page_view: { page_type: PAGES },
    book_search: { outcome: FOUND, result_band: ['0', '1-5', '6-20', '21+'], method: ['typed', 'scan'] },
    library_search: { outcome: FOUND, method: ['typed', 'near_me'] },
    select_library: { library_id: ID, library_country: COUNTRY, method: ['search', 'near_me', 'link', 'other'] },
    book_open: { event_source: OPENED },
    library_check: { outcome: ANSWERS, library_id: ID, library_country: COUNTRY, event_source: ['book_page', 'library_page'],
      reason: ['unconfirmed', 'timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'unsupported', 'configuration', 'cancelled', 'busy', 'details'] },
    catalog_open: { outcome: ANSWERS, library_id: ID, library_country: COUNTRY, event_source: ['book_page', 'library_page', 'shelf'] },
    book_save: { event_source: OPENED },
    book_remove: { event_source: OPENED },
    barcode_scan: { step: ['opened', 'found', 'failed', 'denied'] },
    sign_up: { method: ['password'] },
    login: { method: ['password', 'link'] },
    library_request: {},
    problem_report: {},
    open_app: { page_type: PAGES }
  };
}

/**
 * The parameters of an event that may be sent (none: {}), or null for an
 * event that is not in the table.
 * @param {Record<string, Record<string, readonly string[] | RegExp>>} events
 * @param {string} name @param {Record<string, unknown> | null} [params]
 * @returns {Record<string, string> | null}
 */
export function allowedGoogleTagEvent(events, name, params) {
  if (!Object.prototype.hasOwnProperty.call(events, name)) return null;
  var allowed = events[name], kept = {};
  Object.keys(allowed).forEach(function (key) {
    var value = params ? params[key] : undefined, rule = allowed[key];
    if (typeof value !== 'string' || value.length > 100) return;
    if (Array.isArray(rule) ? rule.indexOf(value) >= 0 : rule.test(value)) kept[key] = value;
  });
  return kept;
}

/**
 * The tag for one document. `visit` counts the page now shown (once, however
 * often it is called) and loads Google's script the first time it may;
 * `event` sends one event. Neither ever throws.
 * @param {any} win @param {any} doc
 * @param {{ id: string, host: string, scrub: (url: string) => string | null, page: typeof googleTagPage,
 *   allow: (name: string, params?: Record<string, unknown> | null) => Record<string, string> | null, notFound?: boolean }} parts
 */
export function createGoogleTag(win, doc, parts) {
  var started = false, current = null, shown = null, type = null, waiting = [];

  // Google reads commands only as `arguments` objects.
  function command() { win.dataLayer.push(arguments); }

  // 'send': an ordinary page of the live site; 'wait': an account page;
  // 'skip': an address that only redirects (the app replaces it at once);
  // 'stop': anywhere else.
  function state() {
    if (win.location.hostname !== parts.host || (win.navigator && win.navigator.webdriver === true)) return 'stop';
    if (!parts.scrub(win.location.href)) return 'stop';
    // As the app's router reads it: any case, escapes decoded.
    var path = win.location.pathname;
    try { path = decodeURIComponent(path); } catch (error) { /* Read as it is. */ }
    path = path.toLowerCase().replace(/\/{2,}/g, '/');
    if (/^\/app\/admin(?:\/|$)/.test(path)) return 'stop';
    if (/^\/app\/account(?:\/|$)/.test(path)) return 'wait';
    return /^\/(?:find|app(?:\/(?:shelf|search|libraries|settings|settings\/account\/more))?)\/?$/.test(path) ? 'skip' : 'send';
  }
  function referrer() {
    try {
      var url = new win.URL(doc.referrer);
      if (url.hostname === parts.host || url.hostname === 'www.' + parts.host) return parts.scrub(url.href) || '';
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin + '/' : '';
    } catch (error) { return ''; }
  }
  function campaign() {
    var given = new win.URLSearchParams(win.location.search), kept = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (name) {
      var value = given.get(name);
      if (value && /^[A-Za-z0-9_.-]{1,40}$/.test(value)) kept.push(name + '=' + value);
    });
    return kept.length ? '?' + kept.join('&') : '';
  }
  function start() {
    started = true;
    win.dataLayer = win.dataLayer || [];
    // The region's own default first, then everyone else's. Advertising is denied everywhere.
    command('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
      region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO',
        'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'] });
    command('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
    command('js', new Date());
    // For the events Google sends by itself too (session_start, user_engagement).
    command('set', shown);
    command('config', parts.id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_expires: 395 * 24 * 60 * 60, cookie_flags: 'SameSite=Lax;Secure' });
    var script = doc.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + parts.id;
    doc.head.appendChild(script);
  }
  function send(name, params) {
    var all = { page_location: shown.page_location, page_referrer: shown.page_referrer, page_title: shown.page_title };
    Object.keys(params).forEach(function (key) { all[key] = params[key]; });
    command('event', name, all);
  }
  function visit() {
    var now = state();
    // Google's own switch, so that its automatic events stop too.
    if (started) win['ga-disable-' + parts.id] = now === 'wait' || now === 'stop';
    if (now === 'wait' || now === 'stop') current = null;
    if (now !== 'send') return now;
    var origin = win.location.origin, path = parts.notFound ? '/[other]' : parts.scrub(win.location.href).slice(origin.length);
    if (path !== current) {
      var page = parts.page(path);
      shown = { page_location: origin + path + campaign(), page_referrer: shown ? shown.page_location.split('?')[0] : referrer(), page_title: page.title };
      current = path;
      type = page.type;
      if (started) command('set', shown);
      else start();
      send('page_view', { page_type: type });
    }
    waiting.splice(0).forEach(function (item) { send(item[0], item[1]); });
    return now;
  }
  return {
    visit: function () { try { visit(); } catch (error) { /* Counting never breaks a page. */ } },
    event: function (name, params) {
      try {
        // Page views are counted by visit() only.
        var kept = name === 'page_view' ? null : parts.allow(name, params);
        if (!kept) return;
        // The page an event belongs to is counted before it.
        var now = visit();
        if (now === 'send') send(name, kept);
        else if (now !== 'stop' && waiting.length < 20) waiting.push([name, kept]);
      } catch (error) { /* Counting never breaks a page. */ }
    },
    pageType: function () { return type; }
  };
}

/**
 * A public page: its view, links into the app, links to the library's own
 * catalog, and the answers /library-check.js shows after a tap.
 * @param {any} win @param {any} doc @param {ReturnType<typeof createGoogleTag>} tag
 */
export function watchPublicPage(win, doc, tag) {
  function library(params) {
    params.library_id = doc.body.getAttribute('data-library-id');
    params.library_country = doc.body.getAttribute('data-library-country');
    return params;
  }
  function outcome(answer) { return answer === 'found' || answer === 'not_found' || !answer ? answer : 'unknown'; }
  tag.visit();
  doc.addEventListener('click', function (event) {
    try {
      var link = event.target.closest('a[href]');
      if (!link) return;
      if (link.hostname === win.location.hostname) {
        if (/^\/(?:$|select\/|app(?:\/|$))/.test(link.pathname)) tag.event('open_app', { page_type: tag.pageType() });
      } else if (link.closest('.library-heading, [data-check-answer]') && /^https?:$/.test(link.protocol)) {
        var row = link.closest('[data-answer]');
        tag.event('catalog_open', library({ outcome: outcome(row && row.getAttribute('data-answer')), event_source: 'library_page' }));
      }
    } catch (error) { /* Counting never breaks a page. */ }
  });
  doc.addEventListener('mybookshelf-check', function (event) {
    try {
      tag.event('library_check', library({ outcome: outcome(event.detail.answer), reason: event.detail.reason, event_source: 'library_page' }));
    } catch (error) { /* Counting never breaks a page. */ }
  });
}

/** The public pages' /google-tag.js: the functions above, run at once (the script is deferred). */
export function googleTagScriptSource() {
  return '(function(){"use strict";\n' + [scrubAnalyticsUrl, googleTagPage, googleTagEvents, allowedGoogleTagEvent, createGoogleTag, watchPublicPage].join('\n')
    + '\nvar events = googleTagEvents();\nwatchPublicPage(window, document, createGoogleTag(window, document, { id: ' + JSON.stringify(GOOGLE_TAG_ID)
    + ', host: ' + JSON.stringify(GOOGLE_TAG_HOST) + ', scrub: scrubAnalyticsUrl, page: googleTagPage,\n'
    + '  allow: function (name, params) { return allowedGoogleTagEvent(events, name, params); },\n'
    + '  notFound: document.body.classList.contains("not-found-page") }));\n})();\n';
}

/** @type {ReturnType<typeof createGoogleTag> | null} */
let appTag = null;
function tag() {
  if (!appTag) {
    const events = googleTagEvents();
    appTag = createGoogleTag(window, document, { id: GOOGLE_TAG_ID, host: GOOGLE_TAG_HOST, scrub: scrubAnalyticsUrl, page: googleTagPage,
      allow: (name, params) => allowedGoogleTagEvent(events, name, params) });
  }
  return appTag;
}

/** The app: counts the page at the current address, once per change of its scrubbed path. */
export function trackPage() {
  tag().visit();
}

/**
 * The app: sends one event of googleTagEvents(). Never pass typed text, a
 * book or anything about the reader: it would be dropped.
 * @param {string} name @param {Record<string, unknown>} [params]
 */
export function trackEvent(name, params) {
  tag().event(name, params);
}
