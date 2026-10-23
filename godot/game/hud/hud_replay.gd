## A replay's media controls (src/ui/replayBar.ts, style.css .rbar): a scrubber with the fight's
## big moments marked on it (knockdowns, torn parts, the knockout), how much of it is ready to
## jump to at once, then restart, frame steps (while paused), jumps of five seconds, play /
## pause, the time, Results and a speed menu from a quarter speed to four times. Left alone while
## it plays, it fades back to just the scrubber. Next to the pause button, the REPLAY pill.
##
## The replay is the sim run again from its tape (game/replay/replay_run.gd), so this only reads
## where it is and asks the Game to go somewhere (Game.seek). Drawn by hand, one control.
class_name HudReplay
extends HudPart

## The Results button (the replay is over, or the player asked for it).
signal results_pressed

const SPEEDS := [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]
## How far the jump buttons (and arrow keys) go, in seconds.
const JUMP := 5.0
## A frame step: four sim steps, one frame of 30 fps video.
const STEP := 4
## Seconds without a touch before the controls fade back while playing.
const IDLE_HIDE := 3.5
const ORANGE := Color(1.0, 0.478, 0.102)
const AMBER := Color(1.0, 0.706, 0.227)
const RED := Color(1.0, 0.278, 0.4)
const DARK := Color(0.071, 0.047, 0.02)

var _bar := Control.new()
var _menu := Control.new()
var _pill := Control.new()
## The step on screen as last captured (the sim idle), and the replay's length.
var _frame := 0
var _end := 1
var _marks: Array = []
## The scrubber held: where to (-1: not held).
var _drag := -1
var _idle := 0.0
## The controls' fade (0 shown .. 1 just the scrubber), the play button's spinner, the pulse.
var _dim := 0.0
var _t := 0.0
var _menu_open := false
## Hit boxes in the bar: [id, Rect2].
var _hits: Array = []
var _pressed := ""
var _track := Rect2()
var _on := false


func _init() -> void:
	super()
	_bar.mouse_filter = Control.MOUSE_FILTER_STOP
	_bar.draw.connect(_draw_bar)
	_bar.gui_input.connect(_bar_input)
	add_child(_bar)
	_menu.mouse_filter = Control.MOUSE_FILTER_STOP
	_menu.draw.connect(_draw_menu)
	_menu.gui_input.connect(_menu_input)
	_menu.visible = false
	add_child(_menu)
	_pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pill.draw.connect(_draw_pill)
	add_child(_pill)
	visible = false


func start(m_) -> void:
	_on = hud.replay and _run() != null
	visible = _on
	if not _on:
		return
	var r := _run()
	_end = maxi(1, r.end)
	_marks = r.tape.get("marks", [])
	_frame = int(m_.frame)
	_drag = -1
	_menu_open = false
	_menu.visible = false


func stop() -> void:
	_on = false
	visible = false


func capture(m_) -> void:
	if _on:
		_frame = int(m_.frame)


func _run() -> ReplayRun:
	var g = hud.game if hud != null else null
	return g.replay if g != null and "replay" in g else null


func _shown() -> int:
	var r := _run()
	if _drag >= 0:
		return _drag
	return r.seek_to if r != null and r.seek_to >= 0 else _frame


func _ended() -> bool:
	var r := _run()
	return r != null and r.seek_to < 0 and _frame >= r.end


func _playing() -> bool:
	var r := _run()
	return r != null and not r.paused and not _ended()


# ------------------------------------------------------------------ transport

func _seek(frame: int) -> void:
	hud.game.seek(frame)
	_wake()


func _toggle() -> void:
	var r := _run()
	if _ended():
		# over: watch it again from the walkout
		hud.game.seek(0)
		r.paused = false
	else:
		r.paused = not r.paused
	_tap()
	_wake()


func _jump(seconds: float) -> void:
	_seek(_shown() + roundi(seconds / Game.SIM_DT))


## Step a frame, pausing first.
func _step(dir: int) -> void:
	var r := _run()
	r.paused = true
	if dir > 0 and r.seek_to < 0:
		r.owed = mini(r.owed + STEP, maxi(0, r.end - _frame))
	else:
		hud.game.seek(_shown() + dir * STEP)
	_tap()
	_wake()


func _set_speed(s: float) -> void:
	hud.game.speed = s
	_tap()
	_wake()


