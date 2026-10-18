## The top of the fight HUD (hud.ts build's .hud-top, style.css .fbar / .hp / .timer / .xray): each
## robot's name row (name, power rating, knockdown pips and the flurry's damage total), its health
## bar in a chamfered steel frame tinted with its paint (the hot chip of recent damage, ten notched
## cells, the low and dead states, the hit flash and shake), stamina, its ability icons with their
## cooldowns, the "Finisher ready" tag, the x-ray condition panel hanging under it and the ability
## tags; the round clock between the two bars. The right bar is the left one mirrored.
class_name HudBars
extends HudPart

## Match time the chip segment holds after the last hit before it drains (hud.ts CHIP_HOLD).
const CHIP_HOLD := 0.75
## A tag team's bot just in: its bar fills up from empty over this long (s), with a flash.
const FILL_IN := 0.65
## style.css .hp: the slanted cut on the clock side and the small chamfer under the outer end (em).
const CUT := 0.75
const CHAMFER := 0.45
## hud.ts XRAY_SHAPES (viewBox 0 0 64 126), one per body part in TDamage's order: rects as
## [x, y, w, h, rx], the trunk and pelvis as polygons.
const XRAY_SHAPES := [
	[25.0, 3.0, 14.0, 14.0, 4.0],
	[[17.0, 21.0], [47.0, 21.0], [44.0, 44.0], [20.0, 44.0]],
	[[21.0, 47.0], [43.0, 47.0], [41.0, 62.0], [23.0, 62.0]],
	[49.0, 22.0, 7.0, 19.0, 3.0],
	[50.0, 43.0, 7.0, 17.0, 3.0],
	[49.5, 62.0, 8.0, 8.0, 2.5],
	[8.0, 22.0, 7.0, 19.0, 3.0],
	[7.0, 43.0, 7.0, 17.0, 3.0],
	[6.5, 62.0, 8.0, 8.0, 2.5],
	[33.5, 65.0, 8.0, 23.0, 3.0],
	[34.0, 91.0, 7.0, 24.0, 3.0],
	[33.0, 117.0, 11.0, 6.0, 2.0],
	[22.5, 65.0, 8.0, 23.0, 3.0],
	[23.0, 91.0, 7.0, 24.0, 3.0],
	[20.0, 117.0, 11.0, 6.0, 2.0],
]
## hud.ts XRAY_BONES: the frame drawn over the plates (.xr-bone lines, .xr-joint circles).
const XRAY_BONES := [
	[32.0, 17.0, 32.0, 62.0], [20.0, 24.0, 44.0, 24.0], [23.0, 55.0, 41.0, 55.0],
	[52.5, 24.0, 52.5, 42.0], [53.5, 44.0, 53.5, 60.0], [11.5, 24.0, 11.5, 42.0], [10.5, 44.0, 10.5, 60.0],
	[37.5, 62.0, 37.5, 88.0], [37.5, 91.0, 37.5, 115.0], [26.5, 62.0, 26.5, 88.0], [26.5, 91.0, 26.5, 115.0],
]
const XRAY_JOINTS := [
	[32.0, 18.0, 1.3], [52.5, 23.0, 1.3], [11.5, 23.0, 1.3], [53.0, 42.5, 1.2], [11.0, 42.5, 1.2],
	[37.5, 64.0, 1.3], [26.5, 64.0, 1.3], [37.5, 89.5, 1.2], [26.5, 89.5, 1.2],
]
const PARTS := 15
## style.css colours.
const RED := Color(1.0, 0.278, 0.4)
const AMBER := Color(1.0, 0.706, 0.227)
const ORANGE := Color(1.0, 0.478, 0.102)
const CYAN := Color(0.165, 0.847, 1.0)
const TEXT := Color(0.957, 0.969, 0.988)
const TEXT_2 := Color(0.91, 0.933, 0.98, 0.74)
const LINE := Color(1, 1, 1, 0.1)
const TAG_INK := Color(0.106, 0.051, 0.012)

## One stretch of a CSS transition (`transition: opacity Ns ease`): from where it was to `to`.
class Tr:
	var from := 0.0
	var to := 0.0
	var t0 := -100.0
	var dur := 0.0

	func _init(v := 0.0) -> void:
		from = v
		to = v

	func go(v: float, d: float, now: float) -> void:
		if v == to:
			return
		from = value(now)
		to = v
		t0 = now
		dur = d

	func value(now: float) -> float:
		if dur <= 0.0 or now - t0 >= dur:
			return to
		return lerpf(from, to, HudKit.ease_css((now - t0) / dur))

	func busy(now: float) -> bool:
		return now - t0 < dur


## One robot's bars (hud.ts BarEls), and what was copied of it this frame.
class Bot:
	var name_ := ""
	var rating := ""
	## Leading edge, outer end (hud.ts barColors: --c1, --c2).
	var c1 := Color.WHITE
	var c2 := Color.WHITE
	var right := false
	## The fist and kick abilities, then the core (icon names, the moves, their cooldowns).
	var icons: Array[String] = []
	var moves: Array[String] = []
	var cd_max: Array[float] = []
	var cd := PackedFloat32Array([0.0, 0.0, 0.0])
	var ab_ready: Array[bool] = [false, false, false]
	## Health ratio, health, max health, match time since the last hit, stamina ratio.
	var hp := 1.0
	var hp_prev := 0.0
	var max_hp := 1.0
	var since_hit := 99.0
	var stamina := 1.0
	## hud.ts updateHpBar: where the chip ends and how fast it drains, the eased fill.
	var chip_v := 1.0
	var chip_vel := 0.0
	var shown := 1.0
	var num := 0
	var lost := 0
	var chipn_text := ""
	var chipn := Tr.new(0.0)
	var chipn_pop := -10.0
	var low := false
	var dead := false
	var low_t0 := 0.0
	## Tagged in at this time: the bar fills up from empty (FILL_IN), no chip behind it.
	var fill_t0 := -10.0
	## hpHit / hpHeal: the flash (start, starting opacity, length, green or white) and the shake.
	var flash_t := -10.0
	var flash_a := 0.0
	var flash_dur := 0.26
	var flash_heal := false
	var shake_t := -10.0
	var shake_a := 0.0
	## Knockdown pips (shown from the first counted knockdown) and the finisher-ready tag.
	var kd := 0
	var kd_on := false
	var ready := false
	var ready_t0 := 0.0
	## The ability tags under the condition panel: [text, start].
	var tags: Array = []
	## The x-ray: the condition shown per part, torn off, about to come off, and the times its
	## blink, hit flash and colour change began.
	var cond := PackedFloat32Array()
	var off: Array[bool] = []
	var loose: Array[bool] = []
	var loose_t := PackedFloat32Array()
	var hit_t := PackedFloat32Array()
	var col_from: Array[Color] = []
	var col_to: Array[Color] = []
	var col_t := PackedFloat32Array()
	## Which of the two it is, where its pieces sit down the column (_flow), and what the pieces that
	## redraw on a change were last drawn with.
	var index := 0
	var y_name := 0.0
	var y_hp := 0.0
	var y_st := 0.0
	var y_ab := 0.0
	var y_ready := 0.0
	var y_xr := -1.0
	var y_tags := 0.0
	var drawn_fill := -1.0
	var drawn_chip := -1.0
	var drawn_fa := -1.0
	var drawn_base := -1
	var drawn_num := -1
	var drawn_heal := false
	var drawn_shake := Vector2.ZERO
	var flow_ready := false
	var drawn_tags := 0
	var drawn_st := -1.0
	var drawn_cd := PackedFloat32Array([-1.0, -1.0, -1.0])
	## The parts that were blinking, flashing or changing colour last frame.
	var xr_anim: Array[bool] = []
	## Whether any part might be animating (the parts are only looked at while one is).
	var xr_live := true


## The scan bar sliding down a condition panel (style.css .xray::after, xrSweep), drawn by the GPU
## over the panel's rounded padding box: a band 30% of the panel tall, clear, 0.12 cyan at its
## middle, clear, travelling from 1.1 bands above the top to 3.6 bands down as `phase` goes 0 -> 1.
const SWEEP_SHADER := """shader_type canvas_item;
uniform vec2 size = vec2(10.0);
uniform float radius = 0.0;
uniform float phase = 0.0;
void fragment() {
	vec2 p = UV * size;
	vec2 q = abs(p - size * 0.5) - (size * 0.5 - radius);
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	float band = 0.3 * size.y;
	float t = (p.y - band * mix(-1.1, 3.6, phase)) / band;
	float a = t < 0.0 || t > 1.0 ? 0.0 : 0.12 * (1.0 - abs(t - 0.5) * 2.0);
	COLOR = vec4(0.471, 0.863, 1.0, a * clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0));
}
"""


## One piece of the top on its own full-screen canvas item. A piece only draws again when what it
## shows changes (queue_redraw); the pulses, fades, pops and the shake tint, scale or move it
## without a redraw, so a fight frame mostly redraws nothing. The pieces sit in a layer faded as a
## whole while the top is dimmed (.hud.finished .hud-top: opacity .6). Godot fades each shape on
## its own where CSS fades the picture, so the bar draws nothing under its opaque layers (the frame
## is a ring round the track, the track and the chip stop at the fill).
class Pane:
	extends Control
	var bars: HudBars
	var fn: Callable

	func _init(b: HudBars, f: Callable) -> void:
		bars = b
		fn = f
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		if fn.is_null() or not bars._can_draw():
			return
		# (timed for the performance overlay's HUD row)
		var t0 := Perf.now()
		bars._ci = self
		fn.call()
		Perf.add(Perf.HUD, t0)


