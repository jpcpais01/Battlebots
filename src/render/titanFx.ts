import * as THREE from 'three';
import { J } from '../sim/body';
import type { Match } from '../sim/match';
import type { Fx } from './fx';
import type { BotModel } from './botModel';
import { BASE_A, BASE_Y, CANVAS_A, GROUND_Y } from './venues/titanBuild';

/** The dust's colour (linear): sunlit dry earth; clods of earth and turf. */
const DUST = new THREE.Color(0.42, 0.34, 0.25);
const EARTH = new THREE.Color(0.12, 0.085, 0.05);
const TURF = new THREE.Color(0.09, 0.16, 0.035);
const SCARS = 12;

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * The titans' own effects (titan battles: render/venues/titan.ts): everything that tells the eye
 * these robots weigh thousands of tonnes. Each footfall raises a puff of dust and shakes the lens
 * a little when it is close; a body slamming down throws up a cloud of earth and turf, rocks the
 * camera and leaves a scar in the ground (the turf's uScars); torn-off plates land in dust. The
 * dust is the fight's own smoke pool (Fx.dustPuff), so it runs on the fight's slowed clock.
 */
export class TitanFx {
  /** The scars the turf draws (the venue's uniform), set by the game when the venue is up. */
  scars: THREE.Vector4[] | null = null;
  private next = 0;
  private groundPrev = [
    [false, false, false],
    [false, false, false],
  ];

  constructor(
    private fx: Fx,
    private shake: (k: number) => void,
    private lens: () => THREE.Vector3,
  ) {}

  /** A new fight: the ground is clean again. */
  clear() {
    for (const s of this.scars ?? []) s.set(0, 0, 0, 0);
    this.next = 0;
    this.groundPrev = [
      [false, false, false],
      [false, false, false],
    ];
  }

  /** The ground under p: the deck's turf (the sim's canvas, y 0), its step, or the plain round it. */
  static groundY(x: number, z: number) {
    const s = (Math.round(Math.atan2(z, x) / (Math.PI / 4)) * Math.PI) / 4;
    const oct = x * Math.cos(s) + z * Math.sin(s);
    return oct < CANVAS_A ? 0 : oct < BASE_A ? BASE_Y : GROUND_Y;
  }

  /** A puff of dust rolling out from p (k: 0..1+ how hard the ground was hit). */
  dust(p: THREE.Vector3, k: number, count: number) {
    const gy = TitanFx.groundY(p.x, p.z);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.35 + Math.random() * 0.9) * (0.6 + k * 0.8);
      _p.set(p.x + Math.cos(a) * 0.12 * k, gy + 0.03, p.z + Math.sin(a) * 0.12 * k);
      _v.set(Math.cos(a) * s, 0.15 + Math.random() * 0.35 * k, Math.sin(a) * s);
      _c.copy(DUST).multiplyScalar(0.75 + Math.random() * 0.4);
      this.fx.dustPuff(_p, _v, _c, 2.2 + Math.random() * 2 + k, 0.16 + 0.1 * k, 0.5 + 0.3 * k, 0.32 + 0.12 * Math.min(k, 1), -0.02, 1.4, gy);
    }
  }

  /** Clods of earth and turf thrown up where something heavy came down. */
  clods(p: THREE.Vector3, k: number, count: number) {
    const gy = TitanFx.groundY(p.x, p.z);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 2.2 * k;
      _p.set(p.x, gy + 0.04, p.z);
      _v.set(Math.cos(a) * s, 1.2 + Math.random() * 2.5 * k, Math.sin(a) * s);
      _c.copy(Math.random() < 0.6 ? EARTH : TURF).multiplyScalar(0.7 + Math.random() * 0.5);
      this.fx.dustPuff(_p, _v, _c, 1 + Math.random() * 0.8, 0.025 + Math.random() * 0.03, 0, 0.95, 9, 0.3, gy);
    }
  }

  /** A scar in the ground at p (radius r): churned earth and cracks for the rest of the fight. */
  scar(p: THREE.Vector3, r: number) {
    const sc = this.scars;
    if (!sc) return;
    // (a fresh one near an old one deepens it rather than stacking)
    for (const s of sc) {
      if (s.w > 0 && Math.hypot(s.x - p.x, s.y - p.z) < (s.z + r) * 0.5) {
        s.set((s.x + p.x) * 0.5, (s.y + p.z) * 0.5, Math.max(s.z, r) * 1.1, 1);
        return;
      }
    }
    sc[this.next].set(p.x, p.z, r, 1);
    this.next = (this.next + 1) % SCARS;
  }

  /** A torn-off part landing (`sp`: how fast): dust where it hit. */
  land(p: THREE.Vector3, sp: number) {
    const k = THREE.MathUtils.clamp(sp / 5, 0.2, 1.2);
    this.dust(p, k, 6 + Math.round(k * 8));
    this.clods(p, k * 0.6, 4 + Math.round(k * 6));
  }

  /** Sim events: footfalls, falls, finisher slams. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event(type: string, data: any, models: readonly BotModel[]) {
    switch (type) {
      case 'step': {
        const md = models[data.f.index];
        if (!md) return;
        const foot = md.joints[data.foot === 0 ? J.FootL : J.FootR];
        this.dust(foot, 0.35, 3);
        // the ground shakes under the lens when it's close
        const d = this.lens().distanceTo(foot);
        if (d < 6) this.shake(0.05 * (1 - d / 6));
        break;
      }
      case 'knockdown':
        this.shake(0.35);
        break;
      case 'finisherBlow':
        if (data.kind === 'slam' && data.point) {
          _p.set(data.point.x, 0, data.point.z);
          this.dust(_p, 1.4, 20);
          this.clods(_p, 1.3, 18);
          this.scar(_p, 0.9);
        }
        break;
    }
  }

  /** Each frame: bodies hitting the ground (the sim's grounded flags). */
  update(m: Match) {
    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      if (!f.isDown) {
        this.groundPrev[i] = [false, false, false];
        continue;
      }
      const body = f.body;
      [J.Pelvis, J.Chest, J.Head].forEach((j, k) => {
        const g = !!body.grounded[j];
        if (g && !this.groundPrev[i][k]) {
          const sp = body.velocity(j, 1 / 120, _v).length();
          if (sp > 1) {
            const p = body.pos[j];
            const kk = Math.min(1.6, sp / 3);
            this.dust(p, kk, 6 + Math.round(kk * 10));
            this.clods(p, kk, 4 + Math.round(kk * 8));
            if (sp > 2.2) this.scar(p, 0.35 + Math.min(0.6, sp * 0.12));
          }
        }
        this.groundPrev[i][k] = g;
      });
    }
  }
}
