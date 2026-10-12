import * as THREE from 'three';
import { J } from '../sim/body';
import type { Match } from '../sim/match';
import { clamp, damp, Noise1, Rng, smoothstep } from '../sim/math';

export type CamMode = 'menu' | 'garage' | 'match';

const UP = new THREE.Vector3(0, 1, 0);
const POSTS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  return [Math.cos(a) * 5, Math.sin(a) * 5];
});

/** How badly ring posts block the view from (cx,cz) to (tx,tz). */
function postOcclusion(cx: number, cz: number, tx: number, tz: number) {
  let score = 0;
  const dx = tx - cx, dz = tz - cz;
  const len2 = dx * dx + dz * dz;
  for (const [px, pz] of POSTS) {
    const t = ((px - cx) * dx + (pz - cz) * dz) / len2;
    if (t < 0.02 || t > 0.95) continue;
    const qx = cx + dx * t - px, qz = cz + dz * t - pz;
    const d = Math.sqrt(qx * qx + qz * qz);
    if (d < 0.9) score += (0.9 - d) * 4;
  }
  return score;
}

/**
 * Broadcast-style camera: frames both fighters from the side, drifts, punches in
 * on big hits, shakes with trauma, and goes cinematic for knockdowns and KOs.
 */
export class Director {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = 'menu';
  private pos = new THREE.Vector3(0, 3, 9);
  private look = new THREE.Vector3(0, 1.2, 0);
  private trauma = 0;
  private fovKick = 0;
  private baseFov = 38;
  private noise: Noise1;
  private t = 0;
  private orbit = 0;
  private koFocus: number | null = null;
  garageTarget = new THREE.Vector3(0, 1.1, 0);
  garageYaw = 0.5;
  private narrow = false;
  private lastAng = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.noise = new Noise1(new Rng(7));
  }

  setBaseFov(f: number, narrow: boolean) {
    this.baseFov = f;
    this.narrow = narrow;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  punch(amount: number) {
    this.fovKick = Math.min(6, this.fovKick + amount);
  }
  focusKO(index: number) {
    this.koFocus = index;
  }
  reset() {
    this.koFocus = null;
    this.orbit = 0;
  }

  update(dt: number, match: Match | null) {
    this.t += dt;
    const wantPos = new THREE.Vector3();
    const wantLook = new THREE.Vector3();
    let posLambda = 2.6;
    let lookLambda = 5;
    if (this.mode === 'menu') {
      this.orbit += dt * 0.08;
      const r = 7.5;
      wantPos.set(Math.sin(this.orbit) * r, 2.6 + Math.sin(this.t * 0.2) * 0.4, Math.cos(this.orbit) * r);
      wantLook.set(0, 1.0, 0);
      posLambda = 1.5;
    } else if (this.mode === 'garage') {
      const r = this.narrow ? 4.4 : 3.6;
      wantPos.set(
        this.garageTarget.x + Math.sin(this.garageYaw) * r,
        1.55,
        this.garageTarget.z + Math.cos(this.garageYaw) * r,
      );
      wantLook.copy(this.garageTarget);
      posLambda = 4;
    } else if (match) {
      const [a, b] = match.fighters;
      const pa = a.body.pos[J.Pelvis];
      const pb = b.body.pos[J.Pelvis];
      const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
      mid.y = 0;
      const axis = new THREE.Vector3(pb.x - pa.x, 0, pb.z - pa.z);
      const sep = Math.max(0.5, axis.length());
      axis.normalize();
      const perp = new THREE.Vector3(-axis.z, 0, axis.x);
      // stay on the same side as the camera already is (no crossing the line)
      const toCam = new THREE.Vector3().subVectors(this.pos, mid).setY(0);
      if (toCam.dot(perp) < 0) perp.negate();
      const drift = this.noise.at(this.t * 0.07) * 0.5;
      let dist = clamp(2.5 + sep * 1.15, 3.7, 7);
      if (this.narrow) dist *= 1.3;
      let height = 1.25 + dist * 0.12;
      // choose an angle near the drift that has no ring post in the shot
      const dir = new THREE.Vector3();
      let best = drift;
      let bestScore = Infinity;
      for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
        const ang = drift + off;
        dir.copy(perp).applyAxisAngle(UP, ang);
        const cx = mid.x + dir.x * dist, cz = mid.z + dir.z * dist;
        const score = postOcclusion(cx, cz, mid.x, mid.z) + Math.abs(off) * 0.4 + Math.abs(ang - this.lastAng) * 0.6;
        if (score < bestScore) {
          bestScore = score;
          best = ang;
        }
      }
      this.lastAng += (best - this.lastAng) * Math.min(1, dt * 1.2);
      dir.copy(perp).applyAxisAngle(UP, this.lastAng);
      wantLook.copy(mid).setY(1.05);

      if (match.phase === 'intro') {
        const k = smoothstep(0, match.introLength, match.phaseTime);
        const ang = -1.6 + k * 1.5;
        const r = 11 - k * 4;
        dir.copy(perp).applyAxisAngle(UP, ang);
        dist = r;
        height = 5.5 - k * 3.2;
        posLambda = 6;
      } else if ((match.phase === 'ko' || match.phase === 'end') && this.koFocus !== null) {
        const loser = match.fighters[this.koFocus];
        const lp = loser.body.pos[J.Chest];
        this.orbit += dt * 0.22;
        dir.copy(perp).applyAxisAngle(UP, 0.5 + this.orbit);
        dist = 3.6;
        height = 0.9 + Math.min(1.2, this.orbit * 0.6);
        wantLook.set(lp.x, 0.6, lp.z).lerp(mid.setY(0.9), 0.35);
        mid.set(lp.x, 0, lp.z);
        posLambda = 1.6;
        lookLambda = 3;
      } else {
        // a downed fighter pulls the camera lower and closer
        const down = a.isDown || b.isDown;
        if (down) {
          height -= 0.4;
          dist *= 0.9;
        }
      }
      wantPos.copy(mid).addScaledVector(dir, dist);
      wantPos.y = height;
      // keep the camera out of the ring posts' way (above the top rope when far out)
      const r = Math.hypot(wantPos.x, wantPos.z);
      if (r > 4.3) wantPos.y = Math.max(wantPos.y, 1.6 + Math.min(0.6, (r - 4.3) * 0.5));
    }

    this.pos.x = damp(this.pos.x, wantPos.x, posLambda, dt);
    this.pos.y = damp(this.pos.y, wantPos.y, posLambda, dt);
    this.pos.z = damp(this.pos.z, wantPos.z, posLambda, dt);
    this.look.x = damp(this.look.x, wantLook.x, lookLambda, dt);
    this.look.y = damp(this.look.y, wantLook.y, lookLambda, dt);
    this.look.z = damp(this.look.z, wantLook.z, lookLambda, dt);

    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = (o: number) => this.noise.at(this.t * 28 + o);
    this.camera.position.set(this.pos.x + n(0) * sh * 0.25, this.pos.y + n(10) * sh * 0.2, this.pos.z + n(20) * sh * 0.25);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(n(30) * sh * 0.04);
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = this.baseFov - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
