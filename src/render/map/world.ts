import * as THREE from 'three';
import type { LightLook, Quality } from '../stage';
import { RenderSettings } from '../settings';
import { buildPlan } from './plan';
import { MAP_COLORS, mapUniforms, noiseTexture, type MapUniforms } from './kit';
import { buildGround } from './terrain';
import { buildSea } from './sea';
import { buildCity, type City } from './city';
import { buildClouds, buildTrees, type Forest } from './nature';
import { buildSites, type Sites } from './sites';
import { MapCamera } from './mapCamera';

/**
 * The world map: a coastal city at golden hour and the country round it, with every cup and
 * championship's venue on it. Built once (in steps, so the screen can show progress), then it's a
 * few dozen cheap draws: nothing on it is lit by real lights, casts a real shadow or needs sorting
 * beyond a handful of glowing bits.
 */

/** How the stage is lit and fogged while the map is up (the map's own shaders light everything). */
export const MAP_LOOK: LightLook = {
  background: MAP_COLORS.fog,
  fog: MAP_COLORS.fog,
  fogDensity: 0.00019,
  envIntensity: 0,
  hemi: { sky: 0x9cb2e2, ground: 0x7a6656, intensity: 0.4 },
  key: { color: 0xffd2a2, intensity: 0, pos: [0, 50, 0], target: [0, 0, 0], angle: 0.6, penumbra: 0.5, near: 7, far: 20, focus: 0.62 },
  rims: [
    { color: 0xffffff, intensity: 0, distance: 1, pos: [0, -50, 0] },
    { color: 0xffffff, intensity: 0, distance: 1, pos: [0, -50, 0] },
  ],
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class WorldMap {
  readonly group = new THREE.Group();
  readonly cam: MapCamera;
  readonly look = MAP_LOOK;
  private constructor(
    readonly u: MapUniforms,
    private city: City,
    private trees: Forest,
    readonly sites: Sites,
    camera: THREE.PerspectiveCamera,
    ground: (x: number, z: number) => number,
    roofs: (x: number, z: number) => number,
  ) {
    this.cam = new MapCamera(camera);
    this.cam.ground = ground;
    this.cam.roofs = roofs;
  }

  /** Build the whole map, reporting progress 0..1 between the steps. */
  static async build(quality: Quality, camera: THREE.PerspectiveCamera, progress: (k: number) => void): Promise<WorldMap> {
    const u = mapUniforms(RenderSettings.glow(7));
    u.uNoise.value = noiseTexture();
    progress(0.05);
    await tick();
    const plan = buildPlan(quality);
    progress(0.25);
    await tick();
    const ground = buildGround(u);
    progress(0.55);
    await tick();
    const sea = buildSea(u, ground.depth);
    const sites = buildSites(u, plan);
    progress(0.65);
    await tick();
    const city = buildCity(u, plan, sites.beacons);
    progress(0.75);
    await tick();
    const trees = buildTrees(u, plan);
    const clouds = buildClouds(u);
    progress(0.85);
    await tick();
    u.uShadow.value = ground.shadows(plan, sites.shadows);
    progress(0.95);
    await tick();
    // the tallest roof in each 20 m cell (and its neighbours), so the lens stays out of the towers
    const RC = 20, RN = 160;
    const roofsGrid = new Float32Array(RN * RN);
    for (const b of plan.boxes) {
      const top = b.y0 + b.h;
      if (top < 30) continue;
      const i0 = Math.floor((b.x - b.w / 2) / RC + RN / 2) - 1, i1 = Math.floor((b.x + b.w / 2) / RC + RN / 2) + 1;
      const j0 = Math.floor((b.z - b.d / 2) / RC + RN / 2) - 1, j1 = Math.floor((b.z + b.d / 2) / RC + RN / 2) + 1;
      for (let j = Math.max(0, j0); j <= Math.min(RN - 1, j1); j++)
        for (let i = Math.max(0, i0); i <= Math.min(RN - 1, i1); i++) roofsGrid[j * RN + i] = Math.max(roofsGrid[j * RN + i], top);
    }
    const roofs = (x: number, z: number) => {
      const i = Math.floor(x / RC + RN / 2), j = Math.floor(z / RC + RN / 2);
      return i < 0 || j < 0 || i >= RN || j >= RN ? 0 : roofsGrid[j * RN + i];
    };
    const map = new WorldMap(u, city, trees, sites, camera, (x, z) => ground.grid.at(x, z), roofs);
    map.group.add(ground.group, sea, city.group, trees.group, sites.group, clouds);
    map.group.updateMatrixWorld(true);
    progress(1);
    return map;
  }

  /** The haze colour as the screen shows it (see MAP_OUT): linear into the bloom pass, sRGB straight out. */
  setOutput(post: boolean) {
    this.u.uFogOut.value.setHex(MAP_COLORS.fog);
    if (!post) this.u.uFogOut.value.convertLinearToSRGB();
  }

  setPixelScale(h: number) {
    this.city.setPixelScale(h);
  }

  update(dt: number, time: number, camera: THREE.Camera) {
    this.u.uTime.value = time;
    this.cam.update(dt);
    this.city.update(dt, time);
    this.sites.update(dt, time);
    this.trees.update(camera);
  }
}
