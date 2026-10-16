## The loading screen (index.html .boot, src/ui/loader.ts Loader): the deep blue sky with its
## pools of light, ribbons and rising sparks; the kicker, the logo, the progress line with what's
## happening and the percentage; a tip now and then; the busy mark. Progress is real: the start
## lists its jobs up front, each weighted by its share of the wait, and each reports how far it has
## got. The line glides toward a little past the real progress (never past the end of the step
## being worked on), so it keeps moving through a long step instead of jumping when it reports.
##
## It stands alone (no other game scripts), so it's up the moment the app starts, while those
## load on a worker thread (app/boot/boot.gd).
extends Control

const TIPS := [
	"Wear three or six parts from one maker to unlock its set bonus.",
	"Tap a part in the garage to try it on before you fit it.",
	"Get a rival below 15% while you are above 40%, and your next hit can be a finisher.",
	"Losing a leg does not end it: your bot hops on and keeps swinging.",
	"Big frames hit harder and take more. Small ones are quicker, sharper and harder to catch.",
	"Paint, finish and glow colour are all yours to pick in the garage.",
	"Win a cup on the world map and its trophy goes up in your trophy room.",
]
## How quickly the line closes in on where it's heading (s): it covers ~63% of the gap in this long.
const GLIDE := 1.4
## How far into the rest of the current step the line runs ahead of the real progress.
const LEAD := 0.7

const INK := Color(214 / 255.0, 226 / 255.0, 1.0, 0.72)
const DIM := Color(190 / 255.0, 206 / 255.0, 240 / 255.0, 0.48)
const HOT := Color("#ff7a2a")

## The screen starts lifting away (what's under it can make its entrance).
signal lifting
## Told once the screen has lifted away.
signal gone

## Each job: {label, w, k, until, quiet}.
var _jobs := {}
var _current := ""
var _glide := {"from": 0.0, "to": 0.0, "t0": 0.0, "tau": GLIDE}
var _time := 0.0
var _what := ""
var _ended := false
var _finishing := false
var _tip_at := randi() % TIPS.size()
var _tip_next := 1.6
var _full := 0.0

var _bg: ColorRect
var _bg_mat: ShaderMaterial
var _dust: Control
var _mid: Control
var _parts: Array[Control] = []
var _bar: Control
var _what_l: Label
var _pct: Label
var _pct_small: Label
var _tip: Control
var _tip_l: Label
var _spin: Control
var _sparks := []


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_bg = ColorRect.new()
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bg_mat = ShaderMaterial.new()
	_bg_mat.shader = preload("res://app/boot/boot_bg.gdshader")
	_bg.material = _bg_mat
	add_child(_bg)
	# the sparks rising (.bt-dust): 30, a quarter of them warm
	for k in 30:
		_sparks.append({
			"x": randf(), "size": 1.0 + randf() * 2.0, "dur": 11.0 + randf() * 14.0,
			"delay": randf() * 25.0, "a": 0.35 + randf() * 0.6, "hot": k % 4 == 0,
			"dx": [-0.06, 0.01, 0.07][k % 3],
		})
	_dust = Control.new()
	_dust.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dust.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dust.draw.connect(_draw_dust)
	add_child(_dust)
	_build_mid()
	_build_tip()
	_spin = Control.new()
	_spin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_spin.size = Vector2(28, 28)
	_spin.pivot_offset = Vector2(14, 14)
	_spin.draw.connect(_draw_spin)
	add_child(_spin)
	resized.connect(_layout)


# ---------------------------------------------------------------------------------- building

## The face for the words (style.css --body: system-ui, Roboto on Android).
static func _font(weight: int, italic := false) -> Font:
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Roboto", "Inter", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"])
	f.font_weight = weight
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	return f


## The logo's broadcast face ('Russo One' where there is one; a heavy italic otherwise).
static func _broadcast() -> Font:
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "Roboto", "sans-serif"])
	f.font_weight = 400
	f.font_italic = true
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	if f.get_font_style() & TextServer.FONT_ITALIC == 0:
		var v := FontVariation.new()
		v.base_font = f
		v.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
		return v
	return f


