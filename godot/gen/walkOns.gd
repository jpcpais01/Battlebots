## Translated from src/game/walkOns.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TWalkOns
extends RefCounted

static var WALK_ONS: Array
static var IDS: Dictionary
static var WALK_ON_NAME

static func walkOnFor(spec) -> String:
	if (JS.truthy(spec.get("walkOn")) and TWalkOns.IDS.has(spec.get("walkOn"))):
		return spec.get("walkOn")
	var h: float = float(2166136261)
	var i: float = 0.0
	while (i < float(spec.name_.length())):
		h = JS.imul(JS.bxor(h, JS.char_code_at(spec.name_, i)), 16777619.0)
		i += 1.0
	var _hWALK_ONS: Array = TWalkOns.WALK_ONS
	return _hWALK_ONS[fmod((JS.ushr(h, 0.0)), float(_hWALK_ONS.size()))].id

static func __init_module() -> void:
	TWalkOns.WALK_ONS = [
	{"id": "anthem", "name_": "Steel Anthem", "blurb": "Stomp, stomp, clap, then double-tracked guitars and a screaming lead. Stadium rock."},
	{
	"id": "neon",
	"name_": "Neon Drive",
	"blurb": "Synthwave: a gated pad, a racing arpeggio and a singing lead over a four-on-the-floor kick."
},
	{
	"id": "forge",
	"name_": "Iron Forge",
	"blurb": "Industrial: anvils, a klaxon, a gated bass riff and drums hit through a wall of distortion."
},
	{
	"id": "drop",
	"name_": "Bass Drop",
	"blurb": "Trap: a snare roll, a breath, then sliding 808s, rattling hats and brass that shakes the seats."
},
	{"id": "fanfare", "name_": "Champion's Call", "blurb": "A full brass fanfare with timpani, strings, chimes and a military snare."},
	{
	"id": "arcade",
	"name_": "Arcade Boss",
	"blurb": "Chiptune at 177 BPM: pulse leads, arpeggio chords and a triangle bass. Bright and a little bit evil."
}
]
	TWalkOns.IDS = JS.set_from(JS.map(TWalkOns.WALK_ONS, func(w, _a1 = null, _a2 = null): return w.id))
	TWalkOns.WALK_ON_NAME = JS.from_entries(JS.map(TWalkOns.WALK_ONS, func(w_2, _a1 = null, _a2 = null): return [w_2.id, w_2.name_]))
