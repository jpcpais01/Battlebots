## The home screen (src/ui/app.ts buildHome, refreshHome, patchBtn, patchNotes, toggleSound,
## syncSound, cycleHomePlace, syncSceneBtn, homeTick; style.css .topbar, .brand, .logo,
## .notes-btn, .scene-btn, .hero, .pill, .hero-tiles, .home-actions, .home-record, .note).
##
## Along the top: the wordmark and What's new on the left; the home scene, sound and settings on
## the right. Bottom left: the player's bot (its power, name, both special moves, live maker sets,
## frame size and the six parts it wears; the name opens the garage, a part opens the garage on
## that slot). Bottom right: the record, the garage, online, career and replays, and Fight.
## Sideways drags spin the bot in the ring (menu camera).
##
## The web's refresh, fullscreen and account buttons have no place on Android (the account is
## phase 5), so they're left out; Online and Replays stand disabled until they're ported.
class_name HomeScreen
extends AppScreen

const PLACES := ["beach", "gym", "lounge", "arena"]
## The Titans button's icon: a towering robot, a fan at its feet.
const TITAN_SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="2" width="7" height="5" rx="1.2"/><path d="M9 9.5h9M13.5 7v7.5M11 22l2.5-7.5L16 22M9 9.5l-1.2 5M18 9.5l1.2 5"/><circle cx="4.5" cy="17.6" r="1.1"/><path d="M4.5 19.5V22"/></svg>'
const PLACE_NAME := {"beach": "Beach", "gym": "Gym", "lounge": "Lounge", "arena": "Arena"}

var _em := UiTheme.EM
var _top := HBoxContainer.new()
var _notes: Button
var _notes_dot: Control
## The Skins button (the Skin Vault) and its gold dot while a free pull waits.
var _vault: Button
var _vault_dot: Control
var _vault_t := 0.0
var _scene: Button
var _sound: Button
var _gear: Button
var _hero := VBoxContainer.new()
var _hero_rise: Rise
var _right := VBoxContainer.new()
var _right_rise: Rise
var _power: Label
var _name_btn: Button
var _name: Label
var _name_bar: Panel
var _meta := HFlowContainer.new()
var _tiles: Array[PartTile] = []
var _record := HBoxContainer.new()
var _career: Button
## Tag Team: two bots a side (app/tagteam).
var _tag: Button
var _titans: Button
var _garage: Button
var _cash: Label
var _fight: Button
## The Fight button's way out of an animated home scene is playing (app.ts leaving).
var leaving := false
var _white: ColorRect
## Drag to spin the bot (app.ts setupGarageDrag / flingStep / homeTick).
var _drag := false
var _last_x := 0.0
var _last_t := 0
var _vel := 0.0
var _idle := 0.0
## Tiles still waiting on their part picture (the garage renders them in the background).
var _pic_wait := 0.0


func _ready() -> void:
	_build_top()
	_build_hero()
	_build_actions()
	resized.connect(_layout)
	# (the pills wrap once the card knows its width: lay out again whenever its content settles)
	_hero.minimum_size_changed.connect(_queue_layout)
	_right.minimum_size_changed.connect(_queue_layout)
	if app != null:
		app.changed.connect(refresh)
		if app.game.settings != null:
			app.game.settings.changed.connect(_sync_sound)
	_sync_sound()
	refresh()


# ------------------------------------------------------------------ top bar

func _build_top() -> void:
	_top.add_theme_constant_override(&"separation", int(_em))
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var brand := HBoxContainer.new()
	brand.add_theme_constant_override(&"separation", int(0.9 * _em))
	brand.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(brand)
	brand.add_child(_logo())
	_notes = _notes_button()
	brand.add_child(_notes)
	brand.add_child(_version_label())
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	var tr := HBoxContainer.new()
	tr.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(tr)
	_scene = MenuKit.edge_pill("scene", "Beach", _em)
	_scene.tooltip_text = "Home scene"
	_scene.pressed.connect(cycle_home_place)
	tr.add_child(_scene)
	_sound = UiTheme.icon_button("sound", UiTheme.TAP)
	_sound.pressed.connect(toggle_sound)
	tr.add_child(_sound)
	_gear = UiTheme.icon_button("gear", UiTheme.TAP)
	_gear.tooltip_text = "Settings"
	_gear.pressed.connect(open_settings)
	tr.add_child(_gear)
	_sync_scene_btn()


