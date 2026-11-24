// The Google tag on the public pages (shared/google-tag.mjs; the tag's own
// rules and the app's events are tested in client/src/v2/googleTag*.test).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildPages, checkPages, origin, GOOGLE_TAG_SCRIPT_PATH } from './build-pages.mjs';
import { libraryCheckScriptSource } from './library-check-script.mjs';
import { allowedGoogleTagEvent, googleTagEvents, googleTagScriptSource } from '../../shared/google-tag.mjs';
import { scrubAnalyticsUrl } from '../../shared/analytics.mjs';
import { HTML_SECURITY_POLICY } from '../../shared/security-policy.mjs';
import { getAllLibraries } from '../../server/services/directory.js';

const APP_SHELL = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>My reading shelf</title></head><body><noscript><p>x</p></noscript><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
const TAG = `<script src="${GOOGLE_TAG_SCRIPT_PATH}" defer></script>`;
let out;
before(async () => {
  out = await mkdtemp(join(tmpdir(), 'google-tag-'));
  await writeFile(join(out, 'index.html'), APP_SHELL);
  await buildPages(out);
});
after(() => rm(out, { recursive: true, force: true }));
const read = path => readFileSync(join(out, path), 'utf8');
const pages = () => ['', 'libraries', 'books'].flatMap(folder => readdirSync(join(out, folder)).filter(name => name.endsWith('.html')).map(name => join(folder, name)));

