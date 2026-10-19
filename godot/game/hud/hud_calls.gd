## The big calls in the middle of the screen (hud.ts count, callout, startCount/updateCount, finish,
## finisher): the countdown and FIGHT!, the callouts, the referee's count under the clock, the
## end-of-fight word and the finisher's banner, moving as style.css animates them.
## Drawn in layers, bottom to top as the web's DOM stacks them; each glow (CSS text-shadow blur)
## is a layer of its own, a soft halo read from the glyphs' distance field.
class_name HudCalls
extends HudPart

## How long the end-of-fight word waits after the knockout, in match time (hud.ts FINISH_DELAY).
const FINISH_DELAY := 0.9
## The finishing word, in the pieces that slam in one by one (hud.ts FINISH_WORD).
const FINISH_WORD := {"KO": ["K.", "O."], "TKO": ["T.", "K.", "O."], "Dismantled": ["DIS", "MAN", "TLED"]}
## What was lost, for the subtitle (hud.ts LOSS_TEXT).
const LOSS_TEXT := {"head": "Head torn off", "leg": "Both legs torn off", "arms": "Both arms torn off"}
## tan(-8deg): the callout's skewX (style.css @keyframes callout).
const SKEW_CALLOUT := -0.14054
## The glow faces' distance field: glyphs this many px tall, the field this wide (half of it either
## side of the edge; a glyph's quad runs the full width further out, so the wide field, for the
## callouts' broad blur, is only used there). The wide field stops at 0.75em out: the callouts'
## halo is down to a few percent there, and a wider one made each glyph's quad (and its texture)
## so big that a callout's glow covered much of the screen in overlapping quads.
const GLOW_MSDF := 32
const GLOW_RANGE := 32
const GLOW_RANGE_WIDE := 48
## A CSS text-shadow blur: the glyphs' true distance field (the face's alpha channel) turned into
## a Gaussian falloff past their edge, sigma in font sizes. Colour from the draw.
const GLOW_SHADER := """shader_type canvas_item;
uniform float sigma = 0.2;
uniform float reach = 2.5;
varying vec4 vcol;
void vertex() {
	vcol = COLOR;
}
void fragment() {
	float d = (0.5 - texture(TEXTURE, UV).a) * reach;
	// (faded out before the field runs out, where the glyph's quad still goes on)
	float edge = 1.0 - smoothstep(0.35 * reach, 0.49 * reach, d);
	// (a blur wider than the strokes spreads them thinner: erf of the stroke, 0.17em, over the blur)
	float thin = tanh(1.2025 * 0.17 / (1.414 * max(sigma, 0.001)));
	COLOR = vec4(vcol.rgb, vcol.a * edge * thin * (0.5 - 0.5 * tanh(0.85 * d / max(sigma, 0.001))));
}
"""
## The word pieces' face: a top-to-bottom gradient of up to five stops (background-clip: text) on
## what's drawn in pure white; everything else (the piece's dark depth) as drawn.
const FACE_SHADER := """shader_type canvas_item;
uniform vec4 c0 : source_color = vec4(1.0);
uniform vec4 c1 : source_color = vec4(1.0);
uniform vec4 c2 : source_color = vec4(1.0);
uniform vec4 c3 : source_color = vec4(1.0);
uniform vec4 c4 : source_color = vec4(1.0);
uniform vec4 at = vec4(0.25, 0.5, 0.75, 1.0);
uniform float y0 = 0.0;
uniform float height = 100.0;
varying float ly;
varying float face;
void vertex() {
	ly = VERTEX.y;
	face = step(2.99, COLOR.r + COLOR.g + COLOR.b);
}
void fragment() {
	if (face > 0.5) {
		float k = clamp((ly - y0) / max(height, 1.0), 0.0, 1.0);
		vec3 c = mix(c0.rgb, c1.rgb, clamp(k / max(at.x, 1e-4), 0.0, 1.0));
		c = mix(c, c2.rgb, clamp((k - at.x) / max(at.y - at.x, 1e-4), 0.0, 1.0));
		c = mix(c, c3.rgb, clamp((k - at.y) / max(at.z - at.y, 1e-4), 0.0, 1.0));
		c = mix(c, c4.rgb, clamp((k - at.z) / max(at.w - at.z, 1e-4), 0.0, 1.0));
		COLOR.rgb = c;
	}
}
"""
## The layers, bottom to top, each redrawn while its group shows and moves (see _redraw).
const GROUPS := {
	"callout": ["callout_glow", "callout"],
	"count": ["count_back", "count_glow", "count"],
	"finish": ["finish_back", "sub"],
	"finban": ["fb_back", "fb_glow", "fb"],
	"ref": ["ref_back", "ref_glow", "ref"],
	"tap": ["tap"],
}

## The scene on its own (Game.auto) offers a tap for the next fight once this one is over.
var can_restart := false
## A callout is showing (for the shot test).
var callout_on := false
## The referee's count: "down" while counting, "up" once the bot beats it, "" otherwise.
var ref_state := ""
## The count's number while it's on (0 before the first), else -1, and whose count it is (the
## referee drone counts along: render/referee/referee.gd).
var ref_n: int:
	get:
		return _ref_n if _ref_live else -1
var ref_side: int:
	get:
		return _ref_i

static var _shaders := {}
static var _fonts := {}
static var _vig_tex: GradientTexture2D
static var _flash_tex: GradientTexture2D

var _layer := {}
var _shown := {}
var _moving := {}
## The end-of-fight word's pieces: each a canvas group holding its three layers (glow, soft
## shadow, the piece), faded as one (CSS opacity on the span) while it fades in or out: its layers
## are composited off screen, then faded together, so the glow doesn't show through the face.
## Once a piece is fully in, its group is switched off and the layers draw plainly (the same
## picture at full opacity), as a canvas group costs a copy of the whole screen every frame on a
## phone's tiled GPU, and the word stays up for seconds.
var _spans: Array[CanvasGroup] = []
var _span_group: Array[bool] = [true, true, true]
## Each piece's clip: what the canvas group showed of its layers (their rect and its 10 px fit
## margin, CanvasGroup's default), kept when the group is off, so the piece looks the same either
## way. A scissor, which costs nothing like a group's copy of the screen.
var _span_clip: Array[Control] = []
var _span_ctl: Array[Control] = []
var _span_px := 100
var _span_mat: Array[ShaderMaterial] = []
## What the pieces were last drawn for ("" before): their layers only draw again when it changes
## (they're moved, scaled and faded as nodes), and the pieces' widths for it.
var _span_key := ""
var _span_w: Array[float] = []
## The room round each piece's layers, in font sizes. At 0 the layers are the piece's own box, and
## the group (and the clip after it) cuts off what reaches past it and its margin: the tops of
## the K and the O, the soft shadow's lower edge and much of the glow, as the word has always
## looked here. At 0.6 the glow, the shadow and the glyphs' overshoot all fit inside: the word as
## the web draws it.
const SPAN_PAD := 0.0
## CanvasGroup's fit margin round its layers (render target pixels).
const SPAN_FIT := 10.0
# faces: the loud one italic and upright (distance field, sharp at any scale), their glow twins,
# the upright one for small print, and the body face
var _fi: Font
var _fu: Font
var _gi: Font
var _gu: Font
var _gw: Font
var _bu: Font
var _b7: Font

# what's copied from the match (capture / on_event, sim idle)
var _time := 0.0
var _phase := ""
var _pt := 0.0
var _side: Array[Color] = [HudKit.CYAN, HudKit.ORANGE]
var _fstate: Array[String] = ["", ""]
var _ffail: Array[bool] = [false, false]
var _kd_seen: Array[int] = [0, 0]
var _last_count := -1
var _last_callout_at := 0.0
## The finisher that ended it, for the subtitle (hud.ts finBy): [side, move name] or [].
var _fin_by := []
## The knockout waiting out FINISH_DELAY (hud.ts pendingFinish): {kind, side, name, reason} or {}.
var _pending := {}
var _finishing := false

# the countdown (hud.ts count): seconds since it started, its text, and FIGHT!
var _ct := -1.0
var _ctext := ""
var _cfight := false
# the callout (hud.ts callout)
var _co_t := -1.0
var _co_text := ""
var _co_dur := 1.1
var _co_small := false
var _co_kind := ""
# the referee's count (hud.ts ref, refEl)
var _ref_live := false
var _ref_on := false
var _ref_vis := 0.0
var _ref_i := 0
var _ref_at := 0.0
var _ref_up_at := 0.0
var _ref_n := 0
var _ref_up := false
var _ref_num := ""
var _ref_name := ""
var _ref_txt := "is down"
var _ref_kd := 0
var _ref_last := false
var _ref_pop := 9.0
var _ref_warn := 0.0
var _tick_on := PackedFloat32Array()
# the end-of-fight word (hud.ts finish)
var _fin_t := -1.0
var _out_t := -1.0
var _fin_kind := "KO"
var _fin_sub := ""
var _fin_word: Array[String] = []
var _fin_i := 0
var _st := {}
# the finisher's banner (hud.ts finisher)
var _fb_t := -1.0
var _fb_move := ""
var _fb_bot := ""
var _fb_i := 0
## What the band says and how it plays: the small line over the word and its icon, the colour, how
## long it stays (s) and whether the screen's edges glow with it. The finisher's, or a tag team's
## moment (a tag, a hot tag, an elimination, a double team) on the same band.
var _fb_label := "FINISHER"
var _fb_icon := "bolt"
var _fb_col := HudKit.CYAN
var _fb_dur := 2.8
var _fb_edge := true
## A tag team match: each side's two bots' names, for the end-of-fight word (side -> "A & B").
var _teams: Array[String] = []
# the tap for the next fight fading in
var _tap_t := 0.0

var _e_callout := func(x: float) -> float: return HudKit.bezier(x, 0.2, 1.4, 0.4, 1.0)
var _e_num := func(x: float) -> float: return HudKit.bezier(x, 0.2, 1.3, 0.4, 1.0)
var _e_slam := func(x: float) -> float: return HudKit.bezier(x, 0.3, 0.0, 0.4, 1.0)
var _e_ease_css := func(x: float) -> float: return HudKit.ease_css(x)
var _e_ease_out := func(x: float) -> float: return HudKit.ease_out(x)
var _ring_pts := PackedVector2Array()
var _ring_cols := PackedColorArray()
var _ring_idx := PackedInt32Array()
var _unit := PackedVector2Array()


