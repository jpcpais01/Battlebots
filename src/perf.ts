/**
 * Frame profiler behind the performance overlay. Off by default; while off every hook is a single
 * boolean check, so it can stay in the game loop and the sim.
 *
 * The game loop calls frame() at the start of each frame and lap(section) after each part of it, so
 * a section's cost is the time since the previous lap. Work nested inside a lap (the AI inside the
 * sim step) is timed with now() + add() and shown as part of its parent.
 */

export type Section = 'sim' | 'ai' | 'bots' | 'fx' | 'arena' | 'camera' | 'audio' | 'render' | 'hud' | 'gpu';

export const SECTIONS: { id: Section; label: string; parent?: Section }[] = [
  { id: 'sim', label: 'Sim' },
  { id: 'ai', label: 'AI', parent: 'sim' },
  { id: 'bots', label: 'Bot anim' },
  { id: 'fx', label: 'Effects' },
  { id: 'arena', label: 'Arena' },
  { id: 'camera', label: 'Camera' },
  { id: 'audio', label: 'Audio' },
  { id: 'render', label: 'Render CPU' },
  { id: 'hud', label: 'HUD' },
];

export interface PerfReport {
  fps: number;
  /** Mean time between frames, ms. */
  frame: number;
  /** Slowest frame in the window, ms. */
  worst: number;
  /** Mean ms per frame for each section. */
  ms: Record<Section, number>;
  /** Sum of the top-level CPU sections, ms. */
  cpu: number;
  /** Mean GPU ms per frame, or null when the device can't measure it. */
  gpu: number | null;
  draws: number;
  tris: number;
}

const WINDOW = 0.5; // seconds per report
const now = () => performance.now();
const zero = (): Record<Section, number> => ({ sim: 0, ai: 0, bots: 0, fx: 0, arena: 0, camera: 0, audio: 0, render: 0, hud: 0, gpu: 0 });

class Perf {
  on = false;
  /** Called with fresh averages every half second while on. */
  onReport: ((r: PerfReport) => void) | null = null;
  /** Recent frame intervals in ms, oldest first (ring buffer read via history()). */
  readonly frames = new Float32Array(180);
  private head = 0;
  private last = 0;
  private start = 0;
  private winStart = 0;
  private count = 0;
  private worst = 0;
  private sum = zero();
  private gpuSamples = 0;
  gpuSupported = false;
  draws = 0;
  tris = 0;

  /** Start of a game frame. */
  frame() {
    if (!this.on) return;
    const t = now();
    const gap = t - this.start;
    this.start = this.last = t;
    if (!this.winStart || gap > 250) {
      // first frame, or back from a hidden tab: don't count the pause
      this.winStart = t;
      this.count = 0;
      this.worst = 0;
      this.sum = zero();
      this.gpuSamples = 0;
      return;
    }
    this.frames[this.head] = gap;
    this.head = (this.head + 1) % this.frames.length;
    this.count++;
    if (gap > this.worst) this.worst = gap;
    const span = t - this.winStart;
    if (span >= WINDOW * 1000) this.report(span);
  }

  /** Charge the time since the previous lap to `s`. */
  lap(s: Section) {
    if (!this.on) return;
    const t = now();
    this.sum[s] += t - this.last;
    this.last = t;
  }

  /** Timestamp for add(), or 0 while off. */
  now() {
    return this.on ? now() : 0;
  }

  /** Charge the time since `t0` (from now()) to `s` without moving the lap. */
  add(s: Section, t0: number) {
    if (this.on) this.sum[s] += now() - t0;
  }

  gpu(ms: number) {
    if (!this.on) return;
    this.sum.gpu += ms;
    this.gpuSamples++;
  }

  /** Frame intervals oldest → newest. */
  history(out: number[]) {
    out.length = 0;
    const n = this.frames.length;
    for (let i = 0; i < n; i++) {
      const v = this.frames[(this.head + i) % n];
      if (v > 0) out.push(v);
    }
    return out;
  }

  private report(span: number) {
    const n = Math.max(1, this.count);
    const ms = zero();
    let cpu = 0;
    for (const { id, parent } of SECTIONS) {
      ms[id] = this.sum[id] / n;
      if (!parent) cpu += ms[id];
    }
    const gpu = this.gpuSamples ? this.sum.gpu / this.gpuSamples : null;
    this.onReport?.({ fps: (this.count * 1000) / span, frame: span / n, worst: this.worst, ms, cpu, gpu, draws: this.draws, tris: this.tris });
    this.winStart = this.start;
    this.count = 0;
    this.worst = 0;
    this.sum = zero();
    this.gpuSamples = 0;
  }

  setOn(on: boolean) {
    this.on = on;
    this.winStart = 0;
    this.frames.fill(0);
  }
}

export const perf = new Perf();
