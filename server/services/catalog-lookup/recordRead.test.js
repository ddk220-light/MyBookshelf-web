import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogLookup } from './index.js';
import { catalogOperation } from '../providers/http.js';

const library = { id:'koha:record-read-test',platform:'koha',baseUrl:'https://record-read.example.test' };
const platforms = { koha:{book:{maxRequests:2,deadlineMs:20},hostConcurrency:1,minIntervalMs:0,perMinute:0} };

test('record-read deadline aborts provider work before releasing its host slot', async () => {
  let providerSignal, abortedAtRelease = false;
  const guard = { circuitOpen:()=>false, acquire:async()=>()=>{abortedAtRelease=providerSignal.aborted;} };
  const lookup = createCatalogLookup({platforms,guard,robots:null,hostGate:null});
  await assert.rejects(lookup.readRecord({library,read:()=>{
    providerSignal=catalogOperation().signal;
    return new Promise((resolve,reject)=>providerSignal.addEventListener('abort',()=>reject(new Error('Upstream cancelled')),{once:true}));
  }}), {code:'CATALOG_TIMEOUT'});
  assert.equal(providerSignal.aborted,true);
  assert.equal(abortedAtRelease,true);
});

test('reader cancellation aborts and consumes an upstream rejection during setup', async () => {
  const caller=new AbortController();
  const lookup=createCatalogLookup({platforms,robots:null,hostGate:null});
  let providerSignal;
  await assert.rejects(lookup.readRecord({library,signal:caller.signal,read:()=>{
    providerSignal=catalogOperation().signal;
    const upstream=new Promise((resolve,reject)=>providerSignal.addEventListener('abort',()=>reject(new Error('Upstream cancelled')),{once:true}));
    caller.abort();
    return upstream;
  }}), {code:'CATALOG_ABORTED'});
  assert.equal(providerSignal.aborted,true);
  await new Promise(resolve=>setImmediate(resolve));
});

test('own request pacing uses the app deadline and is busy rather than a library timeout', async () => {
  let healthFailures=0;
  const guard={circuitOpen:()=>false,acquire:async()=>()=>{},recordSuccess:()=>{},recordFailure:()=>{healthFailures++;}};
  const hostGate={reserve:async(host,options)=>{
    const nextSlot=Date.now()+1000;
    if(nextSlot>options.deadlineAt)throw Object.assign(new Error('Host slot is beyond this operation'),{code:'CATALOG_HOST_BUSY'});
  }};
  const provider={checkAvailability:async()=>{
    // Adapters can have a longer transport deadline than the app's operation.
    await catalogOperation().gate('record-read.example.test',{deadlineAt:Date.now()+60_000});
    return {outcome:'available',matchKind:'exact_isbn',recognizedExact:true};
  }};
  const lookup=createCatalogLookup({platforms,guard,hostGate,robots:null,providerFor:()=>provider});
  const answer=await lookup.lookupBook({library,book:{bookKey:'v1:isbn:9780140278330',isbn13:'9780140278330'},editionScope:'exact',storedChecked:true});
  assert.equal(answer.outcome,'couldnt_check');
  assert.equal(answer.reason,'busy');
  assert.equal(healthFailures,0);
  await assert.rejects(lookup.readRecord({library,read:()=>catalogOperation().gate('record-read.example.test',{deadlineAt:Date.now()+60_000})}),{code:'CATALOG_HOST_BUSY'});
});