## Each robot's pieces, in drawing order (each draws with _draw_<name>(i); the parts and the tags
## hold a piece per part and per tag).
const PANES := ["name", "chipn", "hp_base", "hp_bar", "hp_over", "hp_flash", "hp_low", "hp_num", "stamina", "abil", "ready", "xr_bg", "xr_parts", "xr_top", "tags"]
## The ability tags shown at once, at most (each has its own piece).
const TAG_PANES := 4
## A rounded rectangle filled between two corners, drawn by the GPU: the stamina fill and the
## cooldowns, which change every frame, cost no drawing.
const MASK_SHADER := """shader_type canvas_item;
uniform vec2 size = vec2(10.0);
uniform float radius = 0.0;
uniform vec2 fill_min = vec2(-1e5);
uniform vec2 fill_max = vec2(1e5);
uniform vec4 tint = vec4(1.0);
float edge(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
void fragment() {
	vec2 p = UV * size;
	vec2 q = abs(p - size * 0.5) - (size * 0.5 - radius);
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	vec2 lo = fill_min - p;
	vec2 hi = p - fill_max;
	COLOR = vec4(tint.rgb, tint.a * edge(d) * edge(max(max(lo.x, lo.y), max(hi.x, hi.y))));
}
"""
## The health bar's track, chip and fill (style.css .hp-bar, .hp-chip, .hp-fill), drawn by the GPU in
## the bar's own coordinates (UV, CSS px times k), so the fill easing and the chip draining cost no
## drawing: the same layers the bar was drawn with as polygons, composited in the same order.
const BAR_SHADER := """shader_type canvas_item;
uniform float k = 1.0;
uniform vec2 bo = vec2(2.0);
uniform vec2 bs = vec2(100.0, 20.0);
uniform float fill_x = 0.0;
uniform float chip_x = 0.0;
uniform float fill_a = 1.0;
uniform bool has_fill = true;
uniform bool opaque = true;
uniform vec4 c1 = vec4(1.0);
uniform vec4 c2 = vec4(1.0);

// coverage of x < e, antialiased over a pixel
float below(float x, float e) { return clamp((e - x) / max(fwidth(x), 1e-4) + 0.5, 0.0, 1.0); }
vec4 ramp2(float t, vec4 a, vec4 b) { return mix(a, b, clamp(t, 0.0, 1.0)); }
// a box-shadow's soft edge beside a vertical edge at x0, falling away toward side (+1 right, -1
// left): spread solid, then a blur
float hglow(float x, float x0, float side, float spread, float blur, float a) {
	float sig = blur * 0.5;
	float near = a * clamp(0.5 + 0.5 * spread / max(0.01, sig + spread), 0.5, 0.9);
	float mid = a * 0.5;
	float reach = spread + blur;
	float t = (x - x0) * side / reach;
	if (t < 0.0 || t > 1.0) return 0.0;
	float s0 = spread / reach;
	return t < s0 ? mix(near, mid, t / max(s0, 1e-4)) : mix(mid, 0.0, (t - s0) / max(1.0 - s0, 1e-4));
}
// a repeating hard-stop stripe (on from a to b of each period CSS px along dir), antialiased
float stripe(vec2 p, vec2 o, vec2 dir, float period, float a, float b) {
	float t = dot(p - o, dir) / k;
	float w = max(fwidth(t), 1e-4);
	float m = mod(t, period);
	return clamp(min(m - a, b - m) / w + 0.5, 0.0, 1.0) * step(0.0, b - a);
}
vec2 gstart(vec2 pos, vec2 size, vec2 dir) {
	return pos + size * 0.5 - dir * (abs(size.x * dir.x) + abs(size.y * dir.y)) * 0.5;
}
vec3 over(vec3 c, vec4 s) { return mix(c, s.rgb, s.a); }

void fragment() {
	vec2 p = UV;
	float x = p.x;
	float ty = (p.y - bo.y) / bs.y;
	float in_fill = has_fill ? below(x, fill_x) : 0.0;
	// the track: dark, a faint hatch, an inset shadow along the top
	vec3 col = ramp2(ty, vec4(0.02, 0.027, 0.051, 1.0), vec4(0.063, 0.078, 0.122, 1.0)).rgb;
	vec2 d115 = vec2(0.906308, 0.422618);
	col = over(col, vec4(1.0, 1.0, 1.0, 0.04 * stripe(p, gstart(bo, bs, d115), d115, 6.0, 0.0, 2.0)));
	col = over(col, vec4(0.0, 0.0, 0.0, 0.55 * clamp(1.0 - (p.y - bo.y) / (6.0 * k), 0.0, 1.0)));
	// the chip: its glow, then white-hot with a red hazard hatch, from the fill (or under it) to chip_x
	col = over(col, vec4(1.0, 0.314, 0.314, hglow(x, chip_x, 1.0, 0.0, 10.0 * k, 0.55)));
	float in_chip = below(x, chip_x) * (opaque ? 1.0 - in_fill : 1.0);
	if (in_chip > 0.0) {
		vec4 cc = ty < 0.6 ? ramp2(ty / 0.6, vec4(1.0), vec4(1.0, 0.902, 0.839, 1.0)) : ramp2((ty - 0.6) / 0.4, vec4(1.0, 0.902, 0.839, 1.0), vec4(1.0, 0.725, 0.659, 1.0));
		vec2 d60 = vec2(-0.866025, -0.5);
		vec2 cpos = vec2(chip_x - bs.x, bo.y);
		cc.rgb = over(cc.rgb, vec4(1.0, 0.204, 0.282, 0.62 * stripe(p, gstart(cpos, bs, d60), d60, 8.0, 4.0, 8.0)));
		col = over(col, vec4(cc.rgb, in_chip));
	}
	// the fill: the paint, second colour at the outer end, main colour at the leading edge, a sheen
	// down it, and the glint riding the leading edge with its glow
	if (has_fill) {
		float tf = (x - (fill_x - bs.x)) / bs.x;
		vec4 fc = tf < 0.1 ? c2 : ramp2((tf - 0.1) / 0.9, c2, c1);
		col = over(col, vec4(fc.rgb, fc.a * fill_a * in_fill));
		vec4 sh = ty < 0.42 ? ramp2(ty / 0.42, vec4(1.0, 1.0, 1.0, 0.4), vec4(1.0, 1.0, 1.0, 0.0)) : ramp2((ty - 0.42) / 0.58, vec4(0.0, 0.0, 0.0, 0.0), vec4(0.0, 0.0, 0.0, 0.28));
		col = over(col, vec4(sh.rgb, sh.a * fill_a * in_fill));
		float ga = 0.9 * fill_a;
		col = over(col, vec4(1.0, 1.0, 1.0, hglow(x, fill_x, 1.0, 4.0 * k, 14.0 * k, 0.35 * ga)));
		col = over(col, vec4(1.0, 1.0, 1.0, hglow(x, fill_x - 3.0 * k, -1.0, 4.0 * k, 14.0 * k, 0.35 * ga)));
		col = over(col, vec4(c1.rgb, hglow(x, fill_x, 1.0, 2.0 * k, 6.0 * k, ga)));
		col = over(col, vec4(c1.rgb, hglow(x, fill_x - 3.0 * k, -1.0, 2.0 * k, 6.0 * k, ga)));
		col = over(col, vec4(1.0, 1.0, 1.0, ga * in_fill * (1.0 - below(x, fill_x - 3.0 * k))));
	}
	COLOR = vec4(col, 1.0);
}
"""
## The health bar's pieces: they shake together.
const HP_PANES := ["hp_base", "hp_bar", "hp_over", "hp_flash", "hp_low", "hp_num"]

## Each robot's finisher-ready state (hud.ts BarEls.readyOn).
var ready_on := [false, false]

var _bots: Array[Bot] = []
## Seconds on screen: every CSS animation and transition runs on this clock.
var _now := 0.0
var _clock := ""
var _hurry := false
var _finished := false
## .hud.finished .hud-top: opacity 0.6, 0.4s ease.
var _fin := Tr.new(1.0)
## Everything redraws (a new layout, the dimming coming or going).
var _all := true
var _sweeps: Array[ColorRect] = []
## The layer the pieces sit in, faded as a whole.
var _root := Control.new()
## Each robot's pieces by name, and the clock's.
var _pn: Array[Dictionary] = [{}, {}]
var _timer: Pane
## Each robot's stamina fill and its three cooldown overlays (ColorRects with MASK_SHADER).
var _st_fill: Array[ColorRect] = []
var _cd: Array = [[], []]
static var _mask_shader: Shader
static var _bar_shader: Shader
## Whether the frame's drawn as a ring (while the top is faded).
var _ring_on := false
## The piece drawing now: every draw helper draws on it.
var _ci: CanvasItem
var _started := false

# layout (redone when the size or the em changes)
var _em := 0.0
var _k := 1.0
var _size := Vector2.ZERO
var _bar_w := 0.0
var _top := 0.0
var _timer_box := Rect2()
var _frame := PackedVector2Array()
## The frame less the track, as five quads (drawn instead of the whole frame while dimmed).
var _ring: Array[PackedVector2Array] = []
var _bar := PackedVector2Array()
var _shadows: Array[PackedVector2Array] = []
var _sb_timer: StyleBoxFlat
var _sb_ab: StyleBoxFlat
var _sb_ab_ready: StyleBoxFlat
var _sb_core_ready: StyleBoxFlat
var _sb_xr: StyleBoxFlat
var _sb_xr_glow: StyleBoxFlat
var _sb_xr_top: Array[StyleBoxFlat] = []
var _f_name: Font
var _f_small: Font
var _f_chip: Font
var _f_num: Font
var _f_timer: Font
var _f_ready: Font
var _f_tag: Font
var _f_xr: Font
var _icon_tex: Array = [[], []]
var _bolt: Texture2D

static var _xr_polys: Array[PackedVector2Array] = []
static var _xr_dash: Array[PackedVector2Array] = []
static var _xr_closed: Array[PackedVector2Array] = []
static var _xr_bones := PackedVector2Array()
static var _tex := {}


func _init() -> void:
	super()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)
	if _mask_shader == null:
		_mask_shader = Shader.new()
		_mask_shader.code = MASK_SHADER
		_bar_shader = Shader.new()
		_bar_shader.code = BAR_SHADER
	for i in 2:
		for n in PANES:
			# (the parts and the tags are pieces of their own, inside theirs)
			var f := Callable() if n in ["xr_parts", "tags"] else Callable(self, "_draw_" + n).bind(i)
			var p := Pane.new(self, f)
			_root.add_child(p)
			_pn[i][n] = p
		var bar := ShaderMaterial.new()
		bar.shader = _bar_shader
		(_pn[i].hp_bar as Control).material = bar
		for k in PARTS:
			for f in [_draw_xr_fill, _draw_xr_line, _draw_xr_flash]:
				_pn[i].xr_parts.add_child(Pane.new(self, f.bind(i, k)))
		for k in TAG_PANES:
			_pn[i].tags.add_child(Pane.new(self, _draw_tag.bind(i, k)))
		_st_fill.append(_mask(_pn[i].stamina))
		for k in 3:
			_cd[i].append(_mask(_pn[i].abil))
	_timer = Pane.new(self, _draw_timer)
	_root.add_child(_timer)
	var sweep := Shader.new()
	sweep.code = SWEEP_SHADER
	for i in 2:
		var s := ColorRect.new()
		s.mouse_filter = Control.MOUSE_FILTER_IGNORE
		s.visible = false
		var mat := ShaderMaterial.new()
		mat.shader = sweep
		s.material = mat
		_root.add_child(s)
		_sweeps.append(s)


func start(m_) -> void:
	_bots.clear()
	ready_on = [false, false]
	_finished = false
	_fin = Tr.new(1.0)
	_clock = ""
	_hurry = false
	for i in 2:
		_bots.append(_make_bot(i, m_.fighters[i], m_.specs[i]))
		_icon_tex[i] = []
	# (the scan lines' tile is made once, here rather than on the fight's first frame)
	_stripes("scan", Vector2(0, -1), 3.0, 0.0, 1.0, Color(150 / 255.0, 225 / 255.0, 1.0, 0.07))
	_started = true
	_em = 0.0
	_all = true
	for s in _sweeps:
		s.visible = true


