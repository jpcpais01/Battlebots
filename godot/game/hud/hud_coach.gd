## The coach's four calls along the bottom (hud.ts build's coach-bar, updateCoach; style.css .coach-bar).
## One shared cooldown sweeps across all four; the call that's on is lit in its colour with what's
## left of its ten seconds draining underneath; a tapped call pulses until its step comes.
class_name HudCoach
extends HudPart

## hud.ts COACH_BUTTON, in sim/coach.ts COACH_KINDS order.
const KINDS: Array[String] = ["go", "allIn", "defend", "head"]
const LABEL := {"go": "Go in!", "allIn": "All in!!!", "defend": "Defend", "head": "For the head!"}
## style.css .coach-btn[data-k] --kc.
const KC := {"go": HudKit.AMBER, "allIn": HudKit.RED, "defend": HudKit.CYAN, "head": HudKit.ORANGE}

var _btns: Array[CoachButton] = []
## The bar's buttons, raised 0.8em and faded while it's off (style.css .coach-bar.off).
var _row := Control.new()
## What the match said this frame (updateCoach), for the player's corner (FightHud.me).
var _live := false
var _ready := false
var _active := ""
var _tapped := ""
var _cd := 0.0
var _left := 0.0
## 1 while off (no live fight), easing over 0.3s (transition: opacity 0.3s ease, transform 0.3s ease).
var _off_p := 1.0
var _em := -1.0
var _w := -1.0
var _h := -1.0


func _init() -> void:
	super()
	_row.set_anchors_preset(Control.PRESET_FULL_RECT)
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_row)
	for k in KINDS:
		var b := CoachButton.new()
		b.kind = k
		b.label = LABEL[k]
		b.kc = KC[k]
		b.pressed.connect(_tap.bind(k))
		_row.add_child(b)
		_btns.append(b)


## Canvas units per CSS pixel on this screen (HudKit.em's viewport, without the --fs clamp).
static func px(c: Control) -> float:
	var h := c.size.y if c.size.y > 0.0 else 720.0
	var w := c.size.x if c.size.x > 0.0 else 1280.0
	var win := HudKit.window_size()
	if win.x <= 0.0 or win.y <= 0.0:
		win = Vector2(w, h)
	return h / (win.y / HudKit.css_ratio())


## CSS color-mix(in srgb, a p, b): premultiplied, as browsers mix.
static func mix(a: Color, p: float, b: Color) -> Color:
	var al := a.a * p + b.a * (1.0 - p)
	if al <= 0.0:
		return Color(0, 0, 0, 0)
	var c := (Color(a.r, a.g, a.b) * (a.a * p) + Color(b.r, b.g, b.b) * (b.a * (1.0 - p))) / al
	return Color(c.r, c.g, c.b, al)


func start(_m) -> void:
	_tapped = ""
	_off_p = 1.0
	_live = false
	_ready = false
	_active = ""
	_cd = 0.0
	_left = 0.0
	for b in _btns:
		b.reset()
	_em = -1.0


func stop() -> void:
	_tapped = ""


## hud.ts updateCoach: what the corner's buttons show, read while the sim is idle.
func capture(mm) -> void:
	var me := float(hud.me)
	var br = mm.brains[hud.me]
	var t: float = mm.time
	_live = mm.phase == "fight" and mm.winner == null
	var c = br.coach
	var until: float = br.coachUntil
	_active = str(c) if c != null and str(c) != "" and t < until else ""
	var pending: bool = mm.coachPending(me)
	# (a tap waits in hud.coach_tap until the Game queues it: it's pending already)
	if not pending and hud.coach_tap == "":
		_tapped = ""
	pending = pending or hud.coach_tap != ""
	_ready = mm.coachReady(me) and not pending
	var ready_at: float = mm.coachReadyAt[hud.me]
	_cd = 0.0 if _ready or pending else maxf(0.0, ready_at - t) / TCoach.COACH_COOLDOWN
	_left = (until - t) / TCoach.COACH_TIME if _active != "" else 0.0


## hud.ts coach: a call from the corner, if the corner can call.
func _tap(kind: String) -> void:
	if not _ready or not _live:
		return
	_tapped = kind
	_ready = false
	hud.coach_tap = kind
	if hud.game != null and hud.game.get("sfx") != null:
		hud.game.sfx.ui("tap")


