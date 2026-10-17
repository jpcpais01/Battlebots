## The visor over a bot's-eye shot (hud.ts visor, style.css .pov-visor): vignette, scanlines, corner brackets and whose eyes these are.
## On while the director's lens looks out of a bot's head (director.pov >= 0), tinted in that
## bot's colour (hud.ts --bot0 / --bot1: its bar colour).
class_name HudVisor
extends HudPart

const DOT := Color(1.0, 0.227, 0.18)
## The glass: the dark oval vignette over 1px scanlines every 3px, and the bot's colour glowing in
## from the rim (style.css .pov-visor background, ::before's inset box-shadow 0 0 6vmin).
const GLASS := """shader_type canvas_item;
uniform vec4 pv : source_color;
uniform vec2 view = vec2(1280.0, 720.0);
uniform float px = 1.0;
float phi(float x) {
	// the normal CDF, near enough (a blur's edge)
	return 1.0 / (1.0 + exp(-1.702 * x));
}
void fragment() {
	vec2 p = UV * view;
	// scanlines: repeating-linear-gradient(0deg, white 2.5% 0 1px, transparent 1px 3px), from the bottom
	float up = (view.y - p.y) / px;
	vec4 col = vec4(1.0, 1.0, 1.0, mod(up, 3.0) < 1.0 ? 0.025 : 0.0);
	// radial-gradient(ellipse 78% 72% at 50% 50%, transparent 58%, rgba(4,8,14,.38) 82%, rgba(2,4,8,.78))
	vec2 q = (UV - 0.5) / vec2(0.78, 0.72);
	float d = length(q);
	vec4 v = vec4(4.0, 8.0, 14.0, 0.0) / 255.0;
	if (d > 0.58 && d <= 0.82) {
		v = vec4(4.0 / 255.0, 8.0 / 255.0, 14.0 / 255.0, 0.38 * (d - 0.58) / 0.24);
	} else if (d > 0.82) {
		float k = clamp((d - 0.82) / 0.18, 0.0, 1.0);
		v = vec4(mix(vec3(4.0, 8.0, 14.0), vec3(2.0, 4.0, 8.0), k) / 255.0, mix(0.38, 0.78, k));
	}
	col = vec4(mix(col.rgb * col.a, v.rgb, v.a) / max(1e-4, col.a + v.a * (1.0 - col.a)), col.a + v.a * (1.0 - col.a));
	// the rim glow: everything outside the screen, blurred (sigma = 3vmin), seen from inside
	float s = 0.03 * min(view.x, view.y);
	float fx = phi(p.x / s) + phi((view.x - p.x) / s) - 1.0;
	float fy = phi(p.y / s) + phi((view.y - p.y) / s) - 1.0;
	float g = (1.0 - fx * fy) * pv.a;
	float a = g + col.a * (1.0 - g);
	col = vec4((pv.rgb * g + col.rgb * col.a * (1.0 - g)) / max(1e-4, a), a);
	COLOR = col;
}"""

var _glass := ColorRect.new()
var _top := Control.new()
var _mat := ShaderMaterial.new()
var _names: Array[String] = []
var _cols: Array[Color] = []
## Whose eyes (director.pov), and the visor's opacity (transition: opacity 0.12s).
var _by := -1
var _k := 0.0
## Canvas units per CSS pixel, measured when the em or the size changes.
var _em := -1.0
var _size := Vector2.ZERO
var _px := 1.0
## The recording dot's clock (pvRec: 1s, blinking).
var _rec := 0.0


func _init() -> void:
	super()
	var sh := Shader.new()
	sh.code = GLASS
	_mat.shader = sh
	_glass.material = _mat
	_glass.set_anchors_preset(Control.PRESET_FULL_RECT)
	_glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glass.color = Color.WHITE
	add_child(_glass)
	_top.set_anchors_preset(Control.PRESET_FULL_RECT)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.draw.connect(func() -> void: _paint(_top))
	add_child(_top)
	visible = false


## hud.ts update: the names and colours, copied for the tag (sim idle).
func start(mm) -> void:
	_names.clear()
	_cols.clear()
	for i in 2:
		var spec = mm.specs[i]
		_names.append(str(spec.name_).to_upper())
		_cols.append(HudKit.bar_colors(spec.paint)[0])
	_by = -1
	_k = 0.0
	visible = false


func stop() -> void:
	_by = -1
	_k = 0.0
	visible = false


func tick(dt: float) -> void:
	var pov := -1
	if hud != null and hud.game != null and hud.game.get("director") != null:
		pov = int(hud.game.director.pov)
	if pov >= _names.size():
		pov = -1
	if pov >= 0:
		_by = pov
	_k = move_toward(_k, 1.0 if pov >= 0 else 0.0, dt / 0.12)
	visible = _k > 0.0 and _by >= 0
	if not visible:
		return
	_rec = fmod(_rec + dt, 1.0)
	# color-mix(in srgb, var(--pv) 30%, transparent)
	_mat.set_shader_parameter("pv", Color(_cols[_by], 0.3))
	var e := em()
	if e != _em or size != _size:
		_em = e
		_size = size
		_px = HudCoach.px(self)
		_mat.set_shader_parameter("view", size)
		_mat.set_shader_parameter("px", _px)
	_glass.modulate.a = HudKit.ease_css(_k)
	_top.queue_redraw()


