import { describe, expect, it } from 'vitest';
import { scrubAnalyticsUrl } from './analytics';
import { CHECK_REASONS } from './api';
import { openedFrom, outcomeOf } from './googleTag';
import { allowedGoogleTagEvent, createGoogleTag, GOOGLE_TAG_HOST, GOOGLE_TAG_ID, googleTagEvents, googleTagPage, trackEvent, trackPage } from '../../../shared/google-tag.mjs';

const O = 'https://mybookshelf.cloud';
const EVENTS = googleTagEvents();
const allow = (name: string, params?: Record<string, unknown> | null) => allowedGoogleTagEvent(EVENTS, name, params);
const BOOK = `${O}/app/books/v1%3Aisbn%3A9788173711466`;

/** A document of the live site (or another) with the tag: what was pushed to Google's queue, and the scripts added. */
function site(href = O + '/', { referrer = '', webdriver = undefined as boolean | undefined, notFound = false, win = {} as Record<string, unknown>, doc = {} as Record<string, unknown> } = {}) {
  const scripts: Array<{ src?: string; async?: boolean }> = [];
  const fakeWindow: any = { location: new URL(href), navigator: { webdriver }, URL, URLSearchParams, ...win };
  const fakeDocument: any = { referrer, title: 'Wings of Fire | MyBookshelf', head: { appendChild: (node: object) => scripts.push(node) }, createElement: () => ({}), ...doc };
  const tag = createGoogleTag(fakeWindow, fakeDocument, { id: GOOGLE_TAG_ID, host: GOOGLE_TAG_HOST, scrub: scrubAnalyticsUrl, page: googleTagPage, allow, notFound });
  const commands = () => Array.from((fakeWindow.dataLayer || []) as ArrayLike<unknown>[], item => Array.from(item)) as any[][];
  const events = () => commands().filter(item => item[0] === 'event').map(item => [item[1], item[2]]);
  return { tag, scripts, commands, events, names: () => events().map(item => item[0]), window: fakeWindow,
    go: (to: string) => { fakeWindow.location = new URL(to, O); tag.visit(); } };
}

