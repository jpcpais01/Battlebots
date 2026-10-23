## The instant replay's broadcast graphics (game/replay/instant_replay.gd): the stinger that wipes
## across the screen into and out of it, the letterbox bars, the REPLAY bug with the result and
## how slow the picture runs, the caption (who threw what), the flash and the move's name stamped
## big as the blow lands, and "Tap to skip". Over the fight HUD (which is away meanwhile), under
## the app's screens and the pause menu.
class_name HudInstant
extends CanvasLayer

## The wipe: in, held over the cut for as long as the Game takes to make it, and out (s).
const WIPE_IN := 0.36
const WIPE_OUT := 0.42
## The stinger's body is this many screen widths long, its stripes ahead of it.
const BODY_W := 1.6
const STRIPES := [[0.055, 0], [0.018, 1], [0.04, 2]]
## The stamp: in, held, out (s).
const STAMP := [0.12, 1.1, 0.45]
const NAVY := Color(0.035, 0.05, 0.09)

## The player tapped the screen while the replay ran (the Game takes it).
var tapped := false
## The replay's words: the result ("KO"), the winner's name, the move's, its accent colour.
var result := "KO"
var who := ""
var move := ""
var accent := Color(1, 0.3, 0.3)
## How fast the picture runs (for the bug's readout).
var rate := 1.0

var _c := Control.new()
## 0 none, 1 in, 2 covering, 3 out.
var _wipe := 0
var _wt := 0.0
var _release := false
## The replay's graphics are up (eased 0..1), and whether they should be.
var _on := false
var _k := 0.0
var _t := 0.0
var _stamp_t := -1.0
var _flash := 0.0


func _init() -> void:
	layer = 3
	_c.set_anchors_preset(Control.PRESET_FULL_RECT)
	_c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_c.draw.connect(_draw)
	add_child(_c)


## Start the stinger across the screen. covered() is true once it hides the picture, and it stays
## there until uncover().
func wipe() -> void:
	_wipe = 1
	_wt = 0.0
	_release = false


func covered() -> bool:
	return _wipe == 2


func wiping() -> bool:
	return _wipe != 0


## The cut has been made: the stinger goes on off the screen.
func uncover() -> void:
	_release = true


## The replay's graphics up (or down).
func show_replay(on: bool) -> void:
	_on = on
	if on:
		_k = 1.0
		_t = 0.0
		_stamp_t = -1.0
		_flash = 0.0
		tapped = false


## The blow lands: a flash, and the move's name stamped across the middle.
func stamp() -> void:
	_stamp_t = 0.0
	_flash = 1.0


## Everything down at once (a new fight, the fight leaving the screen).
func clear() -> void:
	_wipe = 0
	show_replay(false)
	_k = 0.0
	_c.queue_redraw()


## A tap anywhere while the replay runs skips it (taken before any control: the HUD is away, and
## nothing over the fight should swallow it).
func _input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed)
	if tap and _on and _k > 0.0:
		tapped = true
		get_viewport().set_input_as_handled()


func _process(dt: float) -> void:
	if _wipe == 1:
		_wt += dt
		if _wt >= WIPE_IN:
			_wipe = 2
	elif _wipe == 2:
		if _release:
			_wipe = 3
			_wt = 0.0
	elif _wipe == 3:
		_wt += dt
		if _wt >= WIPE_OUT:
			_wipe = 0
	if not _on:
		_k = 0.0
	_t += dt
	if _stamp_t >= 0.0:
		_stamp_t += dt
		if _stamp_t > STAMP[0] + STAMP[1] + STAMP[2]:
			_stamp_t = -1.0
	_flash = maxf(0.0, _flash - dt / 0.22)
	if _wipe != 0 or _on or _k > 0.0:
		_c.queue_redraw()


func _draw() -> void:
	var sz := _c.size
	if _on or _k > 0.0:
		_draw_replay(sz)
	if _wipe != 0:
		_draw_wipe(sz)


