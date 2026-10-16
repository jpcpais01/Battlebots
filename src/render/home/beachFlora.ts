import * as THREE from 'three';
import { Baker, surf, vertexPBR } from '../bake';
import { G } from '../parts';
import type { Quality } from '../stage';
import { canvas, hash, normalTexture, putS, seg, smooth, texture } from './scene';
import { groundH, inland, shoreZ, vnoise } from './beachWorld';

/**
 * The beach's plants: coconut palms (curving ringed trunks, crowns of arching fronds with every
 * leaflet drawn, coconuts and the boot of old frond bases), sea grape and naupaka bushes along the
 * back of the beach, morning glory creeping out over the sand, grass, and the jungle on the hills.
 */

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

/** A palm: foot (x, z), height, the bearing it leans towards (0: the sea, -z), how far its crown leans out, and a seed. */
export interface Palm {
  x: number;
  z: number;
  h: number;
  yaw: number;
  lean: number;
  seed: number;
}

const S = {
  husk: surf(0x8a6f48, 0, 0.92),
  fibre: surf(0x6b5638, 0, 0.95),
  petiole: surf(0x8f9a4c, 0, 0.7),
  petioleOld: surf(0x9c8550, 0, 0.8),
  nutGreen: surf(0x6f8a2e, 0, 0.45),
  nutYellow: surf(0xc0a23a, 0, 0.45),
  nutBrown: surf(0x6a4a2a, 0, 0.8),
};

// ------------------------------------------------------------------ textures

/** A frond, both ways: left the living green one, right a dead brown one. Leaflets angle out and forward from the midrib. */
function frondTexture() {
  const W = 256, H = 1024;
  const { c, g } = canvas(W * 2, H);
  g.clearRect(0, 0, W * 2, H);
  for (const dry of [false, true]) {
    const ox = dry ? W : 0;
    const cx = ox + W / 2;
    const n = 56;
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const k = i * 2 + (s > 0 ? 1 : 0);
        const r = hash(k * 3.17 + (dry ? 9 : 0));
        if (r < (dry ? 0.16 : 0.05)) continue; // a gap where a leaflet has torn away
        const y0 = H - 14 - i * ((H - 30) / n) - hash(k * 1.9) * 6;
        const fwd = 70 + hash(k * 2.3) * 40 + (i / n) * 30;
        const len = (W / 2 - 4) * (r < 0.12 ? 0.6 : 1);
        const x1 = cx + s * len, y1 = y0 - fwd;
        const mx = cx + s * len * 0.5, my = y0 - fwd * 0.35 + 8;
        const wid = 4.5 + hash(k * 4.1) * 2.5;
        // the blade: a tapered sliver, curving out to its tip
        const grad = g.createLinearGradient(cx, y0, x1, y1);
        if (dry) {
          grad.addColorStop(0, '#9a7a4a');
          grad.addColorStop(0.5, hash(k * 5.1) > 0.5 ? '#b49264' : '#8c6c40');
          grad.addColorStop(1, '#6f5432');
        } else {
          const tone = hash(k * 5.1);
          grad.addColorStop(0, '#8fa040');
          grad.addColorStop(0.25, tone > 0.5 ? '#4f8a2c' : '#457f28');
          grad.addColorStop(0.8, tone > 0.3 ? '#3c7425' : '#4a8430');
          grad.addColorStop(1, hash(k * 6.7) > 0.8 ? '#a49a4c' : '#5c8a34');
        }
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx, y0 - wid * 0.4);
        g.quadraticCurveTo(mx, my - wid, x1, y1);
        g.quadraticCurveTo(mx, my + wid, cx, y0 + wid * 0.6);
        g.closePath();
        g.fill();
        // a pale midvein down each leaflet catching the light
        g.strokeStyle = dry ? 'rgba(220,190,140,0.35)' : 'rgba(200,225,140,0.4)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx, y0);
        g.quadraticCurveTo(mx, my, x1, y1);
        g.stroke();
      }
    }
    // the midrib, thick and yellow-green at the base, thinning to the tip
    for (let y = 0; y < H; y += 4) {
      const v = 1 - y / H;
      g.fillStyle = dry ? '#7d6038' : '#b4ad58';
      const w = 2 + 9 * v;
      g.fillRect(cx - w / 2, y, w, 5);
    }
  }
  const t = texture(c);
  t.anisotropy = 8;
  return t;
}