## The wordmark: BATTLE in white, BOTS in a hot gradient, in the broadcast face (.logo, 1.55em).
func _logo() -> Control:
	var px := 1.55 * _em
	# (.logo sets no weight: the broadcast face at its regular one, as phones show it)
	var f := MenuKit.broadcast(400)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 0)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l1 := Label.new()
	l1.text = "BATTLE"
	l1.add_theme_font_override(&"font", f)
	l1.add_theme_font_size_override(&"font_size", int(round(px)))
	l1.add_theme_color_override(&"font_color", Color.WHITE)
	# filter: drop-shadow(0 4px 16px rgba(0,0,0,0.55))
	l1.add_theme_color_override(&"font_shadow_color", Color(0, 0, 0, 0.3))
	l1.add_theme_constant_override(&"shadow_offset_y", 4)
	l1.add_theme_constant_override(&"shadow_outline_size", 8)
	row.add_child(l1)
	var l2 := MenuKit.grad_label("BOTS", px, f, MenuKit.css("#ffc15a"), MenuKit.css("#ff6a12"))
	# (padding-right 0.15em: the italic's overhang)
	l2.custom_minimum_size.x = f.get_string_size("BOTS", HORIZONTAL_ALIGNMENT_LEFT, -1, int(round(px))).x + 0.15 * px
	row.add_child(l2)
	return row


## The build this is ("v0.1.19"; the release build stamps application/config/version, a local
## one says "dev"), quietly beside the What's new pill.
func _version_label() -> Label:
	var v := app_version()
	var l := MenuKit.label(v if v == "dev" else "v" + v, 0.72 * _em, 650, Color(1, 1, 1, 0.85))
	l.name = "Version"
	# (a soft shadow, like the wordmark's, keeps it readable on a bright sky)
	l.add_theme_color_override(&"font_shadow_color", Color(0, 0, 0, 0.35))
	l.add_theme_constant_override(&"shadow_offset_y", 1)
	l.add_theme_constant_override(&"shadow_outline_size", 6)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func app_version() -> String:
	return str(ProjectSettings.get_setting("application/config/version", "dev"))


## The What's new pill (.notes-btn), with a dot until the newest notes are opened (patchBtn).
func _notes_button() -> Button:
	var fs := 0.78 * _em
	var b := MenuKit.bare_button(0.94)
	var face := MenuKit.pill(MenuKit.box(MenuKit.ICON_BG, 999, [0.9 * fs, 0.4 * fs, 0.9 * fs, 0.4 * fs], UiTheme.LINE, 1))
	face.name = "Face"
	var l := MenuKit.label("What's new", fs, 650, UiTheme.TEXT_2)
	l.name = "Text"
	face.get_node("Row").add_child(l)
	b.add_child(face)
	# .notes-btn.new::after: a blue dot on the top right corner, ringed in the page colour
	var dot := Panel.new()
	var ds := MenuKit.box(MenuKit.ACCENT, 99, [0, 0, 0, 0], MenuKit.BG, 2)
	ds.shadow_color = Color(MenuKit.ACCENT, 0.35)
	ds.shadow_size = 4
	dot.add_theme_stylebox_override(&"panel", ds)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot.size = Vector2.ONE * (0.6 * fs + 4.0)
	b.add_child(dot)
	_notes_dot = dot
	var sync := func() -> void:
		var ms := face.get_combined_minimum_size()
		b.custom_minimum_size = Vector2(ms.x, UiTheme.TAP)
		face.size = ms
		face.position = ((b.size - ms) * 0.5).round()
		dot.position = face.position + Vector2(ms.x - dot.size.x + 0.15 * fs + 2.0, -0.15 * fs - 2.0)
	face.minimum_size_changed.connect(sync)
	b.resized.connect(sync)
	sync.call()
	b.pressed.connect(func() -> void:
		Store.set_pref("notesSeen", latest_notes())
		_sync_notes()
		patch_notes())
	_sync_notes.call_deferred()
	return b


## The newest notes' key (app.ts patchBtn latest): hour, title and line count.
static func latest_notes() -> String:
	var n: Array = TPatchNotes.PATCH_NOTES
	if n.is_empty():
		return ""
	return "%s|%s|%d" % [n[0].hour, n[0].title, n[0].notes.size()]


func _sync_notes() -> void:
	var latest := latest_notes()
	var fresh := latest != "" and String(Store.pref("notesSeen", "")) != latest
	_notes_dot.visible = fresh
	var l := _notes.find_child("Text", true, false) as Label
	l.add_theme_color_override(&"font_color", UiTheme.TEXT if fresh else UiTheme.TEXT_2)


func _sync_scene_btn() -> void:
	var p: String = app.home_place if app != null else "beach"
	MenuKit.set_edge_pill(_scene, "scene", PLACE_NAME.get(p, "Beach"))


