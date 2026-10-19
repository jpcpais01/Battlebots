## A tag team match's own pieces of the HUD: each side's partner on a chip beside its abilities
## (its name, its health and where it is: on the apron, resting, tagged out, in for a double team,
## eliminated) and, beside the coach's calls, the player's TAG button: lit when the partner can
## come in, pulsing while the bot runs for its corner. A one-on-one fight shows none of it.
## The big moments (TAG!, a hot tag, ELIMINATED, a double team) are HudCalls' band.
class_name HudTag
extends HudPart

## The chip's width at most, and the slant of its ends (em).
const CHIP_W := 12.5
const CUT := 0.5
const BG := Color(12.0 / 255.0, 15.0 / 255.0, 23.0 / 255.0, 0.76)
const LINE := Color(1, 1, 1, 0.12)
## The partner's state, cut to fit under TAG on the button.
const SHORT := {"DOUBLE TEAM!": "ASSISTING", "ON THE APRON": "WAITING", "CELEBRATING": "PARTY", "TAGGED OUT": "LEAVING"}

## One side's partner, as copied from the match this frame.
class Mate:
	var name_ := ""
	var hp := 1.0
	## The health drawn (eases to hp, so resting fills it back smoothly).
	var shown := 1.0
	var status := ""
	var out := false
	## The player's side can tag it in now (lights the chip); its corner is running for the tag.
	var ready := false
	var run := false
	var c1 := Color.WHITE
	var c2 := Color.WHITE
	## What the chip was last drawn with, and when its state last changed (its pop).
	var drawn := ""
	var pop_t := -10.0
	var state := ""

var _on := false
var _live := false
var _mates: Array[Mate] = [Mate.new(), Mate.new()]
## The chips (each under the partner's own glow while it's ready) ride with the bars.
var _top := Control.new()
var _chips: Array[Control] = []
var _glows: Array[Control] = []
var _btn := TagButton.new()
var _now := 0.0
var _em := -1.0
var _slot: Array[Rect2] = [Rect2(), Rect2()]
var _coach := Rect2()
var _f_name: Font
var _f_small: Font


func _init() -> void:
	super()
	_top.set_anchors_preset(Control.PRESET_FULL_RECT)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	for i in 2:
		var g := Control.new()
		g.mouse_filter = Control.MOUSE_FILTER_IGNORE
		g.draw.connect(_draw_glow.bind(i, g))
		_top.add_child(g)
		_glows.append(g)
		var c := Control.new()
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.draw.connect(_draw_chip.bind(i, c))
		_top.add_child(c)
		_chips.append(c)
	_btn.pressed.connect(_tap)
	add_child(_btn)
	visible = false


func start(m_) -> void:
	_on = m_.get("tag") != null
	visible = _on
	_em = -1.0
	_btn.reset()
	for i in 2:
		_mates[i] = Mate.new()
	if _on:
		capture(m_)
		for mt in _mates:
			mt.shown = mt.hp


func stop() -> void:
	_on = false
	visible = false


## A tag: the chip now holds the bot that was just tagged out; it pops as it changes hands.
func swap(i: int, _m) -> void:
	_mates[i].pop_t = _now
	_mates[i].shown = -1.0


func capture(m_) -> void:
	if not _on:
		return
	var t = m_.tag
	_live = m_.phase == "fight" and m_.winner == null and not t.paused
	for side in 2:
		var p = t.partnerOf(float(side))
		var mt := _mates[side]
		mt.name_ = str(p.spec.name_)
		mt.hp = maxf(0.0, float(p.f.hpRatio))
		mt.out = p.out
		mt.run = float(t.run[side]) >= 0.0
		mt.ready = t.canTag(float(side))
		var st := _status(str(p.status), mt, str(m_.phase), side == 0)
		if st != mt.state:
			if mt.state != "":
				mt.pop_t = _now
			mt.state = st
		mt.status = st
		var cols := HudKit.bar_colors(p.spec.paint)
		mt.c1 = cols[0]
		mt.c2 = cols[1]
	var me := _mates[0]
	_btn.show_state(me.ready and _live, me.run or hud.tag_tap, me.out or not _live, me.status, me.name_, me.c1)


