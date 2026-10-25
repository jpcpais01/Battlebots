import type { Fighter } from '../sim/fighter';
import type { Match } from '../sim/match';

/**
 * The referee's ten count over a knocked-down robot, kept from the match's own clock. The HUD's
 * count panel and the referee drone each keep one, fed the same events, so the number on the
 * drone's face is the number on the screen.
 */
export class RefCount {
  /** Fighter being counted, when the count started, the number shown, and when they rose (0 = still down). */
  cur: { f: Fighter; at: number; n: number; upAt: number } | null = null;
  /** Knockdowns already counted, per fighter (a sweep or a takedown puts them down without one). */
  private seen = [0, 0];

  /** A fight to count in (it may be joined mid-fight, after a replay's seek). */
  begin(m: Match) {
    this.cur = null;
    for (const f of m.fighters) this.seen[f.index] = f.knockdowns;
  }

  /**
   * A knockdown event: whether it's one that counts (a real knockdown, not a sweep, shove or
   * takedown), in which case the count starts. The finishing blow also reports a knockdown, after
   * 'ko': that one never counts.
   */
  knockdown(m: Match, d: Fighter): boolean {
    if (m.phase !== 'fight' || d.state === 'ko') return false;
    if (d.knockdowns <= this.seen[d.index]) return false;
    this.seen[d.index] = d.knockdowns;
    this.cur = { f: d, at: m.time, n: 0, upAt: 0 };
    return true;
  }

  /** The count is called off (a knockout, the final bell). */
  end() {
    this.cur = null;
  }

  /**
   * Move the count on: 'tick' when a new number is called, 'up' when the robot beats the count,
   * 'end' a second after that (or when the count stops for any other reason).
   */
  update(m: Match): 'tick' | 'up' | 'end' | null {
    const r = this.cur;
    if (!r) return null;
    if (r.upAt) {
      if (m.time - r.upAt <= 1) return null;
      this.cur = null;
      return 'end';
    }
    // a try that gives out, or a rest on one knee, is still on the canvas: the count goes on
    if (r.f.onCanvas) {
      const t = m.time - r.at;
      const n = t < 0.35 ? 0 : Math.min(10, 1 + Math.floor(t - 0.35));
      if (n <= r.n) return null;
      r.n = n;
      return 'tick';
    }
    if (r.f.state === 'getup' || r.f.state === 'fight' || r.f.state === 'ready') {
      r.upAt = m.time;
      return 'up';
    }
    this.cur = null;
    return 'end';
  }
}
