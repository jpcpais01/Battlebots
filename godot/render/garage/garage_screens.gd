## The three desk monitors (src/render/garage.ts drawScreens): the robot on the lift with its name
## and power, live servo-load graphs and a scrolling system log. The web draws a 768x160 canvas
## that the three screens share; here a SubViewport draws the same thing and its texture goes on
## the baked `screens` mesh. Only redrawn when it changes (every 0.3 s, and when the bot does).
class_name GarageScreens
extends SubViewport

const W := 768
const H := 160
const W3 := 256
const WORDS := ["torque", "servo", "gyro", "hydraulics", "core temp", "actuator", "firmware", "balance", "plating", "reflex net"]

var bot_name := ""
var bot_power := 0.0
## Two servo-load lines (32 samples at most) and the log's last nine lines.
var graph := [[], []]
var lines: Array[String] = []
var rng := TMath.Rng.new(77.0)
var _canvas: _Canvas
var _font: Font
var _bold: FontVariation
var _mono: SystemFont


func _init() -> void:
	size = Vector2i(W, H)
	disable_3d = true
	transparent_bg = false
	render_target_update_mode = SubViewport.UPDATE_ONCE
	_font = ThemeDB.fallback_font
	# Russo One (the bot's name) stands in as the fallback face, emboldened, as on the scoreboard
	_bold = FontVariation.new()
	_bold.base_font = _font
	_bold.variation_embolden = 0.9
	_mono = SystemFont.new()
	_mono.font_names = PackedStringArray(["monospace", "DejaVu Sans Mono", "Droid Sans Mono", "Courier New"])
	_canvas = _Canvas.new()
	_canvas.screens = self
	_canvas.size = Vector2(W, H)
	add_child(_canvas)


## Put the screens on `mi` (the baked mesh), keeping its colour (glow 1.5, not tone mapped).
func attach(mi: MeshInstance3D) -> void:
	if mi == null or mi.mesh == null:
		return
	var old := mi.mesh.surface_get_material(0) as ShaderMaterial
	var m := ShaderMaterial.new()
	# (the same as the scoreboard's: an unlit canvas screen, sRGB decoded by hand)
	m.shader = preload("res://render/venue/scoreboard.gdshader")
	m.set_shader_parameter("color", old.get_shader_parameter("color") if old else Vector3(1.5, 1.5, 1.5))
	m.set_shader_parameter("map", get_texture())
	mi.mesh.surface_set_material(0, m)


## garage.ts drawScreens: a new sample on each graph and a new log line, then redraw.
func step() -> void:
	for gi in 2:
		var line: Array = graph[gi]
		var last: float = line[-1] if not line.is_empty() else 35.0
		line.append(maxf(5.0, minf(70.0, last + rng.range_(-9.0, 9.0))))
		if line.size() > 32:
			line.pop_front()
	lines.append("> %s %s %d.%d" % [rng.pick(WORDS), "ok" if rng.chance(0.85) else "tuned", int(rng.int_(10.0, 99.0)), int(rng.int_(0.0, 9.0))])
	if lines.size() > 9:
		lines.pop_front()
	redraw()


func redraw() -> void:
	_canvas.queue_redraw()
	render_target_update_mode = SubViewport.UPDATE_ONCE


class _Canvas extends Control:
	var screens: GarageScreens

	func _draw() -> void:
		var s := screens
		# screen 1: the robot on the lift
		draw_rect(Rect2(0, 0, W3, H), Color("#06121c"))
		var cyan := Color(42 / 255.0, 216 / 255.0, 1.0, 0.85)
		draw_rect(Rect2(108, 18, 40, 30), cyan, false, 2.0)
		draw_rect(Rect2(92, 52, 72, 54), cyan, false, 2.0)
		for seg in [[92, 58, 70, 100], [164, 58, 186, 100], [108, 106, 102, 150], [148, 106, 154, 150]]:
			draw_line(Vector2(seg[0], seg[1]), Vector2(seg[2], seg[3]), cyan, 2.0)
		draw_string(s._font, Vector2(10, 18), "SYSTEM CHECK", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(42 / 255.0, 216 / 255.0, 1.0, 0.6))
		draw_string(s._bold, Vector2(10, 142), s.bot_name.to_upper().substr(0, 16), HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("#ffb43a"))
		var pwr := "PWR %d  ·  OK" % int(s.bot_power) if s.bot_power != 0.0 else "OK"
		draw_string(s._font, Vector2(176, 18), pwr, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#52ff6a"))
		# screen 2: servo load graphs
		var x0 := float(W3)
		draw_rect(Rect2(x0, 0, W3, H), Color("#060e14"))
		for y in range(20, H, 20):
			draw_line(Vector2(x0, y), Vector2(x0 + W3, y), Color(1, 1, 1, 0.06), 1.0)
		for gi in 2:
			var line: Array = s.graph[gi]
			if line.size() < 2:
				continue
			var pts := PackedVector2Array()
			for i in line.size():
				pts.append(Vector2(x0 + i * 8, 20 + gi * 70 + float(line[i])))
			draw_polyline(pts, Color("#ff7a1a") if gi else Color("#52ff6a"), 2.0, true)
		draw_string(s._font, Vector2(x0 + 8, 14), "SERVO LOAD  L / R", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.5))
		# screen 3: log
		var x1 := float(W3 * 2)
		draw_rect(Rect2(x1, 0, W3, H), Color("#05100a"))
		for i in s.lines.size():
			var c := Color("#b8ffcc") if i == s.lines.size() - 1 else Color(82 / 255.0, 1.0, 106 / 255.0, 0.7)
			draw_string(s._mono, Vector2(x1 + 8, 18 + i * 16), s.lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, c)
