## The centre-hung screens (src/render/venue.ts Scoreboard): the arena logo between fights, the
## bot walking out during the intro, the live score while a fight is on. The web draws a 512x288
## canvas; here a SubViewport draws the same layout and its texture goes on the baked
## `scoreScreen` mesh. It only redraws when what it shows changes, at most five times a second.
class_name Scoreboard
extends SubViewport

const W := 512
const H := 288
const BLUE := ["#d8fbff", "#22b8f0"]
const ORANGE := ["#ffd08a", "#ff6a12"]

var _key := ""
var _wait := 0.0
## What to draw: null for the logo, else the score state (see update()).
var _s = null
var _canvas: _Board
var _grad: Array[_GradText] = []
var _font: FontVariation


func _init() -> void:
	size = Vector2i(W, H)
	disable_3d = true
	transparent_bg = false
	render_target_update_mode = SubViewport.UPDATE_ONCE
	_font = FontVariation.new()
	_font.base_font = ThemeDB.fallback_font
	# Russo One stands in for a heavy display face: the fallback font, emboldened
	_font.variation_embolden = 0.9
	_canvas = _Board.new()
	_canvas.board = self
	_canvas.size = Vector2(W, H)
	add_child(_canvas)
	for i in 2:
		var g := _GradText.new()
		g.font = _font
		g.size = Vector2(W, H)
		_canvas.add_child(g)
		_grad.append(g)
	var fin := _Finish.new()
	fin.size = Vector2(W, H)
	_canvas.add_child(fin)
	_logo()


## Put the screens on `mi` (the baked scoreScreen mesh), keeping its colour (glow 1.3).
func attach(mi: MeshInstance3D) -> void:
	if mi == null or mi.mesh == null:
		return
	var old := mi.mesh.surface_get_material(0) as ShaderMaterial
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/venue/scoreboard.gdshader")
	if old:
		m.set_shader_parameter("color", old.get_shader_parameter("color"))
	m.set_shader_parameter("map", get_texture())
	mi.mesh.surface_set_material(0, m)


## venue.ts Scoreboard.update: `s` is null (logo) or a Dictionary {names: [a, b], hp: [0..1, 0..1],
## clock, phase, presenting (-1 when nobody is being presented)}.
func update(dt: float, s) -> void:
	_wait -= dt
	if _wait > 0.0:
		return
	_wait = 0.2
	var key := "logo"
	if s != null:
		key = "%s,%s|%d,%d|%d|%s|%d" % [s.names[0], s.names[1], ceili(s.hp[0] * 50.0), ceili(s.hp[1] * 50.0), ceili(s.clock), s.phase, int(s.get("presenting", -1))]
	if key == _key:
		return
	_key = key
	_s = s
	if s == null:
		_logo()
	elif s.phase == "intro" and int(s.get("presenting", -1)) >= 0:
		var p := int(s.presenting)
		_present(s.names[p], p)
	else:
		_score()


func _logo() -> void:
	_canvas.mode = 0
	_grad[0].show_text("BATTLE", 256, 102, 76, ORANGE, 60, 145)
	_grad[1].show_text("BOTS", 256, 188, 76, BLUE, 150, 230)
	_redraw()


func _present(name_: String, side: int) -> void:
	_canvas.mode = 1
	_canvas.side = side
	_canvas.name_ = name_
	var n := name_.to_upper()
	_grad[0].show_text(n, 256, 150, 58 if n.length() > 10 else 82, ORANGE if side == 1 else BLUE, 100, 200, 460)
	_grad[1].show_text("", 0, 0, 1, BLUE, 0, 1)
	_redraw()


func _score() -> void:
	_canvas.mode = 2
	_grad[0].show_text("", 0, 0, 1, BLUE, 0, 1)
	_grad[1].show_text("", 0, 0, 1, BLUE, 0, 1)
	_redraw()


func _redraw() -> void:
	_canvas.queue_redraw()
	render_target_update_mode = SubViewport.UPDATE_ONCE