/** Palm bark: grey-brown, ringed by old leaf scars, fissured, with lichen. Returns colour and a normal map. */
function barkTextures() {
  const W = 128, H = 256;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#8a7c6a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = hash(i * 1.7) > 0.5 ? 'rgba(160,150,135,0.25)' : 'rgba(70,60,50,0.2)';
    g.fillRect(hash(i * 2.3) * W, hash(i * 3.9) * H, 2 + hash(i * 5.1) * 6, 1 + hash(i * 4.7) * 3);
  }
  // the rings: a dark groove with a pale lip above it, wavering round the trunk
  const height = new Float32Array(W * H).fill(0.5);
  const nRings = 22;
  for (let r = 0; r < nRings; r++) {
    const y0 = (r + 0.5) * (H / nRings);
    for (let x = 0; x < W; x++) {
      const y = y0 + 2.2 * Math.sin((x / W) * Math.PI * 2 * 2 + r * 1.7) + 1.2 * Math.sin((x / W) * Math.PI * 2 * 5 + r);
      g.fillStyle = 'rgba(48,40,32,0.6)';
      g.fillRect(x, y, 1, 2);
      g.fillStyle = 'rgba(190,180,160,0.35)';
      g.fillRect(x, y - 2, 1, 2);
      for (let k = -4; k <= 4; k++) {
        const yy = Math.round(y + k);
        if (yy < 0 || yy >= H) continue;
        height[yy * W + x] += k >= 0 && k < 2 ? -0.5 : k < 0 && k > -3 ? 0.25 : 0;
      }
    }
  }
  // vertical fissures, and pale lichen
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 6.1) * W, y = hash(i * 2.9) * H, l = 6 + hash(i * 3.3) * 14;
    g.fillStyle = 'rgba(50,42,34,0.35)';
    g.fillRect(x, y, 1, l);
    for (let k = 0; k < l; k++) {
      const yy = Math.floor(y + k) % H;
      height[yy * W + (Math.floor(x) % W)] -= 0.3;
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = hash(i * 8.3) > 0.5 ? 'rgba(200,205,180,0.35)' : 'rgba(170,180,150,0.3)';
    g.beginPath();
    g.ellipse(hash(i * 1.3) * W, hash(i * 7.7) * H, 2 + hash(i * 2.2) * 5, 1.5 + hash(i * 3.6) * 3, 0, 0, Math.PI * 2);
    g.fill();
  }
  const map = texture(c, true);
  const normal = normalTexture(height, W, H, 1.6);
  return { map, normal };
}

