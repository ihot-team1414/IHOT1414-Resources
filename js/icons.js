// Inline SVG icons and subteam illustrations.
// Everything is drawn with the brand palette through CSS classes
// (.il-*) so colors stay consistent. Edit shapes here; no image files needed.

const s = (body, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

export const icon = {
  chevronDown: s('<path d="m6 9 6 6 6-6"/>'),
  chevronRight: s('<path d="m9 6 6 6-6 6"/>'),
  arrowRight: s('<path class="arrow" d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowUp: s('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: s('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  burger: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  grip: s('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>', '0 0 24 24', 'fill="currentColor"'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  trash: s('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  check: s('<path d="m5 12 5 5 9-10"/>'),
  external: s('<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>'),
  link: s('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  text: s('<path d="M5 6h14M5 10h14M5 14h9M5 18h11"/>'),
  image: s('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>'),
  video: s('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
  youtube: s('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor"/>'),
  drive: s('<path d="M8.5 4h7l6 10.5-3.5 6H6L2.5 14.5 8.5 4Z"/><path d="M8.5 4 15 14.5H2.5M15.5 4 9 14.5M6 20.5l3-6M18 20.5l-3-6h6.5"/>'),
  pdf: s('<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5"/><path d="M9 17v-4h1.5a1.3 1.3 0 0 1 0 2.6H9M14 13v4h1a2 2 0 0 0 0-4h-1"/>'),
  doc: s('<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5M9 12h7M9 15.5h7M9 19h4"/>'),
  sheet: s('<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5M9 12h7v6H9zM9 15h7M12.5 12v6"/>'),
  slides: s('<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5"/><rect x="9" y="12" width="7" height="5" rx="1"/>'),
  file: s('<path d="M6 3h8l5 5v13H6V3Z"/><path d="M14 3v5h5"/>'),
  history: s('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  lock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  logout: s('<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>'),
  users: s('<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5 5"/>'),
  key: s('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  upload: s('<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v4h16v-4"/>'),
  download: s('<path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/>'),
  save: s('<path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
  undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  eye: s('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  folder: s('<path d="M3 6h6l2 2h10v11H3V6Z"/>'),
  mail: s('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  trophy: s('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>'),
  calendar: s('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  pin: s('<path d="M12 21s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>'),
  school: s('<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>'),
  instagram: s('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"/>'),
  x: s('<path d="M4 4l16 16M20 4 4 20" stroke-width="2.2"/>'),
  github: s('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'),
  youtubeSocial: s('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor"/>'),
  tba: s('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M12 9v7"/>'),
  chart: s('<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
  robot: s('<rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M3 13h2M19 13h2"/><circle cx="12" cy="3.5" r="1"/>'),
};

// Small 24px subteam icons for menus and chips.
export const subteamIcon = {
  programming: s('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  cad: s('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'),
  fabrication: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  electrical: s('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>'),
  operations: s('<path d="M3 11v2a2 2 0 0 0 2 2h1l4 4V5L6 9H5a2 2 0 0 0-2 2Z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>'),
  scouting: s('<circle cx="10" cy="10" r="6"/><path d="m20 20-5.5-5.5"/><path d="M7 11.5 9 9l2 2 2-3"/>'),
  default: s('<circle cx="12" cy="12" r="8"/>'),
};

// --- Large illustrations -------------------------------------------------
// Line-art on a 240x180 canvas. The "node" motif (circles joined by lines)
// echoes the IHOT logo mark.

function gearPath(cx, cy, rO, rI, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const w = step * 0.22;
    pts.push([a - step / 2 + w, rI], [a - w * 1.1, rO], [a + w * 1.1, rO], [a + step / 2 - w, rI]);
  }
  return 'M' + pts.map(([a, r]) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`).join(' L') + 'Z';
}

const il = (body) =>
  `<svg class="illustration" viewBox="0 0 240 180" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

const nodes = (pts, r = 5) =>
  pts.map(([x, y], i) => `<circle class="il-node${i === 0 ? ' il-node-accent' : ''}" cx="${x}" cy="${y}" r="${i === 0 ? r + 2 : r}"/>`).join('');

export const illustration = {
  programming: il(`
    <rect class="il-soft il-stroke" x="28" y="30" width="150" height="112" rx="12"/>
    <path class="il-stroke" d="M28 52h150"/>
    <circle class="il-dot" cx="42" cy="41" r="3"/><circle class="il-dot" cx="53" cy="41" r="3"/><circle class="il-dot" cx="64" cy="41" r="3"/>
    <path class="il-accent-stroke" d="M44 70h34"/><path class="il-stroke-2" d="M86 70h44"/>
    <path class="il-stroke-2" d="M56 84h28"/><path class="il-accent-stroke" d="M92 84h22"/>
    <path class="il-stroke-2" d="M56 98h52"/>
    <path class="il-stroke-2" d="M44 112h20"/><path class="il-accent-stroke" d="M72 112h40"/>
    <path class="il-stroke-2" d="M44 126h30"/>
    <path class="il-white" d="m132 104-10 10 10 10M152 104l10 10-10 10M146 100l-8 28"/>
    <path class="il-link" d="M196 52 212 84 190 120M212 84l14 6"/>
    ${nodes([[212, 84], [196, 52], [190, 120], [226, 90]])}
  `),
  cad: il(`
    <path class="il-soft il-stroke" d="m108 34 56 30v62l-56 30-56-30V64l56-30Z"/>
    <path class="il-stroke" d="m52 64 56 30 56-30M108 94v62"/>
    <path class="il-dash" d="m108 34v30M52 126l28-14M164 126l-28-14"/>
    <ellipse class="il-accent-fill" cx="136" cy="96" rx="9" ry="13" transform="rotate(-28 136 96)"/>
    <path class="il-dim" d="M40 70v60M36 70h8M36 130h8M52 164l56 0M52 160v8M108 160v8"/>
    <path class="il-white" d="M190 118v34l9-9 7 13 6-3-7-13h12l-27-22Z"/>
    <path class="il-link" d="M196 40 214 58 196 76"/>
    ${nodes([[214, 58], [196, 40], [196, 76]], 4)}
  `),
  fabrication: il(`
    <path class="il-soft il-stroke" d="${gearPath(98, 92, 58, 46, 12)}"/>
    <circle class="il-stroke" cx="98" cy="92" r="20"/>
    <circle class="il-accent-fill" cx="98" cy="92" r="8"/>
    <path class="il-soft il-white" d="M150 44a18 18 0 0 0-22 24l-38 38a8 8 0 0 0 11 11l38-38a18 18 0 0 0 24-22l-11 11-11-3-3-11 12-10Z" transform="translate(40 18) rotate(8 150 80)"/>
    <path class="il-spark" d="M196 36l8-8M206 50h10M186 26v-10"/>
    <path class="il-link" d="M30 150 58 138 44 116"/>
    ${nodes([[58, 138], [30, 150], [44, 116]], 4)}
  `),
  electrical: il(`
    <rect class="il-soft il-stroke" x="34" y="36" width="172" height="108" rx="12"/>
    <path class="il-trace" d="M60 60h40l12 12h28M60 88h24l10-10h26M60 120h52l14-14h40M150 60h32v28M140 120v14"/>
    <circle class="il-pad" cx="60" cy="60" r="5"/><circle class="il-pad" cx="60" cy="88" r="5"/><circle class="il-pad" cx="60" cy="120" r="5"/>
    <circle class="il-pad" cx="182" cy="88" r="5"/><circle class="il-pad" cx="140" cy="134" r="5"/>
    <rect class="il-chip" x="120" y="66" width="30" height="30" rx="4"/>
    <path class="il-stroke-2" d="M126 66v-6M134 66v-6M142 66v-6M126 96v6M134 96v6M142 96v6"/>
    <path class="il-accent-fill il-white" d="M190 20 172 50h14l-6 26 22-34h-15l9-22h-6Z"/>
  `),
  operations: il(`
    <rect class="il-soft il-stroke" x="30" y="30" width="126" height="94" rx="10"/>
    <path class="il-stroke" d="M93 124v24M74 150h38"/>
    <path class="il-stroke-2" d="M48 106V84M70 106V74M92 106V90M114 106V62"/>
    <rect class="il-accent-fill" x="128" y="48" width="12" height="58" rx="3"/>
    <path class="il-white" d="M46 70 72 58l22 12 34-26"/>
    <path class="il-link" d="M186 60 210 88 180 118M210 88l14 30"/>
    ${nodes([[210, 88], [186, 60], [180, 118], [224, 118]])}
  `),
  scouting: il(`
    <rect class="il-soft il-stroke" x="30" y="26" width="112" height="136" rx="14"/>
    <path class="il-stroke-2" d="M48 50h60M48 66h44"/>
    <rect class="il-stroke-2" x="48" y="82" width="76" height="18" rx="4"/>
    <rect class="il-accent-fill" x="48" y="82" width="46" height="18" rx="4"/>
    <rect class="il-stroke-2" x="48" y="110" width="76" height="18" rx="4"/>
    <rect class="il-accent-fill" x="48" y="110" width="62" height="18" rx="4"/>
    <path class="il-stroke-2" d="M48 142h36"/>
    <circle class="il-soft il-white" cx="172" cy="86" r="34"/>
    <path class="il-white" d="m196 110 26 26"/>
    <path class="il-trace" d="M152 96l12-12 10 8 16-18"/>
  `),
  default: il(`
    <circle class="il-soft il-stroke" cx="120" cy="90" r="56"/>
    <path class="il-link" d="M120 90 150 60M120 90 80 104M120 90l24 36"/>
    ${nodes([[120, 90], [150, 60], [80, 104], [144, 126]])}
  `),
};

export function getIllustration(key) {
  return illustration[key] || illustration.default;
}
export function getSubteamIcon(key) {
  return subteamIcon[key] || subteamIcon.default;
}
