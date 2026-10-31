import { expect, it } from 'vitest';
import { spinePalette } from './spineColors';

it('is deterministic per key and varies across keys', () => {
  const a = spinePalette('v1:isbn:9780553418026');
  expect(spinePalette('v1:isbn:9780553418026')).toEqual(a);
  const keys = Array.from({ length: 24 }, (_, i) => `v1:isbn:${9780000000000 + i}`);
  // All 6 palettes are reachable; `> 1` would still pass if the hash collapsed
  // onto just 2 of them, so this can't actually catch that regression.
  expect(new Set(keys.map((k) => spinePalette(k).top)).size).toBeGreaterThanOrEqual(4);
});
