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
 * Lines look like `- P3 {right} Big right hand!`: voice (P play-by-play, C colour,
 * R the robot), energy 1-4, optional {tags}, text.
 * - A leading `+` marks a reply: it plays straight after the line above it, and
 *   replies chain (`-`, `+`, `+` is a three-turn exchange). A section that opens
 *   with a reply is a pool of general answers instead (intro.reply, wrap.reply).
 * - A leading `~` continues a conversation: it is voiced in one recording with
 *   the lines above it (ElevenLabs text-to-dialogue), overlaps and all.
 */
export function readBank() {
  const md = readFileSync(join(HERE, 'phrase-bank.md'), 'utf8');
  const lines = [];
  let trig = null;
  let n = 0;
  let lead = null;
  let pool = false;
  let first = true;
  for (const raw of md.split('\n')) {
    const sec = raw.match(/^## `([^`]+)`/);
    if (sec) {
      trig = sec[1];
      n = 0;
      lead = null;
      first = true;
      continue;
    }
    const m = raw.trimEnd().match(/^- ([+~]?)([PCR])([1-4]) (.*)$/);
    if (!m || !trig) continue;
    const [, mark, voice, energy, body] = m;
    const tags = [...body.matchAll(/\{([^}]+)\}/g)].map((t) => t[1]);
    const text = body.replace(/\{[^}]+\}\s*/g, '').trim();
    const v = { P: 'p', C: 'c', R: 'r' }[voice];
    if (first) pool = mark === '+';
    first = false;
    const prev = lines[lines.length - 1];
    if (mark === '~' && prev?.t === trig) {
      (prev.d ??= [{ v: prev.v, e: prev.e, text: prev.text }]).push({ v, e: +energy, text });
      prev.e = Math.max(prev.e, +energy);
      continue;
    }
    const id = `${trig}.${String(++n).padStart(2, '0')}`;
    const line = { id, t: trig, v, e: +energy, text };
    if (tags.length) line.g = tags;
    if (mark === '+' && lead) line.r = lead;
    lead = pool ? null : id;
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
  // a line that opens with its own delivery tag keeps it
  if (/^\[[^\]]+\]/.test(text)) return text;
  const lead = energy >= 4 ? '[shouting] ' : energy === 3 ? '[excited] ' : '';
  return lead + text;
}

const VOICE = { p: 'pbp', c: 'colour', r: 'robot' };

/**
 * Everything to voice: two takes of each line (TAKES; conversations get one),
 * and each bot name read calm, hyped and screamed by the caller and calm by
 * the analyst. The robot never says names.
 */
export function items(voices, takes = 2) {
  const out = [];
  const model = voices.model;
  const seedOf = (s) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 7), 16);
  const push = (o, req, chars) => {
    const key = createHash('sha1').update(JSON.stringify(req)).digest('hex').slice(0, 20);
    out.push({ ...o, req, key, chars });
  };
  const add = (o) => {
    const stability = o.energy >= 3 ? 0 : 0.5; // v3: 0 Creative, 0.5 Natural
    const text = speakable(o.text, o.energy, model);
    push(o, { voice_id: voices[o.voice].id, model_id: model, text, voice_settings: { stability }, seed: seedOf(`${o.text}|${o.take}`) }, text.length);
  };
  for (const l of readBank()) {
    if (l.d) {
      // a conversation: one recording, every speaker in it
      const inputs = l.d.map((p) => ({ text: speakable(p.text, p.e, model), voice_id: voices[VOICE[p.v]].id }));
      const req = { inputs, model_id: model, settings: { stability: 0.5 }, seed: seedOf(l.d.map((p) => p.text).join('|')) };
      push({ kind: 'line', id: l.id, line: l, take: 0, voice: VOICE[l.v], energy: l.e, text: l.text }, req, inputs.reduce((n, i) => n + i.text.length, 0));
      continue;
    }
    for (let take = 0; take < takes; take++) add({ kind: 'line', id: l.id, line: l, take, voice: VOICE[l.v], energy: l.e, text: l.text });
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
