import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec === 'three' && process.env.THREE_MODULE) return { url: pathToFileURL(process.env.THREE_MODULE).href, shortCircuit: true };
  if ((spec.startsWith('.') || spec.startsWith('/')) && !/\.(m?[jt]s|json)$/.test(spec) && ctx.parentURL) {
    const base = new URL(spec, ctx.parentURL);
    for (const ext of ['.ts', '/index.ts']) {
      const p = fileURLToPath(base) + ext;
      if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
    }
  }
  return next(spec, ctx);
}
