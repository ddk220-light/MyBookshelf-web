import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tidyAddress, looksLikeStreet, publicPlace, createPlaceIndex, placeCase, pinsIn } from './public-place.mjs';
import { displayTitle, shelfTitle, shelfDescription, bookTitle, bookDescription, libraryStructuredData, placeOf, publicLibrary, TITLE_MAX, DESCRIPTION_MAX } from './shelf-pages.mjs';
import { fullTitle, fitDescription } from './build-pages.mjs';
import { authorSurname, bookSlug, correctBookSlugs, slugify } from './shelves-core.mjs';
import { canonicalRegion } from '../../server/public-v2/geography.js';
import { getLibraryById } from '../../server/services/directory.js';
import { toPublicLibrary } from '../../server/public-v2/directory.js';

test('state and Union Territory names have one spelling on every page', () => {
  assert.equal(canonicalRegion('Jammu & Kashmir'), 'Jammu and Kashmir');
  assert.equal(canonicalRegion('Jammu and Kashmir'), 'Jammu and Kashmir');
  assert.equal(canonicalRegion('Andaman & Nicobar Islands'), 'Andaman and Nicobar Islands');
  assert.equal(canonicalRegion('Pondicherry'), 'Puducherry');
  assert.equal(canonicalRegion('Daman & Diu'), 'Dadra and Nagar Haveli and Daman and Diu');
  assert.equal(canonicalRegion('Orissa'), 'Odisha');
  assert.equal(canonicalRegion(null), null);
  // The directory's own library with the "&" spelling (libman:276) is in Jammu and Kashmir.
  assert.equal(toPublicLibrary(getLibraryById('libman:276')).region, 'Jammu and Kashmir');
});

test('run-together address parts are separated and repeated parts dropped', () => {
  assert.equal(tidyAddress('Kerwa Dam Road, BhopalBarkeri KalanBhopal'), 'Kerwa Dam Road, Bhopal, Barkeri Kalan');
  assert.equal(tidyAddress('B.P.S. Mahila Vishwavidyalaya, Khanpur Kalan, Sonipat SonipatSonipat, Haryana'), 'B.P.S. Mahila Vishwavidyalaya, Khanpur Kalan, Sonipat Sonipat, Sonipat, Haryana');
  assert.equal(tidyAddress('Commerce Six Roads, Navrangpura, Ahmedabad, GujaratAhmedabad'), 'Commerce Six Roads, Navrangpura, Ahmedabad, Gujarat');
  assert.equal(tidyAddress('KOBA, GANDHINAGAR, GUJARATKoba (Sub P.O)Gandhinagar,'), 'KOBA, GANDHINAGAR, GUJARAT, Koba (Sub P.O)');
  assert.equal(tidyAddress('Kakatiya University,Warangal, Vidyaranyapuri,PIN - 506 009.'), 'Kakatiya University, Warangal, Vidyaranyapuri, PIN - 506 009.');
  // Names with an inner capital, and numbers with a comma, are left alone.
  assert.equal(tidyAddress('McLeod Ganj, DeNobili School, Plot 5,6'), 'McLeod Ganj, DeNobili School, Plot 5,6');
  assert.equal(tidyAddress('Himachal Pradesh-171014Sub-Tehsil Dhami,Shimla'), 'Himachal Pradesh-171014, Sub-Tehsil Dhami, Shimla');
  // Repeated words inside a part are the place's own ("Dum Dum Road").
  assert.equal(tidyAddress('4 DUM DUM ROAD KOLKATA'), '4 DUM DUM ROAD KOLKATA');
  assert.equal(tidyAddress(''), '');
  assert.equal(tidyAddress('.'), '');
  assert.deepEqual(pinsIn('PIN - 506 009, and 700019'), ['506009', '700019']);
});

test('a street, road, colony, building or number is never a town', () => {
  for (const value of ['Road', 'Sarat Bose Road', 'Birla Colony Bhiwani', 'Sector 16A', 'Vidhana Soudha Complex', 'Waltair Junction', 'MG Marg'])
    assert.ok(looksLikeStreet(value), value);
  for (const value of ['Bhopal', 'Navi Mumbai', 'New Town', 'Annamalainagar', 'Ambedkar Nagar', 'Kupwara'])
    assert.ok(!looksLikeStreet(value), value);
  assert.equal(placeCase('Seraikela-kharsawan'), 'Seraikela-Kharsawan');
});