func _sync_sound() -> void:
	var on := true
	if app != null and app.game.settings != null:
		on = app.game.settings.sound
	_sound.icon = UiTheme.icon("sound" if on else "mute", 19)
	_sound.tooltip_text = "Sound on" if on else "Sound off"


## The sound button (app.ts toggleSound): on or off, then the tap (heard only when it's on).
func toggle_sound() -> void:
	var s = app.game.settings
	s.set_sound(not s.sound)
	_sync_sound()
	app.tap("tap")


## The scene button (app.ts cycleHomePlace): beach, gym, lounge, arena, round again. Dips through
## black, tells the home stage which scene to show, and comes back up on it.
func cycle_home_place() -> void:
	if leaving:
		return
	app.tap("select")
	var i := PLACES.find(app.home_place)
	app.home_place = PLACES[(i + 1) % PLACES.size()]
	Store.set_pref("homeScene", app.home_place)
	_sync_scene_btn()
	app._dip(func() -> void:
		# (game.ts homeScene: the stage switches to it)
		if app.home_place != "arena" and app.game.has_place("home"):
			app.game.home_scene(app.home_place)
		if app.current == "home":
			app.go("home"))


## The Settings card over the home screen (app.ts settings), the same one the pause menu opens,
## with the web's Reset win record under the Game column.
func open_settings() -> void:
	app.tap("tap")
	var screen := SettingsScreen.new(app.game.settings)
	screen.blip = func(kind: String) -> void: app.tap(kind)
	var m := Modal.open_card(app.ui, screen)
	screen.closed.connect(m.close)
	var game_col := screen.row("perf").get_parent() if screen.row("perf") != null else null
	if game_col != null:
		game_col.add_child(_reset_button())
	m._layout()


## .set-danger: tap twice to wipe the win record (the map's events and the career stay).
func _reset_button() -> Control:
	var wrap := MarginContainer.new()
	wrap.add_theme_constant_override(&"margin_top", 7)
	wrap.add_theme_constant_override(&"margin_bottom", 3)
	var b := Button.new()
	b.text = "Reset win record"
	b.custom_minimum_size.y = maxf(38.0, 2.4 * _em)
	b.focus_mode = Control.FOCUS_NONE
	var red := UiTheme.RED
	var calm := MenuKit.box(Color(red, 0.08), 999, [16, 0, 16, 0], Color(red, 0.4), 1)
	var armed := MenuKit.box(red, 999, [16, 0, 16, 0])
	var paint := func(on: bool) -> void:
		for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus"]:
			b.add_theme_stylebox_override(s, armed if on else calm)
		var off := calm.duplicate() as StyleBoxFlat
		b.add_theme_stylebox_override(&"disabled", off)
		var tc := Color.WHITE if on else red.lerp(Color.WHITE, 0.3)
		for c in [&"font_color", &"font_hover_color", &"font_pressed_color", &"font_hover_pressed_color", &"font_focus_color"]:
			b.add_theme_color_override(c, tc)
		b.add_theme_color_override(&"font_disabled_color", Color(tc, 0.5))
	paint.call(false)
	b.add_theme_font_override(&"font", UiTheme.font(700))
	b.add_theme_font_size_override(&"font_size", int(round(0.86 * _em)))
	var state := {"armed": false}
	b.pressed.connect(func() -> void:
		if not state.armed:
			state.armed = true
			paint.call(true)
			b.text = "Tap again to reset"
			return
		var r = app.record
		r.wins = 0.0
		r.losses = 0.0
		r.draws = 0.0
		r.streak = 0.0
		r.best = 0.0
		app.save_record()
		paint.call(false)
		b.text = "Record reset"
		b.disabled = true)
	wrap.add_child(b)
	return wrap


# ------------------------------------------------------------------ patch notes

## The What's new popup (app.ts patchNotes): every group, newest first, with its hour in the
## phone's own time.
func patch_notes() -> void:
	app.tap("tap")
	Modal.open(app.ui, "What's new", func(m: Modal) -> void:
		m.width = 32.0 * _em
		var scroll := ScrollContainer.new()
		var list := VBoxContainer.new()
		list.add_theme_constant_override(&"separation", int(0.5 * _em))
		list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(list)
		var first := true
		for p in TPatchNotes.PATCH_NOTES:
			list.add_child(_note(p, first))
			first = false
		m.body.add_child(scroll)
		m.add_scroll(scroll), Callable(), true)


