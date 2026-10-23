/**
 * Dumps how two robots move through a stretch of a fight (every joint, the feet and what each is
 * doing), for drawing and measuring the motion without the 3D (see motion_clip.gd for the real thing).
 *   node --experimental-transform-types --import <register> godot/tests/motion_dump.ts <bots seed> <fight seed> <from s> <seconds> [fps] > out.json
 * Same bots and fight as motion_clip.gd with the same seeds.
 */
import { Match } from '../../src/sim/match';
import { randomBot } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';

const botsSeed = Number(process.argv[2] ?? 7);
const fightSeed = Number(process.argv[3] ?? 12345);
const from = Number(process.argv[4] ?? 3);
const secs = Number(process.argv[5] ?? 10);
const fps = Number(process.argv[6] ?? 60);
const rng = new Rng(botsSeed);
const a = randomBot(rng);
const b = randomBot(rng, 0.35, a.paint);
const m = new Match(a, b, fightSeed);
m.skipIntro();
const events: unknown[] = [];
m.on((t, d) => {
  if (t === 'hit') events.push({ f: m.frame, t, att: d.attacker.index, move: d.move.id, zone: d.zone, blocked: d.blocked, dmg: d.damage, kd: d.knockdown });
  else if (t === 'strikeStart') events.push({ f: m.frame, t, who: d.f.index, move: d.s.move.id });
  else if (t === 'dodgeStart') events.push({ f: m.frame, t, who: d.f.index, type: d.d.type });
  else if (t === 'whiff' || t === 'dodge') events.push({ f: m.frame, t, who: d.f.index });
  else if (t === 'knockdown' || t === 'stagger') events.push({ f: m.frame, t });
});
while (!(m.phase === 'fight' && m.phaseTime >= from) && m.phase !== 'end') m.step();
const every = Math.max(1, Math.round(120 / fps));
const frames: unknown[] = [];
const r = (v: number) => Math.round(v * 1000) / 1000;
const end = m.frame + Math.round(secs * 120);
for (let n = 0; m.frame < end && m.phase !== 'end'; n++) {
  if (n % every === 0) {
    frames.push({
      f: m.frame,
      phase: m.phase,
      bots: m.fighters.map((f) => {
        const s = f.strike, d = f.dodge;
        const feet = (f as any).feet as any[];
        return {
          j: f.body.pos.map((p) => [r(p.x), r(p.y), r(p.z)]),
          root: [r(f.root.x), r(f.root.z)],
          vel: [r(f.rootVel.x), r(f.rootVel.z)],
          yaw: r(f.faceYaw),
          state: f.state,
          act: s ? `${s.move.id}:${s.phase}:${r(s.t / (s.phase === 'windup' ? s.windup : s.phase === 'active' ? s.active : s.recovery))}` : d ? `${d.type}:${r(d.t / d.dur)}` : '',
          feet: feet.map((ft) => ({ s: ft.stepping ? 1 : 0, l: ft.locked ? 1 : 0 })),
          heel: f.footHeel.map(r),
          fyaw: f.footYaw.map(r),
          stance: f.stance,
          size: f.size,
          tone: r(f.body.tone),
          flow: m.brains[f.index].flowTag(),
          plan: m.brains[f.index].plan,
          intent: [r(f.intentVel.x), r(f.intentVel.z)],
        };
      }),
    });
  }
  m.step();
}
console.log(JSON.stringify({ a: a.name, b: b.name, fps, frames, events }));
