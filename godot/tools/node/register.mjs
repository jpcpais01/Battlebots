// Lets plain `node` run the game's TypeScript (src/) for the Godot tools:
//   node --experimental-transform-types --no-warnings --import ./godot/tools/node/register.mjs script.ts
// Extensionless relative imports resolve to .ts / index.ts. `three` resolves to $THREE_MODULE
// when set (a three.module.js from anywhere), else to node_modules as usual.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
