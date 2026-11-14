import { beforeAll, describe, expect, it } from 'vitest';
import { COVER_SHEEN, MIN_TEXT_CONTRAST, PALETTES, SHELF_BACKS, SUGGESTED_SHEEN, SUGGESTION_OPACITY, composite, contrastRatio, fadedContrast, spinePalette, suggestionPalette, suggestionShade } from './spineColors';

it('is deterministic per key and varies across keys', () => {
  const a = spinePalette('v1:isbn:9780553418026');
  expect(spinePalette('v1:isbn:9780553418026')).toEqual(a);
  const keys = Array.from({ length: 24 }, (_, i) => `v1:isbn:${9780000000000 + i}`);
  // All 6 palettes are reachable; `> 1` would still pass if the hash collapsed
  // onto just 2 of them, so this can't actually catch that regression.
  expect(new Set(keys.map((k) => spinePalette(k).top)).size).toBeGreaterThanOrEqual(4);
});

// An independent WCAG 2 computation, so the check does not rest on the code it checks.
const channels = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const relative = (hex: string) => {
  const [r, g, b] = channels(hex).map(value => value / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const wcag = (a: string, b: string) => { const [x, y] = [relative(a), relative(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Opacity composites each sRGB channel over what is behind, rounded to 8 bits.
const over = (front: string, back: string, alpha: number) => '#' + channels(front).map((value, index) => Math.round(alpha * value + (1 - alpha) * channels(back)[index]).toString(16).padStart(2, '0')).join('');

describe('suggested plain covers (plan 2026-11-14, Part 2, edge case 3)', () => {
  // Read from disk: vitest hands CSS imports to tests empty, even with ?raw.
  let homeCss = '';
  beforeAll(async () => {
    const fs = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fs) as { readFileSync: (path: string, encoding: 'utf8') => string };
    // From client/ (npm run test:client) or from the repository root.
    const cwd = (globalThis as { process?: { cwd: () => string } }).process?.cwd() || '.';
    const read = (path: string) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
    homeCss = read(cwd + '/src/v2/ui/home/home.css') || read(cwd + '/client/src/v2/ui/home/home.css');
  });

  it('the shelf backgrounds, the fade and the cover sheen match home.css', () => {
    const shelfBack = (selector: string) => new RegExp(selector.replace(/[[\]()'.]/g, '\\$&') + '\\s*\\{[^}]*--shelf-back:\\s*(#[0-9a-f]{6})').exec(homeCss)?.[1];
    expect(shelfBack(':root')).toBe(SHELF_BACKS.daylight);
    expect(shelfBack(":root[data-reading-light='lamplight']")).toBe(SHELF_BACKS.lamplight);
    expect(shelfBack(":root[data-reading-light='ink']")).toBe(SHELF_BACKS.ink);
    expect(homeCss).toMatch(/\.cover3d\.is-suggested \.cover3d-face \{ opacity: \.75; \}/);
    expect(SUGGESTION_OPACITY).toBe(0.75);
    // The plain cover's face: a white sheen from the top-left corner over the cover colour.
    const face = /\.cover3d-face \{[^}]*\}/.exec(homeCss)?.[0] || '';
    expect(face).toContain('linear-gradient(115deg, rgb(255 255 255 / .16), transparent 45%), var(--cover-bg');
    expect(COVER_SHEEN).toBe(0.16);
    // A suggested plain cover keeps the spine shading but has no sheen.
    const suggestedFace = /\.cover3d\.is-suggested \.cover3d-face \{ background:[^}]*\}/.exec(homeCss)?.[0] || '';
    expect(suggestedFace).toContain('linear-gradient(90deg');
    expect(suggestedFace).toContain('var(--cover-bg');
    expect(suggestedFace).not.toContain('115deg');
    expect(SUGGESTED_SHEEN).toBe(0);
  });

  it('every plain-cover colour keeps its printed title at 4.5:1 or more at 75% opacity (no sheen on suggestions), in Daylight, Lamplight and Ink', () => {
    for (const palette of PALETTES) {
      const shade = suggestionShade(palette.top, palette.ink);
      for (const [light, shelf] of Object.entries(SHELF_BACKS)) {
        const ratio = wcag(over(palette.ink, shelf, 0.75), over(shade, shelf, 0.75));
        expect(ratio, `${palette.top} → ${shade} in ${light}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
        expect(fadedContrast(shade, palette.ink, shelf, 0.75, SUGGESTED_SHEEN)).toBeCloseTo(ratio, 6);
      }
    }
  });

  it('the sheen is why suggestions drop it: with the full sheen the thinnest shade would fall below 4.5:1', () => {
    const thinnest = PALETTES[5];
    const shade = suggestionShade(thinnest.top, thinnest.ink);
    expect(Math.min(...Object.values(SHELF_BACKS).map(shelf => fadedContrast(shade, thinnest.ink, shelf, 0.75, COVER_SHEEN)))).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it('the shade is the same colour, darker, and only as dark as needed', () => {
    for (const palette of PALETTES) {
      const shade = suggestionShade(palette.top, palette.ink);
      const [from, to] = [channels(palette.top), channels(shade)];
      to.forEach((value, index) => expect(value).toBeLessThanOrEqual(from[index]));
      // Hue kept: every channel scaled by about the same factor.
      const factors = to.map((value, index) => value / from[index]);
      expect(Math.max(...factors) - Math.min(...factors)).toBeLessThan(0.03);
      // At full strength, the usual colour fails once faded (about 3–4:1), so a darker shade is needed.
      const usual = Math.min(...Object.values(SHELF_BACKS).map(shelf => fadedContrast(palette.top, palette.ink, shelf)));
      if (usual >= MIN_TEXT_CONTRAST) expect(shade).toBe(palette.top);
      else {
        expect(shade).not.toBe(palette.top);
        // One 2% step lighter would fail somewhere.
        const step = Math.round((1 - Math.max(...factors)) / 0.02);
        const lighter = '#' + from.map(value => Math.round(value * (1 - (step - 1) * 0.02)).toString(16).padStart(2, '0')).join('');
        expect(Math.min(...Object.values(SHELF_BACKS).map(shelf => fadedContrast(lighter, palette.ink, shelf)))).toBeLessThan(MIN_TEXT_CONTRAST);
      }
    }
  });

  it('a suggestion keeps its book’s palette and ink, with the darker shade', () => {
    for (const key of Array.from({ length: 12 }, (_, i) => `v1:openlibrary:OL${i + 1}W`)) {
      const usual = spinePalette(key), suggested = suggestionPalette(key);
      expect(suggested.ink).toBe(usual.ink);
      expect(suggested.top).toBe(suggestionShade(usual.top, usual.ink));
    }
  });

  it('contrast helpers', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(composite('#000000', '#ffffff', 0.75)).toBe('#404040');
  });
});