func tick(dt: float) -> void:
	var e := em()
	if e != _em or size.x != _w or size.y != _h:
		_em = e
		_w = size.x
		_h = size.y
		_layout()
	_off_p = move_toward(_off_p, 0.0 if _live else 1.0, dt / 0.3)
	var k := HudKit.ease_css(_off_p)
	_row.modulate.a = 1.0 - k
	_row.position.y = 0.8 * e * k
	_row.visible = k < 0.999
	for b in _btns:
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE if not _live else Control.MOUSE_FILTER_STOP
		b.show_state(_ready, b.kind == _active, b.kind == _tapped, _cd, _left, dt)


## Where the row of calls sits (laid out in tick; empty before), for HudTag's TAG button beside it.
func bar_rect() -> Rect2:
	if _btns.is_empty() or _btns[0].size.x <= 0.0:
		return Rect2()
	var last := _btns[_btns.size() - 1]
	return Rect2(_btns[0].position, Vector2(last.position.x + last.size.x - _btns[0].position.x, last.size.y))


## style.css .coach-bar: a centred row, 0.4em apart, max(10px, the gesture bar) off the bottom.
## Each button: 0.84em type, 3.1em tall, at least 6.6em wide, 1.1em padding each side.
func _layout() -> void:
	var p := px(self)
	var fs := 0.84 * _em
	var h := 3.1 * fs
	var gap := 0.4 * _em
	var widths: Array[float] = []
	var total := 0.0
	var font := HudKit.body(750)
	for b in _btns:
		var w := maxf(6.6 * fs, HudKit.width(font, b.label, fs) + 2.2 * fs + 2.0 * p)
		widths.append(w)
		total += w
	total += gap * (_btns.size() - 1)
	var bot := bottom()
	# (style.css: max(10px, safe-area-inset-bottom); bottom() is max(12px, ...))
	if bot <= 12.0:
		bot = 10.0 * p
	var x := (size.x - total) * 0.5
	for i in _btns.size():
		var b := _btns[i]
		b.size = Vector2(widths[i], h)
		b.position = Vector2(x, size.y - bot - h)
		b.pivot_offset = b.size * 0.5
		b.fs = fs
		b.px = p
		b.relayout()
		x += widths[i] + gap


## One call (style.css .coach-btn): a dark pill edged in its colour, the shared cooldown's dark
## sweep unwinding clockwise from the top, its label, and the call's time left along the bottom.
## The button draws its face (the pill, its edge and glow) only when its state changes; the sweep
## and the time left, which move every frame through a cooldown, are a shader's on a layer over it
## (FX_SHADER), and the label is a layer over that, drawn when its colour changes.
class CoachButton extends BaseButton:
	const BG := Color(12.0 / 255.0, 15.0 / 255.0, 23.0 / 255.0, 0.74)
	const BG_ON := Color(18.0 / 255.0, 23.0 / 255.0, 37.0 / 255.0, 0.9)
	const SWEEP := Color(4.0 / 255.0, 6.0 / 255.0, 12.0 / 255.0, 0.72)
	## The sweep (conic-gradient(dark cd*360deg, transparent 0) from the top, clockwise) and the
	## time left (.cb-left: 3px along the bottom, scaleX(left)), both clipped to the inside of the
	## edge (a stadium `inset` in from the button's `size`), the bar over the sweep. In the
	## button's own units (UV times size), antialiased over a pixel (each shape's cover the least of
