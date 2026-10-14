import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from './settings';

/**
 * Broadcast camera drones. Three small quadcopters film the fight: one of them is always "live"
 * (it sits at the lens, hidden, so the shot you see is its feed), and the others hold station on
 * the far side of the ring, high up and off to the sides of the frame, lenses on the fighters.
 * On every hard cut the drone nearest the new angle takes over and the one that just filmed is
 * left hanging where the camera was, from where it climbs away to its standby slot.
 *
 * Render only: nothing here touches the sim. Three draw calls for all of them (bodies, rotor
 * blur discs, lights), all instanced.
 */

const N = 3;
/** Built at about 0.5 m across, shown a bit bigger so they read from across the arena. */
const SCALE = 1.35;
/** Standby ring: out past the ropes, under the stands' front row. */
const SLOT_R = 7.2;
const SLOT_Y = [3.7, 4.4, 4.0];
/** Rotor hubs in the body frame (+Z is where the lens looks). */
const MOTORS = [
  [0.15, 0.045, 0.15],
  [-0.15, 0.045, 0.15],
  [0.15, 0.045, -0.15],
  [-0.15, 0.045, -0.15],
];
/** Lights in the body frame: red tally on the camera head, green nav light at the tail. */
const LEDS = [
  [0, -0.022, 0.118],
  [0, 0.03, -0.17],
];

function tint(g: THREE.BufferGeometry, hex: number, m?: THREE.Matrix4) {
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _local = new THREE.Matrix4();

function bodyGeometry() {
  const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
  const SHELL = 0xdfe3e8, DARK = 0x2a2e35, ORANGE = 0xff6a14, BLACK = 0x0d0f13, GLASS = 0x1c3550, RIM = 0x8a929c;
  const parts: THREE.BufferGeometry[] = [
    // fuselage: a smooth pod with an orange stripe along the top
    tint(new THREE.SphereGeometry(1, 16, 10), SHELL, at(0, 0, 0, 0, 0, 0, 0.085, 0.042, 0.15)),
    tint(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), ORANGE, at(0, 0.012, -0.01, 0, 0, 0, 0.03, 0.036, 0.11)),
    // battery pack under the belly
    tint(new THREE.BoxGeometry(0.07, 0.03, 0.12), DARK, at(0, -0.035, -0.03)),
    // skids
    tint(new THREE.BoxGeometry(0.012, 0.012, 0.22), DARK, at(0.075, -0.1, 0)),
    tint(new THREE.BoxGeometry(0.012, 0.012, 0.22), DARK, at(-0.075, -0.1, 0)),
    tint(new THREE.BoxGeometry(0.01, 0.075, 0.01), DARK, at(0.06, -0.065, 0.06, 0, 0, 0.35)),
    tint(new THREE.BoxGeometry(0.01, 0.075, 0.01), DARK, at(-0.06, -0.065, 0.06, 0, 0, -0.35)),
    tint(new THREE.BoxGeometry(0.01, 0.075, 0.01), DARK, at(0.06, -0.065, -0.06, 0, 0, 0.35)),
    tint(new THREE.BoxGeometry(0.01, 0.075, 0.01), DARK, at(-0.06, -0.065, -0.06, 0, 0, -0.35)),
    // gimbal yoke and camera head with its lens
    tint(new THREE.BoxGeometry(0.014, 0.05, 0.014), DARK, at(0, -0.045, 0.095)),
    tint(new THREE.SphereGeometry(0.036, 12, 8), BLACK, at(0, -0.07, 0.105)),
    tint(new THREE.CylinderGeometry(0.024, 0.026, 0.026, 16), RIM, at(0, -0.07, 0.138, Math.PI / 2)),
    tint(new THREE.CircleGeometry(0.019, 16), GLASS, at(0, -0.07, 0.1515)),
  ];
  for (const [x, y, z] of MOTORS) {
    const len = Math.hypot(x, z);
    // arm from the body out to the motor
    parts.push(tint(new THREE.BoxGeometry(0.026, 0.02, len), DARK, at(x / 2, 0.005, z / 2, 0, Math.atan2(x, z))));
    // motor can with an orange cap
    parts.push(tint(new THREE.CylinderGeometry(0.024, 0.026, 0.035, 12), DARK, at(x, y - 0.022, z)));
    parts.push(tint(new THREE.CylinderGeometry(0.016, 0.022, 0.012, 12), ORANGE, at(x, y, z)));
  }
  // mergeGeometries needs one layout: drop uvs, unindex everything
  return mergeGeometries(
    parts.map((g) => {
      g.deleteAttribute('uv');
      return g.index ? g.toNonIndexed() : g;
    }),
  )!;
}