static func _label(text: String, px: float, font: Font, color: Color, spacing := 0.0) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var f := font
	if spacing != 0.0:
		var v := FontVariation.new()
		v.base_font = font
		v.spacing_glyph = int(round(spacing))
		f = v
	l.add_theme_font_override(&"font", f)
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	l.add_theme_color_override(&"font_color", color)
	return l


## A word filled with a top-to-bottom gradient (the logo: background-clip: text).
static func _grad(text: String, px: float, font: Font, top: Color, bottom: Color, stop := 0.0) -> Label:
	var l := _label(text, px, font, Color.WHITE)
	var m := ShaderMaterial.new()
	m.shader = preload("res://app/ui/text_grad.gdshader")
	# (linear-gradient(180deg, #fff 35%, #aec4ff): solid down to `stop`, then the blend)
	m.set_shader_parameter("top", top)
	m.set_shader_parameter("bottom", bottom)
	l.material = m
	l.resized.connect(func() -> void:
		var asc := font.get_ascent(int(round(px)))
		var desc := font.get_descent(int(round(px)))
		var pad := (l.size.y - (asc + desc)) * 0.5
		m.set_shader_parameter("y0", pad + (asc + desc) * stop)
		m.set_shader_parameter("height", (asc + desc) * (1.0 - stop)))
	# (the web's soft blue text-shadow halo: the backdrop's own glow behind the words stands in,
	# since a Label's shadow is a hard outline)
	return l


func _build_mid() -> void:
	_mid = VBoxContainer.new()
	_mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mid.alignment = BoxContainer.ALIGNMENT_CENTER
	_mid.add_theme_constant_override(&"separation", 0)
	add_child(_mid)
	# the kicker: ROBOT BOXING between two short hot lines
	var kick := HBoxContainer.new()
	kick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	kick.alignment = BoxContainer.ALIGNMENT_CENTER
	kick.add_theme_constant_override(&"separation", 10)
	for side in 2:
		var ln := Control.new()
		ln.custom_minimum_size = Vector2(28, 2)
		ln.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		ln.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var flip := side == 1
		ln.draw.connect(func() -> void: _draw_kick_line(ln, flip))
		kick.add_child(ln)
		if side == 0:
			# (11px, 600, letter-spacing 0.42em, uppercase)
			var k := _label("ROBOT BOXING", 11, _font(600), DIM, 11 * 0.42)
			kick.add_child(k)
	_add_part(kick, 12)
	# the logo: BATTLE in white to ice, BOTS in gold to orange
	var logo := HBoxContainer.new()
	logo.name = "Logo"
	logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	logo.alignment = BoxContainer.ALIGNMENT_CENTER
	logo.add_theme_constant_override(&"separation", 0)
	_add_part(logo, 34)
	# the progress line
	_bar = Control.new()
	_bar.custom_minimum_size = Vector2(0, 4)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.draw.connect(_draw_bar)
	_add_part(_bar, 14)
	# what's happening, and how far along
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_what_l = _label("Loading", 14, _font(400), INK)
	_what_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_what_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_what_l.size_flags_vertical = Control.SIZE_SHRINK_END
	row.add_child(_what_l)
	var pct := HBoxContainer.new()
	pct.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pct.add_theme_constant_override(&"separation", 2)
	_pct = _label("0", 26, _font(200), Color.WHITE)
	_pct.size_flags_vertical = Control.SIZE_SHRINK_END
	pct.add_child(_pct)
	_pct_small = _label("%", 13, _font(400), DIM)
	_pct_small.size_flags_vertical = Control.SIZE_SHRINK_END
	pct.add_child(_pct_small)
	row.add_child(pct)
	_add_part(row, 0)


func _add_part(c: Control, gap: float) -> void:
	c.modulate.a = 0.0
	_mid.add_child(c)
	_parts.append(c)
	if gap > 0.0:
		var sp := Control.new()
		sp.custom_minimum_size = Vector2(0, gap)
		sp.mouse_filter = Control.MOUSE_FILTER_IGNORE
		sp.name = "gap"
		_mid.add_child(sp)