func _init() -> void:
	super()
	_add("callout_glow", _draw_callout.bind(true), _glow_mat())
	_add("callout", _draw_callout.bind(false))
	_add("count_back", _draw_count_back)
	_add("count_glow", _draw_count_num.bind(true), _glow_mat())
	_add("count", _draw_count_num.bind(false))
	_add("finish_back", _draw_finish_back)
	for k in 3:
		# each piece, faded as one (CSS opacity on the span): its glow, its soft drop shadow, then
		# the piece (hard edge, depth, face)
		var grp := CanvasGroup.new()
		grp.visible = false
		add_child(grp)
		var clip := Control.new()
		clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		clip.clip_contents = true
		grp.add_child(clip)
		_span_clip.append(clip)
		var mat := ShaderMaterial.new()
		mat.shader = _shader(FACE_SHADER)
		var mats: Array[Material] = [_glow_mat(), _glow_mat(), mat]
		for j in 3:
			var c := Control.new()
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
			c.material = mats[j]
			var fn := _draw_span.bind(k, j)
			c.draw.connect(func() -> void: fn.call(c))
			clip.add_child(c)
			_span_ctl.append(c)
		_spans.append(grp)
		_span_mat.append(mat)
	_add("sub", _draw_sub)
	_add("fb_back", _draw_finban_back)
	_add("fb_glow", _draw_finban_move.bind(true), _glow_mat())
	_add("fb", _draw_finban_move.bind(false))
	_add("ref_back", _draw_ref_back)
	_add("ref_glow", _draw_ref_num.bind(true), _glow_mat())
	_add("ref", _draw_ref_front)
	_add("tap", _draw_restart)
	_tick_on.resize(10)
	var seg := 72
	for k in seg + 1:
		var a := TAU * k / seg
		_unit.append(Vector2(cos(a), sin(a)))
	for k in seg:
		var i := k * 2
		_ring_idx.append_array([i, i + 1, i + 2, i + 1, i + 3, i + 2])
	_ring_pts.resize(seg * 2 + 2)
	_ring_cols.resize(seg * 2 + 2)


## A layer: a full-screen control drawn by `fn(control)`, with an optional material.
func _add(key: String, fn: Callable, mat: Material = null) -> Control:
	var c := Control.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.material = mat
	c.draw.connect(func() -> void: fn.call(c))
	add_child(c)
	_layer[key] = c
	return c


static func _shader(code: String) -> Shader:
	if not _shaders.has(code):
		var s := Shader.new()
		s.code = code
		_shaders[code] = s
	return _shaders[code]


func _glow_mat() -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = _shader(GLOW_SHADER)
	return mat


## style.css --broadcast (HudKit.broadcast's face) as a distance field font, so it stays sharp as
## it scales: italic or upright, for faces (`glow` 0) or the halos (1, or 2 reaching further).
## Made once for the app's run (with their glyphs: warm_fonts).
static func _loud(italic: bool, glow: int) -> Font:
	var key := "%s%s" % [italic, glow]
	if _fonts.has(key):
		return _fonts[key]
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "Roboto", "sans-serif"])
	f.font_weight = 800
	f.font_italic = italic
	f.multichannel_signed_distance_field = true
	f.msdf_size = GLOW_MSDF if glow > 0 else 48
	f.msdf_pixel_range = [16, GLOW_RANGE, GLOW_RANGE_WIDE][glow]
	var out: Font = f
	# (where the system has no italic of the face, slant it as a browser does: MenuKit.broadcast)
	if italic and f.get_font_style() & TextServer.FONT_ITALIC == 0:
		var v := FontVariation.new()
		v.base_font = f
		v.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
		out = v
	_fonts[key] = out
	return out


## style.css --broadcast upright, for small print (the subtitle, the finisher's banner).
static func _small() -> Font:
	if not _fonts.has("small"):
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "Roboto", "sans-serif"])
		f.font_weight = 800
		f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
		_fonts["small"] = f
	return _fonts["small"]


## The characters the loud faces ever draw (every call is in capitals: the callouts, the count,
## the word's pieces, a move's name), and those the small print and the intro may.
const LOUD_CHARS := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,:;'&+-/#%()"
const ALL_CHARS := " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00b7\u2026\u266a"


## Make every glyph the fight's calls and its intro draw, once, before the first fight: a face's
## glyphs are only made the first time each is drawn, on this thread, and the distance-field faces
## take a while over each (the first countdown, the first K.O. and the first intro each stalled a
## frame for it). The faces are kept for the app's run, so this is done once. The glyphs are drawn
## onto a canvas item that's on no canvas (never shown) at the sizes this screen will draw them,
## with its oversampling, so they land in the same caches the HUD then draws from. It takes a
## moment (the distance fields): call it behind the loading screen.
static func warm_fonts() -> void:
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null or tree.root == null:
		return
	var root := tree.root
	var view := root.get_visible_rect().size
	var os := root.get_oversampling()
	var em := HudKit.em_for(view)
	var vh := view.y / 100.0
	var vw := view.x / 100.0
	# [font, size, outline, characters]
	var list := []
	# (a distance field face is made at its own size whatever size it's drawn at)
	for f in [_loud(true, 0), _loud(false, 0), _loud(true, 1), _loud(false, 1), _loud(true, 2)]:
		list.append([f, 48, 0, LOUD_CHARS])
	# the subtitle, the band's small line and its bot (_draw_sub, _finban_geom)
	for px in [roundi(em * 1.15), roundi(minf(2.4 * vh, 3.4 * vw)), roundi(minf(2.0 * vh, 3.0 * vw))]:
		list.append([_small(), px, 0, ALL_CHARS])
	# the referee's pill and pips, and the tap for the next fight (_ref_geom, _draw_restart)
	for px in [roundi(0.85 * em), roundi(0.72 * em), roundi(em)]:
		list.append([HudKit.body(700), px, 0, ALL_CHARS])
	for f in FightHud.IntroView.faces(view):
		list.append([f[0], f[1], f[2], ALL_CHARS])
	var ci := RenderingServer.canvas_item_create()
	for w in list:
		var font: Font = w[0]
		var px: int = w[1]
		var outline: int = w[2]
		if outline > 0:
			font.draw_string_outline(ci, Vector2.ZERO, w[3], HORIZONTAL_ALIGNMENT_LEFT, -1, px, outline, Color.WHITE, 3, TextServer.DIRECTION_AUTO, TextServer.ORIENTATION_HORIZONTAL, os)
		else:
			font.draw_string(ci, Vector2.ZERO, w[3], HORIZONTAL_ALIGNMENT_LEFT, -1, px, Color.WHITE, 3, TextServer.DIRECTION_AUTO, TextServer.ORIENTATION_HORIZONTAL, os)
	RenderingServer.free_rid(ci)


## A radial gradient texture (offsets 0..1 out to the edge, colours), clamped past its edge.
static func _radial(offsets: PackedFloat32Array, colors: PackedColorArray) -> GradientTexture2D:
	var g := Gradient.new()
	g.offsets = offsets
	g.colors = colors
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 256
	t.height = 256
	return t


static func _rgba(r: float, g: float, b: float, a := 1.0) -> Color:
	return Color(r / 255.0, g / 255.0, b / 255.0, a)


func start(m_) -> void:
	_fi = _loud(true, 0)
	_fu = _loud(false, 0)
	_gi = _loud(true, 1)
	_gu = _loud(false, 1)
	_gw = _loud(true, 2)
	_bu = _small()
	_b7 = HudKit.body(700)
	if _vig_tex == null:
		# .fx-vig: radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,.45))
		_vig_tex = _radial(PackedFloat32Array([0.0, 0.35, 1.0]), PackedColorArray([Color(0, 0, 0, 0), Color(0, 0, 0, 0), Color(0, 0, 0, 0.45)]))
		# .fx-flash: radial-gradient(circle at 50% 45%, warm white, orange 38%, clear red 72%)
		_flash_tex = _radial(PackedFloat32Array([0.0, 0.38, 0.72, 1.0]), PackedColorArray([_rgba(255, 244, 228, 0.95), _rgba(255, 110, 60, 0.4), _rgba(255, 60, 60, 0.0), _rgba(255, 60, 60, 0.0)]))
	for i in 2:
		# (the bars' colour: --bot0 / --bot1)
		_side[i] = HudKit.bar_colors(m_.specs[i].paint)[0]
		_kd_seen[i] = int(m_.fighters[i].knockdowns)
	_teams.clear()
	if m_.get("tag") != null:
		for i in 2:
			_teams.append("%s & %s" % [str(m_.specs[i].name_), str(m_.tag.partnerOf(float(i)).spec.name_)])
	_last_count = -1
	_last_callout_at = 0.0
	_fin_by = []
	_pending = {}
	_finishing = false
	stop()
	capture(m_)


func stop() -> void:
	_ct = -1.0
	_co_t = -1.0
	_fin_t = -1.0
	_out_t = -1.0
	_fb_t = -1.0
	_ref_live = false
	_ref_on = false
	_ref_vis = 0.0
	_tap_t = 0.0
	ref_state = ""
	callout_on = false
	for k in _spans.size():
		_spans[k].visible = false
		_set_group(k, false)
	_span_key = ""
	for c in _layer.values():
		(c as Control).queue_redraw()


## A tag: side `i`'s colour and knockdowns are the new bot's.
func swap(i: int, m_) -> void:
	_side[i] = HudKit.bar_colors(m_.specs[i].paint)[0]
	_kd_seen[i] = int(m_.fighters[i].knockdowns)
	if _ref_live and _ref_i == i:
		_end_count()


