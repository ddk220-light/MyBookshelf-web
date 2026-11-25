// The Google tag (shared/google-tag.mjs): on every page exactly as Google gave
// it, allowed by the security policy, and the public library pages' key events.
// The app's events are tested in client/src/v2/googleTag*.test.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildPages, origin } from './build-pages.mjs';
import { libraryCheckScriptSource } from './library-check-script.mjs';
import { GOOGLE_TAG_SNIPPET } from '../../shared/google-tag.mjs';
import { HTML_SECURITY_POLICY } from '../../shared/security-policy.mjs';

let out;
before(async () => {
  out = await mkdtemp(join(tmpdir(), 'google-tag-'));
  await writeFile(join(out, 'index.html'), readFileSync('client/index.html'));
  await buildPages(out);
});
after(() => rm(out, { recursive: true, force: true }));
const pages = dir => ['', 'app', 'libraries', 'books'].flatMap(folder => readdirSync(join(dir, folder)).filter(name => name.endsWith('.html')).map(name => join(folder, name)));
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

/** The snippet once, first in the head, and the page's only inline script. */
function checkPage(html, name) {
  assert.equal(html.split(GOOGLE_TAG_SNIPPET).length, 2, name);
  assert.match(html.slice(0, html.indexOf(GOOGLE_TAG_SNIPPET)), /<head>\s*$/, name);
  assert.ok(!/<script(?![^>]*(?:type="application\/ld\+json"|src="\/))/.test(html.replace(GOOGLE_TAG_SNIPPET, '')), name);
}

test('every page has Google’s snippet, unchanged, first in its head', () => {
  const files = pages(out);
  assert.ok(files.length > 900 && ['index.html', 'app/index.html', '404.html', 'privacy.html', 'libraries/anna-centenary-library.html', 'books/wings-of-fire-kalam.html'].every(name => files.includes(name)));
  for (const file of files) checkPage(readFileSync(join(out, file), 'utf8'), file);
  // The built app shell, when there is one: Vite leaves the snippet as it is.
  if (existsSync('client/dist/app/index.html')) for (const file of ['index.html', 'app/index.html', '404.html']) checkPage(readFileSync('client/dist/' + file, 'utf8'), 'dist/' + file);
});

test('the security policy: the snippet’s hash, Google’s hosts, nothing unsafe, the same in vercel.json', () => {
  const inline = GOOGLE_TAG_SNIPPET.match(/<script>([\s\S]*?)<\/script>/)[1];
  const directives = Object.fromEntries(HTML_SECURITY_POLICY.split('; ').map(part => [part.split(' ')[0], part.split(' ').slice(1)]));
  const tag = 'https://www.googletagmanager.com';
  assert.deepEqual(directives, {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'sha256-${createHash('sha256').update(inline).digest('base64')}'`, tag, 'https://tagmanager.google.com', 'https://www.googleadservices.com', 'https://www.google.com'],
    'style-src': ["'self'", tag, 'https://tagmanager.google.com', 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'https://books.google.com', 'https://books.googleusercontent.com', 'https://covers.openlibrary.org', 'https://archive.org/download/',
      'https://*.us.archive.org/view_archive.php', tag, 'https://*.google-analytics.com', 'https://*.google.com', 'https://www.google.co.in', 'https://*.g.doubleclick.net',
      'https://www.googleadservices.com', 'https://pagead2.googlesyndication.com', 'https://ssl.gstatic.com', 'https://www.gstatic.com', 'data:'],
    'connect-src': ["'self'", tag, 'https://*.google-analytics.com', 'https://*.google.com', 'https://www.google.co.in', 'https://*.g.doubleclick.net', 'https://ad.doubleclick.net',
      'https://pagead2.googlesyndication.com', 'https://www.googleadservices.com'],
    'frame-src': ["'self'", tag], 'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'object-src': ["'none'"], 'base-uri': ["'self'"], 'frame-ancestors': ["'none'"],
  });
  const policies = [];
  JSON.stringify(JSON.parse(readFileSync('vercel.json', 'utf8')), (key, value) => { if (key === 'Content-Security-Policy') policies.push(value); return value; });
  assert.deepEqual(policies, [HTML_SECURITY_POLICY]);
});

test('a US library page: an answer after a tap and the catalog’s links are key events; the library, never the book', async () => {
  const replies = [{ answer: 'found', catalogUrl: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1', matches: [{ title: 'Remarkably bright creatures', url: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1' }] },
    { answer: 'unknown', reason: 'busy' }, { answer: 'not_found' }];
  const { window } = new JSDOM(readFileSync(join(out, 'libraries/oakland-public-library.html'), 'utf8'), { url: origin + '/libraries/oakland-public-library', runScripts: 'outside-only' });
  const doc = window.document, events = [];
  window.gtag = (...command) => events.push(JSON.parse(JSON.stringify(command)));
  window.fetch = async () => ({ ok: true, json: async () => replies.shift() || {} });
  doc.addEventListener('click', event => event.preventDefault());
  window.eval(libraryCheckScriptSource());
  await settle();
  assert.deepEqual(events, [], 'nothing without a tap');
  const rows = [...doc.querySelectorAll('[data-book-key]')];
  for (const row of rows.slice(0, 3)) { row.querySelector('[data-check]').click(); await settle(); }
  rows[0].querySelector('.check-matches a').click();
  rows[0].querySelector('.check-catalog').click();
  rows[1].querySelector('a[href^="/select/"]').click();
  const library = { library_id: 'bc:oaklandlibrary', library_country: 'US', event_source: 'library_page' };
  assert.deepEqual(events, [['event', 'library_check', { outcome: 'found', ...library }], ['event', 'library_check', { outcome: 'unknown', reason: 'busy', ...library }],
    ['event', 'library_check', { outcome: 'not_found', ...library }], ['event', 'catalog_open', library], ['event', 'catalog_open', library]]);
  // Without the tag the page works the same.
  delete window.gtag;
  rows[3].querySelector('[data-check]').click();
  await settle();
  assert.match(rows[3].querySelector('[data-check-answer]').textContent, /^Couldn’t check/);
  window.close();
});
