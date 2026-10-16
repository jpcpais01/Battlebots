// Second half of the crowd bake (see audio_crowd.ts): encodes the raw float PCM in
// godot/assets/audio/crowd/_raw/ to Ogg Vorbis next to it, writes the manifest beside them and
// removes _raw.
//   node --experimental-transform-types --no-warnings godot/tools/bake/web/audio_crowd_encode.ts [quality]
// Loops are encoded whole: Vorbis keeps the exact sample count, and Godot loops an
// AudioStreamOggVorbis sample-accurately, so the beds' baked crossfade stays seamless.
// Vorbis comes out a few percent louder than its input on these noisy sounds (its noise fill
// adds a little top end), so each file is encoded twice, the second time trimmed so its decoded
// RMS matches the web render's.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../assets/audio/crowd');
const RAW = path.join(DIR, '_raw');
const q = process.argv[2] ?? '5';

const rms = (b: Buffer) => {
  const f = new Float32Array(b.buffer, b.byteOffset, b.length >> 2);
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return Math.sqrt(s / f.length);
};
const encode = (src: string, out: string, rate: number, gain: number) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', src, '-af', `volume=${gain}`, '-c:a', 'libvorbis', '-q:a', q, out]);
const decode = (f: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '2', '-'], { maxBuffer: 1 << 28 });
const manifest = JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8'));
let bytes = 0;
for (const f of manifest.files) {
  const out = path.join(DIR, `${f.name}.ogg`);
  const src = path.join(RAW, `${f.name}.f32`);
  const want = rms(fs.readFileSync(src));
  encode(src, out, f.rate, 1);
  const trim = want / rms(decode(out));
  encode(src, out, f.rate, trim);
  f.trim = +trim.toFixed(4);
  f.decoded_rms_error = +(rms(decode(out)) / want - 1).toFixed(4);
  bytes += fs.statSync(out).size;
}
manifest.quality = Number(q);
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
fs.rmSync(RAW, { recursive: true });
console.log(`${manifest.files.length} files, ${(bytes / 1024).toFixed(0)} KiB`);