## hud.ts update's share: the countdown by the clock, the referee's count, and the end-of-fight
## word once FINISH_DELAY has run, cleared when the fight's over.
func capture(m_) -> void:
	_time = float(m_.time)
	_phase = str(m_.phase)
	_pt = float(m_.phaseTime)
	for i in 2:
		var f = m_.fighters[i]
		_fstate[i] = str(f.state)
		_ffail[i] = float(f.getupFail) != 0.0
	if _phase == "countdown":
		var n := int(TMatch.COUNTDOWN) - floori(_pt)
		if n != _last_count and n >= 1:
			_last_count = n
			_count(str(n), false)
	_update_count()
	if not _pending.is_empty() and (_phase != "ko" or _pt >= FINISH_DELAY):
		var pf := _pending
		_pending = {}
		if _phase == "ko":
			_finish(pf)
	if _finishing and _phase == "end":
		_finishing = false
		_out_t = 0.0
		hud.finished = false


## hud.ts onEvent's calls.
func on_event(type: String, d) -> void:
	match type:
		"fightStart":
			_count("FIGHT!", true)
		"finisher":
			_finisher(d)
		"hit":
			# a finisher plays without numbers: just the moves
			if d.get("finisher", false) or d.shielded:
				return
			var dmg := roundi(float(d.damage))
			if d.blocked:
				if d.guardBreak:
					_callout("GUARD BREAK", "small cyan")
				return
			if d.knockdown:
				return
			if d.counter and dmg >= 30:
				_callout("COUNTER!", "small")
			elif d.crit:
				_callout("CRITICAL", "small")
		"knockdown":
			var f = d.defender
			# the finishing blow also reports a knockdown, after 'ko': the finisher covers it
			if str(m.phase) != "fight" or str(f.state) == "ko":
				return
			var i := int(f.index)
			if int(f.knockdowns) <= _kd_seen[i]:
				# a leg torn off puts it down too: the RIPPED OFF callout already says why
				if float(d.tore) >= 0.0:
					return
				# a sweep, a shove or a takedown doesn't count toward the TKO
				var mv = d.move
				var what := "TAKEDOWN!" if str(mv.kind) == "grab" else ("SHOVED DOWN!" if str(mv.get("path")) == "push" else "SWEPT!")
				_callout(what, "small cyan", 900)
				return
			_kd_seen[i] = int(f.knockdowns)
			_callout("KNOCKDOWN!", "red")
			_start_count(f)
		"stagger":
			_callout("STAGGERED", "small")
		"dodge":
			if float(m.time) - _last_callout_at > 1.2:
				_callout("DODGE", "small cyan", 700)
		"clinch":
			if float(m.time) - _last_callout_at > 1.2:
				_callout("PINNED ON THE ROPES" if d.get("pinned", false) else "CLINCH", "small", 800)
		"sprawl":
			_callout("SPRAWL!", "small cyan", 800)
		"detach":
			var p := int(d.part)
			var what := "HEAD" if p == 0 else ("ARM" if p == 3 or p == 6 else ("FOREARM" if p == 4 or p == 7 else "LEG"))
			_callout("%s RIPPED OFF!" % what, "red", 1500)
		"ko":
			_end_count()
			if str(d.kind) != "Dismantled":
				_co_t = -1.0
			var w = d.winner
			var who := str(w.name_)
			# (a tag team wins together)
			var team := int(w.index) < _teams.size()
			if team:
				who = _teams[int(w.index)]
			_pending = {"kind": str(d.kind), "side": int(w.index), "name": who, "reason": d.reason, "team": team}
		"tagCall":
			if float(m.time) - _last_callout_at > 1.2:
				_callout("GOING FOR THE TAG!", "small cyan", 1000)
		"tag":
			var side := int(d.side)
			var col := HudKit.bar_colors(m.specs[side].paint)[0]
			if d.get("elim", false):
				# after an elimination the partner storms in
				_band(side, "HOT TAG", "swords", str(d.to.name_).to_upper(), "STORMS THE RING", col, 2.2, true)
			else:
				_band(side, "TAG TEAM", "refresh", "TAG!", "%s IS IN" % str(d.to.name_).to_upper(), col, 2.0, false)
		"eliminated":
			# knocked out of the match, not the end of it: the count stops, the band says who's out
			_end_count()
			_co_t = -1.0
			_band(int(d.winner.index), "OUT OF THE MATCH", "close", "ELIMINATED", "%s IS OUT" % str(d.loser.name_).to_upper(), _rgba(255, 63, 94), 3.0, true)
		"tagResume":
			_callout("FIGHT ON!", "", 1100)
		"decision":
			_end_count()
			_callout("TIME!", "", 1800)


## hud.ts callout: restarts the callout with its class and length.
func _callout(text: String, cls := "", ms := 1100) -> void:
	_co_text = text
	_co_small = cls.contains("small")
	_co_kind = "red" if cls.contains("red") else ("cyan" if cls.contains("cyan") else "")
	_co_dur = ms / 1000.0
	_co_t = 0.0
	_last_callout_at = float(m.time) if m != null else 0.0


## hud.ts count: a countdown number or FIGHT! slams in over a ring that bursts outward.
func _count(text: String, fight: bool) -> void:
	_ctext = text
	_cfight = fight
	_ct = 0.0


## hud.ts startCount.
func _start_count(f) -> void:
	_ref_live = true
	_ref_on = true
	_ref_i = int(f.index)
	_ref_at = float(m.time)
	_ref_up_at = 0.0
	_ref_n = 0
	_ref_up = false
	_ref_num = ""
	_ref_name = str(f.name_)
	_ref_txt = "is down"
	_ref_kd = int(f.knockdowns)
	_ref_last = _ref_kd >= 2
	_ref_warn = 0.0
	_tick_on.fill(-1.0)
	ref_state = "down"


## hud.ts updateCount: one a second from 0.35 s down, until the bot's up or out.
func _update_count() -> void:
	if not _ref_live:
		return
	if _ref_up_at > 0.0:
		if _time - _ref_up_at > 1.0:
			_end_count()
		return
	var st := _fstate[_ref_i]
	# a try that gives out is still on the canvas: the count goes on
	if st == "down" or (st == "getup" and _ffail[_ref_i]):
		var t := _time - _ref_at
		var n := 0 if t < 0.35 else mini(10, 1 + floori(t - 0.35))
		if n > _ref_n:
			_ref_n = n
			_ref_num = str(n)
			_ref_pop = 0.0
			for k in n:
				if _tick_on[k] < 0.0:
					_tick_on[k] = 0.0
			_sfx("tap")
	elif st == "getup" or st == "fight" or st == "ready":
		_ref_up_at = _time
		_ref_up = true
		_ref_num = "UP"
		_ref_pop = 0.0
		_ref_txt = "beats the count"
		ref_state = "up"
	else:
		_end_count()


## hud.ts endCount: the count fades away.
func _end_count() -> void:
	_ref_live = false
	_ref_on = false
	ref_state = ""


## hud.ts finish: the big end-of-fight word, then it docks as a small title at the top.
func _finish(pf: Dictionary) -> void:
	var kind: String = pf.kind
	_co_t = -1.0
	_fin_kind = kind
	_fin_i = pf.side
	var who: String = pf.name
	var wins := "win" if pf.get("team", false) else "wins"
	var fin := ""
	if not _fin_by.is_empty() and _fin_by[0] == _fin_i:
		fin = _fin_by[1]
	if fin != "" and kind != "TKO":
		_fin_sub = "%s finishes it · %s" % [who, fin]
	elif kind == "KO":
		_fin_sub = "%s %s by knockout" % [who, wins]
	elif kind == "Dismantled":
		var r = pf.reason
		_fin_sub = "%s · %s %s" % [LOSS_TEXT.get(str(r), "Torn apart") if r != null else "Torn apart", who, wins]
	else:
		_fin_sub = "Technical knockout · %s %s" % [who, wins]
	_fin_sub = _fin_sub.to_upper()
	_st = _kind_style(kind)
	_fin_word.assign(FINISH_WORD.get(kind, ["K.", "O."]))
	for k in 3:
		if k < _fin_word.size():
			var mat := _span_mat[k]
			var cs: Array = _st.face
			var at: Array = _st.face_at
			for c in 5:
				mat.set_shader_parameter("c%d" % c, cs[mini(c, cs.size() - 1)])
			mat.set_shader_parameter("at", Vector4(at[0], at[1], at[2], at[3]))
	_fin_t = 0.0
	_out_t = -1.0
	_finishing = true
	hud.finished = true


## style.css .finish, .finish.tko, .finish.dsm.
func _kind_style(kind: String) -> Dictionary:
	if kind == "TKO":
		return {
			"big": [0.19, 0.13], "dock": 0.52, "dock_at": 0.9, "band_h": 0.17, "fx": false,
			"band": [_rgba(90, 50, 0, 0), _rgba(110, 62, 6, 0.7), _rgba(140, 82, 10, 0.8), _rgba(110, 62, 6, 0.7), _rgba(90, 50, 0, 0)],
			"band_at": [0.0, 0.2, 0.5, 0.8, 1.0], "edge": _rgba(255, 210, 140, 0.45),
			"depth": _rgba(0x4a, 0x2a, 0x02), "hard": _rgba(0x2a, 0x16, 0x01), "soft": 0.5,
			"glow": _rgba(255, 180, 58, 0.45), "glow_r": 0.35,
			"face": [Color.WHITE, _rgba(0xff, 0xf6, 0xe0), _rgba(0xff, 0xd2, 0x7a), _rgba(0xff, 0xa6, 0x30)],
			"face_at": [0.4, 0.62, 1.0, 1.0], "sub_at": 0.45,
		}
	if kind == "Dismantled":
		return {
			"big": [0.17, 0.11], "dock": 0.5, "dock_at": 1.1, "band_h": 0.19, "fx": true,
			"band": [_rgba(20, 26, 36, 0), _rgba(30, 38, 52, 0.75), _rgba(44, 54, 72, 0.85), _rgba(30, 38, 52, 0.75), _rgba(20, 26, 36, 0)],
			"band_at": [0.0, 0.18, 0.5, 0.82, 1.0], "edge": _rgba(255, 160, 80, 0.7),
			"depth": _rgba(0x1a, 0x22, 0x2e), "hard": _rgba(0x0b, 0x0f, 0x15), "soft": 0.55,
			"glow": _rgba(255, 140, 50, 0.55), "glow_r": 0.4,
			"face": [Color.WHITE, _rgba(0xe8, 0xf2, 0xff), _rgba(0x9f, 0xb4, 0xcc), _rgba(0xff, 0x9a, 0x3a), _rgba(0xff, 0x4a, 0x1a)],
			"face_at": [0.34, 0.52, 0.74, 1.0], "sub_at": 0.75,
		}
	return {
		"big": [0.3, 0.2], "dock": 0.34, "dock_at": 1.1, "band_h": 0.26, "fx": true,
		"band": [_rgba(120, 6, 28, 0), _rgba(150, 10, 34, 0.62), _rgba(196, 20, 44, 0.72), _rgba(150, 10, 34, 0.62), _rgba(120, 6, 28, 0)],
		"band_at": [0.0, 0.18, 0.5, 0.82, 1.0], "edge": _rgba(255, 170, 120, 0.55),
		"depth": _rgba(0x4a, 0x06, 0x12), "hard": _rgba(0x2a, 0x03, 0x0a), "soft": 0.55,
		"glow": _rgba(255, 63, 94, 0.55), "glow_r": 0.4,
		"face": [Color.WHITE, _rgba(0xff, 0xf4, 0xdc), _rgba(0xff, 0xc0, 0x4a), _rgba(0xff, 0x6a, 0x2a), _rgba(0xff, 0x2d, 0x55)],
		"face_at": [0.36, 0.52, 0.76, 1.0], "sub_at": 0.75,
	}


