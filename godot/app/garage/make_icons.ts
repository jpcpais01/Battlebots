// Writes garage_icons.gd from the web game's line icons (src/ui/icons.ts), so the garage draws
// the very same glyphs. Run from the repo root:
//   node --experimental-transform-types --no-warnings godot/app/garage/make_icons.ts
import fs from 'node:fs';
import { ABILITY_ICON, COMPANY_ICON, ICON, PASSIVE_ICON, SLOT_ICON } from '../../../src/ui/icons.ts';

const lines: string[] = [];
const put = (key: string, svg: string) => {
  let s = svg.replaceAll('currentColor', '#ffffff');
  // the default stroke width goes when an icon brings its own (a repeated attribute is bad xml)
  const open = s.slice(0, s.indexOf('>'));
  if ((open.match(/stroke-width=/g) ?? []).length > 1) s = s.replace('stroke-width="1.8" ', '');
  s = s.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" ');
  lines.push(`\t"${key}": '${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}',`);
};
for (const [k, v] of Object.entries(ICON)) put(k, v);
for (const [k, v] of Object.entries(SLOT_ICON)) put(`slot_${k}`, v);
for (const [k, v] of Object.entries(COMPANY_ICON)) put(`co_${k}`, v);
for (const [k, v] of Object.entries(ABILITY_ICON)) if (v) put(`ab_${k}`, v);
for (const [k, v] of Object.entries(PASSIVE_ICON)) put(`pa_${k}`, v);
const out = `## The web game's line icons (src/ui/icons.ts ICON, SLOT_ICON, COMPANY_ICON, ABILITY_ICON,
## PASSIVE_ICON), drawn white to be tinted. Written by make_icons.ts: don't edit, re-run it.
extends RefCounted

const SVG := {
${lines.join('\n')}
}

static var _cache := {}


## Icon \`key\` ("home", "slot_fist", "co_lumen", "ab_haymaker", "pa_rage"...) \`px\` units square,
## rasterized at three times that to stay sharp on a phone's dense screen; null if there's none.
static func tex(key: String, px: float) -> Texture2D:
\tvar ck := "%s@%d" % [key, int(px)]
\tif _cache.has(ck):
\t\treturn _cache[ck]
\tif not SVG.has(key):
\t\treturn null
\tvar img := Image.new()
\timg.load_svg_from_string(SVG[key], px * 3.0 / 24.0)
\timg.generate_mipmaps()
\tvar t := ImageTexture.create_from_image(img)
\t_cache[ck] = t
\treturn t
`;
fs.writeFileSync(new URL('./garage_icons.gd', import.meta.url), out);
console.log(lines.length, 'icons');
