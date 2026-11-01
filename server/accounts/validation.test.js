import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { privateName, accountPassword, strictObject, checkCompromisedPassword } from './validation.js';
import {hashPassword,verifyPassword} from 'better-auth/crypto';

test('private fields enforce Unicode limits without rewriting passwords',()=>{
 assert.equal(privateName('  Reader 🌱  '),'Reader 🌱');
 assert.throws(()=>privateName('Reader\nHidden'));
 assert.equal(accountPassword('🌱'.repeat(128)),'🌱'.repeat(128));
 assert.throws(()=>accountPassword('🌱'.repeat(129)));
 const spaces='  keep these spaces  ';assert.equal(accountPassword(spaces),spaces);
 assert.throws(()=>strictObject({name:'Reader',ownerId:'forged'},['name']));
});
test('breach screening covers the compatibility spelling accepted by the pinned native password verifier',async()=>{
 const password='Ａ'.repeat(16),canonical=password.normalize('NFKC');
 const nativeHash=await hashPassword(password);assert.equal(await verifyPassword({hash:nativeHash,password:canonical}),true);
 const digest=createHash('sha1').update(canonical).digest('hex').toUpperCase();let prefix;
 await assert.rejects(checkCompromisedPassword(password,async url=>{prefix=url;return new Response(digest.slice(5)+':10\r\n');}),e=>e.code==='INVALID_INPUT');
 assert.equal(prefix,'https://api.pwnedpasswords.com/range/'+digest.slice(0,5));
});
test('breach screening sends only a hash prefix and fails closed on provider failures',async()=>{
 const password='a completely synthetic long password';const hash=createHash('sha1').update(password).digest('hex').toUpperCase();
 let requested;
 const positive=async(url,options)=>{requested=url;assert.equal(options.headers['Add-Padding'],'true');return new Response(hash.slice(5)+':10\r\n');};
 await assert.rejects(checkCompromisedPassword(password,positive),e=>e.code==='INVALID_INPUT');
 assert.equal(requested,'https://api.pwnedpasswords.com/range/'+hash.slice(0,5));assert.ok(!requested.includes(password));
 await checkCompromisedPassword(password,async()=>new Response(hash.slice(5)+':0\r\n'));
 for(const provider of [async()=>{throw Error('offline');},async()=>new Response('error',{status:503}),async()=>new Response('<html>wrong service</html>')]){
  await assert.rejects(checkCompromisedPassword(password,provider),e=>e.code==='PASSWORD_CHECK_UNAVAILABLE');
 }
});