## Robot `i`'s bars for fighter `f` built from `spec`: its name, paint, abilities, health and parts.
func _make_bot(i: int, f, spec) -> Bot:
	var b := Bot.new()
	b.index = i
	b.right = i == 1
	b.name_ = str(spec.name_)
	b.rating = "PWR %d" % int(f.build.rating)
	var cols := HudKit.bar_colors(spec.paint)
	b.c1 = cols[0]
	b.c2 = cols[1]
	# the fist and kick abilities, then the core's passive (hud.ts build addAb)
	var fa := str(f.build.fistAbility)
	var ka := str(f.build.kickAbility)
	b.moves = [fa, ka]
	b.icons = [_icon_name("ab:" + fa, "slot:fist"), _icon_name("ab:" + ka, "slot:kick")]
	for id in b.moves:
		var cdv = TMoves.MOVES[id].get("cooldown")
		b.cd_max.append(float(cdv) if cdv != null else 1.0)
	var core = TItems.ITEM_BY_ID.get(spec.loadout.core.id)
	b.icons.append(_icon_name("pa:" + str(core.passive.id), "slot:core") if core != null else "slot:core")
	b.hp = maxf(0.0, f.hpRatio)
	b.shown = b.hp
	b.chip_v = b.hp
	b.hp_prev = f.hp
	b.max_hp = f.build.stats.maxHp
	b.num = roundi(f.hp)
	b.kd = int(f.knockdowns)
	b.kd_on = b.kd > 0
	# (a replay seek starts with the damage already done)
	var cond: PackedFloat32Array = f.parts.cond
	for p in PARTS:
		var c := cond[p]
		b.cond.append(c)
		b.off.append(false)
		b.loose.append(c < 1.0 and _is_loose(p, c))
		b.loose_t.append(_now)
		b.hit_t.append(-100.0)
		b.col_from.append(cond_color(c))
		b.col_to.append(cond_color(c))
		b.col_t.append(-100.0)
		b.xr_anim.append(true)
	return b


## A tag: side `i`'s column is the new bot's from now on (its name, paint, abilities and parts),
## its bar filling up from empty with a flash as it comes in.
func swap(i: int, m_) -> void:
	if _bots.size() < 2:
		return
	var b := _make_bot(i, m_.fighters[i], m_.specs[i])
	b.fill_t0 = _now
	b.shown = 0.0
	b.chip_v = 0.0
	b.flash_t = _now
	b.flash_a = 0.75
	b.flash_dur = 0.55
	b.flash_heal = false
	_bots[i] = b
	ready_on[i] = false
	# (relaid out: the icons, the panel's top edge in its colours, every piece redrawn)
	_em = 0.0


func stop() -> void:
	_started = false
	_bots.clear()
	for s in _sweeps:
		s.visible = false
	_redraw_all()


## A MASK_SHADER rect inside `parent`.
func _mask(parent: Control) -> ColorRect:
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.visible = false
	var mat := ShaderMaterial.new()
	mat.shader = _mask_shader
	r.material = mat
	parent.add_child(r)
	return r


func _redraw_all() -> void:
	for d in _pn:
		for p in d.values():
			(p as Control).queue_redraw()
			for c in (p as Control).get_children():
				if c is Pane:
					(c as Pane).queue_redraw()
	_timer.queue_redraw()
	for b in _bots:
		_flow(b)
		_place_masks(b)


func _can_draw() -> bool:
	return _started and _bots.size() >= 2 and not _frame.is_empty() and _em >= 2.0


## Redraw one of robot `b`'s pieces.
func _redraw(b: Bot, pane: String) -> void:
	(_pn[b.index][pane] as Control).queue_redraw()


## Redraw part `p` of robot `b`'s condition panel (its three pieces), and tint it again.
func _redraw_part(b: Bot, p: int) -> void:
	var parts := _pn[b.index].xr_parts as Control
	for j in 3:
		(parts.get_child(3 * p + j) as Control).queue_redraw()
	b.xr_anim[p] = true
	b.xr_live = true


## An icon from the web's sets, or the slot's own where the move or passive has none (hud.ts
## ABILITY_ICON[fa] ?? SLOT_ICON.fist).
static func _icon_name(name: String, fallback: String) -> String:
	return name if Icons.find(name) != null else fallback


## About to come off (or shattered) (hud.ts updateXray: DETACHABLE[p] ? c < LOOSE : c <= 0).
static func _is_loose(p: int, c: float) -> bool:
	return c < TDamage.LOOSE if TDamage.DETACHABLE[p] else c <= 0.0


## Condition colour: teal when healthy, through yellow and orange to red (hud.ts condColor).
static func cond_color(c: float) -> Color:
	var hue := 50.0 + (c - 0.5) * 2.0 * 115.0 if c > 0.5 else c * 2.0 * 50.0
	return _hsl(roundf(hue), 0.95, roundf(55.0 + c * 5.0) / 100.0)


static func _hsl(h: float, s: float, l: float) -> Color:
	var a := s * minf(l, 1.0 - l)
	var f := func(n: float) -> float:
		var k := fposmod(n + h / 30.0, 12.0)
		return l - a * maxf(-1.0, minf(minf(k - 3.0, 9.0 - k), 1.0))
	return Color(f.call(0.0), f.call(8.0), f.call(4.0))


func capture(m_) -> void:
	if _bots.is_empty():
		return
	var clock := str(ceili(m_.clock))
	var hurry: bool = m_.clock <= 10.0 and m_.phase == "fight"
	if clock != _clock or hurry != _hurry:
		_clock = clock
		_hurry = hurry
		_timer.queue_redraw()
	for i in 2:
		var f = m_.fighters[i]
		var b := _bots[i]
		b.hp = maxf(0.0, f.hpRatio)
		b.max_hp = f.build.stats.maxHp
		b.since_hit = m_.time - f.lastHitTime
		var st := maxf(0.0, f.staminaRatio)
		if absf(st - b.stamina) > 0.0005:
			b.stamina = st
		# ability cooldown sweeps (hud.ts update: .ab .cd height, .ab.ready)
		for k in 2:
			var left: float = f.cooldownLeft(b.moves[k])
			_set_ab(b, k, minf(1.0, left / b.cd_max[k]), left <= 0.0)
		var pas: Dictionary = f.build.passives
		var ready := true
		var frac := 0.0
		if pas.has("aegis"):
			ready = f.shield
			frac = 0.0 if f.shield else maxf(0.0, f.shieldTimer) / maxf(1.0, pas.aegis)
		elif pas.has("overdrive"):
			ready = f.overdrive > 0.0
		_set_ab(b, 2, frac, ready)
		# one clean shot from a finisher
		var can: bool = m_.canFinish(f)
		if can != b.ready:
			b.ready = can
			b.ready_t0 = _now
			ready_on[i] = can
		# a hit flashes and shakes the bar, healing glows (hud.ts update)
		var dh: float = f.hp - b.hp_prev
		if dh < -0.5:
			_hp_hit(b, -dh / b.max_hp)
		elif dh > 0.5 and m_.phase == "fight":
			_hp_heal(b)
		b.hp_prev = f.hp
		_capture_xray(b, f.parts)


func _set_ab(b: Bot, k: int, frac: float, ready: bool) -> void:
	b.cd[k] = frac
	if b.ab_ready[k] != ready:
		b.ab_ready[k] = ready
		_redraw(b, "abil")


## hud.ts updateXray: recolour a part whose condition changed, flash it if it just took damage.
func _capture_xray(b: Bot, parts) -> void:
	var cond: PackedFloat32Array = parts.cond
	for p in PARTS:
		if parts.off[p] != 0.0:
			if not b.off[p]:
				b.off[p] = true
				b.loose[p] = false
				b.hit_t[p] = -100.0
				_redraw_part(b, p)
			continue
		var c := cond[p]
		if absf(c - b.cond[p]) < 0.004:
			continue
		if c < b.cond[p] - 0.01:
			b.hit_t[p] = _now
		b.cond[p] = c
		b.col_from[p] = _part_color(b, p)
		b.col_to[p] = cond_color(c)
		b.col_t[p] = _now
		var lo := _is_loose(p, c)
		if lo != b.loose[p]:
			b.loose[p] = lo
			b.loose_t[p] = _now
		# (retinted from the next frame)
		b.xr_anim[p] = true
		b.xr_live = true


## A hit lands on the bar: a white flash, and a shake that grows with the damage (hud.ts hpHit).
func _hp_hit(b: Bot, frac: float) -> void:
	b.flash_t = _now
	b.flash_a = minf(0.9, 0.35 + frac * 6.0)
	b.flash_dur = 0.26
	b.flash_heal = false
	if frac >= 0.035:
		b.shake_t = _now
		b.shake_a = minf(6.0, 1.5 + frac * 40.0)


## Health coming back (siphon) glows green along the bar (hud.ts hpHeal).
func _hp_heal(b: Bot) -> void:
	if _now - b.flash_t < b.flash_dur:
		return
	b.flash_t = _now
	b.flash_a = 0.9
	b.flash_dur = 0.5
	b.flash_heal = true


func on_event(type: String, data) -> void:
	if _bots.is_empty():
		return
	match type:
		"strikeStart":
			# a little banner under the bar naming the ability being thrown (hud.ts abilityTag)
			var s = data.s
			if s.move.get("ability") != null and not s.feint and m != null and m.phase == "fight" and m.fin == null:
				var b := _bots[int(data.f.index)]
				b.tags.append([str(s.move.name_).to_upper(), _now])
		"knockdown":
			# knockdown pips: three of them is a TKO (hud.ts onEvent knockdown, markKnockdowns)
			var d = data.defender
			# (a sweep, a shove or a takedown puts them down without counting toward the TKO)
			if m != null and m.phase == "fight" and d.state != "ko" and int(d.knockdowns) > _bots[int(d.index)].kd:
				_mark_kd(int(d.index), int(d.knockdowns))
		"ko":
			if str(data.kind) == "TKO":
				_mark_kd(int(data.loser.index), int(data.loser.knockdowns))


func _mark_kd(i: int, n: int) -> void:
	var b := _bots[i]
	b.kd = n
	b.kd_on = true
	_redraw(b, "name")


func tick(dt: float) -> void:
	if _bots.is_empty():
		return
	_now += dt
	if size != _size or not is_equal_approx(em(), _em):
		_layout()
	var fin := hud != null and hud.finished
	if fin != _finished:
		_finished = fin
		_fin.go(0.6 if fin else 1.0, 0.4, _now)
		_all = true
	_root.modulate.a = _fin.value(_now)
	var ring := _root.modulate.a < 1.0
	if ring != _ring_on:
		_ring_on = ring
		_all = true
	# the scan bars
	for s in _sweeps:
		(s.material as ShaderMaterial).set_shader_parameter(&"phase", fposmod(_now, 3.2) / 3.2)
	if _all:
		_all = false
		_redraw_all()
	for b in _bots:
		_bar_motion(b, dt)
		_tick_bot(b)


