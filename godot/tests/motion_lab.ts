/**
 * A motion lab: one move, step or reaction at a time, between two robots with their brains off,
 * dumped like motion_dump.ts (every joint, the feet, what each is doing) for the stick-figure tools.
 *   node --experimental-transform-types --import <register> godot/tests/motion_lab.ts <scenario> [args] > out.json
 * Scenarios (A is fighter 0, B fighter 1; B stands still in its guard unless told otherwise):
 *   strike <move[,move...]> [dist 1.0] [zone head] [guard up|down]  A throws (a list chains them;
 *                                    a move ending in ~ is feinted)
 *   move <x> <z> [secs 1.5]          A travels with a constant intent, local (x right, z forward)
 *   dodge <type> [dir 1] [reach .55] A dodges (slip, duck, sway, backstep, sidestep, sprawl, pivot:
 *                                    reach = how far round B it steps, body lengths)
 *   circle [dir 1] [secs 2]          B circles round A at a steady walk; A turns to follow
 *   idle [secs 3]                    both stand in their stances
 *   stagger [secs 1.2]               B is rocked, staggering on its feet
 *   fall <x> <z> [down|ko] [power 2.8]  B is knocked down (or out by a head shot) along a local
 *                                    direction of its own (x right, z forward: 0 -1 = over backwards)
 *   catch <move> <dump|free> [punch] [dist 1.0]  A kicks B's body, B blocks it and traps the leg:
 *                                    then sweeps A (dump) or A rips it free, with a punch first
 *   takedown <trip|throw|toss|double|elbow> [under 1] [tie lock]  A ties B up, and after a moment in
 *                                    the clinch takes B down that way (double: a shot straight in;
 *                                    elbow: a clinch elbow instead)
 * Env: FPS (60), SIZE_A / SIZE_B (frame sizes), STANCE_A (-1 orthodox, 1 southpaw), SHIFT (both
 * start that far along +x: 3.9 puts B by the ropes). fall: GETUP (force a GetupKind), KNEE (rest
 * that long on one knee first, s).
 */
import { Vector3 } from 'three';
import { Match } from '../../src/sim/match';
import { randomBot } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';
import { J } from '../../src/sim/body';
import { MOVES, type MoveId, type Zone } from '../../src/sim/moves';
import type { DodgeType } from '../../src/sim/fighter';
import { Grapple, type GrappleHost } from '../../src/sim/grapple';

const [scenario = 'idle', ...args] = process.argv.slice(2);
const fps = Number(process.env.FPS ?? 60);
const rng = new Rng(Number(process.env.BOTS ?? 7));
const a = randomBot(rng);
const b = randomBot(rng, 0.35, a.paint);
if (process.env.SIZE_A) a.size = Number(process.env.SIZE_A);
if (process.env.SIZE_B) b.size = Number(process.env.SIZE_B);
const m = new Match(a, b, Number(process.env.SEED ?? 12345));
m.skipIntro();
while (m.phase !== 'fight') m.step();
// brains and showmen off: nothing moves unless the lab says so
m.puppets = true;
const [A, B] = m.fighters;
if (process.env.STANCE_A) A.stance = Number(process.env.STANCE_A);
B.stance = -1;
const dist = Number(scenario === 'strike' ? args[1] ?? 1.0 : scenario === 'catch' ? args[3] ?? 1.0 : scenario === 'takedown' ? 0.62 : 1.4) * (A.size + B.size) * 0.5;
const shift = Number(process.env.SHIFT ?? 0);
A.place(new Vector3(shift - dist / 2, 0, 0), Math.PI / 2);
B.place(new Vector3(shift + dist / 2, 0, 0), -Math.PI / 2);
for (const f of m.fighters) {
  f.intentVel.set(0, 0, 0);
  f.guardMode = 'normal';
  f.guardDrop = 0;
  f.bounce = 0.6;
  f.stamina = f.build.stats.stamina;
}
// let both settle into their stances
for (let i = 0; i < 90; i++) m.step();

const events: unknown[] = [];
m.on((t, d) => {
  if (t === 'hit') events.push({ f: m.frame, t, att: d.attacker.index, move: d.move.id, zone: d.zone, blocked: d.blocked, dmg: d.damage, kd: d.knockdown });
  else if (t === 'strikeStart') events.push({ f: m.frame, t, who: d.f.index, move: d.s.move.id });
  else if (t === 'dodgeStart') events.push({ f: m.frame, t, who: d.f.index, type: d.d.type });
  else if (t === 'step') events.push({ f: m.frame, t, who: d.f.index, foot: d.foot });
});

