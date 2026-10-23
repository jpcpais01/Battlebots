## The buttons bottom right (hud.ts build's hud-br): camera zoom and fight speed.
## Round dark glass like the pause button (style.css .icon-btn): the zoom a pill with its icon and
## the framing's name, the speed a circle with 1x, 2x or ½x.
class_name HudControls
extends HudPart

var _zoom := Button.new()
var _speed := Button.new()
var _boxes := {}
var _em := -1.0
var _w := -1.0
var _h := -1.0
var _zoom_shown := ""
var _speed_shown := -1.0


func _init() -> void:
	super()
	for b in [_zoom, _speed] as Array[Button]:
		b.theme = UiTheme.theme()
		b.theme_type_variation = &"IconBtn"
		b.focus_mode = Control.FOCUS_NONE
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.mouse_filter = Control.MOUSE_FILTER_STOP
		b.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
		b.alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.expand_icon = false
		b.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		var boxes: Array[StyleBoxFlat] = []
		for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled"]:
			var sb := UiTheme.theme().get_stylebox(s, &"IconBtn").duplicate() as StyleBoxFlat
			b.add_theme_stylebox_override(s, sb)
			boxes.append(sb)
		b.add_theme_stylebox_override(&"focus", StyleBoxEmpty.new())
		_boxes[b] = boxes
		UiTheme.press_feedback(b, 0.9)
		add_child(b)
	_zoom.add_theme_font_override(&"font", HudKit.body(700))
	_speed.add_theme_font_override(&"font", HudKit.body(750))
	_zoom.pressed.connect(_cycle_zoom)
	_speed.pressed.connect(_cycle_speed)


func start(_m) -> void:
	_em = -1.0
	_sync()


## hud.ts cycleZoom: close -> normal -> wide -> close, kept for next time.
func _cycle_zoom() -> void:
	var g := hud.game
	if g == null:
		return
	var d = g.director
	var z: String = d.zoom
	var next := "normal" if z == "close" else "wide" if z == "normal" else "close"
	d.zoom = next
	if "settings" in g and g.settings != null:
		g.settings.set_zoom(next)
	_sync()
	_tap()


## hud.ts cycleSpeed: 1x -> 2x -> 0.5x -> 1x.
func _cycle_speed() -> void:
	var g := hud.game
	if g == null:
		return
	var s: float = g.speed
	g.speed = 2.0 if s == 1.0 else 0.5 if s == 2.0 else 1.0
	_sync()
	_tap()


func _tap() -> void:
	if hud.game.get("sfx") != null:
		hud.game.sfx.ui("tap")


## hud.ts syncZoom and the speed button's text, from what the Game has now.
func _sync() -> void:
	var g := hud.game if hud != null else null
	if g == null:
		return
	var z: String = g.director.zoom
	var s: float = g.speed
	if z == _zoom_shown and s == _speed_shown:
		return
	_zoom_shown = z
	_speed_shown = s
	_zoom.text = "Close" if z == "close" else "Wide" if z == "wide" else "Normal"
	_speed.text = "½×" if s == 0.5 else "%d×" % int(s) if s == floorf(s) else "%s×" % s
	_em = -1.0


func tick(_dt: float) -> void:
	# (the pause menu's settings may change the zoom too)
	_sync()
	# (a replay has its own speeds, in its controls)
	_speed.visible = not hud.replay
	var e := em()
	if e == _em and size.x == _w and size.y == _h:
		return
	_em = e
	_w = size.x
	_h = size.y
	_layout()


## style.css .hud-br (right and bottom margins, 0.45em apart, tops aligned), .icon-btn (2.6em of
## its own type, round), .icon-btn.zoom (0.86em type, 0.9em padding, a 1.15em icon 0.35em off the
## word) and .icon-btn.speed (0.92em type).
func _layout() -> void:
	var p := HudCoach.px(self)
	var bw := maxi(1, roundi(p))
	# the zoom pill
	var zf := 0.86 * _em
	var zh := 2.6 * zf
	var glyph := maxi(8, roundi(1.15 * zf))
	_zoom.icon = UiTheme.icon("zoom", glyph)
	_zoom.add_theme_constant_override(&"icon_max_width", glyph)
	_zoom.add_theme_constant_override(&"h_separation", roundi(0.35 * zf))
	_zoom.add_theme_font_size_override(&"font_size", roundi(zf))
	for sb: StyleBoxFlat in _boxes[_zoom]:
		sb.set_corner_radius_all(maxi(0, int(floor(zh * 0.5)) - 1))
		sb.set_border_width_all(bw)
		sb.content_margin_left = 0.9 * zf
		sb.content_margin_right = 0.9 * zf
		sb.content_margin_top = 0.0
		sb.content_margin_bottom = 0.0
	_zoom.custom_minimum_size = Vector2(0, zh)
	_zoom.size = Vector2.ZERO
	_zoom.size = _zoom.get_combined_minimum_size()
	# the speed circle
	var sf := 0.92 * _em
	var sh := 2.6 * sf
	_speed.add_theme_font_size_override(&"font_size", roundi(sf))
	for sb: StyleBoxFlat in _boxes[_speed]:
		sb.set_corner_radius_all(maxi(0, int(floor(sh * 0.5)) - 1))
		sb.set_border_width_all(bw)
		sb.set_content_margin_all(0.0)
	_speed.custom_minimum_size = Vector2(sh, sh)
	_speed.size = Vector2(sh, sh)
	# along the bottom right, inside the side strip
	var right := size.x - side()
	var top := size.y - bottom() - maxf(zh, sh)
	# (both phones play an online fight at the same pace, so it has no speed control)
	_speed.visible = not hud.online
	_speed.position = Vector2(right - sh, top)
	_zoom.position = Vector2((right - sh - 0.45 * _em if _speed.visible else right) - _zoom.size.x, top)
	_speed.pivot_offset = _speed.size * 0.5
	_zoom.pivot_offset = _zoom.size * 0.5