## its edges', so an edge it shares with the inside of the pill isn't faded twice).
	const FX_SHADER := """shader_type canvas_item;
uniform vec2 size = vec2(100.0, 40.0);
uniform float inset = 1.0;
uniform float cd = 0.0;
uniform float left = 0.0;
uniform float bar_h = 3.0;
uniform vec4 sweep_col = vec4(0.0, 0.0, 0.0, 0.72);
uniform vec4 bar_col = vec4(1.0);
float cover(float d) { return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0); }
void fragment() {
	vec2 p = UV * size;
	vec2 c = size * 0.5;
	float r = max(0.0, c.y - inset);
	vec2 q = abs(p - c) - (c - vec2(inset) - vec2(r));
	float inner = cover(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r);
	float sa = 0.0;
	if (cd >= 0.9995) {
		sa = 1.0;
	} else if (cd > 0.0005) {
		// clockwise from the top, 0..TAU; past the wedge's far side counts back from 0
		vec2 v = p - c;
		float a = atan(v.x, -v.y);
		if (a < 0.0) a += 6.2831853;
		float end = cd * 6.2831853;
		if (a > 0.5 * (end + 6.2831853)) a -= 6.2831853;
		float far = length(v);
		sa = clamp(min(a, end - a) * far + 0.5, 0.0, 1.0);
	}
	sa = sweep_col.a * min(sa, inner);
	float ba = 0.0;
	if (left > 0.0) {
		float x1 = inset + (size.x - 2.0 * inset) * left;
		float bx = min(clamp(x1 - p.x + 0.5, 0.0, 1.0), clamp(p.x - inset + 0.5, 0.0, 1.0));
		float by = min(clamp(p.y - (size.y - inset - bar_h) + 0.5, 0.0, 1.0), clamp(size.y - inset - p.y + 0.5, 0.0, 1.0));
		ba = bar_col.a * min(min(bx, by), inner);
	}
	float a = ba + sa * (1.0 - ba);
	COLOR = vec4((bar_col.rgb * ba + sweep_col.rgb * sa * (1.0 - ba)) / max(a, 1e-4), a);
}"""
	static var _fx_shader: Shader
	var kind := ""
	var label := ""
	var kc := HudKit.AMBER
	var fs := 13.44
	var px := 1.0
	var _box := StyleBoxFlat.new()
	## The glow round the pill (box-shadow, outside it only: no centre fill).
	var _glow := StyleBoxFlat.new()
	## The sweep and the time left (FX_SHADER), and the label, over the face.
	var _fx := ColorRect.new()
	var _fx_mat := ShaderMaterial.new()
	var _text := Control.new()
	var _ready := false
	var _on := false
	var _pending := false
	var _cd := 0.0
	var _left := 0.0
	## Border and glow ease to each new state over 0.2s (transition: border-color, box-shadow).
	var _edge_from := Vector3.ZERO
	var _edge_to := Vector3.ZERO
	var _edge_t := 1.0
	var _edge := Vector3.ZERO
	## The pending pulse's clock (coachPulse 0.45s ease-in-out alternate).
	var _pulse := 0.0
	## Pressed while ready: scale(0.93), transition transform 0.1s ease.
	var _press := 0.0
	## The state the face and the label were last drawn in, and the sweep's and the bar's last
	## values handed to the shader.
	var _face := -1
	var _label_col := Color(0, 0, 0, 0)
	var _fx_cd := -1.0
	var _fx_left := -1.0

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		mouse_filter = Control.MOUSE_FILTER_STOP
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
		_box.corner_detail = 16
		_box.anti_aliasing = true
		_glow.corner_detail = 16
		_glow.draw_center = false
		_glow.bg_color = Color(0, 0, 0, 0)
		if _fx_shader == null:
			_fx_shader = Shader.new()
			_fx_shader.code = FX_SHADER
		_fx_mat.shader = _fx_shader
		_fx_mat.set_shader_parameter(&"sweep_col", SWEEP)
		_fx.material = _fx_mat
		_fx.color = Color.WHITE
		_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
		_fx.visible = false
		add_child(_fx)
		_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_text.set_anchors_preset(Control.PRESET_FULL_RECT)
		_text.draw.connect(_draw_label)
		add_child(_text)

	func reset() -> void:
		_ready = false
		_on = false
		_pending = false
		_cd = 0.0
		_left = 0.0
		_edge = Vector3.ZERO
		_edge_from = Vector3.ZERO
		_edge_to = Vector3.ZERO
		_edge_t = 1.0
		_press = 0.0
		_pulse = 0.0
		_face = -1
		_fx_cd = -1.0
		_fx_left = -1.0
		_label_col = Color(0, 0, 0, 0)
		scale = Vector2.ONE

	## The size, the type or the screen's scale changed (HudCoach._layout): draw it all again.
	func relayout() -> void:
		_fx_mat.set_shader_parameter(&"size", size)
		_fx_mat.set_shader_parameter(&"inset", float(maxi(1, roundi(px))))
		_fx_mat.set_shader_parameter(&"bar_h", 3.0 * px)
		_fx_mat.set_shader_parameter(&"bar_col", kc)
		queue_redraw()
		_text.queue_redraw()

	## The state hud.ts updateCoach gives it: the bar's .ready, .on, .pending, --cd and --left.
	func show_state(ready: bool, on: bool, pending: bool, cd: float, left: float, dt: float) -> void:
		_ready = ready
		_on = on
		_cd = cd
		_left = left
		if pending and not _pending:
			_pulse = 0.0
		_pending = pending
		disabled = not ready
		# (border lit: x; ready's glow: y; on's glow: z)
		var to := Vector3(1.0 if ready or on or pending else 0.0, 1.0 if ready else 0.0, 1.0 if on else 0.0)
		if to != _edge_to:
			_edge_from = _edge
			_edge_to = to
			_edge_t = 0.0
		var animating := false
		if _edge_t < 1.0:
			_edge_t = minf(1.0, _edge_t + dt / 0.2)
			_edge = _edge_from.lerp(_edge_to, HudKit.ease_css(_edge_t))
			animating = true
		if pending:
			_pulse += dt
			animating = true
		var down := ready and get_draw_mode() == BaseButton.DRAW_PRESSED
		var p := move_toward(_press, 1.0 if down else 0.0, dt / 0.1)
		if p != _press:
			_press = p
			var s := lerpf(1.0, 0.93, HudKit.ease_css(_press))
			scale = Vector2(s, s)
		# the face: only when its state changes, or while its edge eases or it pulses
		var face := (1 if ready else 0) | (2 if on else 0) | (4 if pending else 0)
		if animating or face != _face:
			_face = face
			queue_redraw()
		# the label's colour
		var col := HudKit.TEXT
		if on or pending:
			col = Color.WHITE
		elif not ready:
			col = UiTheme.MUTED
		if col != _label_col:
			_label_col = col
			_text.queue_redraw()
		# the sweep and the time left: the shader's (above 0.0005: as it drew the wedge)
		var sweep := cd if cd > 0.0005 else 0.0
		var bar := left if on and left > 0.0 else 0.0
		if sweep != _fx_cd:
			_fx_cd = sweep
			_fx_mat.set_shader_parameter(&"cd", sweep)
		if bar != _fx_left:
			_fx_left = bar
			_fx_mat.set_shader_parameter(&"left", bar)
		_fx.visible = sweep > 0.0 or bar > 0.0

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		if r.size.x <= 0.0:
			return
		var bw := maxi(1, roundi(px))
		var rad := maxi(0, int(floor(size.y * 0.5)) - 1)
		# the face: background, edge (40% of its colour, all of it when lit) and glow
		var bg := BG
		if _on:
			bg = HudCoach.mix(kc, 0.3, BG_ON)
		if _pending:
			# coachPulse: alternate, ease-in-out, to 35% of its colour
			var ph := fmod(_pulse, 0.9) / 0.45
			var u := ph if ph <= 1.0 else 2.0 - ph
			bg = bg.lerp(HudCoach.mix(kc, 0.35, BG_ON), HudKit.bezier(u, 0.42, 0.0, 0.58, 1.0))
		_box.bg_color = bg
		_box.set_corner_radius_all(rad)
		_box.set_border_width_all(bw)
		_box.border_color = Color(kc, lerpf(0.4, 1.0, _edge.x))
		# box-shadow: 0 0 10px 35% when ready, 0 0 14px 55% when on (a blur is half strength at
		# the edge and mostly gone 0.6 of its radius out, where this ring fades linearly from full)
		var glow := maxf(0.35 * _edge.y, 0.55 * _edge.z)
		if glow > 0.004:
			_glow.set_corner_radius_all(rad)
			_glow.shadow_color = Color(kc, glow * 0.5)
			_glow.shadow_size = maxi(1, int(round((14.0 if _edge.z > _edge.y else 10.0) * 0.6 * px)))
			draw_style_box(_glow, r)
		draw_style_box(_box, r)

	## The label, centred, over the sweep.
	func _draw_label() -> void:
		if size.x <= 0.0:
			return
		var font := HudKit.body(750)
		var isz := int(round(fs))
		var tw := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, isz).x
		var asc := font.get_ascent(isz)
		var desc := font.get_descent(isz)
		_text.draw_string(font, Vector2((size.x - tw) * 0.5, (size.y + asc - desc) * 0.5), label, HORIZONTAL_ALIGNMENT_LEFT, -1, isz, _label_col)