const every = Math.max(1, Math.round(120 / fps));
const frames: unknown[] = [];
const r = (v: number) => Math.round(v * 1000) / 1000;
let n = 0;
function rec(steps: number) {
  for (let i = 0; i < steps && m.phase !== 'end'; i++, n++) {
    if (n % every === 0) {
      frames.push({
        f: m.frame,
        phase: m.phase,
        bots: m.fighters.map((f) => {
          const s = f.strike, d = f.dodge;
          const feet = (f as unknown as { feet: { stepping: boolean; locked: boolean; sweep: boolean; pos: Vector3 }[] }).feet;
          return {
            j: f.body.pos.map((p) => [r(p.x), r(p.y), r(p.z)]),
            root: [r(f.root.x), r(f.root.z)],
            vel: [r(f.rootVel.x), r(f.rootVel.z)],
            yaw: r(f.faceYaw),
            state: f.state,
            act: s ? `${s.move.id}:${s.phase}:${r(s.t / (s.phase === 'windup' ? s.windup : s.phase === 'active' ? s.active : s.recovery))}` : d ? `${d.type}:${r(d.t / d.dur)}` : '',
            feet: feet.map((ft) => ({ s: ft.stepping ? 1 : 0, l: ft.locked ? 1 : 0, w: ft.sweep ? 1 : 0, p: [r(ft.pos.x), r(ft.pos.z)] })),
            heel: f.footHeel.map(r),
            fyaw: f.footYaw.map(r),
            stance: f.stance,
            size: f.size,
            tone: r(f.body.tone),
            canvas: f.onCanvas ? 1 : 0,
            gk: r(f.getupProgress),
            flow: '',
            plan: '',
            intent: [r(f.intentVel.x), r(f.intentVel.z)],
          };
        }),
      });
    }
    m.step();
  }
}

