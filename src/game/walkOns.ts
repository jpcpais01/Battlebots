/** The walk-on themes a bot can pick (their music is synthesized in src/audio/walkOn.ts). */

export interface WalkOnInfo {
  id: string;
  name: string;
  blurb: string;
}

export const WALK_ONS: readonly WalkOnInfo[] = [
  { id: 'anthem', name: 'Steel Anthem', blurb: 'Stomp, stomp, clap, then double-tracked guitars and a screaming lead. Stadium rock.' },
  { id: 'neon', name: 'Neon Drive', blurb: 'Synthwave: a gated pad, a racing arpeggio and a singing lead over a four-on-the-floor kick.' },
  { id: 'forge', name: 'Iron Forge', blurb: 'Industrial: anvils, a klaxon, a gated bass riff and drums hit through a wall of distortion.' },
  { id: 'drop', name: 'Bass Drop', blurb: 'Trap: a snare roll, a breath, then sliding 808s, rattling hats and brass that shakes the seats.' },
  { id: 'fanfare', name: "Champion's Call", blurb: 'A full brass fanfare with timpani, strings, chimes and a military snare.' },
  { id: 'arcade', name: 'Arcade Boss', blurb: 'Chiptune at 177 BPM: pulse leads, arpeggio chords and a triangle bass. Bright and a little bit evil.' },
];
const IDS = new Set(WALK_ONS.map((w) => w.id));
export const WALK_ON_NAME: Record<string, string> = Object.fromEntries(WALK_ONS.map((w) => [w.id, w.name]));

/** A bot's theme: its own pick, or one that always goes with its name. */
export function walkOnFor(spec: { name: string; walkOn?: string }): string {
  if (spec.walkOn && IDS.has(spec.walkOn)) return spec.walkOn;
  let h = 2166136261;
  for (let i = 0; i < spec.name.length; i++) h = Math.imul(h ^ spec.name.charCodeAt(i), 16777619);
  return WALK_ONS[(h >>> 0) % WALK_ONS.length].id;
}
