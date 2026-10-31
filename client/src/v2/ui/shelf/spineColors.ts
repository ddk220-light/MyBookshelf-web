// client/src/v2/ui/shelf/spineColors.ts — deterministic spine colors per book.
// Palettes drawn from the native shelf look: mahogany, forest, navy, plum, gold, slate.
// Ink is checked against the LIGHTEST (top) stop, which is the worst case for light ink.
const PALETTES = [
  { top: '#7a2f28', bottom: '#43191a', ink: '#f6ead3' }, // 7.78:1 at top
  { top: '#43664b', bottom: '#2f5340', ink: '#eef6ee' }, // 5.88:1 at top — was #4f7d5b = 4.31:1
  { top: '#3e5570', bottom: '#26374b', ink: '#e8eef4' }, // 6.56:1 at top
  { top: '#6d4467', bottom: '#462a42', ink: '#f2e8f0' }, // 6.58:1 at top
  { top: '#8a6a1e', bottom: '#6b5214', ink: '#fdf6e3' }, // 4.68:1 at top — was #b98f4e = 2.74:1
  { top: '#6f6a5e', bottom: '#4a463d', ink: '#efece4' }, // 4.56:1 at top — thinnest margin, never lighten
];

export function spinePalette(bookKey: string) {
  let hash = 0;
  for (let i = 0; i < bookKey.length; i += 1) hash = (hash * 31 + bookKey.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}