## One group (.note: a faint card, the newest one tinted blue): its title and hour, then its lines.
func _note(p, first: bool) -> Control:
	var card := PanelContainer.new()
	var bg := Color(MenuKit.ACCENT, 0.09) if first else Color(1, 1, 1, 0.035)
	var line := Color(MenuKit.ACCENT, 0.3) if first else UiTheme.LINE
	card.add_theme_stylebox_override(&"panel", MenuKit.box(bg, 16, [0.85 * _em, 0.7 * _em, 0.85 * _em, 0.75 * _em], line, 1))
	card.mouse_filter = Control.MOUSE_FILTER_PASS
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(0.4 * _em))
	card.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(_em))
	var t := MenuKit.label(String(p.title), _em, 750)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	t.custom_minimum_size.x = 80
	head.add_child(t)
	var h := MenuKit.label(TPatchNotes.hourLabel(String(p.hour)), 0.8 * _em, 500, UiTheme.MUTED)
	h.size_flags_vertical = Control.SIZE_SHRINK_END
	head.add_child(h)
	v.add_child(head)
	# ul: 0.88em, line-height 1.4, a disc per line, 0.25em between
	var ul := VBoxContainer.new()
	ul.add_theme_constant_override(&"separation", int(0.25 * _em))
	var fs := 0.88 * _em
	for n in p.notes:
		var li := HBoxContainer.new()
		li.add_theme_constant_override(&"separation", 0)
		var dot := MenuKit.label("•", fs, 500, UiTheme.TEXT_2)
		dot.custom_minimum_size.x = 1.1 * _em
		dot.vertical_alignment = VERTICAL_ALIGNMENT_TOP
		dot.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		dot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		li.add_child(dot)
		var l := MenuKit.label(String(n), fs, 500, UiTheme.TEXT_2)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.vertical_alignment = VERTICAL_ALIGNMENT_TOP
		l.add_theme_constant_override(&"line_spacing", int(fs * 0.4 - 3))
		l.custom_minimum_size.x = 120
		li.add_child(l)
		ul.add_child(li)
	v.add_child(ul)
	return card


# ------------------------------------------------------------------ your bot

func _build_hero() -> void:
	_hero.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	_hero.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_rise = Rise.wrap(_hero)
	add_child(_hero_rise)
	# kicker: "Your bot" and the power chip
	var k := HBoxContainer.new()
	k.add_theme_constant_override(&"separation", int(round(0.6 * _em)))
	k.mouse_filter = Control.MOUSE_FILTER_IGNORE
	k.add_child(MenuKit.kicker("Your bot", _em))
	var fs := 0.78 * _em
	var chip := MenuKit.pill(MenuKit.box(MenuKit.AMBER, 999, [0.65 * fs, 0.2 * fs, 0.65 * fs, 0.2 * fs]))
	_power = MenuKit.label("Power 0", fs, 700, UiTheme.INK)
	chip.get_node("Row").add_child(_power)
	k.add_child(chip)
	_hero.add_child(k)
	# the name (tap: the garage) with a short bar of the bot's paint under it
	var npx := 2.35 * _em
	_name_btn = MenuKit.bare_button(0.97)
	_name_btn.pressed.connect(func() -> void:
		app.tap("select")
		_to_garage(""))
	_name = MenuKit.label("", npx, 800, UiTheme.TEXT, -1)
	_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_name.clip_text = true
	MenuKit.text_shadow(_name, 0.4)
	_name_btn.add_child(_name)
	_name_bar = Panel.new()
	_name_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_name_btn.add_child(_name_bar)
	_hero.add_child(_name_btn)
	# moves, live sets and the frame size, as pills
	_meta.add_theme_constant_override(&"h_separation", int(round(0.3 * _em)))
	_meta.add_theme_constant_override(&"v_separation", int(round(0.3 * _em)))
	_meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero.add_child(_meta)
	# the six parts: 3.6em tiles, 0.4em apart, 0.25em under the pills
	var tiles := HBoxContainer.new()
	tiles.add_theme_constant_override(&"separation", int(round(0.4 * _em)))
	tiles.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tm := MarginContainer.new()
	tm.add_theme_constant_override(&"margin_top", int(round(0.25 * _em)))
	tm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tm.add_child(tiles)
	_hero.add_child(tm)
	for slot in TItems.SLOTS:
		var t := PartTile.make("hero", 3.6 * _em)
		t.pressed.connect(func() -> void:
			app.tap("select")
			_to_garage(t.slot))
		tiles.add_child(t)
		_tiles.append(t)


