// The six part pictures of the stock bot side by side on grey, as the web's PartThumbs draws them
// (godot/tests/garage3d_thumbs.gd makes the same sheet):
//   run.mjs garage3d_thumbs --shot out.png --q "rarity=2"
import { Stage } from '../../../../src/render/stage';
import { PartThumbs } from '../../../../src/render/partPreview';
import { DEFAULT_PLAYER } from '../../../../src/game/loadout';
import { ITEM_BY_ID, SLOTS } from '../../../../src/game/items';

export async function run() {
  const q = new URLSearchParams(location.search);
  const rarity = Number(q.get('rarity') ?? 2);
  try {
    localStorage.setItem('bb.rt', '0');
  } catch {
    /* ignore */
  }
  document.body.style.cssText = 'margin:0;background:rgb(61,66,77)';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:400px;width:10px;height:10px';
  document.body.appendChild(canvas);
  const stage = new Stage(canvas, 'high');
  const thumbs = new PartThumbs(stage.renderer, stage.scene.environment);
  const spec = DEFAULT_PLAYER;
  for (const slot of SLOTS) {
    const item = ITEM_BY_ID.get(spec.loadout[slot].id)!;
    const img = document.createElement('img');
    img.src = thumbs.get(item, rarity as never, spec.paint, spec.loadout);
    img.style.cssText = 'width:176px;height:176px;display:inline-block;vertical-align:top';
    document.body.appendChild(img);
    await img.decode();
  }
  return 'ok';
}
