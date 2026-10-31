// Bucky mascot — canonical SIT pose, copied verbatim from design/bucky/bucky-sit.svg
// (v1.0, approved 2026-07-09). Geometry is the master file's; do not redraw or fork.
// Decorative on the web: always rendered aria-hidden next to real text.
export function BuckySit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M50 52 C63 52.5 67 57 67.5 68 C68 80 71 103.5 50 103.5 C29 103.5 32 80 32.5 68 C33 57 37 52.5 50 52 Z" fill="#211e1c" />
      <ellipse cx="29.5" cy="97.5" rx="4.8" ry="7.5" fill="#1a1715" transform="rotate(16 29.5 97.5)" />
      <ellipse cx="70.5" cy="97.5" rx="4.8" ry="7.5" fill="#1a1715" transform="rotate(-16 70.5 97.5)" />
      <g>
        <path d="M60 98 Q76 101 82.5 95.5 Q86.5 91 85.5 84" fill="none" stroke="#211e1c" strokeWidth="5.4" strokeLinecap="round" />
        <path d="M85.6 88.6 Q86.3 86.3 85.5 84.3" fill="none" stroke="#f2ece0" strokeWidth="4" strokeLinecap="round" />
      </g>
      <ellipse cx="35.5" cy="87" rx="7" ry="11.5" fill="#1a1715" transform="rotate(12 35.5 87)" />
      <ellipse cx="64.5" cy="87" rx="7" ry="11.5" fill="#1a1715" transform="rotate(-12 64.5 87)" />
      <path d="M50 66 C58 69 60.2 75 60 90 Q60.2 100 55.5 104 L44.5 104 Q39.8 100 40 90 C39.8 75 42 69 50 66 Z" fill="#f2ece0" />
      <path d="M48.9 91 h2.2 v13 h-2.2 Z" fill="#211e1c" opacity="0.85" />
      <ellipse cx="30.4" cy="104.8" rx="6" ry="3.8" fill="#ded5c3" transform="rotate(-16 30.4 104.8)" />
      <ellipse cx="69.6" cy="104.8" rx="6" ry="3.8" fill="#ded5c3" transform="rotate(16 69.6 104.8)" />
      <rect x="38.85" y="80.5" width="9" height="24.5" rx="4.5" fill="#ded5c3" />
      <rect x="52.15" y="80.5" width="9" height="24.5" rx="4.5" fill="#ded5c3" />
      <rect x="39.75" y="80" width="7.2" height="25.5" rx="3.6" fill="#f2ece0" />
      <rect x="53.05" y="80" width="7.2" height="25.5" rx="3.6" fill="#f2ece0" />
      <ellipse cx="41.2" cy="105.6" rx="5.8" ry="4.4" fill="#f2ece0" transform="rotate(-8 41.2 105.6)" />
      <ellipse cx="58.8" cy="105.6" rx="5.8" ry="4.4" fill="#f2ece0" transform="rotate(8 58.8 105.6)" />
      <g>
        <path d="M44.5 26.5 L26.4 4 Q24.2 2 23.5 4.6 Q20.5 18 30 31.5 Z" fill="#211e1c" stroke="#211e1c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M55.5 26.5 L73.6 4 Q75.8 2 76.5 4.6 Q79.5 18 70 31.5 Z" fill="#211e1c" stroke="#211e1c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M40 25 L30 12.5 Q27 20 33.5 28 Z" fill="#7a4a2c" opacity="0.6" />
        <path d="M60 25 L70 12.5 Q73 20 66.5 28 Z" fill="#7a4a2c" opacity="0.6" />
        <ellipse cx="50" cy="42" rx="22" ry="20.5" fill="#211e1c" />
        <ellipse cx="50" cy="53" rx="13.5" ry="12.5" fill="#f2ece0" />
        <path d="M45.2 41.2 Q50 39.6 54.8 41.2 Q53.4 47.4 50 47.4 Q46.6 47.4 45.2 41.2 Z" fill="#211e1c" />
        <ellipse cx="42" cy="32" rx="4.2" ry="2.5" fill="#b0703a" transform="rotate(-8 42 32)" />
        <ellipse cx="58" cy="32" rx="4.2" ry="2.5" fill="#b0703a" transform="rotate(8 58 32)" />
        <g>
          <circle cx="42" cy="38" r="4.5" fill="#0e0b0a" />
          <circle cx="58" cy="38" r="4.5" fill="#0e0b0a" />
          <circle cx="43.6" cy="36.2" r="1.6" fill="#f4efe4" />
          <circle cx="59.6" cy="36.2" r="1.6" fill="#f4efe4" />
        </g>
        <ellipse cx="50" cy="50.5" rx="6.6" ry="5" fill="#171310" />
        <circle cx="47.4" cy="48.4" r="1.05" fill="#f4efe4" opacity="0.32" />
        <path d="M50 55.5 v1.3" stroke="#6a5140" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M41.5 56.6 Q50 59 58.5 56.6 Q57.8 64.2 50 64.7 Q42.2 64.2 41.5 56.6 Z" fill="#211e1c" />
        <g>
          <path d="M44.8 59.9 Q50 58.9 55.2 59.9 Q55.2 64.2 50 64.6 Q44.8 64.2 44.8 59.9 Z" fill="#e28a8a" />
          <path d="M50 60.5 v3.3" stroke="#c56b6b" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