## The name's layout: one line at line-height 1.05, then the 2.2em x 0.09em bar 0.12em under it.
func _layout_name(hero_w: float) -> void:
	var npx := 2.35 * _em
	var line := npx * 1.05
	var bar := Vector2(2.2 * npx, maxf(2.0, 0.09 * npx))
	var gap := 0.12 * npx
	var f := _name.get_theme_font(&"font")
	var tw := f.get_string_size(_name.text, HORIZONTAL_ALIGNMENT_LEFT, -1, int(round(npx))).x
	var w := minf(tw + 2.0, hero_w)
	var lh := _name.get_combined_minimum_size().y
	_name_btn.custom_minimum_size = Vector2(w, line + gap + bar.y)
	_name.size = Vector2(w, lh)
	_name.position = Vector2(0, (line - lh) * 0.5)
	_name_bar.size = bar
	_name_bar.position = Vector2(0, line + gap)


func _pill(icon_name: String, text: String, icon_color: Color, text_color := UiTheme.TEXT_2, gap := 0.35) -> Control:
	var fs := 0.78 * _em
	var p := MenuKit.pill(MenuKit.box(MenuKit.PILL_BG, 999, [0.7 * fs, 0.28 * fs, 0.7 * fs, 0.28 * fs], UiTheme.LINE, 1), gap * fs)
	var row := p.get_node("Row")
	if icon_name != "":
		row.add_child(MenuKit.icon(icon_name, 1.15 * fs, icon_color))
	row.add_child(MenuKit.label(text, fs, 600, text_color))
	return p


## A word for a frame size (app.ts sizeName).
static func size_name(z: float) -> String:
	return "Compact" if z <= 0.85 else "Light" if z < 1.0 else "Standard" if z == 1.0 else "Heavy" if z < 1.15 else "Giant"


func _to_garage(slot: String) -> void:
	# (the garage opens on that slot's tab: app.garage_slot, read by the garage screen)
	if slot != "" and "garage_slot" in app:
		app.garage_slot = slot
	if app.screens.has("garage"):
		app.go("garage")


# ------------------------------------------------------------------ the actions

func _build_actions() -> void:
	_right.add_theme_constant_override(&"separation", int(round(0.55 * _em)))
	_right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_right_rise = Rise.wrap(_right)
	add_child(_right_rise)
	_record.alignment = BoxContainer.ALIGNMENT_CENTER
	_record.add_theme_constant_override(&"separation", int(round(1.1 * 0.82 * _em)))
	_record.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_right.add_child(_record)
	var sub := VBoxContainer.new()
	sub.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_right.add_child(sub)
	var two := HBoxContainer.new()
	two.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	two.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub.add_child(two)
	var garage := UiTheme.button("Garage", "wrench", &"Btn")
	MenuKit.pad_button(garage, 0.6 * _em)
	garage.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	garage.pressed.connect(func() -> void:
		app.tap("select")
		_to_garage(""))
	_garage = garage
	two.add_child(garage)
	_vault = UiTheme.button("Skins", "paint", &"Btn")
	MenuKit.pad_button(_vault, 0.6 * _em)
	_vault.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_vault.tooltip_text = "Skin Vault"
	_vault.pressed.connect(func() -> void:
		app.tap("select")
		app.go("vault"))
	two.add_child(_vault)
	# a gold dot on its corner while a free pull is waiting
	var dot := Panel.new()
	var ds := MenuKit.box(MenuKit.css("#ffc23d"), 99, [0, 0, 0, 0], MenuKit.BG, 2)
	ds.shadow_color = Color(MenuKit.css("#ffc23d"), 0.5)
	ds.shadow_size = 5
	dot.add_theme_stylebox_override(&"panel", ds)
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dot.size = Vector2.ONE * (0.5 * _em + 4.0)
	dot.visible = false
	_vault.add_child(dot)
	_vault_dot = dot
	# (inside the corner: the button already sits on the screen's side margin)
	_vault.resized.connect(func() -> void: dot.position = Vector2(_vault.size.x - dot.size.x - 0.35 * _em, 0.35 * _em))
	_career = UiTheme.button("Career", "map", &"Btn")
	_career.pressed.connect(func() -> void:
		app.tap("select")
		app.go("map"))
	_add_cash(_career)
	MenuKit.pad_button(_career, 0.6 * _em)
	sub.add_child(_career)
	# two bots a side: the team sheet (app/tagteam)
	_tag = UiTheme.button("Tag Team", "", &"Btn")
	_tag.name = "TagTeam"
	var tic := _tag.find_child("Icon", true, false) as TextureRect
	tic.texture = CareerKit.svg(TagTeamScreen.TEAM_SVG, 19)
	tic.visible = true
	_tag.pressed.connect(func() -> void:
		app.tap("select")
		app.go("tagteam"))
	MenuKit.pad_button(_tag, 0.6 * _em)
	# tag team and titans side by side (no room for tag team's "2 v 2" badge: its icon says it)
	var duo := HBoxContainer.new()
	duo.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	duo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub.add_child(duo)
	_tag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	duo.add_child(_tag)
	# titan battles: 30 m robots in the Titan Colosseum (render/titan)
	_titans = UiTheme.button("Titans", "", &"Btn")
	_titans.name = "Titans"
	var tti := _titans.find_child("Icon", true, false) as TextureRect
	tti.texture = CareerKit.svg(TITAN_SVG, 19)
	tti.visible = true
	_titans.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_titans.pressed.connect(fight.bind(true))
	MenuKit.pad_button(_titans, 0.6 * _em)
	duo.add_child(_titans)
	# (built ahead, so the first titan fight starts straight away)
	if app != null and app.game != null and app.game.has_method("load_venue"):
		app.game.load_venue("titan")
	# (replays come later: the shelf isn't ported yet)
	var small := HBoxContainer.new()
	small.add_theme_constant_override(&"separation", int(round(0.45 * _em)))
	small.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub.add_child(small)
	var replays := UiTheme.button("Replays", "replay", &"BtnSmall")
	MenuKit.pad_button(replays, 0.6 * _em, 2.4 * 0.86 * _em)
	MenuKit.button_text(replays, 0.86 * _em, 700, 1.2 * 0.86 * _em)
	replays.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	replays.disabled = true
	_dim(replays)
	small.add_child(replays)
	# online rooms (app/online): fight a friend, on a phone or the web game
	var online := UiTheme.button("Online", "globe", &"BtnSmall")
	MenuKit.pad_button(online, 0.6 * _em, 2.4 * 0.86 * _em)
	MenuKit.button_text(online, 0.86 * _em, 700, 1.2 * 0.86 * _em)
	online.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	online.disabled = app == null or not app.screens.has("online")
	_dim(online)
	online.pressed.connect(func() -> void:
		app.tap("select")
		app.go("online"))
	small.add_child(online)
	# .btn.primary.big: 1.3em, 750, 3.1em tall
	_fight = UiTheme.button("Fight", "swords", &"BtnPrimary")
	var big := 1.3 * _em
	MenuKit.button_text(_fight, big, 750, 1.2 * big)
	MenuKit.pad_button(_fight, 2.0 * big, 3.1 * big)
	_fight.pressed.connect(fight)
	_right.add_child(_fight)


