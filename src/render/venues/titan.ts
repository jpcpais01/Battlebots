import * as THREE from 'three';
import { Crowd, CROWD_SHEET } from '../crowd';
import { contactAO } from '../ao';
import { octDisc } from '../ring';
import { RenderSettings } from '../settings';
import { Scoreboard, gateMaterial, type ScoreState, type VenueLike } from '../venue';
import type { LightLook } from '../stage';
import type { ReflectLook } from '../rt';
import { HATCH_R, hatchXZ } from '../../sim/entrance';
import { skyDome, vMaterial, venueUniforms, V_GLSL, V_OUT, type Daylight, type VenueUniforms } from './kit';
import { GROUND_Y, PORTAL_HW, PORTAL_SPRING, R_IN, TitanBuild } from './titanBuild';
import {
  BANNER_FRAG,
  BANNER_VERT,
  CROWD_VERT,
  ENERGY_FRAG,
  ENERGY_VERT,
  KERB_FRAG,
  MEMBRANE_FRAG,
  PYLON_FRAG,
  STEEL_FRAG,
  STONE_FRAG,
  T_GLSL,
  T_VERT,
  TURF_GLSL,
  crowdFrag,
} from './titanGlsl';

/**
 * The Titan Colosseum: where titan battles are fought (the Android app's, ported). A flat grass
 * plain inside a stone-and-steel bowl a kilometre and a half across, packed to the rim, under a
 * low golden sun. The robots are the usual robots and the fight is the usual sim: what makes them
 * 30 m titans is everything round them being built to that scale (TitanBuild), the fight running
 * slower (Game's titan time), the camera filming them like giants (Director.titan) and the effects
 * and sound weighing more (TitanFx, Sfx.titan).
 *
 * What the indoor ring would show (its stage, posts, ropes and truss) gives way to the deck, the
 * pylons and the energy ropes here (Arena.setRingHidden). The crowd is a ray-marched relief over a
 * few thousand triangles, driven by an ordinary Crowd that draws no fans of its own.
 */

/** Towards the sun (titanGlsl's T_SUN_DIR). */
const SUN = new THREE.Vector3(-0.5496, 0.4997, -0.6695);
const DAY: Daylight = { sun: SUN, sunCol: 0xffdab0, sunK: 2.35, sky: 0x8a9cbb, skyK: 0.45, gnd: 0x6e6450, gndK: 0.3, haze: 0xbcb4ae, hazeK: 0.0011 };
/** Rows of fans the crowd's ray march goes through, per quality tier. */
const ROWS = { low: 5, med: 8, high: 12 } as const;
/** The gate curtains' x (east and west), in front of the portals. */
const GATE_X = R_IN - 0.35;

/** The lighting: the key spot is the low sun, far off over the north-west rim, lighting the whole plain. */
function titanLook(): LightLook {
  const s = SUN.clone().normalize().multiplyScalar(40);
  return {
    background: 0xbcb4ae,
    fog: 0xbcb4ae,
    fogDensity: 0.0022,
    envIntensity: 0.6,
    hemi: { sky: 0x8a9cbb, ground: 0x6e6450, intensity: 0.95 },
    key: { color: 0xffdab0, intensity: 3.3, pos: [s.x, s.y, s.z], target: [0, 0, 0], angle: 0.62, penumbra: 0.35, near: 22, far: 60, focus: 0.36 },
    rims: [
      { color: 0xff9a5a, intensity: 8, distance: 14, pos: [-5.5, 3.5, -2] },
      { color: 0x7fc4ff, intensity: 7, distance: 14, pos: [5.5, 3.5, 2] },
    ],
  };
}

/** A venue fragment shader: the shared GLSL, then `body` with the tone mapping put before its last brace. */
function frag(body: string) {
  const b = body.trimEnd();
  return `${V_GLSL}\n${T_GLSL}\n${b.slice(0, b.lastIndexOf('}'))}\n${V_OUT}\n}`;
}

