import type { Game, Tape } from '../game/game';
import { SIM_DT } from '../sim/match';
import { button, el } from './dom';
import { ICON } from './icons';

/** Playback speeds the speed menu offers. */
export const REPLAY_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
/** How far the jump buttons (and arrow keys) go, in seconds. */
const JUMP = 5;
/** A frame step: four sim steps, one frame of 30 fps video. */
const STEP = 4;
/** Seconds without a touch before the controls fade back while playing. */
const IDLE_HIDE = 3.5;

const MARK_TITLE = { kd: 'Knockdown', tear: 'Part torn off', ko: 'Knockout' };

const clock = (frame: number) => {
  const s = Math.max(0, Math.floor(frame * SIM_DT));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const speedLabel = (s: number) => `${s}×`;

/**
 * Media-player controls for a fight replay: a scrubber with the fight's big moments marked
 * on it, play / pause, jumps of five seconds, frame steps while paused, and a speed menu
 * from a quarter speed to four times. The replay itself is the sim run again from its tape
 * (see Game.seek), so this only reads where it is and asks it to go somewhere.
 */
export class ReplayBar {
  readonly root: HTMLElement;
  private play: HTMLButtonElement;
  private time: HTMLElement;
  private track: HTMLElement;
  private fill: HTMLElement;
  private thumb: HTMLElement;
  private tip: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private speeds: HTMLElement;
  /** The scrubber being dragged: where to, in sim steps. */
  private drag: { frame: number; id: number } | null = null;
  private idle = 0;
  private shown = '';
  /** The player wants the results screen (the replay is over, or they asked for it). */
  onResults: () => void = () => {};

  constructor(
    private game: Game,
    readonly tape: Tape,
    parent: HTMLElement,
  ) {
    this.root = el('div', 'rbar interactive', '', parent);
    const track = el('div', 'rb-track', '', this.root);
    this.track = track;
    const rail = el('div', 'rb-rail', '', track);
    this.fill = el('i', 'rb-fill', '', rail);
    for (const mk of tape.marks) {
      const m = el('i', `rb-mark ${mk.kind}`, '', rail);
      m.style.left = `${(mk.frame / tape.end) * 100}%`;
      m.title = MARK_TITLE[mk.kind];
    }
    this.thumb = el('i', 'rb-thumb', '', track);
    this.tip = el('span', 'rb-tip', '', track);
    track.addEventListener('pointerdown', this.down);
    track.addEventListener('pointermove', this.move);
    track.addEventListener('pointerup', this.up);
    track.addEventListener('pointercancel', this.up);

    const row = el('div', 'rb-row', '', this.root);
    button('rb-btn', ICON.restart, () => this.seek(0), row).title = 'Back to the start';
    button('rb-btn step', ICON.stepBack, () => this.step(-1), row).title = 'Back a frame ( , )';
    button('rb-btn', ICON.back5, () => this.jump(-JUMP), row).title = `Back ${JUMP} seconds (←)`;
    this.play = button('rb-btn play', ICON.pause, () => this.toggle(), row);
    this.play.title = 'Play / pause (space)';
    button('rb-btn', ICON.ahead5, () => this.jump(JUMP), row).title = `Ahead ${JUMP} seconds (→)`;
    button('rb-btn step', ICON.stepAhead, () => this.step(1), row).title = 'Ahead a frame ( . )';
    this.time = el('span', 'rb-time', '', row);
    el('span', 'rb-gap', '', row);
    button('rb-btn rb-res', `${ICON.forward}<span>Results</span>`, () => this.onResults(), row).title = 'Skip to the result';
    const sp = el('div', 'rb-speed', '', row);
    this.speedBtn = button('rb-btn rb-chip', speedLabel(game.speed), () => this.root.classList.toggle('menu'), sp);
    this.speedBtn.title = 'Playback speed ( [ and ] )';
    this.speeds = el('div', 'rb-speeds', '', sp);
    for (const s of REPLAY_SPEEDS) {
      const b = button('', speedLabel(s), () => {
        this.setSpeed(s);
        this.root.classList.remove('menu');
      }, this.speeds);
      b.dataset.s = String(s);
    }
    window.addEventListener('keydown', this.key);
    window.addEventListener('pointerdown', this.wake, true);
    window.addEventListener('pointermove', this.wake, true);
  }

  dispose() {
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('pointerdown', this.wake, true);
    window.removeEventListener('pointermove', this.wake, true);
    this.root.remove();
  }

  // ------------------------------------------------------------------ transport
  private get end() {
    return this.tape.end;
  }

  private get ended() {
    return !this.game.seeking && this.game.replayFrame >= this.end;
  }

  private seek(frame: number) {
    this.game.seek(frame);
    this.wake();
  }

  private toggle() {
    const g = this.game;
    if (this.ended) {
      // over: watch it again from the walkout
      g.seek(0);
      g.paused = false;
    } else g.paused = !g.paused;
    g.sfx?.ui('tap');
    this.wake();
  }

  private jump(seconds: number) {
    this.seek(this.game.replayFrame + seconds / SIM_DT);
  }

  /** Step a frame, pausing first. */
  private step(dir: number) {
    this.game.paused = true;
    this.seek(this.game.replayFrame + dir * STEP);
  }

  private setSpeed(s: number) {
    this.game.speed = s;
    this.game.sfx?.ui('tap');
    this.wake();
  }

  private nudgeSpeed(dir: number) {
    const i = REPLAY_SPEEDS.indexOf(this.game.speed);
    const at = i < 0 ? REPLAY_SPEEDS.indexOf(1) : i;
    this.setSpeed(REPLAY_SPEEDS[Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, at + dir))]);
  }

  // ------------------------------------------------------------------ scrubber
  private frameAt(x: number) {
    const r = this.track.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * this.end);
  }

  private down = (e: PointerEvent) => {
    if (e.button > 0) return;
    this.track.setPointerCapture(e.pointerId);
    this.drag = { frame: this.frameAt(e.clientX), id: e.pointerId };
    this.root.classList.add('scrub');
    this.wake();
  };

  private move = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag.frame = this.frameAt(e.clientX);
  };

  private up = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.root.classList.remove('scrub');
    // a seek runs the fight to there, so it waits for the finger to come up
    if (e.type === 'pointerup') this.seek(d.frame);
  };

  // ------------------------------------------------------------------ input
  private wake = () => {
    this.idle = 0;
  };

  private key = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    // (a focused button would also take the space bar as a click)
    if (t?.tagName === 'BUTTON') t.blur();
    let used = true;
    switch (e.key) {
      case ' ':
      case 'k':
        this.toggle();
        break;
      case 'ArrowLeft':
      case 'j':
        this.jump(-JUMP);
        break;
      case 'ArrowRight':
      case 'l':
        this.jump(JUMP);
        break;
      case ',':
        this.step(-1);
        break;
      case '.':
        this.step(1);
        break;
      case '[':
        this.nudgeSpeed(-1);
        break;
      case ']':
        this.nudgeSpeed(1);
        break;
      case 'Home':
        this.seek(0);
        break;
      default:
        used = false;
    }
    if (used) e.preventDefault();
  };

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const g = this.game;
    const ended = this.ended;
    const playing = !g.paused && !ended;
    const menu = this.root.classList.contains('menu');
    if (playing && !this.drag && !menu) this.idle += dt;
    else this.idle = 0;
    const frame = this.drag ? this.drag.frame : g.replayFrame;
    const k = Math.min(1, frame / this.end);
    // positions move every frame while playing: transforms only, no layout
    this.fill.style.transform = `scaleX(${k})`;
    this.thumb.style.left = `${k * 100}%`;
    const key = `${playing}${ended}${g.seeking}${!!this.drag}${this.idle > IDLE_HIDE}${g.speed}${clock(frame)}`;
    if (key === this.shown) return;
    this.shown = key;
    const cls = this.root.classList;
    cls.toggle('paused', !playing);
    cls.toggle('ended', ended);
    cls.toggle('seeking', g.seeking);
    cls.toggle('dim', this.idle > IDLE_HIDE);
    this.play.innerHTML = ended ? ICON.replay : playing ? ICON.pause : ICON.play;
    this.time.innerHTML = `${clock(frame)}<small> / ${clock(this.end)}</small>`;
    if (this.drag) {
      this.tip.textContent = clock(frame);
      this.tip.style.left = `${k * 100}%`;
    }
    this.speedBtn.textContent = speedLabel(g.speed);
    for (const b of this.speeds.children) (b as HTMLElement).classList.toggle('on', Number((b as HTMLElement).dataset.s) === g.speed);
  }
}