## The career button's balance chip (.map-btn .career-cash: a coin and the credits).
## .btn:disabled (opacity 0.45): the theme dims a disabled button's face; its text and icon too.
static func _dim(b: Button) -> void:
	if not b.disabled:
		return
	for n in ["Text", "Icon"]:
		var c := b.find_child(n, true, false) as Control
		if c != null:
			c.self_modulate.a = 0.45


func _add_cash(b: Button) -> void:
	var row := b.get_child(0) as HBoxContainer
	var fs := 0.82 * _em
	var chip := MenuKit.pill(MenuKit.box(Color(1.0, 0.824, 0.29, 0.12), 999, [0.55 * fs, 0.15 * fs, 0.55 * fs, 0.15 * fs]), 0.3 * fs)
	var cr := chip.get_node("Row")
	cr.add_child(MenuKit.icon("coin", 1.05 * fs, MenuKit.css("#ffd24a")))
	_cash = MenuKit.label("0", fs, 750, MenuKit.css("#ffe6a0"))
	cr.add_child(_cash)
	var m := MarginContainer.new()
	m.add_theme_constant_override(&"margin_left", int(round(0.3 * _em - 0.0)))
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_child(chip)
	m.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(m)


## The Fight button (app.ts fight): on an animated home scene the robot gets the call first (the
## stage's outro), then a flash of white and the cut to the arena; elsewhere straight in.
## The Fight button, or with `titans` the Titans button (a titan battle).
func fight(titans := false) -> void:
	if leaving:
		return
	var st = app.game.get_place("home") if app.game.place == "home" else null
	if st == null or not st.has_method("outro"):
		app.fight(false, titans)
		return
	app.tap("start")
	leaving = true
	var d: Director = app.game.director
	d.menu_turn = 0.0
	d.menu_live = false
	_vel = 0.0
	_drag = false
	# .screen.home.leaving > *: the screen gets out of the way (0.35s, 0.6em down)
	for r in [_top, _hero_rise, _right_rise]:
		var tw := create_tween()
		tw.tween_property(r, "modulate:a", 0.0, 0.35)
	app.game.home_outro(func() -> void:
		if not leaving:
			return
		_flash_white(func() -> void:
			if not leaving:
				return
			leaving = false
			app.fight(false, titans)))