func _nudge_speed(dir: int) -> void:
	var i := SPEEDS.find(hud.game.speed)
	var at := SPEEDS.find(1.0) if i < 0 else i
	_set_speed(SPEEDS[clampi(at + dir, 0, SPEEDS.size() - 1)])


func _tap() -> void:
	if hud.game.get("sfx") != null:
		hud.game.sfx.ui("tap")


func _wake() -> void:
	_idle = 0.0


static func clock(frame: int) -> String:
	var s := maxi(0, floori(frame * Game.SIM_DT))
	return "%d:%02d" % [s / 60, s % 60]


static func speed_label(s: float) -> String:
	return ("%s" % s).trim_suffix(".0") + "×"


# ------------------------------------------------------------------ input

func _input(e: InputEvent) -> void:
	# any touch brings the controls back (replayBar.ts wake, on the window)
	if _on and (e is InputEventMouseButton or e is InputEventScreenTouch or (e is InputEventMouseMotion and _drag < 0 and (e as InputEventMouseMotion).button_mask != 0)):
		_idle = 0.0


func _unhandled_input(e: InputEvent) -> void:
	if not _on or not e is InputEventKey or not e.pressed or e.echo:
		return
	var k := e as InputEventKey
	if k.ctrl_pressed or k.meta_pressed or k.alt_pressed:
		return
	var used := true
	match k.keycode:
		KEY_SPACE, KEY_K:
			_toggle()
		KEY_LEFT, KEY_J:
			_jump(-JUMP)
		KEY_RIGHT, KEY_L:
			_jump(JUMP)
		KEY_COMMA:
			_step(-1)
		KEY_PERIOD:
			_step(1)
		KEY_BRACKETLEFT:
			_nudge_speed(-1)
		KEY_BRACKETRIGHT:
			_nudge_speed(1)
		KEY_HOME:
			_seek(0)
		_:
			used = false
	if used:
		get_viewport().set_input_as_handled()


func _frame_at(x: float) -> int:
	return roundi(clampf((x - _track.position.x) / maxf(1.0, _track.size.x), 0.0, 1.0) * _end)


func _bar_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var p: Vector2 = e.position
		if e.pressed:
			# the scrubber takes a touch anywhere along it (a little above and below the rail too)
			if _track.grow_individual(0, em() * 0.3, 0, em() * 0.15).has_point(p):
				_drag = _frame_at(p.x)
				_menu_open = false
			elif _dim < 0.5:
				_pressed = _hit(p)
			_bar.accept_event()
		else:
			if _drag >= 0:
				var f := _drag
				_drag = -1
				# a seek runs the fight to there, so it waits for the finger to come up
				_seek(f)
			elif _pressed != "" and _hit(p) == _pressed:
				_press(_pressed)
			_pressed = ""
			_bar.accept_event()
		_bar.queue_redraw()
	elif e is InputEventMouseMotion and _drag >= 0:
		_drag = _frame_at((e as InputEventMouseMotion).position.x)
		_bar.queue_redraw()
		_bar.accept_event()


func _hit(p: Vector2) -> String:
	for h in _hits:
		if (h[1] as Rect2).grow(em() * 0.1).has_point(p):
			return h[0]
	return ""


func _press(id: String) -> void:
	match id:
		"restart":
			_tap()
			_seek(0)
		"stepBack":
			_step(-1)
		"back5":
			_tap()
			_jump(-JUMP)
		"play":
			_toggle()
		"ahead5":
			_tap()
			_jump(JUMP)
		"stepAhead":
			_step(1)
		"results":
			_tap()
			_menu_open = false
			results_pressed.emit()
		"speed":
			_menu_open = not _menu_open
			_tap()
			_wake()


func _menu_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT and not e.pressed:
		var i := int(e.position.y / maxf(1.0, _menu.size.y / SPEEDS.size()))
		# (the fastest on top: column-reverse)
		var s: float = SPEEDS[clampi(SPEEDS.size() - 1 - i, 0, SPEEDS.size() - 1)]
		_menu_open = false
		_set_speed(s)
		_menu.accept_event()
	elif e is InputEventMouseButton:
		_menu.accept_event()


# ------------------------------------------------------------------ per frame

func tick(dt: float) -> void:
	if not _on:
		return
	_t += dt
	var playing := _playing()
	if playing and _drag < 0 and not _menu_open:
		_idle += dt
	else:
		_idle = 0.0
	var want := 1.0 if _idle > IDLE_HIDE else 0.0
	_dim = move_toward(_dim, want, dt / 0.35)
	_layout()
	_bar.queue_redraw()
	_pill.queue_redraw()
	_menu.visible = _menu_open and _dim < 0.5
	if _menu.visible:
		_menu.queue_redraw()


