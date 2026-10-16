## Translated from src/game/paint.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TPaint
extends RefCounted

static var FINISHES: Array
static var FRAMES: Array
static var PAINT_COLORS: Array
static var GLOW_COLORS: Array

static func sch(name_: String, primary: float, secondary: float, accent: float, finish: float = 0.0, frame: float = 0.0):
	return ({"name_": name_, "paint": {"primary": primary, "secondary": secondary, "accent": accent, "finish": finish, "frame": frame}})
static var SCHEMES: Array
static var DEFAULT_PAINT

static func samePaint(a, b) -> bool:
	return (((((a.primary == b.primary) and (a.secondary == b.secondary)) and (a.accent == b.accent)) and (a.finish == b.finish)) and (a.frame == b.frame))

static func schemeOf(p):
	return JS.find(TPaint.SCHEMES, func(s, _a1 = null, _a2 = null): return TPaint.samePaint(s.paint, p))

static func paintKey(p) -> String:
	return ((JS.s(p.primary)) + "." + (JS.s(p.secondary)) + "." + (JS.s(p.accent)) + "." + JS.s(p.finish) + "." + JS.s(p.frame))

static func hexColor(c: float) -> String:
	return ("#" + (JS.pad_start(JS.s(c), 6.0, "0")))

static func isColor(c) -> bool:
	return ((JS.is_integer(c) and ((c) >= 0.0)) and ((c) <= 16777215.0))

static func sanitizePaint(paint, legacyPalette = null):
	if (JS.truthy(paint) and (JS.typeof_(paint) == "object")):
		var p = paint
		var base = JS.merge([TPaint.DEFAULT_PAINT])
		if TPaint.isColor(p.get("primary")):
			base.primary = p.get("primary")
		if TPaint.isColor(p.get("secondary")):
			base.secondary = p.get("secondary")
		if TPaint.isColor(p.get("accent")):
			base.accent = p.get("accent")
		if ((JS.is_integer(p.get("finish")) and (p.get("finish") >= 0.0)) and (p.get("finish") < float(TPaint.FINISHES.size()))):
			base.finish = p.get("finish")
		if ((JS.is_integer(p.get("frame")) and (p.get("frame") >= 0.0)) and (p.get("frame") < float(TPaint.FRAMES.size()))):
			base.frame = p.get("frame")
		return base
	if ((JS.is_integer(legacyPalette) and ((legacyPalette) >= 0.0)) and ((legacyPalette) < 10.0)):
		return JS.merge([TPaint.SCHEMES[legacyPalette].paint])
	return JS.merge([TPaint.DEFAULT_PAINT])

static func rgb(c: float) -> Array:
	return [JS.band((JS.shr(c, 16.0)), 255.0), JS.band((JS.shr(c, 8.0)), 255.0), JS.band(c, 255.0)]

static func dist(a: float, b: float) -> float:
	var x: Array = TPaint.rgb(a)
	var y: Array = TPaint.rgb(b)
	return JS.math_hypot((x[0.0] - y[0.0]), (x[1.0] - y[1.0]), (x[2.0] - y[2.0]))

static func paintsContrast(a, b) -> bool:
	return (minf(minf(TPaint.dist(a.primary, b.primary), (TPaint.dist(a.secondary, b.primary) * 1.4)), (TPaint.dist(a.primary, b.secondary) * 1.4)) > 150.0)

static func contrastingPaint(mine, rng = null):
	var ok: Array = JS.filter(TPaint.SCHEMES, func(s, _a1 = null, _a2 = null): return ((not TPaint.samePaint(s.paint, mine)) and TPaint.paintsContrast(s.paint, mine)))
	var pick = (((rng.pick(ok) if (rng != null) else ok[0.0])) if (float(ok.size()) != 0.0) else TPaint.SCHEMES[fmod(((JS.index_of(TPaint.SCHEMES, JS.nullish(TPaint.schemeOf(mine), TPaint.SCHEMES[0.0])) + 5.0)), float(TPaint.SCHEMES.size()))])
	return JS.merge([pick.paint])

