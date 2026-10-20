## The fight HUD (src/ui/hud.ts): its parts stacked in the web's order, each a full-screen layer
## (game/hud/*): the bot's-eye visor, the floating numbers, the big calls (the countdown, callouts,
## the referee's count, the end-of-fight word, the finisher's banner), the health bars with their
## condition panels, the buttons (pause, zoom, speed) and the coach's calls, then the intro over
## them all. A tag team match adds the partners' chips, the TAG button and its banners (HudTag).
## The sim steps on a worker thread while the frame draws: the parts take what they show from the
## match in capture() and on_event() (main thread, sim idle) and draw from their copies.
class_name FightHud
extends CanvasLayer

## The pause button was pressed (hud.ts onPause).
signal pause_pressed

## The parts, bottom to top (hud.ts: visor, dmgLayer, callout/count/finish/finBan/refEl, then
## build()'s hud-top, hud-bl/hud-br and the coach bar).
var visor := HudVisor.new()
var floats := HudFloat.new()
var calls := HudCalls.new()
var bars := HudBars.new()
var controls := HudControls.new()
var coach := HudCoach.new()
var team := HudTag.new()
var parts: Array[HudPart] = [visor, floats, calls, bars, controls, coach, team]
var _intro := IntroView.new()
## The Game this HUD is in (director, sfx, speed, cam), or a stand-in with the same fields in tests.
var game: Node
## The camera the floating numbers are pinned through (the Game's).
var cam: Camera3D
## The em every part is sized in this frame (HudKit.em).
var em := 16.0
## The end-of-fight word is up (hud.ts .hud.finished: the bars and the clock step back).
var finished := false
## The coach call the player tapped, waiting for the next sim step (hud.ts onCoach). The Game takes
## it with take_coach() once the sim is idle.
var coach_tap := ""
## The TAG button was tapped (tag team): the Game takes it with take_tag() once the sim is idle and
## queues it (Match.queueTag).
var tag_tap := false
## Each side's fighter as the parts last saw it: a tag team match swaps them (see HudPart.swap).
var _fighters := [null, null]
## The intro was tapped: skip to the countdown (hud.ts skipIntro; the Game takes it with
## take_skip() once the sim is idle).
var skip_tap := false
## Catches a tap anywhere while the robots are presented (hud.ts .vs.interactive).
var _skip := Control.new()
## 1 while the robots are being presented (the bars wait off screen), easing to 0 for the countdown.
var _intro_k := 0.0
var _phase := ""
## The performance overlay (Settings: Performance stats): FPS, and what each part of the frame
## costs on the CPU and the GPU (ui/perf_overlay.gd).
var perf := PerfOverlay.new()
## The pause button, bottom left like the web's (hud.ts .hud-bl), and how far the intro has it
## hidden (style.css .hud.intro .hud-bl: faded, 1.5em down, not tappable).
var _pause := UiTheme.icon_button("pause")
var _pause_k := -1.0
var _pause_em := -1.0
## A map event's rival for the next fight, billed in the intro: {style, taunt}, or null (hud.ts
## rivalIntro; App sets it before each fight starts).
var rival_intro = null
## The player's corner (0 left, 1 right: online the guest fights from the right), and whether the
## fight is an online one (hud.ts attach's online: the coach calls are this corner's, the cards say
## You and Opponent, the intro can't be skipped, and there's no speed button). Set before start().
var me := 0
var online := false
## Online: how the connection to the other player is (hud.ts net-pill), beside the menu button.
var _net := NetPill.new()


func _init() -> void:
	for p in parts:
		p.hud = self
		add_child(p)
	_intro.set_anchors_preset(Control.PRESET_FULL_RECT)
	_intro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_intro)
	_skip.set_anchors_preset(Control.PRESET_FULL_RECT)
	_skip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_skip.gui_input.connect(func(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed) or (e is InputEventScreenTouch and e.pressed):
			skip_tap = true)
	add_child(_skip)
	add_child(perf)
	_pause.theme = UiTheme.theme()
	_pause.pressed.connect(func() -> void: pause_pressed.emit())
	add_child(_pause)
	_net.visible = false
	add_child(_net)
	bars.resized.connect(_place_pause)