/** A built page opened at an address, with the page's own scripts run and nothing loaded from Google. */
function open(file, path, { host = origin, webdriver, fetch, referrer } = {}) {
  const dom = new JSDOM(read(file), { url: host + path, referrer, runScripts: 'outside-only' });
  const { window } = dom;
  if (webdriver !== undefined) Object.defineProperty(window.navigator, 'webdriver', { value: webdriver });
  if (fetch) window.fetch = fetch;
  // Links are followed in the test without leaving the page.
  window.document.addEventListener('click', event => event.preventDefault());
  window.eval(read('google-tag.js'));
  if (file.startsWith('libraries/')) window.eval(libraryCheckScriptSource());
  const commands = () => Array.from(window.dataLayer || [], item => Array.from(item));
  const events = () => commands().filter(item => item[0] === 'event').map(([, name, params]) => {
    const { page_location, page_referrer, page_title, ...rest } = params;
    return [name, rest, { page_location, page_referrer, page_title }];
  });
  return { window, doc: window.document, commands, events, named: () => events().map(([name, params]) => [name, params]),
    scripts: () => [...window.document.querySelectorAll('script[src*="google"]')].map(item => item.getAttribute('src')).filter(src => src !== GOOGLE_TAG_SCRIPT_PATH),
    click: selector => window.document.querySelector(selector).click(), close: () => window.close() };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

test('every static page loads /google-tag.js once, deferred, and no inline script; the app’s two shells do not', () => {
  const files = pages();
  assert.ok(files.length > 900 && files.includes('404.html') && files.includes('privacy.html') && files.includes('books/wings-of-fire-kalam.html'));
  for (const file of files) {
    const html = read(file);
    if (file === 'index.html') { assert.ok(!html.includes('google-tag') && !html.includes('googletagmanager')); continue; }
    assert.equal(html.split(TAG).length, 2, file);
    assert.ok(!/<script(?![^>]*(?:type="application\/ld\+json"|src="\/))/.test(html), file);
    assert.ok(!/googletagmanager|google-analytics|\son[a-z]+=|\sstyle=/i.test(html), file);
    assert.equal(/ data-library-id="[^"]+" data-library-country="[A-Z]{2}">/.test(html.match(/<body[^>]*>/)[0]), file.startsWith('libraries/'), file);
  }
  assert.ok(!read('app/index.html').includes('google-tag'));
  assert.ok(existsSync(join(out, 'google-tag.js')));
});

test('the script is the shared functions: one Google host, no cookie or storage of its own, no inline code', () => {
  const script = read('google-tag.js');
  assert.equal(script, googleTagScriptSource());
  assert.deepEqual([...new Set(script.match(/https?:\/\/[^'"\s\/]+/g))].sort(), ['https://mybookshelf.cloud', 'https://www.googletagmanager.com']);
  assert.ok(!/document\.cookie|localStorage|sessionStorage|indexedDB|innerHTML|eval\(|new Function|doc\.title|user_id|user_properties/.test(script));
  assert.ok(!/\bimport\b|\bexport\b|=>/.test(script.replace(/\/\/[^\n]*/g, '')), 'plain script');
});

test('the security policy: the exact sources, the same in vercel.json', () => {
  const directives = Object.fromEntries(HTML_SECURITY_POLICY.split('; ').map(part => [part.split(' ')[0], part.split(' ').slice(1)]));
  assert.deepEqual(directives, {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://www.googletagmanager.com'],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'https://books.google.com', 'https://books.googleusercontent.com', 'https://covers.openlibrary.org', 'https://archive.org/download/',
      'https://*.us.archive.org/view_archive.php', 'https://www.googletagmanager.com', 'https://*.google-analytics.com', 'data:'],
    'connect-src': ["'self'", 'https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.google.com'],
    'font-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'self'"], 'frame-ancestors': ["'none'"],
  });
  const policies = [];
  JSON.stringify(JSON.parse(readFileSync('vercel.json', 'utf8')), (key, value) => { if (key === 'Content-Security-Policy') policies.push(value); return value; });
  assert.deepEqual(policies, [HTML_SECURITY_POLICY]);
});

test('every address the build writes is reported by name; the 404 page as /[other], whatever was typed', () => {
  const report = JSON.parse(read('seo-report.json'));
  for (const path of report.indexablePages) assert.equal(scrubAnalyticsUrl(origin + path), origin + path);
  for (const path of ['/wings-of-fire', '/books/my-search-words', '/libraries/my-search-words', '/Someone%20Typed%20This?q=x']) {
    const page = open('404.html', path);
    assert.deepEqual(page.events(), [['page_view', { page_type: 'other' }, { page_location: origin + '/[other]', page_referrer: '', page_title: 'Other page' }]]);
    page.close();
  }
});

test('a page: one view with the scrubbed address, and links into the app', () => {
  const page = open('books/wings-of-fire-kalam.html', '/books/wings-of-fire-kalam?utm_source=leaflet&q=wings#found', { referrer: 'https://www.google.com/search?q=wings' });
  assert.deepEqual(page.events(), [['page_view', { page_type: 'book_page' },
    { page_location: origin + '/books/wings-of-fire-kalam?utm_source=leaflet', page_referrer: 'https://www.google.com/', page_title: 'Book page' }]]);
  assert.deepEqual(page.commands().map(item => item[0]), ['consent', 'consent', 'js', 'set', 'config', 'event']);
  assert.deepEqual(page.scripts(), ['https://www.googletagmanager.com/gtag/js?id=G-G2QJ7MKTQ9']);
  page.click('a.brand');
  page.click('.book-heading a.button');
  page.click('.found-list a[href^="/select/"]');
  // Other pages, outside links and the page itself are not links into the app.
  for (const selector of ['a[href="/about"]', 'a[href="/books"]', 'a[href^="https://openlibrary.org"]', '.found-list a[href^="/libraries/"]', '#content']) page.click(selector);
  assert.deepEqual(page.named().slice(1), Array(3).fill(['open_app', { page_type: 'book_page' }]));
  // The address of the page names its book; nothing the reader does sends one.
  assert.ok(!/v1:|openlibrary|Wings of Fire|Kalam,/.test(JSON.stringify(page.commands())));
  page.close();
});

test('a US library page: answers after a tap, the catalog’s links and the app’s; the library, never the book', async () => {
  const replies = [{ answer: 'found', catalogUrl: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1', matches: [{ title: 'Remarkably bright creatures', url: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1' }] },
    { answer: 'unknown', reason: 'busy' }, { answer: 'unconfirmed', reason: 'secret words' }, { answer: 'surprise', reason: 'timeout' }, { answer: 'not_found', catalogUrl: 'https://oaklandlibrary.bibliocommons.com/v2/search?query=x' }];
  const page = open('libraries/oakland-public-library.html', '/libraries/oakland-public-library', { fetch: async () => ({ ok: true, json: async () => replies.shift() || {} }) });
  await settle();
  assert.deepEqual(page.named(), [['page_view', { page_type: 'library_page' }]], 'nothing without a tap');
  const rows = [...page.doc.querySelectorAll('[data-book-key]')];
  for (const row of rows.slice(0, 5)) { row.querySelector('[data-check]').click(); await settle(); }
  const library = { library_id: 'bc:oaklandlibrary', library_country: 'US' };
  const checked = (outcome, reason) => ['library_check', { outcome, ...library, event_source: 'library_page', ...(reason ? { reason } : {}) }];
  assert.deepEqual(page.named().slice(1), [checked('found'), checked('unknown', 'busy'), checked('unknown'), checked('unknown', 'timeout'), checked('not_found')]);
  // The catalog's links: after an answer, and the page's own.
  const before = page.events().length;
  rows[0].querySelector('.check-matches a').click();
  rows[0].querySelector('.check-catalog').click();
  rows[4].querySelector('.check-catalog').click();
  page.click('.library-heading a[href="https://oaklandlibrary.bibliocommons.com/"]');
  const opened = outcome => ['catalog_open', { ...(outcome ? { outcome } : {}), ...library, event_source: 'library_page' }];
  assert.deepEqual(page.named().slice(before), [opened('found'), opened('found'), opened('not_found'), opened()]);
  rows[1].querySelector('a[href^="/select/"]').click();
  assert.deepEqual(page.named().at(-1), ['open_app', { page_type: 'library_page' }]);
  const queue = JSON.stringify(page.commands());
  for (const row of rows) for (const value of [row.getAttribute('data-book-key'), row.getAttribute('data-title')]) assert.ok(!queue.includes(value), value);
  assert.ok(!/bibliocommons|creatures|secret/.test(queue));
  page.close();
});

test('an Indian library page: its catalog link, and no check', () => {
  const page = open('libraries/anna-centenary-library.html', '/libraries/anna-centenary-library');
  page.click('.library-heading a[href^="http"]');
  assert.deepEqual(page.named(), [['page_view', { page_type: 'library_page' }], ['catalog_open', { library_id: 'koha:anna-centenary-library', library_country: 'IN', event_source: 'library_page' }]]);
  page.close();
});

test('off the live site or in an automated browser: no script, no queue; a check still answers', async () => {
  for (const options of [{ host: 'http://127.0.0.1:4173' }, { host: 'https://mybookshelf-x.vercel.app' }, { webdriver: true }]) {
    const page = open('libraries/oakland-public-library.html', '/libraries/oakland-public-library', { ...options, fetch: async () => ({ ok: true, json: async () => ({ answer: 'found' }) }) });
    await settle();
    page.click('[data-check]');
    await settle();
    page.click('a.brand');
    assert.match(page.doc.querySelector('[data-check-answer]').textContent, /^Found in the catalog/);
    assert.equal(page.window.dataLayer, undefined);
    assert.deepEqual(page.scripts(), []);
    assert.equal(page.doc.cookie, '');
    page.close();
  }
});

test('the library ID pattern is the directory’s: every library, and no book key or text', () => {
  const events = googleTagEvents();
  const id = value => allowedGoogleTagEvent(events, 'select_library', { library_id: value }).library_id;
  for (const entry of getAllLibraries()) {
    assert.equal(id(entry.id), entry.id);
    assert.equal(allowedGoogleTagEvent(events, 'select_library', { library_country: entry.country }).library_country, entry.country);
  }
  for (const row of checkPages().libraries) assert.equal(id(row.id), row.id);
  for (const value of ['v1:isbn:9788173711466', 'v1:openlibrary:OL1W', '9788173711466', 'wings of fire', 'reader@example.org', 'https://x.org', 'isbn:9788173711466']) assert.equal(id(value), undefined);
});