func _layout() -> void:
	var e := em()
	var w := size.x
	var pill_end := side() + 2.6 * e + 0.6 * e + _pill_w()
	var bw := minf(minf(44.0 * e, w * 0.6), w - 2.0 * (pill_end + 0.6 * e))
	bw = maxf(bw, minf(w - 2.0 * side(), 24.0 * e))
	var bh := 4.9 * e
	_bar.size = Vector2(bw, bh)
	_bar.position = Vector2((w - bw) * 0.5, size.y - maxf(10.0, bottom()) - bh)
	# the pill beside the pause button (hud.ts bl: the pause button, then .replay-pill)
	var ph := 1.9 * e
	_pill.size = Vector2(_pill_w(), ph)
	_pill.position = Vector2(side() + 2.6 * e + 0.6 * e, size.y - bottom() - 2.6 * e + (2.6 * e - ph) * 0.5)
	# the speed menu over its chip
	var mw := 4.6 * e
	var mh := SPEEDS.size() * 1.9 * e + 0.6 * e
	_menu.size = Vector2(mw, mh)
	_menu.position = _bar.position + Vector2(bw - 0.7 * e - mw, -mh - 0.7 * e)


func _pill_w() -> float:
	var e := em()
	return 0.9 * e * 2.0 + 0.55 * e + 0.45 * e + HudKit.width(HudKit.body(750), "REPLAY", 0.78 * e) + 0.12 * 0.78 * e * 6.0


# ------------------------------------------------------------------ drawing

