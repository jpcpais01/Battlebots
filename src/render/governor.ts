/**
 * Adaptive render resolution. Steps the pixel ratio down while frames are slow and back up when
 * there is headroom, but never climbs back to a level that has already proven too slow.
 *
 * Without that memory, a phone whose cost sits between two levels flip-flops forever: 60 Hz vsync
 * makes every frame either 16.7 ms or 33.3 ms, so the higher level reads as "slow" and the lower one
 * as "fast". Every switch reallocates the canvas and post-processing targets and visibly changes
 * sharpness and bloom, which reads as the screen flickering every few seconds.
 */
export class ResolutionGovernor {
  ratio: number;
  private ceiling = Infinity;
  private times: number[] = [];
  private cooldown = 0;
  private lastMove: 'up' | 'down' | null = null;

  constructor(
    device: number,
    readonly min = 0.75,
    readonly step = 0.25,
  ) {
    this.ratio = device;
  }

  /** Feed one frame time. `device` is the highest useful ratio. Returns true when `ratio` changed. */
  sample(dt: number, device: number): boolean {
    const t = this.times;
    t.push(dt);
    if (t.length > 90) t.shift();
    this.cooldown -= dt;
    if (this.cooldown > 0 || t.length < 60) return false;
    const avg = trimmedMean(t);
    if (avg > 1 / 45 && this.ratio > this.min) {
      // the level we just climbed back to is still too slow: settle below it for good
      if (this.lastMove === 'up') this.ceiling = this.ratio - this.step;
      this.ratio = Math.max(this.min, this.ratio - this.step);
      this.moved('down', 2);
      return true;
    }
    const top = Math.min(device, this.ceiling);
    if (avg < 1 / 58 && this.ratio < top) {
      this.ratio = Math.min(top, this.ratio + this.step);
      this.moved('up', 4);
      return true;
    }
    return false;
  }

  private moved(dir: 'up' | 'down', cooldown: number) {
    this.lastMove = dir;
    this.cooldown = cooldown;
    this.times.length = 0;
  }
}

/** Mean frame time ignoring the slowest 10%, so a few hitches (shader compiles, GC) don't drop resolution. */
function trimmedMean(t: number[]): number {
  const s = t.slice().sort((a, b) => a - b);
  const n = Math.max(1, Math.floor(s.length * 0.9));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += s[i];
  return sum / n;
}