// A tiny place index: two states, their districts, a few PINs and places.
const index = createPlaceIndex({
  columns: ['id', 'name', 'names', 'lat', 'lon', 'region', 'regionId', 'district', 'districtId', 'population', 'areaType'],
  places: [
    ['geonames:1', 'Kopawor', ['Kopawor', 'Kupwara'], 0, 0, 'Jammu and Kashmir', '', 'Kupwara', '', 0, ''],
    ['geonames:2', 'Rasapudipalem', ['Rasapudipalem', 'Waltair'], 0, 0, 'Andhra Pradesh', '', 'Visakhapatnam', '', 0, ''],
    ['geonames:3', 'Bhopal', ['Bhopal'], 0, 0, 'Madhya Pradesh', '', 'Bhopal', '', 0, ''],
    ['geonames:4', 'Damoh', ['Damoh'], 0, 0, 'Madhya Pradesh', '', 'Damoh', '', 0, ''],
    ['geonames:5', 'Kanniyakumari', ['Kanniyakumari', 'Kanyakumari'], 0, 0, 'Tamil Nadu', '', 'Kanniyakumari', '', 0, ''],
  ],
  postcodes: [['127021', 'Haryana', 'Bhiwani', 0, 0, ['Birla Colony']], ['482009', 'Madhya Pradesh', 'Jabalpur', 0, 0, ['Shobhapur']]],
  libraries: {
    'x:kupwara': { basis: 'city_admin_match', city: 'Kopawor', district: 'Kupwara', placeId: 'geonames:1', region: 'Jammu and Kashmir' },
    'x:andhra': { basis: 'published_address_admin_match', city: 'Rasapudipalem', district: 'Visakhapatnam', placeId: 'geonames:2', region: 'Andhra Pradesh' },
    'x:nliu': { basis: 'published_postal_locality', city: 'Road', district: 'Damoh', placeId: 'geonames:postal-area:470663:x', region: 'Madhya Pradesh' },
    'x:bhiwani': { basis: 'published_postal_locality', city: 'Birla Colony Bhiwani', district: 'Bhiwani', postcodes: ['127021'], region: 'Haryana' },
    'x:rohini': { basis: 'published_address_admin_match', city: 'Kanniyakumari', district: 'Kanniyakumari', placeId: 'geonames:5', region: 'Tamil Nadu' },
    'x:prayagraj': { basis: 'city_admin_match', city: 'Prayagraj', district: 'Prayagraj', region: 'Uttar Pradesh' },
  },
});
const place = (library, entry) => publicPlace({ country: 'IN', ...library }, entry, index);

test('the place rule: published city first, supported districts, never a street, else the state only', () => {
  // The source's own city, before the place index's spelling of it.
  assert.equal(place({ city: 'Kopawor', district: 'Kupwara', region: 'Jammu and Kashmir' }, { id: 'x:kupwara', city: 'Kupwara', district: 'Kupwara' }).city, 'Kupwara');
  // A city with the district's name comes first (the renamed city).
  assert.equal(place({ city: 'Prayagraj', district: 'Prayagraj', region: 'Uttar Pradesh' }, { id: 'x:prayagraj', city: 'Allahabad' }).city, 'Prayagraj');
  // The index's town only by another name, where the address names the district: the district.
  assert.deepEqual(place({ city: 'Rasapudipalem', district: 'Visakhapatnam', region: 'Andhra Pradesh' }, { id: 'x:andhra', district: 'Visakhapatnam', address: 'Waltair Junction,Visakhapatnam,' }),
    { city: 'Visakhapatnam', district: 'Visakhapatnam', basis: 'district-in-address' });
  // ... but another spelling of the index's town counts when nothing better is there.
  assert.equal(place({ city: 'Kanniyakumari', district: 'Kanniyakumari', region: 'Tamil Nadu' }, { id: 'x:rohini', address: 'Kanyakumari' }).city, 'Kanniyakumari');
  // A street as a city is dropped; a PIN-supported district named in the address is shown.
  assert.equal(place({ city: 'Birla Colony Bhiwani', district: 'Bhiwani', region: 'Haryana' }, { id: 'x:bhiwani', address: 'Birla Colony, Bhiwani, Haryana 127021. INDIA' }).city, 'Bhiwani');
  // An unsupported district (no PIN, not published, not in the address) is dropped; the
  // address's one district of the state is used instead.
  assert.deepEqual(place({ city: 'Road', district: 'Damoh', region: 'Madhya Pradesh' }, { id: 'x:nliu', address: 'Kerwa Dam Road, BhopalBarkeri KalanBhopal' }),
    { city: 'Bhopal', district: 'Bhopal', basis: 'address-district' });
  // A published district without the town in the address: "<district> district".
  const district = place({ city: null, district: 'Jabalpur', region: 'Madhya Pradesh' }, { id: 'x:kv', district: 'Jabalpur' });
  assert.deepEqual(district, { city: null, district: 'Jabalpur', basis: 'district' });
  assert.equal(placeOf({ ...district, region: 'Madhya Pradesh' }), 'Jabalpur district, Madhya Pradesh');
  // Never from a name: no evidence is the state only.
  assert.deepEqual(place({ name: 'District Library Jammu', city: null, region: 'Jammu and Kashmir' }, { id: 'x:none', name: 'District Library Jammu' }), { city: null, district: null, basis: 'state' });
  // Two districts named in an address: no guess.
  assert.equal(place({ city: null, region: 'Madhya Pradesh' }, { id: 'x:two', address: 'Bhopal, Damoh' }).basis, 'state');
  // Outside India nothing changes.
  assert.equal(publicPlace({ country: 'US', city: 'San Jose' }, { id: 'us:x' }, index).city, 'San Jose');
  // A city and its state are not repeated.
  assert.equal(placeOf({ city: 'Puducherry', region: 'Puducherry' }), 'Puducherry');
});

