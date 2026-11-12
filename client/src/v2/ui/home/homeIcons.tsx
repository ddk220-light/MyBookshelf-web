// Line icons drawn for the one-shelf boards (docs/design/2026-11-one-shelf).
// All are decorative: the control that holds one carries the name.
type IconProps = { size?: number; strokeWidth?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export function PersonIcon({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" /></svg>;
}
export function SearchGlyph({ size = 20, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
}
export function BarcodeGlyph({ size = 24, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M4 7V5h3M17 5h3v2M4 17v2h3M17 19h3v-2M8 9v6M10.5 9v6M13.5 9v6M16 9v6" /></svg>;
}
export function LibraryGlyph({ size = 15, strokeWidth = 2.2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5" /></svg>;
}
export function CloseGlyph({ size = 22, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M6 6l12 12M18 6L6 18" /></svg>;
}
export function ChevronGlyph({ size = 20, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M9 5l7 7-7 7" /></svg>;
}
export function ShelfViewGlyph({ size = 20, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M3 19h18M6 19V7h4v12M10 19V5h3v14M14.5 19l-1-11 3-.5L18 19" /></svg>;
}
export function ListViewGlyph({ size = 20, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" /></svg>;
}
