import * as THREE from 'three';

/** Where the lamps ride: radius round the ring and height (just above the truss). */
const RING = 5.8;
const HIGH = 10.2;
/** How far round from straight behind the opponent each lamp sits (rad): the two come in from opposite diagonals. */
const SWING = 0.6;
/** Cone half angle and its soft edge: a pool a little wider than a robot at the canvas. */
const ANGLE = THREE.MathUtils.degToRad(11);
const PENUMBRA = 0.55;
/** Like the key spot (no falloff), slightly cool white. */
const INTENSITY = 3;
const COLOR = 0xedf5ff;

const _at = new THREE.Vector3();

/**
 * Two follow spots up in the rigging, one on each robot, so the fight reads from any angle. Each
 * hangs on a ring round the truss and slides along it to stay a little off the line between the
 * robots on its fighter's opponent's side, so it lights the face the cameras mostly see, from high
 * up (a clean top light, the pool on the canvas under the robot). Unshadowed: the key spot already
 * casts the robots' shadows. The lamps stay in the scene with their intensity at 0 when they're off,
 * so turning them on and off never changes the light count (which would rebuild every lit shader).
 */
export class FollowSpots {
  readonly group = new THREE.Group();
  /** 0..1 overall level: the venue's look scales it (bright daylight venues want less). */
  level = 1;
  private lamps: THREE.SpotLight[] = [];
  private aim = [new THREE.Vector3(), new THREE.Vector3()];
  private yaw = [0, 0];
  private k = [0, 0];
  private fresh = true;

  constructor() {
    this.group.name = 'followSpots';
    for (let i = 0; i < 2; i++) {
      const s = new THREE.SpotLight(COLOR, 0, 22, ANGLE, PENUMBRA, 0);
      s.castShadow = false;
      this.group.add(s, s.target);
      this.lamps.push(s);
    }
  }

  /** Each frame of a fight: the two robots' chests (world), and whether each is to be lit. */
  track(dt: number, chests: readonly THREE.Vector3[], lit: readonly boolean[]) {
    const e = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < 2; i++) {
      const c = chests[i], o = chests[1 - i];
      // aim between chest and hips: the pool takes in the head and the feet
      _at.set(c.x, c.y * 0.72, c.z);
      const ax = o.x - c.x, az = o.z - c.z;
      const yaw = Math.hypot(ax, az) > 0.05 ? Math.atan2(az, ax) + (i === 0 ? SWING : -SWING) : this.yaw[i];
      if (this.fresh) {
        this.aim[i].copy(_at);
        this.yaw[i] = yaw;
      } else {
        this.aim[i].lerp(_at, e);
        // the lamps slide round the rig slowly, as an operator would swing them
        const d = Math.atan2(Math.sin(yaw - this.yaw[i]), Math.cos(yaw - this.yaw[i]));
        this.yaw[i] += d * (1 - Math.exp(-dt * 1.2));
      }
      this.k[i] = lit[i] ? Math.min(1, this.k[i] + dt / 0.6) : Math.max(0, this.k[i] - dt / 0.6);
      const k = this.k[i];
      const s = this.lamps[i];
      s.intensity = INTENSITY * k * k * (3 - 2 * k) * this.level;
      if (s.intensity < 0.005) continue;
      const a = this.aim[i];
      s.position.set(a.x + Math.cos(this.yaw[i]) * RING, HIGH, a.z + Math.sin(this.yaw[i]) * RING);
      s.target.position.copy(a);
      s.target.updateMatrixWorld();
    }
    this.fresh = false;
  }

  /** Lights out at once (the fight ended, a menu, the titans' stadium). */
  off() {
    for (let i = 0; i < 2; i++) {
      this.k[i] = 0;
      this.lamps[i].intensity = 0;
    }
    this.fresh = true;
  }
}
