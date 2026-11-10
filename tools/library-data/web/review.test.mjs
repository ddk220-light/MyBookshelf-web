import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
const dom=new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document=dom.window.document;globalThis.Node=dom.window.Node;
const ui=await import('./review.js');
test('provider strings render as inert text and unknown metadata is explicit',()=>{
  const node=ui.element('td','<img src=x onerror=alert(1)>');assert.equal(node.children.length,0);assert.equal(node.textContent,'<img src=x onerror=alert(1)>');assert.equal(ui.text(null),'Unknown');assert.equal(ui.text(['A','B']),'A; B');
});
test('item links reject script/data/credential URLs',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,x','https://user:secret@example.test'])assert.equal(ui.safeLink(value),null);
  assert.equal(ui.safeLink('https://catalog.test/item/123'),'https://catalog.test/item/123');
});
test('local interface loads coverage and library rows using only local read API',async()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');const page=new JSDOM(html,{url:'http://127.0.0.1:4322'});
  globalThis.document=page.window.document;globalThis.Node=page.window.Node;
  const calls=[];globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.startsWith('/api/summary')?{refreshedAt:'2026-11-10',libraries:2,bySystem:{koha:{total:2}}}:{rows:[{library_id:'koha:a',name:'Example Library',country:'IN',system:'koha',status:'Working',app_eligible:0,metrics:{observed_bibliographic_records:3}}],total:1,nextOffset:null}};};
  await ui.initialize();assert.ok(document.querySelector('#table').textContent.includes('Example Library'));assert.ok(document.querySelector('#table').textContent.includes('Unverified / excluded'));assert.ok(calls.every(path=>path.startsWith('/api/')));
  assert.equal(document.querySelectorAll('#tabs button').length,8);assert.ok(document.querySelector('#download').href.includes('/api/export/libraries.csv'));
});
