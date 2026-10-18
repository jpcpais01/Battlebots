## Skins: special paint jobs over a robot's plating, won from the Skin Vault (app/gacha). Purely
## cosmetic: the sim never sees them. A bot wears one as `spec.skin` (a skin id, "" or missing for
## its plain paint); the patterns themselves are render/skins/skin.gdshaderinc, the same on the
## robots and on the vault's swatches.
##
## Commons are printed patterns, Rares are rich materials (scales, marble, thin film...), Epics
## move. A skin can also relight the robot's glow (its visor, lights and trim) in its own colour,
## and an Epic's glow lives with it (pulsing lava, flickering arcs, a colour-cycling grid).
class_name Skins
extends RefCounted

const COMMON := 0
const RARE := 1
const EPIC := 2
const RARITY_NAME := ["Common", "Rare", "Epic"]
## The rarities' colours on the cards (sRGB): steel blue, violet, gold.
const RARITY_COL := [Color(0.55, 0.72, 0.95), Color(0.69, 0.42, 1.0), Color(1.0, 0.76, 0.24)]
## How the glow of an Epic moves with it: none, a slow pulse, a flicker, a colour cycle.
const GLOW_STILL := 0
const GLOW_PULSE := 1
const GLOW_FLICKER := 2
const GLOW_CYCLE := 3

