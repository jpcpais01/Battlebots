// Reference renders of the web career screens (career_ui.ts) in headless Chromium against serve.mjs,
// with the screens' CSS imports served as stylesheets:
//   node godot/tools/bake/web/career_ref.mjs <map|market|trophy|reward> <out.png> [query]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const [view, out, extra = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[page error]', e.message));
await page.route('**/*.css', async (route) => {
  const req = route.request();
  if (req.resourceType() === 'script') {
    const u = req.url();
    return route.fulfill({ contentType: 'text/javascript', body: `const l=document.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(u)};document.head.appendChild(l);` });
  }
  const r = await route.fetch();
  return route.fulfill({ response: r, contentType: 'text/css' });
});
await page.goto(`http://localhost:8765/godot/tools/bake/web/bake.html?job=career_ui&view=${view}&${extra}`);
const r = await page.waitForFunction(() => window.__done, null, { timeout: 120000, polling: 300 });
console.log(await r.jsonValue());
await page.screenshot({ path: out });
if (process.env.RECTS) {
  const rects = await page.evaluate((sels) => sels.split(',').map((s) => { const e = document.querySelector(s); if (!e) return [s, null]; const b = e.getBoundingClientRect(); return [s, Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }), process.env.RECTS);
  console.log(JSON.stringify(rects));
}
await browser.close();