## Draws `s` centred/left/right on (x, y) as the canvas does with textBaseline "middle", squeezed
## sideways to `max_w` like fillText's maxWidth.
static func text(ci: CanvasItem, font: Font, s: String, x: float, y: float, fs: int, col: Color, align := 0, max_w := 0.0) -> void:
	var w := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var k := 1.0
	if max_w > 0.0 and w > max_w:
		k = max_w / w
	var x0 := x - w * k * 0.5 if align == 0 else (x if align < 0 else x - w * k)
	var base := y + (font.get_ascent(fs) - font.get_descent(fs)) * 0.5
	# (only a sideways scale: the gradient text's shader reads the glyphs' own heights)
	if k < 1.0:
		ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2(k, 1.0))
	ci.draw_string(font, Vector2(x0 / k, base), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	if k < 1.0:
		ci.draw_set_transform(Vector2.ZERO)


## The board itself: background, stripes, score or presenter, frame and scan lines.
class _Board extends Control:
	var board: Scoreboard
	## 0 logo, 1 presenting, 2 score
	var mode := 0
	var side := 0
	var name_ := ""

	func _draw() -> void:
		var f := board._font
		# frame(): a dark gradient with faint diagonal stripes in the corner colours
		draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(W, 0), Vector2(W, H), Vector2(0, H)]),
			PackedColorArray([Color("#0b1222"), Color("#0b1222"), Color("#05070d"), Color("#05070d")]))
		for i in range(-6, 16):
			var c := Color("#ff6a1a") if i % 2 else Color("#22c8f0")
			c.a = 0.14
			draw_colored_polygon(PackedVector2Array([Vector2(i * 45, H), Vector2(i * 45 + 20, H), Vector2(i * 45 + 120, 0), Vector2(i * 45 + 100, 0)]), c)
		if mode == 1:
			var col: Array = ORANGE if side == 1 else BLUE
			draw_rect(Rect2(40, 70, 432, 4), Color(col[1]))
			draw_rect(Rect2(40, 226, 432, 4), Color(col[1]))
			Scoreboard.text(self, f, "IN THE ORANGE CORNER" if side == 1 else "IN THE BLUE CORNER", 256, 44, 24, Color("#d8dde6"))
			Scoreboard.text(self, f, "MAIN EVENT", 256, 256, 20, Color("#8f9bb3"))
		elif mode == 2:
			_score(f, board._s)

	func _score(f: Font, s) -> void:
		var cols := [Color("#ff7a1f"), Color("#3fe0ff")]
		for i in 2:
			var left := i == 0
			var x0 := 24.0 if left else 276.0
			draw_rect(Rect2(x0, 30, 212, 6), cols[i])
			Scoreboard.text(self, f, String(s.names[i]).to_upper(), x0 if left else x0 + 212.0, 66, 30, Color.WHITE, -1 if left else 1, 212.0)
			# health bar
			draw_rect(Rect2(x0, 96, 212, 22), Color(1, 1, 1, 0.12))
			var hp: float = s.hp[i]
			var w := 212.0 * clampf(hp, 0.0, 1.0)
			draw_rect(Rect2(x0 if left else x0 + 212.0 - w, 96, w, 22), Color("#ff3b30") if hp < 0.25 else cols[i])
			Scoreboard.text(self, f, "%d%%" % ceili(hp * 100.0), x0 if left else x0 + 212.0, 138, 22, Color("#d8dde6"), -1 if left else 1)
		var t := ceili(s.clock)
		var ph: String = s.phase
		var label := "FINAL"
		if ph == "fight" or ph == "greet" or ph == "countdown":
			label = "%d:%02d" % [t / 60, t % 60]
		elif ph == "intro":
			label = "VS"
		Scoreboard.text(self, f, label, 256, 214, 74, Color("#ff5a3a") if ph == "fight" and t <= 10 else Color.WHITE)
		var sub := "RESULT"
		if ph == "fight" or ph == "greet":
			sub = "ROUND 1"
		elif ph == "countdown":
			sub = "GET READY"
		elif ph == "intro":
			sub = "MAIN EVENT"
		Scoreboard.text(self, f, sub, 256, 160, 18, Color("#8f9bb3"))


## finish(): a thin frame and scan lines, over everything else.
class _Finish extends Control:
	func _draw() -> void:
		draw_rect(Rect2(7, 7, 498, 274), Color(1, 1, 1, 0.6), false, 3.0)
		for y in range(0, H, 3):
			draw_rect(Rect2(0, y, W, 1), Color(0, 0, 0, 0.3))


## One line of text filled with a vertical gradient (the logo and the presented bot's name).
class _GradText extends Control:
	const SHADER := """
shader_type canvas_item;
uniform vec4 top : source_color;
uniform vec4 bottom : source_color;
uniform vec2 span = vec2(0.0, 1.0);
varying float v_y;
void vertex() { v_y = VERTEX.y; }
void fragment() {
	float a = COLOR.a;
	COLOR = vec4(mix(top.rgb, bottom.rgb, clamp((v_y - span.x) / (span.y - span.x), 0.0, 1.0)), a);
}
"""
	static var _shader: Shader
	var font: Font
	var _s := ""
	var _x := 0.0
	var _y := 0.0
	var _fs := 1
	var _max_w := 0.0

	func _init() -> void:
		if _shader == null:
			_shader = Shader.new()
			_shader.code = SHADER
		material = ShaderMaterial.new()
		material.shader = _shader
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func show_text(s: String, x: float, y: float, fs: int, cols: Array, y0: float, y1: float, max_w := 0.0) -> void:
		_s = s
		_x = x
		_y = y
		_fs = fs
		_max_w = max_w
		material.set_shader_parameter("top", Color(cols[0]))
		material.set_shader_parameter("bottom", Color(cols[1]))
		material.set_shader_parameter("span", Vector2(y0, y1))
		queue_redraw()

	func _draw() -> void:
		if _s != "":
			Scoreboard.text(self, font, _s, _x, _y, _fs, Color.WHITE, 0, _max_w)