// Bucky mascot — canonical PEEK pose, copied verbatim from design/bucky/bucky-peek.svg
// (v1.0). Head + paws over an edge; the head group is the sit pose's head verbatim,
// shifted down 2 units. Geometry is the master file's; do not redraw or fork.
// Decorative on the web: always rendered aria-hidden next to real text.
export function BuckyPeek({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <ellipse cx="33" cy="63" rx="8" ry="5.5" fill="#f2ece0" />
      <ellipse cx="67" cy="63" rx="8" ry="5.5" fill="#f2ece0" />
      <g transform="translate(0,2)">
        <path d="M44.5 26.5 L26.4 4 Q24.2 2 23.5 4.6 Q20.5 18 30 31.5 Z" fill="#211e1c" stroke="#211e1c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M55.5 26.5 L73.6 4 Q75.8 2 76.5 4.6 Q79.5 18 70 31.5 Z" fill="#211e1c" stroke="#211e1c" strokeWidth="3" strokeLinejoin="round" />
        <path d="M40 25 L30 12.5 Q27 20 33.5 28 Z" fill="#7a4a2c" opacity="0.6" />
        <path d="M60 25 L70 12.5 Q73 20 66.5 28 Z" fill="#7a4a2c" opacity="0.6" />
        <ellipse cx="50" cy="42" rx="22" ry="20.5" fill="#211e1c" />
        <ellipse cx="50" cy="53" rx="13.5" ry="12.5" fill="#f2ece0" />
        <path d="M45.2 41.2 Q50 39.6 54.8 41.2 Q53.4 47.4 50 47.4 Q46.6 47.4 45.2 41.2 Z" fill="#211e1c" />
        <ellipse cx="42" cy="32" rx="4.2" ry="2.5" fill="#b0703a" transform="rotate(-8 42 32)" />
        <ellipse cx="58" cy="32" rx="4.2" ry="2.5" fill="#b0703a" transform="rotate(8 58 32)" />
        <g>
          <circle cx="42" cy="38" r="4.5" fill="#0e0b0a" />
          <circle cx="58" cy="38" r="4.5" fill="#0e0b0a" />
          <circle cx="43.6" cy="36.2" r="1.6" fill="#f4efe4" />
          <circle cx="59.6" cy="36.2" r="1.6" fill="#f4efe4" />
        </g>
        <ellipse cx="50" cy="50.5" rx="6.6" ry="5" fill="#171310" />
        <circle cx="47.4" cy="48.4" r="1.05" fill="#f4efe4" opacity="0.32" />
        <path d="M50 55.5 v1.3" stroke="#6a5140" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M41.5 56.6 Q50 59 58.5 56.6 Q57.8 64.2 50 64.7 Q42.2 64.2 41.5 56.6 Z" fill="#211e1c" />
        <g>
          <path d="M44.8 59.9 Q50 58.9 55.2 59.9 Q55.2 64.2 50 64.6 Q44.8 64.2 44.8 59.9 Z" fill="#e28a8a" />
          <path d="M50 60.5 v3.3" stroke="#c56b6b" strokeWidth="0.9" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
