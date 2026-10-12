import type { Slot } from '../game/items';
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

export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>', 'stroke-width="3"'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>'),
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
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9s1.3-6.3 3.8-9z"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  share: svg('<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'),
  exit: svg('<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
  paint: svg('<path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12.4 14.2 9.8 11.6z"/><path d="M9.2 12.4c-2.2 0-3.9 1.6-3.9 3.7 0 1.5-.9 2.5-2.7 3.2 1.3 1.2 3 1.8 4.6 1.8 2.9 0 5.2-2.2 5.2-5.1z"/>'),
  star: svg('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
};

/** Ability glyphs (small, filled). */
export const ABILITY_ICON: Partial<Record<MoveId, string>> = {
  haymaker: svg('<path d="M5 13a7 7 0 0 1 14 0" /><path d="M12 6v-4M7 8L4 5M17 8l3-3"/><circle cx="12" cy="15" r="4" fill="currentColor"/>'),
  flurry: svg('<path d="M4 7h10M4 12h14M4 17h10"/><path d="M15 5l4 2-4 2M17 15l4 2-4 2"/>'),
  shockUpper: ICON.bolt,
  rocketPunch: svg('<path d="M5 19l4-4M14 4c4 0 6 2 6 6l-7 7-6-6z"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M7 13l-3 1 2 2M11 17l-1 3-2-2"/>'),
  hammer: svg('<path d="M5 9l6-6 4 4-6 6z" fill="currentColor"/><path d="M11 11l9 9"/>'),
  pushKick: svg('<path d="M3 12h11l3-3v6l-3-3"/><path d="M18 6v12"/>'),
  roundhouse: svg('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M17 2v4h-4"/>'),
  sweep: svg('<path d="M3 18c5 0 7-4 9-4s4 4 9 4"/><path d="M3 21h18"/>'),
  spinKick: svg('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'),
  flyingKnee: ICON.flame,
};