test('the place rule on the directory: the libraries the live pages showed wrongly', () => {
  const shown = id => { const entry = getLibraryById(id); const library = publicLibrary(toPublicLibrary(entry), entry); return placeOf(library); };
  assert.equal(shown('indcat:indcat-nliu-462003'), 'Bhopal, Madhya Pradesh');
  assert.equal(shown('libman:798'), 'Kolkata, West Bengal');
  assert.equal(shown('libman:371'), 'Bhiwani, Haryana');
  assert.equal(shown('indcat:indcat-andh-530003'), 'Visakhapatnam, Andhra Pradesh');
  assert.equal(shown('egranthalaya:jklibraries-dlkupwara'), 'Kupwara, Jammu and Kashmir');
  assert.equal(shown('libman:276'), 'Pattan, Jammu and Kashmir');
  // SRS Central Library publishes its city on its own e-Granthalaya page
  // (server/data/india-library-regions.json `places`, tools/directory/india-regions.mjs).
  assert.equal(shown('egranthalaya:jklibraries-srsjammu'), 'Jammu, Jammu and Kashmir');
  assert.equal(shown('egranthalaya:assembly-klasect'), 'Bengaluru, Karnataka');
  // No published town for Meghalaya's assembly library: the state only, never from its name.
  assert.equal(shown('egranthalaya:assembly-mlasectlib'), 'Meghalaya');
  const nliu = publicLibrary(toPublicLibrary(getLibraryById('indcat:indcat-nliu-462003')), getLibraryById('indcat:indcat-nliu-462003'));
  assert.equal(nliu.address, 'Kerwa Dam Road, Bhopal, Barkeri Kalan');
});

test('a corrected library name: same ID, the new name everywhere, the old page address redirects', () => {
  // The e-Granthalaya directory spells it "Secretatriat"; the correction lives in
  // data/library-presentation-reviews.json, so a regenerated directory keeps it.
  const id = 'egranthalaya:assembly-mlasectlib', name = 'Meghalaya Legislative Assembly Secretariat Library';
  const oldSlug = 'meghalaya-legislative-assembly-secretatriat-library', newSlug = 'meghalaya-legislative-assembly-secretariat-library';
  const entry = getLibraryById(id);
  assert.equal(entry.id, id);
  assert.equal(entry.name, name);
  assert.equal(toPublicLibrary(entry).name, name);
  assert.ok(entry.searchAliases.includes('Meghalaya Legislative Assembly Secretatriat Library'), 'the old spelling still finds it');
  const shelves = JSON.parse(readFileSync('shared/seo-shelves.json', 'utf8'));
  assert.equal(shelves.libraries[id].slug, newSlug);
  assert.ok(!JSON.stringify(shelves).includes(oldSlug));
  const routes = JSON.parse(readFileSync('vercel.json', 'utf8')).services.web.routes;
  const redirect = routes.findIndex(route => route.src === '/libraries/' + oldSlug);
  assert.ok(redirect >= 0 && routes[redirect].status === 308 && routes[redirect].headers.Location === '/libraries/' + newSlug);
  assert.ok(redirect < routes.findIndex(route => route.src === '/libraries/([^/]+)'));
  if (existsSync('client/dist/libraries')) {
    assert.ok(!existsSync(`client/dist/libraries/${oldSlug}.html`));
    if (existsSync(`client/dist/libraries/${newSlug}.html`)) assert.ok(readFileSync(`client/dist/libraries/${newSlug}.html`, 'utf8').includes(`<h1>${name}</h1>`));
    assert.ok(!readFileSync('client/dist/sitemap.xml', 'utf8').includes(oldSlug));
  }
});