## The logo's letters, sized to the screen (min(14vh, 9vw, 84px)).
func _fill_logo(px: float) -> void:
	var logo := _mid.get_node("Logo") as HBoxContainer
	for c in logo.get_children():
		c.queue_free()
	var f := _broadcast()
	logo.add_child(_grad("BATTLE", px, f, Color.WHITE, Color("#aec4ff"), 0.35))
	var bots := _grad("BOTS", px, f, Color("#ffd27a"), Color("#ff6a12"))
	# (padding-right 0.12em: the italic's overhang)
	bots.custom_minimum_size.x = f.get_string_size("BOTS", HORIZONTAL_ALIGNMENT_LEFT, -1, int(round(px))).x + 0.12 * px
	logo.add_child(bots)


func _build_tip() -> void:
	_tip = HBoxContainer.new()
	_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip.add_theme_constant_override(&"separation", 10)
	_tip.modulate.a = 0.0
	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0)
	sb.border_color = Color(1, 1, 1, 0.3)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(9)
	sb.corner_detail = 8
	sb.content_margin_left = 7
	sb.content_margin_right = 7
	sb.content_margin_top = 2
	sb.content_margin_bottom = 2
	pill.add_theme_stylebox_override(&"panel", sb)
	pill.add_child(_label("TIP", 10, _font(600), Color.WHITE, 1.6))
	_tip.add_child(pill)
	_tip_l = _label("", 13, _font(400), DIM)
	_tip_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tip.add_child(_tip_l)
	add_child(_tip)


# ---------------------------------------------------------------------------------- layout

## Phone-safe sides: 3% of the width, or the screen's cut-out inset where that's wider.
func _side() -> float:
	var m := size.x * 0.03
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.x > 0 and safe.size.x > 0:
		var k := size.x / float(screen.x)
		m = maxf(m, maxf(safe.position.x, screen.x - safe.end.x) * k)
	return m


func _layout() -> void:
	if size.x <= 0.0:
		return
	var vw := size.x / 100.0
	var vh := size.y / 100.0
	var tall := size.x <= size.y
	var px := minf(12.5 * vw, 64.0) if tall else minf(minf(14.0 * vh, 9.0 * vw), 84.0)
	_fill_logo(px)
	(_mid.get_child(3) as Control).custom_minimum_size.y = 30.0 if tall else minf(6.0 * vh, 40.0)
	var w := minf(84.0 * vw, 420.0) if tall else minf(62.0 * vw, 460.0)
	_mid.custom_minimum_size = Vector2(w, 0)
	_mid.size = Vector2(w, 0)
	_mid.reset_size()
	var cy := (0.42 if tall else 0.45) * size.y
	_mid.position = Vector2((size.x - w) * 0.5, cy - _mid.size.y * 0.5)
	_mid.pivot_offset = _mid.size * 0.5
	var side := maxf(_side(), 24.0)
	var bottom := 22.0
	_spin.position = Vector2(size.x - side - 28.0, size.y - bottom - 28.0)
	if tall:
		_spin.position.x = (size.x - 28.0) * 0.5
		_tip_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_tip.custom_minimum_size.x = 84.0 * vw
		_tip.size = Vector2(84.0 * vw, 0)
		_tip.reset_size()
		_tip.position = Vector2((size.x - _tip.size.x) * 0.5, size.y - 68.0 - _tip.size.y)
	else:
		var tw := minf(44.0 * vw, 34.0 * 13.0)
		_tip.custom_minimum_size.x = tw
		_tip.size = Vector2(tw, 0)
		_tip.reset_size()
		_tip.position = Vector2(maxf(7.0 * vw, side), size.y - bottom - _tip.size.y)


# ---------------------------------------------------------------------------------- jobs

## A job worth `weight` of the wait. `quiet` jobs run alongside others and don't take over the
## caption.
func job(id: String, label: String, weight: float, quiet := false) -> void:
	_jobs[id] = {"label": label, "w": weight, "k": 0.0, "until": 1.0, "quiet": quiet}


## How far job `id` has got (0..1), and how far it will have got when the step it's on is done
## (the line may glide toward that).
func set_job(id: String, k: float, until := 1.0, label := "") -> void:
	var j: Dictionary = _jobs[id]
	j.k = maxf(j.k, minf(1.0, k))
	j.until = maxf(j.k, minf(1.0, until))
	if not j.quiet:
		_current = id
		_caption(label if label != "" else j.label)
	_steer()