## What the chip says the partner is doing (tag.ts TagStatus, in the player's words).
static func _status(s: String, mt: Mate, phase: String, player: bool) -> String:
	if mt.out:
		return "ELIMINATED"
	if phase != "fight" and phase != "ko" and phase != "end":
		return "ON THE APRON"
	match s:
		"apron":
			if mt.run:
				return "CALLED IN"
			if mt.ready:
				# (only the player's chip says so: the other corner's partner is just waiting)
				return "TAG READY" if player else "ON THE APRON"
			return "RESTING"
		"leave":
			return "TAGGED OUT"
		"assist":
			return "DOUBLE TEAM!"
		"party", "celebrate":
			return "CELEBRATING"
	return "ON THE APRON"


## The TAG button: the bot makes for its corner at the next step (the Game queues it).
func _tap() -> void:
	if not _on or not _live or not _mates[0].ready or hud.tag_tap:
		return
	hud.tag_tap = true
	if hud.game != null and hud.game.get("sfx") != null:
		hud.game.sfx.ui("select")


func tick(dt: float) -> void:
	if not _on:
		return
	_now += dt
	var e := em()
	var bars := hud.bars
	# (laid out once the bars and the coach's row are)
	var slot0 := bars.team_slot(0, CHIP_W * e)
	var slot1 := bars.team_slot(1, CHIP_W * e)
	var coach := hud.coach.bar_rect()
	if e != _em or slot0 != _slot[0] or slot1 != _slot[1] or coach != _coach:
		_em = e
		_slot = [slot0, slot1]
		_coach = coach
		_layout()
	_top.position.y = bars.position.y
	_btn.position.y = _btn.base_y + hud.coach.position.y
	for i in 2:
		var mt := _mates[i]
		var c := _chips[i]
		c.visible = _slot[i].size.x > 0.0
		# (-1: a new bot on the chip, shown as it is)
		mt.shown = mt.hp if mt.shown < 0.0 else move_toward(mt.shown, mt.hp, dt * maxf(0.25, absf(mt.hp - mt.shown) * 3.0))
		var key := "%s|%s|%d|%d|%.3f" % [mt.name_, mt.status, int(mt.out), int(mt.ready and i == 0), mt.shown]
		if key != mt.drawn:
			mt.drawn = key
			c.queue_redraw()
			_glows[i].queue_redraw()
		# a change of state pops the chip (scale from 1.12, 0.3 s)
		var pt := _now - mt.pop_t
		var sc := 1.0 + 0.12 * (1.0 - HudKit.ease_out(clampf(pt / 0.3, 0.0, 1.0)))
		if c.scale.x != sc:
			c.scale = Vector2(sc, sc)
		# ready to tag in: the chip's amber glow breathes
		var lit := mt.ready and i == 0 and not mt.out
		_glows[i].visible = lit
		if lit:
			_glows[i].modulate.a = 0.45 + 0.55 * HudBars._pulse(_now, 0.55)
	_btn.tick(dt)


func _layout() -> void:
	var e := _em
	_f_name = HudKit.body(800)
	_f_small = UiTheme.font(750, roundi(0.12 * 0.5 * e))
	for i in 2:
		var r := _slot[i]
		for c in [_chips[i], _glows[i]]:
			c.position = r.position
			c.size = r.size
			c.pivot_offset = r.size * 0.5
			c.queue_redraw()
	# the TAG button: beside the coach's calls on the screen's left, or over them if there's no room
	var px := HudCoach.px(self)
	var fs := 0.84 * e
	var h := 3.1 * fs
	var w := 5.6 * e
	var x := _coach.position.x - 0.6 * e - w
	var y := _coach.position.y
	if _coach.size.x <= 0.0:
		x = size.x * 0.5 - w * 0.5
		y = size.y - bottom() - h
	elif x < side() + 3.4 * e:
		x = _coach.position.x
		y = _coach.position.y - h - 0.5 * e
	_btn.size = Vector2(w, h)
	_btn.position = Vector2(x, y)
	_btn.base_y = y
	_btn.pivot_offset = _btn.size * 0.5
	_btn.em = e
	_btn.px = px
	_btn.relayout()


## The chip's outline in its own box: slanted ends (the bars' style), the outer end square-ish.
func _chip_poly(r: Rect2, right: bool) -> PackedVector2Array:
	var c := CUT * _em
	var w := r.size.x
	var h := r.size.y
	if not right:
		return PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w - c, h), Vector2(0, h)])
	return PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(c, h)])


