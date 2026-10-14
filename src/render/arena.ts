import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RenderSettings } from './settings';
import { RING_CORNER, ROPE_LINE, ropeSide as sideOf, SIDE_NX, SIDE_NZ } from '../sim/body';
import { Venue } from './venue';
import { splitWedges } from './wedges';
import { contactAO } from './ao';
import { FLOOR } from './bowl';
import { beam, canvasTexture, cornerAngle, octBand, octDisc, skirtTexture } from './ring';

export const RING_RADIUS = RING_CORNER; // corner radius of the octagon
const SIDES = 8;
const ROPE_HEIGHTS = [0.55, 0.95, 1.35];
const ROPES = SIDES * ROPE_HEIGHTS.length;
/** Half the length of one side's ropes, post to post. */
const ROPE_HALF = RING_RADIUS * Math.sin(Math.PI / SIDES);
/** Rough armour radius around each physics joint, for pressing into the ropes. */
const PRESS_RADII = [0.3, 0.36, 0.14, 0.24, 0.2, 0.13, 0.16, 0.2, 0.13, 0.16, 0.17, 0.14, 0.12, 0.17, 0.14, 0.12];
/** Rope spring: stiffness (wobbles about 3.5 times a second) and damping. */
const ROPE_K = 480;
const ROPE_C = 5;

/** Vertex colours for one piece of a merged emissive mesh. */
function tint(geo: THREE.BufferGeometry, c: THREE.Color) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Turns a lathe/cylinder geometry stood at the origin so its axis runs along `dir`, centred on `at`. */
function aim(geo: THREE.BufferGeometry, at: THREE.Vector3, dir: THREE.Vector3) {
  return geo.applyMatrix4(
    new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)),
  );
}

/** Where the six lamps on the truss hang, and the point on the canvas each one is aimed at. */
const LAMPS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  return {
    top: new THREE.Vector3(Math.cos(a) * 6.3, 8.4, Math.sin(a) * 6.3),
    bottom: new THREE.Vector3(Math.cos(a + 0.6) * 1.6, 0, Math.sin(a + 0.6) * 1.6),
  };
});
const TRUSS_Y = 8.75;

export class Arena {
  readonly group = new THREE.Group();
  readonly venue: Venue;
  private ropeMat: THREE.MeshBasicMaterial;
  private ropeBase = new THREE.Color(0x52e6ff).multiplyScalar(RenderSettings.glow(1.15));
  private ropeFlash = 0;
  /** The post beacons, LED strips and truss lamps: one vertex-coloured draw that pulses with the crowd. */
  private glowMat: THREE.MeshBasicMaterial;
  private skirtFlash = { value: 0 };
  /**
   * Per rope (side * 3 + height): where along it the push lands (0..1 post to post),
   * how far it is bowed out, and how much it is swinging free (sine) rather than
   * pressed into a V by a body. Packed as vec4s for the vertex shader.
   */
  private ropeU = { value: new Float32Array(ROPES * 4) };
  private ropeVel = new Float32Array(ROPES);
  private ropePress = new Float32Array(ROPES);
  private ropeAt = new Float32Array(ROPES);
  readonly uniforms = { uTime: { value: 0 }, uHype: { value: 0.3 } };
  private hype = 0.3;

  constructor(quality: 'low' | 'med' | 'high') {
    const g = this.group;
    // the arena around the ring: stands, crowd, boards, roof (added to the scene beside `group`)
    this.venue = new Venue(quality, this.uniforms);
    // the bowl wraps all the way round the camera: cut its big meshes into wedges that can be culled
    splitWedges(this.venue.group, { skip: [this.venue.crowd.group] });
    this.buildStage(quality);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const glow: THREE.BufferGeometry[] = [];
    this.buildPosts(glow);
    this.ropeMat = this.buildRopes();
    this.buildTruss(glow);
    g.add(new THREE.Mesh(mergeGeometries(glow)!, this.glowMat));

    // light beams (fake volumetrics)
    if (quality !== 'low') g.add(this.buildBeams());
  }

