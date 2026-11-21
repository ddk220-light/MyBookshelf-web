import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publishedLibraries, escape, jsonLd, origin, countWord, rootShell, rootTitle, aboutText, contactEmail, shelfPages, shelfData } from './build-pages.mjs';
import manifest from '../../shared/seo-libraries.json' with { type: 'json' };
import { getAllLibraries } from '../../server/services/directory.js';
import { toPublicLibrary } from '../../server/public-v2/directory.js';

test('publication is exactly seven India, four US, one Japan; remaining directory stays usable', () => {
  const pages=publishedLibraries(), counts={};
  for(const p of pages) counts[p.library.country]=(counts[p.library.country] || 0)+1;
  assert.deepEqual(counts,{IN:7,US:4,JP:1});
  assert.ok(getAllLibraries().length > pages.length);
  for(const page of pages) assert.deepEqual(page.library,toPublicLibrary(getAllLibraries().find(r=>r.id===page.id)));
  assert.deepEqual(pages.map(p=>p.path),publishedLibraries(getAllLibraries().toReversed()).map(p=>p.path));
});
test('publication rejects missing IDs and collisions rather than generating misleading pages', () => {
  assert.throws(()=>publishedLibraries([],manifest));
  assert.throws(()=>publishedLibraries(getAllLibraries(),[manifest[0],manifest[0]]));
});
test('HTML and JSON-LD cannot escape into executable markup', () => {
  assert.equal(escape('<script>"&'), '&lt;script&gt;&quot;&amp;');
  assert.ok(!jsonLd({name:'</script><script>alert(1)</script>'}).includes('<'));
});
// The smallest app shell Vite could build: its head, the noscript note and the root.
const APP_SHELL = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>My reading shelf</title><meta name="description" content="app"><meta name="robots" content="noindex, follow"><meta property="og:title" content="x"></head><body><noscript><p>Old note</p></noscript><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';

