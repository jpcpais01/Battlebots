import * as THREE from 'three';
import { perf } from '../perf';
import type { Stage } from './stage';

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** What each draw call belongs to, for the GPU-by-part view. */
export type Part = 'shadows' | 'bots' | 'crowd' | 'venue' | 'ring' | 'ropes' | 'beams' | 'effects' | 'post' | 'other';

export const PARTS: { id: Part; label: string }[] = [
  { id: 'bots', label: 'Bots' },
  { id: 'crowd', label: 'Crowd' },
  { id: 'venue', label: 'Stands' },
  { id: 'ring', label: 'Ring' },
  { id: 'ropes', label: 'Ropes' },
  { id: 'beams', label: 'Beams' },
  { id: 'effects', label: 'Effects' },
  { id: 'shadows', label: 'Shadows' },
  { id: 'post', label: 'Bloom/post' },
  { id: 'other', label: 'Other' },
];
const IDS = PARTS.map((p) => p.id);
const INDEX = Object.fromEntries(IDS.map((id, i) => [id, i])) as Record<Part, number>;
/** Parts the fallback measurement can hide one at a time. */
const HIDEABLE: Part[] = ['bots', 'crowd', 'venue', 'ring', 'ropes', 'beams', 'effects'];

export type PartTable = Record<Part, number>;
const table = (a: ArrayLike<number>, k = 1): PartTable => Object.fromEntries(IDS.map((id, i) => [id, a[i] * k])) as PartTable;

export interface PartSnapshot {
  draws: PartTable;
  tris: PartTable;
  /** Live GPU ms per part, from timer queries; null where the device has none. */
  gpu: PartTable | null;
}

export interface PartMeasurement {
  ms: PartTable;
  at: number;
}

interface Pending {
  q: WebGLQuery;
  part: number;
  last: boolean;
}

type Draw = THREE.WebGLRenderer['renderBufferDirect'];

/**
 * Wraps the render call while the performance overlay is on. Every draw call is charged to a part of
 * the scene (bots, crowd, ropes, shadows, post-processing…) by walking up to a tagged ancestor.
 *
 * Where the browser has GPU timer queries (most desktops, few phones) a query is restarted each time
 * the part changes, so GPU time per part is live. Elsewhere `measure()` renders the frame again with
 * each part removed, forcing the GPU to finish every time, and reads the cost from the difference.
 */
export class RenderProbe {
  private renderer: THREE.WebGLRenderer;
  private gl: WebGL2RenderingContext | null;
  private ext: TimerExt | null = null;
  private wasOn = false;
  private tags = new WeakMap<THREE.Object3D, Part>();
  private cache = new WeakMap<THREE.Object3D, number>();
  // live counts, summed over frames until snapshot()
  private draws = new Float64Array(IDS.length);
  private tris = new Float64Array(IDS.length);
  private frames = 0;
  private counting = false;
  // timer queries
  private free: WebGLQuery[] = [];
  private pending: Pending[] = [];
  private pendingFrames = 0;
  private cur = -1;
  private frameGpu = new Float64Array(IDS.length);
  private gpuSum = new Float64Array(IDS.length);
  private gpuFrames = 0;
  // fallback measurement
  private rounds = 0;
  private samples = new Map<string, number[]>();
  private px = new Uint8Array(4);
  result: PartMeasurement | null = null;

  constructor(private stage: Stage) {
    this.renderer = stage.renderer;
    const gl = this.renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
  }

  /** Charge everything under `obj` to `part` (the nearest tagged ancestor wins). */
  tag(obj: THREE.Object3D, part: Part) {
    this.tags.set(obj, part);
  }

  get hasTimer() {
    return !!this.ext;
  }

  get measuring() {
    return this.rounds > 0;
  }

  /** Fallback: take the per-part measurement over the next few frames. */
  measure() {
    if (this.rounds || !this.gl) return;
    this.samples.clear();
    this.rounds = 7;
  }

  begin() {
    const info = this.renderer.info;
    if (!perf.on) {
      if (this.wasOn) info.autoReset = true;
      this.wasOn = false;
      return;
    }
    if (!this.wasOn) {
      this.wasOn = true;
      this.install();
    }
    // post-processing renders several passes, each of which would reset the counters
    info.autoReset = false;
    info.reset();
    this.poll();
    this.counting = true;
    this.frames++;
    if (this.ext && this.pendingFrames < 5) this.startQuery(INDEX.other);
  }

  end() {
    if (!this.wasOn) return;
    this.counting = false;
    if (this.cur >= 0) {
      this.stopQuery(true);
      this.pendingFrames++;
    }
    const r = this.renderer.info.render;
    perf.draws = r.calls;
    perf.tris = r.triangles;
    if (this.rounds > 0) this.round();
  }

  /** Average draws, triangles and (live) GPU ms per part since the last snapshot. */
  snapshot(): PartSnapshot {
    const n = Math.max(1, this.frames);
    const out: PartSnapshot = {
      draws: table(this.draws, 1 / n),
      tris: table(this.tris, 1 / n),
      gpu: this.gpuFrames ? table(this.gpuSum, 1 / this.gpuFrames) : null,
    };
    this.draws.fill(0);
    this.tris.fill(0);
    this.gpuSum.fill(0);
    this.frames = 0;
    this.gpuFrames = 0;
    return out;
  }

