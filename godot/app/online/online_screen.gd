## The online room screen (src/ui/online.ts OnlineScreen): create a room (and share its code), or
## type a friend's code to join theirs; then both bots face off here until the host starts the
## fight. Host on the left, guest on the right, the same corners they fight from. Rooms are the
## web game's too (OnlineSession), so a friend on the web can join a room opened here, and the
## other way round.
##
## The room itself is the App's (App.net): it stays up while the player looks at the garage, fights
## and the results, and closes on the way home.
class_name OnlineScreen
extends AppScreen

const EM := UiTheme.EM
const ORANGE := Color(1.0, 0.478, 0.102)
const AMBER := Color(1.0, 0.706, 0.227)

## The last thing that went wrong (a failed join, the host closing the room), shown until the next try.
var error := ""
## What's in the code box, kept across redraws.
var typed := ""

var _wash := TextureRect.new()
var _top := HBoxContainer.new()
var _body := BoxContainer.new()
var _cards := HBoxContainer.new()
var _slots: Array[Control] = []
var _vs: Label
var _side := PanelContainer.new()
var _col := VBoxContainer.new()
var _msg: Label
var _code_in: LineEdit
## What each corner shows (its bot, or empty), so it's only rebuilt when that changes.
var _shown := ["", ""]
var _ping_t := 0.0
var _pics_t := 0.0
## The bots on the two cards.
var _specs := [null, null]
var _dots_t := 0.0
var _built := false


func _ready() -> void:
	_build()
	resized.connect(_layout)


func _build() -> void:
	_built = true
	# a wash over the arena, darker on the right behind the room's card
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.45, 1.0])
	g.colors = PackedColorArray([Color(0.02, 0.027, 0.047, 0.55), Color(0.02, 0.027, 0.047, 0.45), Color(0.02, 0.027, 0.047, 0.82)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.width = 256
	gt.height = 1
	_wash.texture = gt
	_wash.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_wash.stretch_mode = TextureRect.STRETCH_SCALE
	_wash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_wash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_wash)
	# the top bar: home (leaving the room) and the title
	_top.add_theme_constant_override(&"separation", int(0.9 * EM))
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var home := MenuKit.edge_pill("home", "Home", EM)
	home.name = "Home"
	home.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	_top.add_child(home)
	var title_row := HBoxContainer.new()
	title_row.add_theme_constant_override(&"separation", int(0.45 * EM))
	title_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title_row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	title_row.add_child(MenuKit.icon("globe", 1.5 * EM, UiTheme.CYAN))
	var title := MenuKit.grad_label("ONLINE", 1.55 * EM, MenuKit.broadcast(400), Color(0.62, 0.93, 1.0), Color(0.2, 0.62, 1.0))
	MenuKit.text_shadow(title, 0.45)
	title_row.add_child(title)
	_top.add_child(title_row)

	# the two corners and the room's card
	_body.add_theme_constant_override(&"separation", int(1.2 * EM))
	_body.alignment = BoxContainer.ALIGNMENT_CENTER
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_body)
	_cards.alignment = BoxContainer.ALIGNMENT_CENTER
	_cards.add_theme_constant_override(&"separation", int(0.7 * EM))
	_cards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.add_child(_cards)
	for i in 2:
		var slot := CenterContainer.new()
		slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.custom_minimum_size = Vector2(15.5 * EM, 0)
		_slots.append(slot)
		_cards.add_child(slot)
		if i == 0:
			# .online-vs
			_vs = MenuKit.label("VS", 1.6 * EM, 800, Color(1, 1, 1, 0.9))
			_vs.add_theme_font_override(&"font", MenuKit.broadcast(800))
			MenuKit.text_shadow(_vs, 0.6)
			_vs.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			_cards.add_child(_vs)
	var sb := MenuKit.box(UiTheme.PANEL_2, 22, [1.2 * EM, 1.1 * EM, 1.2 * EM, 1.15 * EM], UiTheme.LINE, 1)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 25
	sb.shadow_offset = Vector2(0, 18)
	_side.add_theme_stylebox_override(&"panel", sb)
	_side.custom_minimum_size.x = 18.5 * EM
	_side.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_side.mouse_filter = Control.MOUSE_FILTER_STOP
	_col.add_theme_constant_override(&"separation", int(0.65 * EM))
	_side.add_child(_col)
	_body.add_child(_side)


func enter() -> void:
	if not _built:
		_build()
	# this phone's sim fingerprint, worked out while the screen is up rather than on the first tap
	NetFingerprint.start()
	_shown = ["", ""]
	render()
	_layout.call_deferred()


