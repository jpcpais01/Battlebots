// Render the icon's art (icon.svg) to a PNG in headless Chromium, with only some of its layers.
//   node render.mjs icon.svg out.png size [layers: all | bg,head,eyes,fistL,fistR] [mask: none|squircle] [viewBox]
// Playwright comes from the global install (PLAYWRIGHT_MODULE overrides where).
import fs from 'fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const [svgPath, out, size = '1024', layers = 'all', mask = 'none', vb = ''] = process.argv.slice(2);
const s = +size;
const svg = fs.readFileSync(svgPath, 'utf8')
  .replace('width="1024" height="1024"', `width="${s}" height="${s}"`)
  .replace('viewBox="0 0 1024 1024"', `viewBox="${vb || '0 0 1024 1024'}"`);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: s, height: s } });
// (the launcher-style rounded square the tile is cut to: 22% corners)
const clip = mask === 'squircle' ? `clip-path: inset(0 round ${s * 0.22}px);` : '';
await p.setContent(`<html><body style="margin:0;background:transparent"><div id="w" style="width:${s}px;height:${s}px;${clip}">${svg}</div></body></html>`);
if (layers !== 'all') {
  await p.evaluate((keep) => {
    for (const id of ['bg', 'head', 'eyes', 'fistL', 'fistR']) if (!keep.includes(id)) document.getElementById(id).style.display = 'none';
  }, layers.split(','));
}
await p.locator('#w').screenshot({ path: out, omitBackground: true });
await b.close();