func _draw_replay(sz: Vector2) -> void:
	var em := HudKit.em_for(sz)
	# the bars slide in over the first half second
	var bk := HudKit.ease(clampf(_t / 0.5, 0.0, 1.0))
	var bar := sz.y * 0.09 * bk
	_c.draw_rect(Rect2(0, 0, sz.x, bar), Color(0, 0, 0, 0.92))
	_c.draw_rect(Rect2(0, sz.y - bar, sz.x, bar), Color(0, 0, 0, 0.92))
	# a thin line of the winner's colour along each bar's edge
	_c.draw_rect(Rect2(0, bar - 2.0, sz.x * bk, 2.0), Color(accent, 0.85))
	_c.draw_rect(Rect2(sz.x * (1.0 - bk), sz.y - bar, sz.x * bk, 2.0), Color(accent, 0.85))
	var side := FightHud.side_margin(_c)
	var font := HudKit.broadcast()
	var small := MenuKit.broadcast(700)
	# the bug: a slanted red tag, a dot blinking on it, REPLAY, then the result on navy
	var bh := em * 2.0
	var by := bar + em * 0.9
	var slide := (1.0 - HudKit.ease(clampf((_t - 0.15) / 0.45, 0.0, 1.0))) * -(em * 14.0)
	var x := side + slide
	var sk := bh * 0.28
	var fs := em * 1.25
	var w1 := HudKit.width(font, "REPLAY", fs) + em * 2.6
	_para(Rect2(x, by, w1, bh), sk, HudKit.RED)
	var blink := 0.55 + 0.45 * cos(_t * TAU * 1.1)
	_c.draw_circle(Vector2(x + em * 1.1, by + bh * 0.5), em * 0.32, Color(1, 1, 1, blink))
	HudKit.text(_c, font, Vector2(x + em * 1.8, by + bh * 0.5 + fs * 0.36), "REPLAY", fs, HudKit.TEXT, 0.0)
	var word := result.to_upper()
	var w2 := HudKit.width(font, word, fs) + em * 1.6
	_para(Rect2(x + w1 - sk * 0.3, by, w2, bh), sk, NAVY)
	HudKit.text(_c, font, Vector2(x + w1 + em * 0.55, by + bh * 0.5 + fs * 0.36), word, fs, accent.lightened(0.15), 0.0)
	# how slow it runs, beside the bug
	var rs := em * 0.95
	HudKit.text(_c, small, Vector2(x + w1 + w2 + em * 0.6, by + bh * 0.5 + rs * 0.36), "%.2f×" % rate, rs, Color(HudKit.TEXT_2, 0.9), 0.8)
	# the caption above the bottom bar: who, then what
	var cy := sz.y - bar - em * 1.1
	var cfs := em * 1.35
	var ck := HudKit.ease(clampf((_t - 0.35) / 0.5, 0.0, 1.0))
	var cx := side + (1.0 - ck) * -em * 6.0
	if who != "":
		var name := who.to_upper()
		HudKit.text(_c, font, Vector2(cx, cy), name, cfs, Color(accent.lightened(0.2), ck))
		if move != "":
			var nx := cx + HudKit.width(font, name, cfs) + em * 0.6
			HudKit.text(_c, font, Vector2(nx, cy), "·  " + move.to_upper(), cfs, Color(HudKit.TEXT, ck))
	# tap to skip, quiet, on the right
	var tfs := em * 0.85
	var tip := "TAP TO SKIP"
	var tw := HudKit.width(small, tip, tfs)
	HudKit.text(_c, small, Vector2(sz.x - side - tw, sz.y - bar - em * 1.1), tip, tfs, Color(HudKit.TEXT_2, 0.55 * ck), 0.6)
	# the flash as the blow lands, and its name across the middle
	if _flash > 0.0:
		_c.draw_rect(Rect2(Vector2.ZERO, sz), Color(1, 1, 1, 0.45 * _flash * _flash))
	if _stamp_t >= 0.0 and move != "":
		var t := _stamp_t
		var a := 1.0
		var s := 1.0
		if t < STAMP[0]:
			var u := t / STAMP[0]
			a = u
			s = lerpf(1.9, 1.0, HudKit.ease_out(u))
		elif t > STAMP[0] + STAMP[1]:
			var u := (t - STAMP[0] - STAMP[1]) / STAMP[2]
			a = 1.0 - u
			s = 1.0 + 0.08 * u
		else:
			s = 1.0 + 0.04 * (t - STAMP[0]) / STAMP[1]
		var mfs := em * 3.4 * s
		var mw := move.to_upper()
		var ww := HudKit.width(font, mw, mfs)
		var at := Vector2(sz.x * 0.5 - ww * 0.5, sz.y * 0.56)
		_c.draw_string_outline(font, at, mw, HORIZONTAL_ALIGNMENT_LEFT, -1, int(mfs), maxi(3, int(mfs * 0.12)), Color(NAVY, 0.85 * a))
		_c.draw_string(font, at, mw, HORIZONTAL_ALIGNMENT_LEFT, -1, int(mfs), Color(1, 1, 1, a))
		# a stroke of the winner's colour under it
		var lw := ww * HudKit.ease(clampf(t / 0.35, 0.0, 1.0))
		_c.draw_rect(Rect2(sz.x * 0.5 - lw * 0.5, at.y + mfs * 0.22, lw, maxf(3.0, em * 0.22)), Color(accent, a))


