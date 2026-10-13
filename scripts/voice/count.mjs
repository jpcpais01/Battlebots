// The crowd counting down before a fight: "THREE! TWO! ONE! FIGHT!" from a whole arena.
// Writes public/audio/count/{3,2,1,fight}.mp3 (small stereo clips the game plays on the beat).
//   ELEVENLABS_API_KEY=... node scripts/voice/count.mjs --eleven   (a crowd of ElevenLabs voices)
//   node scripts/voice/count.mjs                                   (no credits: the caller's own clips)
// Each word is a crowd of shouts: every take layered many times over, pitched apart, a
// little early or late, spread across the stereo field, then put in a big room with a
// roar under it. --eleven voices each word with a dozen stock voices first (into
// voice-raw/count/, kept, so a re-run costs nothing); without it the takes are cut from
// the play-by-play caller's existing lines. Needs ffmpeg.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, RAW } from './bank.mjs';

const OUT = join(ROOT, 'public', 'audio', 'count');
const CLIPS = join(ROOT, 'public', 'voice', 'c');
const TMP = join(tmpdir(), `bb-count-${process.pid}`);
const API = 'https://api.elevenlabs.io/v1';
const KEY = process.env.ELEVENLABS_API_KEY;
const eleven = process.argv.includes('--eleven');

const WORDS = { 3: 'THREE!', 2: 'TWO!', 1: 'ONE!', fight: 'FIGHT!' };

/** Stock ElevenLabs voices (no custom voice slots needed): a mixed, mostly male, house. */
const CROWD = [
  'pNInz6obpgDQGcFmaJgB', // Adam
  'VR6AewLTigWG4xSOukaG', // Arnold
  '2EiwWnXFnvU5JabPnv8n', // Clyde
  'nPczCjzI2devNBz1zQrb', // Brian
  'N2lVS1w4EtoT3dr4eOWO', // Callum
  'onwK4e9ZLuTAKqWW03F9', // Daniel
  'JBFqnCBsd6RMkjVDRZzb', // George
  'TX3LPaxmHKxFdv7VOQHJ', // Liam
  'cjVigY5qzO86Huf0OWal', // Eric
  'EXAVITQu4vr4xnSDxMaL', // Sarah
  'FGY2WhTYpPnrIDTdsKH5', // Laura
  'cgSgspJ2msm6clMCkdW9', // Jessica
];

/**
 * Without credits: the words cut out of the caller's lines ("One, two, THREE!", "That's
 * THREE!", "That's number TWO!", "One-two!", "FIGHT!"), by clip and seconds.
 */
const CUTS = {
  3: [['a7593d78eb26', 1.56, 2.24], ['62f99814000e', 0.26, 1.04]],
  2: [['a7593d78eb26', 0.85, 1.35], ['68e5497f680e', 1.86, 2.45]],
  1: [['a7593d78eb26', 0.0, 0.58], ['d212c116df69', 0.0, 0.27]],
  fight: [['1df85e514951', 0.06, 1.0]],
};

function run(cmd, args) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => (code === 0 ? ok(out) : no(new Error(out.slice(-800)))));
  });
}

/** A seeded random stream, so a re-run mixes the same crowd. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

async function voiceTakes(k) {
  const dir = join(RAW, 'count');
  mkdirSync(dir, { recursive: true });
  const takes = [];
  for (const id of CROWD) {
    const file = join(dir, `${k}-${id}.mp3`);
    if (!existsSync(file)) {
      let r;
      // the account allows only a few requests at once: wait for a free slot
      for (let tries = 0; ; tries++) {
        r = await fetch(`${API}/text-to-speech/${id}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `[shouting] ${WORDS[k]}`, model_id: 'eleven_v3' }),
        });
        if (r.status !== 429 || tries >= 12) break;
        await new Promise((ok) => setTimeout(ok, 2000 + tries * 1500));
      }
      if (!r.ok) {
        const msg = await r.text();
        if (msg.includes('quota_exceeded')) throw new Error('Out of ElevenLabs credits');
        console.error(`${k} ${id}: ${r.status} ${msg.slice(0, 200)}`);
        continue;
      }
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    takes.push(file);
  }
  return takes;
}

const TRIM =
  'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.01,areverse,' +
  'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03,areverse';

/** The takes of a word as trimmed 44.1 kHz mono WAVs. */
async function takesOf(k) {
  const out = [];
  if (eleven) {
    for (const [i, src] of (await voiceTakes(k)).entries()) {
      const dst = join(TMP, `${k}-${i}.wav`);
      await run('ffmpeg', ['-hide_banner', '-y', '-i', src, '-af', `${TRIM},aresample=44100`, '-ac', '1', dst]);
      out.push(dst);
    }
  } else {
    for (const [i, [clip, a, b]] of CUTS[k].entries()) {
      const dst = join(TMP, `${k}-${i}.wav`);
      const len = b - a;
      await run('ffmpeg', [
        '-hide_banner', '-y', '-ss', String(a), '-t', String(len), '-i', join(CLIPS, `${clip}.mp3`),
        '-af', `afade=t=in:d=0.015,afade=t=out:st=${(len - 0.06).toFixed(3)}:d=0.06,aresample=44100`, '-ac', '1', dst,
      ]);
      out.push(dst);
    }
  }
  return out;
}