describe('where the Google tag runs', () => {
  it('on the live site: consent, js, set, config and page_view, in that order, and one async script', () => {
    const page = site(O + '/?q=wings+of+fire&utm_source=newsletter#top');
    page.tag.visit();
    const shown = { page_location: O + '/?utm_source=newsletter', page_referrer: '', page_title: 'Reading shelf' };
    const denied = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
    const commands = page.commands();
    expect(commands.map(item => item[0])).toEqual(['consent', 'consent', 'js', 'set', 'config', 'event']);
    expect(commands[0]).toEqual(['consent', 'default', { ...denied, analytics_storage: 'denied', region: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
      'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'] }]);
    expect(new Set(commands[0][2].region).size).toBe(27 + 3 + 2);
    expect(commands[1]).toEqual(['consent', 'default', { ...denied, analytics_storage: 'granted' }]);
    expect(commands[2][1]).toBeInstanceOf(Date);
    expect(commands[3]).toEqual(['set', shown]);
    expect(commands[4]).toEqual(['config', 'G-G2QJ7MKTQ9', { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_expires: 34128000, cookie_flags: 'SameSite=Lax;Secure' }]);
    expect(commands[5]).toEqual(['event', 'page_view', { ...shown, page_type: 'shelf' }]);
    expect(page.scripts).toEqual([{ async: true, src: 'https://www.googletagmanager.com/gtag/js?id=G-G2QJ7MKTQ9' }]);
    // Google reads commands only as `arguments` objects.
    expect(Object.prototype.toString.call(page.window.dataLayer[0])).toBe('[object Arguments]');
    // No user ID, user property or anything else that stands for a person.
    expect(JSON.stringify(commands)).not.toMatch(/user_id|user_properties|client_id/);
  });

  it('nowhere else: another host, an automated browser or the admin view loads, queues and sends nothing', () => {
    for (const page of [site('http://localhost:5173/'), site('http://127.0.0.1:4173/'), site('https://www.mybookshelf.cloud/'), site('https://mybookshelf-git-x.vercel.app/'),
      site('https://mybookshelf.cloud.example/'), site('https://staging.mybookshelf.cloud/'), site(O + '/', { webdriver: true }),
      site(O + '/app/admin'), site(O + '/app/admin/requests?x=1'), site(O + '/App/ADMIN'), site(O + '/app/%61dmin'), site(O + '//app//admin')]) {
      page.tag.visit();
      page.tag.event('library_request');
      expect(page.scripts, page.window.location.href).toEqual([]);
      expect(page.window.dataLayer).toBeUndefined();
    }
    for (const webdriver of [undefined, false]) { const page = site(O + '/', { webdriver }); page.tag.visit(); expect(page.scripts).toHaveLength(1); }
    // Later, too: in the app's own navigation to the admin view nothing is sent, held events included.
    const page = site(O + '/');
    page.tag.visit();
    page.go('/app/admin');
    page.tag.event('library_request');
    page.go('/about');
    expect(page.names()).toEqual(['page_view', 'page_view']);
    expect(JSON.stringify(page.commands())).not.toContain('admin');
  });

  it('waits on account pages (their links carry tokens) until the next page, then sends what happened there', () => {
    for (const path of ['/app/account/verify#token=secret', '/app/account/magic-link?token=secret', '/App/Account/verify#token=secret', '/app/%61ccount/verify#token=secret', '//app/account/verify#token=secret', '/app/account']) {
      const page = site(O + path);
      page.tag.visit();
      page.tag.event('sign_up', { method: 'password' });
      expect(page.scripts, path).toEqual([]);
      expect(page.window.dataLayer).toBeUndefined();
      page.go('/app/account/welcome');
      expect(page.scripts).toEqual([]);
      page.go('/');
      expect(page.scripts).toHaveLength(1);
      expect(page.names()).toEqual(['page_view', 'sign_up']);
      expect(JSON.stringify(page.commands())).not.toMatch(/secret|account/);
    }
    // At most twenty wait, in memory.
    const page = site(O + '/app/account/sign-in');
    for (let index = 0; index < 50; index += 1) page.tag.event('library_request');
    page.go('/');
    expect(page.names()).toEqual(['page_view', ...Array(20).fill('library_request')]);
  });

  it('in the app’s own navigation to an account page: nothing is sent there, Google’s automatic events included', () => {
    const page = site(O + '/');
    page.tag.visit();
    expect(page.window['ga-disable-' + GOOGLE_TAG_ID]).toBeUndefined();
    page.go('/app/account/sign-in?returnTo=%2F');
    page.tag.event('login', { method: 'password' });
    expect(page.window['ga-disable-' + GOOGLE_TAG_ID]).toBe(true);
    expect(page.names()).toEqual(['page_view']);
    page.go('/');
    expect(page.window['ga-disable-' + GOOGLE_TAG_ID]).toBe(false);
    expect(page.names()).toEqual(['page_view', 'page_view', 'login']);
    expect(JSON.stringify(page.commands())).not.toContain('account');
  });

  it('never throws, whatever is missing or blocked', () => {
    const broken = [site(O + '/', { win: { dataLayer: { push: () => { throw new Error('blocked'); } } } }), site(O + '/', { doc: { head: null } }),
      site(O + '/', { doc: { createElement: () => { throw new Error('blocked'); } } }), site(O + '/', { win: { URLSearchParams: undefined } }), site(O + '/', { win: { location: undefined } })];
    for (const page of broken) expect(() => { page.tag.visit(); page.tag.event('library_request'); page.tag.event('book_search', null as any); }).not.toThrow();
  });

  it('the app’s own calls do nothing off the live site', () => {
    trackPage();
    trackEvent('library_request');
    expect((window as any).dataLayer).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});

describe('what a page view says', () => {
  const view = (href: string, options = {}) => { const page = site(href, options); page.tag.visit(); return page.events()[0][1]; };

  it('the scrubbed address and a fixed title, never the query, the fragment, a book key or document.title', () => {
    for (const [path, location, type, title] of [
      ['/', '/', 'shelf', 'Reading shelf'], ['/app/books/v1%3Aisbn%3A9788173711466?page=library#x', '/app/books/[book]', 'book', 'Book'],
      ['/app/read/gutenberg%3A1342', '/app/read/[item]', 'free_reading', 'Free reading'], ['/app/settings/account', '/app/settings/account', 'account_settings', 'Account settings'],
      ['/app/settings/account/email', '/app/[other]', 'other', 'Other page'], ['/app/report', '/app/report', 'report', 'Report a problem'], ['/app/privacy', '/app/privacy', 'privacy', 'Privacy'],
      ['/select/anna-centenary-library?book=v1%3Aisbn%3A9788173711466', '/select/anna-centenary-library', 'library_link', 'Library link'],
      ['/libraries', '/libraries', 'libraries', 'Libraries'], ['/libraries/anna-centenary-library?q=x', '/libraries/anna-centenary-library', 'library_page', 'Library page'],
      ['/books', '/books', 'books', 'Books'], ['/books/wings-of-fire-kalam', '/books/wings-of-fire-kalam', 'book_page', 'Book page'],
      ['/privacy', '/privacy', 'privacy', 'Privacy'], ['/support', '/support', 'help', 'Help'], ['/Wings%20of%20Fire', '/[other]', 'other', 'Other page'],
    ]) expect(view(O + path), path).toEqual({ page_location: O + location, page_referrer: '', page_title: title, page_type: type });
    // A 404 page is never reported by the address typed for it.
    expect(view(O + '/books/my-search-words', { notFound: true })).toEqual({ page_location: O + '/[other]', page_referrer: '', page_title: 'Other page', page_type: 'other' });
  });

  it('four utm values at most, each short and plain', () => {
    expect(view(O + '/?utm_content=a.b&utm_source=news_letter&q=wings&utm_medium=email&utm_campaign=nov-26&utm_term=wings&gclid=abc&fbclid=x').page_location)
      .toBe(O + '/?utm_source=news_letter&utm_medium=email&utm_campaign=nov-26&utm_content=a.b');
    for (const value of ['wings of fire', 'reader@example.org', 'https://x.org', 'a'.repeat(41), 'é', '', 'a%26b=c'])
      expect(view(O + '/about?utm_source=' + encodeURIComponent(value)).page_location).toBe(O + '/about');
  });

  it('an outside referrer is its origin only; our own goes through the scrubber; nothing else', () => {
    for (const [referrer, sent] of [
      ['https://www.google.com/search?q=wings+of+fire', 'https://www.google.com/'], ['http://blog.example.org:8080/post/1#x', 'http://blog.example.org:8080/'],
      [O + '/libraries/anna-centenary-library?q=x#y', O + '/libraries/anna-centenary-library'], [BOOK + '?x=1', O + '/app/books/[book]'],
      [O + '/app/account/verify#token=secret', O + '/app/account'], [O + '/app/admin', ''], ['https://mybookshelf.cloud.example/secret', 'https://mybookshelf.cloud.example/'],
      ['android-app://com.google.android.gm/', ''], ['about:blank', ''], ['not a url', ''], ['', ''],
    ]) expect(view(O + '/', { referrer }).page_referrer, referrer).toBe(sent);
  });

  it('public addresses the build writes are reported by name; a book page by its slug only', () => {
    for (const path of ['/', '/libraries', '/books', '/about', '/how-it-works', '/open-source', '/privacy', '/terms', '/support', '/libraries/anna-centenary-library', '/books/wings-of-fire-kalam', '/books/1984-orwell'])
      expect(scrubAnalyticsUrl(O + path)).toBe(O + path);
    for (const path of ['/books/Wings', '/books/wings%20of%20fire', '/books/a/b', '/books/-a', '/books/a--b', '/books/wings_of_fire', '/bookshelf', '/books.html'])
      expect(scrubAnalyticsUrl(O + path), path).toBe(O + '/[other]');
    expect(scrubAnalyticsUrl(O + '/books/?q=x')).toBe(O + '/books');
  });
});

describe('navigation in the app', () => {
  it('one page view per change of the scrubbed path, with the page before as the referrer; set again for Google’s own events', () => {
    const page = site(O + '/?utm_source=poster', { referrer: 'https://www.google.com/search?q=x' });
    page.tag.visit();
    page.tag.visit();
    page.go('/?utm_source=poster');
    page.go('/app/books/v1%3Aisbn%3A9788173711466');
    page.go('/app/books/v1%3Aopenlibrary%3AOL1W');
    page.go('/');
    const views = page.events().map(item => item[1]);
    expect(views.map(item => [item.page_location, item.page_referrer, item.page_type])).toEqual([
      [O + '/?utm_source=poster', 'https://www.google.com/', 'shelf'], [O + '/app/books/[book]', O + '/', 'book'], [O + '/', O + '/app/books/[book]', 'shelf']]);
    const sets = page.commands().filter(item => item[0] === 'set').map(item => item[1]);
    expect(sets).toEqual(views.map(({ page_type: _type, ...rest }) => rest));
    expect(page.commands().filter(item => item[0] === 'config')).toHaveLength(1);
    expect(page.scripts).toHaveLength(1);
  });

  it('an address that only redirects is not a page view', () => {
    for (const path of ['/app', '/app/shelf', '/app/search?q=wings', '/app/libraries', '/app/settings', '/app/settings/account/more', '/find?q=x', '/app/settings/']) {
      const page = site(O + path);
      page.tag.visit();
      expect(page.scripts, path).toEqual([]);
      page.tag.event('library_request');
      page.go('/');
      expect(page.names()).toEqual(['page_view', 'library_request']);
      page.go(path);
      page.tag.event('problem_report');
      expect(page.names()).toHaveLength(2);
      page.go('/');
      expect(page.names()).toEqual(['page_view', 'library_request', 'problem_report']);
    }
  });

  it('an event belongs to the page it happened on: that page’s view comes first, once', () => {
    const page = site(O + '/');
    page.tag.visit();
    page.window.location = new URL(BOOK);
    page.tag.event('book_open', { event_source: 'search' });
    page.tag.visit();
    expect(page.names()).toEqual(['page_view', 'page_view', 'book_open']);
    expect(page.events()[2][1]).toEqual({ page_location: O + '/app/books/[book]', page_referrer: O + '/', page_title: 'Book', event_source: 'search' });
  });
});

describe('the allow list of events', () => {
  // Things a reader types, and things that stand for a reader, a book or a place.
  const PRIVATE = ['wings of fire', 'Wings', 'dune', '9788173711466', '978-81-7371-146-6', 'v1:isbn:9788173711466', 'v1:openlibrary:OL1W', 'v1:catalog:koha:anna:12', 'A. P. J. Abdul Kalam',
    'reader@example.org', 'https://catalog.example.test/record/1', '//x.org', 'Chennai', '13.0827,80.2707', '13.0827', 'IN ', 'in', 'IND', 'koha', 'koha:', ':anna', 'koha:anna library', 'koha:anna@x.org', 'koha:a/b',
    'isbn:9788173711466', 'title:dune', 'koha:' + 'a'.repeat(81), 'found\n', 'results ', 'Results', '', '0f8fad5b-d9cb-469f-a165-70867728950e', '<script>', '[object Object]'];

  it('drops an unknown event, an unknown parameter and any value not listed', () => {
    for (const name of ['search', 'view_search_results', 'book_search2', 'wings of fire', '', 'constructor', '__proto__', 'toString']) expect(allow(name, { outcome: 'found' }), name).toBeNull();
    for (const [name, params] of Object.entries(EVENTS)) {
      expect(allow(name)).toEqual({});
      expect(allow(name, null)).toEqual({});
      for (const value of PRIVATE) {
        for (const key of Object.keys(params)) expect(allow(name, { [key]: value }), name + ' ' + key + ' ' + value).toEqual({});
        for (const key of ['search_term', 'q', 'query', 'book_key', 'isbn', 'title', 'author', 'email', 'user_id', 'city', 'lat', 'lon', 'link_url', 'page_location', 'page_title', 'page_referrer', 'source'])
          expect(allow(name, { [key]: value })).toEqual({});
      }
      for (const value of [undefined, null, 1, true, ['found'], { toString: () => 'found' }, new String('found')]) for (const key of Object.keys(params)) expect(allow(name, { [key]: value })).toEqual({});
    }
  });

  it('sends what is listed, and only that', () => {
    expect(allow('library_check', { outcome: 'unknown', reason: 'timeout', library_id: 'koha:anna-centenary-library', library_country: 'IN', event_source: 'book_page', title: 'Wings of Fire', bookKey: 'v1:isbn:9788173711466' }))
      .toEqual({ outcome: 'unknown', reason: 'timeout', library_id: 'koha:anna-centenary-library', library_country: 'IN', event_source: 'book_page' });
    for (const id of ['bc:sfpl', 'calil:Tokyo_Setagaya', 'aspen:_itw_clevnet', 'discovery-academic:autolib-patna-bnmc', 'libman:100']) expect(allow('select_library', { library_id: id })).toEqual({ library_id: id });
    // Every reason the app knows is one the table knows.
    expect(EVENTS.library_check.reason).toEqual([...CHECK_REASONS]);
    const page = site(O + '/');
    page.tag.event('book_search', { outcome: 'results', result_band: '1-5', method: 'typed', q: 'wings of fire' });
    page.tag.event('wings of fire', { outcome: 'results' });
    page.tag.event('page_view', { page_type: 'shelf' });
    expect(page.names()).toEqual(['page_view', 'book_search']);
    expect(page.events()[1][1]).toEqual({ page_location: O + '/', page_referrer: '', page_title: 'Reading shelf', outcome: 'results', result_band: '1-5', method: 'typed' });
  });

  it('every page type and event value is a fixed word; only the library ID and country are patterns', () => {
    for (const params of Object.values(EVENTS)) for (const [key, rule] of Object.entries(params)) {
      if (rule instanceof RegExp) expect(['library_id', 'library_country']).toContain(key);
      else for (const value of rule) expect(value).toMatch(/^[a-z0-9_+-]{1,20}$/);
    }
    const types = EVENTS.page_view.page_type as readonly string[];
    for (const path of ['/', '/app/books/[book]', '/app/read/[item]', '/app/settings/account', '/app/report', '/app/privacy', '/privacy', '/app/terms', '/terms', '/app/about', '/about', '/how-it-works',
      '/open-source', '/support', '/libraries', '/libraries/a', '/books', '/books/a', '/select/a', '/select', '/select/[other]', '/[other]', '/app/[other]', '/constructor']) expect(types).toContain(googleTagPage(path).type);
    expect(googleTagPage('/constructor').type).toBe('other');
  });
});

describe('the app’s words for events', () => {
  it('how a book page was opened', () => {
    for (const [navigation, source] of [
      [null, 'link'], [{ from: 'shelf', source: 'direct' }, 'shelf'], [{ from: 'shelf', source: 'direct', suggested: true }, 'suggestion'], [{ from: 'shelf', source: 'direct', viewed: true }, 'viewed'],
      [{ from: 'search', source: 'search' }, 'search'], [{ from: 'shelf', source: 'isbn' }, 'search'], [{ from: 'shelf', source: 'search' }, 'search'], [{ from: 'shelf', source: 'camera' }, 'scan'], [{ overlay: 'library' }, 'other'],
    ] as Array<[any, string]>) {
      expect(openedFrom(navigation)).toBe(source);
      expect(allow('book_open', { event_source: source })).toEqual({ event_source: source });
    }
  });
  it('a library’s answer: anything but found and not found is "unknown"', () => {
    expect(['found', 'not_found', 'unconfirmed', 'unknown'].map(outcomeOf)).toEqual(['found', 'not_found', 'unknown', 'unknown']);
  });
});
