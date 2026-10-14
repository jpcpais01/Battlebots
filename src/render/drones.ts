import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from './settings';

/**
 * Broadcast camera drones. Three ducted-fan camera drones film the fight: one of them is always "live"
 * (it sits at the lens, hidden, so the shot you see is its feed), and the others hold station on
 * the far side of the ring, high up and off to the sides of the frame, lenses on the fighters.
 * On every hard cut the drone nearest the new angle takes over and the one that just filmed is
 * left hanging where the camera was, from where it climbs away to its standby slot.
 *
 * Render only: nothing here touches the sim. Four draw calls for all of them (hulls, fan
 * blur discs, everything that glows, red REC lights), all instanced.
 */

const N = 3;
/** Built at about 0.55 m across, shown a bit bigger so they read from across the arena. */
const SCALE = 1.35;
/** Standby ring: out past the ropes, under the stands' front row. */
const SLOT_R = 7.2;
const SLOT_Y = [3.7, 4.4, 4.0];
/** Ducted fan centres in the body frame (+Z is where the eye looks): a swept X around the core. */
const MOTORS = [
  [0.19, 0.012, 0.11],
  [-0.19, 0.012, 0.11],
  [0.19, 0.012, -0.13],
  [-0.19, 0.012, -0.13],
];
const DUCT_R = 0.072;
/** Red recording lights (body frame + radius): a big REC dome on the nose, and the eye's tally. */
const RECS = [
  [0, 0.05, 0.085, 0.012],
  [0, -0.004, 0.17, 0.0075],
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

/** mergeGeometries needs one layout: drop uvs, unindex everything. */
function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(
    parts.map((g) => {
      g.deleteAttribute('uv');
      return g.index ? g.toNonIndexed() : g;
    }),
  )!;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _local = new THREE.Matrix4();

const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
/** A ring lying flat (axis up), or facing +Z with `flat` off. */
const ring = (r: number, tube: number, seg: number, flat = true) => {
  const g = new THREE.TorusGeometry(r, tube, 6, seg);
  return flat ? g.rotateX(Math.PI / 2) : g;
};

/**
 * The hull: a pearl-white teardrop over a gunmetal belly, one big glass eye up front, swept tail
 * fins, and four ducted fans on swept pylons. No skids, no exposed props: it looks like it was
 * built to fly, not to land.
 */
function bodyGeometry() {
  const PEARL = 0xe8ecf1, GUN = 0x2a2f37, GLASS = 0x06080c, METAL = 0x7c8590;
  const parts: THREE.BufferGeometry[] = [
    // core: pearl canopy over a dark belly, nose a touch fuller than the tail
    tint(new THREE.SphereGeometry(1, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2), PEARL, at(0, 0, 0, 0, 0, 0, 0.078, 0.055, 0.165)),
    tint(new THREE.SphereGeometry(1, 22, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), GUN, at(0, -0.004, 0, 0, 0, 0, 0.072, 0.04, 0.155)),
    // dorsal spine and two swept tail fins
    tint(new THREE.BoxGeometry(0.008, 0.032, 0.11), PEARL, at(0, 0.052, -0.07, -0.18)),
    tint(new THREE.BoxGeometry(0.075, 0.006, 0.045), GUN, at(0.045, 0.004, -0.165, 0, 0.5, -0.35)),
    tint(new THREE.BoxGeometry(0.075, 0.006, 0.045), GUN, at(-0.045, 0.004, -0.165, 0, -0.5, 0.35)),
    // the eye: black glass dome in a machined bezel
    tint(new THREE.SphereGeometry(0.042, 18, 12), GLASS, at(0, -0.004, 0.13)),
    tint(ring(0.041, 0.007, 24, false), METAL, at(0, -0.004, 0.153)),
    // bezel for the REC light on the nose
    tint(new THREE.CylinderGeometry(0.017, 0.02, 0.012, 16), GUN, at(RECS[0][0], RECS[0][1] - 0.006, RECS[0][2], 0.5)),
    // belly thruster housing
    tint(new THREE.CylinderGeometry(0.03, 0.036, 0.016, 18), GUN, at(0, -0.042, -0.02)),
  ];
  for (const [x, y, z] of MOTORS) {
    // swept pylon from the hull out to the duct
    const len = Math.hypot(x, z) - DUCT_R * 0.7;
    const a = Math.atan2(x, z);
    parts.push(tint(new THREE.BoxGeometry(0.03, 0.012, len), GUN, at((x / 2) * 0.9, y - 0.004, (z / 2) * 0.9, 0, a)));
    // the duct: a fat pearl ring with a dark lip underneath
    parts.push(tint(ring(DUCT_R, 0.015, 28), PEARL, at(x, y, z)));
    parts.push(tint(ring(DUCT_R - 0.004, 0.009, 28), GUN, at(x, y - 0.012, z)));
    // stator cross and motor hub inside it
    parts.push(tint(new THREE.BoxGeometry(DUCT_R * 2, 0.005, 0.008), GUN, at(x, y - 0.01, z, 0, Math.PI / 4)));
    parts.push(tint(new THREE.BoxGeometry(DUCT_R * 2, 0.005, 0.008), GUN, at(x, y - 0.01, z, 0, -Math.PI / 4)));
    parts.push(tint(new THREE.CylinderGeometry(0.013, 0.016, 0.022, 12), METAL, at(x, y - 0.006, z)));
  }
  return merge(parts);
}

/**
 * Everything that shines, in one mesh: the eye's iris ring and red tally, light lines along the
 * hull seam and the duct rims, and the thruster glow underneath (the side the cameras mostly see).
 */
function glowGeometry() {
  const CYAN = 0x38e6ff, DEEP = 0x1a7fb8;
  const parts: THREE.BufferGeometry[] = [
    tint(ring(0.026, 0.0032, 24, false), CYAN, at(0, -0.004, 0.164)),
    // seam line where canopy meets belly
    tint(ring(1, 0.05, 40), CYAN, at(0, 0.001, 0, 0, 0, 0, 0.079, 0.06, 0.166)),
    // belly thruster
    tint(new THREE.CircleGeometry(0.027, 20).rotateX(Math.PI / 2), DEEP, at(0, -0.0505, -0.02)),
    tint(ring(0.031, 0.0028, 20), CYAN, at(0, -0.05, -0.02)),
  ];
  for (const [x, y, z] of MOTORS) {
    // a light line along the duct's top lip
    parts.push(tint(ring(DUCT_R, 0.0032, 28), CYAN, at(x, y + 0.0155, z)));
    parts.push(tint(new THREE.CircleGeometry(DUCT_R - 0.016, 24).rotateX(Math.PI / 2), DEEP, at(x, y - 0.018, z)));
    // pylon tip light
    parts.push(tint(new THREE.SphereGeometry(0.006, 8, 6), CYAN, at(x + Math.sign(x) * (DUCT_R + 0.014), y, z)));
  }
  return merge(parts);
}

/** A fan inside its duct seen as a soft disc with blade smears. */
function rotorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  const rg = g.createRadialGradient(0, 0, 8, 0, 0, 62);
  rg.addColorStop(0, 'rgba(255,255,255,0.4)');
  rg.addColorStop(0.8, 'rgba(255,255,255,0.18)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.beginPath();
  g.arc(0, 0, 62, 0, Math.PI * 2);
  g.fill();
  for (let b = 0; b < 5; b++) {
    const base = (b / 5) * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const a = base - i * 0.06;
      const k = 1 - i / 12;
      g.fillStyle = `rgba(255,255,255,${(0.5 * k * k).toFixed(3)})`;
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
  private recs: THREE.InstancedMesh;
  private drones: Drone[] = [];
  private live = -1;
  /** The feed is a bot's eyes: the live drone is just hovering, and drawn. */
  private pov = false;
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
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55 }),
      N,
    );
    const disc = new THREE.CircleGeometry(DUCT_R - 0.018, 20).rotateX(-Math.PI / 2);
    this.rotors = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ map: rotorTexture(), color: 0x8fdcf0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
      N * MOTORS.length,
    );
    this.lights = new THREE.InstancedMesh(
      glowGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(2.2)), toneMapped: false }),
      N,
    );
    this.recs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.06, 0.04).multiplyScalar(RenderSettings.glow(3)), toneMapped: false }),
      N * RECS.length,
    );
    for (const m of [this.bodies, this.rotors, this.lights, this.recs]) {
      m.frustumCulled = false; // instances fly far from the base geometry's bounds
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    for (let i = 0; i < this.lights.count; i++) this.lights.setColorAt(i, this.color.setRGB(0, 0, 0));
    for (let i = 0; i < this.recs.count; i++) this.recs.setColorAt(i, this.color.setRGB(0, 0, 0));
    for (let i = 0; i < N; i++) {
      this.drones.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, phase: i * 2.1, spin: i * 7 });
    }
  }

  /**
   * Move the crew. `cuts` and `mode` come from the Director: a change in either is a hard cut,
   * and the drone nearest the new lens takes over the feed. `focus` is what they film. While
   * `pov` holds the feed comes from a bot's eyes, not a drone: the drone that was live stays
   * where it was, hovering in view, and the next cut hands over as usual.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, cuts: number, mode: string, focus: THREE.Vector3, pov = false) {
    if (!this.group.visible) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const cam = camera.position;
    const fresh = this.live < 0;
    this.pov = pov && !fresh;
    if (this.pov) {
      this.lastCuts = cuts;
      this.lastMode = mode;
    } else if (fresh || cuts !== this.lastCuts || mode !== this.lastMode) {
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

    // the live drone is the lens (off duty in a bot's-eye shot: it holds its spot)
    const ld = this.drones[this.live];
    if (this.pov) ld.vel.multiplyScalar(Math.exp(-4 * dt));
    else {
      if (dt > 0) ld.vel.subVectors(cam, this.lastCam).divideScalar(dt);
      ld.pos.copy(cam);
    }
    if (this.pov) ld.pos.addScaledVector(ld.vel, dt);
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
      if (i === this.live && !this.pov) {
        // inside the lens: not drawn
        this.bodies.setMatrixAt(i, this.zero);
        for (let j = 0; j < MOTORS.length; j++) this.rotors.setMatrixAt(i * MOTORS.length + j, this.zero);
        this.lights.setMatrixAt(i, this.zero);
        for (let j = 0; j < RECS.length; j++) this.recs.setMatrixAt(i * RECS.length + j, this.zero);
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
      // the lights breathe, with a quick shimmer as the drone works hard
      const effort = Math.min(1, d.vel.length() * 0.25);
      const glow = 0.78 + 0.16 * Math.sin(t * 2.2 + d.phase) + effort * (0.25 + 0.1 * Math.sin(t * 31 + d.phase));
      this.lights.setMatrixAt(i, body);
      this.lights.setColorAt(i, this.color.setScalar(glow));
      // REC: on most of each second, a short blink off, like a camera that's rolling
      const rec = (t + d.phase * 0.31) % 1 < 0.72 ? 1 : 0.05;
      this.color.setScalar(rec);
      for (let j = 0; j < RECS.length; j++) {
        const [x, y, z, r] = RECS[j];
        local.makeScale(r, r, r).setPosition(x, y, z);
        this.recs.setMatrixAt(i * RECS.length + j, local.premultiply(body));
        this.recs.setColorAt(i * RECS.length + j, this.color);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.rotors.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lights.instanceColor!.needsUpdate = true;
    this.recs.instanceMatrix.needsUpdate = true;
    this.recs.instanceColor!.needsUpdate = true;
  }
}
