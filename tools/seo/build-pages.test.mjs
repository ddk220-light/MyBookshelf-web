import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publishedLibraries, escape, jsonLd, origin, countWord } from './build-pages.mjs';
import manifest from '../../shared/seo-libraries.json' with { type: 'json' };
import { getAllLibraries } from '../../server/services/directory.js';
import { toPublicLibrary } from '../../server/public-v2/directory.js';

test('publication is exactly six India, four US, one Japan; remaining directory stays usable', () => {
  const pages=publishedLibraries(), counts={};
  for(const p of pages) counts[p.library.country]=(counts[p.library.country] || 0)+1;
  assert.deepEqual(counts,{IN:6,US:4,JP:1});
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
  assert.equal(report.libraryPages.length,11);
  assert.equal(report.indexablePages.length,18);
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
  for (const id of ['koha:kalaignar-centenary-library','koha:ernakulam-public-library']) {
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