test('titles: name and city first with "catalog", about 60 characters; descriptions end at a sentence within 155', () => {
  assert.equal(shelfTitle({ name: 'SRS Central Library', city: null }), 'SRS Central Library — catalog and book search');
  assert.equal(shelfTitle({ name: 'CPU Central Library Kota', city: 'Kota' }), 'CPU Central Library Kota — catalog and book search');
  assert.equal(shelfTitle({ name: 'National Law Institute University', city: 'Bhopal' }), 'National Law Institute University, Bhopal catalog');
  // A name too long for any shorter form keeps its words: never cut.
  const long = shelfTitle({ name: 'National Institute of Pharmaceutical Education and Research (NIPER) - Ahmedabad', city: null });
  assert.equal(long, 'National Institute of Pharmaceutical Education and Research (NIPER) - Ahmedabad catalog');
  assert.equal(fullTitle('About MyBookshelf'), 'About MyBookshelf | MyBookshelf');
  assert.equal(fullTitle('District Library Kupwara — catalog and book search'), 'District Library Kupwara — catalog and book search');
  assert.ok(fullTitle('x'.repeat(48)).length <= TITLE_MAX);
  const library = { name: 'National Institute of Pharmaceutical Education and Research (NIPER) - Ahmedabad', district: 'Gandhinagar', region: 'Gujarat' };
  const description = shelfDescription(library, 10);
  assert.ok(description.length <= DESCRIPTION_MAX && description.endsWith('.'), description);
  assert.ok(description.startsWith(library.name));
  assert.equal(bookTitle({ title: 'Godaan', authors: ['Munshi Premchand'] }), 'Godaan by Munshi Premchand — find it in a library');
  assert.equal(bookTitle({ title: 'Introduction to the Constitution of India', authors: ['Durga Das Basu'] }), 'Introduction to the Constitution of India by Durga Das Basu');
  const names = ['National Institute of Pharmaceutical Education and Research (NIPER) - Ahmedabad', 'Central University of Gujarat, Gandhinagar'];
  const book = bookDescription({ title: "Gray's Anatomy", authors: ['Henry Gray F.R.S.'] }, names);
  assert.ok(book.length <= DESCRIPTION_MAX && book.endsWith('.'), book);
  // The page's fallback cuts at a sentence, never with an ellipsis.
  assert.equal(fitDescription('A'.repeat(100) + '. ' + 'B'.repeat(100) + '.'), 'A'.repeat(100) + '.');
  assert.ok(!fitDescription('word '.repeat(60)).endsWith('…'));
});

test('book titles are shown in title case without lowering any capitals but minor words', () => {
  assert.equal(displayTitle('Malgudi days'), 'Malgudi Days');
  assert.equal(displayTitle("Gray's anatomy"), "Gray's Anatomy");
  assert.equal(displayTitle('Let us C'), 'Let Us C');
  assert.equal(displayTitle('Programming in ANSI C'), 'Programming in ANSI C');
  assert.equal(displayTitle('The Home And The World'), 'The Home and the World');
  assert.equal(displayTitle('Linear algebra and its applications'), 'Linear Algebra and Its Applications');
  assert.equal(displayTitle('INDIA IN CRISIS'), 'INDIA IN CRISIS');
});

test('library structured data: the page address and a PostalAddress from what the page shows; no official website', () => {
  const data = libraryStructuredData({ name: 'X Library', city: 'Kochi', region: 'Kerala', country: 'IN', address: 'Convent Road, Kochi 682035, Kerala, India', addressScope: 'library', addressSourceUrl: 'https://example.org' }, 'https://mybookshelf.cloud/libraries/x');
  assert.deepEqual(data, { '@context': 'https://schema.org', '@type': 'Library', '@id': 'https://mybookshelf.cloud/libraries/x#library', name: 'X Library', url: 'https://mybookshelf.cloud/libraries/x', subjectOf: 'https://mybookshelf.cloud/libraries/x',
    address: { '@type': 'PostalAddress', streetAddress: 'Convent Road, Kochi 682035, Kerala, India', postalCode: '682035', addressLocality: 'Kochi', addressRegion: 'Kerala', addressCountry: 'IN' } });
  // A locality-only address, or one without a source, is not a street address; a district is not a locality.
  const bare = libraryStructuredData({ name: 'Y', district: 'Mandi', region: 'Himachal Pradesh', country: 'IN', address: 'Mandi', addressScope: 'locality', addressSourceUrl: 'https://example.org' }, 'https://mybookshelf.cloud/libraries/y');
  assert.deepEqual(bare.address, { '@type': 'PostalAddress', addressRegion: 'Himachal Pradesh', addressCountry: 'IN' });
});

