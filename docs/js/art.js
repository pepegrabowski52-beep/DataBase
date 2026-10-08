/* Fundus – Symbole und Produkt-Illustrationen.
 * Stellt bereit: Fundus.icons, Fundus.ic(name), Fundus.art.{ART, PIC_NAMES, SWATCHES, svg(p), safeImg(url)}
 */
(() => {
'use strict';
const F = window.Fundus = window.Fundus || {};

/* ---------- Icons (24 × 24, Linien) ---------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20.5" r="1.2"/><circle cx="17" cy="20.5" r="1.2"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-9A4.9 4.9 0 0 1 12 6.3 4.9 4.9 0 0 1 21.2 11C19 15.6 12 20 12 20z"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19.5h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  truck: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3.5 3.5v3h-7.5"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  return: '<path d="M9 13 4 8l5-5"/><path d="M4 8h10a6 6 0 0 1 0 12h-3"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  store: '<path d="M4 9 5.5 4h13L20 9"/><path d="M4 9h16v1.5a3 3 0 0 1-5.4 1.8A3 3 0 0 1 12 13.6a3 3 0 0 1-2.6-1.3A3 3 0 0 1 4 10.5z"/><path d="M5.5 13.5V20h13v-6.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10.5H5.5V21h13V10.5H17"/>',
  addsq: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  dots: '<circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 7v6.5m0 0 2.5-2.5M12 13.5 9.5 11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.6-3.6 4.6-5.5 8-5.5s6.4 1.9 8 5.5"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.2c1.6.7 2.8 2.3 3.5 4.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  upload: '<path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5M5 19.5h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v7M9.7 10v7M14.3 10v7M19 10v7M3 20h18"/>',
  arrowRight: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  arrowLeft: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17v.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'
};
F.icons = ICONS;
F.ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ''}</svg>`;

/* ---------- Produkt-Illustrationen (200 × 200) ---------- */
const SH = '<ellipse cx="100" cy="171" rx="56" ry="7" fill="#000" opacity=".09"/>';
const loop = (from, to, step, fn) => { let s = ''; for (let i = from; i <= to; i += step) s += fn(i); return s; };
const ART = {
  mug: (c, d) => `${SH}<path d="M136 86h8a17 17 0 0 1 0 34h-8" fill="none" stroke="${c}" stroke-width="10"/><path d="M58 66h80v66a28 28 0 0 1-28 28H86a28 28 0 0 1-28-28z" fill="${c}"/><path d="M58 66h80v22c-8 0-8 10-16 10s-8-8-16-8-8 12-16 12-8-10-16-10-8 6-16 6z" fill="${d}"/><ellipse cx="98" cy="66" rx="40" ry="7" fill="${d}"/><ellipse cx="98" cy="66" rx="34" ry="4.5" fill="#5A3B22" opacity=".85"/><path d="M84 50q-6-7 0-14t0-14M106 52q-6-7 0-14t0-14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".75"/>`,
  headphones: (c, d) => `${SH}<path d="M52 118V98a48 48 0 0 1 96 0v20" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round"/><rect x="34" y="100" width="34" height="58" rx="16" fill="${c}"/><rect x="132" y="100" width="34" height="58" rx="16" fill="${c}"/><rect x="62" y="108" width="12" height="42" rx="6" fill="${d}"/><rect x="126" y="108" width="12" height="42" rx="6" fill="${d}"/><rect x="42" y="112" width="6" height="30" rx="3" fill="#fff" opacity=".2"/>`,
  candle: (c, d) => `${SH}<rect x="64" y="76" width="72" height="90" rx="14" fill="${c}"/><rect x="68" y="80" width="64" height="8" rx="4" fill="#fff" opacity=".25"/><rect x="64" y="106" width="72" height="36" fill="${d}"/><rect x="80" y="117" width="40" height="5" rx="2.5" fill="${c}" opacity=".75"/><rect x="88" y="127" width="24" height="4" rx="2" fill="${c}" opacity=".45"/><path d="M100 78V66" stroke="#3B2A1A" stroke-width="3" stroke-linecap="round"/><path d="M100 36c11 13 11 22 0 30-11-8-11-17 0-30z" fill="#F59E2E"/><path d="M100 48c5 7 5 11 0 15-5-4-5-8 0-15z" fill="#FFE39A"/>`,
  plant: (c, d) => `${SH}<path d="M100 118V62M100 118 76 84M100 118l26-30M100 118 66 104M100 118l36-12" stroke="${d}" stroke-width="4" stroke-linecap="round"/><g fill="${d}"><ellipse cx="100" cy="56" rx="15" ry="27"/><ellipse cx="72" cy="78" rx="25" ry="14" transform="rotate(-38 72 78)"/><ellipse cx="130" cy="80" rx="26" ry="14" transform="rotate(34 130 80)"/><ellipse cx="60" cy="102" rx="20" ry="10" transform="rotate(-12 60 102)"/><ellipse cx="140" cy="104" rx="20" ry="10" transform="rotate(12 140 104)"/></g><path d="M100 38v34M62 68l18 14M138 70l-18 12" stroke="#fff" stroke-width="2.5" opacity=".3" stroke-linecap="round"/><path d="M68 124h64l-8 42H76z" fill="${c}"/><rect x="62" y="114" width="76" height="14" rx="5" fill="${c}"/><rect x="62" y="124" width="76" height="4" fill="#000" opacity=".08"/>`,
  backpack: (c, d) => `${SH}<rect x="60" y="52" width="80" height="114" rx="24" fill="${c}"/><rect x="66" y="40" width="68" height="26" rx="10" fill="${d}"/><rect x="66" y="58" width="68" height="5" fill="#000" opacity=".12"/><rect x="95" y="40" width="10" height="46" rx="3" fill="${d}"/><rect x="92" y="80" width="16" height="10" rx="2" fill="#1D1D1D" opacity=".55"/><rect x="72" y="112" width="56" height="44" rx="12" fill="${d}"/><path d="M80 124h40" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/>`,
  necklace: (c, d) => `${SH}<path d="M50 34c4 52 28 76 50 80 22-4 46-28 50-80" fill="none" stroke="${c}" stroke-width="3.5" stroke-dasharray="3 3.5" stroke-linecap="round"/><rect x="96" y="110" width="8" height="12" rx="3" fill="${c}"/><circle cx="100" cy="138" r="20" fill="${c}"/><circle cx="100" cy="138" r="14" fill="${d}"/><circle cx="94" cy="132" r="4" fill="#fff" opacity=".85"/><path d="M106 129a10 10 0 1 0 5 15 12 12 0 0 1-5-15z" fill="#fff" opacity=".35"/>`,
  book: (c, d) => `${SH}<rect x="70" y="44" width="72" height="120" rx="3" fill="#F3EEE3"/><rect x="62" y="40" width="74" height="122" rx="4" fill="${c}"/><rect x="62" y="40" width="9" height="122" rx="3" fill="#000" opacity=".18"/><rect x="82" y="60" width="42" height="5" rx="2.5" fill="${d}"/><rect x="82" y="70" width="30" height="4" rx="2" fill="${d}" opacity=".7"/><g fill="${d}"><circle cx="92" cy="120" r="9"/><circle cx="104" cy="113" r="12"/><circle cx="117" cy="121" r="8"/><rect x="88" y="120" width="32" height="9" rx="4.5"/></g><rect x="82" y="142" width="22" height="3" rx="1.5" fill="${d}" opacity=".6"/>`,
  lamp: (c, d) => `${SH}<ellipse cx="100" cy="100" rx="46" ry="8" fill="#FFE7A0" opacity=".55"/><rect x="97" y="92" width="6" height="66" rx="3" fill="${d}"/><ellipse cx="100" cy="162" rx="30" ry="7" fill="${d}"/><path d="M72 46h56l18 50H54z" fill="${c}"/><path d="M72 46h56l3 8H69z" fill="#000" opacity=".07"/><path d="M86 46l-6 50M100 46v50M114 46l6 50" stroke="#000" stroke-width="1.2" opacity=".06"/>`,
  sneaker: (c, d) => `${SH}<path d="M38 138c0-20 12-34 26-38l26-10c8 16 22 22 36 22l24 4c12 2 20 10 20 22z" fill="${c}"/><path d="M38 138c0-16 6-28 16-34l4 34z" fill="${d}"/><path d="M84 98l8 10M94 94l8 10M104 92l6 10" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M68 126h70" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/><path d="M34 138h138a6 6 0 0 1 0 12H40a6 6 0 0 1-6-6z" fill="#F7F5F0"/><path d="M36 146h140" stroke="#000" opacity=".08" stroke-width="3"/>`,
  watch: (c, d) => `${SH}<rect x="80" y="30" width="40" height="140" rx="14" fill="${c}"/><rect x="80" y="44" width="40" height="3" fill="#000" opacity=".12"/><rect x="80" y="153" width="40" height="3" fill="#000" opacity=".12"/><rect x="62" y="62" width="76" height="84" rx="22" fill="#2B302E"/><rect x="138" y="90" width="6" height="18" rx="2" fill="#2B302E"/><rect x="70" y="70" width="60" height="68" rx="16" fill="#0D1311"/><circle cx="100" cy="104" r="20" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5"/><circle cx="100" cy="104" r="20" fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round" stroke-dasharray="88 126" transform="rotate(-90 100 104)"/><rect x="92" y="100" width="16" height="4" rx="2" fill="#fff" opacity=".85"/><rect x="95" y="108" width="10" height="3" rx="1.5" fill="#fff" opacity=".5"/>`,
  beanie: (c, d) => `${SH}<circle cx="100" cy="50" r="17" fill="${d}"/><path d="M54 132c0-50 22-72 46-72s46 22 46 72z" fill="${c}"/><path d="M70 92${loop(0, 9, 1, () => 'l3 5 3-5')}M64 108${loop(0, 11, 1, () => 'l3 5 3-5')}" fill="none" stroke="${d}" stroke-width="2" opacity=".5" stroke-linejoin="round"/><rect x="48" y="124" width="104" height="34" rx="10" fill="${c}"/><rect x="48" y="124" width="104" height="34" rx="10" fill="#000" opacity=".1"/><path d="${loop(58, 142, 8, x => `M${x} 129v24`)}" stroke="#000" stroke-width="2" opacity=".12"/>`,
  teapot: (c, d) => `${SH}<path d="M68 96c0-48 64-48 64 0" fill="none" stroke="${d}" stroke-width="5"/><path d="M60 112c-16-4-22-20-30-30l8-5c8 10 14 20 26 24z" fill="${c}"/><ellipse cx="100" cy="122" rx="46" ry="40" fill="${c}"/><ellipse cx="100" cy="86" rx="26" ry="7" fill="${c}"/><ellipse cx="100" cy="86" rx="26" ry="7" fill="#fff" opacity=".1"/><circle cx="100" cy="76" r="7" fill="${d}"/><g fill="${d}" opacity=".5">${[104, 118, 132, 146].map((y, i) => loop(64, 136, 12, x => { const cx = x + (i % 2 ? 6 : 0); return ((cx - 100) / 40) ** 2 + ((y - 122) / 34) ** 2 < 1 ? `<circle cx="${cx}" cy="${y}" r="3"/>` : ''; })).join('')}</g>`,
  speaker: (c, d) => `${SH}<path d="M78 64c0-22 44-22 44 0" fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round"/><rect x="54" y="60" width="92" height="104" rx="30" fill="${c}"/><circle cx="100" cy="114" r="32" fill="${d}"/><circle cx="100" cy="114" r="24" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/><circle cx="100" cy="114" r="12" fill="${c}" opacity=".7"/><rect x="82" y="69" width="10" height="4" rx="2" fill="#fff" opacity=".5"/><rect x="108" y="69" width="10" height="4" rx="2" fill="#fff" opacity=".5"/>`,
  bowl: (c, d) => `${SH}<ellipse cx="100" cy="102" rx="62" ry="10" fill="${d}"/><ellipse cx="100" cy="102" rx="56" ry="7" fill="#000" opacity=".2"/><g fill="#6FA35A"><ellipse cx="80" cy="96" rx="17" ry="8" transform="rotate(-20 80 96)"/><ellipse cx="116" cy="94" rx="18" ry="9" transform="rotate(16 116 94)"/><ellipse cx="98" cy="90" rx="10" ry="6"/></g><circle cx="102" cy="98" r="7" fill="#C8432F"/><path d="M38 102a62 10 0 0 0 124 0a62 56 0 0 1-124 0z" fill="${c}"/><path d="M52 124c30 14 66 14 96 0M64 142c22 10 50 10 72 0" fill="none" stroke="${d}" stroke-width="2.5" opacity=".6" stroke-linecap="round"/>`,
  train: (c, d) => `${SH}<rect x="30" y="152" width="140" height="4" rx="2" fill="#8A6A4A" opacity=".45"/><rect x="102" y="126" width="16" height="5" fill="#6B4A2F"/><rect x="40" y="98" width="64" height="40" rx="6" fill="${c}"/><rect x="78" y="70" width="30" height="46" rx="5" fill="${c}"/><rect x="74" y="64" width="38" height="10" rx="3" fill="${d}"/><rect x="85" y="80" width="16" height="14" rx="2" fill="#fff" opacity=".75"/><rect x="50" y="80" width="12" height="20" rx="2" fill="${d}"/><rect x="47" y="76" width="18" height="6" rx="2" fill="${d}"/><rect x="116" y="104" width="46" height="34" rx="6" fill="${d}"/><rect x="122" y="96" width="34" height="10" rx="3" fill="#E9C46A"/><g fill="#3A2E25"><circle cx="56" cy="142" r="10"/><circle cx="88" cy="142" r="10"/><circle cx="128" cy="142" r="9"/><circle cx="150" cy="142" r="9"/></g><g fill="#E9DCC6"><circle cx="56" cy="142" r="3"/><circle cx="88" cy="142" r="3"/><circle cx="128" cy="142" r="3"/><circle cx="150" cy="142" r="3"/></g>`,
  ereader: (c, d) => `${SH}<rect x="58" y="34" width="84" height="132" rx="12" fill="${c}"/><rect x="66" y="44" width="68" height="102" rx="3" fill="${d}"/><g fill="#4A4338" opacity=".35">${loop(56, 132, 8, y => `<rect x="74" y="${y}" width="${y === 56 ? 30 : y % 24 === 8 ? 38 : 52}" height="3" rx="1.5"/>`)}</g><circle cx="100" cy="156" r="3.5" fill="#fff" opacity=".25"/>`,
  can: (c, d) => `${SH}<path d="M134 96c26-2 28 46 4 52" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/><path d="M76 124 40 82l8-7 38 40z" fill="${c}"/><rect x="26" y="66" width="26" height="14" rx="4" fill="${d}" transform="rotate(-42 39 73)"/><path d="M84 90c0-34 44-34 44 0" fill="none" stroke="${c}" stroke-width="7"/><rect x="72" y="88" width="64" height="76" rx="8" fill="${c}"/><rect x="72" y="100" width="64" height="5" fill="${d}"/><rect x="72" y="148" width="64" height="5" fill="${d}"/><rect x="80" y="110" width="6" height="32" rx="3" fill="#fff" opacity=".28"/>`,
  linen: (c, d) => `${SH}<rect x="44" y="128" width="112" height="30" rx="6" fill="${c}"/><rect x="50" y="102" width="100" height="30" rx="6" fill="${d}"/><rect x="56" y="76" width="88" height="30" rx="6" fill="${c}"/><g fill="#fff" opacity=".5"><rect x="44" y="140" width="112" height="3"/><rect x="56" y="88" width="88" height="3"/></g><rect x="50" y="114" width="100" height="3" fill="${c}" opacity=".6"/><path d="M44 154h112M50 128h100M56 102h88" stroke="#000" opacity=".08" stroke-width="3"/>`
};
const PIC_NAMES = { mug: 'Tasse', headphones: 'Kopfhörer', candle: 'Kerze', plant: 'Pflanze', backpack: 'Rucksack', necklace: 'Schmuck', book: 'Buch', lamp: 'Lampe', sneaker: 'Schuh', watch: 'Uhr', beanie: 'Mütze', teapot: 'Teekanne', speaker: 'Lautsprecher', bowl: 'Schale', train: 'Spielzeug', ereader: 'E-Reader', can: 'Gießkanne', linen: 'Textil' };
const SWATCHES = [
  { name: 'Moos', c: '#5E7F5B', d: '#D9CBB0', tint: '#E5EEDD' },
  { name: 'Ziegel', c: '#C4572F', d: '#8E3B1E', tint: '#F6E3D9' },
  { name: 'Nachtblau', c: '#2D4D7A', d: '#F1D9A7', tint: '#E1E8F2' },
  { name: 'Senf', c: '#C9A227', d: '#F2EDE2', tint: '#F5EED8' },
  { name: 'Taube', c: '#7E9AB0', d: '#E8E1D3', tint: '#E5EAF0' },
  { name: 'Olive', c: '#B48252', d: '#8A5A30', tint: '#F2E6D8' }
];

// Nur Bilder als data:-URL oder über https zulassen
const safeImg = url => {
  const u = String(url || '').trim();
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(u) || /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : '';
};
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Produktbild: Foto, falls vorhanden, sonst Illustration
const svg = p => {
  const img = safeImg(p && p.img);
  if (img) return `<img class="pimg" src="${escAttr(img)}" alt="" loading="lazy" decoding="async">`;
  return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">${(ART[p && p.pic] || ART.linen)(p && p.c || '#7E9AB0', p && p.d || '#E8E1D3')}</svg>`;
};

F.art = { ART, PIC_NAMES, SWATCHES, svg, safeImg };
})();
