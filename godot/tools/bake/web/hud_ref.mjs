// Reference shots of the web fight HUD (hud_ref.ts) in headless Chromium against serve.mjs: one
// picture per moment the page freezes on (<out dir>/<moment>.png).
//   node godot/tools/bake/web/hud_ref.mjs <out dir> [query, e.g. seed=7 or scan=1]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [out, extra = ''] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[page error]', e.message));
// (serve.mjs has no type for .css: stylesheets go through as text/css, CSS imports as a <link>)
await page.route('**/*.css', async (route) => {
  const req = route.request();
  if (req.resourceType() === 'script') {
    const u = req.url();
    return route.fulfill({ contentType: 'text/javascript', body: `const l=document.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(u)};document.head.appendChild(l);` });
  }
  const r = await route.fetch();
  return route.fulfill({ response: r, contentType: 'text/css' });
});
await page.goto(`http://localhost:8765/godot/tools/bake/web/bake.html?job=hud_ref&${extra}`);
for (;;) {
  const r = await page.waitForFunction(() => window.__done || window.__snap, null, { timeout: 600000, polling: 30 });
  const v = await r.jsonValue();
  const snap = await page.evaluate(() => window.__snap);
  if (snap) {
    const name = snap.split(' ')[0];
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('shot', snap);
    await page.evaluate(() => {
      window.__snap = null;
      window.__resume = true;
    });
    continue;
  }
  console.log(v);
  break;
}
console.log((await page.evaluate(() => window.__log ?? [])).filter((l) => !/ (hit|whiff|brain|engage|wear|ropes|strikeStart|phase|static)$/.test(l)).join('\n'));
await browser.close();