rec(36);
if (scenario === 'strike') {
  const list = (args[0] ?? 'jab').split(',');
  const ids = list.map((x) => x.replace('~', '')) as MoveId[];
  const zone = (args[2] ?? 'head') as Zone;
  if (args[3] === 'down') B.guardDrop = 1;
  for (let k = 0; k < ids.length; k++) {
    // (aimed like the brain's zoneAim: the chest a touch low, a low kick at the thigh)
    const aim = B.body.pos[zone === 'head' ? J.Head : J.Chest].clone();
    if (zone === 'body') aim.y -= 0.16 * B.size;
    if (zone === 'legs') {
      aim.set(B.root.x - 0.15 * B.size, (MOVES[ids[k]].path === 'roundKick' ? 0.6 : 0.26) * B.size, B.root.z);
    }
    const feint = list[k].endsWith('~');
    if (!A.tryStrike(ids[k], zone, aim, feint)) {
      // a chained follow-up waits for its window
      for (let w = 0; w < 240 && !A.tryStrike(ids[k], zone, aim, feint); w++) rec(1);
    }
    // the next one goes once this one is into its recovery (a combination), else when it is done
    if (k < ids.length - 1) {
      while (A.strike && A.strike.phase !== 'recovery') rec(1);
    }
  }
  while (A.action) rec(1);
  rec(90);
} else if (scenario === 'move') {
  const x = Number(args[0] ?? 0), z = Number(args[1] ?? 1), secs = Number(args[2] ?? 1.5);
  const steps = Math.round(secs * 120);
  for (let i = 0; i < steps; i++) {
    // local intent: x right, z forward
    const y = A.faceYaw;
    A.intentVel.set(DMsin(y) * z - DMcos(y) * x, 0, DMcos(y) * z + DMsin(y) * x);
    rec(1);
  }
  A.intentVel.set(0, 0, 0);
  rec(120);
} else if (scenario === 'dodge') {
  A.tryDodge(args[0] as DodgeType, Number(args[1] ?? 1), Number(args[2] ?? 0.55));
  while (A.action) rec(1);
  rec(90);
} else if (scenario === 'circle') {
  const dir = Number(args[0] ?? 1), steps = Math.round(Number(args[1] ?? 2) * 120);
  for (let i = 0; i < steps; i++) {
    const y = B.faceYaw;
    B.intentVel.set(-DMcos(y) * dir * 0.9, 0, DMsin(y) * dir * 0.9);
    rec(1);
  }
  B.intentVel.set(0, 0, 0);
  rec(120);
} else if (scenario === 'stagger') {
  // B is rocked: staggered on its feet for a while
  (m as unknown as { stagger: (f: unknown, d: number) => void }).stagger(B, Number(args[0] ?? 1.2));
  rec(Math.round((Number(args[0] ?? 1.2) + 0.8) * 120));
} else if (scenario === 'fall') {
  // B is knocked down along its own local (x, z), like Match.resolveHit does it
  const x = Number(args[0] ?? 0), z = Number(args[1] ?? -1);
  const y = B.faceYaw;
  const dir = new Vector3(DMsin(y) * z - DMcos(y) * x, 0, DMcos(y) * z + DMsin(y) * x).normalize();
  const ko = args[2] === 'ko';
  if (ko) B.hp = 0;
  if (process.env.GETUP) {
    const kind = Number(process.env.GETUP);
    (B as unknown as { pickGetup: () => number }).pickGetup = () => kind;
  }
  B.knockDown(dir, Number(args[3] ?? 2.8));
  if (ko) B.fence();
  else B.breakFall(dir);
  if (process.env.KNEE) {
    // counted, and it rests on its knee until the count's rise
    const bb = B as unknown as { kneePlan: number; downTime: number; tries: unknown[] };
    bb.kneePlan = Number(process.env.KNEE);
    bb.downTime = 2.2 + bb.kneePlan;
    bb.tries.length = 0;
  }
  rec(Math.round(Number(process.env.SECS ?? 3.5) * 120));
} else if (scenario === 'catch') {
  const id = (args[0] ?? 'roundhouse') as MoveId;
  const aim = B.body.pos[J.Chest].clone();
  aim.y -= 0.16 * B.size;
  A.tryStrike(id, 'body', aim);
  const s = A.strike!;
  let caught = false;
  m.on((t, d) => {
    if (t !== 'hit' || caught || d.attacker !== A) return;
    caught = true;
    const mm = m as unknown as { grapple: Grapple | null; grappleHost: GrappleHost; frame: number };
    mm.grapple?.finish();
    const arm = d.blocked ? (s.side === 'L' ? 1 : 0) : s.side === 'L' ? 1 : 0;
    mm.grapple = Grapple.caught(mm.grappleHost, B, A, ['plum', 'plum'], mm.frame, s.side === 'L' ? 0 : 1, arm, MOVES[id].path === 'frontKick', args[1] !== 'free', args[2] === 'punch');
  });
  // B sees it coming and gets the arm there
  while (s.phase === 'windup' && s.t < s.windup * 0.4) rec(1);
  B.coverUp(MOVES[id], 'body', s.side, s.uid * 16, false);
  rec(Math.round(Number(process.env.SECS ?? 3) * 120));
} else if (scenario === 'takedown') {
  const kind = args[0] ?? 'trip';
  const mm = m as unknown as { grapple: Grapple | null; grappleHost: GrappleHost; frame: number };
  const tie = (args[2] ?? 'lock') as 'lock' | 'plum';
  m.on((t, d) => {
    if (t === 'takedown') events.push({ f: m.frame, t, kind: d.kind });
  });
  if (kind === 'double') mm.grapple = Grapple.shot(mm.grappleHost, A, B, [tie, tie], mm.frame);
  else if (kind === 'elbow') {
    mm.grapple = Grapple.clinch(mm.grappleHost, A, B, 0.1, [tie, tie], Number(args[1] ?? 1), mm.frame);
    rec(96);
    if (!A.tryStrike('clinchElbow', 'head', B.body.pos[J.Head].clone())) throw new Error('no elbow');
  } else {
    mm.grapple = Grapple.clinch(mm.grappleHost, A, B, kind === 'throw' ? 0.55 : 0.1, [tie, tie], Number(args[1] ?? 1), mm.frame);
    rec(96);
    const sure = { chance: () => true } as unknown as Rng;
    if (!mm.grapple.tryTakedown(A, kind as 'trip' | 'throw' | 'toss', sure)) throw new Error('no takedown');
  }
  rec(Math.round(Number(process.env.SECS ?? 3) * 120));
} else rec(Math.round(Number(args[0] ?? 3) * 120));

function DMsin(v: number) {
  return Math.sin(v); // det-ok: a lab, not the sim
}
function DMcos(v: number) {
  return Math.cos(v); // det-ok: a lab, not the sim
}
console.log(JSON.stringify({ a: a.name, b: b.name, fps, frames, events, moves: Object.keys(MOVES).length }));