## One robot's pieces this frame: redraw what changed, and play the pulses, fades and the shake on
## the pieces themselves.
func _tick_bot(b: Bot) -> void:
	var pn: Dictionary = _pn[b.index]
	# the column: the pieces under the finisher tag move down while it's up
	if b.ready != b.flow_ready:
		_flow(b)
		_redraw(b, "xr_bg")
		_redraw(b, "xr_top")
		for c in (pn.xr_parts as Control).get_children():
			(c as Control).queue_redraw()
		b.drawn_tags = -1
	# the shake moves the bar as a whole (hpHit)
	var shake := Vector2.ZERO
	var st := _now - b.shake_t
	if st < 0.28:
		var a := b.shake_a * _k
		shake = HudKit.keyframes(st, 0.28, [[0.0, Vector2.ZERO], [0.25, Vector2(a, -a * 0.5)], [0.5, Vector2(-a * 0.8, a * 0.3)], [0.75, Vector2(a * 0.4, 0)], [1.0, Vector2.ZERO]], HudKit.ease_out)
	if shake != b.drawn_shake:
		b.drawn_shake = shake
		for n in HP_PANES:
			(pn[n] as Control).position = shake
	# the fill and the chip, on the GPU (low health fades the fill back and forth: hpLow)
	var bw := _bar_w - 4.0 * _k
	var fx := 2.0 * _k + bw * b.shown
	var cx := 2.0 * _k + bw * maxf(b.chip_v, b.shown)
	var lp := _pulse(_now - b.low_t0, 0.7) if b.low else 0.0
	var fa := lerpf(1.0, 0.6, lp)
	var bar := (pn.hp_bar as Control).material as ShaderMaterial
	if fx != b.drawn_fill:
		b.drawn_fill = fx
		bar.set_shader_parameter(&"fill_x", fx)
		bar.set_shader_parameter(&"has_fill", b.shown > 0.0)
	if cx != b.drawn_chip:
		b.drawn_chip = cx
		bar.set_shader_parameter(&"chip_x", cx)
	if fa != b.drawn_fa:
		b.drawn_fa = fa
		bar.set_shader_parameter(&"fill_a", fa)
		bar.set_shader_parameter(&"opaque", fa >= 1.0)
	var key := int(b.dead) + 2 * int(b.low) + 4 * int(_ring_on)
	if key != b.drawn_base:
		b.drawn_base = key
		_redraw(b, "hp_base")
	# low health: the track glows red, pulsing (hpLow)
	var low: Control = pn.hp_low
	low.visible = b.low
	if b.low:
		low.modulate.a = lp
	# the hit flash (white) or the heal glow (green), fading out
	var ft := _now - b.flash_t
	var flash: Control = pn.hp_flash
	flash.visible = ft < b.flash_dur
	if flash.visible:
		flash.modulate.a = b.flash_a * (1.0 - HudKit.ease_out(ft / b.flash_dur))
		if b.flash_heal != b.drawn_heal:
			b.drawn_heal = b.flash_heal
			flash.queue_redraw()
	var nk := b.num * 4 + 2 * int(b.dead) + int(b.low)
	if nk != b.drawn_num:
		b.drawn_num = nk
		_redraw(b, "hp_num")
	# .chipn: fading in and out, popping from 1.35x as it grows
	var chip: Control = pn.chipn
	var ca := b.chipn.value(_now)
	chip.visible = ca > 0.0 and b.chipn_text != ""
	if chip.visible:
		chip.modulate.a = ca
		var sc := 1.0
		var pt := _now - b.chipn_pop
		if pt < 0.18:
			sc = lerpf(1.35, 1.0, HudKit.ease_out(pt / 0.18))
			var pivot := _chipn_pivot(b)
			if chip.pivot_offset != pivot:
				chip.pivot_offset = pivot
		# (a Control redraws when its scale or pivot is set, even to what it was)
		if chip.scale.x != sc:
			chip.scale = Vector2(sc, sc)
	# stamina and the cooldowns: the GPU masks follow them
	if absf(b.stamina - b.drawn_st) > 0.0005:
		b.drawn_st = b.stamina
		var r := _st_fill[b.index]
		r.visible = b.stamina > 0.0
		var w := r.size.x * b.stamina
		var mat := r.material as ShaderMaterial
		mat.set_shader_parameter(&"fill_min", Vector2(r.size.x - w if b.right else -1.0, -1.0))
		mat.set_shader_parameter(&"fill_max", Vector2(r.size.x + 1.0 if b.right else w, r.size.y + 1.0))
	for k in 3:
		var f := b.cd[k]
		if absf(f - b.drawn_cd[k]) > 0.002 or (f <= 0.0) != (b.drawn_cd[k] <= 0.0):
			b.drawn_cd[k] = f
			var r: ColorRect = _cd[b.index][k]
			r.visible = f > 0.0
			(r.material as ShaderMaterial).set_shader_parameter(&"fill_min", Vector2(-1.0, r.size.y * (1.0 - f)))
	# the finisher tag pulses brighter (finReady)
	var ready: Control = pn.ready
	ready.visible = b.ready
	if b.ready:
		var u := fposmod(_now - b.ready_t0, 0.9) / 0.45
		var br := 1.0 + 0.25 * (_inout(u) if u < 1.0 else 1.0 - _inout(u - 1.0))
		ready.modulate = Color(br, br, br)
	# the ability tags drop in and fade out, each on its own piece
	var tags := pn.tags as Control
	if b.tags.size() != b.drawn_tags:
		b.drawn_tags = b.tags.size()
		for c in tags.get_children():
			(c as Control).queue_redraw()
	for k in mini(b.tags.size(), TAG_PANES):
		var age := _now - float(b.tags[k][1])
		var tp := tags.get_child(k) as Control
		tp.modulate.a = HudKit.keyframes(age, 1.3, [[0.0, 0.0], [0.12, 1.0], [0.75, 1.0], [1.0, 0.0]], HudKit.ease_css)
		tp.position.y = HudKit.keyframes(age, 1.3, [[0.0, -6.0 * _k], [0.12, 0.0], [1.0, 0.0]], HudKit.ease_css)
	# the condition panel's parts are drawn white and tinted: a colour change (the 0.3s .xp
	# transition), the hit's flash (xrHit) and the blink of a part about to come off (xrLoose:
	# fill-opacity to .08 and stroke-opacity to .45, back and forth, after the flash) cost no drawing
	if b.xr_live:
		_tint_parts(b, pn.xr_parts as Control)


func _tint_parts(b: Bot, parts: Control) -> void:
	b.xr_live = false
	for p in PARTS:
		var hit := _now - b.hit_t[p]
		var blink := b.loose[p] and not b.off[p]
		var anim := hit < 0.35 or _now - b.col_t[p] < 0.3 or blink
		if not anim and not b.xr_anim[p]:
			continue
		b.xr_anim[p] = anim
		b.xr_live = b.xr_live or anim
		var fp := parts.get_child(3 * p) as Control
		var ln := parts.get_child(3 * p + 1) as Control
		var hp := parts.get_child(3 * p + 2) as Control
		if b.off[p]:
			fp.modulate = Color.WHITE
			hp.visible = false
			continue
		var lk := 0.0
		if blink:
			var t0 := maxf(b.loose_t[p], b.hit_t[p]) + (0.35 if b.hit_t[p] > -50.0 else 0.0)
			if _now >= t0:
				lk = _pulse(_now - t0, 0.55)
		var pc := _part_color(b, p)
		fp.modulate = Color(pc, lerpf(1.0, 0.08 / 0.42, lk))
		ln.modulate = Color(pc, lerpf(1.0, 0.45, lk))
		hp.visible = hit < 0.35
		if hp.visible:
			hp.modulate.a = 0.95 * (1.0 - HudKit.ease_out(hit / 0.35))


## CSS ease-in-out.
static func _inout(u: float) -> float:
	return HudKit.bezier(u, 0.42, 0.0, 0.58, 1.0)


## Put robot `b`'s stamina fill and cooldown overlays in place (after a layout).
func _place_masks(b: Bot) -> void:
	var x0 := _x0(b)
	var stw := 0.82 * _bar_w
	var sr := Rect2(x0 if not b.right else x0 + _bar_w - stw, b.y_st, stw, 0.32 * _em)
	var r := _st_fill[b.index]
	r.position = sr.position
	r.size = sr.size
	var mat := r.material as ShaderMaterial
	mat.set_shader_parameter(&"size", sr.size)
	mat.set_shader_parameter(&"radius", minf(4.0 * _k, sr.size.y * 0.5))
	mat.set_shader_parameter(&"tint", Color(0.949, 0.961, 1.0, 0.8))
	b.drawn_st = -1.0
	var s := 2.05 * _em
	var gap := 0.35 * _em
	var rad := s * 0.5 - _k
	for a in 3:
		var x := x0 + a * (s + gap) if not b.right else x0 + _bar_w - s - a * (s + gap)
		var c: ColorRect = _cd[b.index][a]
		c.position = Vector2(x, b.y_ab) + Vector2(s * 0.5 - rad, s * 0.5 - rad)
		c.size = Vector2(rad, rad) * 2.0
		var m2 := c.material as ShaderMaterial
		m2.set_shader_parameter(&"size", c.size)
		m2.set_shader_parameter(&"radius", rad)
		m2.set_shader_parameter(&"tint", Color(0, 0, 0, 0.65))
		m2.set_shader_parameter(&"fill_max", Vector2(1e5, 1e5))
	b.drawn_cd = PackedFloat32Array([-1.0, -1.0, -1.0])


## Where each piece of robot `b`'s column (.fbar) sits: name row, health bar, stamina, abilities,
## finisher tag, condition panel, ability tags, 0.25em apart.
func _flow(b: Bot) -> void:
	b.flow_ready = b.ready
	var e := _em
	var gap := 0.25 * e
	var y := _top
	b.y_name = y
	y += 0.98 * e * 1.25 + gap
	b.y_hp = y
	y += 1.45 * e + gap
	b.y_st = y
	y += 0.32 * e + gap
	b.y_ab = y
	y += 2.05 * e
	if b.ready:
		y += gap + 0.25 * e
		b.y_ready = y
		y += _ready_h()
	# the condition panel (.xray: margin-top 0.3em)
	y += gap + 0.3 * e
	b.y_xr = y
	b.y_tags = y + _xray_h()


