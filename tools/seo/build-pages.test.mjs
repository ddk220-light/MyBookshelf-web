import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { POLICY_EFFECTIVE_DATE, PLACEHOLDER_PATTERN, policyEffectiveDate, withEffectiveDate } from '../../shared/policy-effective-date.mjs';
import { publishedLibraries, escape, jsonLd, origin, countWord, rootShell, rootTitle, aboutText, contactEmail, shelfPages, shelfData, checkPages, checkData, CHECK_SCRIPT_PATH } from './build-pages.mjs';
import { checkPublication, CHECK_BOOKS } from './check-pages.mjs';
import { libraryCheckScriptSource, installLibraryChecks } from './library-check-script.mjs';
import usList from '../../shared/us-book-pool.json' with { type: 'json' };
import usPages from '../../shared/seo-us-libraries.json' with { type: 'json' };
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
  // Twenty URLs (with /terms: the policy texts carry their committed date),
  // plus the library pages with a shelf that have no guide, the California
  // pages that have no guide, the book pages and /books.
  const shelf=shelfPages(), check=checkPages(), extra=shelf.libraries.filter(r=>!r.guide).length+check.libraries.filter(r=>!r.guide).length+shelf.books.length+(shelf.books.length?1:0);
  assert.deepEqual(report.shelfLibraryPages,shelf.libraries.map(r=>r.path));
  assert.deepEqual(report.checkLibraryPages,check.libraries.map(r=>r.path));
  assert.deepEqual(report.bookPages,shelf.books.map(b=>b.path));
  assert.ok(report.indexablePages.includes('/terms'));
  assert.equal(report.indexablePages.length,20+extra);
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
test('the built bundle and pages carry the policy date and no placeholder such as [EFFECTIVE DATE]', () => {
  const files=dir=>readdirSync(dir).flatMap(name=>statSync(join(dir,name)).isDirectory()?files(join(dir,name)):[join(dir,name)]);
  const found=[];
  for(const file of files('client/dist').filter(f=>/\.(html|js|css|json|xml|txt|webmanifest)$/.test(f))) {
    const text=readFileSync(file,'utf8');
    const hit=text.match(PLACEHOLDER_PATTERN)?.[0] || (/\.(html|xml)$/.test(file) && text.match(/\{\{[^}]*\}\}/)?.[0]);
    if(hit) found.push(file+': '+hit);
  }
  assert.deepEqual(found,[]);
  const line=`Effective ${POLICY_EFFECTIVE_DATE}.`;
  const bundle=readdirSync('client/dist/assets').filter(f=>f.endsWith('.js')).map(f=>readFileSync('client/dist/assets/'+f,'utf8')).join('');
  assert.ok(bundle.includes(line),'the app bundle has the dated texts');
  assert.ok(readFileSync('client/dist/privacy.html','utf8').includes(`<p>${line}</p>`));
  assert.ok(readFileSync('client/dist/terms.html','utf8').includes(`<p>${line} MyBookshelf is run by Deepak Ravikumar, India.</p>`));
  // The site's date format ("20 November 2026"), and a value the policy check accepts.
  assert.match(POLICY_EFFECTIVE_DATE,/^\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
  assert.equal(policyEffectiveDate(POLICY_EFFECTIVE_DATE),POLICY_EFFECTIVE_DATE);
  assert.throws(()=>withEffectiveDate('Effective [EFFECTIVE DATE]. [NAME]'),/placeholder/);
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
  assert.deepEqual(pageSettings({}), { analytics: false, siteVerification: null, policyEffectiveDate: POLICY_EFFECTIVE_DATE });
  assert.deepEqual(pageSettings({ VITE_ANALYTICS_ENABLED: 'true', GOOGLE_SITE_VERIFICATION: '"><script>' }), { analytics: true, siteVerification: null, policyEffectiveDate: POLICY_EFFECTIVE_DATE });
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

test('every build publishes the policy texts with the committed date and keeps the native-app section', async () => {
  const { buildPages, pageSettings } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // The date is committed (shared/policy-effective-date.mjs); a build setting cannot change it.
  assert.equal(pageSettings({}).policyEffectiveDate, POLICY_EFFECTIVE_DATE);
  assert.equal(pageSettings({ VITE_POLICY_EFFECTIVE_DATE: '1 December 2026' }).policyEffectiveDate, POLICY_EFFECTIVE_DATE);
  const out = await mkdtemp(join(tmpdir(), 'pages-'));
  try {
    await writeFile(join(out, 'index.html'), APP_SHELL);
    await buildPages(out, pageSettings({}));
    const privacy = await readFile(join(out, 'privacy.html'), 'utf8');
    assert.ok(privacy.includes(`<p>Effective ${POLICY_EFFECTIVE_DATE}.</p><h2>Who we are</h2><p>MyBookshelf is a free, independent website and web app at mybookshelf.cloud. It is run by Deepak Ravikumar, India.`));
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
    // The published texts start with their title: no reviewers' note ("> Draft ...") above it.
    for (const name of ['privacy', 'terms', 'about']) assert.match(readFileSync(`docs/policy/${name}.md`, 'utf8'), /^# \S/, name);
    // Every service provider is named: GitHub runs the nightly backup, Vercel keeps it encrypted.
    assert.match(privacy, /<th scope="row">GitHub<\/th><td>Running the nightly backup of the accounts database\. The copy is encrypted as it is made, and only the encrypted file is kept, with Vercel\. Only we hold the key that opens it\.<\/td>/);
    assert.match(privacy, /<th scope="row">Vercel<\/th><td>[^<]*, encrypted backups of the accounts database, [^<]*<\/td>/);
    // How it works: the one check as the app makes it (20 November 2026), no old rules.
    const how = await readFile(join(out, 'how-it-works.html'), 'utf8');
    for (const words of ['one search of your chosen library’s own catalog, across all its fields', 'at least 80% of the words in the book’s title', 'can only be searched by ISBN',
      'found, not found, or couldn’t check', 'it never means the library lacks the book'])
      assert.ok(how.includes(words), words);
    assert.ok(!/edition matching|title and author check/i.test(how));
    assert.match(how, /<meta name="description" content="How MyBookshelf finds books and checks your library’s own catalog: one search for each book, answered found, not found or couldn’t check\.">/);
    assert.ok(!privacy.includes('Account recently viewed history is off until you turn it on'), 'the old website text is gone');
    assert.match(privacy, /<h2>MyBookshelf native apps \(iPhone and Android\)<\/h2>[\s\S]*<h3>Library card and PIN<\/h3>/);
    assert.match(privacy, /<a href="\/terms">Terms<\/a>/);
    const terms = await readFile(join(out, 'terms.html'), 'utf8');
    assert.match(terms, /You must be 18 or older, or have a parent&#39;s or guardian&#39;s permission\./);
    assert.ok(terms.includes('privacy@mybookshelf.cloud') && !/gmail/.test(terms));
    assert.ok((await readFile(join(out, 'about.html'), 'utf8')).includes('<a href="/terms">Terms</a>'), 'the footer links the published Terms');
    const report = JSON.parse(await readFile(join(out, 'seo-report.json'), 'utf8'));
    const shelf = shelfPages();
    assert.equal(report.indexablePages.length, 20 + shelf.libraries.filter(r => !r.guide).length + checkPages().libraries.filter(r => !r.guide).length + shelf.books.length + (shelf.books.length ? 1 : 0));
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
    assert.equal(report.indexablePages.length, 19 + 1 + checkPages().libraries.filter(r => !r.guide).length + shelf.books.length + 1);
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

// ---- California pages: popular books checked live on a tap (23 November 2026)

test('the US list: 30 to 40 distinctive books in six groups, each an Open Library work with a cover and an ISBN, dated', () => {
  assert.match(usList.updatedOn, /^\d{4}-\d{2}-\d{2}$/);
  const books = usList.books;
  assert.ok(books.length >= 30 && books.length <= 40, String(books.length));
  assert.deepEqual([...new Set(books.map(book => book.group))].sort(), ['children', 'classic', 'fiction', 'nonfiction', 'spanish', 'ya']);
  for (const book of books) {
    assert.match(book.bookKey, /^v1:openlibrary:OL\d+W$/, book.title);
    assert.match(book.coverId, /^\d+$/, book.title);
    assert.match(book.isbn, /^97[89]\d{10}$/, book.title);
    assert.ok(book.title.trim() && book.author.trim(), book.title);
    // Two or more words, and none of the titles the matcher would confuse.
    assert.ok(book.title.split(/\s+/).length >= 2, book.title);
    assert.ok(!/1984|Nineteen Eighty|Sorcerer|Philosopher|piedra filosofal/i.test(book.title), book.title);
  }
  assert.equal(new Set(books.map(book => book.bookKey)).size, books.length);
  // The pages' ten and the app's twenty come first, each a mix of the groups, one book per author.
  assert.ok(new Set(books.slice(0, CHECK_BOOKS).map(book => book.group)).size >= 5);
  assert.equal(new Set(books.slice(0, 20).map(book => book.author)).size, 20);
});

test('California: every public library system in the directory has a page; the others are left out with a reason', () => {
  const california = getAllLibraries().filter(entry => entry.country === 'US' && entry.region === usPages.state);
  const listed = usPages.libraries.map(item => item.id), out = usPages.leftOut.map(item => item.id);
  assert.deepEqual([...listed, ...out].sort(), california.map(entry => entry.id).sort(), 'each California entry is in exactly one list');
  assert.equal(new Set([...listed, ...out]).size, listed.length + out.length);
  for (const item of usPages.leftOut) assert.ok(item.reason.length > 20 && /^\d{4}-\d{2}-\d{2}$/.test(item.on), item.id);
  const check = checkPages();
  assert.equal(check.libraries.length, listed.length);
  assert.equal(check.date, usList.updatedOn);
  // The four reviewed guides keep their slugs; every other slug is the library's /select/ link name.
  const guides = check.libraries.filter(row => row.guide).map(row => row.path).sort();
  assert.deepEqual(guides, ['/libraries/alameda-county-library', '/libraries/san-francisco-public-library', '/libraries/san-mateo-county-libraries', '/libraries/santa-clara-county-library']);
  for (const row of check.libraries.filter(item => !item.guide)) {
    assert.equal(row.library.selectionPath.replace(/^\/select\//, '').replace(/--[0-9a-f]{16}$/, ''), row.slug, row.id);
    assert.ok(!row.library.address && !row.library.officialUrl, 'only facts the directory has');
  }
  // The ten books are the US list's first ten.
  assert.deepEqual(check.books.map(book => book.bookKey), usList.books.slice(0, CHECK_BOOKS).map(book => book.bookKey));
  // A slug clash, a page also left out, or a library outside the state stops the build.
  const publication = pages => checkPublication({ entries: getAllLibraries(), toPublic: toPublicLibrary, manifest, pages, pool: usList });
  assert.throws(() => publication({ ...usPages, libraries: [...usPages.libraries, { id: 'bc:marinet', slug: 'marinet' }] }), /left out/);
  assert.throws(() => publication({ ...usPages, libraries: [usPages.libraries[1], { ...usPages.libraries[2], slug: usPages.libraries[1].slug }] }), /collision/);
  assert.throws(() => publication({ ...usPages, libraries: [{ id: 'bc:nypl-stagedoor', slug: 'stagedoor' }] }), /Not a California library/);
  assert.throws(() => checkPublication({ entries: getAllLibraries(), toPublic: toPublicLibrary, manifest, pages: usPages, pool: { ...usList, updatedOn: undefined } }), /updatedOn/);
});

// One build into a temporary folder, shared by the tests below.
let built = null;
after(async () => { if (built) { const { rm } = await import('node:fs/promises'); await rm(built.out, { recursive: true, force: true }); } });
async function buildOnce() {
  if (built) return built;
  const { buildPages } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const out = await mkdtemp(join(tmpdir(), 'check-pages-'));
  await writeFile(join(out, 'index.html'), APP_SHELL);
  await buildPages(out, { analytics: false, siteVerification: null, policyEffectiveDate: null });
  built = { out, read: path => readFileSync(join(out, path.slice(1) + '.html'), 'utf8') };
  return built;
}
const californiaPaths = () => checkPages().libraries.map(row => row.path);

test('California pages: the directory’s facts, ten books to check, a button and an app link per book, and no found claim', async () => {
  const { read } = await buildOnce();
  const oakland = read('/libraries/oakland-public-library');
  assert.match(oakland, /<title>Oakland Public Library — catalog and book search \| MyBookshelf<\/title>|<title>Oakland Public Library — catalog and book search<\/title>/);
  assert.match(oakland, /<meta name="description" content="[^"]*Oakland Public Library catalog \(Oakland, California\)[^"]*popular books[^"]*">/);
  assert.match(oakland, /<p class="eyebrow">Oakland · California · United States<\/p>/);
  assert.ok(oakland.includes('<a class="button button-secondary" href="https://oaklandlibrary.bibliocommons.com/">Library’s own catalog ↗</a>'));
  assert.ok(oakland.includes('<h2 id="check-heading">Popular books: check this library’s catalog</h2>'));
  assert.ok(oakland.includes('They are books to check, not books known to be in Oakland Public Library.'));
  assert.ok(oakland.includes('Nothing is checked before you tap, and no answer is kept.'));
  assert.ok(oakland.includes('not operated by or affiliated with Oakland Public Library'));
  assert.ok(oakland.includes('couldn’t check, never that the book isn’t there'));
  assert.equal((oakland.match(/<li class="check-book" /g) || []).length, CHECK_BOOKS);
  assert.equal((oakland.match(/<button type="button" class="button button-secondary" data-check hidden>Check at Oakland Public Library<span class="sr-only">: /g) || []).length, CHECK_BOOKS);
  assert.ok(oakland.includes('<button type="button" class="button" data-check-all hidden>Check all 10</button>'));
  for (const book of usList.books.slice(0, CHECK_BOOKS)) {
    assert.ok(oakland.includes(`data-book-key="${book.bookKey}"`), book.title);
    assert.ok(oakland.includes(`<a href="/select/oakland-public-library?book=${encodeURIComponent(book.bookKey)}" rel="nofollow">Check in the app`), book.title);
    assert.ok(oakland.includes(`src="https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg"`), book.title);
  }
  assert.ok(oakland.includes('data-library-check data-library-id="bc:oaklandlibrary"'));
  assert.ok(!oakland.includes('Official library website'), 'no official site the directory lacks');
  // Structured data: Library and BreadcrumbList only, nothing that lists the books.
  const data = JSON.parse(oakland.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.deepEqual(data.map(item => item['@type']), ['WebPage', 'Library', 'BreadcrumbList']);
  assert.deepEqual(data[1].address, { '@type': 'PostalAddress', addressLocality: 'Oakland', addressRegion: 'California', addressCountry: 'US' });
  // A guide keeps its reviewed text and gains the same section.
  const sfpl = read('/libraries/san-francisco-public-library');
  const guide = manifest.find(item => item.id === 'bc:sfpl');
  assert.ok(sfpl.includes(`<p class="lede">${escape(guide.summary)}</p>`) && sfpl.includes(escape(guide.access)) && sfpl.includes('Official library website ↗'));
  assert.ok(sfpl.includes('Popular books: check this library’s catalog') && sfpl.includes('Check at San Francisco Public Library'));
  assert.ok(sfpl.includes(`<script src="${CHECK_SCRIPT_PATH}" defer></script>`));
  const sfplData = JSON.parse(sfpl.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.deepEqual(sfplData.map(item => item['@type']), ['WebPage', 'Library', 'BreadcrumbList']);
  // No found claim, count, due date or shelf location on any California page.
  for (const path of californiaPaths()) {
    const html = read(path);
    assert.ok(!/Found in the catalog|Books found in this|found in its catalog|In your library|Not in your library|checked \d{1,2} [A-Z][a-z]+ \d{4}|"ItemList"/.test(html), path);
    assert.ok(!/copies available|available now|due back|on the shelf|floor \d|shelf number|call number/i.test(html), path);
    assert.ok(html.includes(`<script src="${CHECK_SCRIPT_PATH}" defer></script>`), path);
    // No search text in any address: book keys and library slugs only.
    for (const m of html.matchAll(/href="([^"]+)"/g)) assert.ok(!/[?&](q|query|search|term)=/i.test(m[1]), m[1]);
  }
});

test('the check script is one external same-origin file: no inline script or style, and the CSP allows it', async () => {
  const { out, read } = await buildOnce();
  const script = readFileSync(join(out, CHECK_SCRIPT_PATH.slice(1)), 'utf8');
  assert.equal(script, libraryCheckScriptSource());
  // It calls only the app's own check endpoint, with no cookie, and keeps nothing.
  assert.ok(script.includes("'/api/v2/holdings/check'") && script.includes("credentials: 'omit'"));
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|https?:\/\/(?!mybookshelf\.cloud)[a-z]/i.test(script.replace(/new win\.URL\(value\)/, '')));
  assert.ok(!/innerHTML|insertAdjacentHTML|eval\(|new Function|\.style\b/.test(script), 'text and attributes only');
  const csp = JSON.parse(readFileSync('vercel.json', 'utf8')).services.web.routes[0].headers['Content-Security-Policy'];
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  for (const path of californiaPaths()) {
    const html = read(path);
    assert.ok(!/<script(?![^>]*(?:type="application\/ld\+json"|src="\/library-check\.js"))/.test(html), path);
    assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html), path);
  }
  // Pages without the section do not load it.
  assert.ok(!read('/libraries/anna-centenary-library').includes(CHECK_SCRIPT_PATH));
  assert.ok(!read('/about').includes(CHECK_SCRIPT_PATH));
});

// A fake `fetch` the test answers by hand, one request at a time.
function fakeFetch() {
  const calls = [];
  const fetch = (url, options) => new Promise((resolve, reject) => { calls.push({ url, options, body: JSON.parse(options.body), resolve, reject }); });
  const reply = (index, body, ok = true) => calls[index].resolve({ ok, json: async () => body });
  return { calls, fetch, reply };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

test('the check script sends nothing when the page loads; a tap is one check, and "Check all" checks one book after another', async () => {
  const { JSDOM } = await import('jsdom');
  const { read } = await buildOnce();
  const dom = new JSDOM(read('/libraries/oakland-public-library'), { url: origin + '/libraries/oakland-public-library', runScripts: 'outside-only' });
  const { window } = dom, doc = window.document;
  const api = fakeFetch();
  window.fetch = api.fetch;
  try {
    window.eval(libraryCheckScriptSource());
    await settle();
    // Loaded and run, as a crawler that runs scripts would: no request, buttons shown.
    assert.equal(api.calls.length, 0);
    const rows = [...doc.querySelectorAll('[data-book-key]')];
    const button = row => row.querySelector('[data-check]');
    const answer = row => row.querySelector('[data-check-answer]').textContent;
    assert.ok(rows.every(row => !button(row).hidden) && !doc.querySelector('[data-check-all]').hidden);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(api.calls.length, 0, 'still nothing without a tap');

    // A tap: one POST to the app's check, with the library and the book key only.
    button(rows[0]).click();
    await settle();
    assert.equal(api.calls.length, 1);
    const [first] = api.calls;
    assert.equal(first.url, '/api/v2/holdings/check');
    assert.deepEqual([first.options.method, first.options.credentials, first.options.headers['Content-Type']], ['POST', 'omit', 'application/json']);
    assert.deepEqual(first.body, { libraryId: 'bc:oaklandlibrary', bookKey: rows[0].getAttribute('data-book-key') });
    assert.match(answer(rows[0]), /Checking the library’s catalog/);
    assert.equal(button(rows[0]).disabled, true);
    // A second tap on the same book while it is checking asks nothing more.
    button(rows[0]).click();
    await settle();
    assert.equal(api.calls.length, 1);
    api.reply(0, { answer: 'found', catalogUrl: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1', catalogLinkKind: 'record',
      matches: [{ title: 'Remarkably bright creatures : a novel', author: 'Van Pelt, Shelby', url: 'https://oaklandlibrary.bibliocommons.com/v2/record/S1' }] });
    await settle();
    assert.match(answer(rows[0]), /^Found in the catalog/);
    assert.match(answer(rows[0]), /It may be another edition/);
    assert.match(answer(rows[0]), /Remarkably bright creatures : a novel · Van Pelt, Shelby/);
    const link = rows[0].querySelector('.check-catalog');
    assert.deepEqual([link.getAttribute('href'), link.textContent], ['https://oaklandlibrary.bibliocommons.com/v2/record/S1', 'See this book in the library’s catalog ↗']);
    assert.match(button(rows[0]).textContent, /^Check again: /);

    // Check all: one request at a time, in order, each only after the last answered.
    doc.querySelector('[data-check-all]').click();
    await settle();
    assert.equal(api.calls.length, 2);
    assert.equal(doc.querySelector('[data-check-all]').disabled, true);
    assert.ok(rows.slice(1).every(row => /Waiting to check/.test(answer(row))));
    // A tap during "Check all" waits its turn: no second request at once.
    button(rows[5]).click();
    await settle();
    assert.equal(api.calls.length, 2);
    const replies = [
      { answer: 'not_found', catalogUrl: 'https://oaklandlibrary.bibliocommons.com/v2/search?query=x', catalogLinkKind: 'search' },
      { answer: 'unknown', reason: 'timeout' },
      { answer: 'unconfirmed' },
      { answer: 'unknown', reason: 'blocked' },
      'network',
      { answer: 'found' },
      { answer: 'surprise' },
      { answer: 'unknown', reason: 'busy' },
      { answer: 'unknown', reason: 'details' },
      { answer: 'found' },
    ];
    for (let index = 0; index < replies.length; index += 1) {
      assert.equal(api.calls.length, index + 2, `request ${index + 2} only after ${index + 1} answered`);
      if (replies[index] === 'network') api.calls[index + 1].reject(new window.TypeError('offline'));
      else if (index === 7) api.reply(index + 1, {}, false);
      else api.reply(index + 1, replies[index]);
      await settle();
    }
    assert.equal(api.calls.length, 11);
    // The order is the page's, the first book again first.
    assert.deepEqual(api.calls.slice(1).map(call => call.body.bookKey), rows.map(row => row.getAttribute('data-book-key')));
    assert.match(answer(rows[0]), /^Not found in the catalog/);
    assert.match(answer(rows[0]), /did not find it\. The library may still have another edition\./);
    assert.match(answer(rows[0]), /Search the library’s catalog yourself ↗/);
    assert.match(answer(rows[1]), /^Couldn’t check right now.*did not answer in time\. This does not mean the book is missing\./);
    assert.match(answer(rows[2]), /^Couldn’t check right now.*could not tell whether it has this book/);
    assert.match(answer(rows[3]), /does not allow outside checks/);
    assert.equal(button(rows[3]).hidden, true, 'no Check again for a library that does not allow checks');
    assert.match(answer(rows[4]), /^Couldn’t check right now.*couldn’t check the library’s catalog this time/);
    assert.match(answer(rows[6]), /^Couldn’t check right now/, 'an answer the page does not know is couldn’t check');
    assert.match(answer(rows[7]), /^Couldn’t check right now/, 'a failed reply is couldn’t check, never not found');
    // The book's details could not be read: the library is not blamed, and the reader may try again.
    assert.match(answer(rows[8]), /^Couldn’t check right now.*couldn’t get this book’s details to search the library’s catalog\. Try again in a minute\. This does not mean the book is missing\./);
    assert.equal(button(rows[8]).hidden, false);
    assert.match(doc.querySelector('[data-check-progress]').textContent, /Checked 10 books\./);
    assert.equal(doc.querySelector('[data-check-all]').disabled, false);
    // Only library IDs and book keys ever leave the page.
    for (const call of api.calls) {
      assert.deepEqual(Object.keys(call.body).sort(), ['bookKey', 'libraryId']);
      assert.ok(!call.url.includes('?'));
    }
  } finally { window.close(); }
});

test('the check script needs a page section and fetch: elsewhere it does nothing', async () => {
  const { JSDOM } = await import('jsdom');
  const { read } = await buildOnce();
  const dom = new JSDOM(read('/libraries/anna-centenary-library'), { runScripts: 'outside-only' });
  let calls = 0;
  dom.window.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  assert.equal(installLibraryChecks(dom.window, dom.window.document), 0);
  assert.equal(calls, 0);
  const plain = new JSDOM(read('/libraries/oakland-public-library'));
  // No fetch (an old browser): the buttons stay hidden and the app links remain.
  delete plain.window.fetch;
  assert.equal(installLibraryChecks(plain.window, plain.window.document), 0);
  assert.ok([...plain.window.document.querySelectorAll('[data-check]')].every(item => item.hidden));
  assert.equal(plain.window.document.querySelectorAll('a[href^="/select/oakland-public-library?book="]').length, CHECK_BOOKS);
  dom.window.close(); plain.window.close();
});

test('the sitemap lists every California page with the US list’s date; the index groups them under California', async () => {
  const { out, read } = await buildOnce();
  const sitemap = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  for (const path of californiaPaths()) assert.ok(sitemap.includes(`<loc>${origin}${path}</loc><lastmod>${usList.updatedOn}</lastmod>`), path);
  const report = JSON.parse(readFileSync(join(out, 'seo-report.json'), 'utf8'));
  assert.deepEqual(report.checkLibraryPages, californiaPaths());
  for (const path of californiaPaths()) assert.ok(report.indexablePages.includes(path), path);
  const hub = read('/libraries');
  assert.ok(hub.includes(`<section id="us-california" class="state-index"><h2>United States: California <small>· ${californiaPaths().length} libraries</small></h2>`));
  for (const path of californiaPaths()) assert.ok(hub.includes(`href="${path}"`), path);
  assert.ok(hub.indexOf('id="india-by-state"') < hub.indexOf('id="us-california"'), 'next to the Indian groups');
  // The index's date is its newest content.
  assert.match(sitemap, new RegExp(`<loc>${origin}/libraries</loc><lastmod>${usList.updatedOn}</lastmod>`));
});

test('India pages are unchanged by the California pages: the same bytes with and without them', async () => {
  const { buildPages } = await import('./build-pages.mjs');
  const { mkdtemp, writeFile, rm, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { out } = await buildOnce();
  const without = await mkdtemp(join(tmpdir(), 'no-check-pages-'));
  try {
    await writeFile(join(without, 'index.html'), APP_SHELL);
    await buildPages(without, { analytics: false, siteVerification: null, policyEffectiveDate: null }, shelfPages(), { libraries: [], books: [], state: null, date: null });
    const files = async dir => (await readdir(dir, { recursive: true })).filter(name => name.endsWith('.html')).sort();
    const before = await files(without);
    const changed = new Set(['libraries.html', ...californiaPaths().map(path => path.slice(1) + '.html')]);
    let compared = 0;
    for (const name of before) {
      if (changed.has(name)) continue;
      assert.equal(readFileSync(join(out, name), 'utf8'), readFileSync(join(without, name), 'utf8'), name);
      compared += 1;
    }
    // Every Indian library page and book page is among them.
    const indian = shelfPages().libraries.map(row => row.path.slice(1) + '.html');
    assert.ok(indian.length > 100 && indian.every(name => before.includes(name)));
    assert.ok(compared > indian.length);
    assert.ok(!existsSync(join(without, CHECK_SCRIPT_PATH.slice(1))), 'no script without the pages');
  } finally { await rm(without, { recursive: true, force: true }); }
});

test('checkData reads the committed files', () => {
  const { pages, pool } = checkData();
  assert.equal(pages.state, 'California');
  assert.equal(pool.updatedOn, usList.updatedOn);
});

test('the check script uses the app’s words for each answer (client LibraryAnswerCard)', () => {
  const card = readFileSync('client/src/v2/ui/book/LibraryAnswerCard.tsx', 'utf8');
  const script = libraryCheckScriptSource();
  const block = (start, end) => card.slice(card.indexOf(start), card.indexOf(end, card.indexOf(start)));
  const phrases = [...block('export function unknownDescription', '\n}\n').matchAll(/'([^'\n]{12,})'/g), ...block('const descriptions', '};').matchAll(/'([^'\n]{12,})'/g),
    ...block('export function catalogLinkText', '\n}\n').matchAll(/'([^'\n]{8,})'/g)].map(match => match[1])
    .filter(text => !/^Open the library’s catalog instead$/.test(text));
  assert.ok(phrases.length >= 10);
  for (const text of phrases) assert.ok(script.includes(text), text);
  assert.ok(script.includes(card.match(/const NOT_MISSING = '([^']+)'/)[1]));
});
