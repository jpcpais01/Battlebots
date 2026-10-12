import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AX,
  BACK_D,
  FLOOR,
  LOWER_ROWS,
  ROOF_Y,
  ROWS,
  SUITE_D,
  TOP_Y,
  TUNNEL_ROWS,
  TUNNEL_W,
  UPPER_Y,
  aisleLights,
  outline,
  seats,
  towards,
  type OutlinePt,
} from './bowl';
import { AD_ASPECT, AD_COLS, AD_COUNT, AD_ROWS, adAtlas } from './ads';
import { Crowd, glowPoints } from './crowd';
import { RenderSettings } from './settings';

/**
 * The indoor arena around the ring: a two-tier seating bowl with a suite level, LED ribbon
 * boards, entrance tunnels, a centre-hung scoreboard and a trussed roof. Everything is
 * merged into a few unlit meshes with baked colour, and the crowd is one instanced draw.
 */

type Uniforms = { uTime: { value: number }; uHype: { value: number } };
type Rgb = [number, number, number];

const ORANGE = new THREE.Color(0xff7a1f);
const CYAN = new THREE.Color(0x22c8f0);

/** Collects closed strips between two outlines into one vertex-coloured geometry. */
class Strips {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  strip(a: OutlinePt[], ya: number, b: OutlinePt[], yb: number, colour: (x: number, y: number, z: number) => Rgb) {
    const base = this.pos.length / 3;
    for (let i = 0; i < a.length; i++) {
      for (const [p, y, v] of [
        [a[i], ya, 0],
        [b[i], yb, 1],
      ] as const) {
        this.pos.push(p.x, y, p.z);
        this.col.push(...colour(p.x, y, p.z));
        this.uv.push(p.s, v);
      }
      if (i < a.length - 1) {
        const k = base + i * 2;
        this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Scrolling LED strip of arena graphics on a black panel (scoreboard rings). */
function ledTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 128);
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 2048, 128);
  const items = ['BATTLEBOTS', '★', 'KNOCKOUT', '◆', 'STEEL LEAGUE', '★', 'MAKE SOME NOISE', '◆'];
  const w = 2048 / items.length;
  items.forEach((s, i) => {
    const x = i * w;
    const warm = i % 2 === 0;
    g.font = `${s.length > 2 ? 'bold 64px' : 'bold 72px'} "Russo One", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tg = g.createLinearGradient(0, 30, 0, 100);
    if (warm) {
      tg.addColorStop(0, '#ffd08a');
      tg.addColorStop(1, '#ff6a12');
    } else {
      tg.addColorStop(0, '#c8f6ff');
      tg.addColorStop(1, '#22b8f0');
    }
    g.fillStyle = tg;
    g.fillText(s, x + w / 2, 68, w - 30);
  });
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 2048, 1);
  for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 128);
  return tex(c);
}

function suiteTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#0d1018';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 10;
    const gr = g.createLinearGradient(0, 20, 0, 118);
    gr.addColorStop(0, '#5a4630');
    gr.addColorStop(0.6, '#2c2420');
    gr.addColorStop(1, '#16141a');
    g.fillStyle = gr;
    g.fillRect(x, 22, 108, 92);
    // warm ceiling lamps and a few silhouettes inside
    g.fillStyle = 'rgba(255,214,150,0.9)';
    g.fillRect(x + 14, 26, 20, 4);
    g.fillRect(x + 74, 26, 20, 4);
    g.fillStyle = 'rgba(8,8,12,0.85)';
    for (let k = 0; k < 2 + (i % 2); k++) {
      const px = x + 22 + k * 30 + (i * 7) % 11;
      g.beginPath();
      g.arc(px, 70, 8, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.roundRect(px - 13, 80, 26, 40, 8);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x, 22, 108, 10);
  }
  return tex(c);
}

function scoreboardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 576);
  const bg = g.createLinearGradient(0, 0, 0, 576);
  bg.addColorStop(0, '#0b1222');
  bg.addColorStop(1, '#05070d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 576);
  // diagonal energy stripes
  g.save();
  g.globalAlpha = 0.18;
  for (let i = -6; i < 16; i++) {
    g.fillStyle = i % 2 ? '#ff6a1a' : '#22c8f0';
    g.beginPath();
    g.moveTo(i * 90, 576);
    g.lineTo(i * 90 + 40, 576);
    g.lineTo(i * 90 + 240, 0);
    g.lineTo(i * 90 + 200, 0);
    g.fill();
  }
  g.restore();
  g.font = 'bold 150px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const og = g.createLinearGradient(0, 120, 0, 290);
  og.addColorStop(0, '#ffd08a');
  og.addColorStop(1, '#ff6a12');
  g.fillStyle = og;
  g.fillText('BATTLE', 512, 205);
  const cg = g.createLinearGradient(0, 300, 0, 460);
  cg.addColorStop(0, '#d8fbff');
  cg.addColorStop(1, '#22b8f0');
  g.fillStyle = cg;
  g.fillText('BOTS', 512, 375);
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 996, 548);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < 576; y += 4) g.fillRect(0, y, 1024, 1);
  return tex(c, false);
}

function bannerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const designs = [
    ['#ff6a12', 'CHAMPIONS', '2025'],
    ['#22b8f0', 'STEEL', 'LEAGUE'],
    ['#e9e9ee', 'HALL OF', 'FAME'],
    ['#ff6a12', 'KO', 'KINGS'],
  ];
  designs.forEach(([colour, a, b], i) => {
    const x = i * 256;
    g.fillStyle = '#10141f';
    g.fillRect(x, 0, 256, 512);
    g.fillStyle = colour;
    g.fillRect(x, 0, 256, 34);
    g.fillRect(x, 478, 256, 34);
    g.beginPath();
    g.moveTo(x + 128, 70);
    g.lineTo(x + 190, 150);
    g.lineTo(x + 128, 230);
    g.lineTo(x + 66, 150);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px "Russo One", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(a, x + 128, 320, 230);
    g.fillStyle = colour;
    g.font = 'bold 60px "Russo One", Impact, sans-serif';
    g.fillText(b, x + 128, 395, 230);
  });
  return tex(c, false);
}

function tunnelTexture(colour: string, label: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#07090f';
  g.fillRect(0, 0, 256, 256);
  // depth fades into the dark
  const gr = g.createLinearGradient(0, 40, 0, 256);
  gr.addColorStop(0, '#000000');
  gr.addColorStop(1, '#141824');
  g.fillStyle = gr;
  g.fillRect(28, 40, 200, 216);
  g.strokeStyle = colour;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(28, 256);
  g.lineTo(28, 40);
  g.lineTo(228, 40);
  g.lineTo(228, 256);
  g.stroke();
  g.fillStyle = colour;
  g.font = 'bold 22px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 128, 28);
  return tex(c, false);
}

/**
 * Emissive LED panel. Plain mode scrolls its texture along u (metres). With `ads`, u is cut into
 * segments of `len` metres that each show one cell of the ad atlas, rotating to the next sponsor
 * every few seconds with a wipe (staggered per segment). Both strobe on big moments.
 */
function ledMaterial(map: THREE.Texture, len: number, speed: number, glow = 1.4, ads = false) {
  const m = new THREE.ShaderMaterial({
    defines: ads ? { ADS: '', AD_COLS: AD_COLS.toFixed(1), AD_ROWS: AD_ROWS.toFixed(1), AD_COUNT: AD_COUNT.toFixed(1) } : {},
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uMap: { value: null }, uLen: { value: len }, uSpeed: { value: speed }, uGlow: { value: RenderSettings.glow(glow) } },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMap; uniform float uLen, uSpeed, uGlow, uTime, uFlash, uHype;
      varying vec2 vUv;
      void main() {
        #ifdef ADS
          float x = vUv.x / uLen - uTime * uSpeed;
          float seg = floor(x), f = x - seg;
          // each segment rotates sponsors on its own beat; a bright wipe brings the next one in
          float t = uTime / 8.0 + fract(seg * 0.618);
          float k = floor(t), wipe = clamp(fract(t) * 16.0, 0.0, 1.0);
          float idx = mod(seg * 5.0 + k - (f > wipe ? 1.0 : 0.0), AD_COUNT);
          vec2 cell = vec2(mod(idx, AD_COLS), AD_ROWS - 1.0 - floor(idx / AD_COLS));
          // gradients from the unwrapped coordinate, so cell edges don't drop to the smallest mip
          vec2 g = vec2(x / AD_COLS, vUv.y / AD_ROWS);
          vec3 c = textureGrad(uMap, (cell + vec2(f, vUv.y)) / vec2(AD_COLS, AD_ROWS), dFdx(g), dFdy(g)).rgb;
          c += vec3(0.9) * smoothstep(0.03, 0.0, abs(f - wipe)) * step(wipe, 0.999);
        #else
          vec3 c = texture2D(uMap, vec2(vUv.x / uLen - uTime * uSpeed, vUv.y)).rgb;
        #endif
        float strobe = step(0.5, fract(uTime * 5.0 + vUv.x * 0.02));
        c = c * (1.0 + uFlash) + mix(vec3(1.0, 0.45, 0.1), vec3(0.15, 0.75, 1.0), strobe) * uFlash * 0.25;
        gl_FragColor = vec4(c * uGlow * (0.85 + 0.25 * uHype), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.uMap.value = map;
  return m;
}

export class Venue {
  readonly group = new THREE.Group();
  readonly crowd: Crowd;
  readonly uniforms: Uniforms & { uFlash: { value: number } };
  private spots: THREE.Vector4[];
  private steady: THREE.ShaderMaterial;
  private flash = 0;

  constructor(quality: 'low' | 'med' | 'high', u: Uniforms) {
    const g = this.group;
    this.uniforms = { uTime: u.uTime, uHype: u.uHype, uFlash: { value: 0 } };
    const U = this.uniforms;
    this.crowd = new Crowd(seats(), quality, u);
    this.spots = this.crowd.spots;
    const hookLed = (m: THREE.ShaderMaterial) => {
      m.uniforms.uTime = U.uTime;
      m.uniforms.uHype = U.uHype;
      m.uniforms.uFlash = U.uFlash;
      return m;
    };

    // ---------------------------------------------------------------- floor
    const floorPts = outline(-0.6);
    const shape = new THREE.Shape(floorPts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const floorGeo = new THREE.ShapeGeometry(shape, 4);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x0b0e16, roughness: 0.42, metalness: 0.35 }));
    floor.position.y = FLOOR;
    floor.receiveShadow = true;
    g.add(floor);
    // glowing floor ring around the stage
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(6.6, 6.75, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(0.55), toneMapped: false }),
    );
    halo.position.y = FLOOR + 0.01;
    g.add(halo);

    // ---------------------------------------------------------------- stands
    const stands = new Strips();
    const wash = (x: number, y: number, z: number, base: number, k = 1): Rgb => {
      const h = Math.min(1, Math.max(0, y / 20));
      const light = (1 - Math.sqrt(h) * 0.6) * base;
      const side = Math.max(-1, Math.min(1, x / Math.max(1, Math.hypot(x, z)))) * 0.5 + 0.5;
      const w = 0.09 * (1 - h * 0.7) * k;
      return [
        light * 0.9 + w * (ORANGE.r * (1 - side) + CYAN.r * side),
        light * 0.95 + w * (ORANGE.g * (1 - side) + CYAN.g * side),
        light * 1.15 + w * (ORANGE.b * (1 - side) + CYAN.b * side),
      ];
    };
    const tread = (x: number, y: number, z: number) => wash(x, y, z, 0.075);
    const riser = (x: number, y: number, z: number) => wash(x, y, z, 0.035);
    const wall = (x: number, y: number, z: number) => wash(x, y, z, 0.03, 0.5);
    stands.strip(outline(0), FLOOR, outline(0), ROWS[0].y, riser);
    ROWS.forEach((r, i) => {
      const a = outline(r.d), b = outline(r.d + r.depth);
      stands.strip(a, r.y, b, r.y, tread);
      if (i === LOWER_ROWS - 1 || i === ROWS.length - 1) return;
      stands.strip(b, r.y, b, r.y + r.rise, riser);
    });
    // suite level between the tiers, around the windows and the ribbon board
    const suite = outline(SUITE_D);
    const lowTop = ROWS[LOWER_ROWS - 1].y;
    stands.strip(suite, lowTop, suite, lowTop + 0.35, wall);
    stands.strip(suite, lowTop + 2.05, suite, UPPER_Y - 1.15, wall);
    stands.strip(suite, UPPER_Y - 0.2, suite, UPPER_Y, wall);
    // back wall and the roof sloping up to the middle
    const back = outline(BACK_D);
    stands.strip(back, TOP_Y, back, ROOF_Y, wall);
    const roofIn = outline(2);
    const roof = (): Rgb => [0.018, 0.02, 0.03];
    stands.strip(back, ROOF_Y, roofIn, ROOF_Y + 5, roof);
    const standMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const spots = this.spots;
    standMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSpots = { value: spots };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform vec4 uSpots[3];')
        .replace(
          '#include <opaque_fragment>',
          `for (int i = 0; i < 3; i++) {
             vec4 sp = uSpots[i];
             outgoingLight += vec3(1.0, 0.95, 0.85) * 0.22 * sp.w * smoothstep(sp.z, sp.z * 0.55, distance(vWPos.xz, sp.xy)) * step(vWPos.y, 22.0);
           }
           #include <opaque_fragment>`,
        );
    };
    const roofCap = new THREE.ShapeGeometry(new THREE.Shape(roofIn.map((p) => new THREE.Vector2(p.x, -p.z))), 2);
    roofCap.rotateX(-Math.PI / 2);
    roofCap.translate(0, ROOF_Y + 5, 0);
    const capCol = new Float32Array(roofCap.attributes.position.count * 3).fill(0.018);
    roofCap.setAttribute('color', new THREE.BufferAttribute(capCol, 3));
    roofCap.deleteAttribute('normal');
    const standGeo = stands.geometry();
    roofCap.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(roofCap.attributes.position.count * 2), 2));
    g.add(new THREE.Mesh(mergeGeometries([standGeo, roofCap])!, standMat));

    // ---------------------------------------------------------------- LED boards
    const adsTex = adAtlas();
    const ribbonTex = ledTexture();
    const ledStrip = (d: number, y0: number, y1: number, map: THREE.Texture, speed: number, glow: number) => {
      const s = new Strips();
      const o = outline(d);
      s.strip(o, y0, o, y1, () => [1, 1, 1]);
      const total = o[o.length - 1].s;
      const len = (y1 - y0) * AD_ASPECT;
      const m = hookLed(ledMaterial(map, total / Math.max(1, Math.round(total / len)), speed, glow, true));
      m.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(s.geometry(), m);
      g.add(mesh);
      return mesh;
    };
    // ringside boards on the barrier, the suite-level ribbon, and a ring of lights at the top
    ledStrip(-0.6, FLOOR + 0.05, 0.42, adsTex, 0, 0.9);
    ledStrip(SUITE_D - 0.02, UPPER_Y - 1.15, UPPER_Y - 0.2, adsTex, -0.04, 1.3);
    const cap = new Strips();
    cap.strip(outline(-0.6), 0.42, outline(-0.35), 0.42, () => [0.05, 0.055, 0.07]);
    g.add(new THREE.Mesh(cap.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // suite windows
    const win = new Strips();
    win.strip(suite, lowTop + 0.35, suite, lowTop + 2.05, () => [1, 1, 1]);
    const winTex = suiteTexture();
    winTex.repeat.set(1 / 6, 1);
    g.add(new THREE.Mesh(win.geometry(), new THREE.MeshBasicMaterial({ map: winTex, side: THREE.DoubleSide })));

    // ---------------------------------------------------------------- entrance tunnels
    const tunnelD = ROWS[TUNNEL_ROWS].d;
    const tunnelH = ROWS[TUNNEL_ROWS].y - FLOOR;
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x0b0e15 });
    for (const sx of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(tunnelD, tunnelH, TUNNEL_W), portalMat);
      box.position.set(sx * (AX + tunnelD / 2), FLOOR + tunnelH / 2, 0);
      g.add(box);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(TUNNEL_W, tunnelH),
        new THREE.MeshBasicMaterial({ map: tunnelTexture(sx < 0 ? '#ff7a1f' : '#3fe0ff', sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER'), toneMapped: false }),
      );
      face.position.set(sx * (AX - 0.01), FLOOR + tunnelH / 2, 0);
      face.rotation.y = -sx * (Math.PI / 2);
      g.add(face);
    }

    // ---------------------------------------------------------------- roof rig
    const steel = new THREE.MeshBasicMaterial({ color: 0x1a1f2b });
    const truss: THREE.BufferGeometry[] = [];
    const rigY = ROOF_Y + 1.5;
    const rx = AX + BACK_D - 6, rz = AX + BACK_D - 9;
    for (let x = -rx; x <= rx + 0.1; x += 7) truss.push(new THREE.BoxGeometry(0.35, 0.5, rz * 2).translate(x, rigY, 0));
    for (let z = -rz; z <= rz + 0.1; z += 7) truss.push(new THREE.BoxGeometry(rx * 2, 0.5, 0.35).translate(0, rigY - 0.3, z));
    // cables down to the scoreboard
    for (const [x, z] of [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ])
      truss.push(new THREE.BoxGeometry(0.05, rigY - 17, 0.05).translate(x, (rigY + 17) / 2, z));
    g.add(new THREE.Mesh(mergeGeometries(truss)!, steel));

    // lamps on the rig, step lights up the aisles, lamps along the top of the bowl
    const lampPos: number[] = [];
    const lampCol: number[] = [];
    const warm = new THREE.Color(0xffe2b0);
    for (let x = -rx; x <= rx + 0.1; x += 7)
      for (let z = -rz; z <= rz + 0.1; z += 3.5) {
        lampPos.push(x, rigY - 0.4, z);
        lampCol.push(warm.r, warm.g, warm.b);
      }
    const step = aisleLights();
    const amber = new THREE.Color(0xff9a3a).multiplyScalar(0.55);
    for (let i = 0; i < step.length; i += 3) {
      lampPos.push(step[i], step[i + 1], step[i + 2]);
      lampCol.push(amber.r, amber.g, amber.b);
    }
    const lampGeo = new THREE.BufferGeometry();
    lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
    lampGeo.setAttribute('color', new THREE.Float32BufferAttribute(lampCol, 3));
    this.steady = glowPoints(u, true, 0.09);
    const lamps = new THREE.Points(lampGeo, this.steady);
    lamps.frustumCulled = false;
    g.add(lamps);

    // ---------------------------------------------------------------- scoreboard
    const board = new THREE.Group();
    const sbW = 7.2, sbH = 4.05;
    board.add(new THREE.Mesh(new THREE.BoxGeometry(sbW + 0.3, sbH + 0.3, sbW + 0.3), new THREE.MeshBasicMaterial({ color: 0x0c0f16 })));
    const screenMat = new THREE.MeshBasicMaterial({ map: scoreboardTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.3)), toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(sbW, sbH), screenMat);
      const a = (i * Math.PI) / 2;
      p.position.set(Math.sin(a) * (sbW / 2 + 0.16), 0, Math.cos(a) * (sbW / 2 + 0.16));
      p.rotation.y = a;
      board.add(p);
    }
    // LED rings above and below the screens
    for (const [y, h] of [
      [-sbH / 2 - 0.75, 0.6],
      [sbH / 2 + 0.55, 0.5],
    ]) {
      const ring = new THREE.CylinderGeometry(sbW * 0.62, sbW * 0.62, h, 32, 1, true);
      const uv = ring.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * sbW * 0.62 * Math.PI * 2);
      const m = hookLed(ledMaterial(ribbonTex, (sbW * 0.62 * Math.PI * 2) / 3, 0.03, 1.6));
      const mesh = new THREE.Mesh(ring, m);
      mesh.position.y = y;
      board.add(mesh);
    }
    board.position.y = 17.2;
    g.add(board);

    // ---------------------------------------------------------------- banners
    const bannerTex = bannerTexture();
    const bannerGeos: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const b = new THREE.PlaneGeometry(2.6, 5.2);
        const uv = b.attributes.uv;
        const k = (i + (sz > 0 ? 0 : 2)) % 4;
        for (let j = 0; j < uv.count; j++) uv.setX(j, (k + uv.getX(j)) / 4);
        if (sz > 0) b.rotateY(Math.PI);
        b.translate((i - 1.5) * 6, ROOF_Y - 2.2, sz * (AX - 3 + 21));
        bannerGeos.push(b);
      }
    const banners = new THREE.Mesh(mergeGeometries(bannerGeos)!, new THREE.MeshBasicMaterial({ map: bannerTex, color: 0x8a8f9c, side: THREE.DoubleSide }));
    g.add(banners);

    // ---------------------------------------------------------------- crowd
    g.add(this.crowd.group);
  }

  setPixelScale(h: number) {
    this.crowd.setPixelScale(h);
    this.steady.uniforms.uScale.value = h;
  }

  /** Strobe the boards (knockdowns, KOs). */
  strobe(k: number) {
    this.flash = Math.min(1, this.flash + k);
  }

  update(dt: number, time: number, hype: number) {
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.uniforms.uFlash.value = this.flash;
    // follow spots roaming the stands, livelier with the crowd
    for (let i = 0; i < 3; i++) {
      const a = time * (0.09 + i * 0.03) * (i % 2 ? -1 : 1) + i * 2.1;
      const d = 7 + 9 * (0.5 + 0.5 * Math.sin(time * 0.17 + i * 1.7));
      const [x, z] = towards(a, d);
      this.spots[i].set(x, z, 3.2 + d * 0.08, Math.min(1.1, 0.35 + hype * 0.55));
    }
  }
}