## hud.ts finisher: the finisher's name sweeps in low across the screen in its colours.
func _finisher(d) -> void:
	var f = d.f
	var partner = d.get("partner")
	if partner != null:
		# a tag team's double team: the partner holds, the legal bot finishes
		_band(int(f.index), "DOUBLE TEAM", "swords", str(d.name_).to_upper(), "%s + %s" % [str(f.name_).to_upper(), str(partner.name_).to_upper()], _side[int(f.index)], 2.8, true)
	else:
		_band(int(f.index), "FINISHER", "bolt", str(d.name_).to_upper(), str(f.name_).to_upper(), _side[int(f.index)], 2.8, true)
	_fin_by = [_fb_i, str(d.name_)]
	_sfx("start")


## The band across the screen (the finisher's, and a tag team's moments on it): in from side
## `i`'s edge with the small `label` (and `icon`) over `word` and `sub` under it, in `col`, for `dur`
## seconds; `edge` makes the screen's edges glow with it. A new one takes over from the last.
func _band(i: int, label: String, icon: String, word: String, sub: String, col: Color, dur: float, edge: bool) -> void:
	_fb_i = i
	_fb_label = label
	_fb_icon = icon
	_fb_move = word
	_fb_bot = sub
	_fb_col = col
	_fb_dur = dur
	_fb_edge = edge
	_fb_t = 0.0
	_co_t = -1.0


func _sfx(kind: String) -> void:
	if hud != null and hud.game != null and "sfx" in hud.game and hud.game.sfx != null:
		hud.game.sfx.ui(kind)


func tick(dt: float) -> void:
	if _ct >= 0.0:
		_ct += dt
		if _ct > (1.4 if _cfight else 0.95):
			_ct = -1.0
	if _co_t >= 0.0:
		_co_t += dt
		if _co_t > _co_dur:
			_co_t = -1.0
	callout_on = _co_t >= 0.0 and not hud.finished
	# .refcount: opacity and scale ease over 0.25 s each way
	var ref_moving := _ref_vis != (1.0 if _ref_on else 0.0)
	_ref_vis = move_toward(_ref_vis, 1.0 if _ref_on else 0.0, dt / 0.25)
	if _ref_vis > 0.0:
		_ref_pop += dt
		_ref_warn += dt
		for k in 10:
			if _tick_on[k] >= 0.0:
				_tick_on[k] += dt
	if _fin_t >= 0.0:
		_fin_t += dt
		if _out_t >= 0.0:
			_out_t += dt
			if _out_t > 0.5:
				_fin_t = -1.0
	if _fb_t >= 0.0:
		_fb_t += dt
		if _fb_t > _fb_dur:
			_fb_t = -1.0
	var tap := can_restart and (_phase == "ko" or _phase == "end")
	_tap_t = _tap_t + dt if tap else 0.0
	# (the line is drawn once and pulses by its node's opacity)
	if tap:
		(_layer.tap as Control).modulate.a = clampf(_tap_t / 0.4, 0.0, 1.0) * (0.75 + 0.2 * sin(_tap_t * 3.0))
	_place_spans()
	_redraw("callout", _co_t >= 0.0)
	_redraw("count", _ct >= 0.0)
	_redraw("finish", _fin_t >= 0.0, _fin_t < _fin_settle() or _out_t >= 0.0)
	_redraw("finban", _fb_t >= 0.0)
	_redraw("ref", _ref_vis > 0.0 or ref_moving, ref_moving or _ref_animating())
	_redraw("tap", tap, false)


## Redraw a group's layers when what they show changes: as it comes on, every frame while it
## `moving`, once more as it stops (to draw where it settled), and once as it goes (to clear what
## it drew). A group that holds still (the docked title, the referee's count between numbers)
## draws nothing; a resize redraws every layer anyway.
func _redraw(group: String, on: bool, moving := true) -> void:
	var was_on: bool = _shown.get(group, true)
	var was_moving: bool = _moving.get(group, true)
	if (on and (moving or was_moving or not was_on)) or (not on and was_on):
		for key in GROUPS[group]:
			(_layer[key] as Control).queue_redraw()
	_shown[group] = on
	_moving[group] = moving


## When the end-of-fight word's back layers and pill have settled (docked, the flash and rings
## gone), in seconds since it came up: after that they hold still until the word fades out.
func _fin_settle() -> float:
	if _st.is_empty():
		return 0.0
	var t := maxf(float(_st.dock_at) + 0.5, float(_st.sub_at) + 0.45)
	if _st.fx:
		# (the second ring's burst)
		t = maxf(t, 0.42 + 0.75)
	return t


## The referee's count is mid-animation: its number popping in, a tick lighting, or the last
## knockdown's pip blinking.
func _ref_animating() -> bool:
	if _ref_pop < 0.35 or _ref_last:
		return true
	for k in 10:
		if _tick_on[k] >= 0.0 and _tick_on[k] < 0.2:
			return true
	return false


func _kf(t: float, dur: float, stops: Array, easing = null) -> float:
	return float(HudKit.keyframes(t, dur, stops, easing))


# ------------------------------------------------------------------ drawing helpers

## Text with CSS letter-spacing `sp` after every glyph, left at its baseline `at`.
func _str(ci: CanvasItem, font: Font, at: Vector2, s: String, px: int, col: Color, sp := 0.0) -> void:
	if col.a <= 0.002:
		return
	if sp == 0.0:
		ci.draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)
		return
	var x := at.x
	for k in s.length():
		ci.draw_char(font, Vector2(x, at.y), s[k], px, col)
		x += font.get_char_size(s.unicode_at(k), px).x + sp


## The advance of `s` with letter-spacing `sp` after every glyph (as a CSS box measures it).
func _sw(font: Font, s: String, px: int, sp := 0.0) -> float:
	if sp == 0.0:
		return font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x
	var w := 0.0
	for k in s.length():
		w += font.get_char_size(s.unicode_at(k), px).x + sp
	return w


## `s` cut to `room` wide with an ellipsis (text-overflow: ellipsis).
func _fit(font: Font, s: String, px: int, sp: float, room: float) -> String:
	if _sw(font, s, px, sp) <= room:
		return s
	var n := s.length()
	while n > 1 and _sw(font, s.left(n) + "…", px, sp) > room:
		n -= 1
	return s.left(n) + "…"


## CSS text-shadow 0 0 `blur` `col` on a glow layer: the glow face drawn with the layer's blur
## (sigma = blur / 2, in font sizes).
func _glow(ci: CanvasItem, font: Font, at: Vector2, s: String, px: int, col: Color, blur: float, sp := 0.0) -> void:
	var mat := ci.material as ShaderMaterial
	mat.set_shader_parameter("sigma", blur * 0.5 / maxf(1.0, px))
	mat.set_shader_parameter("reach", float(GLOW_RANGE_WIDE if font == _gw else GLOW_RANGE) / GLOW_MSDF)
	_str(ci, font, at, s, px, col, sp)


## The baseline offset that centres a line box of line-height 1 on y = 0 (the glyphs sit by the
## font's ascent and descent, as a browser lays out the line).
static func _mid(font: Font, px: int) -> float:
	return (font.get_ascent(px) - font.get_descent(px)) * 0.5


## CSS px (the web's sizes at its 16px em) in this HUD's units.
func _px(v: float) -> float:
	return v * em() / 16.0


## A ring from radius r0 to r1, its colour easing from c0 to c1 across.
func _annulus(ci: CanvasItem, c: Vector2, r0: float, r1: float, c0: Color, c1: Color) -> void:
	if c0.a <= 0.003 and c1.a <= 0.003:
		return
	var n := _unit.size()
	for k in n:
		_ring_pts[k * 2] = c + _unit[k] * r0
		_ring_pts[k * 2 + 1] = c + _unit[k] * r1
		_ring_cols[k * 2] = c0
		_ring_cols[k * 2 + 1] = c1
	RenderingServer.canvas_item_add_triangle_array(ci.get_canvas_item(), _ring_idx, _ring_pts, _ring_cols)


## CSS box-shadow 0 0 `blur` round a circle of radius `r` (outward), or inset (inward).
func _soft_ring(ci: CanvasItem, c: Vector2, r: float, blur: float, col: Color, inward := false) -> void:
	var s := -1.0 if inward else 1.0
	var a := col
	a.a *= 0.5
	var b := col
	b.a *= 0.16
	var z := col
	z.a = 0.0
	_annulus(ci, c, r, maxf(0.0, r + s * blur * 0.4), a, b)
	_annulus(ci, c, maxf(0.0, r + s * blur * 0.4), maxf(0.0, r + s * blur * 1.1), b, z)


