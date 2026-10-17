// Reference renders of the web game's fight HUD (src/ui/hud.ts) for matching the Godot port
// (godot/game/hud/): a real Match plays in real time under the real Hud, and at each named moment
// the sim and every CSS animation freeze while hud_ref.mjs takes the picture.
//   node godot/tools/bake/web/hud_ref.mjs <out dir> [seed=N] [scan=1]
// The bots and fight seed come from Rng(seed), as godot/tests/hud_shots.gd makes them, so both
// games play the same fight.
import * as THREE from 'three';
import { Match, SIM_DT } from '../../../../src/sim/match';
import { Rng } from '../../../../src/sim/math';
import { randomBot } from '../../../../src/game/loadout';
import { Hud } from '../../../../src/ui/hud';
import { el } from '../../../../src/ui/dom';
import type { Game } from '../../../../src/game/game';

declare global {
  interface Window {
    __snap: string | null;
    __resume: boolean;
    __log: string[];
  }
}

export function makeMatch(seed: number) {
  const rng = new Rng(seed);
  const a = randomBot(rng);
  const b = randomBot(rng, 0.35, a.paint);
  return new Match(a, b, rng.int(0, 1e9));
}

/** What happens in each fight (for picking a seed that shows everything). */
function scan() {
  const out: string[] = [];
  for (let s = 1; s <= 60; s++) {
    const m = makeMatch(s);
    m.skipIntro();
    const seen: Record<string, number> = {};
    m.on((t, d) => {
      const k = t === 'ko' ? `ko:${(d as { kind: string }).kind}` : t;
      seen[k] = (seen[k] ?? 0) + 1;
    });
    for (let i = 0; i < 140 / SIM_DT && m.phase !== 'end'; i++) m.step(SIM_DT);
    const keys = ['knockdown', 'finisher', 'ko:KO', 'ko:TKO', 'ko:Dismantled', 'decision', 'detach', 'stagger', 'clinch', 'dodge', 'sprawl'];
    out.push(`${s} t=${m.time.toFixed(1)} ` + keys.filter((k) => seen[k]).map((k) => `${k}=${seen[k]}`).join(' '));
  }
  return out.join('\n');
}

