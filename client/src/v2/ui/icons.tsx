// client/src/v2/ui/icons.tsx — native tab glyphs (books.vertical.fill,
// barcode.viewfinder, slider.horizontal.3) redrawn as minimal inline SVG.
const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true as const, focusable: false as const };

export function SearchIcon() {
  return <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}
export function LibraryIcon() {
  return <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8 9-5 9 5H3ZM5 10v8m7-8v8m7-8v8M3 21h18" /></svg>;
}
export function OpenBookIcon() {
  return <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1V6Z" /></svg>;
}

export function ShelfIcon() {
  return <svg {...iconProps}><g fill="currentColor"><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="M15.2 5.3a1 1 0 0 1 1.2-.8l2.9.7a1 1 0 0 1 .8 1.2l-3 12.6a1 1 0 0 1-1.2.8l-2.9-.7a1 1 0 0 1-.8-1.2Z" /></g></svg>;
}


export function BookmarkIcon() {
  return <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M6 3h12v19l-6-4-6 4Z" /></svg>;
}
export function ExternalLinkIcon() {
  return <svg {...iconProps} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h7v7M13 3 3 13"/></svg>;
}