static func __init_module() -> void:
	TPaint.FINISHES = [
	{"name_": "Satin", "blurb": "Soft factory sheen", "metal": 0.25, "rough": 0.34, "metal2": 0.35, "rough2": 0.42},
	{"name_": "Gloss", "blurb": "Wet clear coat", "metal": 0.05, "rough": 0.12, "metal2": 0.1, "rough2": 0.18},
	{"name_": "Matte", "blurb": "Flat, no shine", "metal": 0.0, "rough": 0.82, "metal2": 0.05, "rough2": 0.78},
	{"name_": "Metallic", "blurb": "Flaked car paint", "metal": 0.62, "rough": 0.28, "metal2": 0.55, "rough2": 0.34},
	{"name_": "Anodized", "blurb": "Dyed bare metal", "metal": 0.92, "rough": 0.36, "metal2": 0.88, "rough2": 0.42},
	{"name_": "Chrome", "blurb": "Coloured mirror", "metal": 1.0, "rough": 0.07, "metal2": 1.0, "rough2": 0.12}
]
	TPaint.FRAMES = [
	{"name_": "Gunmetal", "metal": 4870234.0, "joint": 2830393.0, "dark": 1448223.0, "m": 0.85, "r": 0.34},
	{"name_": "Blackout", "metal": 2369325.0, "joint": 1513758.0, "dark": 723983.0, "m": 0.8, "r": 0.4},
	{"name_": "Titanium", "metal": 10133674.0, "joint": 6120301.0, "dark": 2237739.0, "m": 0.9, "r": 0.28},
	{"name_": "Gold", "metal": 13738820.0, "joint": 8215588.0, "dark": 1906963.0, "m": 1.0, "r": 0.24},
	{"name_": "Copper", "metal": 12545858.0, "joint": 7224610.0, "dark": 1905938.0, "m": 1.0, "r": 0.3},
	{"name_": "Ceramic", "metal": 14672615.0, "joint": 10133674.0, "dark": 2764083.0, "m": 0.15, "r": 0.4}
]
	TPaint.PAINT_COLORS = [
	15213882.0,
	16742938.0,
	16044571.0,
	10214440.0,
	2275430.0,
	1358020.0,
	2989311.0,
	2971103.0,
	8011744.0,
	15747738.0,
	9377058.0,
	11814670.0,
	11569682.0,
	5601812.0,
	1074746.0,
	814712.0,
	1268378.0,
	1846394.0,
	4530314.0,
	9051221.0,
	16751269.0,
	16760975.0,
	16773280.0,
	14087578.0,
	10940356.0,
	10285298.0,
	11064575.0,
	11780351.0,
	13809919.0,
	16757713.0,
	15921128.0,
	13028564.0,
	9081244.0,
	3817548.0,
	1909033.0,
	15194556.0,
	13214826.0,
	7031342.0,
	6054966.0,
	2042436.0
]
	TPaint.GLOW_COLORS = [
	16734810.0,
	16747069.0,
	16761405.0,
	16773995.0,
	11992906.0,
	8257456.0,
	3997656.0,
	7337983.0,
	8176895.0,
	5209087.0,
	10251263.0,
	13855743.0,
	16736210.0,
	16757713.0,
	16777215.0,
	16769712.0
]
	TPaint.SCHEMES = [
	TPaint.sch("Blaze", 16742938.0, 15921128.0, 16761405.0),
	TPaint.sch("Tide", 1358020.0, 1909811.0, 7337983.0),
	TPaint.sch("Crimson", 14231614.0, 2237741.0, 16734810.0),
	TPaint.sch("Volt", 16044571.0, 2303791.0, 16773995.0),
	TPaint.sch("Frost", 15265525.0, 2976991.0, 8176895.0),
	TPaint.sch("Jade", 2275430.0, 15330536.0, 8257456.0),
	TPaint.sch("Royal", 5980118.0, 15262463.0, 11902207.0),
	TPaint.sch("Graphite", 3817548.0, 16739116.0, 16751189.0),
	TPaint.sch("Sakura", 15755936.0, 2761779.0, 16757713.0),
	TPaint.sch("Desert", 13214826.0, 3879465.0, 16765562.0),
	TPaint.sch("Stealth", 1909033.0, 3817548.0, 16734810.0, 2.0, 1.0),
	TPaint.sch("Gold Rush", 14199098.0, 1909033.0, 16761405.0, 5.0, 1.0),
	TPaint.sch("Racer", 2971103.0, 15921128.0, 16747069.0, 1.0, 2.0),
	TPaint.sch("Toxic", 10214440.0, 1909033.0, 11992906.0, 1.0, 1.0),
	TPaint.sch("Glacier", 15921128.0, 11064575.0, 7337983.0, 4.0, 2.0),
	TPaint.sch("Inferno", 15213882.0, 16742938.0, 16761405.0, 3.0, 1.0),
	TPaint.sch("Synthwave", 15747738.0, 4530314.0, 3997656.0, 3.0, 0.0),
	TPaint.sch("Copperhead", 12545858.0, 814712.0, 3997656.0, 4.0, 4.0),
	TPaint.sch("Ghost", 14672615.0, 13028564.0, 8176895.0, 1.0, 5.0),
	TPaint.sch("Army", 6054966.0, 13214826.0, 16761405.0, 2.0, 0.0),
	TPaint.sch("Navy", 2042436.0, 13028564.0, 5209087.0, 3.0, 2.0),
	TPaint.sch("Bubblegum", 16757713.0, 10285298.0, 16736210.0, 1.0, 5.0),
	TPaint.sch("Ultraviolet", 4530314.0, 1909033.0, 13855743.0, 4.0, 1.0),
	TPaint.sch("Lava", 1909033.0, 9377058.0, 16747069.0, 2.0, 1.0),
	TPaint.sch("Chrome", 13028564.0, 3817548.0, 7337983.0, 5.0, 2.0),
	TPaint.sch("Emerald", 1074746.0, 13738820.0, 8257456.0, 4.0, 3.0)
]
	TPaint.DEFAULT_PAINT = JS.merge([TPaint.SCHEMES[0.0].paint])
