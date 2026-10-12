/**
 * Headless check of the fight camera: runs matches through the Director and reports
 * how well it frames the action.
 *   npm run cam -- [matches=6] [seed]
 */
import * as THREE from 'three';
import { Match, SIM_DT } from '../src/sim/match';
import { randomBot } from '../src/game/loadout';
import { Rng } from '../src/sim/math';
import { J } from '../src/sim/body';
import { Director } from '../src/render/director';

const N = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 99);
const FPS = 60;

const POSTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  return new THREE.Vector2(Math.cos(a) * 5, Math.sin(a) * 5);
});

function pct(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function run(aspect: number, fov: number, label: string) {
  const rng = new Rng(seed);
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 120);
  const fwd = new THREE.Vector3();
  const prevFwd = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const v = new THREE.Vector3();
  let frames = 0, hidden = 0, headOut = 0, bodyOut = 0, close = 0, postBlock = 0, throughRopes = 0, cuts = 0;
  const angSpeed: number[] = [];
  const linSpeed: number[] = [];
  const size: number[] = [];
  const offCenter: number[] = [];
  let seconds = 0;
  const byShot = new Map<string, { n: number; head: number; body: number; ropes: number }>();
  for (let i = 0; i < N; i++) {
    const m = new Match(randomBot(rng), randomBot(rng), rng.int(0, 1e9));
    const d = new Director(cam);
    d.setBaseFov(fov, aspect < 1.2);
    d.mode = 'match';
    d.reset();
    m.on((type, data) => {
      if (type === 'ko') d.focusKO(data.loser.index);
      d.cue(type, data);
    });
    let acc = 0;
    let first = true;
    let lastCuts = 0;
    let t = 0;
    while (m.phase !== 'end' || t < 3) {
      const dt = 1 / FPS;
      acc += dt * m.slowmo;
      let n = 0;
      while (acc >= SIM_DT && n++ < 16) {
        m.step(SIM_DT);
        acc -= SIM_DT;
      }
      d.update(dt, m);
      cam.updateMatrixWorld();
      if (m.phase === 'end') t += dt;
      if (m.time > 140) break;
      cam.getWorldDirection(fwd);
      if (!first && m.phase !== 'intro') {
        frames++;
        const ang = (prevFwd.angleTo(fwd) * 180) / Math.PI * FPS;
        const lin = prevPos.distanceTo(cam.position) * FPS;
        if (d.cuts !== lastCuts) cuts++;
        else {
          angSpeed.push(ang);
          linSpeed.push(lin);
        }
        // framing of both fighters
        let minX = 9, maxX = -9, minY = 9, maxY = -9;
        let hOut = false, bOut = false;
        // shots about one fighter (over the shoulder, KO, celebration) only owe that one a full frame
        const subj = d.shotSubject;
        for (const f of m.fighters) {
          const framed = subj < 0 || subj === f.index;
          for (let j = 0; j < 16; j++) {
            v.copy(f.body.pos[j]).project(cam);
            const out = Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1;
            if (j === J.Head && out && framed) hOut = true;
            if ((j === J.Chest || j === J.Pelvis) && out && framed) bOut = true;
            minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
            if (cam.position.distanceTo(f.body.pos[j]) < 0.6) close++;
          }
        }
        if (hOut) headOut++;
        // one fighter hiding the other
        const ca = v.copy(m.fighters[0].body.pos[J.Chest]).project(cam).x;
        const cb = v.copy(m.fighters[1].body.pos[J.Chest]).project(cam).x;
        if (Math.abs(ca - cb) < 0.1 && m.phase === 'fight' && !m.fighters[0].isDown && !m.fighters[1].isDown) hidden++;
        const k = d.shotKind;
        const e = byShot.get(k) ?? { n: 0, head: 0, body: 0, ropes: 0 };
        e.n++;
        if (hOut) e.head++;
        if (bOut) e.body++;
        byShot.set(k, e);
        if (bOut) bodyOut++;
        size.push((maxY - minY) / 2);
        offCenter.push(Math.hypot((minX + maxX) / 2, (minY + maxY) / 2));
        // ring posts between lens and either chest
        const cx = cam.position.x, cz = cam.position.z;
        let blocked = false;
        for (const f of m.fighters) {
          const p = f.body.pos[J.Chest];
          const dx = p.x - cx, dz = p.z - cz;
          const l2 = dx * dx + dz * dz;
          for (const q of POSTS) {
            const s = ((q.x - cx) * dx + (q.y - cz) * dz) / l2;
            if (s <= 0 || s >= 1) continue;
            const y = cam.position.y + (p.y - cam.position.y) * s;
            if (Math.hypot(cx + dx * s - q.x, cz + dz * s - q.y) < 0.3 && y < 1.8) blocked = true;
          }
        }
        if (blocked) postBlock++;
        // sight line to a chest crossing the ropes below the top rope
        for (const f of m.fighters) {
          const p = f.body.pos[J.Chest];
          const r0 = Math.hypot(cx, cz);
          if (r0 < 4.75) continue;
          const t = (r0 - 4.75) / Math.max(0.01, r0 - Math.hypot(p.x, p.z));
          if (t > 0 && t < 1 && cam.position.y + (0.9 - cam.position.y) * t < 1.4) {
            throughRopes++;
            byShot.get(d.shotKind)!.ropes++;
            break;
          }
        }
      }
      first = false;
      lastCuts = d.cuts;
      prevFwd.copy(fwd);
      prevPos.copy(cam.position);
      seconds += 1 / FPS;
    }
  }
  const p = (x: number) => ((x / frames) * 100).toFixed(1) + '%';
  console.log(`\n== ${label} (${N} matches, ${(seconds / 60).toFixed(1)} min) ==`);
  console.log(`head out of frame ${p(headOut)} | one hides the other ${p(hidden)} | body out ${p(bodyOut)} | lens within 0.6m of a bot ${p(close / 32)} | post in the way ${p(postBlock)} | shooting through ropes ${p(throughRopes)}`);
  console.log(`turn speed deg/s p50 ${pct(angSpeed, 0.5).toFixed(0)} p95 ${pct(angSpeed, 0.95).toFixed(0)} p99 ${pct(angSpeed, 0.99).toFixed(0)} | move m/s p50 ${pct(linSpeed, 0.5).toFixed(2)} p95 ${pct(linSpeed, 0.95).toFixed(2)}`);
  console.log(`fighters fill ${(pct(size, 0.5) * 100).toFixed(0)}% of frame height (p10 ${(pct(size, 0.1) * 100).toFixed(0)}%, p90 ${(pct(size, 0.9) * 100).toFixed(0)}%) | off-center p50 ${pct(offCenter, 0.5).toFixed(2)} p95 ${pct(offCenter, 0.95).toFixed(2)} | cuts/min ${(cuts / (seconds / 60)).toFixed(1)}`);
  console.log(
    'by shot: ' +
      [...byShot.entries()].map(([k, e]) => `${k} ${((e.n / frames) * 100).toFixed(0)}% (head out ${((e.head / e.n) * 100).toFixed(0)}%, body out ${((e.body / e.n) * 100).toFixed(0)}%, ropes ${((e.ropes / e.n) * 100).toFixed(0)}%)`).join(' | '),
  );
}

run(844 / 390, 38, 'landscape phone');
run(390 / 844, 55, 'portrait phone');