func exit() -> void:
	if _code_in != null:
		_code_in.release_focus()


func refresh() -> void:
	if visible:
		render()


func tick(dt: float) -> void:
	# the camera turns slowly round the ring (App._camera "online")
	app.game.director.menu_turn += dt * 0.035
	# the part pictures come in a few frames after the cards ask for them
	_pics_t += dt
	if _pics_t > 0.25:
		_pics_t = 0.0
		for i in 2:
			var card := _slots[i].find_child("Card", true, false) as BotCard
			if card != null:
				card.refresh_pictures(app.game, _specs[i])
	# keep the ping fresh
	_ping_t += dt
	var s: OnlineSession = app.net
	if _ping_t > 1.5 and _msg != null and s != null and not s.connecting and s.blocker == "" and not s.peer_lost:
		_ping_t = 0.0
		_msg.text = _status(s)
	# the waiting corner's dots
	_dots_t += dt
	for slot in _slots:
		var d := slot.find_child("Dots", true, false)
		if d != null:
			d.queue_redraw()


# ------------------------------------------------------------------ actions

func _create() -> void:
	if app.net != null:
		return
	app.tap("select")
	error = ""
	app.net_host()
	render()


func _join(raw: String) -> void:
	var code := NetRoom.normalize_code(raw)
	typed = code
	if app.net != null:
		return
	if code.length() != NetRoom.CODE_LEN:
		error = "Room codes are %d letters." % NetRoom.CODE_LEN
		render()
		return
	app.tap("select")
	error = ""
	app.net_join(code)
	render()


## The room couldn't be opened or joined, or it ended while the player was here (App).
func show_error(why: String) -> void:
	error = why
	render()


func _copy(b: Button) -> void:
	app.tap()
	var s: OnlineSession = app.net
	if s == null:
		return
	DisplayServer.clipboard_set("Fight my bot in Battlebots! Room code: %s" % s.code)
	UiTheme.set_button(b, "Copied", "copy")


# ------------------------------------------------------------------ view

func render() -> void:
	if not visible or not _built:
		return
	var s: OnlineSession = app.net
	var room: bool = s != null and not (s.connecting and s.role == "host") and not (s.connecting and s.role == "guest")
	# the corners: host left, guest right. Before a room exists you stand on the left.
	var me = app.player
	var left = me if s == null or s.role == "host" else s.peer_bot
	var right = s.peer_bot if s != null and s.role == "host" else me if s != null and room else null
	_card(0, left, "Host" if s != null and s.role == "guest" else "You", s)
	_card(1, right, "You" if s != null and s.role == "guest" else "Opponent", s)
	_render_side(s, room)


func _card(i: int, spec, tag: String, s: OnlineSession) -> void:
	var key := JSON.stringify(TInit.to_json(spec)) + tag if spec != null else "empty%d" % (1 if s != null and s.role == "host" and not s.connecting else 0)
	if _shown[i] == key:
		return
	_shown[i] = key
	var slot := _slots[i]
	for c in slot.get_children():
		c.queue_free()
	var side := "r" if i == 1 else "l"
	_specs[i] = spec
	if spec != null:
		var card := BotCard.make(app.game, spec, TItems.computeBuild(spec.loadout, spec.size_), side, tag, 0.05)
		card.name = "Card"
		card.custom_minimum_size.x = 15.5 * EM
		var r := Rise.wrap(card)
		slot.add_child(r)
		r.play(0.45, 0.0, Vector2((-1.0 if i == 0 else 1.0) * 1.2 * EM, 0), 0.98)
	else:
		slot.add_child(_ghost(side, key != "empty0"))


## An empty corner (.bcard.ghost): a dashed outline with "Your opponent", or, in an open room,
## three breathing dots and "Waiting for a challenger".
func _ghost(side: String, waiting: bool) -> Control:
	var p := PanelContainer.new()
	var sb := MenuKit.box(Color(1, 1, 1, 0.03), 24, [EM, EM, EM, EM], Color(1, 1, 1, 0.16), 1)
	p.add_theme_stylebox_override(&"panel", sb)
	p.custom_minimum_size = Vector2(15.5 * EM, 21.0 * EM)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override(&"separation", int(0.6 * EM))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(v)
	if waiting:
		var dots := Dots.new()
		dots.name = "Dots"
		dots.screen = self
		dots.color = ORANGE if side == "r" else UiTheme.CYAN
		dots.custom_minimum_size = Vector2(3.2 * EM, 0.8 * EM)
		dots.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		v.add_child(dots)
	var l := MenuKit.label("Waiting for a challenger" if waiting else "Your opponent", 0.95 * EM, 600, UiTheme.MUTED)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	return p