## A horizontal gradient across `rect` (offsets `at`, colours `cols`), through `xf`.
func _hgrad(ci: CanvasItem, xf: Transform2D, rect: Rect2, at: Array, cols: Array, alpha: float) -> void:
	for k in at.size() - 1:
		var x0: float = rect.position.x + rect.size.x * float(at[k])
		var x1: float = rect.position.x + rect.size.x * float(at[k + 1])
		var c0: Color = cols[k]
		var c1: Color = cols[k + 1]
		c0.a *= alpha
		c1.a *= alpha
		if c0.a <= 0.003 and c1.a <= 0.003:
			continue
		var y0 := rect.position.y
		var y1 := rect.end.y
		ci.draw_polygon(PackedVector2Array([xf * Vector2(x0, y0), xf * Vector2(x1, y0), xf * Vector2(x1, y1), xf * Vector2(x0, y1)]), PackedColorArray([c0, c1, c1, c0]))


## A 2px line along the top and bottom of `rect`, through `xf` (a band's borders).
func _edges(ci: CanvasItem, xf: Transform2D, rect: Rect2, col: Color) -> void:
	for y in [rect.position.y, rect.end.y - 2.0]:
		ci.draw_polygon(PackedVector2Array([xf * Vector2(rect.position.x, y), xf * Vector2(rect.end.x, y), xf * Vector2(rect.end.x, y + 2.0), xf * Vector2(rect.position.x, y + 2.0)]), PackedColorArray([col, col, col, col]))


## A rounded rectangle's outline points (radius `r`, clockwise from the top left).
static func _rrect(rect: Rect2, r: float, seg := 6) -> PackedVector2Array:
	var out := PackedVector2Array()
	r = minf(r, minf(rect.size.x, rect.size.y) * 0.5)
	var cs := [Vector2(rect.position.x + r, rect.position.y + r), Vector2(rect.end.x - r, rect.position.y + r), Vector2(rect.end.x - r, rect.end.y - r), Vector2(rect.position.x + r, rect.end.y - r)]
	for q in 4:
		for k in seg + 1:
			var a := PI + (q + float(k) / seg) * PI * 0.5
			out.append(cs[q] + Vector2(cos(a), sin(a)) * r)
	return out


## A pill (border-radius 999px) filled with `bg` and a 1px `border`.
func _pill(ci: CanvasItem, rect: Rect2, bg: Color, border: Color) -> void:
	ci.draw_colored_polygon(_rrect(rect, rect.size.y * 0.5, 8), bg)
	if border.a > 0.0:
		var q := _rrect(rect.grow(-0.5), rect.size.y * 0.5 - 0.5, 8)
		q.append(q[0])
		ci.draw_polyline(q, border, 1.0, true)


# ------------------------------------------------------------------ the callout

## style.css .callout and @keyframes callout: in from 2.2x, a hold that swells a touch, then up
## and out, leaning (skewX -8deg), with its class's glow (the glow layer) or its text and drop.
func _draw_callout(ci: CanvasItem, glow: bool) -> void:
	if _co_t < 0.0 or hud.finished:
		return
	var D := _co_dur
	var t := _co_t
	var e = _e_callout
	var a := clampf(_kf(t, D, [[0.0, 0.0], [0.18, 1.0], [0.75, 1.0], [1.0, 0.0]], e), 0.0, 1.0)
	if a <= 0.0:
		return
	var s := _kf(t, D, [[0.0, 2.2], [0.18, 1.0], [0.75, 1.04], [1.0, 1.1]], e)
	var px := int(round(em() * (1.8 if _co_small else 3.4)))
	var lift := _kf(t, D, [[0.0, 0.0], [0.75, 0.0], [1.0, -0.1]], e) * px * 1.25
	var sp := 0.03 * px
	var w := _sw(_fi, _co_text, px, sp)
	var at := Vector2(-w * 0.5, _mid(_fi, px))
	ci.draw_set_transform_matrix(Transform2D(Vector2(s, 0), Vector2(s * SKEW_CALLOUT, s), Vector2(size.x * 0.5, size.y * 0.4 + lift)))
	if glow:
		var g := _rgba(255, 140, 40, 0.65)
		if _co_kind == "cyan":
			g = _rgba(42, 216, 255, 0.7)
		elif _co_kind == "red":
			g = _rgba(255, 63, 94, 0.8)
		g.a *= a
		_glow(ci, _gw, at, _co_text, px, g, _px(30.0), sp)
	else:
		_str(ci, _fi, at + Vector2(0, _px(4.0)), _co_text, px, Color(0, 0, 0, 0.5 * a), sp)
		var col := _rgba(0xff, 0xdb, 0xe1) if _co_kind == "red" else Color.WHITE
		col.a = a
		_str(ci, _fi, at, _co_text, px, col, sp)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


# ------------------------------------------------------------------ the countdown

## style.css .count: the element's fade (countIn), the streak across the screen (countStreak) and
## the ring bursting out (countRing); .count.fight in amber.
func _draw_count_back(ci: CanvasItem) -> void:
	if _ct < 0.0:
		return
	var fight := _cfight
	var t := _ct
	var el := _count_a()
	if el <= 0.0:
		return
	var e := em()
	var o := Vector2(size.x * 0.5, size.y * 0.36)
	# ::before: 2em font, 1.8em tall, the full width, scaleX from 0
	if t < 0.7:
		var k := HudKit.bezier(t / 0.7, 0.2, 1.0, 0.3, 1.0)
		var sa := (1.0 - k) * el
		var hw := size.x * 0.5 * k
		if sa > 0.0 and hw > 0.5:
			var c1 := _rgba(255, 150, 50, 0.35) if fight else _rgba(120, 220, 255, 0.28)
			var c2 := _rgba(255, 240, 200, 0.6) if fight else _rgba(255, 255, 255, 0.45)
			var c0 := c1
			c0.a = 0.0
			var at := [0.0, 0.3, 0.5, 0.7, 1.0] if fight else [0.0, 0.35, 0.5, 0.65, 1.0]
			_hgrad(ci, Transform2D.IDENTITY, Rect2(o.x - hw, o.y - 1.8 * e, hw * 2.0, 3.6 * e), at, [c0, c1, c2, c1, c0], sa)
	# i: 2.2em font, 3.8em across, a 0.14em border, a glow out and in
	var ra := _kf(t, 0.8, [[0.0, 0.0], [0.14, 1.0], [1.0, 0.0]], _e_ease_out) * el
	if ra > 0.0:
		var rs := 0.45 + 1.55 * HudKit.ease_out(clampf(t / 0.8, 0.0, 1.0))
		var R := 1.9 * 2.2 * e * rs
		var bw := 0.14 * 2.2 * e * rs
		var line := HudKit.AMBER if fight else Color(1, 1, 1, 0.9)
		var g_out := _rgba(255, 140, 40, 0.75) if fight else _rgba(42, 216, 255, 0.6)
		var g_in := _rgba(255, 140, 40, 0.5) if fight else _rgba(42, 216, 255, 0.4)
		g_out.a *= ra
		g_in.a *= ra
		line.a *= ra
		_soft_ring(ci, o, R, _px(40.0 if fight else 24.0) * rs, g_out)
		_soft_ring(ci, o, R - bw, _px(30.0 if fight else 24.0) * rs, g_in, true)
		ci.draw_arc(o, R - bw * 0.5, 0.0, TAU, 96, line, bw, true)


## countIn: 0.95 s (FIGHT! 1.4 s), in by 8%, out from 78%.
func _count_a() -> float:
	return _kf(_ct, 1.4 if _cfight else 0.95, [[0.0, 0.0], [0.08, 1.0], [0.78, 1.0], [1.0, 0.0]], _e_ease_css)


## The number (7em; FIGHT! 8em italic amber), in from 2.6x and settling smaller as it holds
## (countNum): its glow, or its drop and face.
func _draw_count_num(ci: CanvasItem, glow: bool) -> void:
	if _ct < 0.0:
		return
	var fight := _cfight
	var D := 1.4 if fight else 0.95
	var t := _ct
	var na := clampf(_kf(t, D, [[0.0, 0.0], [0.18, 1.0], [1.0, 1.0]], _e_num), 0.0, 1.0) * _count_a()
	if na <= 0.0:
		return
	var s := _kf(t, D, [[0.0, 2.6], [0.18, 0.9], [0.32, 1.0], [1.0, 0.86]], _e_num)
	var font := _fi if fight else _fu
	var px := int(round(em() * (8.0 if fight else 7.0)))
	var w := _sw(font, _ctext, px)
	var at := Vector2(-w * 0.5, _mid(font, px))
	ci.draw_set_transform_matrix(Transform2D(Vector2(s, 0), Vector2(0, s), Vector2(size.x * 0.5, size.y * 0.36)))
	if glow:
		var g := _rgba(255, 140, 40, 0.85) if fight else _rgba(120, 220, 255, 0.55)
		g.a *= na
		_glow(ci, _gi if fight else _gu, at, _ctext, px, g, _px(50.0 if fight else 40.0))
	else:
		_str(ci, font, at + Vector2(0, _px(5.0)), _ctext, px, Color(0, 0, 0, (0.5 if fight else 0.45) * na))
		var col := HudKit.AMBER if fight else Color.WHITE
		col.a = na
		_str(ci, font, at, _ctext, px, col)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


# ------------------------------------------------------------------ the end-of-fight word

## The word's size, how far it's docked and where its centre is (style.css .fx-word, fxDock).
func _word_geom() -> Dictionary:
	var vh := size.y / 100.0
	var big := minf(size.y * float(_st.big[0]), size.x * float(_st.big[1]))
	var dock_at: float = _st.dock_at
	var dk := HudKit.bezier(clampf((_fin_t - dock_at) / 0.5, 0.0, 1.0), 0.5, 0.0, 0.2, 1.0)
	return {"big": big, "dk": dk, "cy": lerpf(42.0 * vh, 11.0 * vh, dk), "s": lerpf(1.0, float(_st.dock), dk)}


