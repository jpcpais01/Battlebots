## What the fight HUD's parts share (src/style.css's HUD rules): the em they're all sized in, the
## two faces, the colours, the CSS easings and a few drawing helpers.
class_name HudKit
extends RefCounted

## style.css colours (--cyan, --red, --green, --amber, --text, --text-2).
const CYAN := Color(0.165, 0.847, 1.0)
const RED := Color(1.0, 0.278, 0.4)
const GREEN := Color(0.243, 0.878, 0.561)
const AMBER := Color(1.0, 0.706, 0.227)
const TEXT := Color(0.957, 0.965, 0.98)
const TEXT_2 := Color(0.702, 0.733, 0.788)
## The two corners' colours where a bot's own paint isn't used (blue corner, orange corner).
const BLUE := Color(0.235, 0.545, 1.0)
const ORANGE := Color(1.0, 0.478, 0.102)


## The screen as the HUD measures it: the window's size, the CSS pixel ratio (the screen's density),
## the screen's size and the safe area round the notch and the gesture bar. Read from the
## DisplayServer once and kept: em() and the margins are asked for several times a frame, and on
## Android the safe area is a call into Java. Read again when the root viewport changes size (a
## new window size or a turn of the phone), and every couple of seconds anyway, as Android can
## report the cutout's insets a moment after the first frames.
static var _win := Vector2.ZERO
static var _dpr := 1.0
static var _screen := Vector2i.ZERO
static var _safe := Rect2i()
static var _read_ms := -1
static var _hooked := false
## How old the kept reading may get (ms) before it is read again anyway.
const REREAD_MS := 2000


## The kept reading, read again when it's gone stale.
static func _display() -> void:
	if _read_ms < 0 or Time.get_ticks_msec() - _read_ms >= REREAD_MS:
		_read_display()


static func _read_display() -> void:
	_read_ms = Time.get_ticks_msec()
	_win = Vector2(DisplayServer.window_get_size())
	if OS.has_feature("mobile"):
		# (Android's CSS pixel is 1/160 inch: window.devicePixelRatio = dpi / 160)
		_dpr = maxf(1.0, DisplayServer.screen_get_dpi() / 160.0)
	else:
		_dpr = maxf(1.0, DisplayServer.screen_get_scale())
	_screen = DisplayServer.screen_get_size()
	_safe = DisplayServer.get_display_safe_area()
	if not _hooked:
		var tree := Engine.get_main_loop() as SceneTree
		if tree != null and tree.root != null:
			_hooked = true
			tree.root.size_changed.connect(_read_display)


## The window's size in screen pixels (zero where there's no window: headless).
static func window_size() -> Vector2:
	_display()
	return _win


## The screen's pixels per CSS pixel (window.devicePixelRatio).
static func css_ratio() -> float:
	_display()
	return _dpr


## The screen's size in its own pixels, and the part of it clear of the notch and the gesture bar.
static func screen_size() -> Vector2i:
	_display()
	return _screen


static func safe_area() -> Rect2i:
	_display()
	return _safe


## style.css --fs, the web HUD's em, in this control's canvas units: clamp(11.5px, 1.48vh + 0.42vw,
## 17px) of the screen as a browser on this phone would measure it (CSS pixels: the screen's
## pixels over its density), then scaled into the canvas. So the HUD takes the same share of the
## screen as the web game's does on the same phone: 16 on a 1280x720 desktop window, about 20 on
## a landscape phone, whose small CSS viewport hits the 11.5px floor.
static func em(c: Control) -> float:
	return em_for(c.size)


## em() for a full-screen control `view` canvas units big.
static func em_for(view: Vector2) -> float:
	var h := view.y if view.y > 0.0 else 720.0
	var w := view.x if view.x > 0.0 else 1280.0
	var win := window_size()
	if win.x <= 0.0 or win.y <= 0.0:
		win = Vector2(w, h)
	var css := win / css_ratio()
	var fs := clampf(0.0148 * css.y + 0.0042 * css.x, 11.5, 17.0)
	return fs * h / css.y


