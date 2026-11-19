import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import manifest from '../../shared/seo-libraries.json' with { type: 'json' };
import { getAllLibraries } from '../../server/services/directory.js';
import { toPublicLibrary } from '../../server/public-v2/directory.js';
import { analyticsScriptSource, analyticsSettingOn, siteVerificationToken } from '../../shared/analytics.mjs';
import { blockHtml, inline, policyBlocks, policyEffectiveDate, policyHtml } from './policy-html.mjs';

export const origin = 'https://mybookshelf.cloud';
// The public contact on every page (owner decision, plan section 7).
export const contactEmail = 'privacy@mybookshelf.cloud';
// The reading shelf is the site's root address (plan C1): the root page is
// the app itself, made indexable. Its title is also the app's own title on
// that page (client/src/v2/ui/AppFrame.tsx).
export const rootTitle = 'MyBookshelf — Find out if your library has a book';
export const rootDescription = 'Keep a reading shelf of the books you want to read and see whether your library has each one. Search by title, author or ISBN, or scan a barcode.';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const jsonLd = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export const guideCount = count => `${count} ${count === 1 ? 'guide' : 'guides'}`;
const NUMBER_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
export const countWord = (count, capital = false) => {
  const word = NUMBER_WORDS[count] ?? String(count);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
export function publishedLibraries(entries = getAllLibraries(), publication = manifest) {
  const ids = new Set(), slugs = new Set();
  return publication.map(item => {
    if (ids.has(item.id) || slugs.has(item.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) throw Error('Invalid publication manifest');
    ids.add(item.id); slugs.add(item.slug);
    const row = entries.find(entry => entry.id === item.id);
    if (!row || !item.summary || !item.access || new URL(item.officialUrl).protocol !== 'https:') throw Error('Missing reviewed library content: '+item.id);
    return {...item, library: toPublicLibrary(row), path: '/libraries/'+item.slug};
  });
}
/**
 * The root page (plan C1): the app shell Vite built, made indexable. Its
 * title, description, robots, canonical link and Open Graph tags are replaced,
 * WebSite structured data and the Search Console tag (when set) are added,
 * and readers without scripts get a link to /about. /app/index.html stays the
 * noindex copy of the same shell for every other in-app address.
 */
export function rootShell(html, { siteVerification = null } = {}) {
  const head = `<title>${escape(rootTitle)}</title><meta name="description" content="${escape(rootDescription)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${origin}/"><meta property="og:type" content="website"><meta property="og:title" content="${escape(rootTitle)}"><meta property="og:description" content="${escape(rootDescription)}"><meta property="og:url" content="${origin}/"><script type="application/ld+json">${jsonLd([{'@context':'https://schema.org','@type':'WebSite',name:'MyBookshelf',url:origin+'/',description:rootDescription}])}</script>`
    + (siteVerification ? `<meta name="google-site-verification" content="${escape(siteVerification)}">` : '');
  const noscript = '<noscript><p>The reading shelf needs JavaScript. You can still read <a href="/about">about MyBookshelf</a>, explore <a href="/libraries">featured libraries</a> or get <a href="/support">help</a>.</p></noscript>';
  if (!/<title>[\s\S]*?<\/title>/i.test(html) || !/<body[^>]*>/i.test(html)) throw Error('The app shell has no title or body');
  return html
    .replace(/\s*<meta\s+(?:name|property)="(?:description|robots|og:type|og:title|og:description|og:url|google-site-verification)"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, () => head)
    .replace(/\s*<noscript>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<body[^>]*>/i, body => body + noscript);
}
/** The About text (docs/policy/about.md): its first paragraph and its "## " sections. */
export function aboutText(markdown) {
  const blocks = policyBlocks(markdown);
  const at = heading => {
    const start = blocks.findIndex(block => block.type === 'h2' && block.text === heading);
    if (start < 0) throw Error('About: missing section ' + heading);
    const end = blocks.findIndex((block, index) => index > start && block.type === 'h2');
    return blocks.slice(start + 1, end < 0 ? undefined : end).filter(block => !(block.type === 'p' && /^Contact:/.test(block.text)));
  };
  const lede = blocks.find(block => block.type === 'p')?.text;
  if (!lede) throw Error('About: missing introduction');
  return { lede, section: at, list: heading => {
    const list = at(heading).find(block => block.type === 'ul');
    if (!list) throw Error('About: no list under ' + heading);
    return list.items;
  } };
}
// Build settings, both off by default (plan 4.6.1, Phase 11):
//   VITE_ANALYTICS_ENABLED=true   cookieless page visits on every public page (/insights.js)
//   GOOGLE_SITE_VERIFICATION=<token>  Search Console's meta tag on the root page only
//   VITE_POLICY_EFFECTIVE_DATE=<date>  the release switch for the policy texts
//     (docs/RELEASE-one-shelf.md): /privacy becomes the approved text
//     (docs/policy/privacy.md, with the native-app section kept) and /terms is
//     published. The app's Privacy and Terms pages show the same date.
export function pageSettings(env = process.env) {
  return { analytics: analyticsSettingOn(env.VITE_ANALYTICS_ENABLED), siteVerification: siteVerificationToken(env.GOOGLE_SITE_VERIFICATION),
    policyEffectiveDate: policyEffectiveDate(env.VITE_POLICY_EFFECTIVE_DATE) };
}
export async function buildPages(output = resolve(root, 'client/dist'), settings = pageSettings()) {
  const rows = publishedLibraries();
  if (settings.analytics) await writeFile(resolve(output,'insights.js'), analyticsScriptSource());
  // The static pages load the visit counter; the app (at / and under /app/)
  // starts its own from its bundle when the build turns it on.
  const extraHead = settings.analytics ? '<script src="/insights.js" defer></script>' : '';
  await mkdir(resolve(output,'app'), {recursive:true});
  await copyFile(resolve(output,'index.html'), resolve(output,'app/index.html'));
  await writeFile(resolve(output,'index.html'), rootShell(await readFile(resolve(output,'index.html'),'utf8'), settings));
  let revision = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!/^[a-f0-9]{40,64}$/i.test(revision || '')) {
    try { revision = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { revision = 'main'; }
  }
  const source = 'https://github.com/ddk220-light/MyBookshelf-web/tree/'+revision;
  const link = (url,label) => `<a href="${escape(url)}">${escape(label)}</a>`;
  const brandIcon = '<svg width="26" height="26" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 3.5h3v15h-3zM7.5 3.5h3v15h-3zM12 4.6l2.9-.8 3.9 14.5-2.9.8z"/></svg>';
  const nav = `<a class="skip" href="#content">Skip to content</a><header class="site-header"><a class="brand" href="/" aria-label="MyBookshelf, my reading shelf">${brandIcon}MyBookshelf</a><nav aria-label="Main navigation">${link('/about','About')}${link('/how-it-works','How it works')}${link('/libraries','Libraries')}${link('/support','Help')}${link('/privacy','Privacy')}</nav><a class="button" href="/">Open my reading shelf</a></header>`;
  const foot = `<footer><div class="footer-top"><div class="footer-about"><p class="brand">MyBookshelf</p><p>An independent, open-source project. Not affiliated with any library. Free, no account required, no ads.</p></div><nav aria-label="Footer">${[['/about','About'],['/how-it-works','How it works'],['/libraries','Libraries'],['/support','Help'],['/privacy','Privacy'],...(settings.policyEffectiveDate?[['/terms','Terms']]:[]),['/open-source','Open source'],[source,'Source code']].map(([a,b])=>link(a,b)).join('')}</nav></div><small>© 2026 Deepak Ravikumar · Code: AGPL-3.0 · Original directory data: CC BY 4.0. Third-party material retains its own terms. Place data: ${link('https://www.geonames.org/','GeoNames')} (CC BY 4.0).</small></footer>`;
  const paths=[];
  async function page(path,title,description,body,{index=true,schema=[],className,file}={}) {
    description = description.length > 160 ? description.slice(0,157).replace(/\s+\S*$/, '') + '…' : description;
    const structured=[{'@context':'https://schema.org','@type':'WebPage',name:title,url:origin+path},...schema];
    const json = jsonLd(structured);
    const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | MyBookshelf</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${index?'index, follow':'noindex, follow'}"><link rel="canonical" href="${origin+path}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${origin+path}"><meta property="og:image" content="${origin}/og/site.png"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#faf7f1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/site.css"><script type="application/ld+json">${json}</script>${extraHead}</head><body class="${className?className:path.startsWith('/libraries/')?'library-page':path==='/libraries'?'directory-page':path==='/404'?'not-found-page':'article-page'}">${nav}<main id="content">${body}</main>${foot}</body></html>`;
    const dest=resolve(output,file || path.slice(1)+'.html');
    await mkdir(dirname(dest),{recursive:true}); await writeFile(dest,html);
    if(index) paths.push(path);
  }
  const cards = items => `<ul class="library-grid">${items.map(r=>`<li><p class="eyebrow">${escape([r.library.city,r.library.region].filter(Boolean).join(' · '))}</p><h3>${link(r.path,r.library.name)}</h3><p>${escape(r.summary)}</p>${link(r.path,'Explore this library →')}</li>`).join('')}</ul>`;
  // The root page is the reading shelf itself (rootShell above); the old
  // landing page's content is the About page below.
  paths.push('/');
  const countries={IN:'India',US:'United States',JP:'Japan'};
  await page('/libraries','Explore featured libraries',`Explore ${countWord(rows.length)} featured library guides in India, the United States and Japan. The app offers a larger directory for finding and choosing your library.`,`<p class="eyebrow">Your library, a little closer</p><h1>Explore the libraries</h1><p class="lede">${countWord(rows.length,true)} featured guides to get started. Find more libraries through search and Near me in the app.</p><a class="button" href="/">Choose your library in the app →</a>${Object.entries(countries).map(([code,name])=>`<section id="${code.toLowerCase()}"><h2>${name} <small>· ${rows.filter(r=>r.library.country===code).length} featured</small></h2>${cards(rows.filter(r=>r.library.country===code))}</section>`).join('')}`,{schema:[{'@context':'https://schema.org','@type':'ItemList',itemListElement:rows.map((r,i)=>({'@type':'ListItem',position:i+1,name:r.library.name,url:origin+r.path}))}]});
  for(const row of rows) {
    const l=row.library,c=l.capabilities;
    const choose=l.selectionPath;
    await page(row.path,l.name+' — books and catalog',row.summary,`<nav class="breadcrumbs" aria-label="Breadcrumb">${link('/','Home')} / ${link('/libraries','Libraries')} / ${escape(l.name)}</nav><div class="library-heading"><p class="eyebrow">${escape([l.city,l.region,countries[l.country]].filter(Boolean).join(' · '))}</p><h1>${escape(l.name)}</h1><p class="lede">${escape(row.summary)}</p><div class="actions"><a class="button" href="${escape(choose)}">Find a book to check here →</a><a class="button button-secondary" href="${escape(l.catalogUrl)}">Library’s own catalog ↗</a>${l.catalogUrl?.startsWith('http:')?'<small>Catalog link uses HTTP, which is not encrypted.</small>':''}</div></div><div class="detail-grid"><section><h2>What MyBookshelf can check here</h2><p>${c.publicAvailability?'Check whether this library has a book.':'Open the library’s own catalog to look for a book.'}</p><p>If the catalog doesn’t answer, MyBookshelf says it couldn’t check, never that the book isn’t there.</p></section><section><h2>Before you visit</h2><p>${escape(row.access)}</p>${l.address&&l.addressSourceUrl?`<h3>${l.addressScope==='campus'?'Campus address':'Published address'}</h3><p>${escape(l.address)}</p>${link(l.addressSourceUrl,'Address source ↗')}`:''}<p>${link(row.officialUrl,'Official library website ↗')}</p>${rows.some(other=>other.library.country===l.country && other.id!==l.id)?`<div class="related-guides"><h3>More guides in ${countries[l.country]}</h3>${rows.filter(other=>other.library.country===l.country && other.id!==l.id).map(other=>link(other.path,other.library.name)).join('')}</div>`:''}</section></div>${l.branches?.length && !(l.branches.length === 1 && l.branches[0].name === l.name)?`<section><h2>${l.branchClassification==='complete'?l.branchCount+' classified library branches':'Catalog locations'}</h2><p>Location names from the directory; these are not live book holdings.</p><ul class="columns">${l.branches.map(b=>`<li>${escape(b.name)}${b.kind==='locker'?' · Pickup locker':b.kind==='mobile'?' · Mobile service':''}</li>`).join('')}</ul></section>`:''}<section class="trust"><h2>Find, check, save</h2><p>Choose this library in the app, find a book${c.isbnLookup?' or scan its ISBN':''}, and open the book for a fresh catalog check. Save it to your reading shelf for later. Borrowing happens through the library.</p><p>MyBookshelf is independent and is not operated by or affiliated with ${escape(l.name)}.</p>${l.attribution?`<p>Availability attribution: ${link(l.attribution.url,l.attribution.label)}</p>`:''}${link('mailto:'+contactEmail+'?subject='+encodeURIComponent('Library correction: '+l.name),'Report a problem with these details')}</section>`,{schema:[{'@context':'https://schema.org','@type':'Library',name:l.name,url:row.officialUrl,subjectOf:origin+row.path,...(l.address&&l.addressScope==='library'&&l.addressSourceUrl?{address:{'@type':'PostalAddress',streetAddress:l.address,addressCountry:l.country}}:{})},{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{ '@type':'ListItem',position:1,name:'Libraries',item:origin+'/libraries'},{'@type':'ListItem',position:2,name:l.name,item:origin+row.path}]}]});
  }
  // About (plan C1b, C2): the old landing page's content and the one About
  // text the app shows too (docs/policy/about.md), laid out as the About board.
  const about=aboutText(await readFile(resolve(root,'docs/policy/about.md'),'utf8'));
  const step=item=>{ const [,head,rest]=/^\*\*([^*]+?)\.?\*\*\s*(.+)$/.exec(item) || []; if(!head) throw Error('About: a step needs a bold name'); return `<li><h3>${escape(head)}</h3><p>${inline(rest)}</p></li>`; };
  const corrections=about.section('Corrections and questions').map(blockHtml).join('')
    .replace('Write to us',()=>link('mailto:'+contactEmail,'Write to us')).replace('open an issue',()=>link('https://github.com/ddk220-light/MyBookshelf-web/issues/new','open an issue'));
  await page('/about','About MyBookshelf',about.lede,`<section class="hero"><div><h1>Find out if your library has a book, before you go.</h1><p class="lede">${inline(about.lede)}</p><div class="actions"><a class="button button-large" href="/">Open my reading shelf</a>${link('/libraries','Browse featured libraries')}</div></div><figure class="bookshelf-preview" aria-label="An example reading shelf"><div class="hero-shelf" aria-hidden="true"><div class="book one"><small>Paulo Coelho</small><span>The<br>Alchemist</span><i></i></div><div class="book two"><small>A. P. J. Abdul Kalam</small><span>Wings<br>of Fire</span><i></i></div><div class="book three"><small>R. K. Narayan</small><span>Malgudi<br>Days</span><i></i></div><span class="plank"></span></div><figcaption class="preview-caption"><span class="preview-check" aria-hidden="true">✓</span><div><strong>In your library</strong><p>Wings of Fire · Anna Centenary Library, Chennai</p></div></figcaption></figure></section><section class="home-steps" id="how"><h2>How it works</h2><ol class="steps">${about.list('How it works').map(step).join('')}</ol></section><section class="home-details"><div class="public-card"><h2>Built to be trusted</h2><ul class="feature-list">${about.list('Built to be trusted').map(item=>`<li>${inline(item)}</li>`).join('')}</ul></div><div class="public-card"><h2>Explore featured libraries</h2><ul class="country-guides">${[['IN','India'],['US','United States'],['JP','Japan']].map(([code,name])=>`<li><a href="/libraries#${code.toLowerCase()}"><span>${name}</span><span>${guideCount(rows.filter(r=>r.library.country===code).length)}</span></a></li>`).join('')}</ul><p class="note">${countWord(rows.length,true)} reviewed guides to start. Find more libraries by searching for your city or library in the app.</p>${link('/libraries','Explore all featured libraries →')}</div></section><section class="about-uses"><h2>What you can do</h2><ul class="feature-list">${about.list('What you can do').map(item=>`<li>${inline(item)}</li>`).join('')}</ul></section><section><h2>Who makes it</h2><div class="maker-card"><span class="maker-monogram" aria-hidden="true">DR</span><div><strong>Deepak Ravikumar</strong><p>Product manager and creator of MyBookshelf.</p><p>${link('https://www.linkedin.com/in/deepakdhanavel/','LinkedIn')} · ${link('mailto:'+contactEmail,contactEmail)}</p></div></div></section><section><h2>Corrections and questions</h2>${corrections}</section>`,{className:'about-page',schema:[{'@context':'https://schema.org','@type':'AboutPage',url:origin+'/about',about:{'@type':'Person',name:'Deepak Ravikumar',jobTitle:'Product manager',sameAs:'https://www.linkedin.com/in/deepakdhanavel/'}}]});
  await page('/how-it-works','How MyBookshelf works','Learn how book search, ISBN scanning, library catalog checks and your reading shelf work, including edition matching, privacy and incomplete results.',`<h1>Find. Check. Keep.</h1><p class="lede">A book search and a library check answer different questions.</p><section><h2>Find a book</h2><p>Search by title, author or ISBN. Barcode scanning happens on your device. Book details can come from Google Books, Open Library, or the selected library catalog.</p><h2>Check the catalog</h2><p>MyBookshelf asks the library’s own catalog whether it has the book: found, not found, or couldn’t check. A failed or slow check means we could not check, not that the library lacks the book.</p><h2>Save it for later</h2><p>Without an account, your reading shelf stays in this browser. An optional account keeps your reading shelf, your library and your Viewed before list on any device you sign in on. A library’s answer can be up to six months old.</p></section><section><h2>Different libraries share different details</h2><ul class="feature-list"><li>Direct catalog checks: whether the library has the book.</li><li>Title and author checks: some catalogs are checked by title and author when a book has no ISBN.</li><li>Aggregated checks: Calil checks Japanese library catalogs.</li><li>Website links: use the official catalog when an in-app check is not supported.</li></ul></section><section class="trust"><h2>Privacy in plain words</h2><p>No account is needed and there is no advertising. Without an account, your reading shelf stays in this browser. With an optional account, your saved books, chosen library and Viewed before list are kept in it. Location is used once for Near me and not stored. Hosting and other providers process network requests and may keep operational logs.</p>${link('/privacy','Read the privacy policy →')}</section>`);
  await page('/open-source','Source code and licences','MyBookshelf’s web application is licensed under AGPL-3.0. Find the source, contribution instructions, data attribution and ways to report library corrections.',`<h1>Made to be read, inside and out.</h1><p class="lede">MyBookshelf’s web application is free software under AGPL-3.0.</p><p><a class="button" href="${source}">View the source on GitHub ↗</a></p><section><h2>Code and data</h2><p>AGPL-3.0 permits commercial use and requires corresponding source to be offered for covered modifications, including network use. The licence text in the repository controls.</p><p>Original directory contributions use CC BY 4.0. Dependencies, fonts, library information and other third-party material retain their own terms. See the repository’s NOTICE for credits and data sources.</p><h2>Contribute</h2><p>Follow the README to run the web app and public API. Report a bug or correct library details with an official source. Please keep library card numbers, PINs and other private information out of public issues.</p></section>`);
  for(const name of settings.policyEffectiveDate ? ['support'] : ['privacy','support']) {
    const original=await readFile(resolve(root,'client/public-app/'+name+'.html'),'utf8');
    const content=original.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1];
    if(!content) throw Error('Missing legal page body');
    await page('/'+name,name==='privacy'?'Privacy policy':'Help and support',name==='privacy'?'How MyBookshelf handles your reading shelf, library requests, camera and location, with separate information for the archived native apps.':'Help with your reading shelf on a phone or a computer: finding and scanning books, choosing a library, the answers, and your account.',`<article class="prose">${content.replace(/<nav[\s\S]*?<\/nav>/,'')}</article>`,{file:name+'.html'});
  }
  if (settings.policyEffectiveDate) {
    // The approved texts replace the website sections; the archived native
    // apps keep their own section, unchanged, below (plan 9, row 14).
    const date = settings.policyEffectiveDate;
    const privacy = policyHtml(await readFile(resolve(root,'docs/policy/privacy.md'),'utf8'), { effectiveDate: date });
    const terms = policyHtml(await readFile(resolve(root,'docs/policy/terms.md'),'utf8'), { effectiveDate: date });
    const old = await readFile(resolve(root,'client/public-app/privacy.html'),'utf8');
    const native = old.match(/<\/section>([\s\S]*?)<footer>/i)?.[1];
    if (!native || !/Library card and PIN/.test(native)) throw Error('Missing native app privacy section');
    await page('/privacy','Privacy policy','How MyBookshelf handles accounts, your reading shelf, the anonymous search log, visit counts, location and camera.',
      `<article class="prose"><h1>${escape(privacy.title)}</h1>${privacy.html}<p>${link('/terms','Terms')}</p><section id="native-apps"><h2>MyBookshelf native apps (iPhone and Android)</h2>${native.replace(/<h2>/g,'<h3>').replace(/<\/h2>/g,'</h3>')}</section></article>`,{file:'privacy.html'});
    await page('/terms','Terms','The terms for using MyBookshelf: who may use it, what it is and is not, and fair use.',
      `<article class="prose"><h1>${escape(terms.title)}</h1>${terms.html}<p>${link('/privacy','Privacy')}</p></article>`,{file:'terms.html'});
  }
  await page('/404','Page not found','Find a book, explore featured libraries, or open your reading shelf.',`<p class="eyebrow">Nothing on this page</p><h1>We couldn’t find that page.</h1><p class="lede">Try a library guide or head back to your reading shelf.</p><div class="actions"><a class="button" href="/libraries">Explore libraries</a>${link('/','Open my reading shelf →')}</div>`,{index:false,file:'404.html'});
  await writeFile(resolve(output,'robots.txt'),`User-agent: *\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(resolve(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${origin+escape(p)}</loc></url>`).join('')}</urlset>`);
  await writeFile(resolve(output,'seo-report.json'),JSON.stringify({libraryPages:rows.map(r=>r.path),indexablePages:paths,source},null,2));
  console.log(`Built ${rows.length} library pages and ${paths.length} sitemap URLs.`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildPages(process.argv[2]);