## The ready glow round the player's partner's chip (its pulse is the piece's modulate).
func _draw_glow(i: int, ci: Control) -> void:
	if _em <= 0.0 or ci.size.x <= 0.0:
		return
	var poly := _chip_poly(Rect2(Vector2.ZERO, ci.size), i == 1)
	for g in [[0.9, 0.06], [0.55, 0.12], [0.25, 0.22]]:
		var grown := Geometry2D.offset_polygon(poly, float(g[0]) * _em * 0.5)
		if not grown.is_empty():
			ci.draw_colored_polygon(grown[0], Color(HudKit.AMBER, g[1]))


func _draw_chip(i: int, ci: Control) -> void:
	if _em <= 0.0 or ci.size.x <= 0.0 or _f_name == null:
		return
	var t0 := Perf.now()
	var mt := _mates[i]
	var right := i == 1
	var e := _em
	var w := ci.size.x
	var h := ci.size.y
	var poly := _chip_poly(Rect2(Vector2.ZERO, ci.size), right)
	var dim := 0.55 if mt.out else 1.0
	ci.draw_colored_polygon(poly, Color(BG, BG.a * (0.85 if mt.out else 1.0)))
	var ready := mt.ready and i == 0 and not mt.out
	var edge := Color(HudKit.AMBER, 0.85) if ready else (Color(HudKit.RED, 0.45) if mt.out else LINE)
	var ring := poly.duplicate()
	ring.append(poly[0])
	ci.draw_polyline(ring, edge, maxf(1.0, 0.07 * e), true)
	# the partner's paint down its outer end
	var sw := 0.32 * e
	var strip := PackedVector2Array([Vector2(0, 0), Vector2(sw, 0), Vector2(sw, h), Vector2(0, h)])
	if right:
		strip = PackedVector2Array([Vector2(w - sw, 0), Vector2(w, 0), Vector2(w, h), Vector2(w - sw, h)])
	var sc := [Color(mt.c1, dim), Color(mt.c2, dim)]
	ci.draw_polygon(strip, PackedColorArray([sc[0], sc[0], sc[1], sc[1]]))
	# the name and, on the clock side, what it's doing
	var x0 := (sw + 0.5 * e) if not right else CUT * e + 0.45 * e
	var x1 := (w - CUT * e - 0.45 * e) if not right else w - sw - 0.5 * e
	var nfs := 0.74 * e
	var sfs := 0.5 * e
	var base := 0.24 * e + HudBars._baseline(_f_name, nfs, 0.0, nfs * 1.2)
	var scol := HudKit.TEXT_2
	if ready or mt.status == "DOUBLE TEAM!" or mt.status == "CALLED IN":
		scol = HudKit.AMBER
	elif mt.out:
		scol = HudKit.RED
	elif mt.status == "CELEBRATING":
		scol = HudKit.GREEN
	var stw := HudKit.width(_f_small, mt.status, sfs)
	var room := maxf(0.0, x1 - x0 - stw - 0.5 * e)
	var name := _fit(mt.name_.to_upper(), nfs, room)
	var nw := HudKit.width(_f_name, name, nfs)
	var ncol := Color(HudKit.TEXT, dim)
	var sbase := base - (nfs - sfs) * 0.12
	if not right:
		HudKit.text(ci, _f_name, Vector2(x0, base), name, nfs, ncol, 0.6)
		HudKit.text(ci, _f_small, Vector2(x1 - stw, sbase), mt.status, sfs, scol, 0.6)
	else:
		HudKit.text(ci, _f_name, Vector2(x1 - nw, base), name, nfs, ncol, 0.6)
		HudKit.text(ci, _f_small, Vector2(x0, sbase), mt.status, sfs, scol, 0.6)
	if mt.out:
		# struck through
		var nx := x0 if not right else x1 - nw
		var sy := base - nfs * 0.33
		ci.draw_line(Vector2(nx - 0.15 * e, sy), Vector2(nx + nw + 0.15 * e, sy), Color(HudKit.RED, 0.9), maxf(1.5, 0.09 * e), true)
	# its health along the bottom: the track, then the paint (empty once it's out)
	var bh := 0.26 * e
	var by := h - 0.42 * e - bh
	var bx0 := x0
	var bx1 := x1 - (0.0 if right else 0.0)
	var track := Rect2(bx0, by, bx1 - bx0, bh)
	ci.draw_colored_polygon(HudBars._rrect(track, bh * 0.5, 3), Color(1, 1, 1, 0.08))
	var k := 0.0 if mt.out else clampf(mt.shown, 0.0, 1.0)
	if k > 0.004:
		var fw := track.size.x * k
		var fr := Rect2(bx0 if not right else bx1 - fw, by, fw, bh)
		var fp := HudBars._rrect(fr, minf(bh * 0.5, fw * 0.5), 3)
		var a := mt.c2 if not right else mt.c1
		var b := mt.c1 if not right else mt.c2
		HudBars.grad(ci, fp, fr.position, Vector2(fr.size.x, 0), [[0.0, a], [1.0, b]])
		# low: a red edge on it
		if mt.shown < 0.25:
			ci.draw_colored_polygon(fp, Color(HudKit.RED, 0.45))
	Perf.add(Perf.HUD, t0)