## id, name, rarity, kind (skin.gdshaderinc), colours (0xRRGGBB; a fourth number's alpha is in
## `a`), par [scale, speed, metalness, roughness], glow colour (-1: keep the paint's), how the
## glow moves, and a line for the card.
const LIST := [
	# ---------------------------------------------------------------- Common: printed patterns
	{"id": "woodland", "name": "Woodland", "r": COMMON, "kind": 1, "c": [0x56702e, 0x2c461c, 0x7a5a32, 0x1a1c14], "par": [6.0, 0.0, 0.05, 0.7], "glow": -1, "blurb": "Forest camo in four greens and browns"},
	{"id": "desert", "name": "Desert Storm", "r": COMMON, "kind": 1, "c": [0xc9ad7c, 0xa07f52, 0x7b5b3a, 0xe3d2ad], "par": [5.5, 0.0, 0.05, 0.75], "glow": -1, "blurb": "Sand, dust and dry earth"},
	{"id": "urban", "name": "Urban", "r": COMMON, "kind": 1, "c": [0x8a8f96, 0x5d6268, 0x2e3237, 0xc4c8cc], "par": [6.0, 0.0, 0.15, 0.6], "glow": -1, "blurb": "Concrete greys for the city"},
	{"id": "arctic", "name": "Arctic Pixel", "r": COMMON, "kind": 2, "c": [0xe6ebef, 0xb9c3cc, 0x7e8a96, 0x3f4952], "par": [4.5, 0.0, 0.05, 0.6], "glow": 0x9ad8ff, "blurb": "Digital snow camo"},
	{"id": "jungle", "name": "Jungle Pixel", "r": COMMON, "kind": 2, "c": [0x6a8c34, 0x3b6a24, 0x1f3416, 0xa8a456], "par": [4.5, 0.0, 0.05, 0.65], "glow": -1, "blurb": "Digital jungle camo"},
	{"id": "navy", "name": "Navy Pixel", "r": COMMON, "kind": 2, "c": [0x34507a, 0x22385c, 0x141f36, 0x6b84a8], "par": [4.5, 0.0, 0.1, 0.6], "glow": -1, "blurb": "Digital camo in deep sea blues"},
	{"id": "tiger", "name": "Tiger", "r": COMMON, "kind": 3, "c": [0xe8761c, 0x141210, 0xf3e3c3, 0], "par": [4.0, 0.0, 0.1, 0.45], "glow": 0xffa040, "blurb": "Orange with black stripes"},
	{"id": "zebra", "name": "Zebra", "r": COMMON, "kind": 3, "c": [0xeeeeea, 0x151515, 0xd9d9d2, 0], "par": [4.0, 0.0, 0.05, 0.45], "glow": -1, "blurb": "Bold black and white stripes"},
	{"id": "hazard", "name": "Hazard", "r": COMMON, "kind": 4, "c": [0xf4c20d, 0x161616, 0x000000, 0], "a": 0.0, "par": [9.0, 0.0, 0.1, 0.35], "glow": 0xffc20d, "blurb": "Caution: robot at work"},
	{"id": "candy", "name": "Candy Cane", "r": COMMON, "kind": 4, "c": [0xf2f0ea, 0xd61f2c, 0xf2f0ea, 0], "a": 1.0, "par": [9.0, 0.0, 0.05, 0.18], "glow": -1, "blurb": "Glossy red and white twists"},
	{"id": "checker", "name": "Chequered Flag", "r": COMMON, "kind": 5, "c": [0xf0f0f0, 0x111111, 0, 0], "par": [9.0, 0.0, 0.1, 0.3], "glow": -1, "blurb": "Race-day squares"},
	{"id": "carbon", "name": "Carbon Fibre", "r": COMMON, "kind": 6, "c": [0x0b0c0e, 0x3a3e45, 0, 0], "par": [12.0, 0.0, 0.3, 0.16], "glow": -1, "blurb": "Woven carbon under deep clear coat"},
	{"id": "kevlar", "name": "Kevlar", "r": COMMON, "kind": 6, "c": [0x6b4a10, 0xe0b03a, 0, 0], "par": [12.0, 0.0, 0.2, 0.22], "glow": 0xffc23d, "blurb": "Golden aramid weave"},
	# ---------------------------------------------------------------- Rare: rich materials
	{"id": "chameleon", "name": "Chameleon", "r": RARE, "kind": 7, "c": [0x0b1a1a, 0x18c8a8, 0x7a3cff, 0xffc23d], "par": [1.0, 0.0, 0.85, 0.22], "glow": 0x7af0ff, "blurb": "Teal, violet and gold as it turns"},
	{"id": "oilslick", "name": "Oil Slick", "r": RARE, "kind": 7, "c": [0x050608, 0xff3d9a, 0x26d9ff, 0xfff04a], "par": [1.4, 0.0, 0.9, 0.12], "glow": 0xff4de0, "blurb": "A black mirror with a rainbow sheen"},
	{"id": "dragon", "name": "Dragon Scale", "r": RARE, "kind": 8, "c": [0x0d3b25, 0x1f9c58, 0xe0b04a, 0], "par": [3.2, 0.0, 0.6, 0.28], "glow": 0x4dff9a, "blurb": "Emerald scales rimmed in gold"},
	{"id": "carrara", "name": "Carrara Gold", "r": RARE, "kind": 9, "c": [0xf1efea, 0xbfc3c8, 0xd4a640, 0], "par": [3.5, 0.0, 0.0, 0.1], "glow": 0xffd27a, "blurb": "Polished marble veined with gold"},
	{"id": "obsidian", "name": "Black Marble", "r": RARE, "kind": 9, "c": [0x0c0c0f, 0x26262e, 0xd98b4a, 0], "par": [3.5, 0.0, 0.1, 0.08], "glow": 0xff9a4a, "blurb": "Night-black stone, copper veins"},
	{"id": "hexcore", "name": "Hexcore", "r": RARE, "kind": 10, "c": [0x1a1f27, 0x2c3542, 0x29d3ff, 0x0a0d12], "par": [3.4, 0.0, 0.75, 0.3], "glow": 0x29d3ff, "blurb": "Hex plates lit from inside"},
	{"id": "glacier", "name": "Glacier", "r": RARE, "kind": 11, "c": [0x2c78b8, 0x9ad2f2, 0xf2fbff, 0x5ac8ff], "par": [1.6, 0.0, 0.1, 0.06], "glow": 0x9ae8ff, "blurb": "Deep blue ice, cracked and frosted"},
	{"id": "circuit", "name": "Circuitry", "r": RARE, "kind": 12, "c": [0x125a30, 0xe08a3a, 0xf0c95a, 0x3dff8a], "par": [3.2, 0.0, 0.1, 0.45], "glow": 0x3dff8a, "blurb": "Copper traces and live LEDs"},
	# ---------------------------------------------------------------- Epic: they move
	{"id": "molten", "name": "Molten Core", "r": EPIC, "kind": 13, "c": [0x17110e, 0xff4a0a, 0xffd23a, 0xff8a2a], "par": [3.5, 1.0, 0.0, 0.9], "glow": 0xff6a1a, "move": GLOW_PULSE, "blurb": "Black crust drifting on glowing lava"},
	{"id": "nebula", "name": "Nebula", "r": EPIC, "kind": 14, "c": [0x05060e, 0x6a2cff, 0x18b8ff, 0xff3da8], "par": [1.0, 1.0, 0.2, 0.16], "glow": 0xb46aff, "move": GLOW_PULSE, "blurb": "A window onto drifting galaxies"},
	{"id": "storm", "name": "Storm Cell", "r": EPIC, "kind": 15, "c": [0x10161f, 0x3aa8ff, 0xe8f6ff, 0], "par": [2.4, 1.0, 0.7, 0.32], "glow": 0x5ac8ff, "move": GLOW_FLICKER, "blurb": "Lightning crawling over the armour"},
	{"id": "synthwave", "name": "Synthwave", "r": EPIC, "kind": 16, "c": [0x1a0a2e, 0xff2fb4, 0x22e6ff, 0xff7a2a], "par": [2.0, 1.0, 0.3, 0.25], "glow": 0xff2fb4, "move": GLOW_CYCLE, "glow2": 0x22e6ff, "blurb": "A neon grid racing to the sunset"},
	{"id": "aurora", "name": "Aurora", "r": EPIC, "kind": 17, "c": [0x050d18, 0x2bff9a, 0x8a4dff, 0x7af7ff], "par": [2.6, 1.0, 0.2, 0.25], "glow": 0x2bff9a, "move": GLOW_CYCLE, "glow2": 0x8a4dff, "blurb": "Northern lights rippling over the plates"},
	{"id": "datarain", "name": "Data Rain", "r": EPIC, "kind": 18, "c": [0x020604, 0x1cff6a, 0xd8ffe6, 0], "par": [3.0, 1.0, 0.4, 0.15], "glow": 0x1cff6a, "move": GLOW_FLICKER, "blurb": "Falling code, always rewriting"},
	{"id": "liquidgold", "name": "Liquid Gold", "r": EPIC, "kind": 19, "c": [0xffcf5a, 0x8a5a12, 0xfff2c0, 0], "par": [3.5, 1.0, 1.0, 0.07], "glow": 0xffc23d, "move": GLOW_PULSE, "blurb": "Molten gold that never stops rippling"},
]

