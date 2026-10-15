import * as THREE from 'three';

/**
 * The map's camera: a target on the ground, a distance and a gentle tilt (lower and more angled
 * close in, more top-down far out). Drag to pan (the ground under the finger stays under it),
 * pinch or wheel to zoom about the fingers or the cursor, flick to glide.
 */

export const ZOOM_MIN = 150;
export const ZOOM_MAX = 2100;
/** How far from the middle of the map the target may go. */
const BOUND = 1250;
const YAW = 0.16;

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane();
const _a = new THREE.Vector3();

export class MapCamera {
  /** What the camera looks at, on the ground. */
  readonly target = new THREE.Vector3(60, 3, -40);
  dist = 1250;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  /** Pan glide after a flick (m/s), and zoom glide (log-distance per second). */
  private vel = new THREE.Vector2();
  private zoomVel = 0;
  private fly: { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t: number; dur: number } | null = null;
  /** A camera posed like this one, for working out what's under a finger between frames. */
  private scratch = new THREE.PerspectiveCamera();
  /** Ground height under the target (smoothed). */
  ground: (x: number, z: number) => number = () => 3;
  /** The tallest roof near a point (the lens never goes inside a tower). */
  roofs: (x: number, z: number) => number = () => 0;
  /** Towers too tall to climb over: the lens is pushed out round them instead, below their tops. */
  obstacles: { x: number; z: number; r: number; top: number }[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private grab: THREE.Vector3 | null = null;
  private pinch: { d: number; dist: number; mid: THREE.Vector3 | null } | null = null;
  private lastMove = 0;
  private moved = 0;
  /** A tap (not a drag) at these client coordinates. */
  onTap: ((x: number, y: number) => void) | null = null;
  /** The user moved the map (closes the event card). */
  onUserMove: (() => void) | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {
    this.pose();
  }

  /** Tilt for a distance: 0 straight down .. pi/2 level. */
  private pitch(d: number) {
    const t = Math.min(1, Math.max(0, Math.log(d / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)));
    // 34 degrees above the ground close in, 60 far out
    return THREE.MathUtils.degToRad(34 + 26 * t);
  }

  /** Where the lens is for a target and distance. */
  private place(target: THREE.Vector3, d: number, out: THREE.Vector3) {
    const p = this.pitch(d);
    const h = Math.cos(p) * d;
    return out.set(target.x + Math.sin(YAW) * h, target.y + Math.sin(p) * d, target.z + Math.cos(YAW) * h);
  }

  private pose() {
    this.place(this.target, this.dist, this.pos);
    this.pos.y = Math.max(this.pos.y, this.roofs(this.pos.x, this.pos.z) + 14);
    for (const o of this.obstacles) {
      if (this.pos.y > o.top + 20) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz), R = o.r + 26;
      if (d >= R) continue;
      // (straight under the camera's own approach: out towards the viewer)
      const k = d > 1e-3 ? R / d : 0;
      this.pos.x = d > 1e-3 ? o.x + dx * k : o.x;
      this.pos.z = d > 1e-3 ? o.z + dz * k : o.z + R;
    }
    this.look.copy(this.target);
  }

  /** The scratch camera, posed as the map is now with the real camera's lens. */
  private lens() {
    const c = this.scratch;
    c.fov = this.camera.fov;
    c.aspect = this.camera.aspect;
    c.near = 1;
    c.far = 20000;
    c.updateProjectionMatrix();
    this.place(this.target, this.dist, c.position);
    c.lookAt(this.target);
    c.updateMatrixWorld();
    return c;
  }

