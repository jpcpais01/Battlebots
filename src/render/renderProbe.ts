import type * as THREE from 'three';
import { perf } from '../perf';

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/**
 * Wraps the render call while the performance overlay is on: counts draw calls and triangles for the
 * whole frame (shadow map and post passes included) and, where the browser exposes GPU timer queries
 * (most desktop browsers, few phones), how long the GPU spent on it.
 */
export class RenderProbe {
  private gl: WebGL2RenderingContext | null;
  private ext: TimerExt | null = null;
  private free: WebGLQuery[] = [];
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private wasOn = false;

  constructor(private renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
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
      // the extension is only looked up once someone opens the overlay
      if (this.gl && !this.ext) this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
      perf.gpuSupported = !!this.ext;
    }
    // post-processing renders several passes, each of which would reset the counters
    info.autoReset = false;
    info.reset();
    this.poll();
    const gl = this.gl;
    if (gl && this.ext && this.pending.length < 6) {
      const q = this.free.pop() ?? gl.createQuery();
      if (q) {
        gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
        this.active = q;
      }
    }
  }

  end() {
    if (!this.wasOn) return;
    if (this.active && this.gl && this.ext) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.active);
      this.active = null;
    }
    const r = this.renderer.info.render;
    perf.draws = r.calls;
    perf.tris = r.triangles;
  }

  /** Collect finished GPU timings; results arrive a frame or two late. */
  private poll() {
    const gl = this.gl;
    const ext = this.ext;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      if (!disjoint) perf.gpu(ns / 1e6);
      this.free.push(this.pending.shift()!);
    }
  }
}