## hud.ts updateHpBar: the fill eases down to the health; the lost health stays behind as the hot
## chip, holds while the hits keep coming, then drains, slowly at first and faster as it goes, the
## flurry's total showing by the name until it's gone. Healing pulls the chip along.
func _bar_motion(b: Bot, dt: float) -> void:
	var ft := _now - b.fill_t0
	if ft < FILL_IN:
		# just tagged in: filling up, nothing lost
		b.shown = b.hp * HudKit.ease(ft / FILL_IN)
		b.chip_v = b.shown
		b.chip_vel = 0.0
		b.num = maxi(0, ceili(b.shown * b.max_hp - 0.01))
		b.low = false
		b.dead = false
		return
	b.shown += (b.hp - b.shown) * minf(1.0, dt * 22.0)
	if b.hp >= b.chip_v:
		b.chip_v = b.hp
		b.chip_vel = 0.0
	elif b.since_hit > CHIP_HOLD:
		b.chip_vel = minf(1.4, b.chip_vel + dt * 1.6)
		b.chip_v = maxf(b.hp, b.chip_v - b.chip_vel * dt)
	else:
		b.chip_vel = 0.0
	b.num = maxi(0, ceili(b.shown * b.max_hp - 0.01))
	var lost := roundi((b.chip_v - b.hp) * b.max_hp)
	if lost >= 5 and lost != b.lost:
		b.chipn_text = "-%d" % lost
		_redraw(b, "chipn")
		if lost > b.lost:
			b.chipn_pop = _now
		b.chipn.go(1.0, 0.08, _now)
	elif lost < 5 and b.lost >= 5:
		b.chipn.go(0.0, 0.35, _now)
	b.lost = lost
	var low := b.hp < 0.25 and b.hp > 0.0
	if low != b.low:
		b.low = low
		b.low_t0 = _now
	b.dead = b.hp <= 0.0
	# the ability tags go after 1.3s
	while not b.tags.is_empty() and _now - float(b.tags[0][1]) >= 1.3:
		b.tags.pop_front()


# ------------------------------------------------------------------------------------- layout

## CSS px in this control's units: the screen-to-canvas scale HudKit.em measures with.
func _px_scale() -> float:
	var h := size.y if size.y > 0.0 else 720.0
	var win := Vector2(DisplayServer.window_get_size())
	if win.y <= 0.0:
		return 1.0
	var dpr := 1.0
	if OS.has_feature("mobile"):
		dpr = maxf(1.0, DisplayServer.screen_get_dpi() / 160.0)
	else:
		dpr = maxf(1.0, DisplayServer.screen_get_scale())
	return h / (win.y / dpr)


func _layout() -> void:
	_size = size
	_em = em()
	_k = _px_scale()
	var e := _em
	var k := _k
	# fonts (style.css: .nm 0.98em 800, small 0.72em 700 0.08em, .chipn 0.85em, .hp-num 0.74em
	# 0.04em, .timer 1.85em, .finready 0.72em 0.1em, .abtag 0.78em 0.08em, .xr-head 0.5em 0.14em)
	var fs_nm := 0.98 * e
	_f_name = HudKit.body(800)
	_f_small = UiTheme.font(700, roundi(0.08 * 0.72 * fs_nm))
	_f_chip = _broadcast(800, 0.02 * 0.85 * fs_nm)
	_f_num = _broadcast(400, 0.04 * 0.74 * e)
	_f_timer = _broadcast(500, 0.0)
	_f_ready = _broadcast(500, 0.1 * 0.72 * e)
	_f_tag = _broadcast(500, 0.08 * 0.78 * e)
	_f_xr = UiTheme.font(700, roundi(0.14 * 0.5 * e))
	# .hud-top: 1fr auto 1fr between the side margins, 0.8em apart
	_top = 8.0 * k
	var tfs := 1.85 * e
	var tw := maxf(2.3 * tfs, HudKit.width(_f_timer, "99", tfs) + 0.5 * tfs + 2.0 * k)
	var th := tfs * (1.0 + 0.16 + 0.18) + 2.0 * k
	_bar_w = maxf(10.0, (size.x - 2.0 * side() - 2.0 * 0.8 * e - tw) * 0.5)
	_timer_box = Rect2(size.x * 0.5 - tw * 0.5, _top, tw, th)
	# the health bar's frame and track (.hp-frame, .hp-bar inset 2px), in the bar's own coordinates
	var h := 1.45 * e
	_frame = _chamfer(Rect2(0, 0, _bar_w, h), CUT * e, CHAMFER * e)
	_bar = _chamfer(Rect2(2.0 * k, 2.0 * k, _bar_w - 4.0 * k, h - 4.0 * k), CUT * e, CHAMFER * e)
	_ring.clear()
	for j in 5:
		_ring.append(PackedVector2Array([_frame[j], _frame[(j + 1) % 5], _bar[(j + 1) % 5], _bar[j]]))
	# filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .55))
	_shadows.clear()
	for g in [4.5, 3.0, 1.5, 0.0]:
		var grown := Geometry2D.offset_polygon(_frame, g * k)
		if not grown.is_empty():
			var sh: PackedVector2Array = grown[0]
			for j in sh.size():
				sh[j] += Vector2(0, 2.0 * k)
			_shadows.append(sh)
	# the clock's box, the ability rings, the condition panel
	_sb_timer = _box(Color(12 / 255.0, 15 / 255.0, 23 / 255.0, 0.74), 14.0 * k, LINE, k)
	_sb_timer.shadow_color = Color(0, 0, 0, 0.35)
	_sb_timer.shadow_size = int(10.0 * k)
	_sb_timer.shadow_offset = Vector2(0, 6.0 * k)
	var ab := 2.05 * e
	var rad := floorf(ab * 0.5) - 1.0
	_sb_ab = _box(Color(12 / 255.0, 15 / 255.0, 23 / 255.0, 0.72), rad, LINE, k)
	_sb_ab_ready = _box(Color(12 / 255.0, 15 / 255.0, 23 / 255.0, 0.72), rad, Color(AMBER, 0.7), k)
	_sb_ab_ready.shadow_color = Color(AMBER, 0.2)
	_sb_ab_ready.shadow_size = int(maxf(1.0, 4.0 * k))
	_sb_core_ready = _box(Color(12 / 255.0, 15 / 255.0, 23 / 255.0, 0.72), rad, Color(CYAN, 0.7), k)
	_sb_core_ready.shadow_color = Color(CYAN, 0.2)
	_sb_core_ready.shadow_size = int(maxf(1.0, 4.0 * k))
	_sb_xr = _box(Color(5 / 255.0, 11 / 255.0, 22 / 255.0, 0.74), 10.0 * k, Color(120 / 255.0, 220 / 255.0, 1.0, 0.22), k)
	_sb_xr.border_width_top = maxi(1, roundi(2.0 * k))
	_sb_xr.shadow_color = Color(0, 0, 0, 0.35)
	_sb_xr.shadow_size = int(7.0 * k)
	_sb_xr.shadow_offset = Vector2(0, 4.0 * k)
	# box-shadow: inset 0 0 14px rgba(60, 180, 255, .14)
	_sb_xr_glow = StyleBoxFlat.new()
	_sb_xr_glow.draw_center = false
	_sb_xr_glow.bg_color = Color(60 / 255.0, 180 / 255.0, 1.0, 0.0)
	_sb_xr_glow.border_color = Color(60 / 255.0, 180 / 255.0, 1.0, 0.14)
	_sb_xr_glow.border_blend = true
	_sb_xr_glow.set_border_width_all(int(7.0 * k))
	_sb_xr_glow.set_corner_radius_all(int(9.0 * k))
	_sb_xr_glow.anti_aliasing = true
	# border-top: 2px solid var(--bot0 / --bot1)
	_sb_xr_top.clear()
	for b in _bots:
		var t := StyleBoxFlat.new()
		t.draw_center = false
		t.border_color = b.c1
		t.border_width_top = maxi(1, roundi(2.0 * k))
		t.set_corner_radius_all(int(10.0 * k))
		t.corner_detail = 10
		t.anti_aliasing = true
		_sb_xr_top.append(t)
	var ipx := maxi(8, roundi(1.2 * e))
	for i in _bots.size():
		var texs := []
		for n in _bots[i].icons:
			texs.append(UiTheme.icon(n, ipx))
		_icon_tex[i] = texs
	_bolt = UiTheme.icon("bolt", maxi(8, roundi(0.72 * e)))
	_all = true


## style.css --broadcast at a CSS weight, upright: the HUD top's rules don't italicise it.
static func _broadcast(weight: int, spacing: float) -> Font:
	var key := "%d:%d" % [weight, roundi(spacing)]
	if _tex.has(key):
		return _tex[key]
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "Roboto", "sans-serif"])
	f.font_weight = weight
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	var out: Font = f
	if roundi(spacing) != 0:
		var v := FontVariation.new()
		v.base_font = f
		v.spacing_glyph = roundi(spacing)
		out = v
	_tex[key] = out
	return out


