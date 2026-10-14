import * as THREE from 'three';
import { RING_CORNER, ROPE_LINE } from '../sim/body';

/**
 * Pieces of the ring that are plain geometry and paint: the octagon helpers every part is lofted
 * on, the printed canvas and the LED skirt's artwork. `arena.ts` puts them together.
 */

const SIDES = 8;
const COS8 = Math.cos(Math.PI / SIDES);
/** Angle of corner i: the posts stand at the corners, and side i runs from corner i-1 to corner i. */
export const cornerAngle = (i: number) => (i / SIDES) * Math.PI * 2 + Math.PI / SIDES;

/**
 * An octagonal band lofted from a profile of [corner radius, height] points: lips, bumpers and
 * skirts all round the ring in one piece. Each side gets its own vertices, so the corners stay
 * crisp while the profile itself is smooth. u runs 0..1 once around the ring, v along the profile.
 */
export function octBand(profile: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  const n = profile.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // profile normals in the (outward, up) plane, from the neighbours on either side
  const pn: [number, number][] = [];
  const len = [0];
  for (let j = 0; j < n; j++) {
    const a = profile[Math.max(0, j - 1)], b = profile[Math.min(n - 1, j + 1)];
    const dr = (b[0] - a[0]) * COS8, dy = b[1] - a[1];
    const l = Math.hypot(dr, dy) || 1;
    pn.push([-dy / l, dr / l]);
    if (j > 0) len.push(len[j - 1] + Math.hypot((profile[j][0] - profile[j - 1][0]) * COS8, profile[j][1] - profile[j - 1][1]));
  }
  const total = len[n - 1] || 1;
  for (let s = 0; s < SIDES; s++) {
    const a0 = cornerAngle(s - 1), a1 = cornerAngle(s);
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am), nz = Math.sin(am);
    const base = pos.length / 3;
    for (const [k, a] of [a0, a1].entries()) {
      const c = Math.cos(a), sn = Math.sin(a);
      for (let j = 0; j < n; j++) {
        const [r, y] = profile[j];
        pos.push(c * r, y, sn * r);
        nor.push(nx * pn[j][0], pn[j][1], nz * pn[j][0]);
        uv.push((s + k) / SIDES, len[j] / total);
      }
    }
    for (let j = 0; j < n - 1; j++) {
      const p = base + j, q = base + n + j;
      idx.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A flat octagon at y 0 (corner radius r), facing up, with planar UVs spanning ±uvR. */
export function octDisc(r: number, uvR = r, holes: readonly (readonly [number, number, number])[] = []): THREE.BufferGeometry {
  if (holes.length) return octDiscWithHoles(r, uvR, holes);
  const pos = [0, 0, 0];
  const uv = [0.5, 0.5];
  const idx: number[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.push(x, 0, z);
    uv.push(x / (2 * uvR) + 0.5, -z / (2 * uvR) + 0.5);
    idx.push(0, 1 + ((i + 1) % SIDES), 1 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * The octagon with round holes cut in it, each (x, z, radius). The holes are real geometry: a
 * `discard` cutting them in the shader would switch off the GPU's early depth test for the whole
 * surface, so every pixel of it under the robots would be lit and then thrown away.
 */
function octDiscWithHoles(r: number, uvR: number, holes: readonly (readonly [number, number, number])[]) {
  // drawn in (x, -z), then turned flat, so the faces come out facing up
  const shape = new THREE.Shape();
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    if (i === 0) shape.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
  }
  shape.closePath();
  const SEG = 64;
  for (const [x, z, hr] of holes) {
    // around the circle rather than inside it, so nothing of the surface pokes into the hole
    const R = hr / Math.cos(Math.PI / SEG);
    const hole = new THREE.Path();
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      if (k === 0) hole.moveTo(x + Math.cos(a) * R, -z - Math.sin(a) * R);
      else hole.lineTo(x + Math.cos(a) * R, -z - Math.sin(a) * R);
    }
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / (2 * uvR) + 0.5, -pos.getZ(i) / (2 * uvR) + 0.5);
    nor.setXYZ(i, 0, 1, 0);
  }
  return g;
}

/** A box stretched from a to b (w across, h up-ish), for truss chords and lacing. */
export function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.BoxGeometry(w, h, d.length());
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  return g;
}

function octPath(g: CanvasRenderingContext2D, cx: number, r: number) {
  g.beginPath();
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    const x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Letters set around a circle, centred on angle `at`; `outward` reads from outside the circle. */
function arcText(g: CanvasRenderingContext2D, text: string, cx: number, r: number, at: number, outward: boolean) {
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const span = widths.reduce((a, b) => a + b, 0) / r;
  let a = outward ? at - span / 2 : at + span / 2;
  for (let i = 0; i < text.length; i++) {
    const w = widths[i] / r;
    const m = outward ? a + w / 2 : a - w / 2;
    g.save();
    g.translate(cx + Math.cos(m) * r, cx + Math.sin(m) * r);
    g.rotate(outward ? m + Math.PI / 2 : m - Math.PI / 2);
    g.fillText(text[i], 0, 0);
    g.restore();
    a = outward ? a + w : a - w;
  }
}

/**
 * The printed canvas, covering the whole stage top (corner radius `R` m). Canvas pixel (x, y) is
 * world (x, z) so the artwork lines up with the posts and ropes. Inside the ropes: a slate canvas
 * with hazard-striped corners, spokes to each post, a big gear emblem and skid marks from earlier
 * fights. Outside them: the black apron with its printing. AO is baked on top.
 */
export function canvasTexture(size: number, R: number): THREE.CanvasTexture {
  const s = size;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const cx = s / 2;
  const px = cx / R; // pixels per metre
  const m = (v: number) => v * px;
  const ropeC = RING_CORNER + 0.06; // canvas reaches just past the ropes

  // apron, outside the ropes
  g.fillStyle = '#0c0e13';
  g.fillRect(0, 0, s, s);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${m(0.2)}px "Russo One", Impact, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.17)';
  const apronMid = (ROPE_LINE + R * COS8) / 2 + 0.03;
  for (let i = 0; i < SIDES; i++) {
    const a = (cornerAngle(i - 1) + cornerAngle(i)) / 2;
    g.save();
    g.translate(cx + Math.cos(a) * m(apronMid), cx + Math.sin(a) * m(apronMid));
    g.rotate(a - Math.PI / 2);
    g.fillText(i % 2 ? 'ROBOT FIGHTING LEAGUE' : 'BATTLEBOTS', 0, 0);
    g.restore();
  }
  g.lineWidth = m(0.025);
  g.strokeStyle = 'rgba(80,220,255,0.35)';
  octPath(g, cx, m(R - 0.17));
  g.stroke();

  // the fighting surface
  g.save();
  octPath(g, cx, m(ropeC));
  g.clip();
  const grad = g.createRadialGradient(cx, cx, m(0.4), cx, cx, m(ropeC));
  grad.addColorStop(0, '#2a3346');
  grad.addColorStop(0.6, '#1d2433');
  grad.addColorStop(1, '#141924');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // canvas weave and grain
  const step = Math.max(2, Math.round(s / 400));
  g.globalAlpha = 0.045;
  for (let i = 0; i < s; i += step * 2) {
    g.fillStyle = '#000';
    g.fillRect(0, i, s, step * 0.5);
    g.fillStyle = '#fff';
    g.fillRect(i, 0, step * 0.5, s);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < s * 3; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.03)';
    g.fillRect(Math.random() * s, Math.random() * s, step, step);
  }
  // hazard-striped corners, where the bots get pinned
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    const kx = cx + Math.cos(a) * m(ropeC), ky = cx + Math.sin(a) * m(ropeC);
    const reach = 1.15;
    const pa = cornerAngle(i - 1), pb = cornerAngle(i + 1);
    const ax = kx + (Math.cos(pa) * m(ropeC) - kx) * (reach / (2 * ropeC * Math.sin(Math.PI / 8)));
    const ay = ky + (Math.sin(pa) * m(ropeC) - ky) * (reach / (2 * ropeC * Math.sin(Math.PI / 8)));
    const bx = kx + (Math.cos(pb) * m(ropeC) - kx) * (reach / (2 * ropeC * Math.sin(Math.PI / 8)));
    const by = ky + (Math.sin(pb) * m(ropeC) - ky) * (reach / (2 * ropeC * Math.sin(Math.PI / 8)));
    g.save();
    g.beginPath();
    g.moveTo(kx, ky);
    g.lineTo(ax, ay);
    g.lineTo(bx, by);
    g.closePath();
    g.clip();
    g.translate(kx, ky);
    g.rotate(a + Math.PI / 4);
    for (let k = -12; k < 12; k++) {
      g.fillStyle = k % 2 ? 'rgba(255,150,40,0.2)' : 'rgba(0,0,0,0.25)';
      g.fillRect(k * m(0.14), -m(2), m(0.14), m(4));
    }
    g.restore();
    g.strokeStyle = 'rgba(255,150,40,0.45)';
    g.lineWidth = m(0.03);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }
  // spokes from the emblem to each post, and a dashed inner ring
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = m(0.04);
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * m(2.1), cx + Math.sin(a) * m(2.1));
    g.lineTo(cx + Math.cos(a) * m(ropeC - 1.0), cx + Math.sin(a) * m(ropeC - 1.0));
    g.stroke();
  }
  g.setLineDash([m(0.3), m(0.2)]);
  octPath(g, cx, m(3.6));
  g.stroke();
  g.setLineDash([]);
  // skid marks and scuffs from earlier fights
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.8;
    const x = cx + Math.cos(a) * m(r), y = cx + Math.sin(a) * m(r);
    g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    g.lineWidth = m(0.03 + Math.random() * 0.08);
    g.beginPath();
    const d = Math.random() * Math.PI * 2;
    g.arc(x, y, m(0.4 + Math.random() * 1.5), d, d + 0.3 + Math.random() * 0.8);
    g.stroke();
  }

  // the emblem: an octagon, a gear ring and the BB mark
  octPath(g, cx, m(2.1));
  g.fillStyle = 'rgba(8,10,16,0.55)';
  g.fill();
  g.lineWidth = m(0.07);
  g.strokeStyle = 'rgba(255,140,40,0.9)';
  g.stroke();
  octPath(g, cx, m(1.97));
  g.lineWidth = m(0.022);
  g.strokeStyle = 'rgba(80,220,255,0.6)';
  g.stroke();
  const TEETH = 20;
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath();
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * Math.PI * 2;
    const w = (Math.PI / TEETH) * 0.55;
    g.moveTo(cx + Math.cos(a - w) * m(1.18), cx + Math.sin(a - w) * m(1.18));
    g.lineTo(cx + Math.cos(a - w * 0.7) * m(1.34), cx + Math.sin(a - w * 0.7) * m(1.34));
    g.lineTo(cx + Math.cos(a + w * 0.7) * m(1.34), cx + Math.sin(a + w * 0.7) * m(1.34));
    g.lineTo(cx + Math.cos(a + w) * m(1.18), cx + Math.sin(a + w) * m(1.18));
  }
  g.fill();
  g.beginPath();
  g.arc(cx, cx, m(1.2), 0, Math.PI * 2);
  g.lineWidth = m(0.045);
  g.strokeStyle = 'rgba(255,140,40,0.85)';
  g.stroke();
  g.beginPath();
  g.arc(cx, cx, m(1.08), 0, Math.PI * 2);
  g.fillStyle = 'rgba(10,13,20,0.6)';
  g.fill();
  g.font = `bold ${m(0.2)}px "Rajdhani", "Russo One", sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  arcText(g, 'BATTLEBOTS', cx, m(1.6), -Math.PI / 2, true);
  arcText(g, 'WORLD  ARENA', cx, m(1.6), Math.PI / 2, false);
  g.font = `bold ${m(0.95)}px "Russo One", Impact, sans-serif`;
  g.lineWidth = m(0.06);
  g.strokeStyle = 'rgba(255,140,40,0.9)';
  g.strokeText('BB', cx, cx + m(0.04));
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.fillText('BB', cx, cx + m(0.04));
  g.restore();

  // inner edge of the apron: a hot orange line right under the ropes
  g.lineWidth = m(0.04);
  g.strokeStyle = 'rgba(255,140,40,0.75)';
  octPath(g, cx, m(ropeC));
  g.stroke();

  // baked ambient occlusion: darker towards the apron, pooling round each post base
  g.globalCompositeOperation = 'multiply';
  const rim = g.createRadialGradient(cx, cx, m(ROPE_LINE * 0.55), cx, cx, cx);
  rim.addColorStop(0, '#ffffff');
  rim.addColorStop(0.7, '#c4c4c8');
  rim.addColorStop(1, '#7a7a82');
  g.fillStyle = rim;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < SIDES; i++) {
    const a = cornerAngle(i);
    const x = cx + Math.cos(a) * m(RING_CORNER), y = cx + Math.sin(a) * m(RING_CORNER);
    const pool = g.createRadialGradient(x, y, m(0.18), x, y, m(0.8));
    pool.addColorStop(0, '#303034');
    pool.addColorStop(0.35, '#8a8a90');
    pool.addColorStop(1, '#ffffff');
    g.fillStyle = pool;
    g.fillRect(x - m(1), y - m(1), m(2), m(2));
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Artwork for the LED skirt round the stage: lettering in red, chevrons and borders in green, so
 * the shader can colour each on its own. One tile, repeated round the ring and scrolled.
 */
export function skirtTexture(): THREE.CanvasTexture {
  const w = 2048, h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#00ff00';
  g.fillRect(0, 6, w, 5);
  g.fillRect(0, h - 11, w, 5);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  const chevrons = (x: number, dir: number) => {
    for (let k = 0; k < 3; k++) {
      const x0 = x + k * 34 * dir;
      g.beginPath();
      g.moveTo(x0, 30);
      g.lineTo(x0 + 18 * dir, h / 2);
      g.lineTo(x0, h - 30);
      g.lineTo(x0 + 12 * dir, h - 30);
      g.lineTo(x0 + 30 * dir, h / 2);
      g.lineTo(x0 + 12 * dir, 30);
      g.closePath();
      g.fill();
    }
  };
  g.fillStyle = '#00ff00';
  chevrons(40, 1);
  chevrons(w / 2 + 40, 1);
  g.fillStyle = '#ff0000';
  g.font = 'bold 70px "Russo One", Impact, sans-serif';
  g.fillText('BATTLEBOTS', w * 0.3, h / 2 + 3);
  g.font = 'bold 56px "Rajdhani", "Russo One", sans-serif';
  g.fillText('WORLD ROBOT FIGHTING', w * 0.8, h / 2 + 3);
  g.fillStyle = '#00ff00';
  for (const x of [w * 0.52, w * 0.98]) {
    g.beginPath();
    g.moveTo(x, h / 2 - 16);
    g.lineTo(x + 16, h / 2);
    g.lineTo(x, h / 2 + 16);
    g.lineTo(x - 16, h / 2);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