/** Clusters of round, waxy sea grape and naupaka leaves, with a few half-flowers. */
function bushTexture() {
  const N = 256;
  const { c, g } = canvas(N, N);
  g.clearRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) {
    const a = hash(i * 1.3) * Math.PI * 2, r = Math.sqrt(hash(i * 2.7)) * 96;
    const x = N / 2 + Math.cos(a) * r, y = N / 2 + Math.sin(a) * r * 0.9;
    const s = 15 + hash(i * 3.1) * 13;
    const tone = hash(i * 4.9);
    const lg = g.createRadialGradient(x - s * 0.3, y - s * 0.3, 2, x, y, s);
    lg.addColorStop(0, tone > 0.6 ? '#8fbf5a' : tone > 0.25 ? '#6fa448' : '#a6bf5c');
    lg.addColorStop(1, tone > 0.6 ? '#3d6e2a' : '#2f5c22');
    g.fillStyle = lg;
    g.beginPath();
    g.ellipse(x, y, s, s * (0.75 + 0.2 * hash(i * 5.3)), a, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(220,240,170,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * s * 0.8, y - Math.sin(a) * s * 0.8);
    g.lineTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const x = 50 + hash(i * 9.1) * 156, y = 50 + hash(i * 7.3) * 156;
    for (let p = 0; p < 5; p++) {
      const a = Math.PI + (p / 4) * Math.PI;
      g.fillStyle = '#fbf8f0';
      g.beginPath();
      g.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.5, 2.2, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  return texture(c);
}

/** A clump of a broadleaf tree's crown: small leaves massed into billows, lit from above, dark in the hollows between. */
function canopyTexture() {
  const N = 256;
  const { c, g } = canvas(N, N);
  g.clearRect(0, 0, N, N);
  const greens = [[74, 128, 46], [92, 146, 52], [62, 112, 40], [110, 158, 60], [84, 136, 44]];
  for (let b = 0; b < 7; b++) {
    const a = hash(b * 3.7) * Math.PI * 2, r = b ? 30 + hash(b * 1.9) * 40 : 0;
    const cx = N / 2 + Math.cos(a) * r, cy = N / 2 + Math.sin(a) * r * 0.85;
    const R = 46 + hash(b * 5.3) * 20;
    for (let i = 0; i < 260; i++) {
      const la = hash(b * 97 + i * 1.31) * Math.PI * 2, lr = Math.sqrt(hash(b * 31 + i * 2.17)) * R;
      const x = cx + Math.cos(la) * lr, y = cy + Math.sin(la) * lr;
      // lit from the top left, darker towards the billow's lower edge and its middle
      const lit = 0.55 + 0.6 * (0.5 - (y - cy) / (2 * R)) * 0.9 + 0.25 * (0.5 - (x - cx) / (2 * R)) - 0.25 * (lr / R < 0.4 ? 1 - lr / R / 0.4 : 0) * 0.3;
      const gcol = greens[Math.floor(hash(b * 13 + i * 0.77) * greens.length)];
      const k = Math.max(0.35, Math.min(1.35, lit + (hash(i * 4.1 + b) - 0.5) * 0.3));
      g.fillStyle = `rgb(${Math.round(gcol[0] * k)},${Math.round(gcol[1] * k)},${Math.round(gcol[2] * k)})`;
      g.beginPath();
      g.ellipse(x, y, 3.5 + hash(i * 2.2 + b) * 4, 2 + hash(i * 3.3 + b) * 2.2, hash(i * 5.5 + b) * 3.14, 0, Math.PI * 2);
      g.fill();
    }
  }
  return texture(c);
}

/** Beach morning glory: runners with notched, rounded leaves and pink trumpet flowers. */
function vineTexture() {
  const N = 256;
  const { c, g } = canvas(N, N);
  g.clearRect(0, 0, N, N);
  const runners = 3;
  for (let r = 0; r < runners; r++) {
    const y0 = 50 + r * 75 + hash(r * 3.3) * 20;
    g.strokeStyle = '#7a6a3a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= N; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.04 + r) * 10);
    g.stroke();
    for (let k = 0; k < 9; k++) {
      const x = 14 + k * 28 + hash(r * 9 + k) * 8;
      const y = y0 + Math.sin(x * 0.04 + r) * 10;
      const side = k % 2 ? 1 : -1;
      const lx = x + side * 4, ly = y + side * 16;
      const s = 12 + hash(r * 7 + k) * 5;
      g.strokeStyle = '#6c7a34';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(lx, ly);
      g.stroke();
      const lg = g.createRadialGradient(lx - 3, ly - 3, 1, lx, ly, s);
      lg.addColorStop(0, '#78a848');
      lg.addColorStop(1, '#3d6c28');
      g.fillStyle = lg;
      // two rounded lobes, notched at the tip
      g.beginPath();
      g.ellipse(lx - s * 0.32, ly + side * s * 0.25, s * 0.55, s * 0.7, 0.3, 0, Math.PI * 2);
      g.ellipse(lx + s * 0.32, ly + side * s * 0.25, s * 0.55, s * 0.7, -0.3, 0, Math.PI * 2);
      g.fill();
      if (hash(r * 13 + k * 2.1) > 0.74) {
        // a flower: a pink trumpet, deeper pink in the throat
        const fx = x - side * 6, fy = y - side * 14, fr = 9 + hash(k * 4.4) * 3;
        const fg = g.createRadialGradient(fx, fy, 1, fx, fy, fr);
        fg.addColorStop(0, '#9c1f66');
        fg.addColorStop(0.3, '#d94a9c');
        fg.addColorStop(1, '#f39acb');
        g.fillStyle = fg;
        g.beginPath();
        for (let p = 0; p <= 10; p++) {
          const a = (p / 10) * Math.PI * 2;
          const rr = fr * (p % 2 ? 0.86 : 1);
          if (p === 0) g.moveTo(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr);
          else g.lineTo(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr);
        }
        g.fill();
      }
    }
  }
  return texture(c);
}

/** A tuft of grass: blades fanning up from the root, bleached towards the tips. */
function grassTexture() {
  const { c, g } = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const x0 = 64 + (hash(i * 3.1) - 0.5) * 34;
    const lean = (hash(i * 7.3) - 0.5) * 2;
    const h = 54 + hash(i * 5.7) * 66;
    const x1 = x0 + lean * 46, y1 = 126 - h;
    const grad = g.createLinearGradient(0, 128, 0, y1);
    grad.addColorStop(0, '#4f6a2a');
    grad.addColorStop(0.55, '#8ea84e');
    grad.addColorStop(1, hash(i * 2.9) > 0.5 ? '#dcd59a' : '#b9c070');
    g.strokeStyle = grad;
    g.lineWidth = 2.4 + hash(i * 1.3) * 1.6;
    g.beginPath();
    g.moveTo(x0, 128);
    g.quadraticCurveTo(x0 + lean * 10, 128 - h * 0.55, x1, y1);
    g.stroke();
  }
  return texture(c);
}

// ------------------------------------------------------------------ shading helpers

/** Sunlight glowing through leaves seen against the sun. */
export function backlit(mat: THREE.MeshStandardMaterial, k: number, sunView: { value: THREE.Vector3 }) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uSunView = sunView;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += diffuseColor.rgb * vec3(1.0, 0.96, 0.7) * ${k.toFixed(2)} * pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 3.0);
        #include <opaque_fragment>`,
      );
  };
}