## .scene-fade.white: up in 0.26s, `then` 0.28s in, and away over 0.75s 0.9s later.
func _flash_white(then: Callable) -> void:
	if _white == null:
		_white = ColorRect.new()
		_white.color = MenuKit.css("#f6f9ff", 0.0)
		_white.set_anchors_preset(Control.PRESET_FULL_RECT)
		_white.mouse_filter = Control.MOUSE_FILTER_IGNORE
		# (on the app's layer, so it stays up across the cut to the fight)
		app.ui.add_child(_white)
	app.ui.move_child(_white, -1)
	# (hidden again once it's clear: it stays on the app's layer, over every fight after)
	_white.visible = true
	var tw := app.create_tween()
	tw.tween_property(_white, "color:a", 1.0, 0.26).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.tween_interval(0.02)
	tw.tween_callback(then)
	tw.tween_interval(0.17)
	tw.tween_property(_white, "color:a", 0.0, 0.75).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_callback(_white.hide)


## Back to normal after the way out (or if it was cut off: app.ts endLeaving).
func _end_leaving() -> void:
	leaving = false
	for r in [_top, _hero_rise, _right_rise]:
		r.modulate.a = 1.0


# ------------------------------------------------------------------ screen

func enter() -> void:
	_end_leaving()
	# (the other screens are made after this one: whether they're there is known only now)
	_garage.disabled = not app.screens.has("garage")
	_career.disabled = not app.screens.has("map")
	_vault.disabled = not app.screens.has("vault")
	_tag.disabled = not app.screens.has("tagteam")
	_sync_vault()
	_sync_scene_btn()
	_sync_sound()
	_sync_notes()
	refresh()
	_layout()
	# heroIn: up 0.8em out of nothing, 0.6s (the actions 0.08s later)
	_hero_rise.play(0.6, 0.0, Vector2(0, 0.8 * _em))
	_right_rise.play(0.6, 0.08, Vector2(0, 0.8 * _em))
	for k in _tiles.size():
		# tileIn: 0.5s from 0.15 + k * 0.04s, up 0.5em from 90%
		_tiles[k].rise.play(0.5, 0.15 + k * 0.04, Vector2(0, 0.5 * _em), 0.9)


func exit() -> void:
	_drag = false
	if leaving:
		_end_leaving()


## refreshHome: the bot card, the record and the career balance.
func refresh() -> void:
	if app == null or app.player == null:
		return
	var p = app.player
	var z: float = float(p.get("size_", 1.0)) if p is Dictionary else 1.0
	var b = TItems.computeBuild(p.loadout, z)
	_power.text = "Power %d" % int(b.rating)
	_name.text = String(p.name_)
	var paint := MenuKit.hex(p.paint.primary)
	var bs := MenuKit.box(paint, 99)
	bs.shadow_color = Color(paint, 0.5)
	bs.shadow_size = 5
	_name_bar.add_theme_stylebox_override(&"panel", bs)
	for c in _meta.get_children():
		c.queue_free()
	for id in [b.fistAbility, b.kickAbility]:
		var mv = TMoves.MOVES[id]
		_meta.add_child(_pill("ab:" + String(id) if Icons.find("ab:" + String(id)) != null else "", String(mv.name_), MenuKit.AMBER))
	for st in b.sets:
		if float(st.active) <= 0.0:
			continue
		var co = st.company
		var name_ := "%s ×%d" % [co.name_, int(st.count)]
		var logo := "co:" + String(co.id)
		_meta.add_child(_pill(logo if Icons.find(logo) != null else "", name_, MenuKit.css(String(co.color)), UiTheme.TEXT))
	if z != 1.0:
		_meta.add_child(_pill("size", "%d%% %s" % [roundi(z * 100.0), size_name(z)], UiTheme.CYAN))
	_pic_wait = 0.0
	for k in _tiles.size():
		var slot: String = TItems.SLOTS[k]
		var eq = p.loadout[slot]
		var item = TItems.ITEM_BY_ID.get(eq.id)
		if item != null:
			_tiles[k].show_part(app.game, slot, item, float(eq.rarity), p.paint)
			if not _tiles[k].has_picture():
				_pic_wait = 0.5
	var r = app.record
	for c in _record.get_children():
		c.queue_free()
	_record.add_child(_stat(r.wins, "Wins"))
	_record.add_child(_stat(r.losses, "Losses"))
	if r.draws > 0.0:
		_record.add_child(_stat(r.draws, "Draws"))
	if r.streak > 1.0:
		_record.add_child(_stat(r.streak, "Streak"))
	_cash.text = TCareer.credits(float(r.career.credits))
	_queue_layout()