## The menus' face (style.css --body) at a weight.
static func body(weight := 700) -> Font:
	return UiTheme.font(weight)


## style.css --broadcast: the fight graphics' one loud face (MenuKit.broadcast).
static func broadcast() -> Font:
	return MenuKit.broadcast()


## Two bar colours from a bot's paint (hud.ts barColors): [leading edge, outer end].
static func bar_colors(paint) -> Array[Color]:
	return ResultsView.bar_colors(paint)


## The CSS cubic-bezier(x1, y1, x2, y2) timing function at x (0..1).
static func bezier(x: float, x1: float, y1: float, x2: float, y2: float) -> float:
	if x <= 0.0:
		return 0.0
	if x >= 1.0:
		return 1.0
	# solve x(t) = x by Newton, then y(t)
	var t := x
	for i in 6:
		var mt := 1.0 - t
		var xt := 3.0 * mt * mt * t * x1 + 3.0 * mt * t * t * x2 + t * t * t
		var dx := 3.0 * mt * mt * x1 + 6.0 * mt * t * (x2 - x1) + 3.0 * t * t * (1.0 - x2)
		if absf(dx) < 1e-5:
			break
		t = clampf(t - (xt - x) / dx, 0.0, 1.0)
	var mt2 := 1.0 - t
	return 3.0 * mt2 * mt2 * t * y1 + 3.0 * mt2 * t * t * y2 + t * t * t


## style.css --ease: cubic-bezier(0.2, 0.8, 0.2, 1).
static func ease(x: float) -> float:
	return bezier(x, 0.2, 0.8, 0.2, 1.0)


## CSS ease-out (cubic-bezier(0, 0, 0.58, 1)).
static func ease_out(x: float) -> float:
	return bezier(x, 0.0, 0.0, 0.58, 1.0)


## CSS ease-in (cubic-bezier(0.42, 0, 1, 1)).
static func ease_in(x: float) -> float:
	return bezier(x, 0.42, 0.0, 1.0, 1.0)


## CSS ease (cubic-bezier(0.25, 0.1, 0.25, 1)).
static func ease_css(x: float) -> float:
	return bezier(x, 0.25, 0.1, 0.25, 1.0)


## A CSS @keyframes track at time `t` seconds into an animation `dur` long: `stops` is
## [[offset 0..1, value], ...] (float, Vector2 or Color values), eased between stops by `easing`
## (a Callable taking 0..1, or null for linear), as a browser applies animation-timing-function to
## each keyframe interval. Before the start it holds the first value, after the end the last
## (animation-fill-mode: both).
static func keyframes(t: float, dur: float, stops: Array, easing = null) -> Variant:
	var x := clampf(t / dur, 0.0, 1.0) if dur > 0.0 else 1.0
	if x <= float(stops[0][0]):
		return stops[0][1]
	for k in range(1, stops.size()):
		if x <= float(stops[k][0]):
			var a: Array = stops[k - 1]
			var b: Array = stops[k]
			var u: float = (x - float(a[0])) / maxf(1e-6, float(b[0]) - float(a[0]))
			if easing != null:
				u = (easing as Callable).call(u)
			return lerp(a[1], b[1], u)
	return stops[-1][1]


## Text with a soft drop shadow (CSS text-shadow 0 2px 8px rgba(0,0,0,.8)), left-aligned at its
## baseline `at`.
static func text(ci: CanvasItem, font: Font, at: Vector2, s: String, fs: float, col: Color, shadow := 0.8) -> void:
	var px := int(round(fs))
	if shadow > 0.0:
		ci.draw_string_outline(font, at + Vector2(0, fs * 0.12), s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, maxi(2, int(fs * 0.35)), Color(0, 0, 0, shadow * 0.35 * col.a))
	ci.draw_string(font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, px, col)


## The width of `s` in `font` at `fs`.
static func width(font: Font, s: String, fs: float) -> float:
	return font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, int(round(fs))).x
