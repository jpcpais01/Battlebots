// A reference frame of the web game's animated home screen (src/render/home/homeStage.ts) with the
// default player's robot in it, stepped frame by frame from the start of its performance and
// framed exactly by the scene's own camera (game.ts frame's home branch, director.ts scene mode);
// godot/tests/homescene_shot.gd draws the same moment:
//   run.mjs homescene_shot --shot out.png --q "id=beach&t=4&outro=-1&quality=high"
// t: seconds since the scene started; outro: when the Fight button is pressed (-1: never).
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Fx } from '../../../../src/render/fx';
import { HomeStage, type HomeSceneId } from '../../../../src/render/home/homeStage';
import { contactAO } from '../../../../src/render/ao';
import { DEFAULT_PLAYER } from '../../../../src/game/loadout';

export async function run() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => Number(q.get(k) ?? d);
  try {
    localStorage.setItem('bb.rt', '0');
  } catch {
    /* ignore */
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const quality = (q.get('quality') ?? 'high') as 'low' | 'med' | 'high';
  const stage = new Stage(canvas, quality);
  stage.setResScale(1);
  contactAO.setQuality(quality);
  const fx = new Fx();
  stage.scene.add(fx.group);
  const home = new HomeStage(stage, fx, () => null, () => {});
  stage.scene.add(home.group);
  stage.useEnv(null);
  home.use((q.get('id') ?? 'beach') as HomeSceneId);
  home.setBot(DEFAULT_PLAYER);
  home.enter();

  // 60 frames a second from the start of the performance, the game clock starting at `t0`
  const t = num('t', 4), outro = num('outro', -1), t0 = num('t0', 0);
  const dt = 1 / 60;
  const n = Math.round(t / dt);
  let out = false;
  for (let i = 0; i < n; i++) {
    if (!out && outro >= 0 && i * dt >= outro) {
      out = true;
      home.outro(() => {});
    }
    home.update(dt, t0 + (i + 1) * dt);
    fx.update(dt, stage.camera);
  }
  const model = home.model!;
  contactAO.set(0, model.joints, model.size);
  contactAO.set(1, null);

  // lighting checks: off=key,hemi,env,rims switches those parts off
  const off = (q.get('off') ?? '').split(',');
  if (off.includes('key')) stage.key.intensity = 0;
  if (off.includes('hemi')) stage.hemi.intensity = 0;
  if (off.includes('env')) stage.scene.environmentIntensity = 0;
  if (off.includes('tone') || q.has('lin')) {
    // (no tone mapping either side: the light itself, clipped at 1; lin=k: times k, to measure the darks)
    stage.renderer.toneMapping = q.has('lin') ? THREE.LinearToneMapping : THREE.NoToneMapping;
    stage.renderer.toneMappingExposure = num('lin', 1);
    stage.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    const post = (stage as unknown as { post?: { composite: THREE.Material } }).post;
    if (post) post.composite.needsUpdate = true;
  }
  // (the key's shadow: shadowless, or with a deeper bias than the arena's, to see what the shadow map darkens)
  if (off.includes('shadow')) stage.key.castShadow = false;
  if (q.has('bias')) stage.key.shadow.bias = num('bias', -0.0004);
  if (off.includes('rims')) for (const r of stage.rims) r.intensity = 0;
  // (exposure=k: lifted, to compare the darks with the Godot render's crushed readback lifted too)
  if (q.has('exposure')) stage.renderer.toneMappingExposure *= num('exposure', 1);

  // director.ts scene mode, exactly where the scene's camera is
  const c = home.cam;
  const cam = stage.camera;
  cam.fov = 38 * c.fov;
  cam.near = 0.1;
  cam.far = 120;
  cam.position.copy(c.pos);
  cam.lookAt(c.look);
  cam.rotateZ(c.roll);
  cam.clearViewOffset();
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  stage.render();
  stage.render();
  const v = (p: THREE.Vector3) => p.toArray().map((x) => x.toFixed(3)).join(',');
  return `ok cam ${v(c.pos)} look ${v(c.look)} fov ${c.fov.toFixed(3)} roll ${c.roll.toFixed(3)}`;
}