/** Leaves stirring in the breeze: `sway` (0 at the stem, 1 at the tips) weights it; instances get their own phase. */
function breeze(mat: THREE.MeshStandardMaterial, sway: { value: number }, amp: number, key: string) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uSway = sway;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec2 sp = instanceMatrix[3].xz;
        #else
        vec2 sp = position.xz * 0.35;
        #endif
        float sw = sway * sway;
        float gust = 0.6 + 0.4 * sin(uSway * 0.23 + sp.x * 0.05);
        transformed += vec3(
          sin(uSway * 1.05 + sp.x * 0.9 + sp.y * 0.6 + position.y * 0.3) * 0.7 + 0.5,
          0.45 * sin(uSway * 1.7 + sp.y * 1.1 + position.x * 0.4),
          cos(uSway * 0.85 + sp.x * 0.7 + position.z * 0.3) * 0.6
        ) * ${amp.toFixed(3)} * sw * gust;`,
      );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ------------------------------------------------------------------ palms

type Buf = { pos: number[]; nor: number[]; uv: number[]; col: number[]; sway: number[]; idx: number[] };
const buf = (): Buf => ({ pos: [], nor: [], uv: [], col: [], sway: [], idx: [] });

const _p = new V3(), _t = new V3(), _e1 = new V3(), _e2 = new V3(), _q = new V3();

/** Collects palms into a few big meshes: trunks, fronds and the crowns' baked bits, near (casting shadows) and far. */
export class Grove {
  private trunk = [buf(), buf()];
  private fronds = [buf(), buf()];
  private bits = [new Baker(), new Baker()];
  /** Where each palm's trunk stands (for keeping other things clear of them), and the crowns. */
  readonly feet: { x: number; z: number }[] = [];
  readonly crowns: THREE.Vector3[] = [];

  /** Point and tangent along a palm's trunk at s (0 foot, 1 crown). */
  static trunkAt(p: Palm, s: number, out: THREE.Vector3, tan?: THREE.Vector3) {
    const dx = Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    const y0 = groundH(p.x, p.z) - 0.25;
    // a quadratic: leaning out from the foot, curving up towards the light
    const p0x = p.x, p0y = y0, p0z = p.z;
    const p1x = p.x + dx * p.lean * 0.72, p1y = y0 + p.h * 0.36, p1z = p.z + dz * p.lean * 0.72;
    const p2x = p.x + dx * p.lean, p2y = y0 + p.h, p2z = p.z + dz * p.lean;
    const a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
    // and a gentle wander sideways
    const w = 0.1 * Math.sin(Math.PI * s * 1.4 + p.seed) * (p.h / 8);
    out.set(a * p0x + b * p1x + c * p2x - dz * w, a * p0y + b * p1y + c * p2y, a * p0z + b * p1z + c * p2z + dx * w);
    if (tan) {
      tan.set(2 * (1 - s) * (p1x - p0x) + 2 * s * (p2x - p1x), 2 * (1 - s) * (p1y - p0y) + 2 * s * (p2y - p1y), 2 * (1 - s) * (p1z - p0z) + 2 * s * (p2z - p1z)).normalize();
    }
    return out;
  }

  add(p: Palm, hero: boolean) {
    const L = hero ? 0 : 1;
    this.feet.push({ x: p.x, z: p.z });
    this.addTrunk(p, this.trunk[L], hero);
    const top = Grove.trunkAt(p, 1, new V3());
    this.crowns.push(top.clone());
    const b = this.bits[L];
    // the boot: old frond bases wrapped round under the crown, and their fibre
    putS(b, G.sphere(1, 8, 6), top.x, top.y - 0.12, top.z, S.fibre, 0.24, 0.3, 0.24);
    const nb = hero ? 12 : 6;
    for (let k = 0; k < nb; k++) {
      const yaw = p.seed * 1.3 + k * 2.39996;
      const el = 0.35 + 0.45 * hash(p.seed * 3 + k);
      const d = new V3(Math.sin(yaw) * Math.cos(el), Math.sin(el), -Math.cos(yaw) * Math.cos(el));
      const a = top.clone().add(new V3(0, -0.1 - 0.12 * (k % 3), 0));
      seg(b, a, a.clone().addScaledVector(d, 0.45 + 0.2 * hash(k + p.seed)), 0.075, 0.035, k % 3 ? S.petiole : S.petioleOld, hero ? 6 : 4);
    }
    // coconuts, in clusters hanging under the crown
    const nc = hero ? 2 + Math.floor(hash(p.seed * 5.1) * 2) : 1;
    for (let c = 0; c < nc; c++) {
      const ca = p.seed * 2.1 + c * 2.3;
      const cc = top.clone().add(new V3(Math.cos(ca) * 0.24, -0.32, Math.sin(ca) * 0.24));
      const n = 3 + Math.floor(hash(p.seed * 3 + c) * 4);
      for (let i = 0; i < n; i++) {
        const na = ca + (i / n) * Math.PI * 2;
        const k = hash(p.seed * 11 + c * 5 + i);
        const sf = k < 0.6 ? S.nutGreen : k < 0.85 ? S.nutYellow : S.nutBrown;
        const r = 0.12 + 0.02 * hash(i + c * 7);
        putS(b, G.sphere(1, hero ? 9 : 6, hero ? 7 : 4), cc.x + Math.cos(na) * 0.1, cc.y - 0.05 - (i % 2) * 0.08, cc.z + Math.sin(na) * 0.1, sf, r, r * 1.12, r, 0.3 * Math.cos(na), 0, 0.3 * Math.sin(na));
      }
    }
    // the crown: young fronds standing up in the middle, older ones arching out and drooping,
    // the oldest hanging, and a dead one or two hanging brown against the trunk
    const fr = this.fronds[L];
    const n = hero ? 22 : 13;
    for (let k = 0; k < n; k++) {
      const r = k / (n - 1);
      const yaw = p.seed * 2.7 + k * 2.39996;
      const len = (3.4 + 1.1 * hash(p.seed * 5 + k) + 0.4 * r) * (0.75 + 0.03 * p.h);
      const th0 = 1.15 - 1.3 * r + 0.15 * (hash(p.seed * 7 + k) - 0.5);
      const bend = 0.9 + 0.7 * r + 0.2 * hash(p.seed * 13 + k);
      const burnt = hash(p.seed * 17 + k * 3) < 0.25 + 0.3 * r ? 1 : 0;
      this.frond(fr, top, yaw, len, th0, bend, 0.6 + 0.12 * hash(k + p.seed), r, burnt, false, hero ? 12 : 6);
    }
    const dead = hero ? 1 + Math.floor(hash(p.seed * 23) * 2) : 0;
    for (let k = 0; k < dead; k++) {
      const yaw = p.seed * 4.1 + k * 2.6;
      this.frond(fr, top.clone().add(new V3(0, -0.22, 0)), yaw, 2.6 + hash(p.seed + k) * 0.8, -1.05, 0.35, 0.28, 1, 0, true, 8);
    }
  }

  private addTrunk(p: Palm, o: Buf, hero: boolean) {
    const nR = hero ? 30 : 9, nS = hero ? 12 : 6;
    const start = o.pos.length / 3;
    const tint = 0.9 + 0.2 * hash(p.seed * 9.7);
    const dx = Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    const side = new V3(-dz, 0, dx);
    let arc = 0;
    const prev = new V3();
    const r0 = 0.15 + 0.012 * p.h;
    for (let i = 0; i <= nR; i++) {
      const s = i / nR;
      Grove.trunkAt(p, s, _p, _t);
      if (i) arc += _p.distanceTo(prev);
      prev.copy(_p);
      _e1.copy(side).addScaledVector(_t, -side.dot(_t)).normalize();
      _e2.crossVectors(_t, _e1);
      // swollen at the foot, tapering, and a little thicker again just under the crown
      const r = r0 * (1 - 0.3 * s) * (1 + 0.65 * Math.exp(-arc / 0.4)) * (1 + 0.12 * smooth((s - 0.9) / 0.1));
      const shade = (0.62 + 0.38 * smooth(arc / 1.2)) * tint;
      for (let j = 0; j <= nS; j++) {
        const a = (j / nS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        _q.copy(_e1).multiplyScalar(ca).addScaledVector(_e2, sa);
        o.pos.push(_p.x + _q.x * r, _p.y + _q.y * r, _p.z + _q.z * r);
        o.nor.push(_q.x, _q.y, _q.z);
        o.uv.push((j / nS) * 2, arc / 0.95);
        o.col.push(shade, shade * 0.98, shade * 0.95);
      }
    }
    for (let i = 0; i < nR; i++) {
      for (let j = 0; j < nS; j++) {
        const a = start + i * (nS + 1) + j, b = a + 1, c = a + nS + 1, d = c + 1;
        o.idx.push(a, b, c, b, d, c);
      }
    }
  }

  /**
   * One frond: a ribbon along the midrib, folded up in a V near the base and its leaflets hanging
   * more towards the tip. th0 is the midrib's angle above horizontal where it leaves the crown,
   * bend how far it curves over; age (0..1) yellows it, burnt browns its tip, dead uses the brown texture.
   */
  private frond(o: Buf, base: THREE.Vector3, yaw: number, len: number, th0: number, bend: number, width: number, age: number, burnt: number, dead: boolean, N: number) {
    const H = new V3(Math.sin(yaw), 0, -Math.cos(yaw));
    const Sd = new V3(-H.z, 0, H.x);
    const start = o.pos.length / 3;
    const p = base.clone().addScaledVector(H, 0.12);
    const u0 = dead ? 0.5 : 0;
    const tint = dead ? [1, 1, 1] : [1 + 0.1 * age, 1.02 - 0.04 * age, 0.95 - 0.2 * age];
    const T = new V3(), U = new V3();
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const th = th0 - bend * s * (0.6 + 0.4 * s);
      T.copy(H).multiplyScalar(Math.cos(th)).addScaledVector(UP, Math.sin(th));
      U.crossVectors(Sd, T);
      if (i) p.addScaledVector(T, len / N);
      const w = width * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.07 + s))), 0.55) * (dead ? 0.6 : 1);
      const fold = 0.5 * (1 - s), hang = (dead ? 0.9 : 0.2 + 0.55 * s) * w;
      const tip = burnt * smooth((s - 0.6) / 0.35);
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        const a = Math.abs(k);
        _q.copy(p).addScaledVector(Sd, k * w).addScaledVector(U, a * w * fold).addScaledVector(UP, -hang * a * a);
        o.pos.push(_q.x, _q.y, _q.z);
        o.nor.push(0, 1, 0);
        o.uv.push(u0 + ((k + 1) / 2) * 0.5, s);
        o.sway.push(Math.min(1, s * 1.1) * (dead ? 0.5 : 1));
        o.col.push(tint[0] + (1.3 - tint[0]) * tip, tint[1] + (1.05 - tint[1]) * tip, tint[2] + (0.55 - tint[2]) * tip);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) {
        const a = start + i * 5 + k, b = a + 1, c = a + 5, d = c + 1;
        o.idx.push(a, c, b, b, c, d);
      }
    }
  }

  /** The meshes: [near, far] trunk, frond and crown meshes in one group. */
  build(sway: { value: number }, sunView: { value: THREE.Vector3 }, quality: Quality) {
    const g = new THREE.Group();
    const bark = barkTextures();
    const trunkMat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, normalScale: new THREE.Vector2(1.2, 1.2), vertexColors: true, roughness: 0.92 });
    const leaf = frondTexture();
    const frondMat = breeze(new THREE.MeshStandardMaterial({ map: leaf, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.62 }), sway, 0.11, 'beach-frond');
    backlit(frondMat, 1.4, sunView);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.42, side: THREE.DoubleSide });
    for (let L = 0; L < 2; L++) {
      const t = this.trunk[L];
      if (t.idx.length) {
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3));
        tg.setAttribute('normal', new THREE.Float32BufferAttribute(t.nor, 3));
        tg.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2));
        tg.setAttribute('color', new THREE.Float32BufferAttribute(t.col, 3));
        tg.setIndex(t.idx);
        const m = new THREE.Mesh(tg, trunkMat);
        m.castShadow = L === 0 && quality !== 'low';
        m.receiveShadow = true;
        g.add(m);
      }
      const f = this.fronds[L];
      if (f.idx.length) {
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
        fg.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
        fg.setAttribute('color', new THREE.Float32BufferAttribute(f.col, 3));
        fg.setAttribute('sway', new THREE.Float32BufferAttribute(f.sway, 1));
        fg.setIndex(f.idx);
        fg.computeVertexNormals();
        const m = new THREE.Mesh(fg, frondMat);
        m.castShadow = L === 0;
        m.receiveShadow = true;
        m.customDepthMaterial = depth;
        g.add(m);
      }
      const { opaque } = this.bits[L].build();
      if (opaque) {
        const m = new THREE.Mesh(opaque, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-crown'));
        m.castShadow = L === 0;
        m.receiveShadow = true;
        g.add(m);
      }
    }
    return g;
  }
}

// ------------------------------------------------------------------ the rest of the plants

/** A bush: leafy cards round a squashed dome, darker inside. */
function bushGeometry(n = 30, card = 0.55, under = 0.15) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], sway: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, y = under + (1 - under) * (i / n);
    const rr = Math.sqrt(1 - y * y * 0.8);
    const c = new V3(Math.cos(a) * rr * 0.8, y * 0.75, Math.sin(a) * rr * 0.8);
    const nrm = c.clone().normalize();
    const t1 = new V3().crossVectors(nrm, UP).normalize();
    if (t1.lengthSq() < 0.01) t1.set(1, 0, 0);
    const t2 = new V3().crossVectors(t1, nrm).normalize();
    const s = card + 0.2 * hash(i * 3.3);
    const tw = hash(i * 1.7) * Math.PI;
    const ax = t1.clone().multiplyScalar(Math.cos(tw)).addScaledVector(t2, Math.sin(tw));
    const ay = t1.clone().multiplyScalar(-Math.sin(tw)).addScaledVector(t2, Math.cos(tw));
    const k = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const q = c.clone().addScaledVector(ax, (u - 0.5) * s).addScaledVector(ay, (v - 0.5) * s);
      pos.push(q.x, Math.max(q.y, -0.05), q.z);
      uv.push(u, v);
      const ao = 0.62 + 0.5 * smooth(q.y / 0.8) + 0.1 * Math.hypot(q.x, q.z);
      col.push(ao, ao, ao);
      sway.push(Math.min(1, Math.max(0, q.y)) * 0.6);
    }
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // leaves face outwards, like the dome they make
  const nr = g.attributes.normal as THREE.BufferAttribute;
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < nr.count; i++) {
    _q.set(p.getX(i), p.getY(i) + 0.2, p.getZ(i)).normalize();
    nr.setXYZ(i, _q.x, _q.y, _q.z);
  }
  return g;
}

/** A tuft of grass: two crossed cards. */
function tuftGeometry() {
  const pos: number[] = [], uv: number[] = [], sway: number[] = [], idx: number[] = [];
  for (let k = 0; k < 2; k++) {
    const a = (k * Math.PI) / 2 + 0.3;
    const cx = Math.cos(a) * 0.4, cz = Math.sin(a) * 0.4;
    const b = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 0.7, cz, -cx, 0.7, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    sway.push(0, 0, 1, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(8).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setIndex(idx);
  return g;
}

const _m = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _s = new V3(), _pp = new V3(), _eu = new THREE.Euler();

/**
 * The plants round the back of the beach and up the hills. `clear` says where nothing may grow
 * (round the palms' feet, the lounger and the hammock).
 */
export function plants(quality: Quality, sway: { value: number }, sunView: { value: THREE.Vector3 }, clear: (x: number, z: number) => boolean) {
  const g = new THREE.Group();
  const low = quality === 'low';

  // sea grape and naupaka along the back of the beach, thickening into the trees
  const bushes: THREE.Matrix4[] = [];
  const bushCol: THREE.Color[] = [];
  const tones = [0xffffff, 0xe6f0d4, 0xf2ffe0, 0xd8e8c4];
  for (let i = 0; i < 900 && bushes.length < (low ? 110 : 220); i++) {
    const x = -105 + hash(i * 1.37 + 0.2) * 210;
    const l = 9.5 + Math.pow(hash(i * 2.71 + 0.5), 1.6) * 14;
    const z = shoreZ(x) + l;
    if (Math.hypot(x, z) > 104 || clear(x, z)) continue;
    if (vnoise(x * 0.11, z * 0.11) < 0.38 && l < 14) continue;
    const s = (0.9 + 1.1 * hash(i * 4.3)) * (l < 12 ? 0.8 : 1.2);
    _m.compose(_pp.set(x, groundH(x, z) - 0.08 * s, z), _qq.setFromEuler(_eu.set(0, hash(i * 5.9) * 6.28, 0)), _s.set(s * 1.2, s * (0.75 + 0.3 * hash(i * 6.1)), s * 1.2));
    bushes.push(_m.clone());
    bushCol.push(new THREE.Color(tones[Math.floor(hash(i * 7.3) * tones.length)]));
  }
  const bushMat = breeze(new THREE.MeshStandardMaterial({ map: bushTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55 }), sway, 0.035, 'beach-bush');
  backlit(bushMat, 0.6, sunView);
  const bush = new THREE.InstancedMesh(bushGeometry(), bushMat, bushes.length);
  bushes.forEach((m, i) => {
    bush.setMatrixAt(i, m);
    bush.setColorAt(i, bushCol[i]);
  });
  bush.castShadow = !low;
  bush.receiveShadow = true;
  bush.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: bushMat.map, alphaTest: 0.5 });
  g.add(bush);

  // morning glory creeping out across the sand in patches, flowering pink
  const vines: THREE.Matrix4[] = [];
  for (let i = 0; i < 4000 && vines.length < (low ? 260 : 620); i++) {
    const x = -95 + hash(i * 3.11 + 0.7) * 190;
    const l = 6.2 + hash(i * 1.93 + 0.1) * 6.5;
    const z = shoreZ(x) + l;
    if (clear(x, z) || Math.hypot(x, z) > 100) continue;
    // in runs fingering out from the plants: denser further back
    const patch = vnoise(x * 0.16 + 4.1, z * 0.16) + (l - 6) * 0.06;
    if (patch < 0.62) continue;
    const s = 0.8 + 0.5 * hash(i * 2.9);
    const yaw = hash(i * 8.1) * 6.28;
    _m.compose(_pp.set(x, groundH(x, z) + 0.03, z), _qq.setFromEuler(_eu.set(-Math.PI / 2 + 0.25 * (hash(i * 4.4) - 0.5), 0, yaw, 'YXZ')), _s.set(s, s, s));
    vines.push(_m.clone());
  }
  const vineGeo = new THREE.PlaneGeometry(1, 1);
  vineGeo.setAttribute('sway', new THREE.Float32BufferAttribute([0, 0, 0, 0], 1));
  const vineMat = new THREE.MeshStandardMaterial({ map: vineTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  vineMat.polygonOffset = true;
  vineMat.polygonOffsetFactor = -2;
  const vine = new THREE.InstancedMesh(vineGeo, vineMat, vines.length);
  vines.forEach((m, i) => vine.setMatrixAt(i, m));
  vine.receiveShadow = true;
  g.add(vine);

  // tufts of grass among them
  const tufts: THREE.Matrix4[] = [];
  for (let i = 0; i < 3000 && tufts.length < (low ? 160 : 380); i++) {
    const x = -100 + hash(i * 2.13 + 0.3) * 200;
    const l = 8.5 + hash(i * 3.71 + 0.9) * 9;
    const z = shoreZ(x) + l;
    if (clear(x, z) || Math.hypot(x, z) > 100) continue;
    if (vnoise(x * 0.2 - 3.3, z * 0.2) < 0.5) continue;
    const s = 0.6 + 0.6 * hash(i * 5.5);
    _m.compose(_pp.set(x, groundH(x, z) - 0.02, z), _qq.setFromEuler(_eu.set(0, hash(i * 6.6) * 6.28, 0)), _s.set(s, s * (0.8 + 0.5 * hash(i * 7.7)), s));
    tufts.push(_m.clone());
  }
  const tuftMat = breeze(new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), sway, 0.08, 'beach-tuft');
  backlit(tuftMat, 0.8, sunView);
  const tuft = new THREE.InstancedMesh(tuftGeometry(), tuftMat, tufts.length);
  tufts.forEach((m, i) => tuft.setMatrixAt(i, m));
  tuft.receiveShadow = true;
  g.add(tuft);

  // the jungle: leafy tree crowns over the hills, a sea of greens
  const crowns: THREE.Matrix4[] = [];
  const crownCol: THREE.Color[] = [];
  const tints = [0xffffff, 0xf0f8dc, 0xe4f0d0, 0xfff8e0, 0xd8e8c8];
  const step = low ? 7 : 4.8;
  for (let gx = -112; gx <= 112; gx += step) {
    for (let gz = -60; gz <= 112; gz += step) {
      const k = gx * 13.1 + gz * 7.7;
      const x = gx + (hash(k) - 0.5) * step * 0.9, z = gz + (hash(k + 3.3) - 0.5) * step * 0.9;
      const l = inland(x, z);
      const gy = groundH(x, z);
      if ((l < 20 + 6 * vnoise(x * 0.07, z * 0.07) && gy < 1.2) || Math.hypot(x, z) > 109 || clear(x, z)) continue;
      const s = (2.6 + 2.2 * hash(k + 1.1)) * (0.85 + 0.25 * smooth((l - 15) / 20));
      _m.compose(_pp.set(x, gy + s * 0.5, z), _qq.setFromEuler(_eu.set(0, hash(k + 2.2) * 6.28, 0)), _s.set(s, s * (0.75 + 0.25 * hash(k + 4.4)), s));
      crowns.push(_m.clone());
      crownCol.push(new THREE.Color(tints[Math.floor(hash(k + 5.5) * tints.length)]));
    }
  }
  const crownMat = breeze(new THREE.MeshStandardMaterial({ map: canopyTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }), sway, 0.05, 'beach-canopy');
  backlit(crownMat, 0.5, sunView);
  const jungle = new THREE.InstancedMesh(bushGeometry(low ? 22 : 34, 0.85, -0.2), crownMat, crowns.length);
  crowns.forEach((m, i) => {
    jungle.setMatrixAt(i, m);
    jungle.setColorAt(i, crownCol[i]);
  });
  jungle.receiveShadow = true;
  g.add(jungle);
  return g;
}
