import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeRunner, verifiedBooks } from './probe.mjs';
import { clearHttpCache } from '../../server/services/providers/http.js';

const good = (id,title) => ({recordId:id,title,search:{matchingRecord:true},resolve:{ok:true},lookup:{outcome:'found',source:'live'}});
test('coverage requires distinct titles and records, not duplicate editions or repeated results', () => {
  assert.equal(verifiedBooks([good('1','History of India'),good('2','History of India'),good('1','Other title'),good('3','Science')]).length,2);
});
test('unknown, stored answers, mismatched search and incomplete resolution cannot count as working', () => {
  const values = [
    {...good('1','A'),lookup:{outcome:'couldnt_check',source:'live'}},
    {...good('2','B'),lookup:{outcome:'found',source:'stored'}},
    {...good('3','C'),search:{matchingRecord:false}},
    {...good('4','D'),resolve:{ok:false}},good('5','E'),
    {...good('6','Serial'),eligibleBook:false},
    {...good('7','Magazine'),resolve:{ok:true,observation:{format:'Serial'}}},
  ];
  assert.deepEqual(verifiedBooks(values).map(x=>x.recordId),['5']);
});

test('distinct Indian-language titles retain their vowel marks', () => {
  assert.equal(verifiedBooks([good('1','कला'),good('2','काली'),good('3','மலை'),good('4','மாலை')]).length,4);
});

test('a public catalog refusal stops remaining book and discovery queries', async () => {
  const originalFetch = global.fetch;
  try {
    for (const config of [
      { queries: ['science', 'history', 'india'] },
      { queries: [], candidates: [{ recordId: '1', title: 'Physics' }, { recordId: '2', title: 'Chemistry' }] },
    ]) {
      clearHttpCache();
      let requests = 0;
      global.fetch = async url => {
        if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
        requests++;
        return new Response('Forbidden', { status: 403 });
      };
      const result = await createProbeRunner().probeLibrary('libman:9', { ...config, checkIsbn: false });
      assert.equal(result.refused, true);
      assert.equal(requests, 1);
      assert.equal(result.verified, 0);
    }
  } finally { global.fetch = originalFetch; clearHttpCache(); }
});
