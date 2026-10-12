/** Frame-rate setting: the display's own rate, or a cap to save battery. */
export type FpsCap = 'max' | 60 | 30;

const KEY = 'bb.fps';
const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
const PROBE = 30;

function snap(ms: number) {
  const hz = 1000 / ms;
  let best = 60;
  for (const r of RATES) if (Math.abs(Math.log(r / hz)) < Math.abs(Math.log(best / hz))) best = r;
  return best;
}

export function loadFpsCap(): FpsCap {
  try {
    const v = localStorage.getItem(KEY);
    return v === '60' ? 60 : v === '30' ? 30 : 'max';
  } catch {
    return 'max';
  }
}

/**
 * Measures the display's refresh rate and paces frames to the chosen cap.
 *
 * The rate is read from requestAnimationFrame intervals over the first frames, which draw nothing
 * (the loading screen covers them), so the measurement isn't slowed by our own rendering. If the
 * display later turns out faster (the browser switched to high refresh), the estimate goes up.
 */
export class FramePacer {
  hz = 60;
  cap: FpsCap = loadFpsCap();
  private samples: number[] = [];
  private ticks = 0;
  private lastRaf = 0;
  private nextDraw = 0;
  private fast = 0;

  /** Frames per second the game aims for. */
  get target() {
    return this.cap === 'max' ? this.hz : Math.min(this.hz, this.cap);
  }

  setCap(cap: FpsCap) {
    this.cap = cap;
    try {
      if (cap === 'max') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(cap));
    } catch {}
  }

  /** Call on every animation frame; false means skip this one. */
  tick(now: number): boolean {
    const gap = now - this.lastRaf;
    this.lastRaf = now;
    const period = 1000 / this.hz;
    if (this.ticks < 90 && this.samples.length < PROBE) {
      this.ticks++;
      if (gap > 2 && gap < 60) this.samples.push(gap);
      // give up waiting on a page too busy to measure (keep drawing at the default)
      if (this.samples.length === PROBE || this.ticks === 90) this.measured();
      return false;
    }
    if (gap > 2 && gap < period * 0.8) {
      if (++this.fast >= 30) {
        this.hz = Math.max(this.hz, snap(gap));
        this.fast = 0;
      }
    } else this.fast = 0;
    const target = this.target;
    if (target < this.hz - 1) {
      if (now < this.nextDraw - period * 0.5) return false;
      // keep the average on the cap even when it doesn't divide the refresh rate (60 on 144 Hz)
      this.nextDraw = Math.max(this.nextDraw + 1000 / target, now - period);
    }
    return true;
  }

  private measured() {
    const s = this.samples.sort((a, b) => a - b);
    // a busy main thread only ever makes frames late, so the quicker ones show the display's rate
    if (s.length >= 8) this.hz = snap(s[Math.floor(s.length * 0.25)]);
    this.ticks = 90;
  }
}