test('the root page is the app shell made indexable, with the Search Console tag and a link to About for readers without scripts', () => {
  const html = rootShell(APP_SHELL, { siteVerification: 'token123' });
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(html.includes(`<title>${escape(rootTitle)}</title>`));
  assert.ok(html.includes('<meta name="robots" content="index, follow">') && !html.includes('noindex'));
  assert.ok(html.includes(`<link rel="canonical" href="${origin}/">`));
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.ok(html.includes('<meta name="google-site-verification" content="token123">'));
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.deepEqual(data.map(item => [item['@type'], item.url]), [['WebSite', origin + '/']]);
  assert.match(html, /<body><noscript><p>[^<]*<a href="\/about">about MyBookshelf<\/a>/);
  assert.ok(!html.includes('Old note') && html.includes('<div id="root"></div><script type="module" src="/assets/app.js"></script>'));
  assert.ok(!rootShell(APP_SHELL).includes('google-site-verification'));
  assert.throws(() => rootShell('<p>no shell</p>'));
  // The app keeps the same title on that page.
  assert.ok(readFileSync('client/src/v2/ui/AppFrame.tsx', 'utf8').includes(`export const ROOT_TITLE = '${rootTitle}';`));
});
test('one About text: the public page and the app read docs/policy/about.md', () => {
  const about = aboutText(readFileSync('docs/policy/about.md', 'utf8'));
  assert.match(about.lede, /^MyBookshelf keeps a reading shelf/);
  assert.deepEqual(about.list('How it works').map(item => item.match(/^\*\*([^*]+)\*\*/)[1]), ['Find a book.', 'Choose your library.', 'See if it’s there.']);
  assert.equal(about.list('Built to be trusted').length, 4);
  const uses = about.list('What you can do').join(' ');
  for (const words of ['mybookshelf.cloud', 'title, author or ISBN', 'barcode', '**Change**', '**In your library**', '**Not in your library**', '**Couldn’t check right now**', 'suggested books', 'link we email you', 'password', 'join your account', 'On a computer'])
    assert.ok(uses.includes(words), words);
  assert.ok(readFileSync('docs/policy/about.md', 'utf8').includes('Contact: ' + contactEmail));
  // A missing introduction or section stops the build rather than publishing a gap.
  assert.throws(() => aboutText('# About\n'));
  assert.throws(() => aboutText('# About\n\nIntro.\n').list('How it works'));
  if (existsSync('client/dist/about.html')) {
    const page = readFileSync('client/dist/about.html', 'utf8');
    for (const item of about.list('Built to be trusted')) assert.ok(page.includes(escape(item)), item);
    assert.ok(page.includes('<a class="button button-large" href="/">Open my reading shelf</a>'));
    assert.ok(page.includes(`<a href="mailto:${contactEmail}">Write to us</a>`));
    assert.ok(!/gmail|myBookshelf|Version/.test(page));
  }
});
test('built output contains only published library pages and indexable canonical sitemap URLs', () => {
  const report=JSON.parse(readFileSync('client/dist/seo-report.json'));
  assert.equal(report.libraryPages.length,12);
  // Nineteen URLs, plus /terms once the policy texts are published (VITE_POLICY_EFFECTIVE_DATE),
  // plus the library pages with a shelf that have no guide, the book pages and /books.
  const shelf=shelfPages(), extra=shelf.libraries.filter(r=>!r.guide).length+shelf.books.length+(shelf.books.length?1:0);
  assert.deepEqual(report.shelfLibraryPages,shelf.libraries.map(r=>r.path));
  assert.deepEqual(report.bookPages,shelf.books.map(b=>b.path));
  assert.equal(report.indexablePages.length,(existsSync('client/dist/terms.html')?20:19)+extra);
  for(const path of report.indexablePages) {
    const html=readFileSync('client/dist/'+(path==='/'?'index':path.slice(1))+'.html','utf8');
    assert.ok(html.includes('content="index, follow"'),path);
    assert.ok(html.includes('rel="canonical" href="'+origin+path+'"'),path);
    for(const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const target=match[1];
      if(/^\/(app|select)\//.test(target)) continue;
      assert.ok(existsSync('client/dist'+target) || existsSync('client/dist'+target+'.html') || target==='/', 'Broken link: '+target);
    }
  }
  assert.ok(readFileSync('client/dist/404.html','utf8').includes('noindex, follow'));
  assert.ok(readFileSync('client/dist/app/index.html','utf8').includes('noindex, follow'));
  // The root page is the app itself, indexable; the app's other addresses stay noindex.
  assert.ok(report.indexablePages.includes('/'));
  const root=readFileSync('client/dist/index.html','utf8'), shell=readFileSync('client/dist/app/index.html','utf8');
  assert.ok(root.includes('<div id="root"></div>') && root.includes('"@type":"WebSite"'));
  assert.equal(root.match(/<script type="module"[^>]*>/)?.[0], shell.match(/<script type="module"[^>]*>/)?.[0]);
  assert.ok(!shell.includes('rel="canonical"') && !shell.includes('"@type":"WebSite"'));
  assert.ok(!readFileSync('client/dist/sitemap.xml','utf8').includes('/app/'));
  assert.ok(!existsSync('client/dist/site.js'));
  assert.ok(!existsSync('client/dist/libraries/toronto-public-library.html'));
  assert.ok(!readFileSync('client/dist/robots.txt','utf8').includes('Disallow: /app'));
});
test('new South Indian guides are published with HTTPS official sites and honest counts in the copy', () => {
  const pages=publishedLibraries();
  for (const id of ['koha:kalaignar-centenary-library','koha:ernakulam-public-library','egranthalaya:pylib-rrlpy']) {
    const page=pages.find(p=>p.id===id);
    assert.ok(page,id);
    assert.equal(new URL(page.officialUrl).protocol,'https:');
    assert.ok(page.summary.length > 40 && page.access.length > 20);
  }
  assert.equal(countWord(11,true),'Eleven');
  const anna=pages.find(p=>p.id==='koha:anna-centenary-library');
  // The adapter supports both title/author search and exact ISBN lookup; the
  // guide summary and the directory note must say the same.
  assert.ok(anna.library.capabilities.titleSearch && anna.library.capabilities.isbnLookup);
  assert.match(anna.summary,/title or author, or look up an exact ISBN/);
  assert.match(anna.library.accessNote,/title or author, or look up an exact ISBN/);
  if (existsSync('client/dist/about.html')) {
    const home=readFileSync('client/dist/about.html','utf8'), hub=readFileSync('client/dist/libraries.html','utf8');
    assert.ok(home.includes(countWord(pages.length,true)+' reviewed guides') && !home.includes('Nine reviewed'));
    assert.ok(hub.includes(countWord(pages.length,true)+' featured guides'));
    // "Find my library" opens the app's library picker directly (the
    // /app/libraries address does that); the shelf alone does not.
    assert.ok(hub.includes('<a class="button" href="/app/libraries">Find my library</a>'));
    assert.ok(!hub.includes('Choose your library in the app'));
  }
});
test('analytics and Search Console are off by default and, when set, add only the same-origin script and the root-page tag', async () => {
  const { buildPages, pageSettings } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile, readFile, rm, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  assert.deepEqual(pageSettings({}), { analytics: false, siteVerification: null, policyEffectiveDate: null });
  assert.deepEqual(pageSettings({ VITE_ANALYTICS_ENABLED: 'true', GOOGLE_SITE_VERIFICATION: '"><script>' }), { analytics: true, siteVerification: null, policyEffectiveDate: null });
  if (existsSync('client/dist/index.html') && !pageSettings().analytics) {
    assert.ok(!existsSync('client/dist/insights.js'));
    for (const file of ['index.html', 'about.html', 'libraries.html']) {
      const html = readFileSync('client/dist/' + file, 'utf8');
      assert.ok(!html.includes('insights') && !html.includes('google-site-verification'), file);
    }
  }
  const out = await mkdtemp(join(tmpdir(), 'pages-'));
  try {
    await writeFile(join(out, 'index.html'), APP_SHELL);
    const token = 'abcDEF0123456789_-xyzABC';
    await buildPages(out, { analytics: true, siteVerification: token });
    const script = await readFile(join(out, 'insights.js'), 'utf8');
    assert.match(script, /\/_vercel\/insights\/script\.js/);
    assert.ok(!/document\.cookie|localStorage|https?:\/\/(?!mybookshelf\.cloud)/.test(script), 'no cookie, storage or other host');
    const pages = (await readdir(out)).filter(name => name.endsWith('.html'));
    for (const name of pages) {
      const html = await readFile(join(out, name), 'utf8');
      if (name === 'index.html') {
        // The root page is the app, which starts its own visit counter from its bundle.
        assert.ok(html.includes(`<meta name="google-site-verification" content="${token}">`));
        assert.ok(!html.includes('/insights.js'));
        continue;
      }
      assert.ok(!html.includes('google-site-verification'), name);
      assert.ok(html.includes('<script src="/insights.js" defer></script>'), name);
      assert.ok(!html.includes('<script>window'), 'no inline script (CSP script-src self)');
    }
    assert.ok((await readFile(join(out, 'libraries', 'anna-centenary-library.html'), 'utf8')).includes('/insights.js'));
    assert.ok(!(await readFile(join(out, 'app', 'index.html'), 'utf8')).includes('google-site-verification'));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('the policy texts are published only by the release switch, with the date filled and the native-app section kept', async () => {
  const { buildPages, pageSettings } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  assert.equal(pageSettings({ VITE_POLICY_EFFECTIVE_DATE: '<b>' }).policyEffectiveDate, null);
  assert.equal(pageSettings({ VITE_POLICY_EFFECTIVE_DATE: ' 1 December 2026 ' }).policyEffectiveDate, '1 December 2026');
  // Default build: today's page, no Terms page.
  if (existsSync('client/dist/index.html') && !existsSync('client/dist/terms.html')) {
    assert.match(readFileSync('client/dist/privacy.html', 'utf8'), /Website privacy/);
    assert.ok(!existsSync('client/dist/terms.html'));
  }
  const out = await mkdtemp(join(tmpdir(), 'pages-'));
  try {
    await writeFile(join(out, 'index.html'), APP_SHELL);
    await buildPages(out, { analytics: false, siteVerification: null, policyEffectiveDate: '1 December 2026' });
    const privacy = await readFile(join(out, 'privacy.html'), 'utf8');
    assert.match(privacy, /<p>Effective 1 December 2026\.<\/p><h2>Who we are<\/h2><p>MyBookshelf is a free, independent website and web app at mybookshelf\.cloud\. It is run by Deepak Ravikumar, India\./);
    // The standard sections, in order, and nothing else at that level before the native apps.
    const headings = [...privacy.split('id="native-apps"')[0].matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]);
    assert.deepEqual(headings, ['Who we are', 'Scope', 'Information we collect', 'How we use information', 'What we never do', 'Service providers',
      'How long we keep information', 'Your choices and rights', 'Children', 'Changes', 'Contact']);
    assert.match(privacy, /log-in link/);
    assert.match(privacy, /When you sign in, the books on your reading\s+shelf in that browser are added to your account/);
    assert.match(privacy, /<th scope="row">Optional name and email with a request or report<\/th><td>90 days<\/td>/);
    assert.match(privacy, /<a href="mailto:privacy@mybookshelf\.cloud">privacy@mybookshelf\.cloud<\/a>/);
    assert.ok(!/Pwned|What changed|gmail/i.test(privacy), 'no Have I Been Pwned, no change notice, no personal address');
    assert.ok(!privacy.includes('[EFFECTIVE DATE]') && !privacy.includes('Draft for owner'));
    assert.ok(!privacy.includes('Account recently viewed history is off until you turn it on'), 'the old website text is gone');
    assert.match(privacy, /<h2>MyBookshelf native apps \(iPhone and Android\)<\/h2>[\s\S]*<h3>Library card and PIN<\/h3>/);
    assert.match(privacy, /<a href="\/terms">Terms<\/a>/);
    const terms = await readFile(join(out, 'terms.html'), 'utf8');
    assert.match(terms, /You must be 18 or older, or have a parent&#39;s or guardian&#39;s permission\./);
    assert.ok(terms.includes('privacy@mybookshelf.cloud') && !/gmail/.test(terms));
    assert.ok((await readFile(join(out, 'about.html'), 'utf8')).includes('<a href="/terms">Terms</a>'), 'the footer links the published Terms');
    const report = JSON.parse(await readFile(join(out, 'seo-report.json'), 'utf8'));
    const shelf = shelfPages();
    assert.equal(report.indexablePages.length, 20 + shelf.libraries.filter(r => !r.guide).length + shelf.books.length + (shelf.books.length ? 1 : 0));
    assert.ok(report.indexablePages.includes('/terms'));
  } finally { await rm(out, { recursive: true, force: true }); }
});

// A small shelf data set on real directory libraries and pool books.
function fixtureShelves({ count = 6 } = {}) {
  const { pool, removed } = shelfData();
  const books = {}, checks = {};
  pool.slice(0, 12).forEach((b, i) => {
    books[b.bookKey] = { slug: `fixture-book-${i}`, title: b.title, authors: [b.author], openLibraryUrl: `https://openlibrary.org/works/${b.bookKey.split(':').pop()}`, fetchedOn: '2026-11-21',
      ...(i % 2 ? { coverId: '9153819' } : {}), ...(i === 0 ? { description: 'A short description <b>with</b> "quotes".', isbns: ['9788173711466'], firstPublished: 1999 } : {}) };
  });
  const found = n => Object.fromEntries(pool.slice(0, n).map((b, i) => [b.bookKey, { outcome: 'found', on: i === 1 ? '2026-11-22' : '2026-11-21', matchTitle: b.title }]));
  const withFailures = { ...found(count), [pool[count].bookKey]: { outcome: 'couldnt_check', on: '2026-11-21', reason: 'timeout' }, [pool[count + 1].bookKey]: { outcome: 'not_found', on: '2026-11-21' } };
  const shelves = { libraries: {
    'egranthalaya:jklibraries-srsjammu': { slug: 'srs-central-library', checks: withFailures },
    'koha:anna-centenary-library': { slug: 'ignored-for-a-guide', checks: found(10) },
    'koha:iim-visakhapatnam': { slug: 'iim-visakhapatnam-library', checks: found(4) },
    'koha:goa-dhe-cescaccs': { slug: 'ces-college', checks: found(10) },
  }, books };
  return { shelves, pool, removed };
}
test('shelves: five or more found books make a page, fewer do not; guides gain the shelf; excluded libraries never appear', () => {
  const shelf = shelfPages(fixtureShelves());
  assert.deepEqual(shelf.libraries.map(r => r.path).sort(), ['/libraries/anna-centenary-library', '/libraries/srs-central-library']);
  const srs = shelf.libraries.find(r => r.id === 'egranthalaya:jklibraries-srsjammu');
  assert.equal(srs.shelf.length, 6);
  assert.equal(srs.lastmod, '2026-11-22');
  assert.equal(shelf.libraries.find(r => r.id === 'koha:anna-centenary-library').guide.slug, 'anna-centenary-library');
  assert.equal(shelf.libraries.find(r => r.id === 'koha:anna-centenary-library').shelf.length, 10);
  // A failed check is not on the shelf and is not "not found" on any page.
  assert.ok(!srs.shelf.some(item => item.bookKey === fixtureShelves().pool[6].bookKey));
  assert.equal(shelfPages(fixtureShelves({ count: 4 })).libraries.length, 1);
  // Book pages: every book on a published shelf, with every library that has it.
  assert.equal(shelf.books.length, 10);
  const first = shelf.bookByKey.get(fixtureShelves().pool[0].bookKey);
  assert.deepEqual(first.libraries.map(item => item.row.id), ['koha:anna-centenary-library', 'egranthalaya:jklibraries-srsjammu']);
  // Slug clashes and bad slugs stop the build.
  const bad = fixtureShelves();
  bad.shelves.libraries['egranthalaya:jklibraries-srsjammu'].slug = 'anna-centenary-library';
  assert.throws(() => shelfPages(bad), /collision/);
  const ugly = fixtureShelves();
  ugly.shelves.books[ugly.pool[0].bookKey].slug = 'Bad Slug';
  assert.throws(() => shelfPages(ugly), /slug/);
});
test('library and book pages: shelf section, links both ways, sitemap with check dates, no search text in URLs, CSP-safe HTML', async () => {
  const { buildPages } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const out = await mkdtemp(join(tmpdir(), 'pages-'));
  try {
    await writeFile(join(out, 'index.html'), APP_SHELL);
    const shelf = shelfPages(fixtureShelves());
    await buildPages(out, { analytics: false, siteVerification: null, policyEffectiveDate: null }, shelf);
    const read = path => readFile(join(out, path.slice(1) + '.html'), 'utf8');
    const srs = await read('/libraries/srs-central-library');
    // The town its own catalog page publishes (india-library-regions.json `places`) is in the title.
    assert.match(srs, /<title>SRS Central Library, Jammu — catalog and book search<\/title>/);
    assert.match(srs, /<p class="eyebrow">Jammu · Jammu and Kashmir · India<\/p>/);
    assert.match(srs, /<h2 id="shelf-heading">Books found in this library’s catalog<\/h2>/);
    assert.equal((srs.match(/<li class="shelf-book">/g) || []).length, 6);
    assert.ok(srs.includes('Found in the catalog · checked 22 November 2026'));
    assert.ok(srs.includes('loading="lazy"') && srs.includes('src="https://covers.openlibrary.org/b/id/9153819-M.jpg"'));
    assert.ok(srs.includes('not operated by or affiliated with SRS Central Library'));
    assert.ok(srs.includes('couldn’t check, never that the book isn’t there'));
    assert.ok(!/copies available|due back|floor \d|shelf number/i.test(srs));
    assert.ok(!srs.includes('Official library website'), 'no official site the directory lacks');
    const data = JSON.parse(srs.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    assert.deepEqual(data.map(item => item['@type']), ['WebPage', 'Library', 'BreadcrumbList', 'ItemList']);
    assert.equal(data[3].itemListElement.length, 6);
    // The guide keeps its reviewed content and gains the shelf.
    const anna = await read('/libraries/anna-centenary-library');
    assert.ok(anna.includes('What MyBookshelf can check here') && anna.includes('Books found in this library’s catalog'));
    assert.equal((anna.match(/<li class="shelf-book">/g) || []).length, 10);
    // No page for fewer than five books, or for an excluded library.
    const { existsSync: exists } = await import('node:fs');
    assert.ok(!exists(join(out, 'libraries/iim-visakhapatnam-library.html')) && !exists(join(out, 'libraries/ces-college.html')));
    // Book page: Book data, a link to each library page and a check at that library.
    const book = shelf.books.find(b => b.details.slug === 'fixture-book-0');
    const page = await read(book.path);
    assert.ok(page.includes('<meta name="robots" content="index, follow">') && page.includes(`<link rel="canonical" href="${origin}${book.path}">`));
    assert.ok(page.includes('href="/libraries/srs-central-library"') && page.includes('href="/libraries/anna-centenary-library"'));
    assert.ok(page.includes(`href="/app/books/${encodeURIComponent(book.bookKey)}">Check my library</a>`));
    assert.ok(page.includes(`href="/select/srs-central-library?book=${encodeURIComponent(book.bookKey)}"`));
    assert.ok(page.includes('A short description &lt;b&gt;with&lt;/b&gt; &quot;quotes&quot;.') && page.includes('Description from <a href="https://openlibrary.org/works/'));
    // Open Library's earliest listed edition is not shown (often a reprint year).
    assert.ok(!page.includes('Earliest edition') && !page.includes('1999'));
    // The top navigation links the book index on every public page.
    assert.match(page, /<nav aria-label="Main navigation">.*<a href="\/books">Books<\/a>.*<\/nav>/);
    assert.match(srs, /<nav aria-label="Main navigation">.*<a href="\/books">Books<\/a>.*<\/nav>/);
    const bookData = JSON.parse(page.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    const ld = bookData.find(item => item['@type'] === 'Book');
    assert.deepEqual([ld.name, ld.author[0].name, ld.isbn, ld.url], [book.details.title, book.details.authors[0], '9788173711466', origin + book.path]);
    assert.ok(bookData.some(item => item['@type'] === 'BreadcrumbList'));
    // Library page links to the book page, and the indexes link to both.
    assert.ok(srs.includes(`href="${book.path}"`));
    const hub = await readFile(join(out, 'libraries.html'), 'utf8'), index = await readFile(join(out, 'books.html'), 'utf8');
    assert.ok(hub.includes('id="india-by-state"') && hub.includes('href="/libraries/srs-central-library"') && hub.includes('<h3>Jammu and Kashmir</h3>') && hub.includes('href="/books"'));
    for (const b of shelf.books) assert.ok(index.includes(`href="${b.path}"`), b.path);
    // Sitemap: every new page, with the date of its data.
    const sitemap = await readFile(join(out, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes(`<loc>${origin}/libraries/srs-central-library</loc><lastmod>2026-11-22</lastmod>`));
    assert.ok(sitemap.includes(`<loc>${origin}${book.path}</loc><lastmod>2026-11-21</lastmod>`));
    assert.ok(sitemap.includes(`<loc>${origin}/books</loc>`));
    assert.ok(!sitemap.includes('/select/') && !sitemap.includes('/app/'));
    const report = JSON.parse(await readFile(join(out, 'seo-report.json'), 'utf8'));
    assert.equal(report.indexablePages.length, 19 + 1 + shelf.books.length + 1);
    for (const path of report.indexablePages) {
      const html = await readFile(join(out, path === '/' ? 'index.html' : path.slice(1) + '.html'), 'utf8');
      // CSP 'self': no inline style or handler, no inline script but JSON-LD, images only from allowed hosts.
      assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html), path);
      assert.ok(!/<script(?![^>]*(?:type="application\/ld\+json"|type="module"|src="\/))/.test(html), path);
      for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) assert.match(m[1], /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-[ML]\.jpg$/, path);
      // No search text in any URL: no q= parameter, and select links carry only the book key.
      for (const m of html.matchAll(/href="([^"]+)"/g)) {
        assert.ok(!/[?&](q|query|search)=/i.test(m[1]), m[1]);
        if (m[1].startsWith('/select/')) assert.match(m[1], /^\/select\/[a-z0-9-]+(\?book=v1%3A[a-z]+%3A[A-Za-z0-9]+)?$/);
        if (m[1].startsWith('/') && !/^\/(app|select)\//.test(m[1])) {
          const target = m[1].split(/[?#]/)[0];
          assert.ok(target === '/' || exists(join(out, target.slice(1) + '.html')) || exists(join(out, target.slice(1))) || /^\/(site\.css|favicon|apple-touch|manifest|og\/)/.test(target) || ['/privacy','/support'].includes(target) || target === '/terms', 'Broken link: ' + target + ' on ' + path);
        }
      }
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});