func _render_side(s: OnlineSession, room: bool) -> void:
	for c in _col.get_children():
		_col.remove_child(c)
		c.queue_free()
	_msg = null
	_code_in = null
	if not room:
		_render_lobby(s)
		return
	# in a room: its code, how it's going, and (the host) the Fight button
	var code_box := VBoxContainer.new()
	code_box.add_theme_constant_override(&"separation", int(0.15 * EM))
	code_box.add_child(MenuKit.kicker("Room code", EM))
	var code := MenuKit.label(s.code, 2.6 * EM, 800, Color.WHITE, int(0.3 * EM))
	code.add_theme_font_override(&"font", MenuKit.broadcast(800))
	code.name = "Code"
	MenuKit.text_shadow(code, 0.5)
	code_box.add_child(code)
	_col.add_child(code_box)
	if s.role == "host":
		var copy := _btn("Copy code", "copy", &"BtnSmall")
		copy.pressed.connect(_copy.bind(copy))
		_col.add_child(copy)
		var hint := MenuKit.label("Your friend opens Online and types this code, on the app or in the web game.", 0.78 * EM, 500, UiTheme.MUTED)
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_col.add_child(hint)
	var bad := s.blocker != ""
	var warn := not bad and s.peer_lost
	_msg = MenuKit.label(s.blocker if bad else "Connection is shaky…" if warn else _status(s), 0.9 * EM, 600, UiTheme.RED if bad else AMBER if warn else UiTheme.TEXT_2)
	_msg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_msg.name = "Status"
	_col.add_child(_msg)
	if s.role == "host":
		var fight := _btn("Fight", "swords", &"BtnPrimary")
		fight.name = "Fight"
		MenuKit.button_text(fight, 1.15 * EM, 800, 1.3 * EM)
		fight.custom_minimum_size.y = 3.2 * EM
		fight.disabled = not s.can_fight
		fight.pressed.connect(func() -> void:
			app.tap("start")
			s.start_fight())
		_col.add_child(fight)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(0.45 * EM))
	var garage := _btn("Garage", "wrench", &"BtnSmall")
	garage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	garage.disabled = not app.screens.has("garage")
	garage.pressed.connect(func() -> void:
		app.tap("select")
		app.go("garage"))
	row.add_child(garage)
	var leave := _btn("Leave", "exit", &"BtnDanger")
	leave.name = "Leave"
	leave.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	leave.pressed.connect(func() -> void:
		app.tap("back")
		app.net_leave()
		error = ""
		render())
	row.add_child(leave)
	_col.add_child(row)


