import type { CompanyId, PassiveId, Slot } from '../game/items';
import type { MoveId } from '../sim/moves';

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const SLOT_ICON: Record<Slot, string> = {
  head: svg('<rect x="5" y="4" width="14" height="13" rx="4"/><path d="M8 10h8"/><path d="M9 17v3M15 17v3"/><path d="M12 1.5V4"/>'),
  fist: svg('<path d="M7 11V7.5a1.5 1.5 0 0 1 3 0V10"/><path d="M10 9V6.5a1.5 1.5 0 0 1 3 0V10"/><path d="M13 9.5V7a1.5 1.5 0 0 1 3 0v3"/><path d="M16 10a1.5 1.5 0 0 1 3 0v3.5A6.5 6.5 0 0 1 12.5 20H11a5 5 0 0 1-5-5v-2.5a1.5 1.5 0 0 1 3 0"/>'),
  core: svg('<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
  chest: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 11h6M12 8v6"/>'),
  legs: svg('<path d="M8 3h8l-1 7h-6z"/><path d="M9 10l-1 6 0 5M15 10l1 6v5"/><path d="M6 21h4M14 21h4"/>'),
  kick: svg('<path d="M8 3v8l-3 5v3h9l6-2v-2l-7-2-1-10z"/><path d="M5 19h15"/>'),
};

/** Maker logos, drawn in the brand colour (currentColor). */
export const COMPANY_ICON: Record<CompanyId, string> = {
  // a horseshoe nailed on with rivets, an exhaust stack rising through it
  ironhorse: svg('<path d="M5.5 3.5v7.5a6.5 6.5 0 0 0 13 0V3.5" stroke-width="3"/><path d="M12 2v9"/><circle cx="5.5" cy="7" r=".9" fill="currentColor"/><circle cx="18.5" cy="7" r=".9" fill="currentColor"/><circle cx="7" cy="13.5" r=".9" fill="currentColor"/><circle cx="17" cy="13.5" r=".9" fill="currentColor"/>'),
  // one clean disc and the light inside it
  lumen: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/>'),
  // an engineered hexagon round a rising chevron
  longwei: svg('<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" fill="currentColor" fill-opacity=".18"/><path d="M7.5 14.5L12 10l4.5 4.5M9.5 18L12 15.5l2.5 2.5"/>'),
  // a forging hammer inside a laurel
  martelli: svg('<path d="M4.5 9.5c-1.2 4.4.6 8.6 4.8 10.8M19.5 9.5c1.2 4.4-.6 8.6-4.8 10.8"/><path d="M8 5.5h8v4H8z" fill="currentColor" fill-opacity=".45"/><path d="M12 9.5v10"/>'),
  // a crescent crest over a blade
  kensei: svg('<path d="M3.5 3.5c1.8 5.6 15.2 5.6 17 0"/><path d="M12 8.5V21.5"/><path d="M8 12.5h8"/><path d="M12 8.5l-1.6 2.4h3.2z" fill="currentColor"/>'),
  // a sawtooth flying wing seen from above
  strix: svg('<path d="M12 5l10 6.5-2.6 3-2.4-1.8-2.5 2.6L12 13l-2.5 2.3L7 12.7l-2.4 1.8L2 11.5z" fill="currentColor" fill-opacity=".18"/><path d="M12 5v8"/>'),
};

export const ICON = {
  home: svg('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M6 9.6V20h4.5v-5.5h3V20H18V9.6"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>', 'stroke-width="3"'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
  /** Two bots side by side (Tag Team). */
  team: svg('<rect x="3.5" y="5" width="6" height="5" rx="1.2"/><path d="M4.5 13.5h4M6.5 10v3.5M5 20l1.5-6.5L8 20"/><rect x="14.5" y="5" width="6" height="5" rx="1.2"/><path d="M15.5 13.5h4M17.5 10v3.5M16 20l1.5-6.5L19 20"/><path d="M10.5 7.5h3" stroke-dasharray="1 1.6"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>'),
  fullscreen: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  shrink: svg('<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'),
  gear: svg('<path d="M19.3 10.0L21.9 10.3L21.9 13.7L19.3 14.0L18.6 15.7L20.2 17.8L17.8 20.2L15.7 18.6L14.0 19.3L13.7 21.9L10.3 21.9L10.0 19.3L8.3 18.6L6.2 20.2L3.8 17.8L5.4 15.7L4.7 14.0L2.1 13.7L2.1 10.3L4.7 10.0L5.4 8.3L3.8 6.2L6.2 3.8L8.3 5.4L10.0 4.7L10.3 2.1L13.7 2.1L14.0 4.7L15.7 5.4L17.8 3.8L20.2 6.2L18.6 8.3z"/><circle cx="12" cy="12" r="3"/>'),
  wrench: svg('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
  swords: svg('<path d="M4 4l9 9M4 4h4M4 4v4"/><path d="M20 4l-9 9M20 4h-4M20 4v4"/><path d="M7 15l2 2-3 3-2-2zM17 15l-2 2 3 3 2-2z"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  fast: svg('<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  zoom: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M8 10.5h5M10.5 8v5"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  rotate: svg('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M2 14a10 10 0 0 0 7 7M22 10a10 10 0 0 0-7-7"/>'),
  shield: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>'),
  flame: svg('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 1 4 2 4 0-3-1-6 1-9z" fill="currentColor" stroke="none"/>'),
  heart: svg('<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="currentColor" stroke="none"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  scene: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="M3.5 17.5l5-5 3.5 3.5 3-3 5.5 5.5"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  exit: svg('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
  replay: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/><path d="M10 9l5 3-5 3z" fill="currentColor"/>'),
  forward: svg('<path d="M4 6l7 6-7 6z" fill="currentColor"/><path d="M12 6l7 6-7 6z" fill="currentColor"/>'),
  // replay transport: jump back / ahead five seconds, step a frame, start over
  back5: svg('<path d="M5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M5 4v4h4"/><text x="12.4" y="15.3" font-size="8.6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">5</text>'),
  ahead5: svg('<path d="M19 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19 4v4h-4"/><text x="11.6" y="15.3" font-size="8.6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif">5</text>'),
  stepBack: svg('<path d="M6 5v14"/><path d="M18 6l-8 6 8 6z" fill="currentColor"/>'),
  stepAhead: svg('<path d="M18 5v14"/><path d="M6 6l8 6-8 6z" fill="currentColor"/>'),
  restart: svg('<path d="M5 5v14"/><path d="M19 6l-9 6 9 6z" fill="currentColor"/>'),
  paint: svg('<path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12.4 14.2 9.8 11.6z"/><path d="M9.2 12.4c-2.2 0-3.9 1.6-3.9 3.7 0 1.5-.9 2.5-2.7 3.2 1.3 1.2 3 1.8 4.6 1.8 2.9 0 5.2-2.2 5.2-5.1z"/>'),
  size: svg('<path d="M4 20L20 4"/><path d="M14 4h6v6"/><path d="M10 20H4v-6"/>'),
  star: svg('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  cloud: svg('<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-.5 9.5z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  map: svg('<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  crown: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" fill-opacity=".2"/><path d="M5 21h14"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  // a credit chip: a coin with a bolt stamped in it
  coin: svg('<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="5.6"/><path d="M12.8 8.6l-2.4 3.7h3.2l-2.4 3.7"/>'),
  // the Parts Market: a shop awning over a counter
  market: svg('<path d="M4 9.5l1.5-5h13l1.5 5"/><path d="M4 9.5c0 1.4 1.2 2.3 2.7 2.3s2.6-.9 2.6-2.3c0 1.4 1.2 2.3 2.7 2.3s2.7-.9 2.7-2.3c0 1.4 1.1 2.3 2.6 2.3S20 10.9 20 9.5"/><path d="M5.5 12v8h13v-8M10 20v-4.5h4V20"/>'),
  // a crate with a band round it
  crate: svg('<path d="M3.5 8l8.5-4.5L20.5 8v8.5L12 21l-8.5-4.5z" fill="currentColor" fill-opacity=".14"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5V21"/><path d="M7.8 5.7l8.5 4.6"/>'),
  // a championship belt: the big plate and the strap
  belt: svg('<path d="M2 10.5h5M17 10.5h5M2 14h5M17 14h5"/><path d="M7 8.5a5 5 0 0 1 10 0v7a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="12.2" r="2.2"/>'),
  // a rank chevron stack
  rank: svg('<path d="M6 11l6-4 6 4M6 15.5l6-4 6 4M6 20l6-4 6 4"/>'),
};

// two-tone glyph: a soft filled body under crisp strokes
const T = 'fill="currentColor" fill-opacity=".22"';
const F = 'fill="currentColor" stroke="none"';

/** Special move glyphs: the strike itself, with motion lines. */
export const ABILITY_ICON: Partial<Record<MoveId, string>> = {
  // a looping overhand fist with a big swing arc
  haymaker: svg(`<path d="M3 15A10 10 0 0 1 17 4.5" stroke-dasharray="2 2.6"/><path d="M14.5 2.8l2.8 1.6-1.4 2.9"/><rect x="9" y="11" width="10" height="9" rx="3" ${T}/><path d="M12 11v3M15.5 11v3M9 15.5h3.5"/>`),
  // three stacked jabs, staggered
  flurry: svg(`<rect x="13" y="3.5" width="7" height="5" rx="2" ${T}/><rect x="15" y="9.5" width="7" height="5" rx="2" ${T}/><rect x="11" y="15.5" width="7" height="5" rx="2" ${T}/><path d="M2 6h8M5 12h7M2 18h6"/>`),
  // rising uppercut with an electric arc
  shockUpper: svg(`<rect x="7" y="13" width="9" height="8" rx="3" ${T}/><path d="M10 13v-2.5M13 13v-2.5"/><path d="M14 2l-3 4.5h4L12 11" stroke-width="2.2"/><path d="M4 9l2 1M20 6l-2 1.5"/>`),
  // a fist with a booster flame behind it
  rocketPunch: svg(`<rect x="11" y="7" width="10" height="10" rx="3" ${T}/><path d="M14.5 7v4M18 7v4M11 12.5h3"/><path d="M11 9.5H7.5M11 14.5H7.5"/><path d="M7.5 8.5L2 12l5.5 3.5c-1-2.3-1-4.7 0-7z" ${F} fill-opacity=".6"/>`),
  // double-handed smash coming down onto a crack
  hammer: svg(`<path d="M6 3h12v6.5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" ${T}/><path d="M10 3v4M14 3v4"/><path d="M12 13v3"/><path d="M3 21h18"/><path d="M12 21l-1.5-2.5L12 17l1.5 1.5"/><path d="M4 15l2 1M20 15l-2 1"/>`),
  // straight leg driving a foot forward
  pushKick: svg(`<path d="M3 15h10" stroke-width="3"/><path d="M13 9.5h4.5a2 2 0 0 1 2 2V19H13z" ${T}/><path d="M22 10v8"/><path d="M4 9h5M5 20h4"/>`),
  // round arc ending in a shin strike
  roundhouse: svg(`<path d="M4 17A9 9 0 1 1 18 5" stroke-dasharray="2 2.6"/><path d="M15 10l5-5" stroke-width="3"/><circle cx="19.5" cy="5" r="2.6" ${T}/><path d="M9 21l3-5"/>`),
  // a low scything leg over the floor
  sweep: svg(`<path d="M3 20h18"/><path d="M4 16c4-4 10-4 15-1" stroke-width="3"/><path d="M18 12l3 3-3.6 1.4" /><path d="M5 11c3-2 7-2.5 10-2" stroke-dasharray="1.5 2.5"/><circle cx="4.5" cy="16" r="2" ${T}/>`),
  // spiral of a spinning back kick
  spinKick: svg(`<path d="M12 12a2.5 2.5 0 1 1 2.5-2.5A5 5 0 0 1 9.5 15 7.5 7.5 0 0 1 4.5 7"/><path d="M8.5 4A9.5 9.5 0 0 1 21 13" stroke-width="2.6"/><path d="M21 8.5v4.5h-4.5"/>`),
  // jumping knee with lift lines
  flyingKnee: svg(`<path d="M6 13l6-6 6 6-6 6z" ${T}/><path d="M12 7v-4M8 3.5l1.5 2.5M16 3.5l-1.5 2.5"/><path d="M6 21l3-3M18 21l-3-3"/>`),
  lowKick: svg(`<path d="M3 20h18"/><path d="M3 13h10l5 4" stroke-width="3"/><path d="M15 9l3 3M19 9l-1 3"/><circle cx="18.5" cy="17.5" r="2" ${T}/>`),
};

/** Passive glyphs, one per passive effect. */
export const PASSIVE_ICON: Record<PassiveId, string> = {
  composure: svg(`<path d="M5 20V9a7 7 0 0 1 14 0v11" ${T}/><path d="M9 12l2 2 4-4"/><path d="M3 20h18"/>`),
  weakSpot: svg(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" ${F}/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>`),
  precog: svg(`<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" ${T}/><circle cx="12" cy="12" r="2.6" ${F}/><path d="M12 1.5V3.5M5 3.5l1 1.7M19 3.5l-1 1.7"/>`),
  ironChin: svg(`<path d="M6 4h12v8a6 6 0 0 1-12 0z" ${T}/><path d="M6 9h12"/><path d="M9 13.5h6"/><path d="M9 20l3 2 3-2"/>`),
  rage: svg(`<path d="M4 12l3-7 3 4 2-6 2 6 3-4 3 7-3 8H7z" ${T}/><path d="M9 14l2 1.5M15 14l-2 1.5M9.5 18h5"/>`),
  secondWind: svg(`<rect x="3" y="7" width="15" height="10" rx="2" ${T}/><path d="M21 10.5v3"/><path d="M11.5 8.5l-3 4h4l-3 4"/>`),
  overdrive: svg(`<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l5-7" stroke-width="2.4"/><circle cx="12" cy="17" r="1.8" ${F}/><path d="M16.5 7l1-1.5M19.5 11.5l1.5-.5"/>`),
  aegis: svg(`<path d="M12 2.5l8 3.5v5.5c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5V6z" ${T}/><path d="M12 7v10M7.5 11.5h9" stroke-width="1.4"/><circle cx="12" cy="11.5" r="2.5"/>`),
  siphon: svg(`<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z" ${T}/><path d="M12 10v7M8.5 13.5h7"/>`),
  static: svg(`<circle cx="12" cy="12" r="4.5" ${T}/><path d="M13 9.5l-2 3h2.5l-2 3"/><path d="M3 5l2.5 2.5-2 1 3 2.5M21 19l-2.5-2.5 2-1-3-2.5"/>`),
  plating: svg(`<path d="M4 5h16v14H4z" ${T}/><path d="M4 12h16M12 5v7M8 12v7M16 12v7"/><circle cx="6.5" cy="7.5" r=".9" ${F}/><circle cx="17.5" cy="7.5" r=".9" ${F}/>`),
  reactiveGuard: svg(`<path d="M3 9l5-5h8l5 5v9H3z" ${T}/><path d="M3 9h18"/><path d="M12 11v6M9 14l3 3 3-3"/>`),
  unstoppable: svg(`<path d="M3 8h8l4 4-4 4H3l4-4z" ${T}/><path d="M13 8h4l4 4-4 4h-4l4-4z" ${F}/>`),
  slipstream: svg(`<path d="M3 7c6 0 6 4 12 4h6M3 12h6M3 17c6 0 6-4 12-4h6"/><path d="M18 8.5l3 2.5-3 2.5"/>`),
  retaliate: svg(`<path d="M20 7H9a5 5 0 0 0 0 10h3"/><path d="M15 3l4 4-4 4"/><path d="M14 14l6 6M20 14l-6 6" stroke-width="2.2"/>`),
  footwork: svg(`<ellipse cx="12" cy="12" rx="9" ry="9" stroke-dasharray="3 3"/><path d="M8 8.5c0-2 1.5-3 2.5-3s1.5 1.2 1.5 2.5c0 2-1 2.5-1 4.5H8.5c0-1.6-.5-2.5-.5-4z" ${T}/><path d="M12.5 14c0-2 1.5-3 2.5-3s1.5 1.2 1.5 2.5c0 2-1 2.5-1 4.5H13c0-1.6-.5-2.5-.5-4z" ${T}/>`),
  lightFeet: svg(`<path d="M3 18c3.5 0 4-6 9-6h6.5a2.5 2.5 0 0 1 0 5H3z" ${T}/><path d="M6 8c2-2 4-2 6-1M10 4.5c2-1 4-1 5.5.5"/>`),
  rooted: svg(`<path d="M7 3h10v7H7z" ${T}/><path d="M12 10v5M12 15l-6 6M12 15l6 6M12 15v6M4 21h16"/>`),
  pistonDrive: svg(`<rect x="2" y="8" width="9" height="8" rx="1" ${T}/><path d="M11 12h7"/><path d="M18 6.5v11"/><path d="M21 9v6"/><path d="M5 8V5M8 8V5"/>`),
  afterimage: svg(`<circle cx="16" cy="12" r="5" ${T}/><circle cx="16" cy="12" r="5"/><path d="M8.5 7.5a5 5 0 0 0 0 9" opacity=".6"/><path d="M4 8.5a4 4 0 0 0 0 7" opacity=".35"/>`),
  heavyStrike: svg(`<path d="M7 3h10l2 8H5z" ${T}/><path d="M9.5 7h5"/><path d="M12 11v4"/><path d="M5 21l3-4 4 2 4-2 3 4"/>`),
  whiplash: svg(`<path d="M3 20C9 20 6 6 13 6c4 0 4 5 8 5"/><path d="M17.5 4l1.5 3M21.5 6.5l-2 1.5" stroke-width="1.5"/><circle cx="3" cy="20" r="1.6" ${F}/>`),
  trip: svg(`<path d="M2 18h20"/><circle cx="14" cy="8" r="3" ${T}/><path d="M12 11l-3 5M14 11l4 4"/><path d="M4 14.5c2-1 3.5-1 5 .5" stroke-dasharray="1.5 2"/>`),
  meteor: svg(`<circle cx="15" cy="9" r="5" ${T}/><path d="M11.3 12.7L3 21M9 10l-5 5M14 15l-5 5"/><path d="M13 7.5l2 1.5 2-1" stroke-width="1.4"/>`),
  afterburner: svg(`<path d="M10 7h9a3 3 0 0 1 0 6h-9z" ${T}/><path d="M10 7l-2 3 2 3"/><path d="M8 10H2M7 6.5l-3-1.5M7 13.5l-3 1.5"/><path d="M10 17h7" stroke-dasharray="2 2"/>`),
  bulwark: svg(`<path d="M3 4h18v6c0 6-5 9-9 11-4-2-9-5-9-11z" ${T}/><path d="M7 8h10M7 12h10M9 16h6"/>`),
  tailwind: svg(`<path d="M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h6"/>`),
  furnace: svg(`<path d="M4 8h16v13H4z" ${T}/><path d="M4 8l2-5h12l2 5"/><path d="M12 18c-2 0-3-1.2-3-2.6 0-1.6 1.5-2.4 2-4.4 1 1 1.2 2 1.2 2.6.6-.4 1-1 1-1.6 1.2 1 1.8 2 1.8 3.4 0 1.4-1 2.6-3 2.6z" ${F}/>`),
  shatter: svg(`<path d="M4 4h16v16H4z" ${T}/><path d="M12 4l-1 5 4 2-3 4 1 5M4 11l7-2M15 11l5 3"/>`),
  nanoRepair: svg(`<circle cx="12" cy="12" r="9" ${T}/><path d="M12 7.5v9M7.5 12h9" stroke-width="2.4"/><circle cx="5" cy="5" r="1" ${F}/><circle cx="19.5" cy="6" r=".9" ${F}/><circle cx="18" cy="19" r="1" ${F}/>`),
  iaido: svg(`<path d="M4 20L18 6c1.5-1.5 3-2 3.5-2.5-.5.5-1 2-2.5 3.5L5 21z" ${T}/><path d="M6.5 15.5l2 2M4 17.5l2.5 2.5"/><path d="M12 2.5v3M16.5 13.5h3" stroke-dasharray="1.5 1.5"/>`),
  // an engine block warming up: heat rising off it
  torque: svg(`<path d="M4 12h3l1.5-2h7l1.5 2h3v8H4z" ${T}/><path d="M8 15.5h8"/><path d="M8.5 7c-1-1.2 1-2.3 0-3.5M12 7c-1-1.2 1-2.3 0-3.5M15.5 7c-1-1.2 1-2.3 0-3.5"/>`),
};