## How far the word's faded out once the fight's over (.finish.out: opacity 0.5 s ease).
func _out_a() -> float:
	return 1.0 - HudKit.ease_css(clampf(_out_t / 0.5, 0.0, 1.0)) if _out_t >= 0.0 else 1.0


## style.css .finish's back layers: fx-vig, fx-top, fx-flash, the two fx-rings and fx-band.
func _draw_finish_back(ci: CanvasItem) -> void:
	if _fin_t < 0.0:
		return
	var t := _fin_t
	var oa := _out_a()
	if oa <= 0.0:
		return
	var w := size.x
	var h := size.y
	var vh := h / 100.0
	var dock_at: float = _st.dock_at
	# fx-vig: fxFade in, fxOut as it docks
	var va := HudKit.ease_css(clampf(t / 0.5, 0.0, 1.0)) if t < dock_at else 1.0 - HudKit.ease_css(clampf((t - dock_at) / 0.5, 0.0, 1.0))
	if va * oa > 0.0:
		var c := Vector2(w * 0.5, h * 0.45)
		var rad := Vector2(maxf(c.x, w - c.x), maxf(c.y, h - c.y)) * sqrt(2.0)
		ci.draw_texture_rect(_vig_tex, Rect2(c - rad, rad * 2.0), false, Color(1, 1, 1, va * oa))
	# fx-top: a shade behind the docked title, fading in as it docks
	var ta := HudKit.ease_css(clampf((t - dock_at) / 0.5, 0.0, 1.0)) * oa
	if ta > 0.0:
		var c0 := _rgba(5, 7, 13, 0.6 * ta)
		var c1 := _rgba(5, 7, 13, 0.0)
		ci.draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, 34.0 * vh), Vector2(0, 34.0 * vh)]), PackedColorArray([c0, c0, c1, c1]))
	if _st.fx:
		# fx-flash at 0.2 s
		var fa := _kf(t - 0.2, 0.6, [[0.0, 0.0], [0.12, 0.7], [1.0, 0.0]], _e_ease_out) * oa if t >= 0.2 else 0.0
		if fa > 0.0:
			var c := Vector2(w * 0.5, h * 0.45)
			var R := Vector2(maxf(c.x, w - c.x), maxf(c.y, h - c.y)).length()
			ci.draw_texture_rect(_flash_tex, Rect2(c - Vector2(R, R), Vector2(R, R) * 2.0), false, Color(1, 1, 1, fa))
		# the rings at 0.3 s and 0.42 s (44vh across, held small until they burst: fill both)
		var rc := Vector2(w * 0.5, 42.0 * vh)
		for k in 2:
			var x := HudKit.bezier(clampf((t - (0.3 + 0.12 * k)) / 0.75, 0.0, 1.0), 0.1, 0.7, 0.3, 1.0)
			var ra := (1.0 - x) * oa
			if ra <= 0.003:
				continue
			var rs := 0.15 + 2.45 * x
			var R := 22.0 * vh * rs
			var bw := 0.7 * vh * rs
			_soft_ring(ci, rc, R, 3.0 * vh * rs, _rgba(255, 90, 60, 0.7 * ra))
			var line := _rgba(255, 226, 190, 0.95) if k == 0 else _rgba(255, 120, 80, 0.8)
			line.a *= ra
			ci.draw_arc(rc, R - bw * 0.5, 0.0, TAU, 128, line, bw, true)
	# fx-band: skewed -4deg, opening out from the middle at 0.05 s, gone as the word docks
	var bk := HudKit.bezier(clampf((t - 0.05) / 0.45, 0.0, 1.0), 0.2, 1.0, 0.3, 1.0)
	var ba := (1.0 if t < dock_at else 1.0 - HudKit.ease_css(clampf((t - dock_at) / 0.35, 0.0, 1.0))) * oa
	if bk > 0.0 and ba > 0.0:
		var bh := float(_st.band_h) * h
		var xf := Transform2D(Vector2(bk, bk * -0.069927), Vector2(0, 1), Vector2(w * 0.5, 42.0 * vh))
		var rect := Rect2(-0.56 * w, -bh * 0.5, 1.12 * w, bh)
		_hgrad(ci, xf, rect, _st.band_at, _st.band, ba)
		var ec: Color = _st.edge
		ec.a *= ba
		_edges(ci, xf, rect, ec)


## Each piece of the word where fxSlam / fxSweep, fxShake and fxDock have it (style.css .fx-word):
## its three layers placed, scaled and faded as one. The layers only draw again when the word or
## its size changes.
func _place_spans() -> void:
	var n := _fin_word.size() if _fin_t >= 0.0 else 0
	var oa := _out_a()
	for k in 3:
		if k >= n or oa <= 0.0:
			if _spans[k].visible:
				_spans[k].visible = false
				_set_group(k, false)
	if n == 0 or oa <= 0.0:
		return
	var g := _word_geom()
	var big: float = g.big
	var px := int(round(big))
	var lsp := -0.02 * big
	var key := "%d %s %s" % [px, _fin_kind, " ".join(_fin_word)]
	if key != _span_key:
		# a new word, or a new size: measure the pieces and draw their layers again
		_span_key = key
		_span_px = px
		_span_w.clear()
		var pad := SPAN_PAD * big
		for k in n:
			var wk := _sw(_fi, _fin_word[k], px, lsp)
			_span_w.append(wk)
			for j in 3:
				var c := _span_ctl[k * 3 + j]
				c.size = Vector2(wk, big) + Vector2(pad, pad) * 2.0
				c.queue_redraw()
	var total := 0.0
	for k in n:
		total += _span_w[k]
	var tko := _fin_kind == "TKO"
	var t := _fin_t
	var sh := Vector2.ZERO
	if not tko and t > 0.36:
		var stops := [[0.0, Vector2.ZERO], [0.15, Vector2(-0.045, 0.025)], [0.35, Vector2(0.04, -0.02)], [0.55, Vector2(-0.025, 0.015)], [0.75, Vector2(0.012, 0.0)], [1.0, Vector2.ZERO]]
		sh = HudKit.keyframes(t - 0.36, 0.45, stops) * big
	var cw := Vector2(size.x * 0.5, float(g.cy))
	var sw: float = g.s
	var x := -total * 0.5
	for k in n:
		var wk: float = _span_w[k]
		var ss := 1.0
		var tx := 0.0
		var a := 1.0
		if tko:
			var e := HudKit.bezier(clampf((t - (k * 0.09 + 0.05)) / 0.4, 0.0, 1.0), 0.2, 1.0, 0.3, 1.0)
			a = e
			tx = -0.6 * big * (1.0 - e)
			ss = 1.25 - 0.25 * e
		else:
			var ts := t - (k * 0.14 + 0.05)
			a = clampf(_kf(ts, 0.4, [[0.0, 0.0], [0.55, 1.0], [1.0, 1.0]], _e_slam), 0.0, 1.0)
			ss = _kf(ts, 0.4, [[0.0, 3.4], [0.55, 0.9], [0.78, 1.05], [1.0, 1.0]], _e_slam)
		var ci := Vector2(x + wk * 0.5, 0.0)
		var tl := Vector2(x, -big * 0.5)
		var grp := _spans[k]
		var at := cw + sw * (ci + ss * (tl - ci) + Vector2(tx, 0.0) + sh)
		if grp.position != at:
			grp.position = at
		var sc := Vector2.ONE * (sw * ss)
		if grp.scale != sc:
			grp.scale = sc
		_place_clip(k, wk, big)
		var ga := a * oa
		grp.visible = ga > 0.0
		# (faded: composited as a group; fully in: drawn plainly, and no fade to apply)
		var fading := ga > 0.0 and ga < 0.999
		_set_group(k, fading)
		var gm := ga if fading else 1.0
		if grp.self_modulate.a != gm:
			grp.self_modulate.a = gm
		x += wk


## Piece `k`'s clip where its canvas group's rect would be: its layers' box (with SPAN_PAD) and
## SPAN_FIT render target pixels round it, at the piece's scale now. The layers stay put in the
## piece's own space as the clip moves round them.
func _place_clip(k: int, wk: float, big: float) -> void:
	var gs := _spans[k].get_global_transform_with_canvas().get_scale().x
	var m := SPAN_FIT / maxf(gs, 1e-3)
	var pad := SPAN_PAD * big
	var clip := _span_clip[k]
	var at := Vector2(-pad - m, -pad - m)
	if clip.position == at and clip.size.x == wk + 2.0 * (pad + m):
		return
	clip.position = at
	clip.size = Vector2(wk, big) + Vector2(pad + m, pad + m) * 2.0
	for j in 3:
		_span_ctl[k * 3 + j].position = Vector2(m, m)


## Piece `k` drawn as a canvas group (its layers composited, then faded together) or plainly.
## Off, the group's mode is switched off under the node, and the rect the group drew its
## composite with is cleared away (it would stay behind, white); on, setting its margin hands the
## node's own settings back to the renderer (and redraws it).
func _set_group(k: int, on: bool) -> void:
	if _span_group[k] == on:
		return
	_span_group[k] = on
	var grp := _spans[k]
	if on:
		grp.fit_margin = grp.fit_margin
	else:
		var rid := grp.get_canvas_item()
		RenderingServer.canvas_item_set_canvas_group_mode(rid, RenderingServer.CANVAS_GROUP_MODE_DISABLED)
		RenderingServer.canvas_item_clear(rid)