func _draw_bar() -> void:
	var c := _bar
	var e := em()
	var sz := c.size
	var r := _run()
	if r == null:
		return
	var seeking := r.seek_to >= 0
	var ended := _ended()
	var playing := _playing()
	var k := 1.0 - _dim
	# .rbar: the panel, fading to nothing when dim (the scrubber stays)
	if k > 0.01:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(UiTheme.PANEL_2, UiTheme.PANEL_2.a * k)
		sb.border_color = Color(UiTheme.LINE, UiTheme.LINE.a * k)
		sb.set_border_width_all(1)
		sb.set_corner_radius_all(20)
		sb.shadow_color = Color(0, 0, 0, 0.45 * k)
		sb.shadow_size = 12
		sb.shadow_offset = Vector2(0, 6)
		c.draw_style_box(sb, Rect2(Vector2.ZERO, sz))
	var px := 0.7 * e
	# the scrubber
	_track = Rect2(px, 0.35 * e, sz.x - 2.0 * px, 1.5 * e)
	var rail_h := 8.0 if _drag >= 0 else 5.0
	var rail := Rect2(_track.position.x, _track.get_center().y - rail_h * 0.5, _track.size.x, rail_h)
	_rrect(c, rail, Color(1, 1, 1, 0.14), rail_h * 0.5)
	# what's ready to jump to at once (the timeline's covered so far)
	var ready := clampf(float(r.tl.covered) / _end, 0.0, 1.0)
	if ready > 0.0:
		_rrect(c, Rect2(rail.position, Vector2(rail.size.x * ready, rail.size.y)), Color(1, 1, 1, 0.12), rail_h * 0.5)
	var frame := _shown()
	var f := clampf(float(frame) / _end, 0.0, 1.0)
	var fill := Rect2(rail.position, Vector2(rail.size.x * f, rail.size.y))
	if fill.size.x > 0.5:
		# glow under it
		_rrect(c, fill.grow(3.0), Color(ORANGE, 0.18), rail_h * 0.5 + 3.0)
		if seeking:
			# .rbar.seeking .rb-fill: amber and orange stripes running
			c.draw_rect(fill, ORANGE)
			var step := 12.0
			var off := fmod(_t * 34.0, step * 2.0)
			var x := fill.position.x - step * 2.0 + off
			while x < fill.end.x:
				var a := maxf(x, fill.position.x)
				var b := minf(x + step, fill.end.x)
				if b > a:
					c.draw_colored_polygon(PackedVector2Array([Vector2(a, fill.end.y), Vector2(b, fill.end.y), Vector2(minf(b + rail_h, fill.end.x), fill.position.y), Vector2(minf(a + rail_h, fill.end.x), fill.position.y)]), AMBER)
				x += step * 2.0
		else:
			_grad_rect(c, fill, AMBER, ORANGE, rail_h * 0.5)
	# the big moments
	for mk in _marks:
		var mx := rail.position.x + rail.size.x * clampf(float(mk.frame) / _end, 0.0, 1.0)
		var col := UiTheme.TEXT if mk.kind == "kd" else AMBER if mk.kind == "tear" else RED
		if mk.kind == "ko":
			c.draw_rect(Rect2(mx - 3.5, rail.position.y - 5.0, 7.0, rail_h + 10.0), Color(RED, 0.25))
		c.draw_rect(Rect2(mx - 1.5, rail.position.y - 3.0, 3.0, rail_h + 6.0), Color(col, 0.85))
	# the thumb
	var tr := 0.475 * e * (1.35 if _drag >= 0 else 1.0 - 0.4 * _dim)
	var tc := Vector2(rail.position.x + rail.size.x * f, rail.get_center().y)
	c.draw_circle(tc + Vector2(0, 1), tr + 3.0, Color(0, 0, 0, 0.35))
	c.draw_circle(tc, tr, ORANGE)
	c.draw_circle(tc, tr - 2.0, Color.WHITE)
	# the time it's dragged to, over the thumb
	if _drag >= 0:
		var s := clock(frame)
		var fs := 0.8 * e
		var font := HudKit.body(700)
		var tw := HudKit.width(font, s, fs) + 1.0 * fs
		var tip := Rect2(tc.x - tw * 0.5, rail.position.y - 1.25 * e - fs * 1.4, tw, fs * 1.5)
		var sb2 := StyleBoxFlat.new()
		sb2.bg_color = Color(0.031, 0.043, 0.075, 0.95)
		sb2.border_color = UiTheme.LINE
		sb2.set_border_width_all(1)
		sb2.set_corner_radius_all(6)
		c.draw_style_box(sb2, tip)
		c.draw_string(font, Vector2(tip.position.x + 0.5 * fs, tip.position.y + fs * 1.1), s, HORIZONTAL_ALIGNMENT_LEFT, -1, int(fs), UiTheme.TEXT)
	# the transport row
	_hits.clear()
	if k <= 0.01:
		return
	var row_y := _track.end.y
	var row_h := 2.6 * e
	var cy := row_y + row_h * 0.5
	var bs := 2.3 * e
	var x0 := px
	var paused := not playing
	var ids := ["restart"]
	if paused:
		ids.append("stepBack")
	ids.append_array(["back5", "play", "ahead5"])
	if paused:
		ids.append("stepAhead")
	for id in ids:
		var w := 2.6 * e if id == "play" else bs
		if id == "play":
			x0 += 0.15 * e
		var rc := Rect2(x0, cy - w * 0.5, w, w)
		_hits.append([id, rc])
		if id == "play":
			_play_button(c, rc, ended, playing, seeking, k)
		else:
			if _pressed == id:
				_rrect(c, rc, Color(1, 1, 1, 0.08 * k), 10)
			var icon := UiTheme.icon(id, int(round(1.25 * e)))
			var isz := Vector2.ONE * 1.25 * e
			c.draw_texture_rect(icon, Rect2(rc.get_center() - isz * 0.5, isz), false, Color(UiTheme.TEXT, k))
			if id == "back5" or id == "ahead5":
				# (the 5 inside the arrow: svg text isn't drawn)
				var font5 := HudKit.body(700)
				var fs5 := 0.54 * e
				var w5 := HudKit.width(font5, "5", fs5)
				var nudge := 0.03 * e if id == "back5" else -0.03 * e
				c.draw_string(font5, rc.get_center() + Vector2(-w5 * 0.5 + nudge, fs5 * 0.38), "5", HORIZONTAL_ALIGNMENT_LEFT, -1, int(fs5), Color(UiTheme.TEXT, k))
		x0 += w + 0.15 * e
		if id == "play":
			x0 += 0.15 * e
	# the time: where it is, and how long
	var tfs := 0.9 * e
	var tfont := HudKit.body(700)
	var now := clock(frame)
	var tot := " / " + clock(_end)
	if seeking and r.progress < 1.0 and r.progress > 0.0:
		tot = "  %d%%" % roundi(r.progress * 100.0)
	var tx := x0 + 0.4 * e
	c.draw_string(tfont, Vector2(tx, cy + tfs * 0.36), now, HORIZONTAL_ALIGNMENT_LEFT, -1, int(tfs), Color(UiTheme.TEXT, k))
	c.draw_string(tfont, Vector2(tx + HudKit.width(tfont, now, tfs), cy + tfs * 0.36), tot, HORIZONTAL_ALIGNMENT_LEFT, -1, int(tfs), Color(UiTheme.MUTED, UiTheme.MUTED.a * k))
	# on the right: the speed chip, and Results before it
	var cfs := 0.85 * e
	var cfont := HudKit.body(700)
	var sl := speed_label(hud.game.speed)
	var cw := maxf(3.2 * e, HudKit.width(cfont, sl, cfs) + 1.1 * e)
	var chip := Rect2(sz.x - px - cw, cy - bs * 0.5, cw, bs)
	_hits.append(["speed", chip])
	var sbc := StyleBoxFlat.new()
	sbc.bg_color = Color(1, 1, 1, 0.08 * k) if _pressed == "speed" else Color(0, 0, 0, 0)
	sbc.border_color = Color(ORANGE, k) if _menu_open else Color(UiTheme.LINE, UiTheme.LINE.a * k)
	sbc.set_border_width_all(1)
	sbc.set_corner_radius_all(10)
	c.draw_style_box(sbc, chip)
	c.draw_string(cfont, Vector2(chip.get_center().x - HudKit.width(cfont, sl, cfs) * 0.5, cy + cfs * 0.36), sl, HORIZONTAL_ALIGNMENT_LEFT, -1, int(cfs), Color(AMBER if _menu_open else UiTheme.TEXT, k))
	var rfs := 0.8 * e
	var rfont := UiTheme.font(700, int(round(rfs * 0.06)))
	var rtext := "RESULTS"
	var ric := 1.1 * rfs
	var rw := 0.6 * rfs * 2.0 + ric + 0.35 * rfs + HudKit.width(rfont, rtext, rfs)
	var res := Rect2(chip.position.x - 0.15 * e - rw, cy - bs * 0.5, rw, bs)
	_hits.append(["results", res])
	var lit := ended
	if lit:
		var pulse := 0.5 + 0.5 * sin(_t * TAU / 1.6)
		_rrect(c, res.grow(2.0 + 3.0 * pulse), Color(ORANGE, 0.22 * pulse * k), 12)
		_grad_rect(c, res, AMBER, ORANGE, 10, k, true)
	elif _pressed == "results":
		_rrect(c, res, Color(1, 1, 1, 0.08 * k), 10)
	var rcol := Color(DARK, k) if lit else Color(UiTheme.MUTED, UiTheme.MUTED.a * k)
	var fwd := UiTheme.icon("forward", int(round(ric)))
	c.draw_texture_rect(fwd, Rect2(Vector2(res.position.x + 0.6 * rfs, cy - ric * 0.5), Vector2.ONE * ric), false, rcol)
	c.draw_string(rfont, Vector2(res.position.x + 0.6 * rfs + ric + 0.35 * rfs, cy + rfs * 0.36), rtext, HORIZONTAL_ALIGNMENT_LEFT, -1, int(rfs), rcol)