export class TitanVenue implements VenueLike {
  readonly group = new THREE.Group();
  readonly crowd: Crowd;
  readonly floorMesh: THREE.Mesh;
  readonly look = titanLook();
  readonly far = 900;
  readonly beams = false;
  readonly outer = GROUND_Y;
  readonly reflect: ReflectLook = { canvas: [0, 0.9], floor: [0, 0.9, GROUND_Y] };
  /** Always true: a titan venue (Game.setTitan follows it). */
  readonly titan = true;
  readonly u: VenueUniforms;
  /** The two fighters' colours (linear): the fans' shirts and flags, banners, ropes, LED ribbons. */
  private team = { uTeam0: { value: new THREE.Color(0.0232, 0.6867, 1) }, uTeam1: { value: new THREE.Color(1, 0.1946, 0.0232) } };
  /** The energy ropes' and pylons' flare (the arena's rope flash: set each frame by the game). */
  private flareU = { value: 0 };
  flare = 0;
  /** Ground scars from the titans' heaviest landings: xz, radius, how fresh (TitanFx). */
  readonly scars = { value: Array.from({ length: 12 }, () => new THREE.Vector4()) };
  /** The crowd shot's fan (Director.crowdSeat): where, how far round them the fans stand, how wild. */
  readonly fanSeat = new THREE.Vector4();
  private crowdMat: THREE.ShaderMaterial;
  private board = new Scoreboard();
  private gates: THREE.ShaderMaterial[] = [];
  private flash = 0;

