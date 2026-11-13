import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publishedLibraries, escape, jsonLd, origin, countWord } from './build-pages.mjs';
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
test('built output contains only published library pages and indexable canonical sitemap URLs', () => {
  const report=JSON.parse(readFileSync('client/dist/seo-report.json'));
  assert.equal(report.libraryPages.length,12);
  // Nineteen URLs, plus /terms once the policy texts are published (VITE_POLICY_EFFECTIVE_DATE).
  assert.equal(report.indexablePages.length,existsSync('client/dist/terms.html')?20:19);
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
  if (existsSync('client/dist/index.html')) {
    const home=readFileSync('client/dist/index.html','utf8'), hub=readFileSync('client/dist/libraries.html','utf8');
    assert.ok(home.includes(countWord(pages.length,true)+' reviewed guides') && !home.includes('Nine reviewed'));
    assert.ok(hub.includes(countWord(pages.length,true)+' featured guides'));
  }
});
test('analytics and Search Console are off by default and, when set, add only the same-origin script and the home-page tag', async () => {
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
    await writeFile(join(out, 'index.html'), '<!doctype html><title>app</title>');
    const token = 'abcDEF0123456789_-xyzABC';
    await buildPages(out, { analytics: true, siteVerification: token });
    const script = await readFile(join(out, 'insights.js'), 'utf8');
    assert.match(script, /\/_vercel\/insights\/script\.js/);
    assert.ok(!/document\.cookie|localStorage|https?:\/\/(?!mybookshelf\.cloud)/.test(script), 'no cookie, storage or other host');
    const pages = (await readdir(out)).filter(name => name.endsWith('.html'));
    for (const name of pages) {
      const html = await readFile(join(out, name), 'utf8');
      if (name === 'index.html') assert.ok(html.includes(`<meta name="google-site-verification" content="${token}">`));
      else assert.ok(!html.includes('google-site-verification'), name);
      assert.ok(html.includes('<script src="/insights.js" defer></script>'), name);
      assert.ok(!html.includes('<script>window'), 'no inline script (CSP script-src self)');
    }
    assert.ok((await readFile(join(out, 'libraries', 'anna-centenary-library.html'), 'utf8')).includes('/insights.js'));
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
    await writeFile(join(out, 'index.html'), '<!doctype html><title>app</title>');
    await buildPages(out, { analytics: false, siteVerification: null, policyEffectiveDate: '1 December 2026' });
    const privacy = await readFile(join(out, 'privacy.html'), 'utf8');
    assert.match(privacy, /Effective 1 December 2026\. MyBookshelf is run by Deepak Ravikumar, India\./);
    assert.match(privacy, /Anonymous search and library-check log/);
    assert.ok(!privacy.includes('[EFFECTIVE DATE]') && !privacy.includes('Draft for owner'));
    assert.ok(!privacy.includes('Account recently viewed history is off until you turn it on'), 'the old website text is gone');
    assert.match(privacy, /<h2>MyBookshelf native apps \(iPhone and Android\)<\/h2>[\s\S]*<h3>Library card and PIN<\/h3>/);
    assert.match(privacy, /<a href="\/terms">Terms<\/a>/);
    const terms = await readFile(join(out, 'terms.html'), 'utf8');
    assert.match(terms, /You must be 18 or older, or have a parent&#39;s or guardian&#39;s permission\./);
    const report = JSON.parse(await readFile(join(out, 'seo-report.json'), 'utf8'));
    assert.equal(report.indexablePages.length, 20);
    assert.ok(report.indexablePages.includes('/terms'));
  } finally { await rm(out, { recursive: true, force: true }); }
});