  /**
   * The stage: a printed canvas that rolls over a padded bumper at its edge, a steel lip, and a
   * raked LED skirt down to the arena floor that scrolls the league's name and flares with the
   * crowd. Footprint matches the sim's `groundAt` (canvas to RING+0.55, lip at -0.12 to RING+0.75).
   */
  private buildStage(quality: 'low' | 'med' | 'high') {
    const g = this.group;
    const R = RING_RADIUS + 0.55;
    // the robots' contact shadows land here; the edges and post bases are baked into the texture
    const canvas = new THREE.Mesh(
      octDisc(R),
      contactAO.patch(new THREE.MeshStandardMaterial({ map: canvasTexture(quality === 'high' ? 2048 : 1024, R), roughness: 0.82, metalness: 0.04 }), {
        spheres: true,
        floor: true,
        strength: 2,
        direct: 0.7,
      }),
    );
    canvas.receiveShadow = true;
    g.add(canvas);
    // the canvas wraps over a padded bumper at its edge
    const bumper = new THREE.Mesh(
      octBand([
        [R - 0.11, 0.0005],
        [R - 0.05, 0.014],
        [R - 0.005, 0.012],
        [R + 0.02, -0.02],
        [R + 0.025, -0.07],
        [R + 0.01, -0.11],
        [R - 0.01, -0.125],
      ]),
      new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.55, metalness: 0.05 }),
    );
    bumper.receiveShadow = true;
    g.add(bumper);
    // steel lip and foot of the stage
    const B = RING_RADIUS + 0.75;
    const steel = mergeGeometries([
      octBand([
        [R - 0.02, -0.118],
        [B - 0.01, -0.118],
        [B + 0.015, -0.135],
        [B + 0.04, -0.17],
      ]),
      octBand([
        [B + 0.11, -0.52],
        [B + 0.15, -0.56],
        [B + 0.21, FLOOR],
      ]),
    ])!;
    const base = new THREE.Mesh(
      steel,
      contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x1b1f28, metalness: 0.6, roughness: 0.55 }), {
        ground: { y: FLOOR, height: 0.4, k: 0.55 },
      }),
    );
    base.receiveShadow = true;
    g.add(base);
    // LED skirt between them
    const REPEAT = 6;
    const skirt = new THREE.Mesh(
      octBand([
        [B + 0.04, -0.17],
        [B + 0.11, -0.52],
      ]),
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: skirtTexture() },
          uTime: this.uniforms.uTime,
          uHype: this.uniforms.uHype,
          uFlash: this.skirtFlash,
          uA: { value: new THREE.Color(0xff8a2a).multiplyScalar(RenderSettings.glow(2.4)) },
          uB: { value: new THREE.Color(0x52e6ff).multiplyScalar(RenderSettings.glow(1.6)) },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap; uniform float uTime; uniform float uHype; uniform float uFlash;
          uniform vec3 uA; uniform vec3 uB; varying vec2 vUv;
          void main() {
            // read from outside the ring, the lettering runs against the corner order, top down
            float u = 1.0 - vUv.x;
            vec4 t = texture2D(uMap, vec2(u * ${REPEAT}.0 - uTime * 0.04, 1.0 - vUv.y));
            // two bright sweeps chase round the ring, faster when the crowd is up
            float chase = smoothstep(0.85, 1.0, fract(u * 2.0 - uTime * (0.12 + 0.2 * uHype)));
            float k = 0.5 + 0.4 * uHype + uFlash + chase * 0.7;
            gl_FragColor = vec4((uA * t.r + uB * t.g) * k + vec3(0.018, 0.02, 0.028), 1.0);
          }`,
      }),
    );
    skirt.name = 'skirt';
    g.add(skirt);
  }

  /**
   * Corner posts: a bolted flange, a steel column, a tall vinyl pad that swallows the rope ends,
   * an LED strip down the pad's ring-facing side and a glowing beacon crown on top.
   */
  private buildPosts(glow: THREE.BufferGeometry[]) {
    const steel: THREE.BufferGeometry[] = [];
    const pads: THREE.BufferGeometry[] = [];
    const orange = new THREE.Color(0xffa040).multiplyScalar(RenderSettings.glow(3));
    const strip = new THREE.Color(0xff8a2a).multiplyScalar(RenderSettings.glow(2.2));
    const padShape = [
      [0.07, 0.36],
      [0.14, 0.375],
      [0.165, 0.41],
      [0.172, 0.6],
      [0.172, 1.3],
      [0.165, 1.48],
      [0.14, 1.515],
      [0.07, 1.53],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    for (let i = 0; i < SIDES; i++) {
      const a = cornerAngle(i);
      const x = Math.cos(a) * RING_RADIUS, z = Math.sin(a) * RING_RADIUS;
      const flange = new THREE.CylinderGeometry(0.22, 0.25, 0.04, 8);
      flange.translate(x, 0.02, z);
      steel.push(flange);
      for (let b = 0; b < 4; b++) {
        const ba = a + Math.PI / 4 + (b * Math.PI) / 2;
        const bolt = new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6);
        bolt.translate(x + Math.cos(ba) * 0.17, 0.05, z + Math.sin(ba) * 0.17);
        steel.push(bolt);
      }
      const column = new THREE.CylinderGeometry(0.07, 0.08, 1.66, 8);
      column.translate(x, 0.83, z);
      steel.push(column);
      const crown = new THREE.CylinderGeometry(0.13, 0.1, 0.07, 12);
      crown.translate(x, 1.665, z);
      steel.push(crown);
      const pad = new THREE.LatheGeometry(padShape, 12);
      pad.translate(x, 0, z);
      pads.push(pad);
      const beacon = new THREE.CylinderGeometry(0.11, 0.12, 0.04, 12);
      beacon.translate(x, 1.72, z);
      glow.push(tint(beacon, orange));
      // LED strip on the side of the pad that faces the ring
      const led = new THREE.BoxGeometry(0.035, 0.86, 0.02);
      led.rotateY(Math.atan2(-x, -z));
      led.translate(x - Math.cos(a) * 0.168, 0.95, z - Math.sin(a) * 0.168);
      glow.push(tint(led, strip));
    }
    const posts = new THREE.Mesh(
      mergeGeometries(steel)!,
      contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x3a404c, metalness: 0.85, roughness: 0.32 }), {
        ground: { y: 0, height: 0.6, k: 0.6 },
      }),
    );
    posts.castShadow = true;
    this.group.add(posts);
    const padMesh = new THREE.Mesh(
      mergeGeometries(pads)!,
      contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x1d2029, metalness: 0.1, roughness: 0.42 }), {
        ground: { y: 0, height: 0.7, k: 0.5 },
      }),
    );
    padMesh.castShadow = true;
    this.group.add(padMesh);
  }

  /**
   * Ropes: armoured cables with a neon core, three per side, tied together by two vinyl straps
   * per side. 16 segments each so they can bow: the vertex shader bends them, and the straps
   * follow the ropes they are tied to. The core light ripples along them with the crowd.
   */
  private buildRopes() {
    const geos: THREE.BufferGeometry[] = [];
    const nH = ROPE_HEIGHTS.length;
    const H0 = ROPE_HEIGHTS[0], HS = ROPE_HEIGHTS[1] - ROPE_HEIGHTS[0];
    for (let i = 0; i < SIDES; i++) {
      const a0 = cornerAngle(i - 1), a1 = cornerAngle(i);
      const p0 = new THREE.Vector3(Math.cos(a0) * RING_RADIUS, 0, Math.sin(a0) * RING_RADIUS);
      const p1 = new THREE.Vector3(Math.cos(a1) * RING_RADIUS, 0, Math.sin(a1) * RING_RADIUS);
      const len = p0.distanceTo(p1);
      const yaw = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
      // side i runs between corners i-1 and i, so it faces halfway between them
      const nx = SIDE_NX[i], nz = SIDE_NZ[i];
      const tag = (geo: THREE.BufferGeometry, kind: number, h: number | null) => {
        const pos = geo.attributes.position;
        const n = pos.count;
        const t = new Float32Array(n);
        const hh = new Float32Array(n);
        const out = new Float32Array(n * 2);
        for (let v = 0; v < n; v++) {
          const u = -pos.getX(v) * nz + pos.getZ(v) * nx;
          t[v] = Math.min(1, Math.max(0, (u + ROPE_HALF) / (2 * ROPE_HALF)));
          hh[v] = h ?? Math.min(2, Math.max(0, (pos.getY(v) - H0) / HS));
          out[v * 2] = nx;
          out[v * 2 + 1] = nz;
        }
        geo.setAttribute('aRope', new THREE.BufferAttribute(new Float32Array(n).fill(i * nH), 1));
        geo.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
        geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
        geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
        geo.setAttribute('aOut', new THREE.BufferAttribute(out, 2));
        geos.push(geo);
      };
      for (let h = 0; h < nH; h++) {
        const rope = new THREE.CylinderGeometry(0.026, 0.026, len, 6, 16, true);
        rope.rotateZ(Math.PI / 2);
        rope.rotateY(yaw);
        rope.translate((p0.x + p1.x) / 2, ROPE_HEIGHTS[h], (p0.z + p1.z) / 2);
        tag(rope, 0, h);
      }
      for (const f of [1 / 3, 2 / 3]) {
        const strap = new THREE.BoxGeometry(0.05, ROPE_HEIGHTS[nH - 1] - H0, 0.034, 1, nH - 1, 1);
        strap.rotateY(yaw);
        strap.translate(p0.x + (p1.x - p0.x) * f, (H0 + ROPE_HEIGHTS[nH - 1]) / 2, p0.z + (p1.z - p0.z) * f);
        tag(strap, 1, null);
      }
    }
    for (let k = 0; k < ROPES; k++) {
      this.ropeU.value[k * 4] = 0.5;
      this.ropeU.value[k * 4 + 2] = 1;
    }
    const mat = new THREE.MeshBasicMaterial({ color: this.ropeBase.clone(), toneMapped: false });
    const ropeU = this.ropeU;
    const { uTime, uHype } = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRope = ropeU;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uHype = uHype;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aRope; attribute float aH; attribute float aKind; attribute float aT; attribute vec2 aOut;
           uniform vec4 uRope[${ROPES}];
           varying vec3 vRN; varying vec3 vRV; varying float vRT; varying float vRK;
           // pressed: straight lines from each post to the contact (a V); free: a swinging arc
           float ropeBow(vec4 rp, float t) {
             float s = clamp(rp.x, 0.08, 0.92);
             float vee = t < s ? t / s : (1.0 - t) / (1.0 - s);
             return rp.y * mix(vee, sin(3.14159265 * t), rp.z);
           }`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // ropes sit on whole heights; a strap between two ropes follows both
           float fh = clamp(aH, 0.0, 2.0);
           float i0 = min(floor(fh), 1.0);
           int k0 = int(aRope + i0 + 0.5);
           transformed.xz += aOut * mix(ropeBow(uRope[k0], aT), ropeBow(uRope[k0 + 1], aT), fh - i0);`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vRN = normalize(normalMatrix * normal); vRV = -mvPosition.xyz; vRT = aT; vRK = aKind;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime; uniform float uHype;
           varying vec3 vRN; varying vec3 vRV; varying float vRT; varying float vRK;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
           float rf = abs(dot(normalize(vRN), normalize(vRV)));
           if (vRK < 0.5) {
             // a dark sleeve round a neon core, with light rippling along it
             float core = smoothstep(0.35, 0.9, rf);
             float ripple = 0.5 + 0.5 * sin(vRT * 18.85 - uTime * 3.0);
             vec3 lit = diffuseColor.rgb * (0.85 + 0.35 * uHype * ripple);
             diffuseColor.rgb = mix(vec3(0.03, 0.035, 0.045) + diffuseColor.rgb * 0.05, lit, core);
           } else {
             diffuseColor.rgb = vec3(0.55, 0.57, 0.62) * (0.25 + 0.6 * rf);
           }`,
        );
    };
    const ropes = new THREE.Mesh(mergeGeometries(geos)!, mat);
    // bowing ropes reach past the merged bounds; they ring the camera's subject anyway
    ropes.frustumCulled = false;
    ropes.name = 'ropes';
    this.group.add(ropes);
    return mat;
  }

  /** An octagonal box truss over the ring, with the six lamps that throw the light shafts. */
  private buildTruss(glow: THREE.BufferGeometry[]) {
    const geos: THREE.BufferGeometry[] = [];
    const H = 0.18; // half the truss section
    const RT = 6.25 / Math.cos(Math.PI / SIDES); // corner radius, so the sides run through the lamps
    const at = (i: number, dr: number, dy: number, t = 0) => {
      const a = cornerAngle(i - 1), b = cornerAngle(i);
      const r = RT + dr / Math.cos(Math.PI / SIDES);
      const p = new THREE.Vector3(Math.cos(a) * r, TRUSS_Y + dy, Math.sin(a) * r);
      return p.lerp(new THREE.Vector3(Math.cos(b) * r, TRUSS_Y + dy, Math.sin(b) * r), t);
    };
    const N = 7;
    for (let i = 0; i < SIDES; i++) {
      const chords: [number, number][] = [
        [-H, -H],
        [H, -H],
        [H, H],
        [-H, H],
      ];
      for (const [dr, dy] of chords) geos.push(beam(at(i, dr, dy, -0.01), at(i, dr, dy, 1.01), 0.05));
      // zigzag lacing down each of the four faces
      for (let f = 0; f < 4; f++) {
        const [r0, y0] = chords[f], [r1, y1] = chords[(f + 1) % 4];
        for (let k = 0; k < N; k++) {
          const ta = k / N, tb = (k + 1) / N;
          const a = k % 2 ? at(i, r0, y0, ta) : at(i, r1, y1, ta);
          const b = k % 2 ? at(i, r1, y1, tb) : at(i, r0, y0, tb);
          geos.push(beam(a, b, 0.022));
        }
      }
    }
    const lens = new THREE.Color(0xdfefff).multiplyScalar(RenderSettings.glow(2.5));
    for (const { top, bottom } of LAMPS) {
      const dir = bottom.clone().sub(top).normalize();
      geos.push(aim(new THREE.CylinderGeometry(0.14, 0.11, 0.3, 10), top.clone().addScaledVector(dir, -0.12), dir));
      geos.push(beam(top.clone().addScaledVector(dir, -0.2), new THREE.Vector3(top.x, TRUSS_Y - H, top.z), 0.04));
      glow.push(tint(aim(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10), top.clone().addScaledVector(dir, 0.035), dir), lens));
    }
    const truss = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshStandardMaterial({ color: 0x22262f, metalness: 0.8, roughness: 0.45 }));
    truss.name = 'truss';
    this.group.add(truss);
  }

  /**
   * Six shafts of light from the truss, slanting down towards the ring, as one draw.
   *
   * The glow is brightest at the lamp and fades with distance, so the lower half of a shaft was
   * nearly invisible yet, being the widest part and the part closest to the camera, it covered
   * most of the pixels. The cones now stop above the robots' heads (fading out on the way) and
   * draw only their front faces: one layer of blending per pixel instead of two, over a fraction
   * of the area. Each shaft sways from its lamp in the vertex shader.
   */
  private buildBeams() {
    const CUT = 0.6; // fraction of the way from the lamp to the floor that the shaft is drawn
    const R_TOP = 0.15;
    const R_FLOOR = 1.6;
    const geos: THREE.BufferGeometry[] = [];
    const down = new THREE.Vector3(0, -1, 0);
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 6.3, 8.4, Math.sin(a) * 6.3);
      const bottom = new THREE.Vector3(Math.cos(a + 0.6) * 1.6, 0, Math.sin(a + 0.6) * 1.6);
      const dir = bottom.clone().sub(top);
      const len = dir.length() * CUT;
      dir.normalize();
      const geo = new THREE.CylinderGeometry(R_TOP, R_TOP + (R_FLOOR - R_TOP) * CUT, len, 16, 1, true);
      geo.deleteAttribute('uv');
      // lamp at the origin, shaft hanging along -Y, then aimed and moved onto the truss
      geo.translate(0, -len / 2, 0);
      // 0 at the lamp, 1 at the cut
      const pos = geo.attributes.position;
      const along = new Float32Array(pos.count);
      for (let v = 0; v < pos.count; v++) along[v] = -pos.getY(v) / len;
      geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
      geo.applyMatrix4(m.compose(top, q.setFromUnitVectors(down, dir), new THREE.Vector3(1, 1, 1)));
      const sway = new Float32Array(pos.count * 4);
      for (let v = 0; v < pos.count; v++) sway.set([top.x, top.y, top.z, i], v * 4);
      geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 4));
      geos.push(geo);
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xbfdfff) }, uTime: this.uniforms.uTime, uCut: { value: CUT } },
      vertexShader: /* glsl */ `
        attribute float aAlong;
        attribute vec4 aSway;
        uniform float uTime;
        uniform float uCut;
        varying float vY; varying vec3 vN; varying vec3 vV;
        // rotate about axis k (unit) by angle a
        vec3 rot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
        void main() {
          // the lamp pans side to side around the ring
          vec3 k = normalize(vec3(aSway.x, 0.0, aSway.z));
          float ang = sin(uTime * 0.3 + aSway.w) * 0.03;
          vec3 p = aSway.xyz + rot(position - aSway.xyz, k, ang);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * rot(normal, k, ang));
          vV = normalize(-mv.xyz);
          // 1 at the lamp, 0 on the floor (where the shaft would land if it went all the way)
          vY = 1.0 - aAlong * uCut;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uCut;
        varying float vY; varying vec3 vN; varying vec3 vV;
        void main() {
          // brightest looking through the middle of the shaft, nothing at its edges
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float k = edge * (0.03 + 0.12 * vY * vY);
          // the two faces of the old double-sided cone, in one; fading out before the cut
          float a = 2.0 * k * k * smoothstep(1.0 - uCut, 1.0 - uCut + 0.22, vY);
          gl_FragColor = vec4(uColor * a, 0.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      side: THREE.FrontSide,
    });
    const beams = new THREE.Mesh(mergeGeometries(geos)!, mat);
    // swaying pushes the shafts a little past the merged bounds
    beams.frustumCulled = false;
    beams.name = 'beams';
    return beams;
  }

  setPixelScale(h: number) {
    this.venue.setPixelScale(h);
  }

  flashRopes(k = 1) {
    this.ropeFlash = Math.min(1.5, this.ropeFlash + k);
  }

  /** A fighter slammed into the ropes: that side's ropes twang outwards. */
  ropeHit(x: number, z: number, strength: number) {
    const side = sideOf(x, z);
    const at = (-x * SIDE_NZ[side] + z * SIDE_NX[side] + ROPE_HALF) / (2 * ROPE_HALF);
    for (let h = 0; h < ROPE_HEIGHTS.length; h++) {
      const k = side * ROPE_HEIGHTS.length + h;
      this.ropeVel[k] += Math.min(3, strength) * (h === 1 ? 0.5 : 0.35);
      this.ropeU.value[k * 4] = Math.min(0.92, Math.max(0.08, at));
    }
  }

  /**
   * Let the fighters' bodies press into the ropes. Each joint is treated as a ball
   * the size of the armour around it; where it crosses a rope's line, that rope is
   * pushed out to meet it. Cheap: 32 balls against the 3 ropes of their nearest side.
   */
  pressRopes(bodies: readonly (readonly THREE.Vector3[])[], sizes: readonly number[] = []) {
    const press = this.ropePress.fill(0);
    const at = this.ropeAt;
    const nH = ROPE_HEIGHTS.length;
    bodies.forEach((joints, b) => {
      const z = sizes[b] ?? 1;
      for (let j = 0; j < joints.length; j++) {
        const p = joints[j];
        const rad = (PRESS_RADII[j] ?? 0.15) * z;
        const side = sideOf(p.x, p.z);
        const nx = SIDE_NX[side], nz = SIDE_NZ[side];
        const reach = p.x * nx + p.z * nz - ROPE_LINE;
        // clear of them on the inside, or already well out past them (thrown over the top)
        if (reach + rad <= 0 || reach - rad > 0.3) continue;
        const along = (-p.x * nz + p.z * nx + ROPE_HALF) / (2 * ROPE_HALF);
        for (let h = 0; h < nH; h++) {
          const dy = p.y - ROPE_HEIGHTS[h];
          if (Math.abs(dy) >= rad) continue;
          // the ball's width at the rope's height
          const d = reach + Math.sqrt(rad * rad - dy * dy);
          const k = side * nH + h;
          if (d > press[k]) {
            press[k] = d;
            at[k] = along;
          }
        }
      }
    });
    // the ropes are tied together at the posts and sag together: neighbours follow a little
    for (let side = 0; side < SIDES; side++) {
      const k = side * nH;
      const mid = press[k + 1];
      if (press[k] < mid * 0.35) {
        press[k] = mid * 0.35;
        at[k] = at[k + 1];
      }
      if (press[k + 2] < mid * 0.35) {
        press[k + 2] = mid * 0.35;
        at[k + 2] = at[k + 1];
      }
      const hi = Math.max(press[k], press[k + 2]);
      if (press[k + 1] < hi * 0.35) {
        press[k + 1] = hi * 0.35;
        at[k + 1] = press[k] > press[k + 2] ? at[k] : at[k + 2];
      }
    }
  }

  private updateRopes(dt: number) {
    if (dt <= 0) return;
    const u = this.ropeU.value;
    const step = Math.min(dt, 1 / 30);
    for (let k = 0; k < ROPES; k++) {
      let x = u[k * 4 + 1];
      let v = this.ropeVel[k];
      const press = this.ropePress[k];
      // springs back (overshooting a touch into the ring), then settles
      v += (-ROPE_K * x - ROPE_C * v) * step;
      x += v * step;
      if (press > x) {
        // a body is leaning on it: the rope stays wrapped against the armour
        v = Math.max(v, Math.min(4, (press - x) / step));
        x = press;
        u[k * 4] += (this.ropeAt[k] - u[k * 4]) * Math.min(1, step * 20);
        u[k * 4 + 2] = Math.max(0, u[k * 4 + 2] - step * 8);
      } else {
        // let go: it swings in its natural arc
        u[k * 4 + 2] = Math.min(1, u[k * 4 + 2] + step * 2.5);
      }
      if (x > 0.7) {
        x = 0.7;
        v = Math.min(v, 0);
      } else if (x < -0.2) {
        x = -0.2;
        v = Math.max(v, 0);
      }
      u[k * 4 + 1] = x;
      this.ropeVel[k] = v;
    }
  }

  excite(k: number) {
    this.hype = Math.min(1.5, this.hype + k);
    if (k >= 1) this.venue.strobe(k * 0.6);
  }

  update(dt: number, time: number) {
    this.uniforms.uTime.value = time;
    this.hype += (0.3 - this.hype) * Math.min(1, dt * 0.5);
    this.uniforms.uHype.value = this.hype;
    this.venue.update(dt, time, this.hype);
    this.ropeFlash = Math.max(0, this.ropeFlash - dt * 3);
    this.ropeMat.color.copy(this.ropeBase).multiplyScalar(1 + this.ropeFlash * 1.6);
    this.glowMat.color.setScalar(0.8 + this.hype * 0.35 + this.ropeFlash * 0.4);
    this.skirtFlash.value = this.ropeFlash * 0.6;
    this.updateRopes(dt);
  }
}