func done(id: String) -> void:
	var j: Dictionary = _jobs[id]
	j.k = 1.0
	j.until = 1.0
	_steer()


func _total() -> float:
	var w := 0.0
	for j in _jobs.values():
		w += j.w
	return maxf(w, 1e-6)


func _real() -> float:
	var k := 0.0
	for j in _jobs.values():
		k += j.w * j.k
	return k / _total()


## Where the line is on its glide now (0..1).
func _at() -> float:
	var g := _glide
	var t: float = _time - g.t0
	return g.to if t >= 4.0 * g.tau else g.to - (g.to - g.from) * exp(-t / g.tau)


## Progress came in: head a little past it, up to the end of the step being worked on.
func _steer() -> void:
	if _ended or _finishing:
		return
	var real := _real()
	var ceiling := real
	if _current != "":
		var j: Dictionary = _jobs[_current]
		if j.k < 1.0:
			ceiling = real + j.w * (j.until - j.k) / _total()
	var goal := minf(1.0, real + LEAD * (ceiling - real))
	if goal > _glide.to + 0.004:
		_retarget(goal, GLIDE)


func _retarget(goal: float, tau: float) -> void:
	var from := _at()
	_glide = {"from": from, "to": maxf(goal, from), "t0": _time, "tau": tau}


func _caption(t: String) -> void:
	if t == _what:
		return
	_what = t
	_what_l.text = t


## Everything is done: a quick run to the end, the line flashes white, then everything lifts
## away onto the game. `gone` follows.
func finish() -> void:
	if _finishing:
		return
	for j in _jobs.values():
		j.k = 1.0
		j.until = 1.0
	_caption("Ready")
	_retarget(1.0, 0.2)
	_finishing = true
	var t0 := _time
	while _at() < 0.99 and _time - t0 < 1.4:
		await get_tree().process_frame
	_pct.text = "100"
	_full = 0.001
	await get_tree().create_timer(0.3).timeout
	_ended = true
	# (.boot.out: the screen fades out over 0.8 s after 0.15 s; the words lift away, growing 6%)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	lifting.emit()
	var tw := create_tween().set_parallel()
	tw.tween_property(self, "modulate:a", 0.0, 0.8).set_delay(0.15).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	tw.tween_property(_mid, "scale", Vector2.ONE * 1.06, 0.8).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	tw.tween_property(_mid, "modulate:a", 0.0, 0.5)
	await tw.finished
	gone.emit()


## Something broke on the way in: say so rather than spin forever.
func fail(why: String) -> void:
	push_error("loading failed: " + why)
	_ended = true
	_caption("Couldn't start the game")
	_tip_l.text = "Close the app and open it again."
	_tip.modulate.a = 1.0
	_spin.visible = false
	_bar.set_meta("failed", true)
	_bar.queue_redraw()


# ---------------------------------------------------------------------------------- frames

func _process(dt: float) -> void:
	# (long steps on this thread hold the frames: don't let a stalled frame jump the animations)
	_time += minf(dt, 0.1)
	_bg_mat.set_shader_parameter("size", size)
	_bg_mat.set_shader_parameter("t", _time)
	# the words come up in turn (.boot.fonts .bt-mid > *: 0.8 s, staggered 0, 0.08, 0.16, 0.22)
	var delays := [0.0, 0.08, 0.16, 0.22]
	for i in _parts.size():
		var u: float = clampf((_time - 0.1 - delays[i]) / 0.8, 0.0, 1.0)
		_parts[i].modulate.a = u
	if _full > 0.0:
		_full = minf(1.0, _full + dt / 0.4)
	var shown := _at()
	if not _finishing or _pct.text != "100":
		_pct.text = str(int(floor(shown * 100.0 + 1e-6)))
	_bar.queue_redraw()
	_dust.queue_redraw()
	_spin.rotation = fmod(_time / 1.1, 1.0) * PI * 2.0
	_spin.modulate.a = 1.0 - _full
	# a quick start never needs a tip; a slow one gets something to read
	if not _ended and _time >= _tip_next:
		_next_tip()
	if _tip_fade != 0.0:
		_tip.modulate.a = clampf(_tip.modulate.a + _tip_fade * dt / 0.6, 0.0, 1.0)
		if _tip_fade < 0.0 and _tip.modulate.a <= 0.0:
			_tip_fade = 1.0
			_tip_l.text = TIPS[_tip_at]
			_layout()
		elif _tip_fade > 0.0 and _tip.modulate.a >= 1.0:
			_tip_fade = 0.0