## .rb-btn.play: the amber disc with play, pause or replay on it; dimmed with a spinner while a
## seek runs.
func _play_button(c: Control, rc: Rect2, ended: bool, playing: bool, seeking: bool, k: float) -> void:
	var ctr := rc.get_center()
	var rad := rc.size.x * 0.5
	var a := (0.6 if seeking else 1.0) * k
	c.draw_circle(ctr, rad + 4.0, Color(ORANGE, 0.16 * a))
	# the gradient disc (amber at the top to orange at the bottom), in bands
	var n := 10
	for i in n:
		var t0 := float(i) / n
		var t1 := float(i + 1) / n
		var y0 := ctr.y - rad + 2.0 * rad * t0
		var y1 := ctr.y - rad + 2.0 * rad * t1
		var pts := PackedVector2Array()
		for y in [y0, y1]:
			var dx := sqrt(maxf(0.0, rad * rad - (y - ctr.y) * (y - ctr.y)))
			pts.append(Vector2(ctr.x - dx, y))
			pts.append(Vector2(ctr.x + dx, y))
		var col := Color(AMBER.lerp(ORANGE, (t0 + t1) * 0.5), a)
		c.draw_colored_polygon(PackedVector2Array([pts[0], pts[1], pts[3], pts[2]]), col)
	if _pressed == "play":
		c.draw_circle(ctr, rad, Color(0, 0, 0, 0.12))
	var name := "replay" if ended else "pause" if playing else "play"
	var isz := Vector2.ONE * 1.15 * em()
	c.draw_texture_rect(UiTheme.icon(name, int(round(1.15 * em()))), Rect2(ctr - isz * 0.5, isz), false, Color(DARK, a))
	if seeking:
		var start := _t * 7.0
		c.draw_arc(ctr, rad + 1.5, start, start + 1.9, 24, Color(1, 1, 1, 0.9 * k), 2.5, true)