static func _box(bg: Color, radius: float, border: Color, k: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(maxi(1, roundi(k)))
	s.set_corner_radius_all(int(radius))
	s.corner_detail = 12
	s.anti_aliasing = true
	return s


## The bar's shape (style.css .hp clip-path): square at the outer end, `cut` slanted off the clock
## side, a small chamfer under the outer end.
static func _chamfer(r: Rect2, cut: float, ch: float) -> PackedVector2Array:
	var p := r.position
	var w := r.size.x
	var h := r.size.y
	return PackedVector2Array([p, p + Vector2(w, 0), p + Vector2(w - cut, h), p + Vector2(ch, h), p + Vector2(0, h - ch)])


## A rounded rectangle as a convex polygon.
static func _rrect(r: Rect2, rad: float, n := 4) -> PackedVector2Array:
	rad = minf(rad, minf(r.size.x, r.size.y) * 0.5)
	var pts := PackedVector2Array()
	var corners := [
		[r.end.x - rad, r.position.y + rad, -PI * 0.5], [r.end.x - rad, r.end.y - rad, 0.0],
		[r.position.x + rad, r.end.y - rad, PI * 0.5], [r.position.x + rad, r.position.y + rad, PI],
	]
	for c in corners:
		for i in n + 1:
			var a: float = c[2] + PI * 0.5 * i / n
			_add(pts, Vector2(c[0] + cos(a) * rad, c[1] + sin(a) * rad))
	if pts.size() > 1 and pts[0].is_equal_approx(pts[pts.size() - 1]):
		pts.remove_at(pts.size() - 1)
	return pts


# ------------------------------------------------------------------------- polygon helpers

## The part of the convex `poly` where n . p <= d (Sutherland-Hodgman, one edge).
static func clip(poly: PackedVector2Array, n: Vector2, d: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	var c := poly.size()
	if c == 0:
		return out
	var prev := poly[c - 1]
	var pd := n.dot(prev) - d
	for p in poly:
		var pdist := n.dot(p) - d
		if pdist <= 0.0:
			if pd > 0.0:
				_add(out, prev.lerp(p, pd / (pd - pdist)))
			_add(out, p)
		elif pd <= 0.0:
			_add(out, prev.lerp(p, pd / (pd - pdist)))
		prev = p
		pd = pdist
	return out


static func _add(out: PackedVector2Array, p: Vector2) -> void:
	if out.is_empty() or not out[out.size() - 1].is_equal_approx(p):
		out.append(p)


## The part of `poly` between x0 and x1.
static func clip_x(poly: PackedVector2Array, x0: float, x1: float) -> PackedVector2Array:
	return clip(clip(poly, Vector2(-1, 0), -x0), Vector2(1, 0), x1)


static func _area_ok(poly: PackedVector2Array) -> bool:
	if poly.size() < 3:
		return false
	var a := 0.0
	var c := poly.size()
	for i in c:
		a += poly[i].cross(poly[(i + 1) % c])
	return absf(a) > 0.05


## Fill the convex `poly` with a CSS linear-gradient: `stops` [[t, Color], ...] along o -> o + d,
## held flat before the first and after the last. Each stretch between stops is one polygon with
## its corners coloured, which draws a linear ramp exactly.
static func grad(ci: CanvasItem, poly: PackedVector2Array, o: Vector2, d: Vector2, stops: Array, alpha := 1.0, aa := false) -> void:
	if not _area_ok(poly):
		return
	var dd := d.length_squared()
	if dd <= 0.0:
		return
	var tmin := INF
	var tmax := -INF
	for p in poly:
		var t := (p - o).dot(d) / dd
		tmin = minf(tmin, t)
		tmax = maxf(tmax, t)
	var n := stops.size()
	for k in n + 1:
		var ta: float = -INF if k == 0 else float(stops[k - 1][0])
		var tb: float = INF if k == n else float(stops[k][0])
		if tb <= tmin or ta >= tmax:
			continue
		var piece := poly
		if ta > tmin:
			piece = clip(piece, -d, -(d.dot(o) + ta * dd))
		if tb < tmax:
			piece = clip(piece, d, d.dot(o) + tb * dd)
		if not _area_ok(piece):
			continue
		var cols := PackedColorArray()
		cols.resize(piece.size())
		for j in piece.size():
			cols[j] = _stop_color(stops, (piece[j] - o).dot(d) / dd, alpha)
		ci.draw_polygon(piece, cols)
	if aa:
		# (polygons draw with hard edges: an antialiased hairline round an opaque shape softens them)
		var line := poly.duplicate()
		line.append(poly[0])
		var lc := PackedColorArray()
		for p in line:
			lc.append(_stop_color(stops, (p - o).dot(d) / dd, alpha))
		ci.draw_polyline_colors(line, lc, 1.0, true)


static func _stop_color(stops: Array, t: float, alpha: float) -> Color:
	var c: Color = stops[0][1]
	if t > float(stops[0][0]):
		c = stops[-1][1]
		for k in range(1, stops.size()):
			if t <= float(stops[k][0]):
				var a: float = stops[k - 1][0]
				var b: float = stops[k][0]
				c = (stops[k - 1][1] as Color).lerp(stops[k][1], (t - a) / maxf(1e-6, b - a))
				break
	c.a *= alpha
	return c


## A tile of a CSS repeating-linear-gradient with hard stops (`on` from a to b of each `period`
## CSS px, along `dir`), one period across and down, so it repeats seamlessly. {tex, size}.
static func _stripes(key: String, dir: Vector2, period: float, a: float, b: float, col: Color) -> Dictionary:
	if _tex.has(key):
		return _tex[key]
	var px := period / absf(dir.x) if absf(dir.x) > 1e-4 else 1.0
	var py := period / absf(dir.y) if absf(dir.y) > 1e-4 else 1.0
	var res := 4.0
	var w := maxi(1, roundi(px * res))
	var h := maxi(1, roundi(py * res))
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		for x in w:
			var cov := 0
			for sy in 3:
				for sx in 3:
					var q := Vector2((x + (sx + 0.5) / 3.0) / w * px, (y + (sy + 0.5) / 3.0) / h * py)
					var t := fposmod(q.dot(dir), period)
					if t >= a and t < b:
						cov += 1
			img.set_pixel(x, y, Color(col.r, col.g, col.b, col.a * cov / 9.0))
	var out := {"tex": ImageTexture.create_from_image(img), "size": Vector2(px, py)}
	_tex[key] = out
	return out


## `poly` painted with a stripe tile, its pattern starting at `origin` (CSS px scaled by `k`).
func _tile(poly: PackedVector2Array, tile: Dictionary, origin: Vector2, k: float, alpha := 1.0) -> void:
	if not _area_ok(poly):
		return
	var sz: Vector2 = tile.size * k
	var uvs := PackedVector2Array()
	uvs.resize(poly.size())
	for j in poly.size():
		uvs[j] = (poly[j] - origin) / sz
	_ci.draw_colored_polygon(poly, Color(1, 1, 1, alpha), uvs, tile.tex)


# ------------------------------------------------------------------------------------- drawing
# Each _draw_<piece>(i) draws one piece of robot i's column on _ci, the piece drawing now.

## The left edge of a robot's column.
func _x0(b: Bot) -> float:
	return side() if not b.right else size.x - side() - _bar_w


## Tag team: the room in robot `i`'s ability row past its three icons, 0.6em clear of them, at most
## `want` wide (HudTag's partner chip sits there): empty before the first layout.
func team_slot(i: int, want: float) -> Rect2:
	if i >= _bots.size() or _em < 2.0:
		return Rect2()
	var b := _bots[i]
	var s := 2.05 * _em
	var used := 3.0 * s + 2.0 * 0.35 * _em + 0.6 * _em
	var w := minf(want, _bar_w - used - CUT * _em)
	if w <= 0.0:
		return Rect2()
	var x := _x0(b) + used if not b.right else _x0(b) + _bar_w - used - w
	return Rect2(x, b.y_ab, w, s)


## The em the top was last laid out in (0 before the first layout).
func layout_em() -> float:
	return _em


## The clock (.timer; .hud.finished hides it: the docked K.O. takes its spot).
func _draw_timer() -> void:
	if _finished:
		return
	_ci.draw_style_box(_sb_timer, _timer_box)
	var tfs := 1.85 * _em
	var tw := HudKit.width(_f_timer, _clock, tfs)
	var top := _timer_box.position.y + 1.0 * _k + 0.16 * tfs
	_ci.draw_string(_f_timer, Vector2(_timer_box.get_center().x - tw * 0.5, _baseline(_f_timer, tfs, top, tfs)), _clock, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(tfs), RED if _hurry else TEXT)


## The baseline of a line of `font` at `fs` in a line box `lh` tall from `top`.
static func _baseline(font: Font, fs: float, top: float, lh: float) -> float:
	var px := roundi(fs)
	var asc := font.get_ascent(px)
	var desc := font.get_descent(px)
	return top + (lh - (asc + desc)) * 0.5 + asc


## .nm: the name, "PWR <rating>" in small caps and the knockdown pips; the right bar's runs from the
## outer end inward.
func _draw_name(i: int) -> void:
	var b := _bots[i]
	var e := _em
	var x0 := _x0(b)
	var w := _bar_w
	var y := b.y_name
	var lh := 0.98 * e * 1.25
	var fs := 0.98 * e
	var fss := 0.72 * fs
	var gap := 0.5 * fs
	var base := _baseline(_f_name, fs, y, lh)
	var wn := HudKit.width(_f_name, b.name_, fs)
	var ws := HudKit.width(_f_small, b.rating, fss)
	var pip := 0.5 * fs
	var kd_w := 3.0 * pip + 2.0 * 0.2 * fs
	var kx := 0.0
	if not b.right:
		HudKit.text(_ci, _f_name, Vector2(x0, base), b.name_, fs, TEXT, 0.8)
		HudKit.text(_ci, _f_small, Vector2(x0 + wn + gap, base), b.rating, fss, TEXT_2, 0.8)
		kx = x0 + wn + gap + ws + gap
	else:
		var xn := x0 + w - wn
		HudKit.text(_ci, _f_name, Vector2(xn, base), b.name_, fs, TEXT, 0.8)
		HudKit.text(_ci, _f_small, Vector2(xn - gap - ws, base), b.rating, fss, TEXT_2, 0.8)
		kx = xn - gap - ws - gap - kd_w
	# .kd: three skewed pips, lit per knockdown, shown from the first
	if b.kd_on:
		var cy := y + lh * 0.5
		var sk := tan(deg_to_rad(14.0)) * pip * 0.5
		for p in 3:
			var px := kx + p * (pip + 0.2 * fs)
			var q := PackedVector2Array([
				Vector2(px + sk, cy - pip * 0.5), Vector2(px + pip + sk, cy - pip * 0.5),
				Vector2(px + pip - sk, cy + pip * 0.5), Vector2(px - sk, cy + pip * 0.5)])
			if p < b.kd:
				var glow := PackedVector2Array()
				for v in q:
					glow.append((v - Vector2(px + pip * 0.5, cy)) * 1.7 + Vector2(px + pip * 0.5, cy))
				_ci.draw_colored_polygon(glow, Color(1.0, 0.247, 0.369, 0.22))
				_ci.draw_colored_polygon(q, RED)
			else:
				_ci.draw_colored_polygon(q, Color(1, 1, 1, 0.18))


## Where the flurry's damage total sits: [its left, its baseline, the size it's drawn at].
func _chipn_at(b: Bot) -> Array:
	var fs := 0.98 * _em
	var lh := fs * 1.25
	var cfs := 0.85 * fs
	var cw := HudKit.width(_f_chip, b.chipn_text, cfs)
	var cx := _x0(b) + _bar_w - cw if not b.right else _x0(b)
	var cb := _baseline(_f_chip, cfs, b.y_name + (lh - cfs * 1.25) * 0.5, cfs * 1.25)
	return [cx, cb, cfs, cw]


## The middle the damage total pops from.
func _chipn_pivot(b: Bot) -> Vector2:
	var c := _chipn_at(b)
	return Vector2(float(c[0]) + float(c[3]) * 0.5, b.y_name + 0.98 * _em * 1.25 * 0.5)


## .chipn: "-N" on the clock side of the name row (its fade and pop are the piece's).
func _draw_chipn(i: int) -> void:
	var b := _bots[i]
	if b.chipn_text == "":
		return
	var c := _chipn_at(b)
	var px := roundi(float(c[2]))
	var at := Vector2(c[0], c[1])
	# text-shadow: 0 0 8px rgba(255, 52, 72, .85), 0 2px 4px rgba(0, 0, 0, .9)
	_ci.draw_string_outline(_f_chip, at + Vector2(0, 2.0 * _k), b.chipn_text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, maxi(2, roundi(3.0 * _k)), Color(0, 0, 0, 0.45))
	for g in [[11.0, 0.1], [7.0, 0.16], [3.5, 0.3]]:
		_ci.draw_string_outline(_f_chip, at, b.chipn_text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, maxi(2, roundi(g[0] * _k)), Color(1.0, 0.204, 0.282, g[1]))
	_ci.draw_string(_f_chip, at, b.chipn_text, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(1.0, 0.839, 0.863))


# The health bar (.hp): frame, track, chip, fill, cells, flash and the low glow, all in the bar's own
# coordinates (mirrored for the right bar, as .fbar.right .hp-frame's scaleX(-1)), then the number
# on top. Its pieces shake together on a big hit (hpHit).

## Draw in robot `b`'s bar's own coordinates.
func _hp_space(b: Bot) -> void:
	var x0 := _x0(b)
	var xf := Transform2D(0.0, Vector2(x0, b.y_hp))
	if b.right:
		xf = Transform2D(Vector2(-1, 0), Vector2(0, 1), Vector2(x0 + _bar_w, b.y_hp))
	_ci.draw_set_transform_matrix(xf)


## The drop shadow and the steel frame: white sheen, red when low, dim when dead; its outer end
## takes the paint.
func _draw_hp_base(i: int) -> void:
	var b := _bots[i]
	_hp_space(b)
	var sa := [0.07, 0.09, 0.11, 0.14]
	for j in _shadows.size():
		_ci.draw_colored_polygon(_shadows[j], Color(0, 0, 0, sa[j]))
	var h := 1.45 * _em
	var sheen := [[0.0, Color(1, 1, 1, 0.42)], [0.55, Color(1, 1, 1, 0.12)], [1.0, Color(1, 1, 1, 0.24)]]
	if b.dead:
		sheen = [[0.0, Color(1, 1, 1, 0.14)]]
	elif b.low:
		sheen = [[0.0, Color(1.0, 0.42, 0.514)], [0.55, RED], [1.0, Color(0.702, 0.125, 0.227)]]
	var c1t := b.c1
	c1t.a = 0.0
	var tint := [[0.0, b.c2], [0.18, b.c1], [0.46, c1t]]
	for fp in (_ring if _ring_on else [_frame]):
		grad(_ci, fp, Vector2.ZERO, Vector2(0, h), sheen)
		grad(_ci, fp, Vector2.ZERO, Vector2(_bar_w, 0), tint, 0.25 if b.dead else 0.9)


## The track, the chip and the fill (BAR_SHADER on this piece: the bar's shape, its UVs the bar's
## own coordinates).
func _draw_hp_bar(i: int) -> void:
	var b := _bots[i]
	_hp_space(b)
	var bar := _ci.material as ShaderMaterial
	bar.set_shader_parameter(&"k", _k)
	bar.set_shader_parameter(&"bo", Vector2(2.0 * _k, 2.0 * _k))
	bar.set_shader_parameter(&"bs", Vector2(_bar_w - 4.0 * _k, 1.45 * _em - 4.0 * _k))
	bar.set_shader_parameter(&"c1", b.c1)
	bar.set_shader_parameter(&"c2", b.c2)
	_ci.draw_colored_polygon(_bar, Color.WHITE, _bar)


## Ten cells notched on the frame's slant, a hairline at each half, a sheen along the top.
func _draw_hp_over(i: int) -> void:
	var b := _bots[i]
	_hp_space(b)
	var k := _k
	var bw := _bar_w - 4.0 * k
	var bh := 1.45 * _em - 4.0 * k
	var bo := Vector2(2.0 * k, 2.0 * k)
	grad(_ci, _bar, bo, Vector2(0, bh * 0.3), [[0.0, Color(1, 1, 1, 0.16)], [1.0, Color(1, 1, 1, 0.0)]])
	var sk := tan(deg_to_rad(-24.0))
	var cy := bo.y + bh * 0.5
	for c in range(1, 11):
		var xc := bo.x + bw * c / 10.0
		_notch(xc - 2.0 * k, xc, bo.y, bh, cy, sk, Color(0.016, 0.024, 0.047, 0.85))
		var xh := bo.x + bw * (c - 0.5) / 10.0
		_notch(xh - 0.5 * k, xh + 0.5 * k, bo.y, bh, cy, sk, Color(0.016, 0.024, 0.047, 0.32))


## The hit flash (white) or the heal glow (green), at full strength (the piece fades it).
func _draw_hp_flash(i: int) -> void:
	var b := _bots[i]
	_hp_space(b)
	if b.flash_heal:
		var bw := _bar_w - 4.0 * _k
		var bo := Vector2(2.0 * _k, 2.0 * _k)
		grad(_ci, _bar, bo, Vector2(bw, 0), [[0.0, Color(0.353, 1.0, 0.667, 0.0)], [1.0, Color(0.353, 1.0, 0.667, 0.55)]])
	else:
		_ci.draw_colored_polygon(_bar, Color.WHITE)


## Low health: the track glows red (the piece pulses it).
func _draw_hp_low(i: int) -> void:
	var b := _bots[i]
	_hp_space(b)
	var bw := _bar_w - 4.0 * _k
	var bo := Vector2(2.0 * _k, 2.0 * _k)
	grad(_ci, _bar, bo, Vector2(bw, 0), [[0.0, Color(1.0, 0.157, 0.275, 0.5)], [1.0, Color(1.0, 0.157, 0.275, 0.08)]])


## .hp-num: the health, by the outer end.
func _draw_hp_num(i: int) -> void:
	var b := _bots[i]
	var e := _em
	var k := _k
	var x0 := _x0(b)
	var nfs := 0.74 * e
	var s := str(b.num)
	var nw := HudKit.width(_f_num, s, nfs)
	var nx := x0 + 0.75 * nfs if not b.right else x0 + _bar_w - 0.75 * nfs - nw
	var nlh := nfs * 1.25
	var at := Vector2(nx, _baseline(_f_num, nfs, b.y_hp + 1.45 * e * 0.5 - 0.52 * nlh, nlh))
	var col := Color.WHITE
	if b.dead:
		col = RED
	elif b.low:
		col = Color(1.0, 0.816, 0.847)
	var px := roundi(nfs)
	_ci.draw_string_outline(_f_num, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, maxi(2, roundi(4.0 * k)), Color(0, 0, 0, 0.3))
	_ci.draw_string(_f_num, at + Vector2(0, k), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color(0, 0, 0, 0.9))
	_ci.draw_string(_f_num, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)


## Stamina's track (.st: 82% wide, 0.32em; the fill, scaled from the outer end, is a mask).
func _draw_stamina(i: int) -> void:
	var b := _bots[i]
	var x0 := _x0(b)
	var stw := 0.82 * _bar_w
	var sr := Rect2(x0 if not b.right else x0 + _bar_w - stw, b.y_st, stw, 0.32 * _em)
	_ci.draw_colored_polygon(_rrect(sr, minf(4.0 * _k, sr.size.y * 0.5), 3), Color(1, 1, 1, 0.08))


## A notch line between x0 and x1 at the bar's centre, skewed (skewX(-24deg)), inside the bar.
func _notch(x0: float, x1: float, top: float, h: float, cy: float, sk: float, col: Color) -> void:
	var dt := sk * (top - cy)
	var db := sk * (top + h - cy)
	var q := PackedVector2Array([Vector2(x0 + dt, top), Vector2(x1 + dt, top), Vector2(x1 + db, top + h), Vector2(x0 + db, top + h)])
	# keep it inside the bar's shape (its edges run clockwise on screen: inside is to their right)
	var p := q
	for j in _bar.size():
		var a := _bar[j]
		var c := _bar[(j + 1) % _bar.size()]
		var en := Vector2(c.y - a.y, a.x - c.x)
		p = clip(p, en, en.dot(a))
		if p.size() < 3:
			return
	if _area_ok(p):
		_ci.draw_colored_polygon(p, col)


## An `infinite alternate` ease-in-out track (0 -> 1 -> 0 ...) `dur` long each way.
static func _pulse(t: float, dur: float) -> float:
	var c := t / dur
	var n := floori(c)
	var f := c - n
	if n % 2 == 1:
		f = 1.0 - f
	return HudKit.bezier(f, 0.42, 0.0, 0.58, 1.0)


## .abil: the fist and kick abilities and the core's passive, round, with the cooldown filling
## back from the bottom; the right bar's run from the outer end (row-reverse).
func _draw_abil(i: int) -> void:
	var b := _bots[i]
	var e := _em
	var x0 := _x0(b)
	var y := b.y_ab
	var s := 2.05 * e
	var gap := 0.35 * e
	var texs: Array = _icon_tex[i]
	for a in 3:
		var x := x0 + a * (s + gap) if not b.right else x0 + _bar_w - s - a * (s + gap)
		var r := Rect2(x, y, s, s)
		var core := a == 2
		var ready := b.ab_ready[a]
		var sb := _sb_ab
		if ready:
			sb = _sb_core_ready if core else _sb_ab_ready
		_ci.draw_style_box(sb, r)
		var col := CYAN if core else AMBER
		if a < texs.size():
			var isz := 1.2 * e
			_ci.draw_texture_rect(texs[a], Rect2(r.get_center() - Vector2(isz, isz) * 0.5, Vector2(isz, isz)), false, col)
		# (.cd, the dark overlay rising from the bottom inside the ring, is a mask)


## The finisher tag's height.
func _ready_h() -> float:
	var fs := 0.72 * _em
	return fs * 1.25 + 2.0 * 0.12 * fs


## .finready: "Finisher ready" with a bolt, a slanted amber tag (its pulse is the piece's).
func _draw_ready(i: int) -> void:
	var b := _bots[i]
	if not b.ready:
		return
	var fs := 0.72 * _em
	var y := b.y_ready
	var text := "FINISHER READY"
	var tw := HudKit.width(_f_ready, text, fs)
	var h := _ready_h()
	var bw := 0.45 * fs + fs + 0.3 * fs + tw + 0.65 * fs
	var x := _x0(b) if not b.right else _x0(b) + _bar_w - bw
	var c6 := 6.0 * _k
	var poly := PackedVector2Array([Vector2(x + c6, y), Vector2(x + bw, y), Vector2(x + bw - c6, y + h), Vector2(x, y + h)])
	grad(_ci, poly, Vector2(x, y), Vector2(bw, 0), [[0.0, Color(1.0, 0.878, 0.541)], [0.5, AMBER], [1.0, ORANGE]], 1.0, true)
	var isz := fs
	_ci.draw_texture_rect(_bolt, Rect2(x + 0.45 * fs, y + (h - isz) * 0.5, isz, isz), false, TAG_INK)
	_ci.draw_string(_f_ready, Vector2(x + 0.45 * fs + fs + 0.3 * fs, _baseline(_f_ready, fs, y + 0.12 * fs, fs * 1.25)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(fs), TAG_INK)


## .abtag: ability tag `k` under the condition panel, the ability's name on a slanted amber tag
## (its drop-in and fade over 1.3s, the abtag keyframes, are the piece's).
func _draw_tag(i: int, k: int) -> void:
	var b := _bots[i]
	if k >= b.tags.size():
		return
	var fs := 0.78 * _em
	var h := fs * 1.25 + 2.0 * 0.15 * fs
	var y := b.y_tags + (k + 1) * 0.25 * _em + k * h
	var text: String = b.tags[k][0]
	var tw := HudKit.width(_f_tag, text, fs)
	var bw := tw + 1.4 * fs
	var x := _x0(b) if not b.right else _x0(b) + _bar_w - bw
	var c6 := 6.0 * _k
	var poly := PackedVector2Array([Vector2(x + c6, y), Vector2(x + bw, y), Vector2(x + bw - c6, y + h), Vector2(x, y + h)])
	grad(_ci, poly, Vector2(x, y), Vector2(bw, 0), [[0.0, AMBER], [1.0, ORANGE]], 1.0, true)
	_ci.draw_string(_f_tag, Vector2(x + 0.7 * fs, _baseline(_f_tag, fs, y + 0.15 * fs, fs * 1.25)), text, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(fs), TAG_INK)


# ------------------------------------------------------------------------------------- x-ray

## The parts' outlines in the panel's viewBox units, and their dashed ghosts (.xp.off).
static func _xray_geometry() -> void:
	if not _xr_polys.is_empty():
		return
	for sh in XRAY_SHAPES:
		var poly := PackedVector2Array()
		if sh[0] is Array:
			for v in sh:
				poly.append(Vector2(v[0], v[1]))
		else:
			poly = _rrect(Rect2(sh[0], sh[1], sh[2], sh[3]), sh[4], 4)
		_xr_polys.append(poly)
		var closed := poly.duplicate()
		closed.append(poly[0])
		_xr_closed.append(closed)
		# stroke-dasharray: 2 2, walked round the outline
		var dash := PackedVector2Array()
		var on := true
		var left := 2.0
		var c := poly.size()
		for j in c:
			var a := poly[j]
			var bb := poly[(j + 1) % c]
			var seg := a.distance_to(bb)
			var at := 0.0
			while at < seg - 1e-4:
				var step := minf(left, seg - at)
				if on:
					dash.append(a.lerp(bb, at / seg))
					dash.append(a.lerp(bb, (at + step) / seg))
				at += step
				left -= step
				if left <= 1e-4:
					on = not on
					left = 2.0
		_xr_dash.append(dash)
	for bn in XRAY_BONES:
		_xr_bones.append(Vector2(bn[0], bn[1]))
		_xr_bones.append(Vector2(bn[2], bn[3]))


## The colour a part shows now, partway through its 0.3s colour change (.xp transition).
func _part_color(b: Bot, p: int) -> Color:
	var t := (_now - b.col_t[p]) / 0.3
	if t >= 1.0:
		return b.col_to[p]
	return b.col_from[p].lerp(b.col_to[p], HudKit.ease_css(maxf(0.0, t)))


# .xray: the condition panel under the bars, a front-on schematic of the robot with each part in
# its condition's colour, blinking when it could come off, a dashed ghost once it has; scan lines
# over it and the sweep (a Sweep layer). Three pieces: the panel, the parts (redrawn while one
# blinks, flashes or changes colour) and the frame and scan lines over them.

## The panel's boxes for robot `b`: {r: the panel, pad: its padding box, hy: the heading's top,
## head_fs, head_h, svg_w: the schematic's width, sy: its top}.
func _xr_box(b: Bot) -> Dictionary:
	var e := _em
	var k := _k
	var pw := 4.8 * e
	var bt := maxf(1.0, roundf(2.0 * k))
	var bs := maxf(1.0, roundf(k))
	var head_fs := 0.5 * e
	var head_h := head_fs * 1.25
	var svg_w := pw - 0.8 * e - 2.0 * bs
	var x := _x0(b) if not b.right else _x0(b) + _bar_w - pw
	var y := b.y_xr
	var r := Rect2(x, y, pw, _xray_h())
	var hy := y + bt + 0.3 * e
	return {
		"r": r, "pad": Rect2(x + bs, y + bt, pw - 2.0 * bs, r.size.y - bt - bs), "hy": hy,
		"head_fs": head_fs, "head_h": head_h, "svg_w": svg_w, "sy": hy + head_h + 0.35 * head_fs,
	}


## The panel's height.
func _xray_h() -> float:
	var e := _em
	var bt := maxf(1.0, roundf(2.0 * _k))
	var bs := maxf(1.0, roundf(_k))
	var head_fs := 0.5 * e
	var svg_w := 4.8 * e - 0.8 * e - 2.0 * bs
	return bt + 0.3 * e + head_fs * 1.25 + 0.35 * head_fs + svg_w * 126.0 / 64.0 + 0.4 * e + bs


## The panel's rounded padding box.
func _xr_inner(pad: Rect2) -> PackedVector2Array:
	return _rrect(pad, maxf(0.0, 10.0 * _k - maxf(1.0, roundf(_k))), 5)


## The panel: its box, the glow behind the schematic, the bot's colour along the top, "CONDITION".
func _draw_xr_bg(i: int) -> void:
	_xray_geometry()
	var b := _bots[i]
	var g := _xr_box(b)
	var r: Rect2 = g.r
	var pad: Rect2 = g.pad
	var e := _em
	var k := _k
	_ci.draw_style_box(_sb_xr, r)
	# radial-gradient(ellipse at 50% 40%, rgba(40, 120, 170, .32), transparent 75%)
	var c := Vector2(pad.position.x + pad.size.x * 0.5, pad.position.y + pad.size.y * 0.4)
	var rx := pad.size.x * 0.5 * sqrt(2.0) * 0.75
	var ry := pad.size.y * 0.6 * sqrt(2.0) * 0.75
	var pts := PackedVector2Array([c])
	var cols := PackedColorArray([Color(40 / 255.0, 120 / 255.0, 170 / 255.0, 0.32)])
	var idx := PackedInt32Array()
	var n := 20
	for j in n:
		var ang := TAU * j / n
		var v := c + Vector2(cos(ang) * rx, sin(ang) * ry)
		v.x = clampf(v.x, pad.position.x, pad.end.x)
		v.y = clampf(v.y, pad.position.y, pad.end.y)
		pts.append(v)
		cols.append(Color(40 / 255.0, 120 / 255.0, 170 / 255.0, 0.0))
		idx.append_array([0, 1 + j, 1 + (j + 1) % n])
	RenderingServer.canvas_item_add_triangle_array(_ci.get_canvas_item(), idx, pts, cols)
	_ci.draw_style_box(_sb_xr_glow, pad)
	if i < _sb_xr_top.size():
		_ci.draw_style_box(_sb_xr_top[i], r)
	# .xr-head: the bot's colour pip and "CONDITION"
	var hy: float = g.hy
	var head_fs: float = g.head_fs
	var head_h: float = g.head_h
	var hx := pad.position.x + 0.4 * e
	var dot := 0.35 * e
	var word := HudKit.width(_f_xr, "CONDITION", head_fs)
	var dw := clampf(float(g.svg_w) - word - 0.35 * head_fs, 0.0, dot)
	if dw > 0.0:
		var dc := Vector2(hx + dw * 0.5, hy + head_h * 0.5)
		_ci.draw_set_transform(dc, 0.0, Vector2(dw / dot, 1.0))
		_ci.draw_circle(Vector2.ZERO, dot * 0.5 + 1.5 * k, Color(b.c1, 0.2), true, -1.0, true)
		_ci.draw_circle(Vector2.ZERO, dot * 0.5, b.c1, true, -1.0, true)
		_ci.draw_set_transform_matrix(Transform2D.IDENTITY)
	_ci.draw_string(_f_xr, Vector2(hx + dw + 0.35 * head_fs, _baseline(_f_xr, head_fs, hy, head_h)), "CONDITION", HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(head_fs), Color(190 / 255.0, 236 / 255.0, 1.0, 0.75))
	# the sweep sits over the panel
	var sw := _sweeps[i]
	sw.position = pad.position
	sw.size = pad.size
	(sw.material as ShaderMaterial).set_shader_parameter(&"size", pad.size)
	(sw.material as ShaderMaterial).set_shader_parameter(&"radius", maxf(0.0, 10.0 * _k - maxf(1.0, roundf(_k))))


## Draw in the schematic's viewBox units.
func _xr_space(b: Bot) -> void:
	var g := _xr_box(b)
	var pad: Rect2 = g.pad
	var s: float = float(g.svg_w) / 64.0
	_ci.draw_set_transform(Vector2(pad.position.x + 0.4 * _em, g.sy), 0.0, Vector2(s, s))


## Part `p`'s plate, white (its piece takes the condition's colour); a dashed ghost once it's off.
func _draw_xr_fill(i: int, p: int) -> void:
	_xray_geometry()
	var b := _bots[i]
	_xr_space(b)
	if b.off[p]:
		_ci.draw_multiline(_xr_dash[p], Color(1, 1, 1, 0.28), 1.1)
		return
	# (filter: drop-shadow(0 0 1.5px): a soft copy of the plate under it)
	_ci.draw_polyline(_xr_closed[p], Color(1, 1, 1, 0.35), 3.0)
	_ci.draw_colored_polygon(_xr_polys[p], Color(1, 1, 1, 0.42))
	_ci.draw_colored_polygon(_xr_polys[p], Color(1, 1, 1, 0.42))


## Part `p`'s outline, white (tinted like the plate).
func _draw_xr_line(i: int, p: int) -> void:
	_xray_geometry()
	var b := _bots[i]
	if b.off[p]:
		return
	_xr_space(b)
	_ci.draw_polyline(_xr_closed[p], Color.WHITE, 1.1, true)


## Part `p` flashing white as it's hit (xrHit: its piece fades it out).
func _draw_xr_flash(i: int, p: int) -> void:
	_xray_geometry()
	var b := _bots[i]
	if b.off[p]:
		return
	_xr_space(b)
	_ci.draw_colored_polygon(_xr_polys[p], Color.WHITE)


## The bones and joints over the parts, and the scan lines (::before: 1px of every 3px, from the
## bottom up).
func _draw_xr_top(i: int) -> void:
	_xray_geometry()
	var b := _bots[i]
	_xr_space(b)
	_ci.draw_multiline(_xr_bones, Color(215 / 255.0, 245 / 255.0, 1.0, 0.4), 0.8, true)
	for j in XRAY_JOINTS:
		_ci.draw_circle(Vector2(j[0], j[1]), j[2], Color(215 / 255.0, 245 / 255.0, 1.0, 0.55), true, -1.0, true)
	_ci.draw_set_transform_matrix(Transform2D.IDENTITY)
	var pad: Rect2 = _xr_box(b).pad
	_tile(_xr_inner(pad), _stripes("scan", Vector2(0, -1), 3.0, 0.0, 1.0, Color(150 / 255.0, 225 / 255.0, 1.0, 0.07)), Vector2(pad.position.x, pad.end.y), _k)
