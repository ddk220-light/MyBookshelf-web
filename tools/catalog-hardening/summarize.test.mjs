import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEvidence } from './summarize.mjs';

const manifest = { selectedLibraryIds: ['primary'], candidates: [{ libraryId: 'primary', alternateLibraryIds: ['alternate'] }] };
const book = (id, extra = {}) => ({ recordId: String(id), title: `Book ${id}`, search: { matchingRecord: true }, resolve: { ok: true, title: `Book ${id}` }, lookup: { outcome: 'found', source: 'live' }, ...extra });
const source = (id, books) => ({ file: 'sample-results.json', data: { libraries: [{libraryId:id, books}] } });

test('counts aliases once and never combines partial routes into a ten-book pass', () => {
  const result = summarizeEvidence(manifest,[source('primary',[1,2,3,4,5].map(id=>book(id))),source('alternate',[6,7,8,9,10].map(id=>book(id)))]);
  assert.equal(result.selectedTenBooksVerified,0);
  assert.equal(result.libraries.length,1);
  assert.equal(result.libraries[0].verifiedBooks,5);
});

test('requires evidence rather than claimed passes and rejects repeated titles', () => {
  const result = summarizeEvidence(manifest,[source('primary',[
    book(1),book(2,{title:'Book 1'}),book(3,{lookup:{outcome:'couldnt_check',source:'live'}}),
    book(4,{search:{},pass:true}),book(5,{resolve:undefined}),book(6,{lookup:{outcome:'found',source:'stored'}}),
  ])]);
  assert.equal(result.libraries[0].verifiedBooks,1);
});

test('excludes non-books, changed resolved titles and repeated replay source IDs', () => {
  const result = summarizeEvidence(manifest,[source('primary',[
    book(1,{sourceRecordId:'stable'}),book(2,{sourceRecordId:'stable'}),
    book(3,{eligibleBook:false}),book(4,{resolve:{ok:true,title:'A different book'}}),
    book(5,{exclusion:'Ambiguous continuing series'}),book(6,{passed:false}),
  ])]);
  assert.equal(result.libraries[0].verifiedBooks,1);
});

test('does not assemble a synthetic successful attempt from separate incomplete runs', () => {
  const result = summarizeEvidence(manifest,[source('primary',[book(1,{resolve:undefined})]),source('primary',[book(1,{search:{},lookup:undefined})]),source('alternate',[book(2)])]);
  assert.equal(result.libraries[0].routes.find(row=>row.libraryId==='primary').verifiedBooks,0);
});

test('a later complete attempt may replace an earlier failed attempt of the same book', () => {
  const result=summarizeEvidence(manifest,[source('primary',[book(1,{passed:false}),book(1)])]);
  assert.equal(result.libraries[0].verifiedBooks,1);
});

test('does not call deferred host members checked or accept another record answer', () => {
  const deferred = {file:'blocked-results.json',data:{libraries:[{libraryId:'other',status:'not_attempted',books:[]}]}};
  const result = summarizeEvidence(manifest,[deferred,source('primary',[book(1,{lookup:{outcome:'found',source:'live',recordId:'2'}})])]);
  assert.equal(result.additionalDirectoryEntriesReviewed,1);
  assert.equal(result.additionalDirectoryEntriesChecked,0);
  assert.equal(result.libraries.find(row=>row.libraryId==='primary').verifiedBooks,0);
});

test('explicit identity contradictions and separate ISBN diagnostics cannot supply a complete attempt', () => {
  const result = summarizeEvidence(manifest, [source('primary', [
    book(1, { search: { matchingRecord: true, matchedRecordId: '99' } }),
    book(2, { resolve: { ok: true, title: 'Book 2', recordId: '99' } }),
    book(3, { search: { matchingRecord: true, ok: false } }),
    book(4, { lookup: undefined, isbnLookup: { outcome: 'found', source: 'live', evidence: 'exact_isbn' } }),
    book(5, { lookup: { outcome: 'found', source: 'live', evidence: 'exact_isbn' } }),
  ])]);
  assert.equal(result.libraries[0].verifiedBooks, 1, 'an instrumented primary ISBN workflow may qualify, but not a detached diagnostic');
});