var _tip_fade := 0.0


func _next_tip() -> void:
	_tip_next = _time + 5.2
	_tip_at = (_tip_at + 1) % TIPS.size()
	if _tip_l.text == "":
		_tip_l.text = TIPS[_tip_at]
		_layout()
		_tip_fade = 1.0
	else:
		_tip_fade = -1.0


func _draw_kick_line(c: Control, flip: bool) -> void:
	# linear-gradient(90deg, transparent, --hot) with an 8px orange glow
	var w := c.size.x
	var n := 14
	for i in n:
		var u: float = (i + 0.5) / n
		var a: float = u if not flip else 1.0 - u
		c.draw_rect(Rect2(w * i / n, -2, w / n + 0.5, 6), Color(1.0, 122 / 255.0, 42 / 255.0, 0.12 * a))
		c.draw_rect(Rect2(w * i / n, 0, w / n + 0.5, 2), Color(HOT, a))


func _draw_bar() -> void:
	var c := _bar
	var w := c.size.x
	var h := 4.0
	var failed: bool = c.get_meta("failed", false)
	# the track
	c.draw_rect(Rect2(0, 0, w, h), Color(1, 1, 1, 0.1))
	var p := clampf(_at(), 0.0, 1.0)
	var fw := w * p
	if fw > 0.5:
		# linear-gradient(90deg, rgba(70,140,255,0.25), #7cc6ff 60%, #fff) over the whole width,
		# slid in from the left: its right end (white) rides the head
		var n := maxi(8, int(fw / 6.0))
		for i in n:
			var u: float = (i + 0.5) / n
			var col: Color
			if u < 0.6:
				col = Color(70 / 255.0, 140 / 255.0, 1.0, 0.25).lerp(Color("#7cc6ff"), u / 0.6)
			else:
				col = Color("#7cc6ff").lerp(Color.WHITE, (u - 0.6) / 0.4)
			if _full > 0.0:
				col = col.lerp(Color.WHITE, _full)
			if failed:
				col = Color("#ff4d6a")
			c.draw_rect(Rect2(fw * i / n, 0, fw / n + 0.5, h), col)
	# the bright head: a soft white dot at the line's end
	var head := 1.0 - _full
	if head > 0.0 and not failed:
		for r in [12.0, 8.0, 5.0, 3.0]:
			var a: float = 0.14 if r > 6.0 else 0.35 if r > 4.0 else 0.8
			c.draw_circle(Vector2(fw, h * 0.5), r, Color(0.75, 0.88, 1.0, a * head))


func _draw_dust() -> void:
	var w := _dust.size.x
	var h := _dust.size.y
	for s in _sparks:
		var u: float = fmod(_time + s.delay, s.dur) / s.dur
		# opacity 0 -> 1 by 18%, held to 75%, out by the end; rising 80vh while drifting
		var a: float = u / 0.18 if u < 0.18 else 1.0 if u < 0.75 else (1.0 - u) / 0.25
		var p := Vector2(s.x * w + s.dx * w * u, h * 1.02 - 0.8 * h * u)
		var col := Color("#ffe2c4") if s.hot else Color("#eaf4ff")
		var glow := Color(1.0, 140 / 255.0, 60 / 255.0) if s.hot else Color(140 / 255.0, 200 / 255.0, 1.0)
		var k: float = a * s.a
		_dust.draw_circle(p, s.size * 0.5 + 3.0, Color(glow, 0.18 * k))
		_dust.draw_circle(p, s.size * 0.5 + 1.2, Color(glow, 0.4 * k))
		_dust.draw_circle(p, s.size * 0.5, Color(col, k))


func _draw_spin() -> void:
	var c := Vector2(14, 14)
	_spin.draw_arc(c, 11, 0, PI * 2.0, 48, Color(1, 1, 1, 0.14), 2.4, true)
	# stroke-dasharray 22 of a 69-long circle: a third of the way round
	_spin.draw_arc(c, 11, 0, 22.0 / 11.0, 16, Color.WHITE, 2.4, true)