## The brackets and the tag, over the glass.
func _paint(ci: Control) -> void:
	if _by < 0:
		return
	var a := HudKit.ease_css(_k)
	var p := _px
	var vmin := minf(size.x, size.y) / 100.0
	var pv := _cols[_by]
	# corner brackets (.pv-c and ::after mirrored): 22px arms, 2px thick, color-mix(pv 70%, white
	# 10%) (80% in all: 0.8 alpha), at 0.75
	var b := (Color(pv.r, pv.g, pv.b) * 0.7 + Color.WHITE * 0.1) / 0.8
	b.a = 0.8 * 0.75 * a
	var iy := maxf(4.5 * vmin, 18.0 * p)
	var ix := maxf(4.0 * vmin, 14.0 * p)
	var arm := 22.0 * p
	var th := 2.0 * p
	var l := ix
	var r := size.x - ix
	var t := iy
	var bt := size.y - iy
	for c in [[l, t, 1.0, 1.0], [r, t, -1.0, 1.0], [l, bt, 1.0, -1.0], [r, bt, -1.0, -1.0]]:
		var x: float = c[0]
		var y: float = c[1]
		var sx: float = c[2]
		var sy: float = c[3]
		ci.draw_rect(Rect2(minf(x, x + sx * arm), minf(y, y + sy * th), arm, th), b)
		ci.draw_rect(Rect2(minf(x, x + sx * th), minf(y, y + sy * arm), th, arm), b)
	# the tag: a blinking red dot, the bot's name and CAM in its colour (.pv-tag: 0.78em,
	# letter-spaced 0.14em, uppercase, max(17vmin, 92px) off the bottom)
	var e := em()
	var fs := 0.78 * e
	var font := HudKit.broadcast()
	var isz := roundi(fs)
	var csz := roundi(0.85 * fs)
	var name_ := _names[_by] + " "
	var dot := 0.55 * fs
	var nw := _spaced(null, font, Vector2.ZERO, name_, isz, 0.14 * fs, Color.WHITE)
	var cw := _spaced(null, font, Vector2.ZERO, "CAM", csz, 0.14 * 0.85 * fs, Color.WHITE)
	var tw := dot + 0.5 * fs + nw + cw
	var base := size.y - maxf(17.0 * vmin, 92.0 * p) - 1.25 * fs * 0.5 + (font.get_ascent(isz) - font.get_descent(isz)) * 0.5
	var x0 := (size.x - tw) * 0.5
	# pvRec: steps(2, jump-none) on 50% { opacity .25 }: lit, dim from 0.25s to 0.75s
	var dim := 0.25 if _rec >= 0.25 and _rec < 0.75 else 1.0
	var dc := Vector2(x0 + dot * 0.5, base - 0.08 * fs - dot * 0.5)
	ci.draw_circle(dc, dot * 0.5 + 4.0 * p, Color(DOT, 0.18 * dim * a))
	ci.draw_circle(dc, dot * 0.5 + 2.0 * p, Color(DOT, 0.3 * dim * a))
	ci.draw_circle(dc, dot * 0.5, Color(DOT, dim * a))
	var nx := x0 + dot + 0.5 * fs
	# text-shadow: 0 1px 4px rgba(0,0,0,.7)
	var sh := Color(0, 0, 0, 0.7 * 0.35 * a)
	var ow := maxi(2, roundi(4.0 * p))
	_spaced(ci, font, Vector2(nx, base + p), name_, isz, 0.14 * fs, sh, ow)
	_spaced(ci, font, Vector2(nx, base), name_, isz, 0.14 * fs, Color(1, 1, 1, 0.82 * a))
	_spaced(ci, font, Vector2(nx + nw, base + p), "CAM", csz, 0.14 * 0.85 * fs, sh, ow)
	_spaced(ci, font, Vector2(nx + nw, base), "CAM", csz, 0.14 * 0.85 * fs, Color(pv, a))


## Letter-spaced text (letter-spacing: `sp` after every character), drawn on `ci` when given (as
## an outline `outline` wide when that's set); returns its width.
static func _spaced(ci: CanvasItem, font: Font, at: Vector2, s: String, fs: int, sp: float, col: Color, outline := 0) -> float:
	var x := at.x
	for i in s.length():
		var c := s.unicode_at(i)
		if ci != null:
			if outline > 0:
				ci.draw_char_outline(font, Vector2(x, at.y), String.chr(c), fs, outline, col)
			else:
				ci.draw_char(font, Vector2(x, at.y), String.chr(c), fs, col)
		x += font.get_char_size(c, fs).x + sp
	return x - at.x
