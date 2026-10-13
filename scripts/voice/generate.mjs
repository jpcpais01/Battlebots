// Voices the commentary with ElevenLabs into voice-raw/ (not committed).
//   ELEVENLABS_API_KEY=... node scripts/voice/generate.mjs [--takes 2] [--only hit.] [--dry]
// Skips anything already generated, so editing a line only re-voices that line.
// Then run pack.mjs to trim, level and encode the clips for the game.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { items, RAW, readVoices } from './bank.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1] ?? true;
};
const KEY = process.env.ELEVENLABS_API_KEY;
const takes = +arg('takes', 2);
const only = arg('only', '');
const dry = process.argv.includes('--dry');
const jobs = +arg('jobs', 4);
const API = 'https://api.elevenlabs.io/v1';

const voices = readVoices();
const todo = items(voices, takes).filter((it) => it.id.startsWith(only) && !existsSync(join(RAW, `${it.key}.mp3`)));
const chars = todo.reduce((n, it) => n + it.req.text.length, 0);
console.log(`${todo.length} clips to generate, ${chars} characters`);
if (dry || !todo.length) process.exit(0);
if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY');
  process.exit(1);
}

const sub = await (await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': KEY } })).json();
const left = sub.character_limit - sub.character_count;
console.log(`Credits left: ${left}`);
if (left < chars && !process.argv.includes('--force')) {
  console.error(`Not enough credits for all of it (${chars}). Use --only to do part, or --force.`);
  process.exit(1);
}

mkdirSync(RAW, { recursive: true });
let done = 0;
let failed = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function one(it) {
  const { voice_id, ...body } = it.req;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`${API}/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) {
      writeFileSync(join(RAW, `${it.key}.mp3`), Buffer.from(await r.arrayBuffer()));
      return true;
    }
    const msg = await r.text();
    if (r.status === 429 || r.status >= 500 || r.status === 0) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    console.error(`\n${it.id} (${r.status}): ${msg.slice(0, 300)}`);
    return false;
  }
  return false;
}

const queue = [...todo];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (queue.length) {
      const it = queue.shift();
      if (!(await one(it))) failed++;
      done++;
      if (done % 25 === 0 || done === todo.length) process.stdout.write(`\r${done}/${todo.length}${failed ? ` (${failed} failed)` : ''}   `);
    }
  }),
);
console.log(`\nDone. ${failed} failed.`);
