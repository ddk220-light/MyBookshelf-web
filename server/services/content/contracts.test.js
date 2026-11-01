import assert from 'node:assert/strict';
import test from 'node:test';
import { contentKey, parseContentKey, normalizeDoi, safeWebUrl, observedAccess, readingActions, parseContentSearch, parseContentResolve, itemAccess } from './contracts.js';

test('source-native identities survive round trip; DOI does not become content identity', () => {
  assert.equal(contentKey('gutenberg', '1342'), 'fcd:v1:gutenberg:1342');
  assert.equal(contentKey('open-textbook-library', '4'), 'fcd:v1:open-textbook-library:4');
  assert.deepEqual(parseContentKey(contentKey('europepmc','PMC123','PMC')), { sourceId:'europepmc',recordSource:'PMC',recordId:'PMC123' });
  for (const key of ['v1:isbn:9780140328721','fcd:v2:gutenberg:1','fcd:v1:gutenberg:0','https://doi.org/10.1234/test','fcd:v1:europepmc:BAD:123']) assert.equal(parseContentKey(key),null);
  assert.equal(normalizeDoi('https://doi.org/10.1234/TEST.V2'),'10.1234/test.v2');
  assert.notEqual(contentKey('europepmc','1','PPR'),contentKey('europepmc','1','MED'));
  assert.equal(normalizeDoi('not-a-doi'),null);
});

const now = Date.parse('2026-11-01T10:00:00Z');
const free = { id:'html',host:'Europe PMC',landingUrl:'https://europepmc.org/articles/PMC123',access:'free_full_text',
  evidence:{sourceId:'europepmc',field:'fullTextUrl.availabilityCode=OA',observedAt:new Date(now).toISOString()},downloads:[] };

test('location evidence governs reading; preview, loan and conflicting context stay excluded', () => {
  assert.equal(observedAccess(free,{now}), 'free_full_text');
  for (const access of ['preview','borrow','registration','restricted','metadata_only','unknown']) {
    const location = {...free,access};
    assert.notEqual(observedAccess(location,{now}),'free_full_text');
    assert.deepEqual(readingActions({locations:[location]}, {now}),[]);
  }
  assert.equal(observedAccess({...free,evidence:undefined},{now}),'unknown');
  assert.equal(observedAccess({...free,evidence:{...free.evidence,observedAt:'2026-10-01'}},{now}),'unknown');
  assert.equal(observedAccess({...free,country:'US'},{now,country:'IN'}),'unknown');
  assert.equal(observedAccess({...free,country:'US'},{now}),'unknown');
  assert.equal(observedAccess({...free,rightsJurisdiction:'US'},{now,country:'IN'}),'free_full_text');
  assert.equal(observedAccess({...free,linkCheck:{outcome:'broken'}},{now}),'unknown');
});

test('free article selection never substitutes a subscription DOI location', () => {
  const paid={...free,id:'doi',access:'restricted',landingUrl:'https://doi.org/10.1234/test'};
  const result=readingActions({locations:[paid,free]}, {now});
  assert.equal(result.length,1);
  assert.equal(result[0].url, free.landingUrl);
  assert.equal(result[0].label,'Read at Europe PMC');
});

test('verified free source accounts remain explicit, fresh and separate from unknown registration', () => {
  const account={...free,id:'account',access:'free_account_required',downloads:[{url:free.landingUrl,mimeType:'application/pdf'}]};
  assert.equal(observedAccess(account,{now}),'free_account_required');
  const [action]=readingActions({locations:[account]},{now});
  assert.equal(action.requiresAccount,true);assert.deepEqual(action.downloads,[]);
  assert.equal(itemAccess({locations:[account]},{now}),'free_account_required');
  assert.equal(itemAccess({locations:[account,free]},{now}),'free_full_text');
  assert.equal(readingActions({locations:[account,free]},{now})[0].locationId,free.id);
  assert.equal(observedAccess(account,{now:now+86400001}),'unknown');
  assert.deepEqual(readingActions({locations:[{...account,access:'registration'}]},{now}),[]);
  assert.equal(parseContentSearch({query:'x'}).access,'free');
  assert.equal(parseContentSearch({query:'x',access:'free_full_text'}).access,'free_full_text');
});

test('outbound actions reject unsafe schemes, credentials, local addresses and invalid download types', () => {
  for (const url of ['javascript:alert(1)','data:text/html,x','https://name:password@example.org','http://127.0.0.1','http://2130706433','http://[::1]','https://localhost','https://printer.local','https://example.org:9000','https://example.org/\nfile']) assert.equal(safeWebUrl(url),null);
  assert.equal(safeWebUrl('https://www.gutenberg.org/ebooks/1342'), 'https://www.gutenberg.org/ebooks/1342');
  const actions=readingActions({locations:[{...free,downloads:[{url:'javascript:alert(1)',mimeType:'application/pdf'},{url:free.landingUrl,mimeType:'text/javascript'}]}]}, {now});
  assert.deepEqual(actions[0].downloads,[]);
});

test('search and resolve both validate country/language; Tamil and Hindi remain intact', () => {
  assert.equal(parseContentSearch({query:'தமிழ்',languages:['ta'],country:'IN'}).query,'தமிழ்');
  assert.equal(parseContentSearch({query:'हिन्दी',languages:['hi']}).languages[0],'hi');
  assert.deepEqual(parseContentResolve({key:'fcd:v1:gutenberg:1342',country:'US'}).country,'US');
  assert.equal(parseContentResolve({key:'fcd:v1:gutenberg:1342'}).country,null);
  for (const body of [{query:'x',limit:41},{query:'x',access:'borrow'},{query:'x',country:'india'},{query:'x',sourceUrl:'https://evil.org'},{query:'x',kinds:['dataset']},{query:'x',languages:['Tamil']},{query:'x',includeUnclear:'yes'}]) assert.throws(()=>parseContentSearch(body));
  assert.throws(()=>parseContentResolve({key:'fcd:v1:gutenberg:1342',country:'india'}));
});
