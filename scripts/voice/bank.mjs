// The commentary phrase bank (phrase-bank.md) and everything that gets voiced from it.
// Shared by generate.mjs (ElevenLabs) and pack.mjs (trim, level, encode, manifest).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const RAW = join(ROOT, 'voice-raw');
export const OUT = join(ROOT, 'public', 'voice');

/**
 * Lines look like `- P3 {right} Big right hand!`: voice (P play-by-play, C colour),
 * energy 1-4, optional {tags}, text. A leading `+` marks a reply: straight after a
 * normal line it answers that line only; a section of nothing but replies is a
 * pool of general answers (intro.reply, wrap.reply).
 */
export function readBank() {
  const md = readFileSync(join(HERE, 'phrase-bank.md'), 'utf8');
  const lines = [];
  let trig = null;
  let n = 0;
  let lead = null;
  for (const raw of md.split('\n')) {
    const sec = raw.match(/^## `([^`]+)`/);
    if (sec) {
      trig = sec[1];
      n = 0;
      lead = null;
      continue;
    }
    const m = raw.trimEnd().match(/^- (\+?)([PC])([1-4]) (.*)$/);
    if (!m || !trig) continue;
    const [, reply, voice, energy, body] = m;
    const tags = [...body.matchAll(/\{([^}]+)\}/g)].map((t) => t[1]);
    const text = body.replace(/\{[^}]+\}\s*/g, '').trim();
    const id = `${trig}.${String(++n).padStart(2, '0')}`;
    const line = { id, t: trig, v: voice === 'P' ? 'p' : 'c', e: +energy, text };
    if (tags.length) line.g = tags;
    if (reply && lead) line.r = lead;
    lead = reply ? null : id;
    lines.push(line);
  }
  return lines;
}

/** Every random bot name (loadout.ts PREFIX x SUFFIX); tagged names reuse the base clip. */
export function botNames() {
  const src = readFileSync(join(ROOT, 'src', 'game', 'loadout.ts'), 'utf8');
  const list = (name) => JSON.parse(src.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))[1].replace(/'/g, '"'));
  const names = [];
  for (const a of list('PREFIX')) for (const b of list('SUFFIX')) names.push(`${a} ${b}`);
  // the bot every player starts with
  const first = src.match(/DEFAULT_PLAYER: BotSpec = \{\s*name: '([^']+)'/);
  if (first && !names.includes(first[1])) names.push(first[1]);
  return names;
}

export function readVoices() {
  return JSON.parse(readFileSync(join(HERE, 'voices.json'), 'utf8'));
}

/** What gets said: delivery tags for Eleven v3 by energy, and spoken names. */
function speakable(text, energy, model) {
  if (!model.includes('v3')) return text.replace(/\[[^\]]+\]\s*/g, '');
  const lead = energy >= 4 ? '[shouting] ' : energy === 3 ? '[excited] ' : '';
  return lead + text;
}

/**
 * Everything to voice: two takes of each line (TAKES), and each bot name read
 * calm, hyped and screamed by the caller and calm by the analyst.
 */
export function items(voices, takes = 2) {
  const out = [];
  const model = voices.model;
  const add = (o) => {
    const v = voices[o.voice];
    const stability = o.energy >= 4 ? 0 : 0.5;
    const seed = parseInt(createHash('sha1').update(`${o.text}|${o.take}`).digest('hex').slice(0, 7), 16);
    const req = { voice_id: v.id, model_id: model, text: speakable(o.text, o.energy, model), voice_settings: { stability }, seed };
    const key = createHash('sha1').update(JSON.stringify(req)).digest('hex').slice(0, 20);
    out.push({ ...o, req, key });
  };
  for (const l of readBank()) {
    for (let take = 0; take < takes; take++) add({ kind: 'line', id: l.id, line: l, take, voice: l.v === 'p' ? 'pbp' : 'colour', energy: l.e, text: l.text });
  }
  for (const name of botNames()) {
    const key = name.toLowerCase();
    add({ kind: 'name', id: key, cut: 'call', take: 0, voice: 'pbp', energy: 2, text: `${name}.` });
    add({ kind: 'name', id: key, cut: 'hype', take: 0, voice: 'pbp', energy: 3, text: `${name}!` });
    add({ kind: 'name', id: key, cut: 'scream', take: 0, voice: 'pbp', energy: 4, text: `${name.toUpperCase()}!` });
    add({ kind: 'name', id: key, cut: 'ccall', take: 0, voice: 'colour', energy: 2, text: `${name}.` });
  }
  return out;
}
