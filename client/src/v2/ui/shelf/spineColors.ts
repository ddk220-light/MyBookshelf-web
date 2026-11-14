// client/src/v2/ui/shelf/spineColors.ts — deterministic spine colors per book.
// Palettes drawn from the native shelf look: mahogany, forest, navy, plum, gold, slate.
// Ink is checked against the LIGHTEST (top) stop, which is the worst case for light ink.
export const PALETTES = [
  { top: '#7a2f28', bottom: '#43191a', ink: '#f6ead3' }, // 7.78:1 at top
  { top: '#43664b', bottom: '#2f5340', ink: '#eef6ee' }, // 5.88:1 at top — was #4f7d5b = 4.31:1
  { top: '#3e5570', bottom: '#26374b', ink: '#e8eef4' }, // 6.56:1 at top
  { top: '#6d4467', bottom: '#462a42', ink: '#f2e8f0' }, // 6.58:1 at top
  { top: '#8a6a1e', bottom: '#6b5214', ink: '#fdf6e3' }, // 4.68:1 at top — was #b98f4e = 2.74:1
  { top: '#6f6a5e', bottom: '#4a463d', ink: '#efece4' }, // 4.56:1 at top — thinnest margin, never lighten
] as const;

export type SpinePalette = { top: string; bottom: string; ink: string };

function paletteIndex(bookKey: string): number {
  let hash = 0;
  for (let i = 0; i < bookKey.length; i += 1) hash = (hash * 31 + bookKey.charCodeAt(i)) >>> 0;
  return hash % PALETTES.length;
}

export function spinePalette(bookKey: string): SpinePalette {
  return PALETTES[paletteIndex(bookKey)];
}

// Shelf suggestions (plan 2026-11-14, Part 2, edge case 3): a suggested book's
// cover is drawn at 75% opacity over the shelf's back panel, which lowers the
// contrast of the title printed on a plain cover to about 3–4:1. Its plain
// cover therefore uses a darker shade of its colour, the lightest one that
// keeps the faded title at 4.5:1 or more on the shelf in every reading light,
// even where the cover's sheen is brightest (its top-left corner, where a
// long title starts).

/** Opacity of a suggested book's cover (home.css, `.cover3d.is-suggested`). */
export const SUGGESTION_OPACITY = 0.75;
/**
 * The white sheen over a plain cover at its brightest (home.css,
 * `.cover3d-face`: `linear-gradient(115deg, rgb(255 255 255 / .16), transparent 45%)`).
 */
export const COVER_SHEEN = 0.16;
/** `--shelf-back` in each reading light (home.css; a unit test keeps the two in step). */
export const SHELF_BACKS = { daylight: '#efe5d3', lamplight: '#2b2621', ink: '#e9edf2' } as const;
export const MIN_TEXT_CONTRAST = 4.5;

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as Rgb;
const toHex = (color: Rgb) => '#' + color.map(value => Math.round(value).toString(16).padStart(2, '0')).join('');
const channel = (value: number) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio of two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `color` drawn at `opacity` over `backdrop`, as the browser composites it (8-bit sRGB). */
export function composite(color: string, backdrop: string, opacity: number): string {
  const [front, back] = [rgb(color), rgb(backdrop)];
  return toHex(front.map((value, index) => opacity * value + (1 - opacity) * back[index]) as Rgb);
}

/**
 * Contrast of `ink` printed on `cover` once the whole cover is faded to
 * `opacity` over `shelf`, where the cover's white sheen (`sheen`, at its
 * strongest) lightens it most.
 */
export function fadedContrast(cover: string, ink: string, shelf: string, opacity = SUGGESTION_OPACITY, sheen = COVER_SHEEN): number {
  return contrastRatio(composite(ink, shelf, opacity), composite(composite('#ffffff', cover, sheen), shelf, opacity));
}

/**
 * The plain-cover colour for a suggested book: `cover` darkened towards black
 * in 2% steps (keeping its hue) until its faded title reads at 4.5:1 or more
 * under the full sheen over every reading light's shelf. A colour that
 * already does is kept.
 */
export function suggestionShade(cover: string, ink: string): string {
  const base = rgb(cover);
  for (let step = 0; step <= 50; step += 1) {
    const shade = toHex(base.map(value => value * (1 - step * 0.02)) as Rgb);
    if (Object.values(SHELF_BACKS).every(shelf => fadedContrast(shade, ink, shelf) >= MIN_TEXT_CONTRAST)) return shade;
  }
  return '#000000';
}

const SUGGESTION_PALETTES: readonly SpinePalette[] = PALETTES.map(palette => ({ ...palette, top: suggestionShade(palette.top, palette.ink) }));

/** A suggested book's palette: its usual colours, with the darker plain-cover shade. */
export function suggestionPalette(bookKey: string): SpinePalette {
  return SUGGESTION_PALETTES[paletteIndex(bookKey)];
}
