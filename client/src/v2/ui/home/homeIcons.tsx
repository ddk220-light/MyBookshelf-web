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
export function BookmarkGlyph({ size = 15, strokeWidth = 2.2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M7 4h10v16l-5-4-5 4z" /></svg>;
}
export function BackGlyph({ size = 18, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M15 5l-7 7 7 7" /></svg>;
}
export function CameraOffGlyph({ size = 30, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M4 8h3l2-3h6l2 3h3v11H4zM3 3l18 18" /><circle cx="12" cy="13" r="3.5" /></svg>;
}
export function LocateGlyph({ size = 20, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>;
}
export function PinGlyph({ size = 20, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
export function TickGlyph({ size = 20, strokeWidth = 2.4 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
export function PlusGlyph({ size = 20, strokeWidth = 2.2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M12 5v14M5 12h14" /></svg>;
}
export function ExternalGlyph({ size = 18, strokeWidth = 1.8 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M14 5h5v5M19 5l-8 8M11 7H6v11h11v-5" /></svg>;
}
export function FoundGlyph({ size = 18, strokeWidth = 2.4 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></svg>;
}
export function DashGlyph({ size = 18, strokeWidth = 2.4 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M7 12h10" /></svg>;
}
export function UnsureGlyph({ size = 18, strokeWidth = 2.2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" /></svg>;
}
export function RetryGlyph({ size = 20, strokeWidth = 2.2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M20 12a8 8 0 11-2.34-5.66" /><path d="M20 4v4.5h-4.5" /></svg>;
}
export function SpinnerGlyph({ size = 18, strokeWidth = 2.6 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><circle cx="12" cy="12" r="8" strokeOpacity=".25" /><path d="M12 4a8 8 0 018 8" /></svg>;
}
export function WarningGlyph({ size = 20, strokeWidth = 2 }: IconProps) {
  return <svg {...base(size)} strokeWidth={strokeWidth}><path d="M12 4l9 16H3zM12 10v4M12 17h.01" /></svg>;
}