  constructor(quality: 'low' | 'med' | 'high', arena: { uTime: { value: number }; uHype: { value: number }; ropeU?: { value: Float32Array } }) {
    const g = this.group;
    const u = (this.u = venueUniforms(DAY, arena));
    const T = this.team;
    const mat = (vert: string, body: string, o: { team?: boolean; extra?: Record<string, THREE.IUniform>; side?: THREE.Side; transparent?: boolean; blending?: THREE.Blending; depthWrite?: boolean } = {}) =>
      vMaterial(u, {
        vertexShader: `${V_GLSL}\n${T_GLSL}\n${vert}`,
        fragmentShader: frag(body),
        uniforms: { ...(o.team ? T : {}), ...(o.extra ?? {}) },
        side: o.side,
        transparent: o.transparent,
        blending: o.blending,
        depthWrite: o.depthWrite,
      });
    const add = (b: TitanBuild, m: THREE.Material, name: string, shadow = false) => {
      const mesh = new THREE.Mesh(b.geometry(), m);
      mesh.name = name;
      mesh.castShadow = shadow;
      g.add(mesh);
      return mesh;
    };

    // the sky round it all
    g.add(skyDome(u, { zenith: 0x4a6ba1, horizon: 0xedcbad, glow: 0xffc482, glowSize: 0.55, cloud: 0.45, cloudLit: 0xffd8a8, cloudShade: 0x8e7f86, disc: 1 }));

    // the stone bowl, the roof, its membrane and the banners
    add(TitanBuild.bowl(), mat(T_VERT, STONE_FRAG, { team: true }), 'bowl');
    const steel = mat(T_VERT, STEEL_FRAG);
    add(TitanBuild.roof(), steel, 'roof');
    const mem = add(TitanBuild.membrane(), mat(T_VERT, MEMBRANE_FRAG, { side: THREE.DoubleSide, transparent: true, depthWrite: false }), 'membrane');
    mem.renderOrder = 8;
    add(TitanBuild.banners(), mat(BANNER_VERT, BANNER_FRAG, { team: true, side: THREE.DoubleSide }), 'banners');

    // the giant screens show the fight
    const { frames, quads } = TitanBuild.screens();
    add(frames, steel, 'screenFrames');
    add(quads, new THREE.MeshBasicMaterial({ map: this.board.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.6)), toneMapped: false }), 'screens');

    // the gates' energy curtains (gateHit ripples them as the stretcher goes through), west then east
    for (const sx of [-1, 1]) {
      const gm = gateMaterial(new THREE.Color(sx < 0 ? 0xff7a1f : 0x3fe0ff), u.uTime, PORTAL_HW, PORTAL_SPRING + PORTAL_HW);
      this.gates.push(gm);
      add(TitanBuild.curtain(sx * GATE_X), gm, `gate${sx < 0 ? 0 : 1}`);
    }

    // the crowd: an ordinary Crowd for its figure sheet and its mood, drawn by the relief shader
    this.crowd = new Crowd([], quality, { uTime: u.uTime, uHype: u.uHype, uFlash: u.uFlash }, { day: 1, light: new THREE.Color(1, 0.95, 0.88) });
    const cu = this.crowd.uniforms;
    this.crowdMat = mat(CROWD_VERT, crowdFrag(CROWD_SHEET.bot0, CROWD_SHEET.bot1, CROWD_SHEET.cols, CROWD_SHEET.poses), {
      team: true,
      side: THREE.DoubleSide,
      extra: {
        uAtlas: cu.uAtlas,
        uBounds: cu.uBounds,
        uWave: cu.uWave,
        uWaveA: cu.uWaveA,
        uExcite: cu.uExcite,
        uBoo: cu.uBoo,
        uJoy: cu.uJoy,
        uDismay: cu.uDismay,
        uSkin: cu.uSkin,
        uPants: cu.uPants,
        uFanSeat: { value: this.fanSeat },
        uMaxRows: { value: ROWS[quality] },
        uViewH: { value: 720 },
      },
    });
    const crowdMesh = new THREE.Mesh(TitanBuild.crowd().geometry(), this.crowdMat);
    crowdMesh.name = 'titanCrowd';
    this.crowd.group.add(crowdMesh);
    g.add(this.crowd.group);

    // the field: the plain and the deck's turf (lit: the robots' shadows land on them), the deck's
    // stone, the pylons and the energy ropes
    this.floorMesh = new THREE.Mesh(TitanBuild.plain().geometry(), this.turf(false));
    this.floorMesh.receiveShadow = true;
    this.floorMesh.name = 'plain';
    g.add(this.floorMesh);
    const deck = new THREE.Mesh(
      octDisc(5.55, 5.55, [0, 1].map((i) => [...hatchXZ(i), HATCH_R] as const)),
      this.turf(true),
    );
    deck.receiveShadow = true;
    deck.name = 'deck';
    g.add(deck);
    add(TitanBuild.deckStone(), mat(T_VERT, KERB_FRAG), 'deckStone');
    const pylons = add(TitanBuild.pylons(), mat(T_VERT, PYLON_FRAG, { team: true, extra: { uFlare: this.flareU } }), 'pylons', true);
    pylons.receiveShadow = false;
    const ropes = add(
      TitanBuild.ropes(),
      mat(ENERGY_VERT, ENERGY_FRAG, {
        team: true,
        extra: { uFlare: this.flareU, uRope: arena.ropeU ?? { value: new Float32Array(24 * 4) } },
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      'energyRopes',
    );
    // (bowing ropes reach past their bounds; they ring the fight anyway)
    ropes.frustumCulled = false;
  }

  /** The turf, as a lit standard material the robots' shadows and contact occlusion land on. */
  private turf(deck: boolean) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    if (deck) m.defines = { DECK: '' };
    const scars = this.scars;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uScars = scars;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${T_GLSL}\n${TURF_GLSL}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = turfAt(vTW);');
    };
    m.customProgramCacheKey = () => (deck ? 'titanDeck' : 'titanPlain');
    // the deck as the indoor canvas (its occlusion map), the plain as an outdoor venue's floor
    return contactAO.patch(m, deck ? { spheres: true, floor: true, strength: 2, direct: 0.7 } : { floor: true, direct: 0.8 });
  }

  /** The two fighters' paint accents (sRGB hex): the fans, flags, banners, ropes and gates take sides. */
  setTeams(a: number, b: number) {
    this.team.uTeam0.value.setHex(a);
    this.team.uTeam1.value.setHex(b);
    // (the gates are the far ends of the fight: west fighter 1's, east fighter 0's)
    const k = RenderSettings.glow(1.2) * 0.8;
    this.gates[0].uniforms.uColor.value.setHex(b).multiplyScalar(k);
    this.gates[1].uniforms.uColor.value.setHex(a).multiplyScalar(k);
  }

  // ---------------------------------------------------------------- VenueLike
  setPixelScale(h: number) {
    this.crowd.setPixelScale(h);
    this.crowdMat.uniforms.uViewH.value = h;
  }

  event(type: string, data?: unknown) {
    this.crowd.event(type, data);
  }

  score(dt: number, s: ScoreState | null) {
    this.board.update(dt, s);
  }

  gateHit(p: THREE.Vector3 | null) {
    for (let i = 0; i < this.gates.length; i++) {
      const hit = this.gates[i].uniforms.uHit.value as THREE.Vector4;
      const gx = (i === 0 ? -1 : 1) * GATE_X;
      const near = p && Math.sign(p.x) === Math.sign(gx) ? Math.max(0, 1 - Math.abs(p.x - gx) / 1.8) : 0;
      if (p && near > 0) hit.set(gx, p.y + 0.3, p.z, near);
      else hit.w = 0;
    }
  }

  strobe(k: number) {
    this.flash = Math.min(1, this.flash + k);
  }

  update(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.u.uFlash.value = this.flash;
    this.flareU.value = this.flare;
  }
}