export async function run() {
  const q = new URLSearchParams(location.search);
  if (q.get('scan')) return scan();
  const seed = Number(q.get('seed') ?? 7);
  const more = (q.get('more') ?? '').split(',');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/src/style.css';
  document.head.appendChild(link);
  await new Promise((r) => (link.onload = r));
  document.body.style.cssText = 'margin:0;background:radial-gradient(ellipse at 50% 60%,#5a6070,#20242c 70%)';
  document.getElementById('c')?.remove();
  const ui = el('div', '', '', document.body);
  ui.id = 'ui';
  const cam = new THREE.PerspectiveCamera(38, 1280 / 720, 0.1, 100);
  cam.position.set(0, 1.9, 7.2);
  cam.lookAt(0, 1.0, 0);
  cam.updateMatrixWorld();
  const director = { pov: -1, zoom: 'normal' };
  const game = { director, sfx: null, stage: { camera: cam }, tape: null, speed: 1 } as unknown as Game;
  const hud = new Hud(game, ui);
  hud.root.classList.add('show');
  const m = makeMatch(seed);
  m.skipIntro();
  hud.onCoach = (k) => m.queueCoach(0, k);
  hud.attach(m);
  window.__log = [];
  // the moments: [name, when (event or test), how long after it, in ms]
  const pending: { name: string; at: number }[] = [];
  const firsts = new Set<string>();
  const mark = (name: string, ms: number) => {
    if (firsts.has(name)) return;
    firsts.add(name);
    pending.push({ name, at: performance.now() + ms });
  };
  m.on((t, d) => {
    const dd = d as { damage?: number; blocked?: boolean; crit?: boolean; counter?: boolean; s?: { move: { ability?: string }; feint: boolean } };
    window.__log.push(`${m.time.toFixed(2)} ${t}`);
    if (t === 'hit' && !dd.blocked && (dd.damage ?? 0) >= 8) mark('hit', 260);
    if (t === 'hit' && dd.crit) mark('crit', 300);
    if (t === 'stagger') mark('stagger', 350);
    if (t === 'knockdown') {
      mark('knockdown', 500);
      mark('count', 2600);
    }
    if (t === 'coach') mark('coach', 450);
    if (t === 'fightStart') mark('fight', 300);
    if (t === 'strikeStart' && dd.s?.move.ability && !dd.s.feint) mark('ability', 350);
    if (t === 'finisher') mark('finisher', 600);
    if (t === 'ko') {
      mark('finish', 900 + 450);
      mark('finish_dock', 900 + 2600);
    }
    if (t === 'decision') mark('time', 600);
    // more=calls: in-between frames of the big calls' animations (godot/game/hud/hud_calls.gd)
    if (more.includes('calls')) {
      const at: Record<string, [string, number][]> = {
        fightStart: [['fight_a', 90], ['fight_b', 700], ['fight_c', 1150]],
        knockdown: [['kd_a', 120], ['kd_b', 1000]],
        stagger: [['stagger_a', 90]],
        finisher: [['finisher_a', 150], ['finisher_b', 1600], ['finisher_c', 2500]],
        ko: [['finish_a', 900 + 120], ['finish_b', 900 + 260], ['finish_c', 900 + 800], ['finish_d', 900 + 1350]],
      };
      for (const [name, ms] of at[t] ?? []) mark(name, ms);
      // more=calls,tko (or dsm): the knockout shown as a TKO (or torn apart), for their looks
      const pf = (hud as unknown as { pendingFinish: { kind: string; reason: string | null } | null }).pendingFinish;
      if (t === 'ko' && pf && more.includes('tko')) pf.kind = 'TKO';
      if (t === 'ko' && pf && more.includes('dsm')) Object.assign(pf, { kind: 'Dismantled', reason: 'head' });
    }
  });
  // the countdown and the FIGHT! call, by the clock
  let acc = 0;
  let last = performance.now();
  let coached = false;
  let paused = false;
  let frozen: Animation[] = [];
  for (;;) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    if (paused) {
      if (!window.__resume) continue;
      window.__resume = false;
      paused = false;
      for (const a of frozen) a.play();
      frozen = [];
      // (the pause didn't happen, as far as the next moment's timer goes)
      const gap = now - last;
      for (const p of pending) p.at += gap;
      last = now;
      continue;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= SIM_DT) {
      // the corner calls Go in! five seconds in, at the same step as the Godot shots do
      if (m.phase === 'fight' && m.phaseTime >= 5 && !coached) {
        coached = true;
        m.queueCoach(0, 'go');
      }
      m.step(SIM_DT);
      acc -= SIM_DT;
    }
    hud.update(dt);
    if (m.phase === 'countdown' && m.phaseTime > 0.3) mark('count3', 0);
    if (m.phase === 'countdown' && m.phaseTime > 2.45) mark('count1', 0);
    if (more.includes('calls') && m.phase === 'countdown' && m.phaseTime > 1.08) mark('count2_a', 0);
    if (more.includes('calls') && m.phase === 'end' && m.phaseTime > 0.25) mark('end_a', 0);
    if (m.phase === 'fight' && m.phaseTime > 3) mark('ready', 0);
    if (document.querySelector('.refcount.on')) mark('refcount', 2300);
    if (document.querySelector('.refcount.up')) mark('refup', 250);
    if (document.querySelector('.finready-on')) mark('finready', 300);
    if (document.querySelector('.callout.go')) mark('callout', 250);
    if (m.phase === 'end' && m.phaseTime > 4) return `done at ${m.time.toFixed(1)}\n${firsts.size} moments`;
    const due = pending.findIndex((p) => now >= p.at);
    if (due >= 0) {
      const p = pending.splice(due, 1)[0];
      frozen = document.getAnimations().filter((a) => a.playState === 'running');
      for (const a of frozen) a.pause();
      paused = true;
      window.__snap = `${p.name} t=${m.time.toFixed(2)} phase=${m.phase}`;
    }
  }
}
