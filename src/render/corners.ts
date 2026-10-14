import * as THREE from 'three';
import { RING_CORNER } from '../sim/body';
import { CORNER_OF, ENTRY, entryTime, HATCH_R, hatchXZ, LIFT_DEPTH, liftUp } from '../sim/entrance';
import type { Match } from '../sim/match';
import { contactAO } from './ao';
import type { Fx } from './fx';
import { RenderSettings } from './settings';

/** Corner colours: the blue corner (fighter 0) and the orange corner (fighter 1). */
export const CORNER_COLOR = [0x2ad8ff, 0xff7a2a] as const;

/** The two lift hatches as (x, z, radius): every surface over a shaft is cut away inside them. */
const HATCHES = { value: [0, 1].map((i) => new THREE.Vector3(...hatchXZ(i), HATCH_R)) };
const SHAFT_H = LIFT_DEPTH + 0.45;

/**
 * Cut the hatch holes out of a floor-level material (the canvas, the stage under it, the
 * arena floor under that), so the lift shafts can be seen into. Chains any existing patch.
 */
export function cutHatches(mat: THREE.Material) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.uniforms.uHatch = HATCHES;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHatchXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHatchXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHatchXZ;\nuniform vec3 uHatch[2];')
      .replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `${s}\n  for (int i = 0; i < 2; i++) if (distance(vHatchXZ, uHatch[i].xy) < uHatch[i].z) discard;`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|hatch';
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The lift's deck: brushed tread plate, a machined rim, bolts. */
function deckTexture() {
  return canvas(512, 512, (g) => {
    const c = 256;
    const grad = g.createRadialGradient(c, c, 20, c, c, c);
    grad.addColorStop(0, '#3a404a');
    grad.addColorStop(1, '#22262d');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    // diamond tread
    g.globalAlpha = 0.22;
    g.fillStyle = '#9aa3b0';
    for (let y = 0; y < 512; y += 22) {
      for (let x = (y / 22) % 2 ? 11 : 0; x < 512; x += 22) {
        g.save();
        g.translate(x, y);
        g.rotate(((y / 22) % 2 ? 1 : -1) * 0.7);
        g.fillRect(-6, -1.5, 12, 3);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    // machined rings
    for (const [r, w, col] of [[250, 12, '#15181d'], [236, 3, '#5d6570'], [168, 4, '#161a20'], [162, 2, '#4e5560']] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    // bolts round the rim
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = c + Math.cos(a) * 214, y = c + Math.sin(a) * 214;
      g.fillStyle = '#121418';
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#7d8590';
      g.beginPath();
      g.arc(x - 1.5, y - 1.5, 5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** What glows on the deck: three chevrons pointing into the ring, and the seam of the rim. */
function deckGlow() {
  return canvas(512, 512, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#fff';
    // chevrons along +x of the texture (turned to face the ring centre)
    for (let k = 0; k < 3; k++) {
      const x = 170 + k * 62;
      g.globalAlpha = 0.55 + k * 0.22;
      g.beginPath();
      g.moveTo(x, 196);
      g.lineTo(x + 46, 256);
      g.lineTo(x, 316);
      g.lineTo(x - 22, 316);
      g.lineTo(x + 24, 256);
      g.lineTo(x - 22, 196);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(256, 256, 236, 0, Math.PI * 2);
    g.stroke();
  });
}

/** Hatch doors: diagonal hazard stripes (tinted with the corner colour). */
function doorTexture() {
  return canvas(256, 256, (g) => {
    g.fillStyle = '#16181c';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#e8e8e8';
    for (let i = -256; i < 512; i += 48) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 24, 0);
      g.lineTo(i + 24 - 256, 256);
      g.lineTo(i - 256, 256);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 124, 256, 8);
  });
}

/** The shaft wall: dark ribbed steel (map) with light bands every half metre (glow). */
function shaftTextures(): [THREE.Texture, THREE.Texture] {
  const map = canvas(128, 256, (g) => {
    g.fillStyle = '#1a1d22';
    g.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x += 16) {
      g.fillStyle = '#0d0f12';
      g.fillRect(x, 0, 3, 256);
      g.fillStyle = '#2c3138';
      g.fillRect(x + 3, 0, 2, 256);
    }
  });
  const glow = canvas(8, 256, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#fff';
    for (let y = 12; y < 256; y += 42) g.fillRect(0, y, 8, 5);
  });
  for (const t of [map, glow]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, SHAFT_H / 1.75);
  }
  return [map, glow];
}

/** The corner post's pad: bands of light top and bottom, a stripe up the middle. */
function sleeveGlow() {
  return canvas(64, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#fff';
    g.fillRect(0, 4, 64, 5);
    g.fillRect(0, 119, 64, 5);
    g.globalAlpha = 0.7;
    g.fillRect(28, 16, 8, 96);
  });
}

/** An additive shaft of light: brightest through its middle, fading along its length (aAlong 0..1). */
function beamMaterial(fadeTop: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vA; varying vec3 vN; varying vec3 vV;
      void main() {
        vA = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uK;
      varying float vA; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = ${fadeTop ? '(1.0 - vA) * (1.0 - vA)' : '0.2 + 0.8 * vA'};
        gl_FragColor = vec4(uColor * edge * along * uK, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    side: THREE.FrontSide,
  });
}

/** The ring of light round the hatch: a solid seam and a band of dashes that chase round it. */
function ringMaterial(color: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uGlow: { value: 1 }, uSpin: { value: 0 }, uChase: { value: 0 }, uR: { value: HATCH_R } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uGlow; uniform float uSpin; uniform float uChase; uniform float uR;
      varying vec2 vP;
      void main() {
        float r = length(vP) - uR;
        float a = atan(vP.y, vP.x) / 6.2831853;
        float seam = smoothstep(0.0, 0.006, r) * (1.0 - smoothstep(0.016, 0.024, r));
        float band = smoothstep(0.034, 0.04, r) * (1.0 - smoothstep(0.07, 0.076, r));
        float seg = fract(a * 24.0 + uSpin);
        float dash = band * smoothstep(0.0, 0.06, seg) * (1.0 - smoothstep(0.52, 0.58, seg));
        // a bright head racing round (two of them), brighter the hotter the corner runs
        float head = pow(0.5 + 0.5 * cos((a - uSpin * 0.25) * 12.566371), 6.0);
        float k = seam * (0.8 + uChase) + dash * (0.35 + head * uChase * 2.5);
        gl_FragColor = vec4(uColor * k * uGlow, 0.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

interface Corner {
  i: number;
  x: number;
  z: number;
  /** Unit vector from the hatch to the ring centre. */
  inX: number;
  inZ: number;
  root: THREE.Group;
  deck: THREE.Group;
  deckGlow: THREE.MeshStandardMaterial;
  doors: THREE.Mesh[];
  shaft: THREE.Group;
  shaftMat: THREE.MeshStandardMaterial;
  ring: THREE.ShaderMaterial;
  column: THREE.Mesh;
  beam: THREE.Mesh;
  sleeve: THREE.MeshStandardMaterial;
  /** CO2 cannons at the foot of the post, either side of it. */
  jets: THREE.Vector3[];
  /** Entry time last frame (to catch the beats as they pass). */
  lastT: number;
  drop: number;
  flare: number;
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/**
 * The two fighters' corners. Each has a lift: a round hatch in the canvas ringed with light,
 * doors that slide apart, a lit shaft, and the deck that carries the robot up and then stays
 * flush with the canvas as the corner's floor plate. The corner post wears the corner's
 * colours, and CO2 cannons at its foot fire as the lift locks. Driven by the entrance
 * timeline (sim/entrance.ts), so it can be scrubbed: everything follows match time.
 */
export class Corners {
  readonly group = new THREE.Group();
  private corners: Corner[] = [];
  /** Each fighter's accent colour: the light show of its entrance is in its own colours. */
  private accents: [THREE.Color, THREE.Color] = [new THREE.Color(CORNER_COLOR[0]), new THREE.Color(CORNER_COLOR[1])];
  /** Beats of an entrance, for the sound. */
  onCue: ((i: number, cue: 'open' | 'rise' | 'arrive') => void) | null = null;

  constructor() {
    const deckMap = deckTexture();
    const glowMap = deckGlow();
    const doorMap = doorTexture();
    const [shaftMap, shaftGlow] = shaftTextures();
    const sleeveMap = sleeveGlow();
    const deckSide = new THREE.MeshStandardMaterial({ color: 0x2a2f37, metalness: 0.85, roughness: 0.35 });
    const piston = new THREE.MeshStandardMaterial({ color: 0xc8ced8, metalness: 1, roughness: 0.18 });
    const floor = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.5, roughness: 0.6 });
    for (let i = 0; i < 2; i++) {
      const [x, z] = hatchXZ(i);
      const d = Math.hypot(x, z);
      const col = CORNER_COLOR[i];
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      // local +x points into the ring
      root.rotation.y = Math.atan2(z, -x);
      this.group.add(root);

      // the deck: lit like the canvas (shadows, contact occlusion), chevrons glowing in the corner colour
      const deck = new THREE.Group();
      const top = contactAO.patch(
        new THREE.MeshStandardMaterial({ map: deckMap, metalness: 0.7, roughness: 0.42, emissive: col, emissiveMap: glowMap, emissiveIntensity: 1 }),
        { spheres: true, floor: true, strength: 2, direct: 0.7 },
      );
      const slab = new THREE.CylinderGeometry(HATCH_R - 0.004, HATCH_R - 0.004, 0.16, 48);
      slab.translate(0, -0.08 + 0.0015, 0);
      // the top's texture runs along local z: turn it so the chevrons point into the ring
      slab.rotateY(Math.PI / 2);
      const deckMesh = new THREE.Mesh(slab, [deckSide, top, deckSide]);
      deckMesh.receiveShadow = true;
      deck.add(deckMesh);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, SHAFT_H, 16, 1, true).translate(0, -SHAFT_H / 2 - 0.16, 0), piston);
      deck.add(rod);
      root.add(deck);

      // the doors: two halves meeting across the hatch, sliding apart under the canvas
      const doorMat = new THREE.MeshStandardMaterial({ map: doorMap, color: new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35), metalness: 0.6, roughness: 0.45 });
      const doors = [0, 1].map((k) => {
        const g = new THREE.CircleGeometry(HATCH_R + 0.01, 32, k * Math.PI, Math.PI);
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, doorMat);
        m.position.y = -0.006;
        m.receiveShadow = true;
        root.add(m);
        return m;
      });

      // the shaft: seen from inside, bands of light running down into the dark
      const shaft = new THREE.Group();
      const shaftMat = new THREE.MeshStandardMaterial({ map: shaftMap, emissive: col, emissiveMap: shaftGlow, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.5, side: THREE.BackSide });
      shaft.add(new THREE.Mesh(new THREE.CylinderGeometry(HATCH_R + 0.012, HATCH_R + 0.012, SHAFT_H, 40, 1, true).translate(0, -SHAFT_H / 2, 0), shaftMat));
      shaft.add(new THREE.Mesh(new THREE.CircleGeometry(HATCH_R + 0.02, 32).rotateX(-Math.PI / 2).translate(0, -SHAFT_H + 0.01, 0), floor));
      root.add(shaft);

      // light round the rim
      const ring = ringMaterial(col);
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(HATCH_R, HATCH_R + 0.08, 96, 1), ring);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.004;
      ringMesh.renderOrder = 2;
      root.add(ringMesh);

      // light pouring up out of the open shaft
      const colGeo = new THREE.CylinderGeometry(HATCH_R * 0.82, HATCH_R * 0.96, 2.8, 32, 1, true).translate(0, 1.4, 0);
      const column = new THREE.Mesh(colGeo, beamMaterial(true));
      column.visible = false;
      column.frustumCulled = false;
      root.add(column);

      // a spot from the truss straight down onto the corner
      const top3 = new THREE.Vector3(x * 0.55, 9.5, z * 0.55);
      const bot3 = new THREE.Vector3(x, 0, z);
      const len = top3.distanceTo(bot3);
      const beamGeo = new THREE.CylinderGeometry(0.14, 1.15, len, 24, 1, true);
      // uv.y: 1 at the lamp, 0 on the canvas
      beamGeo.translate(0, -len / 2, 0);
      const beam = new THREE.Mesh(beamGeo, beamMaterial(false));
      beam.position.copy(top3);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _d.subVectors(bot3, top3).normalize());
      beam.visible = false;
      beam.frustumCulled = false;
      this.group.add(beam);

      // the corner post's pad, in the corner's colours
      const a = ((CORNER_OF[i] + 0.5) * Math.PI) / 4;
      const px = Math.cos(a) * RING_CORNER, pz = Math.sin(a) * RING_CORNER;
      const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.55), metalness: 0.3, roughness: 0.4, emissive: col, emissiveMap: sleeveMap, emissiveIntensity: 1 });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.184, 0.184, 1.12, 24, 1), sleeve);
      pad.position.set(px, 0.95, pz);
      // its glowing stripe (the middle of the map, local -z) faces the ring
      pad.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      pad.castShadow = true;
      this.group.add(pad);
      // CO2 cannons either side of the post, on the canvas edge
      const tx = -Math.sin(a), tz = Math.cos(a);
      const jets = [-1, 1].map((s) => new THREE.Vector3(px * 0.97 + tx * s * 0.42, 0.06, pz * 0.97 + tz * s * 0.42));
      const nozzle = new THREE.MeshStandardMaterial({ color: 0x30353d, metalness: 0.9, roughness: 0.3 });
      for (const j of jets) {
        const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.14, 12).translate(0, 0.07, 0), nozzle);
        n.position.set(j.x, 0, j.z);
        this.group.add(n);
      }

      this.corners.push({
        i,
        x,
        z,
        inX: -x / d,
        inZ: -z / d,
        root,
        deck,
        deckGlow: top,
        doors,
        shaft,
        shaftMat,
        ring,
        column,
        beam,
        sleeve,
        jets,
        lastT: Infinity,
        drop: 0,
        flare: 0,
      });
    }
    this.pose(null);
  }

  /** Each fighter's accent colour (the light show of its entrance). */
  setAccents(a: number, b: number) {
    this.accents[0].setHex(a);
    this.accents[1].setHex(b);
  }

  /** How far below the canvas fighter i's lift deck is (the robot rides on it; 0 = flush). */
  drop(i: number) {
    return this.corners[i].drop;
  }

  /** How hard fighter i's corner is lit up right now (0..1): the house lights follow it. */
  flare(i: number) {
    return this.corners[i].flare;
  }

  /** Pose the corners for this moment of the match (null: no fight, everything at rest). */
  private pose(m: Match | null, time = 0) {
    for (const c of this.corners) {
      const t = m ? entryTime(m.phase, m.phaseTime, c.i) : Infinity;
      const done = t === Infinity;
      const open = done ? 1 : ease((t - ENTRY.open) / (ENTRY.opened - ENTRY.open));
      const up = done ? 1 : liftUp(t);
      // the lift locks with a heavy clunk
      const s = t - ENTRY.arrive;
      const clunk = s > 0 && s < 0.6 ? -0.028 * Math.exp(-s * 9) * Math.sin(s * 34) : 0;
      c.drop = -(1 - up) * LIFT_DEPTH + clunk;
      c.deck.position.y = c.drop;
      for (let k = 0; k < 2; k++) {
        const door = c.doors[k];
        door.visible = open < 0.999;
        // each half slides out along its own side (local z), under the canvas
        door.position.z = (k === 0 ? -1 : 1) * open * (HATCH_R + 0.04);
      }
      c.shaft.visible = open > 0.001 && up < 0.999;
      // how hot the corner runs: builds as the doors open, peaks on the reveal, settles
      const live = done ? 0 : t < 0 ? 0 : t < ENTRY.arrive ? 0.25 + 0.75 * ease(t / ENTRY.arrive) : Math.exp(-(t - ENTRY.arrive) * 1.1);
      c.flare = live;
      const waiting = !done && t < 0;
      c.ring.uniforms.uGlow.value = RenderSettings.glow(waiting ? 1.2 + 0.4 * Math.sin(time * 3) : 1.4 + live * 2.2);
      c.ring.uniforms.uChase.value = live;
      c.ring.uniforms.uSpin.value = time * (0.4 + live * 3);
      c.deckGlow.emissiveIntensity = RenderSettings.glow(0.9 + live * 2.5);
      c.sleeve.emissiveIntensity = RenderSettings.glow(1.1 + live * 2.2 * (0.75 + 0.25 * Math.sin(time * 14)));
      c.shaftMat.emissiveIntensity = RenderSettings.glow(1.2 + live * 2);
      // light pouring out of the open shaft, and the spot from above
      const col = c.column.material as THREE.ShaderMaterial;
      const ck = done ? 0 : open * (t < ENTRY.arrive ? 1 : Math.exp(-(t - ENTRY.arrive) * 2.2));
      col.uniforms.uK.value = ck * RenderSettings.glow(1.6);
      col.uniforms.uColor.value.copy(this.accents[c.i]);
      c.column.visible = ck > 0.01;
      const beam = c.beam.material as THREE.ShaderMaterial;
      const bk = done ? 0 : t < 0 ? 0 : t < ENTRY.arrive ? ease(t / 0.6) * 0.7 : 0.7 + 0.5 * Math.exp(-(t - ENTRY.arrive) * 2) - ease((t - ENTRY.arrive - 1.2) / 1.2) * 0.7;
      beam.uniforms.uK.value = Math.max(0, bk) * 0.5;
      beam.uniforms.uColor.value.copy(this.accents[c.i]).lerp(_c.setHex(0xffffff), 0.35);
      c.beam.visible = bk > 0.01;
    }
  }

  update(dt: number, time: number, m: Match | null, fx: Fx, quiet: boolean) {
    this.pose(m, time);
    if (!m || quiet || dt <= 0) {
      for (const c of this.corners) c.lastT = m ? entryTime(m.phase, m.phaseTime, c.i) : Infinity;
      return;
    }
    for (const c of this.corners) {
      const t = entryTime(m.phase, m.phaseTime, c.i);
      const t0 = c.lastT;
      c.lastT = t;
      if (t === Infinity) continue;
      // a beat passed this frame (and not long ago: a seek or a skip lands without fireworks)
      const at = (b: number) => t0 < b && t >= b && t - b < 0.25;
      if (at(ENTRY.open)) this.onCue?.(c.i, 'open');
      if (at(ENTRY.rise)) this.onCue?.(c.i, 'rise');
      const acc = this.accents[c.i];
      // cold fog spilling over the rim while the shaft is open
      if (t > ENTRY.open && t < ENTRY.arrive + 0.3) {
        const n = Math.random() < dt * 32 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          _v.set(c.x + Math.cos(a) * HATCH_R * 0.9, 0.06, c.z + Math.sin(a) * HATCH_R * 0.9);
          const sp = 0.4 + Math.random() * 0.5;
          fx.vapor(_v, Math.cos(a) * sp, 0.15 + Math.random() * 0.3, Math.sin(a) * sp, 0.16);
        }
        // and a hot draught straight up the middle
        if (t > ENTRY.rise && Math.random() < dt * 14) {
          _v.set(c.x + (Math.random() - 0.5) * 0.4, 0.1, c.z + (Math.random() - 0.5) * 0.4);
          fx.vapor(_v, 0, 1.4 + Math.random(), 0, 0.12);
        }
      }
      if (at(ENTRY.arrive)) {
        this.onCue?.(c.i, 'arrive');
        // the reveal: a ring of sparks off the rim, a flash, the cannons
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.random() * 0.4;
          _v.set(c.x + Math.cos(a) * HATCH_R, 0.05, c.z + Math.sin(a) * HATCH_R);
          _d.set(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
          fx.sparks(_v, _d, 7, acc, 5, 0.5);
        }
        _v.set(c.x, 0.5, c.z);
        fx.flash(_v, acc, 2.2, 0.25);
      }
      // CO2: two white columns for the best part of a second
      const s = t - ENTRY.arrive;
      if (s >= 0 && s < 0.85) {
        for (const j of c.jets) {
          const n = Math.round(dt * 45 * (1 - s * 0.6));
          for (let k = 0; k < n; k++) {
            _v.copy(j).y += 0.12;
            fx.vapor(_v, c.inX * 0.4 + (Math.random() - 0.5) * 0.35, 6 + Math.random() * 2.5, c.inZ * 0.4 + (Math.random() - 0.5) * 0.35, 0.13);
          }
        }
        if (s < 0.2 && Math.random() < dt * 30) {
          const j = c.jets[(Math.random() * 2) | 0];
          fx.sparks(j, UP, 4, 0xfff2d0, 4, 0.4);
        }
      }
    }
  }
}
