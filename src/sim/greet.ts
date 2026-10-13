import { J } from './body';
import { BUMP_CONTACT } from './emote';
import type { Match } from './match';
import { clamp } from './math';
import { DM } from './dmath';

/** Root-to-root distance the fighters touch gloves at. */
const BUMP_D = 1.45;
/** How far apart they back off before the fight proper. */
const BACK_D = 2.4;

/**
 * Touching gloves, between "FIGHT!" and the first exchange: both fighters walk to the
 * centre with their hands low, bump fists (the Showmen perform it, in step), step back
 * into their guards, and only then do the brains take over. Runs in the match's 'greet'
 * phase, in place of the brains, and like them only steers (intentVel, guardDrop).
 */
export class Greeting {
  private t = 0;
  /** When the bump started (-1: still walking in). */
  private bumpAt = -1;
  done = false;

  constructor(private readonly m: Match) {}

  start() {
    this.t = 0;
    this.bumpAt = -1;
    this.done = false;
  }

  update(dt: number) {
    const m = this.m;
    const prev = this.t;
    this.t += dt;
    const [a, b] = m.fighters;
    const dx = b.root.x - a.root.x, dz = b.root.z - a.root.z;
    const d = DM.hypot(dx, dz);
    const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0;
    // speed of each fighter towards the other (negative backs off)
    let speed: number;
    let drop: number;
    if (this.bumpAt < 0) {
      // walk to the centre, gloves low, settling into a long arm's length; the fist
      // goes out on the last stride, so arriving and reaching are one motion
      speed = clamp((d - BUMP_D) * 2.4, 0, 1.2);
      drop = 0.55;
      if (d < BUMP_D + 0.4 || this.t > 3.2) {
        this.bumpAt = this.t;
        m.shows[0].bump();
        m.shows[1].bump();
      }
    } else {
      const s = this.t - this.bumpAt;
      const s0 = prev - this.bumpAt;
      if (s0 < BUMP_CONTACT && s >= BUMP_CONTACT) {
        const ha = a.body.pos[a.emote!.reachSide ? J.HandR : J.HandL];
        const hb = b.body.pos[b.emote!.reachSide ? J.HandR : J.HandL];
        m.emit('fistBump', { x: (ha.x + hb.x) / 2, y: (ha.y + hb.y) / 2, z: (ha.z + hb.z) / 2 });
      }
      if (s < BUMP_CONTACT + 0.18) {
        // glide the last of the way in and hold arm's length through the touch
        speed = clamp((d - BUMP_D) * 2.4, -0.3, 1);
        drop = 0.45;
      } else {
        // a respectful step back, hands up
        speed = -clamp((BACK_D - d) * 2.4, 0, 1.4);
        drop = 0;
      }
      if ((s > BUMP_CONTACT + 1 && d > BACK_D - 0.25) || s > 3) this.done = true;
    }
    a.intentVel.set(ux * speed, 0, uz * speed);
    b.intentVel.set(-ux * speed, 0, -uz * speed);
    const k = 1 - DM.exp(-6 * dt);
    a.guardDrop += (drop - a.guardDrop) * k;
    b.guardDrop += (drop - b.guardDrop) * k;
  }
}