## One piece's layer (`part`): 0 its glow, 1 its soft drop shadow, 2 the piece itself (a hard
## edge, the dark depth, then the gradient face lifted 0.045em above it: span::after).
func _draw_span(ci: CanvasItem, k: int, part: int) -> void:
	if k >= _fin_word.size():
		return
	var px := _span_px
	var s := _fin_word[k]
	var big := float(px)
	var lsp := -0.02 * big
	# (the layer's rect has SPAN_PAD round the piece)
	var pad := SPAN_PAD * big
	var at := Vector2(pad, pad + (big - (_fi.get_ascent(px) + _fi.get_descent(px))) * 0.5 + _fi.get_ascent(px))
	match part:
		0:
			_glow(ci, _gi, at, s, px, _st.glow, big * float(_st.glow_r), lsp)
		1:
			_glow(ci, _gi, at + Vector2(0, 0.12 * big), s, px, Color(0, 0, 0, float(_st.soft)), 0.2 * big, lsp)
		_:
			_str(ci, _fi, at + Vector2(0, 0.05 * big), s, px, _st.hard, lsp)
			_str(ci, _fi, at, s, px, _st.depth, lsp)
			var mat := _span_mat[k]
			mat.set_shader_parameter("y0", pad - 0.045 * big)
			mat.set_shader_parameter("height", big)
			_str(ci, _fi, at - Vector2(0, 0.045 * big), s, px, Color.WHITE, lsp)


## style.css .fx-sub: the winner's pill under the word (fxSub), docking under the title.
func _draw_sub(ci: CanvasItem) -> void:
	if _fin_t < 0.0:
		return
	var oa := _out_a()
	var t := _fin_t
	var e := HudKit.bezier(clampf((t - float(_st.sub_at)) / 0.45, 0.0, 1.0), 0.2, 1.0, 0.3, 1.0)
	var a := e * oa
	if a <= 0.0:
		return
	var g := _word_geom()
	var vh := size.y / 100.0
	var big: float = g.big
	var px := int(round(em() * 1.15))
	var fp := float(px)
	var sp := 0.1 * fp
	var text := _fit(_bu, _fin_sub, px, sp, size.x * 0.9 - 2.2 * fp - 5.0)
	var pw := _sw(_bu, text, px, sp) + 2.2 * fp + 5.0
	var ph := 1.25 * fp + 0.7 * fp + 2.0
	var dk: float = g.dk
	var top := lerpf(42.0 * vh + big * 0.5 + 0.5 * fp, 11.0 * vh + big * float(_st.dock) * 0.5 + 0.3 * fp, dk)
	var sc := lerpf(1.0, 0.85, dk)
	var c := Vector2(size.x * 0.5, top + ph * 0.5 + 0.8 * fp * (1.0 - e))
	ci.draw_set_transform_matrix(Transform2D(Vector2(sc, 0), Vector2(0, sc), c))
	var r := Rect2(-pw * 0.5, -ph * 0.5, pw, ph)
	_pill(ci, r, _rgba(8, 10, 18, 0.85 * a), Color(1, 1, 1, 0.14 * a))
	# the 4px left border in the winner's colour, round the pill's left end
	var side := _side[_fin_i]
	side.a = a
	var R := ph * 0.5
	var lc := Vector2(r.position.x + R, 0.0)
	var cres := PackedVector2Array()
	for k in 17:
		var ang := PI * 0.5 + PI * k / 16.0
		cres.append(lc + Vector2(cos(ang) * R, sin(ang) * R))
	for k in 17:
		var ang := PI * 1.5 - PI * k / 16.0
		cres.append(lc + Vector2(cos(ang) * (R - 4.0), sin(ang) * (R - 1.0)))
	ci.draw_colored_polygon(cres, side)
	_str(ci, _bu, Vector2(-pw * 0.5 + 1.1 * fp + 4.0, _mid(_bu, px)), text, px, Color(1, 1, 1, a), sp)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


# ------------------------------------------------------------------ the finisher's banner

## style.css .finban's sizes and where the band is now (fbIn from the finisher's side, fbOut down
## at 2.3 s): {a, xf (the band's centre, skewY -3deg), rect, ...}.
func _finban_geom() -> Dictionary:
	var t := _fb_t
	var w := size.x
	var h := size.y
	var vh := h / 100.0
	var vw := w / 100.0
	var ein := HudKit.bezier(clampf(t / 0.42, 0.0, 1.0), 0.2, 1.3, 0.4, 1.0)
	var ba := clampf(ein, 0.0, 1.0)
	var bw := 1.16 * w
	var tx := (0.6 if _fb_i == 1 else -0.6) * bw * (1.0 - ein)
	var ty := 0.0
	var small_px := int(round(minf(2.4 * vh, 3.4 * vw)))
	var b_px := int(round(minf(9.0 * vh, 9.5 * vw)))
	var em_px := int(round(minf(2.0 * vh, 3.0 * vw)))
	var pad_t := 0.5 * vh
	var bh := pad_t + small_px * 1.25 + b_px + em_px * 1.25 + 0.9 * vh
	if t > _fb_dur - 0.5:
		var eo := HudKit.ease_in(clampf((t - (_fb_dur - 0.5)) / 0.45, 0.0, 1.0))
		ba = 1.0 - eo
		tx = 0.0
		ty = 0.3 * bh * eo
	var c := Vector2(w * 0.5 + tx, 0.7 * h + bh * 0.5 + ty)
	return {
		"a": ba, "xf": Transform2D(Vector2(1, -0.052408), Vector2(0, 1), c), "rect": Rect2(-bw * 0.5, -bh * 0.5, bw, bh),
		"small": small_px, "b": b_px, "em": em_px, "b_y": -bh * 0.5 + pad_t + small_px * 1.25, "vh": vh,
	}


## The edge glow (fb-edge: an inset shadow 14vh deep in the finisher's colour, fbEdge), the band,
## its FINISHER line and the bot's name, and the move's drop shadow.
func _draw_finban_back(ci: CanvasItem) -> void:
	if _fb_t < 0.0:
		return
	var t := _fb_t
	var w := size.x
	var h := size.y
	var fc := _fb_col
	var ea := _kf(t, _fb_dur - 0.2, [[0.0, 0.0], [0.12, 1.0], [1.0, 0.0]], _e_ease_out) if _fb_edge else 0.0
	if ea > 0.0:
		var B := 0.14 * h
		var c0 := fc
		c0.a = 0.7 * 0.5 * ea
		var c1 := fc
		c1.a = 0.7 * 0.16 * ea
		var c2 := fc
		c2.a = 0.0
		var d := [0.0, 0.4 * B, 1.1 * B]
		var cs := [c0, c1, c2]
		for j in 2:
			var d0: float = d[j]
			var d1: float = d[j + 1]
			var a0: Color = cs[j]
			var a1: Color = cs[j + 1]
			ci.draw_polygon(PackedVector2Array([Vector2(0, d0), Vector2(w, d0), Vector2(w, d1), Vector2(0, d1)]), PackedColorArray([a0, a0, a1, a1]))
			ci.draw_polygon(PackedVector2Array([Vector2(0, h - d0), Vector2(w, h - d0), Vector2(w, h - d1), Vector2(0, h - d1)]), PackedColorArray([a0, a0, a1, a1]))
			ci.draw_polygon(PackedVector2Array([Vector2(d0, 0), Vector2(d1, 0), Vector2(d1, h), Vector2(d0, h)]), PackedColorArray([a0, a1, a1, a0]))
			ci.draw_polygon(PackedVector2Array([Vector2(w - d0, 0), Vector2(w - d1, 0), Vector2(w - d1, h), Vector2(w - d0, h)]), PackedColorArray([a0, a1, a1, a0]))
	var g := _finban_geom()
	var ba: float = g.a
	if ba <= 0.0:
		return
	var xf: Transform2D = g.xf
	var rect: Rect2 = g.rect
	var dark := _rgba(5, 7, 13)
	var m55 := MenuKit.mix(fc, dark, 0.55)
	var m75 := MenuKit.mix(fc, dark, 0.75)
	var m0 := m55
	m0.a = 0.0
	_hgrad(ci, xf, rect, [0.0, 0.16, 0.5, 0.84, 1.0], [m0, m55, m75, m55, m0], ba)
	var ec := MenuKit.mix(fc, Color.WHITE, 0.6)
	ec.a = ba
	_edges(ci, xf, rect, ec)
	ci.draw_set_transform_matrix(xf)
	# small: the bolt and FINISHER, letter-spaced 0.5em, at 90%
	var small_px: int = g.small
	var sfp := float(small_px)
	var ls := 0.5 * sfp
	var icon := 1.1 * sfp
	var label := _fb_label
	var row := icon + 0.35 * sfp + _sw(_bu, label, small_px, ls)
	var line_c := rect.position.y + float(g.vh) * 0.5 + sfp * 0.625
	var x0 := -row * 0.5
	ci.draw_texture_rect(UiTheme.icon(_fb_icon, int(ceil(icon))), Rect2(x0, line_c - icon * 0.5, icon, icon), false, _rgba(0xff, 0xe0, 0x8a, 0.9 * ba))
	_str(ci, _bu, Vector2(x0 + icon + 0.35 * sfp, line_c + _mid(_bu, small_px)), label, small_px, Color(1, 1, 1, 0.9 * ba), ls)
	# em: the bot, letter-spaced 0.2em, at 75%
	var em_px: int = g.em
	var efp := float(em_px)
	var els := 0.2 * efp
	var nw := _sw(_bu, _fb_bot, em_px, els)
	var ey := float(g.b_y) + float(g.b) + efp * 0.625
	_str(ci, _bu, Vector2(-nw * 0.5, ey + _mid(_bu, em_px)), _fb_bot, em_px, Color(1, 1, 1, 0.75 * ba), els)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


## The move's name (fbWord: in from 1.9x at 0.12 s, its letter-spacing closing from 0.3em to
## 0.02em): its glow (3vh, the finisher's colour lit towards white), or its drop and face.
func _draw_finban_move(ci: CanvasItem, glow: bool) -> void:
	if _fb_t < 0.0:
		return
	var g := _finban_geom()
	var ba: float = g.a
	var be := HudKit.bezier(clampf((_fb_t - 0.12) / 0.7, 0.0, 1.0), 0.2, 1.4, 0.4, 1.0)
	var a := clampf(be, 0.0, 1.0) * ba
	if a <= 0.0:
		return
	var b_px: int = g.b
	var bfp := float(b_px)
	var bls := (0.3 - 0.28 * be) * bfp
	var bs := 1.9 - 0.9 * be
	var mw := _sw(_fi, _fb_move, b_px, bls)
	var bc := Vector2(0.0, float(g.b_y) + bfp * 0.5)
	ci.draw_set_transform_matrix((g.xf as Transform2D) * Transform2D(Vector2(bs, 0), Vector2(0, bs), bc))
	var at := Vector2(-mw * 0.5, _mid(_fi, b_px))
	var vh: float = g.vh
	if glow:
		var gc := MenuKit.mix(_fb_col, Color.WHITE, 0.9)
		gc.a = a
		_glow(ci, _gi, at, _fb_move, b_px, gc, 3.0 * vh, bls)
	else:
		_str(ci, _fi, at + Vector2(0, 0.5 * vh), _fb_move, b_px, Color(0, 0, 0, 0.45 * a), bls)
		_str(ci, _fi, at, _fb_move, b_px, Color(1, 1, 1, a), bls)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


