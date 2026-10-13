/**
 * Voices a player's bot name for the commentary booth: the caller says it plain, hyped
 * and screamed, the analyst says it once. Runs on Vercel so the ElevenLabs key stays on
 * the server (set ELEVENLABS_API_KEY in the project's environment variables).
 *
 * POST { name } -> { clips: { call, hype, scream, ccall } } as base64 mp3.
 * The once-a-day limit is the client's for now (src/audio/nameVoice.ts).
 */

// the booth's voices, as in scripts/voice/voices.json
const MODEL = 'eleven_v3';
const CALLER = 'kznr2rFoXvjjAbMDSnxS';
const ANALYST = 'ANatehwtToM58dGl8D6V';

const env = (k: string): string | undefined => (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env[k];

function base64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(req: Request): Promise<Response> {
  const key = env('ELEVENLABS_API_KEY');
  if (!key) return json({ error: 'Name voicing is not set up yet.' }, 503);
  let name = '';
  try {
    name = String(((await req.json()) as { name?: unknown }).name ?? '').trim();
  } catch {
    /* bad body */
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-.]{0,19}$/u.test(name)) return json({ error: 'Names are 1 to 20 letters, numbers and spaces.' }, 400);

  const takes = {
    call: { voice: CALLER, text: `${name}.`, stability: 0.5 },
    hype: { voice: CALLER, text: `[excited] ${name}!`, stability: 0 },
    scream: { voice: CALLER, text: `[shouting] ${name.toUpperCase()}!`, stability: 0 },
    ccall: { voice: ANALYST, text: `${name}.`, stability: 0.5 },
  };
  const clips: Record<string, string> = {};
  // one at a time: the plan allows only a few requests at once
  for (const [cut, t] of Object.entries(takes)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${t.voice}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: t.text, model_id: MODEL, voice_settings: { stability: t.stability } }),
    });
    if (!r.ok) return json({ error: 'The voice service said no. Try again later.', status: r.status }, 502);
    clips[cut] = base64(await r.arrayBuffer());
  }
  return json({ name, clips });
}