## No room yet: make one or join one.
func _render_lobby(s: OnlineSession) -> void:
	var busy := "" if s == null else "create" if s.role == "host" else "join"
	var lede := MenuKit.label("Fight a friend. One of you opens a room, the other types its code. Phones and the web game play together.", 0.92 * EM, 500, UiTheme.TEXT_2)
	lede.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_col.add_child(lede)
	var create := _btn("Opening…" if busy == "create" else "Create room", "swords", &"BtnPrimary")
	create.name = "Create"
	create.disabled = busy != ""
	create.pressed.connect(_create)
	_col.add_child(create)
	# .online-or: a hairline either side of the words
	var or_row := HBoxContainer.new()
	or_row.add_theme_constant_override(&"separation", int(0.6 * EM))
	for k in 3:
		if k == 1:
			var w := MenuKit.label("OR JOIN ONE", 0.7 * EM, 700, UiTheme.MUTED, int(0.1 * EM))
			or_row.add_child(w)
		else:
			var line := ColorRect.new()
			line.color = UiTheme.LINE
			line.custom_minimum_size.y = 1
			line.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			line.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			or_row.add_child(line)
	_col.add_child(or_row)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(0.45 * EM))
	var inp := LineEdit.new()
	inp.name = "CodeIn"
	inp.placeholder_text = "CODE"
	inp.text = typed
	inp.max_length = NetRoom.CODE_LEN
	inp.context_menu_enabled = false
	inp.virtual_keyboard_enabled = true
	inp.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_DEFAULT
	inp.caret_blink = true
	inp.alignment = HORIZONTAL_ALIGNMENT_CENTER
	inp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inp.custom_minimum_size.y = 2.9 * EM
	inp.editable = busy == ""
	inp.add_theme_font_override(&"font", MenuKit.broadcast(800))
	inp.add_theme_font_size_override(&"font_size", int(1.35 * EM))
	inp.add_theme_constant_override(&"letter_spacing", int(0.25 * EM))
	inp.add_theme_color_override(&"font_color", Color.WHITE)
	inp.add_theme_color_override(&"font_placeholder_color", Color(1, 1, 1, 0.25))
	inp.add_theme_color_override(&"caret_color", Color.WHITE)
	inp.add_theme_stylebox_override(&"normal", MenuKit.box(Color(0, 0, 0, 0.35), 14, [0.6 * EM, 0, 0.6 * EM, 0], UiTheme.LINE_2, 1))
	var lit := MenuKit.box(Color(0, 0, 0, 0.35), 14, [0.6 * EM, 0, 0.6 * EM, 0], UiTheme.CYAN, 1)
	lit.shadow_color = Color(UiTheme.CYAN, 0.2)
	lit.shadow_size = 4
	inp.add_theme_stylebox_override(&"focus", lit)
	inp.add_theme_stylebox_override(&"read_only", MenuKit.box(Color(0, 0, 0, 0.25), 14, [0.6 * EM, 0, 0.6 * EM, 0], UiTheme.LINE, 1))
	# capitals only, look-alikes and stray characters dropped as they're typed
	inp.text_changed.connect(func(t: String) -> void:
		var v := NetRoom.normalize_code(t)
		if v != t:
			var at := inp.caret_column
			inp.text = v
			inp.caret_column = mini(at, v.length())
		typed = v)
	inp.text_submitted.connect(func(t: String) -> void: _join(t))
	row.add_child(inp)
	_code_in = inp
	var go := _btn("Joining…" if busy == "join" else "Join", "", &"Btn")
	go.name = "Join"
	go.disabled = busy != ""
	go.custom_minimum_size.y = 2.9 * EM
	go.pressed.connect(func() -> void: _join(inp.text))
	row.add_child(go)
	_col.add_child(row)
	if error != "":
		var e := MenuKit.label(error, 0.88 * EM, 600, UiTheme.RED)
		e.name = "Error"
		e.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_col.add_child(e)


func _status(s: OnlineSession) -> String:
	if not s.connected:
		return s.note
	if s.peer_bot == null:
		return "Connecting…"
	if s.checking:
		return "Checking you're on the same version…"
	var ping := "%d ms" % roundi(s.rtt)
	return "%s is in. Ping %s" % [s.peer_bot.name_, ping] if s.role == "host" else "Waiting for %s to start the fight. Ping %s" % [s.peer_bot.name_, ping]


func _btn(text: String, icon_name: String, variant: StringName) -> Button:
	var b := UiTheme.button(text, icon_name, variant)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if variant == &"BtnSmall" or variant == &"BtnDanger":
		MenuKit.button_text(b, 0.86 * EM, 700, 1.2 * 0.86 * EM)
		MenuKit.pad_button(b, 1.1 * 0.86 * EM, 2.6 * 0.86 * EM)
	return b


## The cards beside the room's card on a wide screen, the room's card under them on a narrow one;
## inside the side strips and under the top bar.
func _layout() -> void:
	if size.x <= 0.0:
		return
	var side := FightHud.side_margin(self)
	var bottom := FightHud.bottom_margin(self)
	var top := 12.0
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.y > 0 and safe.size.y > 0:
		top = maxf(top, safe.position.y * size.y / float(screen.y))
	_top.position = Vector2(side, top)
	_top.size = Vector2(size.x - side * 2.0, UiTheme.TAP)
	var y0 := top + UiTheme.TAP + 0.6 * EM
	var w := size.x - side * 2.0
	var wide := w >= 2.0 * 15.5 * EM + 3.0 * EM + 18.5 * EM + 2.4 * EM
	_body.vertical = not wide
	# a narrow screen drops the cards: the room is what matters
	_cards.visible = wide or size.y > 40.0 * EM
	_body.position = Vector2(side, y0)
	_body.size = Vector2(w, size.y - y0 - bottom)


## Three dots breathing one after another (.ghost-in .dots).
class Dots extends Control:
	var screen
	var color := UiTheme.CYAN

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var t: float = screen._dots_t if screen != null else 0.0
		var r := size.y * 0.5
		for k in 3:
			var a := 0.25 + 0.75 * (0.5 + 0.5 * sin((t * 1.4 - k * 0.22) * TAU))
			draw_circle(Vector2(r + k * (size.x - 2.0 * r) / 2.0, r), r * (0.7 + 0.3 * a), Color(color, a))
