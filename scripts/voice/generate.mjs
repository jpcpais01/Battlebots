// Voices the commentary with ElevenLabs into voice-raw/ (not committed).
//   ELEVENLABS_API_KEY=... node scripts/voice/generate.mjs [--takes 2] [--only hit.] [--voices pbp,colour] [--lines] [--dry] [--spread]
// Skips anything already generated, so editing a line only re-voices that line.
// --spread voices one line of every trigger, then a second of each, and so on (first
// takes before second takes, names last), stopping cleanly when the credits run out,
// so a small quota still gives the booth something to say about everything.
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
// --voices pbp,colour limits it to those speakers (conversations need all of theirs)
const who = arg('voices', '');
const speaks = (it) => !who || (it.req.inputs ? it.req.inputs.map((i) => i.voice_id) : [it.req.voice_id]).every((id) => who.split(',').some((w) => voices[w]?.id === id));
let todo = items(voices, takes).filter((it) => it.id.startsWith(only) && speaks(it) && !(it.kind === 'name' && process.argv.includes('--lines')) && !existsSync(join(RAW, `${it.key}.mp3`)));
if (process.argv.includes('--spread')) {
  // rank = how many lines of the same trigger (and take) come before it
  const seen = new Map();
  const rank = (it) => {
    const k = it.kind === 'line' ? `${it.line.t}|${it.take}` : 'name';
    const r = seen.get(k) ?? 0;
    seen.set(k, r + 1);
    return (it.kind === 'name' ? 1e6 : 0) + it.take * 1e4 + r;
  };
  todo = todo.map((it) => [rank(it), it]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
}
const chars = todo.reduce((n, it) => n + it.chars, 0);
console.log(`${todo.length} clips to generate, ${chars} characters`);
if (dry || !todo.length) process.exit(0);
if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY');
  process.exit(1);
}

// keys scoped to text-to-speech only can't read the subscription; carry on without it
const sub = await (await fetch(`${API}/user/subscription`, { headers: { 'xi-api-key': KEY } })).json().catch(() => ({}));
const left = sub.character_limit - sub.character_count;
console.log(Number.isFinite(left) ? `Credits left: ${left}` : 'Credits unknown (key cannot read the subscription)');
if (left < chars && !process.argv.includes('--force') && !process.argv.includes('--spread')) {
  console.error(`Not enough credits for all of it (${chars}). Use --only to do part, or --force.`);
  process.exit(1);
}

mkdirSync(RAW, { recursive: true });
let done = 0;
let failed = 0;
let broke = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function one(it) {
  const { voice_id, ...body } = it.req;
  // conversations go to text-to-dialogue, single lines to text-to-speech
  const url = body.inputs ? `${API}/text-to-dialogue` : `${API}/text-to-speech/${voice_id}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`${url}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (r.ok) {
      writeFileSync(join(RAW, `${it.key}.mp3`), Buffer.from(await r.arrayBuffer()));
      return true;
    }
    const msg = await r.text();
    if (/quota_exceeded/.test(msg)) {
      if (!broke) console.error('\nOut of credits, stopping.');
      broke = true;
      return false;
    }
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
    while (queue.length && !broke) {
      const it = queue.shift();
      if (!(await one(it))) failed++;
      done++;
      if (done % 25 === 0 || done === todo.length) process.stdout.write(`\r${done}/${todo.length}${failed ? ` (${failed} failed)` : ''}   `);
    }
  }),
);
console.log(`\nDone. ${failed} failed${broke ? `, ${queue.length} left for when there are credits` : ''}.`);