test('book slugs: post-nominal letters are not a surname; only slugs from the earlier rule change', () => {
  assert.equal(authorSurname('Henry Gray F.R.S.'), 'Gray');
  assert.equal(authorSurname('Martin Luther King Jr.'), 'King');
  assert.equal(authorSurname('B.S. Grewal'), 'Grewal');
  assert.equal(authorSurname('A. P. J. Abdul Kalam'), 'Kalam');
  assert.equal(authorSurname('Gandhi, M. K.'), 'K', 'two initials stay as before');
  assert.equal(authorSurname('Kalki'), 'Kalki');
  assert.equal(bookSlug({ bookKey: 'k', title: "Gray's anatomy", authors: ['Henry Gray F.R.S.'] }, new Set()), 'grays-anatomy-gray');
  const books = { a: { slug: 'grays-anatomy-s', title: "Gray's anatomy", authors: ['Henry Gray F.R.S.'] }, b: { slug: 'godaan-premchand', title: 'Godaan', authors: ['Munshi Premchand'] },
    c: { slug: 'kept-by-hand', title: 'Another', authors: ['Jane Roe F.R.S.'] } };
  assert.deepEqual(correctBookSlugs(books), [{ bookKey: 'a', from: 'grays-anatomy-s', to: 'grays-anatomy-gray' }]);
  assert.equal(books.a.slug, 'grays-anatomy-gray');
  assert.equal(books.b.slug, 'godaan-premchand');
  assert.equal(books.c.slug, 'kept-by-hand');
  assert.deepEqual(correctBookSlugs(books), [], 'idempotent');
  // The real data: only books whose first author has post-nominal letters change.
  const data = JSON.parse(readFileSync('shared/seo-shelves.json', 'utf8'));
  const changes = correctBookSlugs(structuredClone(data.books));
  for (const change of changes) assert.match(data.books[change.bookKey].authors[0], /F\.R\.S\.|Jr|Sr|PhD|M\.D\./i);
  for (const [key, details] of Object.entries(data.books)) if (!changes.some(c => c.bookKey === key)) assert.ok(details.slug.startsWith(slugify(details.title)), key);
});

test('built pages: one spelling per state, a Books link, tidy titles and descriptions, no unreliable first-edition year, no old slug', { skip: !existsSync('client/dist/books') }, () => {
  const read = path => readFileSync('client/dist/' + path, 'utf8');
  const hub = read('libraries.html');
  assert.ok(!hub.includes('Jammu &amp; Kashmir') && !hub.includes('Jammu & Kashmir'));
  const headings = [...hub.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.equal(new Set(headings).size, headings.length, 'no state twice');
  assert.ok(!existsSync('client/dist/books/grays-anatomy-s.html'));
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const routes = vercel.services.web.routes;
  const redirect = routes.findIndex(route => route.src === '/books/grays-anatomy-s');
  assert.ok(redirect >= 0 && routes[redirect].status === 308 && routes[redirect].headers.Location === '/books/grays-anatomy-gray');
  assert.ok(redirect < routes.findIndex(route => route.src === '/books/([^/]+)'));
  for (const dir of ['libraries', 'books']) for (const file of readdirSync('client/dist/' + dir)) {
    const html = read(`${dir}/${file}`);
    assert.match(html, /<nav aria-label="Main navigation">.*<a href="\/books">Books<\/a>.*<\/nav>/, file);
    const description = /<meta name="description" content="([^"]*)"/.exec(html)[1];
    assert.ok(!description.endsWith('…') && /[.!?]$/.test(description), file);
    assert.ok(!html.includes('Earliest edition'), file);
    assert.ok(!/\b(?:Road|Colony)\b/.test(/<p class="eyebrow">([^<]*)/.exec(html)?.[1] || ''), file);
    if (dir === 'books') assert.ok(/<title>([^<]*)<\/title>/.exec(html)[1].replace(/&#39;/g, "'").length <= 65, file);
  }
  const nliu = read('libraries/national-law-institute-university.html');
  const library = JSON.parse(/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(nliu)[1]).find(item => item['@type'] === 'Library');
  assert.equal(library.url, 'https://mybookshelf.cloud/libraries/national-law-institute-university');
  assert.equal(library.address.addressLocality, 'Bhopal');
  assert.equal(library.address.addressCountry, 'IN');
});
