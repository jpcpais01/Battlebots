// Turns voice-raw/ into the game's clips: trims the silence, levels every clip
// (louder for louder deliveries), encodes small mono MP3s named by content hash
// into public/voice/c/, and writes public/voice/manifest.json for the booth.
//   node scripts/voice/pack.mjs [--takes 2]
// Needs ffmpeg. Lines without a generated clip are left out (the booth skips them).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { items, OUT, RAW, readBank, readVoices } from './bank.mjs';

const i = process.argv.indexOf('--takes');
const takes = i < 0 ? 2 : +process.argv[i + 1];
const CLIPS = join(OUT, 'c');
mkdirSync(CLIPS, { recursive: true });
const TMP = join(tmpdir(), `bb-voice-${process.pid}`);
mkdirSync(TMP, { recursive: true });

/** Loudness by energy (dB RMS): screams sit a little above calm reads. */
const LOUD = { 1: -21, 2: -20, 3: -19, 4: -18 };

function run(cmd, args) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? ok(out) : no(new Error(out.slice(-600)))));
  });
}

const TRIM =
  'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.06,areverse';

async function pack(it) {
  const src = join(RAW, `${it.key}.mp3`);
  // measure after trimming, then level, limit and encode
  const probe = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', `${TRIM},volumedetect`, '-f', 'null', '-']);
  const mean = +probe.match(/mean_volume: (-?[\d.]+) dB/)[1];
  const peak = +probe.match(/max_volume: (-?[\d.]+) dB/)[1];
  const gain = Math.min(LOUD[it.energy] - mean, -1 - peak + 4);
  const tmp = join(TMP, `${it.key}.mp3`);
  await run('ffmpeg', [
    '-hide_banner', '-y', '-i', src,
    '-af', `${TRIM},volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:attack=2:release=40,afade=t=in:d=0.006,aresample=24000`,
    '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', tmp,
  ]);
  const info = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]);
  const bytes = readFileSync(tmp);
  const file = `${createHash('sha1').update(bytes).digest('hex').slice(0, 12)}.mp3`;
  const dst = join(CLIPS, file);
  if (!existsSync(dst)) renameSync(tmp, dst);
  else rmSync(tmp);
  return [file, Math.round(+info.trim() * 100) / 100];
}

const voices = readVoices();
const all = items(voices, takes).filter((it) => existsSync(join(RAW, `${it.key}.mp3`)));
console.log(`Packing ${all.length} clips`);
const done = new Map();
const queue = [...all];
let n = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        done.set(it, await pack(it));
      } catch (e) {
        console.error(`\n${it.id}: ${e.message}`);
      }
      if (++n % 50 === 0) process.stdout.write(`\r${n}/${all.length}`);
    }
  }),
);

const takesOf = new Map();
const names = {};
for (const [it, clip] of done) {
  if (it.kind === 'line') (takesOf.get(it.id) ?? takesOf.set(it.id, []).get(it.id)).push([it.take, clip]);
  else (names[it.id] ??= {})[it.cut] = clip;
}
const lines = [];
for (const l of readBank()) {
  const f = (takesOf.get(l.id) ?? []).sort((a, b) => a[0] - b[0]).map((t) => t[1]);
  if (!f.length) continue;
  const { text, ...rest } = l; // eslint-disable-line no-unused-vars
  lines.push({ ...rest, f });
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ v: 1, lines, names }));

// drop clips nothing points at any more
const live = new Set([...done.values()].map((c) => c[0]));
let removed = 0;
for (const f of readdirSync(CLIPS)) if (!live.has(f)) rmSync(join(CLIPS, f)), removed++;
rmSync(TMP, { recursive: true, force: true });
const size = [...live].reduce((s, f) => s + readFileSync(join(CLIPS, f)).length, 0);
console.log(`\n${lines.length} lines, ${Object.keys(names).length} names, ${live.size} clips, ${(size / 1e6).toFixed(1)} MB${removed ? `, removed ${removed} old` : ''}`);