  // ------------------------------------------------------------ draw hook
  private install() {
    if (this.gl && !this.ext) this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    perf.gpuSupported = !!this.ext;
    if (this.installed) return;
    this.installed = true;
    if (this.stage.post) this.stage.scene.add(this.resolveMarker());
    const r = this.renderer as unknown as { renderBufferDirect: Draw };
    const draw = r.renderBufferDirect;
    const scene = this.stage.scene;
    // the shadow map draws with no scene, post-processing passes draw their own full-screen quads
    r.renderBufferDirect = (camera, sc, geometry, material, object, group) => {
      if (this.counting) this.onDraw(sc === null ? INDEX.shadows : sc === scene ? this.resolve(object) : INDEX.post, geometry, object, group);
      draw(camera, sc, geometry, material, object, group);
    };
  }
  private installed = false;

  /**
   * The multisampled scene buffer is resolved inside `renderer.render`, right after the last draw,
   * so its cost lands on whatever part drew last (often the light beams). A zero-area triangle
   * drawn after everything else switches the timer to post-processing first.
   */
  private resolveMarker() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, colorWrite: false }),
    );
    m.renderOrder = Number.MAX_SAFE_INTEGER;
    m.frustumCulled = false;
    this.tag(m, 'post');
    return m;
  }

  private onDraw(part: number, geometry: THREE.BufferGeometry, object: THREE.Object3D, group: { count: number } | null) {
    this.draws[part]++;
    if ((object as THREE.Mesh).isMesh) {
      const n = group ? group.count : geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0);
      const inst = (object as THREE.InstancedMesh).isInstancedMesh ? (object as THREE.InstancedMesh).count : 1;
      this.tris[part] += (Math.min(n, geometry.drawRange.count) / 3) * inst;
    }
    if (this.cur >= 0 && part !== this.cur) {
      this.stopQuery(false);
      this.startQuery(part);
    }
  }

  private resolve(o: THREE.Object3D): number {
    let p = this.cache.get(o);
    if (p !== undefined) return p;
    p = INDEX.other;
    for (let n: THREE.Object3D | null = o; n; n = n.parent) {
      const t = this.tags.get(n);
      if (t) {
        p = INDEX[t];
        break;
      }
    }
    this.cache.set(o, p);
    return p;
  }

  // ------------------------------------------------------------ timer queries
  private startQuery(part: number) {
    const gl = this.gl!;
    const q = this.free.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.ext!.TIME_ELAPSED_EXT, q);
    this.pending.push({ q, part, last: false });
    this.cur = part;
  }

  private stopQuery(last: boolean) {
    this.gl!.endQuery(this.ext!.TIME_ELAPSED_EXT);
    this.pending[this.pending.length - 1].last = last;
    this.cur = -1;
  }

  /** Collect finished GPU timings; results arrive a frame or two late. */
  private poll() {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    const fg = this.frameGpu;
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      fg[p.part] += (gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number) / 1e6;
      this.free.push(this.pending.shift()!.q);
      if (!p.last) continue;
      this.pendingFrames--;
      if (!disjoint) {
        let total = 0;
        for (let i = 0; i < fg.length; i++) {
          this.gpuSum[i] += fg[i];
          total += fg[i];
        }
        this.gpuFrames++;
        perf.gpu(total);
      }
      fg.fill(0);
    }
  }

  // ------------------------------------------------------------ fallback measurement
  /** Wait until the GPU has finished everything queued so far. */
  private sync() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(null);
    const gl = this.gl!;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
    r.setRenderTarget(prev);
  }

  private time(key: string, render: () => void) {
    this.sync();
    const t0 = performance.now();
    render();
    this.sync();
    const t = performance.now() - t0;
    const s = this.samples.get(key);
    if (s) s.push(t);
    else this.samples.set(key, [t]);
  }

  /** One pass of every variant, interleaved so camera moves between frames hit them all alike. */
  private round() {
    const { renderer, stage } = this;
    const groups = new Map<Part, THREE.Object3D[]>();
    stage.scene.traverseVisible((o) => {
      const d = o as THREE.Mesh & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
      if (!d.isMesh && !d.isPoints && !d.isLine && !d.isSprite) return;
      const part = IDS[this.resolve(o)];
      const list = groups.get(part);
      if (list) list.push(o);
      else groups.set(part, [o]);
    });
    const post = !!stage.post;
    const full = () => stage.render();
    const direct = () => {
      renderer.setRenderTarget(null);
      renderer.render(stage.scene, stage.camera);
    };
    const base = post ? direct : full;
    const sm = renderer.shadowMap;
    // skipping the shadow pass this way keeps the shadow map bound, so no shader recompiles
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    this.time('noShadows', full);
    if (post) this.time('noPost', direct);
    for (const part of HIDEABLE) {
      const list = groups.get(part);
      if (!list) continue;
      for (const o of list) o.visible = false;
      this.time(part, base);
      for (const o of list) o.visible = true;
    }
    sm.autoUpdate = true;
    // last, so the frame on screen is the real one
    this.time('full', full);
    if (--this.rounds === 0) this.finish(post);
  }

  private finish(post: boolean) {
    const med = (k: string) => {
      const s = this.samples.get(k);
      if (!s) return 0;
      s.sort((a, b) => a - b);
      return s[s.length >> 1];
    };
    const ms = table(new Float64Array(IDS.length));
    const full = med('full');
    const noShadows = med('noShadows');
    const base = post ? med('noPost') : noShadows;
    ms.shadows = Math.max(0, full - noShadows);
    ms.post = post ? Math.max(0, noShadows - base) : 0;
    let parts = 0;
    for (const p of HIDEABLE) {
      if (!this.samples.has(p)) continue;
      ms[p] = Math.max(0, base - med(p));
      parts += ms[p];
    }
    ms.other = Math.max(0, base - parts);
    this.result = { ms, at: performance.now() };
    this.samples.clear();
  }
}
