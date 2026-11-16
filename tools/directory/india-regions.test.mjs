import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResolver } from './india-regions.mjs';
import { parseContact, withoutContactChannels } from './egranthalaya-contacts.mjs';
import { getAllLibraries, getLibraryById } from '../../server/services/directory.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const places = read('server/data/india-places.json');
const aliases = read('data/india-administrative-aliases.json');
const regions = read('server/data/india-library-regions.json');
const resolve = createResolver({ places, aliases });

test('a library\'s own published state wins, unless its PIN points elsewhere', () => {
  const contact = { outcome: 'answered', address: 'HYDERABAD-500043', city: 'Hyderabad', state: 'Telangana', sourceUrl: 'https://eg4.nic.in/x' };
  const result = resolve({ id: 'egranthalaya:x' }, contact);
  assert.equal(result.region, 'Telangana');
  assert.equal(result.evidence.kind, 'published-state');
  const conflict = resolve({ id: 'egranthalaya:y' }, { ...contact, address: 'Chennai 600036' });
  assert.match(conflict.unresolved, /conflicts with PIN/);
});

test('state reorganisations after the GeoNames postcodes are the same place, and the current state wins', () => {
  const contact = { outcome: 'answered', sourceUrl: 'https://eg4.nic.in/x' };
  assert.equal(resolve({ id: 'egranthalaya:l' }, { ...contact, address: 'Leh 194101', state: 'Ladakh' }).region, 'Ladakh');
  assert.equal(resolve({ id: 'egranthalaya:t' }, { ...contact, address: 'Hyderabad 500018', state: 'Andhra Pradesh' }).region, 'Telangana');
  assert.equal(resolve({ id: 'egranthalaya:p' }, { ...contact, address: 'Port Blair 744103', state: 'Andaman and Nicobar Islands' }).region, 'Andaman and Nicobar Islands');
  assert.match(resolve({ id: 'egranthalaya:c' }, { ...contact, address: 'Sector 1, Chandigarh 160001', state: 'Punjab' }).unresolved, /conflicts with PIN/);
});

test('a PIN in a published address or an IndCat code settles the state when GeoNames puts it in one state', () => {
  assert.equal(resolve({ id: 'indcat:a', indcatInstitutionCode: 'AGRA_282004' }).region, 'Uttar Pradesh');
  assert.equal(resolve({ id: 'indcat:a', indcatInstitutionCode: 'AGRA_282004' }).evidence.kind, 'indcat-code-pin');
  const pune = resolve({ id: 'indcat:b', address: '846, Shivajinagar, Deccan, Pune 411004' });
  assert.equal(pune.region, 'Maharashtra');
  assert.equal(pune.evidence.kind, 'address-pin');
});

test('district and place names in a published address count only when they share one state', () => {
  assert.equal(resolve({ id: 'libman:a', address: 'Shirpur, Dist. Dhule' }).region, 'Maharashtra');
  const ambiguous = resolve({ id: 'libman:b', address: 'Aurangabad' });
  assert.equal(ambiguous.region, undefined);
  assert.match(ambiguous.unresolved, /lie in/);
});