## "<b>12</b>Wins" (.home-record).
func _stat(n: float, label: String) -> Control:
	var fs := 0.82 * _em
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.25 * fs)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var b := MenuKit.label(str(int(n)), fs, 750, UiTheme.TEXT)
	var l := MenuKit.label(label, fs, 500, UiTheme.MUTED)
	for x in [b, l]:
		MenuKit.text_shadow(x, 0.7, 1)
		row.add_child(x)
	return row


var _layout_queued := false


func _queue_layout() -> void:
	if not _layout_queued:
		_layout_queued = true
		_layout.call_deferred()


func _layout() -> void:
	_layout_queued = false
	if size.x <= 0.0:
		return
	var side := FightHud.side_margin(self)
	var bottom := FightHud.bottom_margin(self)
	var top := 12.0
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.y > 0 and safe.size.y > 0:
		top = maxf(top, safe.position.y * size.y / float(screen.y))
	# .topbar: left/right on the margins, at the top
	_top.position = Vector2(side, top)
	_top.size = Vector2(size.x - side * 2.0, UiTheme.TAP)
	# .hero: bottom left, min(42vw, 25em) wide
	var hw := minf(size.x * 0.42, 25.0 * _em)
	_hero.custom_minimum_size.x = hw
	_hero_rise.size = Vector2(hw, 0)
	_hero_rise.reset_size()
	_hero_rise.size.x = hw
	_layout_name(hw)
	_hero_rise.reset_size()
	_hero_rise.position = Vector2(side, size.y - bottom - _hero_rise.size.y)
	# .home-actions: bottom right, min(30vw, 15.5em) wide
	var rw := minf(size.x * 0.3, 15.5 * _em)
	_right.custom_minimum_size.x = rw
	_right_rise.reset_size()
	_right_rise.size.x = rw
	_right_rise.position = Vector2(size.x - side - rw, size.y - bottom - _right_rise.size.y)


## The Skins button's dot: a free pull (or the welcome pull) is waiting.
func _sync_vault() -> void:
	_vault_dot.visible = app != null and not _vault.disabled and Gacha.gift_ready(app.skins)


func tick(dt: float) -> void:
	_vault_t -= dt
	if _vault_t <= 0.0:
		_vault_t = 1.0
		_sync_vault()
	# part pictures the garage hasn't rendered yet: look again now and then
	if _pic_wait > 0.0:
		_pic_wait -= dt
		if _pic_wait <= 0.0:
			_retry_pictures()
	_spin_tick(dt)


func _retry_pictures() -> void:
	var p = app.player
	for t in _tiles:
		if not t.has_picture() and t.item != null:
			t.show_part(app.game, t.slot, t.item, t.rarity, p.paint)
			if not t.has_picture():
				_pic_wait = 0.5


# ------------------------------------------------------------------ spinning the bot

## app.ts homeTick: coast after a swipe, then glide back to the slow showcase orbit.
func _spin_tick(dt: float) -> void:
	var d: Director = app.game.director
	if _drag or not d.menu_live or leaving:
		return
	_idle += dt
	_vel *= exp(-3.5 * dt)
	_vel = clampf(_vel, -6.0, 6.0)
	d.menu_turn += _vel * dt
	if _idle < 3.5:
		return
	# the short way home: whole turns don't count
	d.menu_turn -= round(d.menu_turn / TAU) * TAU
	d.menu_turn *= exp(-minf(1.0, (_idle - 3.5) / 1.5) * 1.6 * dt)
	if absf(d.menu_turn) < 0.002 and absf(_vel) < 0.01:
		d.menu_turn = 0.0
		d.menu_live = false


func _unhandled_input(e: InputEvent) -> void:
	if not visible or app == null or app.current != "home":
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			# a tap during the way out to the arena skips to the fight (game.ts homeSkip)
			if leaving:
				app.game.home_skip()
				return
			_drag = true
			_vel = 0.0
			_last_x = mb.position.x
			_last_t = Time.get_ticks_msec()
		elif _drag:
			_drag = false
			if Time.get_ticks_msec() - _last_t > 80:
				_vel = 0.0
			_idle = 0.0
	elif e is InputEventMouseMotion and _drag:
		var mm := e as InputEventMouseMotion
		var now := Time.get_ticks_msec()
		# (the web's 0.012 rad per CSS pixel; the canvas here is the same 720-tall layout)
		var dx := (mm.position.x - _last_x) * 0.012
		var d: Director = app.game.director
		d.menu_turn -= dx
		d.menu_live = true
		var dts := maxf(1.0, now - _last_t) / 1000.0
		_vel = _vel * 0.5 + (-dx / dts) * 0.5
		_last_x = mm.position.x
		_last_t = now
		_idle = 0.0