/** One word, shouted by a whole house. */
async function crowd(k, takes) {
  const r = rng(k === 'fight' ? 99 : +k * 7919);
  // fewer distinct takes need more copies to read as a crowd
  const layers = eleven ? Math.max(18, takes.length * 2) : 16;
  const fight = k === 'fight';
  const inputs = [];
  const chains = [];
  for (let i = 0; i < layers; i++) {
    const src = takes[i % takes.length];
    inputs.push('-i', src);
    // most of the house a little below the source voice, some above
    const semi = eleven ? (r() - 0.5) * 3.5 : -5.5 + r() * 7;
    const p = Math.pow(2, semi / 12);
    // a crowd is never quite together: most land within a tenth of a second of the beat
    const late = Math.round((eleven ? 0.005 : 0) * 1000 + r() * r() * 150);
    const gain = 0.45 + r() * 0.55;
    const pan = (r() * 2 - 1) * 0.85;
    const L = (gain * Math.min(1, 1 - pan)).toFixed(3);
    const R = (gain * Math.min(1, 1 + pan)).toFixed(3);
    chains.push(
      `[${i}:a]asetrate=${Math.round(44100 * p)},aresample=44100,atempo=${(1 / p).toFixed(4)},` +
        `adelay=${late},pan=stereo|c0=${L}*c0|c1=${R}*c0[l${i}]`,
    );
  }
  // the roar under the words: pink noise, band-limited to a crowd's "aah", swelling with them
  const dur = fight ? 1.5 : 1.05;
  inputs.push('-f', 'lavfi', '-t', String(dur), '-i', `anoisesrc=color=pink:sample_rate=44100:seed=${Math.round(r() * 1e6)}`);
  const n = layers;
  chains.push(
    `[${n}:a]highpass=f=280,lowpass=f=2400,volume=${fight ? 0.32 : 0.22},` +
      `afade=t=in:d=0.08,afade=t=out:st=${(dur * 0.45).toFixed(2)}:d=${(dur * 0.55).toFixed(2)},` +
      `pan=stereo|c0=c0|c1=c0[roar]`,
  );
  const mix = Array.from({ length: n }, (_, i) => `[l${i}]`).join('') + '[roar]';
  const graph = [
    ...chains,
    `${mix}amix=inputs=${n + 1}:normalize=0,` +
      // the arena: a slap off the stands and a long tail
      `highpass=f=110,lowpass=f=6000,aecho=0.85:0.55:37|71|113|167:0.32|0.24|0.17|0.11,` +
      `alimiter=limit=0.9:attack=3:release=60[mix]`,
  ];
  const tmp = join(TMP, `${k}.wav`);
  await run('ffmpeg', ['-hide_banner', '-y', ...inputs, '-filter_complex', graph.join(';'), '-map', '[mix]', tmp]);
  // level, then a short tail fade and a small MP3
  const probe = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-']);
  const peak = +probe.match(/max_volume: (-?[\d.]+) dB/)[1];
  const info = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]);
  const len = Math.min(+info.trim(), fight ? 1.9 : 1.25);
  mkdirSync(OUT, { recursive: true });
  const dst = join(OUT, `${k}.mp3`);
  await run('ffmpeg', [
    '-hide_banner', '-y', '-i', tmp, '-t', len.toFixed(2),
    '-af', `volume=${(-2 - peak).toFixed(2)}dB,afade=t=out:st=${(len - 0.3).toFixed(2)}:d=0.3`,
    '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', dst,
  ]);
  console.log(`${dst} (${len.toFixed(2)} s, ${takes.length} takes x ${layers} voices)`);
}

if (eleven && !KEY) {
  console.error('Set ELEVENLABS_API_KEY (or leave out --eleven to build from the caller clips)');
  process.exit(1);
}
mkdirSync(TMP, { recursive: true });
try {
  for (const k of Object.keys(WORDS)) await crowd(k, await takesOf(k));
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