## `s` cut to `room` wide with an ellipsis.
func _fit(s: String, fs: float, room: float) -> String:
	if HudKit.width(_f_name, s, fs) <= room:
		return s
	var n := s.length()
	while n > 1 and HudKit.width(_f_name, s.left(n) + "…", fs) > room:
		n -= 1
	return s.left(n) + "…"


## The player's TAG button: a pill in the partner's colours, TAG over the partner's name (or what
## it's doing); lit and breathing while the partner can come in, pulsing amber while the bot runs
## for its corner, dimmed otherwise, gone once the partner is out of the match.
class TagButton extends BaseButton:
	var em := 16.0
	var px := 1.0
	var base_y := 0.0
	var _ready := false
	var _running := false
	var _gone := true
	var _status := ""
	var _name := ""
	var _col := HudKit.CYAN
	## 1 while hidden, easing over 0.3 s; the ready glow's and the run's clocks; the press.
	var _off := 1.0
	var _t := 0.0
	var _lit := 0.0
	var _press := 0.0
	var _box := StyleBoxFlat.new()
	var _glow := StyleBoxFlat.new()
	var _fill := StyleBoxFlat.new()
	## The button in layers, so its pulse costs no drawing: the glow behind it and a wash of its
	## colour over its face are drawn at the pulse's peak and breathe by their opacity; the face
	## (the pill and its edge, at the pulse's low) and the words only draw when the state changes.
	var _glow_layer := Control.new()
	var _wash := Control.new()
	var _words := Control.new()
	## What the face and the words were last drawn for.
	var _drawn_face := []
	var _drawn_words := []

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		mouse_filter = Control.MOUSE_FILTER_STOP
		action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		_box.corner_detail = 16
		_box.anti_aliasing = true
		_glow.corner_detail = 16
		_glow.draw_center = false
		_glow.bg_color = Color(0, 0, 0, 0)
		_fill.corner_detail = 16
		_fill.anti_aliasing = true
		for c in [_glow_layer, _wash, _words] as Array[Control]:
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
			c.set_anchors_preset(Control.PRESET_FULL_RECT)
			add_child(c)
		# (the glow under the face, as a box-shadow sits)
		_glow_layer.show_behind_parent = true
		_glow_layer.draw.connect(_draw_glow)
		_wash.draw.connect(_draw_wash)
		_words.draw.connect(_draw_words)
		visible = false

	func reset() -> void:
		_ready = false
		_running = false
		_gone = true
		_off = 1.0
		_lit = 0.0
		_press = 0.0
		_drawn_face = []
		_drawn_words = []
		scale = Vector2.ONE
		visible = false

	## The size or the em changed (HudTag._layout): draw every layer again.
	func relayout() -> void:
		_drawn_face = []
		_drawn_words = []

	func show_state(ready: bool, running: bool, gone: bool, status: String, name: String, col: Color) -> void:
		_ready = ready
		_running = running
		_gone = gone
		_status = status
		_name = name
		_col = col

	func tick(dt: float) -> void:
		_t += dt
		_off = move_toward(_off, 1.0 if _gone else 0.0, dt / 0.3)
		var k := HudKit.ease_css(_off)
		modulate.a = 1.0 - k
		visible = k < 0.999
		mouse_filter = Control.MOUSE_FILTER_IGNORE if _gone else Control.MOUSE_FILTER_STOP
		_lit = move_toward(_lit, 1.0 if _ready else 0.0, dt / 0.2)
		var down := _ready and get_draw_mode() == BaseButton.DRAW_PRESSED
		var p := move_toward(_press, 1.0 if down else 0.0, dt / 0.1)
		if p != _press:
			_press = p
			var s := lerpf(1.0, 0.92, HudKit.ease_css(_press))
			scale = Vector2(s, s)
		if not visible:
			return
		# the pulse: running for the corner (0.4 s each way), or ready (0.6 s)
		var u := 0.0
		if _running:
			u = HudBars._pulse(_t, 0.4)
			_glow_layer.modulate.a = (0.4 + 0.3 * u) / 0.7
		elif _lit > 0.0:
			u = HudBars._pulse(_t, 0.6)
			_glow_layer.modulate.a = 0.5 + 0.5 * u
		_wash.modulate.a = u
		var face := [_running, _lit, _col]
		if face != _drawn_face:
			_drawn_face = face
			queue_redraw()
			_glow_layer.queue_redraw()
			_wash.queue_redraw()
		var words := [_ready, _running, _status, _name, _col]
		if words != _drawn_words:
			_drawn_words = words
			_words.queue_redraw()

	func _rad() -> int:
		return maxi(0, int(floor(size.y * 0.5)) - 1)

	func _bw() -> int:
		return maxi(1, roundi(1.5 * px))

	## The face at the pulse's low: running for the corner in amber, or lit in the partner's colour.
	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		if r.size.x <= 0.0:
			return
		var bg := HudCoach.CoachButton.BG
		var edge := Color(_col, 0.4)
		if _running:
			bg = HudCoach.mix(HudKit.AMBER, 0.25, HudCoach.CoachButton.BG_ON)
			edge = HudKit.AMBER
		elif _lit > 0.0:
			bg = bg.lerp(HudCoach.mix(_col, 0.28, HudCoach.CoachButton.BG_ON), _lit)
			edge = edge.lerp(Color(_col, 1.0), _lit)
		_box.bg_color = bg
		_box.set_corner_radius_all(_rad())
		_box.set_border_width_all(_bw())
		_box.border_color = edge
		draw_style_box(_box, r)

	## The glow round it at the pulse's peak (the layer's opacity takes it down to the low).
	func _draw_glow() -> void:
		var glow := 0.7 if _running else _lit * 0.7
		if glow <= 0.004 or size.x <= 0.0:
			return
		_glow.set_corner_radius_all(_rad())
		_glow.shadow_color = Color(HudKit.AMBER if _running else _col, glow * 0.6)
		_glow.shadow_size = maxi(1, roundi(12.0 * px))
		_glow_layer.draw_style_box(_glow, Rect2(Vector2.ZERO, size))

	## The colour washed over the face at the pulse's peak: over the face's own mix (25% amber, or
	## 28% of its colour), a sixth of its colour (a third of amber) makes the peak's mix (40%, 50%)
	## exactly, and the layer's opacity at the pulse's u gives the mix in between.
	func _draw_wash() -> void:
		var a := 1.0 / 3.0 if _running else _lit / 6.0
		if a <= 0.0 or size.x <= 0.0:
			return
		var bw := float(_bw())
		_fill.bg_color = Color(HudKit.AMBER if _running else _col, a)
		_fill.set_corner_radius_all(maxi(0, _rad() - _bw()))
		_wash.draw_style_box(_fill, Rect2(Vector2.ZERO, size).grow(-bw))

	## TAG, and under it the partner's name, or why it can't come in yet.
	func _draw_words() -> void:
		if size.x <= 0.0:
			return
		var big := HudKit.broadcast()
		var fs := 1.12 * em
		var sfs := 0.48 * em
		var small := UiTheme.font(750, roundi(0.14 * sfs))
		var col := Color.WHITE if (_ready or _running) else UiTheme.MUTED
		var label := "TAG"
		var sub := _name.to_upper() if _ready else ("RUNNING IN" if _running else String(HudTag.SHORT.get(_status, _status)))
		var tw := HudKit.width(big, label, fs)
		var cy := size.y * 0.5
		var asc := big.get_ascent(roundi(fs))
		var base := cy - 0.1 * em + asc * 0.5
		HudKit.text(_words, big, Vector2((size.x - tw) * 0.5, base), label, fs, col, 0.5)
		var room := size.x - 1.6 * em
		while sub.length() > 1 and HudKit.width(small, sub, sfs) > room:
			sub = sub.left(sub.length() - 2) + "…"
		var sw := HudKit.width(small, sub, sfs)
		var sc := Color(HudKit.AMBER if _running else (Color(_col).lerp(Color.WHITE, 0.45) if _ready else UiTheme.MUTED))
		HudKit.text(_words, small, Vector2((size.x - sw) * 0.5, base + 0.72 * em), sub, sfs, sc, 0.5)