static var BY_ID := {}
static var _ready := false


static func _index() -> void:
	if _ready:
		return
	_ready = true
	for s in LIST:
		BY_ID[s.id] = s


## The skin `id`, or null (no skin, or one this build doesn't know).
static func get_skin(id):
	_index()
	if not id is String or id == "":
		return null
	return BY_ID.get(id)


## The skin a bot wears (spec.skin), or null.
static func of(spec):
	if spec == null:
		return null
	var id = spec.get("skin") if spec is Dictionary else null
	return get_skin(id)


## Every skin of a rarity.
static func of_rarity(r: int) -> Array:
	return LIST.filter(func(s) -> bool: return int(s.r) == r)


static func lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


## Write a skin into a shader's skin uniforms (render/bot_opaque.gdshader, the vault's orbs):
## `slot` 0 is the one worn, 1 the one a sweep is painting over. null clears the slot.
static func apply(mat: ShaderMaterial, skin, slot := 0) -> void:
	var kinds: Vector2i = mat.get_shader_parameter("skin_kind") if mat.get_shader_parameter("skin_kind") != null else Vector2i.ZERO
	var cols = mat.get_shader_parameter("skin_c")
	var c := PackedVector4Array(cols) if cols != null else PackedVector4Array()
	c.resize(8)
	var pars = mat.get_shader_parameter("skin_p")
	var p := PackedVector4Array(pars) if pars != null else PackedVector4Array()
	p.resize(2)
	if skin == null:
		kinds[slot] = 0
	else:
		kinds[slot] = int(skin.kind)
		for i in 4:
			var l := lin(int(skin.c[i]))
			c[slot * 4 + i] = Vector4(l.r, l.g, l.b, float(skin.get("a", 1.0)))
		var a: Array = skin.par
		p[slot] = Vector4(a[0], a[1], a[2], a[3])
	mat.set_shader_parameter("skin_kind", kinds)
	mat.set_shader_parameter("skin_c", c)
	mat.set_shader_parameter("skin_p", p)


## The robot's glow colour under this skin at `time` (linear, before the model's brightness), or
## `paint` (the paint's own glow, linear) when the skin keeps it.
static func glow(skin, paint: Color, time: float) -> Color:
	if skin == null or int(skin.glow) < 0:
		return paint
	var g := lin(int(skin.glow))
	match int(skin.get("move", GLOW_STILL)):
		GLOW_PULSE:
			return g * (0.85 + 0.25 * sin(time * 2.4))
		GLOW_FLICKER:
			var beat := floorf(time * 9.0)
			var h := fposmod(sin(beat * 12.9898) * 43758.5453, 1.0)
			return g * (1.25 if h > 0.6 else 0.75 + 0.2 * sin(time * 31.0))
		GLOW_CYCLE:
			return g.lerp(lin(int(skin.get("glow2", skin.glow))), 0.5 + 0.5 * sin(time * 1.4))
	return g


## The colour a skin reads as at a glance (its main plating colour, or its glow for the dark
## Epics), for chips, bars and the vault's light.
static func swatch(skin) -> Color:
	if skin == null:
		return Color.WHITE
	if int(skin.r) == EPIC and int(skin.glow) >= 0:
		return Color.hex((int(skin.glow) << 8) | 0xff)
	return Color.hex((int(skin.c[0]) << 8) | 0xff)