## The strip down each side the HUD never draws in: 3% of the width (curved screen edges), or
## more where the phone's notch or cutout eats into the screen. (The screen and its safe area are
## HudKit's kept reading: this is asked for several times a frame.)
static func side_margin(c: Control) -> float:
	var w := c.size.x
	var m := w * 0.03
	var screen := HudKit.screen_size()
	var safe := HudKit.safe_area()
	if screen.x > 0 and safe.size.x > 0:
		# the safe area is in screen pixels; the HUD is in its own canvas units
		var k := w / float(screen.x)
		m = maxf(m, maxf(safe.position.x, screen.x - safe.end.x) * k)
	return m


## The strip along the bottom the HUD's buttons stay above (style.css --bottom: at least 12, or the
## phone's gesture bar).
static func bottom_margin(c: Control) -> float:
	var h := c.size.y
	var m := 12.0
	var screen := HudKit.screen_size()
	var safe := HudKit.safe_area()
	if screen.y > 0 and safe.size.y > 0:
		m = maxf(m, (screen.y - safe.end.y) * h / float(screen.y))
	return m


## Show or hide the performance overlay (the web's Performance stats setting).
func show_fps(on: bool) -> void:
	perf.set_on(on)


## style.css .icon-btn: 2.6em round, its glyph 1.2em, so it sizes with the rest of the HUD.
func _size_pause() -> void:
	_pause_em = em
	var px := 2.6 * em
	var glyph := maxi(8, roundi(1.2 * em))
	_pause.icon = UiTheme.icon("menu" if online else "pause", glyph)
	_pause.add_theme_constant_override(&"icon_max_width", glyph)
	for st in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		var sb := _pause.get_theme_stylebox(st) as StyleBoxFlat
		if sb != null:
			sb.set_corner_radius_all(maxi(0, int(floor((px + sb.expand_margin_left + sb.expand_margin_right) * 0.5)) - 1))
	_pause.custom_minimum_size = Vector2(px, px)
	_pause.size = Vector2(px, px)
	_place_pause()


func _place_pause() -> void:
	var at := Vector2(side_margin(bars), bars.size.y - bottom_margin(bars) - _pause.size.y)
	_pause.position = at + Vector2(0, 1.5 * em * maxf(_pause_k, 0.0))
	# (.hud-bl: the pill beside the button, 0.5em on, centred on it)
	_net.size = Vector2.ZERO
	_net.size = _net.get_combined_minimum_size()
	_net.position = _pause.position + Vector2(_pause.size.x + 0.5 * em, (_pause.size.y - _net.size.y) * 0.5)


## Online: the connection's state in the pill (hud.ts setNet): its words and "ok", "warn" or "bad".
func set_net(text: String, kind: String) -> void:
	if _net.set_state(text, kind, em):
		_place_pause()


## A new fight on screen (hud.ts attach; sim idle).
func start(m) -> void:
	if game == null:
		game = get_parent()
	if cam == null and game != null and "cam" in game:
		cam = game.cam
	em = HudKit.em(bars)
	finished = false
	coach_tap = ""
	skip_tap = false
	tag_tap = false
	_fighters = [m.fighters[0], m.fighters[1]]
	for p in parts:
		p.m = m
		p.start(m)
	# online the menu button opens the room's menu, not a pause (app.ts netMenu)
	_pause_em = -1.0
	_net.visible = online
	if online:
		_net.set_state("Online", "ok", em)
	# (the cards' part pictures come from the game: Game.thumbs)
	_intro.game = game
	_intro.rival = rival_intro
	_intro.tags = (["You", "Opponent"] if me == 0 else ["Opponent", "You"]) if online else ["Your bot", "Challenger"]
	_intro.start(m)
	_intro_k = 1.0 if m.phase == "intro" else 0.0


## The fight's gone from the screen (hud.ts detach).
func stop() -> void:
	for p in parts:
		p.stop()
		p.m = null
	coach_tap = ""
	tag_tap = false
	_fighters = [null, null]