  /** The point on the ground plane (at the target's height) under client coordinates, or null. */
  private under(x: number, y: number, el: HTMLElement, out: THREE.Vector3) {
    const r = el.getBoundingClientRect();
    _ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.lens());
    _plane.set(_a.set(0, 1, 0), -this.target.y);
    return _ray.ray.intersectPlane(_plane, out);
  }

  // ---------------------------------------------------------------- input
  attach(el: HTMLElement) {
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.fly = null;
      this.vel.set(0, 0);
      this.zoomVel = 0;
      this.moved = 0;
      this.startGesture(el);
    };
    const move = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      this.gesture(el, e.timeStamp);
      if (this.moved > 8) this.onUserMove?.();
    };
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      const tap = this.pointers.size === 1 && this.moved < 8;
      this.pointers.delete(e.pointerId);
      // a flick that stopped before letting go doesn't glide
      if (e.timeStamp - this.lastMove > 90) this.vel.set(0, 0);
      this.startGesture(el);
      if (tap && e.type === 'pointerup') this.onTap?.(e.clientX, e.clientY);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.fly = null;
        const k = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018))));
        this.zoomAt(el, e.clientX, e.clientY, this.dist * k);
        this.onUserMove?.();
      },
      { passive: false },
    );
    el.addEventListener('dblclick', (e) => {
      this.zoomAt(el, e.clientX, e.clientY, this.dist * 0.5, true);
    });
  }

  /** Fingers changed: restart the grab or pinch from where they are. */
  private startGesture(el: HTMLElement) {
    const pts = [...this.pointers.values()];
    this.grab = null;
    this.pinch = null;
    if (pts.length === 1) {
      const g = new THREE.Vector3();
      if (this.under(pts[0].x, pts[0].y, el, g)) this.grab = g;
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const mid = new THREE.Vector3();
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.dist, mid: this.under((a.x + b.x) / 2, (a.y + b.y) / 2, el, mid) ? mid : null };
    }
  }

  private gesture(el: HTMLElement, time: number) {
    const pts = [...this.pointers.values()];
    const dtMove = Math.max(1, time - this.lastMove) / 1000;
    this.lastMove = time;
    if (pts.length === 1 && this.grab) {
      if (!this.under(pts[0].x, pts[0].y, el, _hit)) return;
      const dx = this.grab.x - _hit.x, dz = this.grab.z - _hit.z;
      this.target.x += dx;
      this.target.z += dz;
      this.clampTarget();
      // glide speed from this move, smoothed
      this.vel.lerp(new THREE.Vector2(dx / dtMove, dz / dtMove), 0.5);
    } else if (pts.length >= 2 && this.pinch) {
      const [a, b] = pts;
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const want = this.pinch.dist * (this.pinch.d / d);
      this.setDist(want);
      // keep the point between the fingers where it was
      if (this.pinch.mid && this.under((a.x + b.x) / 2, (a.y + b.y) / 2, el, _hit)) {
        this.target.x += this.pinch.mid.x - _hit.x;
        this.target.z += this.pinch.mid.z - _hit.z;
        this.clampTarget();
      }
      this.vel.set(0, 0);
    }
  }

  private setDist(d: number) {
    this.dist = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, d));
  }

  /** Zoom to distance `d` keeping the ground under (x, y) in place. */
  private zoomAt(el: HTMLElement, x: number, y: number, d: number, animate = false) {
    const before = new THREE.Vector3();
    if (!this.under(x, y, el, before)) return this.setDist(d);
    if (animate) {
      // glide in on the point
      const to = this.target.clone().lerp(before, 0.5);
      return this.flyTo(to, Math.max(ZOOM_MIN, d), 0.6);
    }
    this.setDist(d);
    if (this.under(x, y, el, _hit)) {
      this.target.x += before.x - _hit.x;
      this.target.z += before.z - _hit.z;
      this.clampTarget();
    }
  }

  /** Zoom by a factor about the middle of the screen (the + and − buttons). */
  zoomBy(k: number) {
    this.flyTo(this.target.clone(), Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.dist * k)), 0.45);
  }

  /** Glide to look at `to` from distance `d`. */
  flyTo(to: THREE.Vector3, d: number, dur = 1.2) {
    this.vel.set(0, 0);
    this.zoomVel = 0;
    this.fly = { from: this.target.clone(), to: to.clone(), d0: this.dist, d1: d, t: 0, dur };
  }

  /** Jump straight to a view. */
  set(to: THREE.Vector3, d: number) {
    this.fly = null;
    this.target.copy(to);
    this.dist = d;
    this.pose();
  }

  private clampTarget() {
    const l = Math.hypot(this.target.x - 60, this.target.z - 60);
    if (l > BOUND) {
      this.target.x = 60 + ((this.target.x - 60) / l) * BOUND;
      this.target.z = 60 + ((this.target.z - 60) / l) * BOUND;
    }
  }

  get busy() {
    return this.pointers.size > 0;
  }

  update(dt: number) {
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = f.t * f.t * (3 - 2 * f.t);
      this.target.lerpVectors(f.from, f.to, e);
      // zoom out a little on long hops, as a map does
      const hop = f.from.distanceTo(f.to);
      const lift = Math.sin(e * Math.PI) * Math.min(600, hop * 0.5);
      this.dist = Math.exp(Math.log(f.d0) + (Math.log(f.d1) - Math.log(f.d0)) * e) + lift;
      if (f.t >= 1) this.fly = null;
    } else if (!this.busy) {
      // glide after a flick
      if (this.vel.lengthSq() > 0.01) {
        this.target.x += this.vel.x * dt;
        this.target.z += this.vel.y * dt;
        this.clampTarget();
        this.vel.multiplyScalar(Math.exp(-4 * dt));
      }
      if (Math.abs(this.zoomVel) > 1e-4) {
        this.setDist(this.dist * Math.exp(this.zoomVel * dt));
        this.zoomVel *= Math.exp(-6 * dt);
      }
    }
    // follow the ground's height, slowly (hills, the mesa)
    const g = this.ground(this.target.x, this.target.z);
    this.target.y += (Math.max(0, g) - this.target.y) * Math.min(1, dt * 2);
    this.pose();
  }

  /** Near and far clip planes for this distance. */
  get clip(): [number, number] {
    return [Math.max(0.5, this.dist * 0.02), 12000];
  }
}