func _draw_menu() -> void:
	var c := _menu
	var e := em()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.039, 0.051, 0.086, 0.96)
	sb.border_color = UiTheme.LINE
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(12)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 12
	c.draw_style_box(sb, Rect2(Vector2.ZERO, c.size))
	var rh := (c.size.y - 0.6 * e) / SPEEDS.size()
	var fs := 0.85 * e
	var font := HudKit.body(700)
	for i in SPEEDS.size():
		var s: float = SPEEDS[SPEEDS.size() - 1 - i]
		var rc := Rect2(0.3 * e, 0.3 * e + i * rh, c.size.x - 0.6 * e, rh - 0.1 * e)
		var on: bool = s == hud.game.speed
		if on:
			_grad_rect(c, rc, AMBER, ORANGE, 8)
		var t := speed_label(s)
		c.draw_string(font, Vector2(rc.get_center().x - HudKit.width(font, t, fs) * 0.5, rc.get_center().y + fs * 0.36), t, HORIZONTAL_ALIGNMENT_LEFT, -1, int(fs), DARK if on else UiTheme.TEXT)


## .replay-pill: REPLAY with a red dot breathing in and out.
func _draw_pill() -> void:
	var c := _pill
	var e := em()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.047, 0.059, 0.09, 0.72)
	sb.border_color = UiTheme.LINE
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(int(c.size.y * 0.5))
	c.draw_style_box(sb, Rect2(Vector2.ZERO, c.size))
	var fs := 0.78 * e
	var dot := 0.55 * fs
	var x := 0.9 * fs
	var cy := c.size.y * 0.5
	var k := 0.25 + 0.75 * (0.5 + 0.5 * cos(_t * TAU / 1.4))
	c.draw_circle(Vector2(x + dot * 0.5, cy), dot * 1.2, Color(RED, 0.25 * k))
	c.draw_circle(Vector2(x + dot * 0.5, cy), dot * 0.5, Color(RED, k))
	var font := UiTheme.font(750, int(round(fs * 0.12)))
	c.draw_string(font, Vector2(x + dot + 0.45 * fs, cy + fs * 0.36), "REPLAY", HORIZONTAL_ALIGNMENT_LEFT, -1, int(fs), UiTheme.TEXT)


static func _rrect(c: Control, r: Rect2, col: Color, radius: float) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(int(round(radius)))
	sb.anti_aliasing = true
	c.draw_style_box(sb, r)


## A rounded rect filled with a gradient: left to right, or top to bottom (`down`).
static func _grad_rect(c: Control, r: Rect2, a: Color, b: Color, radius: float, k := 1.0, down := false) -> void:
	var n := 8
	var rad := minf(radius, minf(r.size.x, r.size.y) * 0.5)
	for i in n:
		var t0 := float(i) / n
		var t1 := float(i + 1) / n
		var part := Rect2(r.position + Vector2(0, r.size.y * t0), Vector2(r.size.x, r.size.y / n)) if down else Rect2(r.position + Vector2(r.size.x * t0, 0), Vector2(r.size.x / n, r.size.y))
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(a.lerp(b, (t0 + t1) * 0.5), k)
		# (only the ends are rounded)
		if down:
			sb.corner_radius_top_left = int(rad) if i == 0 else 0
			sb.corner_radius_top_right = int(rad) if i == 0 else 0
			sb.corner_radius_bottom_left = int(rad) if i == n - 1 else 0
			sb.corner_radius_bottom_right = int(rad) if i == n - 1 else 0
		else:
			sb.corner_radius_top_left = int(rad) if i == 0 else 0
			sb.corner_radius_bottom_left = int(rad) if i == 0 else 0
			sb.corner_radius_top_right = int(rad) if i == n - 1 else 0
			sb.corner_radius_bottom_right = int(rad) if i == n - 1 else 0
		sb.anti_aliasing = false
		c.draw_style_box(sb, part.grow_individual(0, 0, 0.5, 0) if not down else part.grow_individual(0, 0, 0, 0.5))