## What the rest of the frame reads of the match while the sim steps on (the HUD's parts, the
## crowd, the scoreboard): copied now, with the sim idle. Each part copies its own share too.
func capture(m) -> Dictionary:
	var v := snapshot(m)
	# a tag: the parts move over to the bot that's in the ring now
	for i in 2:
		if m.fighters[i] != _fighters[i]:
			_fighters[i] = m.fighters[i]
			for p in parts:
				p.swap(i, m)
	for p in parts:
		p.capture(m)
	return v


## A sim event (main thread, sim idle), handed to every part in turn.
func on_event(type: String, data) -> void:
	for p in parts:
		p.on_event(type, data)


## The coach call tapped since the last sim step, if any (the Game queues it: Match.queueCoach).
func take_coach() -> String:
	var k := coach_tap
	coach_tap = ""
	return k


## The TAG button was tapped since the last sim step (the Game queues it: Match.queueTag).
func take_tag() -> bool:
	var k := tag_tap
	tag_tap = false
	return k


## The intro was tapped since the last sim step (the Game skips it: Match.skipIntro).
func take_skip() -> bool:
	var k := skip_tap
	skip_tap = false
	return k


## What the HUD shows, read from the match while the sim is still (the sim steps on a worker).
static func snapshot(m) -> Dictionary:
	var w = m.winner
	return {
		"phase": m.phase,
		"phaseTime": m.phaseTime,
		"clock": m.clock,
		"result": m.result,
		"winner": w.name_ if w != null else null,
		"hp": [m.fighters[0].hpRatio, m.fighters[1].hpRatio],
		"stamina": [m.fighters[0].staminaRatio, m.fighters[1].staminaRatio],
		"presenting": int(m.presenting),
	}


## The frame's HUD, after the camera has moved (`dt`: the frame's seconds; `can_restart`: the
## scene on its own offers a tap for the next fight).
func update_hud(view: Dictionary, can_restart: bool, dt: float) -> void:
	em = HudKit.em(bars)
	_phase = view.get("phase", "")
	# the bars and buttons wait for the countdown (style.css .hud.intro .hud-top: fade and slide up)
	var target := 1.0 if _phase == "intro" else 0.0
	_intro_k = move_toward(_intro_k, target, dt / 0.45)
	var k := _intro_k * _intro_k * (3.0 - 2.0 * _intro_k)
	for p in [bars, controls, coach, team] as Array[HudPart]:
		p.modulate.a = 1.0 - k
		p.visible = k < 0.999
	bars.position.y = -1.5 * em * k
	controls.position.y = 1.5 * em * k
	coach.position.y = 1.5 * em * k
	if em != _pause_em:
		_size_pause()
	if k != _pause_k:
		_pause_k = k
		_pause.modulate.a = 1.0 - k
		_pause.visible = k < 0.999
		_net.modulate.a = 1.0 - k
		_net.visible = online and k < 0.999
		_place_pause()
	# (only tappable once the intro is over, as the web's pointer-events: none)
	_pause.mouse_filter = Control.MOUSE_FILTER_IGNORE if target > 0.0 else Control.MOUSE_FILTER_STOP
	# a tap during the intro skips to the countdown (never online: both phones show the same moment)
	_skip.mouse_filter = Control.MOUSE_FILTER_STOP if _phase == "intro" and not online else Control.MOUSE_FILTER_IGNORE
	calls.can_restart = can_restart
	for p in parts:
		p.tick(dt)
	_intro.update(view, dt)