test('one town name that is unique in the place index is not enough for a state', () => {
  // Ghogaon is a GeoNames place only in Madhya Pradesh, but the institution
  // publishing just "Ghogaon" is in Satara, Maharashtra.
  const lone = resolve({ id: 'libman:lone', address: 'Ghogaon' });
  assert.equal(lone.region, undefined);
  assert.match(lone.unresolved, /one town name only \(ghogaon/);
  // A second part agreeing on the same state, or a district of it, still settles it.
  assert.equal(resolve({ id: 'libman:two', address: 'Shirpur, Dist. Dhule' }).region, 'Maharashtra');
  assert.equal(resolve({ id: 'libman:district', address: 'Tal. Chandgad Dist. Kolhapur' }).region, 'Maharashtra');
  assert.equal(resolve({ id: 'libman:district-alias', address: 'Belgaum' }).region, 'Karnataka');
});

test('Nerul in Navi Mumbai is not filled as Goa, where the place index has its only Nerul', () => {
  for (const address of ['Kurup Vidyanagri, Plot no. 31, Sector -25, Seawoods, Nerul, Navi-Mumbai', 'NERUL']) {
    const result = resolve({ id: 'libman:nerul', address });
    assert.equal(result.region, undefined, address);
    assert.match(result.unresolved, /one town name only \(nerul, Goa/, address);
  }
  // The committed file leaves the confirmed cases without a state rather than guess.
  for (const id of ['libman:401', 'libman:440', 'libman:508', 'libman:332', 'libman:391']) {
    assert.equal(regions.libraries[id], undefined, id);
    assert.ok(regions.unresolved[id], id);
    assert.equal(getLibraryById(id).region ?? '', '', id);
  }
  for (const fill of Object.values(regions.libraries)) {
    if (fill.evidence.kind === 'address-place' && !fill.evidence.value.includes(', ')) {
      assert.ok(resolve({ id: 'libman:check', address: fill.evidence.value }).region, `${fill.evidence.value} must be a district`);
    }
  }
});

test('a library name is never evidence', () => {
  const result = resolve({ id: 'egranthalaya:aps-x', name: 'Air Force School Jaisalmer Library' });
  assert.equal(result.region, undefined);
  assert.equal(result.unresolved, 'no published address');
});

test('contact pages keep only the labelled address, city and state, never e-mail or phone numbers', () => {
  const html = `<span id="Lbl_Lib_LibAddress">Main Rd, Gwalior 474020 librarian@example.org +91 98765 43210</span>
    <span id="Lbl_Lib_City">Gwalior</span><span id="Lbl_Lib_State">Madhya Pradesh</span><span id="Lbl_Lib_Email">x@y.in</span>`;
  const contact = parseContact(html);
  assert.deepEqual(Object.keys(contact).sort(), ['address', 'city', 'state']);
  assert.equal(contact.state, 'Madhya Pradesh');
  assert.ok(contact.address.includes('474020'));
  assert.equal(/@|98765/.test(contact.address), false);
  const landline = withoutContactChannels('Olof Palme Marg, New Delhi - 110067 Telephone No. , 26737712 Website: http://istm.gov.in/');
  assert.ok(landline.includes('110067'));
  assert.equal(/26737712|Telephone/.test(landline), false);
  assert.equal(withoutContactChannels('Pune 411 004, Ph: 020-25536000'), 'Pune 411 004,');
  for (const kept of ['NEAR SHAKTI NAGAR TELEPHONE EXCHANGE, G.T. KARNAL ROAD, NEW DELHI - 110033.', 'Okhala - PH-II New Delhi',
    'Jatnagla,Tel-Hindaun, Dist-Karauli (322236) Rajasthan', '48-16-11,RS. No379/2B, Vijayawada, PIN - 521 456', 'Room No 32000-F, Krishi Bhawan , New Delhi-110001 ,']) {
    assert.equal(withoutContactChannels(kept), kept);
  }
  const saved = readFileSync(new URL('../../docs/research/india-library-regions/egranthalaya-contacts.json', import.meta.url), 'utf8');
  for (const item of JSON.parse(saved).libraries) for (const field of ['address', 'city', 'state']) {
    assert.equal(withoutContactChannels(item[field] || ''), item[field] || '', `${item.libraryId} ${field}`);
  }
});

test('the generated regions file only fills libraries without a source region, from stated evidence', () => {
  const states = new Set(getAllLibraries().filter((entry) => entry.country === 'IN' && entry.region).map((entry) => entry.region));
  const kinds = new Set(['published-state', 'address-pin', 'indcat-code-pin', 'address-state-name', 'address-place']);
  for (const [id, fill] of Object.entries(regions.libraries)) {
    const entry = getLibraryById(id);
    assert.ok(entry, id);
    assert.equal(entry.country, 'IN', id);
    assert.equal(entry.region, fill.region, id);
    assert.ok(states.has(fill.region), `${id}: ${fill.region}`);
    assert.ok(kinds.has(fill.evidence?.kind), id);
  }
  assert.equal(regions.counts.filled, Object.keys(regions.libraries).length);
  assert.equal(regions.counts.unresolved, Object.keys(regions.unresolved).length);
});