## A parallelogram leaning right by `sk` across `r`.
func _para(r: Rect2, sk: float, col: Color) -> void:
	_c.draw_colored_polygon(PackedVector2Array([
		Vector2(r.position.x + sk, r.position.y), Vector2(r.end.x + sk, r.position.y),
		Vector2(r.end.x - sk, r.end.y), Vector2(r.position.x - sk, r.end.y)]), col)


## The stinger: stripes of the winner's colour, white and red ahead of a long navy body with
## REPLAY on it, sweeping left to right; the body hides the whole picture while it covers.
func _draw_wipe(sz: Vector2) -> void:
	var w := sz.x
	var sk := minf(sz.y * 0.32, sz.x * 0.2)
	var stripes := 0.0
	for s in STRIPES:
		stripes += float(s[0])
	# the leading edge's x (at the screen's vertical middle), in widths: covering at COVER
	var start := -0.1
	var cover := 1.0 + stripes + sk / w + 0.04
	var finish := cover + BODY_W + stripes + sk / w + 0.2
	var lead := cover
	if _wipe == 1:
		lead = lerpf(start, cover, HudKit.ease_out(clampf(_wt / WIPE_IN, 0.0, 1.0)))
	elif _wipe == 3:
		lead = lerpf(cover, finish, HudKit.ease_in(clampf(_wt / WIPE_OUT, 0.0, 1.0)))
	var x := lead * w
	var cols := [accent, Color(1, 1, 1), HudKit.RED]
	for s in STRIPES:
		var sw := float(s[0]) * w
		_band(x - sw, x, sk, sz.y, cols[int(s[1])])
		x -= sw
	_band(x - BODY_W * w, x, sk, sz.y, NAVY)
	# REPLAY across the body's middle, moving with it
	var em := HudKit.em_for(sz)
	var font := HudKit.broadcast()
	var fs := em * 3.0
	var word := "REPLAY"
	var ww := HudKit.width(font, word, fs)
	var cx := x - BODY_W * w * 0.5 - ww * 0.5
	cx = clampf(cx, x - BODY_W * w + em, x - ww - em)
	var cy := sz.y * 0.5 + fs * 0.36
	_c.draw_string(font, Vector2(cx, cy), word, HORIZONTAL_ALIGNMENT_LEFT, -1, int(fs), Color(1, 1, 1, 0.95))
	_c.draw_rect(Rect2(cx, cy + fs * 0.2, ww, maxf(3.0, em * 0.25)), accent)


## A band of the stinger from x0 to x1 (at mid height), leaning right by `sk` over the height.
func _band(x0: float, x1: float, sk: float, h: float, col: Color) -> void:
	var half := sk * 0.5
	_c.draw_colored_polygon(PackedVector2Array([
		Vector2(x0 + half, 0), Vector2(x1 + half, 0), Vector2(x1 - half, h), Vector2(x0 - half, h)]), col)