## The intro (hud.ts showVs, style.css .present .banner): while the camera presents each robot,
## its corner, walk-on tune, name and fighting style land across the other side of the screen,
## timed to its corner lift (the name slams in as the lift locks at the top, ENTRY.arrive).
class IntroView extends Control:
	const CYAN := Color(0.165, 0.847, 1.0)
	const ORANGE := Color(1.0, 0.478, 0.102)
	const MUTED := Color(0.84, 0.875, 0.94, 0.54)
	## src/audio/walkOn.ts WALK_ONS (id -> name), in order.
	const WALK_ONS := [["anthem", "Steel Anthem"], ["neon", "Neon Drive"], ["forge", "Iron Forge"], ["drop", "Bass Drop"], ["fanfare", "Champion's Call"], ["arcade", "Arcade Boss"]]
	var _names: Array[String] = []
	var _styles: Array[String] = []
	var _tunes: Array[String] = []
	var _paint: Array[Color] = []
	var _taunts: Array[String] = []
	## The game the HUD is in (the cards' part pictures), and this fight's rival billing.
	var game
	var rival = null
	## The cards' tags, left and right (FightHud.start).
	var tags := ["Your bot", "Challenger"]
	## Each robot's card (botCard.ts), sliding in on its corner's side while it's presented.
	var _cards: Array[BotCard] = []
	var _specs := []
	var _pic_wait := 0.0
	var _taunt_font: Font
	var _who := -1
	## Seconds since the shown robot's presentation began, and since the last one was let go.
	var _t := 0.0
	var _out := -1
	var _out_t := 0.0
	var _gone := 1.0
	var _font: Font
	var _bold: Font
	## Uppercase captions are letter-spaced (letter-spacing 0.16-0.26em).
	var _wide := FontVariation.new()
	## Each card's size as last laid out, and whether its content's minimum size has changed since
	## (a picture coming in): the cards are only measured and sized again then.
	var _card_size: Array[Vector2] = []
	var _card_dirty: Array[bool] = []
	## The name's face and the rival's taunt's, made once for the app's run (a new SystemFont each
	## fight would start an empty glyph cache each fight: HudCalls.warm_fonts fills these once).
	static var _bold_font: SystemFont
	static var _taunt: FontVariation

	## The name's face (.banner .name: --broadcast, italic, 800).
	static func bold_font() -> Font:
		if _bold_font == null:
			_bold_font = SystemFont.new()
			_bold_font.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "sans-serif"])
			_bold_font.font_weight = 800
			_bold_font.font_italic = true
		return _bold_font

	## .banner .taunt: 0.95em, italic, 650.
	static func taunt_font() -> Font:
		if _taunt == null:
			_taunt = FontVariation.new()
			_taunt.base_font = UiTheme.font(650)
			_taunt.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
		return _taunt

	## What the intro draws its text with on a screen `view` canvas units big: [font, size,
	## outline] for each face and size it uses (for HudCalls.warm_fonts).
	static func faces(view: Vector2) -> Array:
		var u := clampf(view.y / 720.0, 0.6, 2.0)
		var em := 20.0 * u
		var nfs := int(minf(3.4 * em, view.x * 0.085))
		var out := [[bold_font(), nfs, 0], [bold_font(), nfs, int(nfs * 0.14)]]
		var wide := FontVariation.new()
		wide.base_font = ThemeDB.fallback_font
		wide.spacing_glyph = int(0.2 * 0.8 * em)
		for fs in [int(0.72 * em), int(0.85 * em), int(0.8 * em)]:
			out.append([wide, fs, 0])
			out.append([wide, fs, maxi(3, int(fs * 0.2))])
		var tfs := int(0.95 * em)
		out.append([taunt_font(), tfs, 0])
		out.append([taunt_font(), tfs, maxi(3, int(tfs * 0.2))])
		return out

	func start(m) -> void:
		_names.clear()
		_styles.clear()
		_tunes.clear()
		_paint.clear()
		_taunts.clear()
		_specs.clear()
		for c in _cards:
			c.queue_free()
		_cards.clear()
		_card_size.clear()
		_card_dirty.clear()
		for i in 2:
			var spec = m.specs[i]
			var rv = rival if i == 1 else null
			_specs.append(spec)
			_names.append(str(spec.name_))
			var style := str(rv.style if rv != null else m.brains[i].traits.style).to_upper()
			# a tag team match: and who waits on its apron
			if m.tag != null:
				style += "  ·  WITH " + str(m.tag.partnerOf(float(i)).f.name_).to_upper()
			_styles.append(style)
			_taunts.append(str(rv.taunt) if rv != null else "")
			# hud.ts showVs: the card, its parts popping in from 0.3s
			var card := BotCard.make(game, spec, m.fighters[i].build, "r" if i == 1 else "l", tags[i], 0.3)
			card.visible = false
			add_child(card)
			_cards.append(card)
			_card_size.append(Vector2.ZERO)
			_card_dirty.append(true)
			card.minimum_size_changed.connect(_mark_card.bind(_card_dirty.size() - 1))
			_tunes.append(_walk_on(spec).to_upper())
			_paint.append(Color.hex((int(spec.paint.primary) << 8) | 0xff))
		_who = -1
		_out = -1
		_gone = 0.0 if m.phase == "intro" else 1.0
		_font = ThemeDB.fallback_font
		_wide.base_font = _font
		_bold = bold_font()
		_taunt_font = taunt_font()
		_pic_wait = 0.5

	## Card `i`'s content asks for a different size now: measure it again.
	func _mark_card(i: int) -> void:
		if i < _card_dirty.size():
			_card_dirty[i] = true

	## walkOn.ts walkOnFor: the bot's own pick, or one that always goes with its name (FNV-1a).
	static func _walk_on(spec) -> String:
		var pick = spec.get("walkOn") if spec is Dictionary else null
		for w in WALK_ONS:
			if pick != null and str(pick) == w[0]:
				return w[1]
		var h := 2166136261
		var name_: String = str(spec.name_)
		for c in name_.length():
			h = ((h ^ name_.unicode_at(c)) * 16777619) & 0xffffffff
		return WALK_ONS[h % WALK_ONS.size()][1]

	func update(v: Dictionary, dt: float) -> void:
		if _names.is_empty():
			return
		var who: int = v.get("presenting", -1)
		var intro: bool = v.get("phase", "") == "intro"
		if who != _who:
			if _who >= 0:
				_out = _who
				_out_t = 0.0
			_who = who
		if who >= 0:
			# the same clock the sim presents by, so the name lands with the lift
			_t = float(v.phaseTime) - (TEntrance.PRESENT if who == 1 else 0.0)
		_out_t += dt
		_gone = move_toward(_gone, 0.0 if intro else 1.0, dt / 0.4)
		visible = _gone < 1.0
		if visible:
			queue_redraw()
			_place_cards(float(v.phaseTime) if intro else INF, dt)
		else:
			for c in _cards:
				c.visible = false

	## The cards: the one presented slides in from its side (slideL / slideR: 60vw, 0.6s), the one
	## let go fades and drops (presentOut), all inside .present's padding, centred up and down.
	func _place_cards(intro_t: float, dt: float) -> void:
		if _cards.is_empty():
			return
		var fade := 1.0 - _gone
		var pad := FightHud.side_margin(self)
		var w := minf(size.x * 0.27, 16.0 * UiTheme.EM)
		var top := 10.0
		var bottom := size.y - (4.6 * UiTheme.EM + FightHud.bottom_margin(self) - 2.0)
		for i in 2:
			var c := _cards[i]
			var a := 0.0
			var dx := 0.0
			var dy := 0.0
			if i == _who:
				a = fade
				dx = (1.0 if i == 1 else -1.0) * size.x * 0.6 * (1.0 - _ease(clampf(_t / 0.6, 0.0, 1.0)))
			elif i == _out and _out_t < 0.3:
				var k := _out_t / 0.3
				a = fade * (1.0 - k)
				dy = 10.0 * k
			c.visible = a > 0.0
			if not c.visible:
				continue
			c.modulate.a = a
			# (measured and sized only when the width or the card's content changed)
			if _card_dirty[i] or _card_size[i].x != w:
				_card_dirty[i] = false
				_card_size[i] = Vector2(w, c.get_combined_minimum_size().y)
				c.size = _card_size[i]
			var h := _card_size[i].y
			var x := size.x - pad - w if i == 1 else pad
			c.position = Vector2(x + dx, top + maxf(0.0, (bottom - top - h) * 0.5) + dy)
			# gearIn runs from when the cards were made (the start of the intro), shown or not
			c.gear_at(intro_t)
		# the garage's part renders come in a few frames after they're first asked for
		if _pic_wait > 0.0:
			_pic_wait -= dt
			if _pic_wait <= 0.0:
				var all := true
				for i in 2:
					all = _cards[i].refresh_pictures(game, _specs[i]) and all
				_pic_wait = 0.0 if all else 0.5

	func _draw() -> void:
		# (timed for the performance overlay's HUD row)
		var t0 := Perf.now()
		_draw_body()
		Perf.add(Perf.HUD, t0)

	func _draw_body() -> void:
		var u := clampf(size.y / 720.0, 0.6, 2.0)
		var fade := 1.0 - _gone
		if _out >= 0 and _out_t < 0.3:
			# presentOut: fade and drop 10px
			var k := _out_t / 0.3
			_banner(_out, 9.0, u, fade * (1.0 - k), 10.0 * u * k)
		if _who >= 0:
			_banner(_who, _t, u, fade, 0.0)

	## One robot's banner at `t` seconds into its presentation.
	func _banner(i: int, t: float, u: float, alpha: float, drop: float) -> void:
		if alpha <= 0.0:
			return
		var em := 20.0 * u
		_wide.spacing_glyph = int(0.2 * 0.8 * em)
		var side := CYAN if i == 0 else ORANGE
		var right := i == 0  # the blue robot stands screen-left, so its name lands on the right
		var pad := maxf(28.0 * u, FightHud.side_margin(self))
		var edge := size.x - pad if right else pad
		var y := size.y - 18.0 * u + drop
		# bottom up (the web's column top down: corner, name, style, taunt, tune)
		var lines := []
		var tune_col := side.lerp(Color.WHITE, 0.3)
		tune_col.a = 0.85
		lines.append(["\u266a  " + _tunes[i], int(0.72 * em), tune_col, 0.35, 0.45, _wide])
		if _taunts[i] != "":
			# a career rival's taunt (.banner .taunt: up to 22em wide, wrapping), last line first
			var tfs := int(0.95 * em)
			var wrapped := _wrap(_taunts[i], _taunt_font, tfs, minf(22.0 * tfs, size.x * 0.62))
			wrapped.reverse()
			for ln in wrapped:
				lines.append([ln, tfs, Color.WHITE, 2.8, 0.5, _taunt_font])
		lines.append([_styles[i], int(0.85 * em), MUTED, 2.35, 0.45, _wide])
		lines.append(["\n", 0, side, 0.0, 0.0, null])
		lines.append([_names[i], int(minf(3.4 * em, size.x * 0.085)), Color.WHITE, 1.95, 0.55, _bold])
		lines.append(["IN THE BLUE CORNER" if i == 0 else "AND IN THE ORANGE CORNER", int(0.8 * em), side, 0.1, 0.45, _wide])
		for line in lines:
			var text: String = line[0]
			var fs: int = line[1]
			if text == "\n":
				# the name's underline, wiping in from the corner's side (barIn at 2.25s)
				var nfs := int(minf(3.4 * em, size.x * 0.085))
				var nw := minf(_bold.get_string_size(_names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, nfs).x, size.x * 0.62)
				var bk := _ease(clampf((t - 2.25) / 0.5, 0.0, 1.0))
				if bk > 0.0:
					var bh := maxf(2.0, nfs * 0.1)
					var x0 := edge - nw if right else edge
					var steps := 12
					for s in steps:
						var a := float(s) / steps
						var b := float(s + 1) / steps
						# grows from its outer end (transform-origin left / right)
						var ca := a * bk
						var cb := b * bk
						var xa := (edge - nw * ca) if right else (x0 + nw * ca)
						var xb := (edge - nw * cb) if right else (x0 + nw * cb)
						var c := side.lerp(_paint[i], (a + b) * 0.5)
						c.a = alpha
						draw_rect(Rect2(minf(xa, xb), y - bh, absf(xb - xa) + 0.5, bh), c)
					y -= bh + 0.05 * em
				continue
			var t0: float = line[3]
			var dur: float = line[4]
			var font: Font = line[5]
			var k := clampf((t - t0) / dur, 0.0, 1.0)
			var lh := fs * 1.05
			if k > 0.0:
				var tw := minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x, size.x * 0.62)
				var col: Color = line[2]
				col.a *= alpha * k
				var at := Vector2(edge - tw if right else edge, y - fs * 0.22)
				if font == _bold:
					# nameSlam: from 1.7x, skewed, out of nothing
					var e := _ease_back(k)
					var sc := lerpf(1.7, 1.0, e)
					var pivot := at + Vector2(tw * 0.5, -fs * 0.35)
					draw_set_transform_matrix(Transform2D(Vector2(sc, 0), Vector2(-0.18 * (1.0 - e) * sc, sc), pivot) * Transform2D(0.0, -pivot))
					var glow := _paint[i]
					glow.a = 0.3 * col.a
					draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, int(fs * 0.14), glow)
					draw_string(font, at + Vector2(0, 4 * u), text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, Color(0, 0, 0, 0.5 * col.a))
					draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, col)
					draw_set_transform_matrix(Transform2D.IDENTITY)
				else:
					at.y += 0.6 * fs * (1.0 - _ease(k))
					draw_string_outline(font, at + Vector2(0, 1), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(3, int(fs * 0.2)), Color(0, 0, 0, 0.45 * col.a))
					draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
			y -= lh + 0.15 * em

	## `text` broken into lines no wider than `room` at `fs`.
	static func _wrap(text: String, font: Font, fs: int, room: float) -> Array[String]:
		var out: Array[String] = []
		var line := ""
		for word in text.split(" ", false):
			var next := word if line == "" else line + " " + word
			if line != "" and font.get_string_size(next, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > room:
				out.append(line)
				line = word
			else:
				line = next
		if line != "":
			out.append(line)
		return out

	## cubic-bezier(0.2, 1, 0.3, 1), near enough.
	static func _ease(x: float) -> float:
		return 1.0 - pow(1.0 - x, 4.0)

	## cubic-bezier(0.2, 1.4, 0.4, 1): overshoots a touch, then settles.
	static func _ease_back(x: float) -> float:
		var c := 1.9
		return 1.0 + (c + 1.0) * pow(x - 1.0, 3.0) + c * pow(x - 1.0, 2.0)


## The connection pill (style.css .net-pill): a glowing dot (green, amber pulsing, red) and a few
## words, on a dark round pill.
class NetPill extends Control:
	const BG := Color(12 / 255.0, 15 / 255.0, 23 / 255.0, 0.72)
	var text := ""
	var kind := "ok"
	var _em := 16.0
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	## Whether anything changed (the pill's size may have).
	func set_state(text_: String, kind_: String, em_: float) -> bool:
		if text_ == text and kind_ == kind and em_ == _em:
			return false
		text = text_
		kind = kind_
		_em = em_
		update_minimum_size()
		queue_redraw()
		return true

	func _font() -> Font:
		return HudKit.body(600)

	func _get_minimum_size() -> Vector2:
		var fs := 0.8 * _em
		var w := _font().get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(fs)).x
		# padding 0.4em 0.9em, the 0.55em dot 0.45em before the words
		return Vector2(w + fs * (0.9 * 2.0 + 0.55 + 0.45), fs * (1.25 + 0.8))

	func _process(dt: float) -> void:
		if kind == "warn" and visible:
			_t += dt
			queue_redraw()

	func _draw() -> void:
		var fs := 0.8 * _em
		var r := Rect2(Vector2.ZERO, size)
		var sb := StyleBoxFlat.new()
		sb.bg_color = BG
		sb.set_corner_radius_all(int(size.y * 0.5) - 1)
		sb.border_color = UiTheme.LINE
		sb.set_border_width_all(1)
		draw_style_box(sb, r)
		var c := HudKit.GREEN if kind == "ok" else HudKit.AMBER if kind == "warn" else HudKit.RED
		# (ghostDot: the amber one breathes)
		var a := 0.45 + 0.55 * (0.5 + 0.5 * cos(_t * TAU)) if kind == "warn" else 1.0
		var at := Vector2(fs * 0.9 + fs * 0.275, size.y * 0.5)
		for k in 4:
			draw_circle(at, fs * 0.275 + k * fs * 0.12, Color(c, 0.12 * a * (4 - k) / 4.0))
		draw_circle(at, fs * 0.275, Color(c, a))
		var f := _font()
		var base := (size.y - f.get_height(roundi(fs))) * 0.5 + f.get_ascent(roundi(fs))
		draw_string(f, Vector2(fs * (0.9 + 0.55 + 0.45), base), text, HORIZONTAL_ALIGNMENT_LEFT, -1, roundi(fs), UiTheme.TEXT_2)