/** A spinning prop seen as a soft disc with two blade smears. */
function rotorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  const rg = g.createRadialGradient(0, 0, 6, 0, 0, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.35)');
  rg.addColorStop(0.75, 'rgba(255,255,255,0.14)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, 62, 0, Math.PI * 2);
  g.fill();
  for (const base of [0, Math.PI]) {
    for (let i = 0; i < 22; i++) {
      const a = base - i * 0.06;
      const k = 1 - i / 22;
      g.fillStyle = `rgba(255,255,255,${(0.55 * k * k).toFixed(3)})`;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 60, a - 0.06, a);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Drone {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  phase: number;
  /** Seconds since it last went live (its standby slot fans out from the camera's azimuth). */
  spin: number;
}

export class Drones {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private rotors: THREE.InstancedMesh;
  private lights: THREE.InstancedMesh;
  private drones: Drone[] = [];
  private live = -1;
  private lastCuts = -1;
  private lastMode = '';
  private t = 0;
  private lastCam = new THREE.Vector3();
  private color = new THREE.Color();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor() {
    this.group.name = 'drones';
    this.bodies = new THREE.InstancedMesh(
      bodyGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.3 }),
      N,
    );
    const disc = new THREE.CircleGeometry(0.088, 20).rotateX(-Math.PI / 2);
    this.rotors = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ map: rotorTexture(), color: 0x9aa3ad, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }),
      N * MOTORS.length,
    );
    this.lights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.011, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(2.2)), toneMapped: false }),
      N * LEDS.length,
    );
    for (const m of [this.bodies, this.rotors, this.lights]) {
      m.frustumCulled = false; // instances fly far from the base geometry's bounds
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    for (let i = 0; i < this.lights.count; i++) this.lights.setColorAt(i, this.color.setRGB(0, 0, 0));
    for (let i = 0; i < N; i++) {
      this.drones.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, phase: i * 2.1, spin: i * 7 });
    }
  }

  /**
   * Move the crew. `cuts` and `mode` come from the Director: a change in either is a hard cut,
   * and the drone nearest the new lens takes over the feed. `focus` is what they film.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, cuts: number, mode: string, focus: THREE.Vector3) {
    if (!this.group.visible) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const cam = camera.position;
    const fresh = this.live < 0;
    if (fresh || cuts !== this.lastCuts || mode !== this.lastMode) {
      // hand the feed to the drone closest to the new angle; the old one stays where it was
      let best = 0, bestD = Infinity;
      for (let i = 0; i < N; i++) {
        if (i === this.live) continue;
        const d = this.drones[i].pos.distanceToSquared(cam);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const was = this.live;
      if (was >= 0) this.drones[was].vel.set(0, 0, 0);
      this.live = best;
      this.drones[best].pos.copy(cam);
      this.drones[best].vel.set(0, 0, 0);
      this.lastCam.copy(cam);
      this.lastCuts = cuts;
      this.lastMode = mode;
      if (fresh) for (let i = 0; i < N; i++) if (i !== best) this.slot(i, camera, focus, this.drones[i].pos);
    }

    // the live drone is the lens
    const ld = this.drones[this.live];
    if (dt > 0) ld.vel.subVectors(cam, this.lastCam).divideScalar(dt);
    ld.pos.copy(cam);
    this.lastCam.copy(cam);

    for (let i = 0; i < N; i++) {
      if (i === this.live) continue;
      const d = this.drones[i];
      d.spin += dt;
      this.slot(i, camera, focus, _v);
      // climb first, then drift across: a released drone rises out of the shot before it travels
      const ax = (_v.x - d.pos.x) * 1.6 - d.vel.x * 2.5;
      const ay = (_v.y - d.pos.y) * 5 - d.vel.y * 4.5;
      const az = (_v.z - d.pos.z) * 1.6 - d.vel.z * 2.5;
      d.vel.x += ax * dt;
      d.vel.y += ay * dt;
      d.vel.z += az * dt;
      const sp = d.vel.length();
      if (sp > 6) d.vel.multiplyScalar(6 / sp);
      d.pos.addScaledVector(d.vel, dt);
    }
    this.pose(focus, dt);
  }

  /** Standby spot for drone i: past the fight from the camera, off to one side, near the frame's edge. */
  private slot(i: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, out: THREE.Vector3) {
    const cam = camera.position;
    const dx = cam.x - focus.x, dz = cam.z - focus.z;
    const camDist = Math.max(0.5, Math.hypot(dx, dz));
    const camAz = Math.atan2(dx, dz);
    // aim for a spot a set fraction of the half-width off centre, whatever the screen shape
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    const d = this.drones[i];
    const frac = 0.62 + Math.sin(d.spin * 0.13 + d.phase) * 0.2;
    const k = Math.tan(Math.min(1.2, half * frac));
    const phi = Math.atan(k) + Math.asin(Math.min(1, (k * camDist) / (SLOT_R * Math.hypot(1, k))));
    // idle drones take alternate sides; with all three idle (no live one yet), the third goes high centre
    const order = (i - this.live + N) % N;
    const side = order === 1 ? 1 : order === 2 ? -1 : 0;
    const a = camAz + Math.PI + side * phi;
    out.set(focus.x + Math.sin(a) * SLOT_R, SLOT_Y[i] + Math.sin(d.spin * 0.21 + d.phase) * 0.35, focus.z + Math.cos(a) * SLOT_R);
  }

  /** Write every instance: bodies lean into their motion, props spin, lights blink. */
  private pose(focus: THREE.Vector3, dt: number) {
    const t = this.t;
    for (let i = 0; i < N; i++) {
      const d = this.drones[i];
      if (i === this.live) {
        // inside the lens: not drawn
        this.bodies.setMatrixAt(i, this.zero);
        for (let j = 0; j < MOTORS.length; j++) this.rotors.setMatrixAt(i * MOTORS.length + j, this.zero);
        for (let j = 0; j < LEDS.length; j++) this.lights.setMatrixAt(i * LEDS.length + j, this.zero);
        continue;
      }
      const want = Math.atan2(focus.x - d.pos.x, focus.z - d.pos.z);
      d.yaw += Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw)) * Math.min(1, dt * 2.5);
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      const fwd = d.vel.x * fx + d.vel.z * fz;
      const right = d.vel.x * fz - d.vel.z * fx;
      const sway = Math.sin(t * 1.3 + d.phase);
      const kp = THREE.MathUtils.clamp(fwd * 0.09, -0.35, 0.35) + Math.sin(t * 0.9 + d.phase * 1.7) * 0.025;
      const kr = THREE.MathUtils.clamp(-right * 0.09, -0.35, 0.35) + sway * 0.03;
      const lerp = Math.min(1, dt * 6);
      d.pitch += (kp - d.pitch) * lerp;
      d.roll += (kr - d.roll) * lerp;
      _v.set(d.pos.x + sway * 0.03, d.pos.y + Math.sin(t * 1.9 + d.phase) * 0.05, d.pos.z);
      _q.setFromEuler(_e.set(d.pitch, d.yaw, d.roll, 'YXZ'));
      const body = _m.compose(_v, _q, _s.setScalar(SCALE));
      this.bodies.setMatrixAt(i, body);
      const local = _local;
      for (let j = 0; j < MOTORS.length; j++) {
        const [x, y, z] = MOTORS[j];
        // neighbours counter-rotate
        local.makeRotationY((j === 0 || j === 3 ? 1 : -1) * (t * 47 + j));
        local.setPosition(x, y + 0.004, z);
        this.rotors.setMatrixAt(i * MOTORS.length + j, local.premultiply(body));
      }
      // tally: steady red with a slow pulse; nav: green double flash
      const tally = 0.6 + 0.4 * Math.sin(t * 3 + d.phase);
      const beat = (t * 0.8 + d.phase * 0.37) % 1;
      const nav = beat < 0.06 || (beat > 0.14 && beat < 0.2) ? 1 : 0.08;
      for (let j = 0; j < LEDS.length; j++) {
        const [x, y, z] = LEDS[j];
        local.makeTranslation(x, y, z);
        this.lights.setMatrixAt(i * LEDS.length + j, local.premultiply(body));
        if (j === 0) this.color.setRGB(1, 0.09, 0.07).multiplyScalar(tally);
        else this.color.setRGB(0.15, 1, 0.45).multiplyScalar(nav);
        this.lights.setColorAt(i * LEDS.length + j, this.color);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.rotors.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor!.needsUpdate = true;
  }
}