# ------------------------------------------------------------------ the referee's count

## style.css .refcount under the clock: how far it's in (opacity and scale from 0.85 over 0.25 s),
## its centre and sizes.
func _ref_geom() -> Dictionary:
	var k := HudKit.ease_css(_ref_vis) if _ref_on else 1.0 - HudKit.ease_css(1.0 - _ref_vis)
	var e := em()
	var ring := 5.4 * e
	var gap := 0.3 * e
	var tpx := int(round(0.85 * e))
	var txt_h := 1.69 * tpx + 2.0
	var kpx := int(round(0.72 * e))
	var total := ring + gap + txt_h + gap + 1.25 * kpx
	var top := 8.0 + 3.3 * e
	var mid := Vector2(size.x * 0.5, top + total * 0.5)
	var sc := 0.85 + 0.15 * k
	return {
		"k": k, "xf": Transform2D(Vector2(sc, 0), Vector2(0, sc), mid) * Transform2D(0.0, -mid),
		"rc": Vector2(size.x * 0.5, top + ring * 0.5), "R": ring * 0.5, "top": top, "ring": ring, "gap": gap,
		"tpx": tpx, "txt_h": txt_h, "kpx": kpx,
	}


## The ring: a dark disc with its shadow and hairline (green once up), and the ten ticks (0.3em by
## 0.62em, 2.14em out), lit in the bot's colour over 0.2 s as the count reaches them.
func _draw_ref_back(ci: CanvasItem) -> void:
	if _ref_vis <= 0.0:
		return
	var g := _ref_geom()
	var k: float = g.k
	if k <= 0.0:
		return
	var e := em()
	var xf: Transform2D = g.xf
	var rc: Vector2 = g.rc
	var R: float = g.R
	var side := HudKit.GREEN if _ref_up else _side[_ref_i]
	ci.draw_set_transform_matrix(xf)
	_annulus(ci, rc + Vector2(0, 6), R * 0.75, R + 10.0, Color(0, 0, 0, 0.3 * k), Color(0, 0, 0, 0))
	ci.draw_circle(rc, R, _rgba(8, 10, 18, 0.85 * k), true, -1.0, true)
	var hair := HudKit.GREEN if _ref_up else Color(1, 1, 1, 0.16)
	hair.a *= k
	ci.draw_arc(rc, R - 0.5, 0.0, TAU, 72, hair, 1.0, true)
	var tw := 0.3 * e
	var th := 0.62 * e
	var tr := Rect2(-tw * 0.5, -2.14 * e - th * 0.5, tw, th)
	var tick := _rrect(tr, 2.0, 3)
	var halo := _rrect(tr.grow(1.5), 3.5, 3)
	var off := Color(1, 1, 1, 0.13 * k)
	for j in 10:
		ci.draw_set_transform_matrix(xf * Transform2D(deg_to_rad(36.0 * j), rc))
		var c := off
		var on := _tick_on[j]
		if on >= 0.0:
			var u := HudKit.ease_css(clampf(on / 0.2, 0.0, 1.0))
			var lit := side
			lit.a = k
			c = off.lerp(lit, u)
			var gl := side
			gl.a = 0.35 * u * k
			ci.draw_colored_polygon(halo, gl)
		ci.draw_colored_polygon(tick, c)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


## The count in the ring (2.7em; UP 1.9em, green), popping in from 1.8x (rcPop): its glow
## (14px of white at 35%) or its face.
func _draw_ref_num(ci: CanvasItem, glow: bool) -> void:
	if _ref_vis <= 0.0 or _ref_num == "":
		return
	var g := _ref_geom()
	var k: float = g.k
	if k <= 0.0:
		return
	var npx := int(round(em() * (1.9 if _ref_up else 2.7)))
	var pe := HudKit.bezier(clampf(_ref_pop / 0.35, 0.0, 1.0), 0.2, 1.6, 0.4, 1.0)
	var na := clampf(lerpf(0.2, 1.0, pe), 0.0, 1.0) * k
	var ns := lerpf(1.8, 1.0, pe)
	ci.draw_set_transform_matrix((g.xf as Transform2D) * Transform2D(Vector2(ns, 0), Vector2(0, ns), g.rc))
	var at := Vector2(-_sw(_fu, _ref_num, npx) * 0.5, _mid(_fu, npx))
	if glow:
		_glow(ci, _gu, at, _ref_num, npx, Color(1, 1, 1, 0.35 * na), _px(14.0))
	else:
		var nc := HudKit.GREEN if _ref_up else Color.WHITE
		nc.a = na
		_str(ci, _fu, at, _ref_num, npx, nc)
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


## The count's face, "<NAME> IS DOWN" (or "BEATS THE COUNT", green) in its pill, and the
## knockdown pips, blinking on the last one before a TKO (rcWarn).
func _draw_ref_front(ci: CanvasItem) -> void:
	if _ref_vis <= 0.0:
		return
	var g := _ref_geom()
	var k: float = g.k
	if k <= 0.0:
		return
	_draw_ref_num(ci, false)
	var side := HudKit.GREEN if _ref_up else _side[_ref_i]
	ci.draw_set_transform_matrix(g.xf)
	var tpx: int = g.tpx
	var tfp := float(tpx)
	var txt_h: float = g.txt_h
	var y: float = float(g.top) + float(g.ring) + float(g.gap)
	var ls := 0.05 * tfp
	var name := _fit(_b7, _ref_name.to_upper(), tpx, ls, 13.0 * tfp)
	var state := _ref_txt.to_upper()
	var nw := _sw(_b7, name, tpx, ls)
	var pw := nw + 0.4 * tfp + _sw(_b7, state, tpx, ls) + 1.6 * tfp + 2.0
	var pr := Rect2(size.x * 0.5 - pw * 0.5, y, pw, txt_h)
	_pill(ci, pr, _rgba(8, 10, 18, 0.8 * k), Color(1, 1, 1, 0.1 * k))
	var by := y + txt_h * 0.5 + _mid(_b7, tpx)
	var nc := side
	nc.a = k
	_str(ci, _b7, Vector2(pr.position.x + 1.0 + 0.8 * tfp, by), name, tpx, nc, ls)
	var stc := HudKit.GREEN if _ref_up else HudKit.RED
	stc.a = k
	_str(ci, _b7, Vector2(pr.position.x + 1.0 + 0.8 * tfp + nw + 0.4 * tfp, by), state, tpx, stc, ls)
	# the pips: "KNOCKDOWNS" (0.72em, letter-spaced 0.1em) and three skewed squares
	y += txt_h + float(g.gap)
	var kpx: int = g.kpx
	var kfp := float(kpx)
	var kls := 0.1 * kfp
	var label := "KNOCKDOWNS"
	var lw := _sw(_b7, label, kpx, kls)
	var box := 0.7 * kfp
	var kg := 0.25 * kfp
	var x := size.x * 0.5 - (lw + 0.2 * kfp + 3.0 * (kg + box)) * 0.5
	var ky := y + 0.625 * kfp
	_str(ci, _b7, Vector2(x, ky + _mid(_b7, kpx) + 1.0), label, kpx, Color(0, 0, 0, 0.45 * k), kls)
	_str(ci, _b7, Vector2(x, ky + _mid(_b7, kpx)), label, kpx, _rgba(214, 223, 240, 0.54 * k), kls)
	x += lw + 0.2 * kfp + kg
	# rcWarn: 0.6 s ease-in-out each way, down to 35%
	var blink := 1.0
	if _ref_last:
		var ph := fmod(_ref_warn, 1.2) / 0.6
		blink = lerpf(1.0, 0.35, HudKit.bezier(ph if ph <= 1.0 else 2.0 - ph, 0.42, 0.0, 0.58, 1.0))
	var hb := box * 0.5
	for j in 3:
		var lit := j < _ref_kd
		var ba := k * (blink if lit else 1.0)
		var sk := Transform2D(Vector2(1, 0), Vector2(-0.249328, 1), Vector2(x + hb, ky))
		var fill := HudKit.RED if lit else _rgba(8, 10, 18, 0.7)
		fill.a *= ba
		ci.draw_colored_polygon(PackedVector2Array([sk * Vector2(-hb, -hb), sk * Vector2(hb, -hb), sk * Vector2(hb, hb), sk * Vector2(-hb, hb)]), fill)
		var edge := HudKit.RED if lit else Color(1, 1, 1, 0.35)
		edge.a *= ba
		var i := hb - 0.5
		ci.draw_polyline(PackedVector2Array([sk * Vector2(-i, -i), sk * Vector2(i, -i), sk * Vector2(i, i), sk * Vector2(-i, i), sk * Vector2(-i, -i)]), edge, 1.0, true)
		x += box + kg
	ci.draw_set_transform_matrix(Transform2D.IDENTITY)


## The scene on its own: a quiet line low on the screen once the fight's over (clear of the docked
## title at the top), fading in and pulsing (by the layer's opacity, set in tick).
func _draw_restart(ci: CanvasItem) -> void:
	if _tap_t <= 0.0:
		return
	var px := int(round(em()))
	var s := "Tap for the next fight"
	# (drawn at full strength: tick fades and pulses the layer)
	var at := Vector2(size.x * 0.5 - _sw(_b7, s, px) * 0.5, size.y * 0.8)
	_str(ci, _b7, at + Vector2(0, 2), s, px, Color(0, 0, 0, 0.5))
	_str(ci, _b7, at, s, px, Color.WHITE)
