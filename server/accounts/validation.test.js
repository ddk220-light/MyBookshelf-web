import assert from 'node:assert/strict';
import test from 'node:test';
import { privateName, accountPassword, strictObject } from './validation.js';
import * as validation from './validation.js';

test('private fields enforce Unicode limits without rewriting passwords',()=>{
 assert.equal(privateName('  Reader 🌱  '),'Reader 🌱');
 assert.throws(()=>privateName('Reader\nHidden'));
 assert.equal(accountPassword('🌱'.repeat(128)),'🌱'.repeat(128));
 assert.throws(()=>accountPassword('🌱'.repeat(129)));
 const spaces='  keep these spaces  ';assert.equal(accountPassword(spaces),spaces);
 assert.throws(()=>strictObject({name:'Reader',ownerId:'forged'},['name']));
});
test('no password rules: one character is enough, the maximum stays, and no breach lookup exists',()=>{
 assert.equal(accountPassword('a'),'a');
 assert.equal(accountPassword(' '),' ');
 assert.throws(()=>accountPassword(''),e=>e.code==='INVALID_INPUT'&&e.message==='Enter a password.');
 assert.throws(()=>accountPassword(undefined),e=>e.message==='Enter a password.');
 assert.throws(()=>accountPassword('x'.repeat(129)),e=>e.code==='INVALID_INPUT'&&/128/.test(e.message));
 assert.equal('checkCompromisedPassword' in validation,false);
});
test('a device book’s display-only Open Library work (shelf suggestions) is accepted and not kept by the account',async()=>{
 const { bookSnapshot } = await import('./books.js');
 const book={bookKey:'v1:isbn:9788173711466',title:'Wings of Fire: An Autobiography',authors:['A. P. J. Abdul Kalam'],isbn13:'9788173711466',workId:'OL1037811W',source:'direct',viewedAt:'2026-11-01T00:00:00.000Z'};
 assert.deepEqual(bookSnapshot(book),{bookKey:book.bookKey,snapshot:{title:book.title,authors:book.authors,isbn13:book.isbn13}});
});
