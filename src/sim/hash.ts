import type { Match } from './match';

/**
 * The sim's revision, for the online lobby's fingerprint (src/net/fingerprint.ts): bump it with
 * any change to how a fight plays out that its short fixed fight might never reach (a knockdown,
 * a knockout, a finisher), so players on different builds can't share a fight that would drift.
 */
export const SIM_REV = 4;

const buf = new DataView(new ArrayBuffer(8));
const PHASES = ['intro', 'countdown', 'greet', 'fight', 'ko', 'end'];

/**
 * 32-bit fingerprint of everything that decides how a fight goes: clock, random streams,
 * health, stamina, balance and every joint of both bodies, to the last bit. Two devices
 * running the same online fight compare these to catch the moment they drift apart.
 */
export function matchHash(m: Match): number {
  let h = 0x811c9dc5;
  const int = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  const num = (v: number) => {
    buf.setFloat64(0, v);
    int(buf.getInt32(0));
    int(buf.getInt32(4));
  };
  int(m.frame);
  num(m.time);
  num(m.clock);
  num(m.hitstop);
  int(PHASES.indexOf(m.phase));
  int(m.rng.state);
  for (const f of m.fighters) {
    int(f.rng.state);
    num(f.hp);
    num(f.stamina);
    num(f.poise);
    num(f.yaw);
    num(f.root.x);
    num(f.root.z);
    num(f.rootVel.x);
    num(f.rootVel.z);
    for (let i = 0; i < f.state.length; i++) int(f.state.charCodeAt(i));
    for (const p of f.body.pos) {
      num(p.x);
      num(p.y);
      num(p.z);
    }
  }
  for (const b of m.brains) {
    int(b.rng.state);
    int(b.coach ? b.coach.charCodeAt(0) + b.coach.length : 0);
    num(b.coachUntil);
  }
  // a tag team's partners, wherever they are, and who is legal
  const tag = m.tag;
  if (tag) {
    int(tag.rng.state);
    int(tag.legal[0] * 4 + tag.legal[1]);
    int(tag.paused ? 1 : 0);
    for (const mb of tag.members) {
      int(mb.status.charCodeAt(0) + mb.status.length * 31 + (mb.out ? 1000 : 0) + mb.spot * 2000);
      const f = mb.f;
      num(f.hp);
      num(f.root.x);
      num(f.root.z);
      for (const p of f.body.pos) {
        num(p.x);
        num(p.y);
        num(p.z);
      }
    }
  }
  return h >>> 0;
}
