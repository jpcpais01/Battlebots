// Reference renders of the web booth's voice mix (src/audio/voice.ts, the real Voice class on an
// OfflineAudioContext), to check godot/audio/voice.gd against:
//   node godot/tools/bake/web/run.mjs audio_booth_ref
// Writes raw float stereo PCM (48 kHz) and a JSON of what was rendered to
// godot/assets/audio/booth/_ref/ (not shipped: move it out after).
// - tone_<db>: a 1 kHz tone at that level straight into the voice bus (the bus chain's curve);
// - p / c / r: one clip each, spoken by the caller, the analyst and the robot (pan, robot metal);
// - name: a name clip then a line, with the booth's 0.08 s gap;
// - fade: the caller talked over at 1.5 s (Speech.fade(0.8), as Booth.cut does).
import { Voice } from '../../../../src/audio/voice';
import type { BoothVoice } from '../../../../src/audio/booth';
import { post } from './scene_bake';

const RATE = 48000;

async function bytes(file: string) {
  const r = await fetch(`/public/voice/c/${file}`);
  return r.arrayBuffer();
}

function interleave(b: AudioBuffer) {
  const L = b.getChannelData(0);
  const R = b.getChannelData(1);
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = L[i];
    out[2 * i + 1] = R[i];
  }
  return out;
}

export async function run() {
  await post('audio/booth/_ref/.gdignore', new Uint8Array());
  const done: Record<string, unknown>[] = [];
  const ducks: Record<string, [number, number][]> = {};
  const render = async (name: string, secs: number, go: (v: Voice, ctx: OfflineAudioContext) => Promise<void> | void) => {
    const ctx = new OfflineAudioContext(2, Math.ceil(RATE * secs), RATE);
    ducks[name] = [];
    const v = new Voice(ctx as unknown as AudioContext, ctx.destination, 1, (g) => ducks[name].push([+ctx.currentTime.toFixed(3), g]));
    await go(v, ctx);
    const b = await ctx.startRendering();
    await post(`audio/booth/_ref/${name}.f32`, new Uint8Array(interleave(b).buffer));
    done.push({ name, secs });
  };
  for (const db of [-40, -30, -24, -20, -16, -12, -8, -4]) {
    await render(`tone_${-db}`, 1.5, (v, ctx) => {
      const o = ctx.createOscillator();
      o.frequency.value = 1000;
      const g = ctx.createGain();
      g.gain.value = Math.pow(10, db / 20);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      o.connect(g).connect((v as any).bus);
      o.start(0);
    });
  }
  const clips: [string, BoothVoice, string, number][] = [
    ['p', 'p', '5ca35db6e8c0.mp3', 7.68],
    ['c', 'c', 'ad91aa647016.mp3', 2.5],
    ['r', 'r', 'ce893aa241b8.mp3', 4.27],
  ];
  for (const [name, voice, file, dur] of clips) {
    const b = await bytes(file);
    await render(name, dur + 1, async (v) => {
      v.add(file, b);
      v.speak([{ clip: [file, dur], gap: 0 }], 2, 5, voice);
      // (speak decodes first: let it get the clip scheduled before rendering starts)
      await new Promise((r) => setTimeout(r, 300));
    });
  }
  const nb = await bytes('2925724c7cc3.mp3');
  const lb = await bytes('5ca35db6e8c0.mp3');
  await render('name', 10, async (v) => {
    v.add('n', nb);
    v.add('l', lb);
    v.speak([{ clip: ['n', 1.34], gap: 0.08 }, { clip: ['l', 7.68], gap: 0 }], 3, 5, 'p');
    await new Promise((r) => setTimeout(r, 300));
  });
  await render('fade', 4, async (v, ctx) => {
    v.add('l', lb);
    const s = v.speak([{ clip: ['l', 7.68], gap: 0 }], 4, 5, 'p');
    await new Promise((r) => setTimeout(r, 300));
    void ctx.suspend(1.5).then(() => {
      s.fade(0.8);
      void ctx.resume();
    });
  });
  await post('audio/booth/_ref/ref.json', new TextEncoder().encode(JSON.stringify({ rate: RATE, done, ducks, clips }, null, 1)));
  return `ok: ${done.length} renders`;
}
