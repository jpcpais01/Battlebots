## The garage (src/ui/app.ts buildGarage, refreshGarage, setFocus, renderStats, the garage drag
## and spin, commitPlayer/dropTrial; style.css's garage section): the player's bot on the lift,
## its name and power top left, the diagnostics box bottom left, and the panel on the right with
## the loadout rail (six part slots, then Emotes, Paint and Size), the open tab and the Random,
## Saves and Fight buttons. Dragging across the bot turns it, with a fling's spin; left alone it
## drifts round slowly. Picking a slot flies the camera in on that part.
##
## The part picker is PartsMenu (parts_menu.gd); the Paint, Size and Emotes tabs are in
## garage_tabs.gd; the saved bots and the name dialog in garage_dialogs.gd.
extends AppScreen

const G := preload("res://app/garage/gstyle.gd")
const GridBox := preload("res://app/garage/grid_box.gd")
const PartsMenu := preload("res://app/garage/parts_menu.gd")
const Tabs := preload("res://app/garage/garage_tabs.gd")
const Dialogs := preload("res://app/garage/garage_dialogs.gd")

## Garage camera close-ups: target x, y, z and distance per slot, and the whole-robot view.
const OVERVIEW := [0.0, 1.02, 0.0, 4.7]
const FOCUS := {
	"head": [0.0, 1.7, 0.05, 2.3],
	"fist": [0.0, 1.38, 0.2, 2.5],
	"core": [0.0, 1.36, 0.12, 2.2],
	"chest": [0.0, 1.32, 0.0, 2.8],
	"legs": [0.0, 0.72, 0.0, 3.2],
	"kick": [0.0, 0.38, 0.05, 2.5],
}
## The ✎ after the bot's name (the web's text glyph, drawn here: phones lack it in their face).
const PENCIL := '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3.5 20.5l1.2-5L15.6 4.6a1.6 1.6 0 0 1 2.3 0l1.5 1.5a1.6 1.6 0 0 1 0 2.3L8.5 19.3z" fill="#ffffff"/><path d="M14 6.2l3.8 3.8" stroke="#000000" stroke-opacity=".5" stroke-width="1.2"/></svg>'

## The open slot (whose parts the picker shows).
var slot := "fist"
## Which tab is open: "part" (a slot), "emotes", "paint" or "size".
var tab := "part"
var emote_kind := "win"
## The Paint tab's page: schemes, primary, secondary, accent or finish.
var paint_page := "schemes"
## The slot the camera is looking closely at (null: the whole robot).
var focus = null
var parts: PartsMenu
## The bot on the lift is wearing a part on trial, not the saved loadout.
var trial_shown := false
## The fling: dragging, its spin speed, and how long since the last touch.
var spin := {"dragging": false, "vel": 0.0, "idle": 0.0}
var rng := TMath.Rng.new(float(randi() % 2147483647))
## The open card over the garage (saved bots, the name dialog), or null.
var modal: Control = null

var _last_x := 0.0
var _last_t := 0
var _poll := 0.0
var _prewarm: Array = []
var _quiet := false
## A picture landed since the tiles last looked (PartThumbs.ready_thumb).
var _pics_dirty := false
## Some rail tile is still showing its slot icon for want of a picture.
var _rail_pending := false
var _prewarm_t := 0.0

# the frame (app.ts garageEls)
var _top: HBoxContainer
var _name_text: Label
var _pencil: TextureRect
var _voice: Button
var _power: Label
var _stats_box: PanelContainer
var _stats: VBoxContainer
var _view: Button
var _view_icon: TextureRect
var _view_text: Label
var _panel: PanelContainer
var _rail: VBoxContainer
var _title_b: Label
var _title_span: Label
var _title_rar: Label
## The tabs row under the title (.rarities): paint pages, emote kinds.
var rar: GridBox
## The parts picker's area (.items.parts) and the other tabs' scrolling list (.items.scroll).
var parts_root: VBoxContainer
var list_scroll: ScrollContainer
var list: VBoxContainer
var _actions: HBoxContainer
var _fade_tw: Tween


func _ready() -> void:
	parts = PartsMenu.new(self)
	_build()
	resized.connect(_layout)
	_layout()


# ------------------------------------------------------------------------------ the frame

func _build() -> void:
	# top left: Home, the bot's name (tap to rename) with its voice button, its power
	_top = G.hbox(12)
	add_child(_top)
	_top.add_child(_home_button())
	var id := G.vbox(2.4)
	id.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_top.add_child(id)
	var name_row := G.hbox(8)
	id.add_child(name_row)
	var nb := G.tap_area(0.95)
	nb.name = "Name"
	var nrow := G.hbox(4)
	nb.add_child(nrow)
	_name_text = G.label("", 21.64, 800, UiTheme.TEXT, -0.22)
	_name_text.add_theme_color_override(&"font_shadow_color", Color(0, 0, 0, 0.6))
	_name_text.add_theme_constant_override(&"shadow_offset_x", 0)
	_name_text.add_theme_constant_override(&"shadow_offset_y", 2)
	_name_text.add_theme_constant_override(&"shadow_outline_size", 6)
	nrow.add_child(_name_text)
	var img := Image.new()
	img.load_svg_from_string(PENCIL, 2.0)
	img.generate_mipmaps()
	_pencil = TextureRect.new()
	_pencil.texture = ImageTexture.create_from_image(img)
	_pencil.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_pencil.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_pencil.custom_minimum_size = Vector2(10.7, 10.7)
	_pencil.size_flags_vertical = Control.SIZE_SHRINK_END
	_pencil.modulate = UiTheme.MUTED
	_pencil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pencil.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	nrow.add_child(G.margin(_pencil, 0, 0, 5, 0))
	nb.pressed.connect(rename)
	G.hug(nb, nrow)
	name_row.add_child(nb)
	_voice = _voice_button()
	name_row.add_child(_voice)
	G.shrink(_name_text, name_row, nb)
	var gp := G.hbox(5.2)
	gp.add_child(G.label("Power", 11.54, 700, UiTheme.MUTED, 1.39, true))
	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.add_theme_stylebox_override(&"panel", G.flat(G.AMBER, 9, G.CLEAR, 0, [0.66, 7.3, 0.66, 7.3]))
	_power = G.label("", 13.27, 750, Color("#0a0d14"))
	pill.add_child(_power)
	gp.add_child(pill)
	id.add_child(gp)

	# bottom left: the diagnostics
	_stats_box = PanelContainer.new()
	_stats_box.mouse_filter = Control.MOUSE_FILTER_STOP
	_stats_box.add_theme_stylebox_override(&"panel", G.none([8.75, 10.63, 9.38, 10.63]))
	_stats_box.add_child(G.paint({"radius": 16.0, "fill": G.PANEL, "border": [1.0, UiTheme.LINE], "drop": G.SHADOW}))
	_stats = G.vbox(3.5)
	_stats_box.add_child(_stats)
	add_child(_stats_box)
	_stats_box.minimum_size_changed.connect(_layout)

	# the close-up toggle, beside the panel
	_view = G.tap_area(0.95)
	_view.add_child(G.paint({"radius": 16.0, "fill": UiTheme.ICON_BG, "border": [1.0, UiTheme.LINE]}))
	var vr := G.hbox(5.13)
	_view_icon = G.icon("zoom", 16, UiTheme.TEXT)
	vr.add_child(_view_icon)
	_view_text = G.label("", 12.83, 650)
	vr.add_child(_view_text)
	var vm := G.margin(vr, 0, 12.18, 0, 12.18)
	vm.set_anchors_preset(Control.PRESET_FULL_RECT)
	_view.add_child(vm)
	G.hug(_view, vm, Vector2(-1, 30.8))
	_view.minimum_size_changed.connect(_layout)
	_view.pressed.connect(func() -> void:
		tap()
		set_focus(null if focus != null else slot))
	add_child(_view)

	# the panel: the rail, then the open tab
	_panel = PanelContainer.new()
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.add_theme_stylebox_override(&"panel", G.none([9.6, 9.6, 9.6, 9.6]))
	_panel.add_child(G.paint({"radius": 24.0, "fill": G.PANEL, "border": [1.0, UiTheme.LINE], "drop": G.SHADOW}))
	var grid := G.hbox(9.6)
	_panel.add_child(grid)
	_rail = G.vbox(5.6)
	_rail.custom_minimum_size.x = 70.4
	grid.add_child(_rail)
	var main := G.vbox(7.2)
	main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_child(main)
	var head := G.vbox(5.6)
	main.add_child(head)
	var title := G.hbox(0)
	head.add_child(title)
	_title_b = G.label("", 20.04, 800, UiTheme.TEXT, -0.2)
	title.add_child(_title_b)
	var gap := Control.new()
	gap.custom_minimum_size.x = 9.6
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	title.add_child(gap)
	# (the small line sits on the title's baseline)
	var drop := UiTheme.font(800).get_ascent(20) - UiTheme.font(500).get_ascent(13)
	_title_span = G.label("", 12.83, 500, UiTheme.MUTED)
	var span_m := G.margin(_title_span, drop, 0, 0, 0)
	title.add_child(span_m)
	_title_rar = G.label("", 12.83, 500, UiTheme.MUTED)
	title.add_child(G.margin(_title_rar, drop, 0, 0, 0))
	G.shrink(_title_span, title, span_m)
	rar = GridBox.new(5, 50, Vector2(4.8, 4.8))
	head.add_child(rar)
	parts_root = G.vbox(8)
	parts_root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	main.add_child(parts_root)
	list_scroll = G.vscroll()
	list_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list = G.vbox(6.4)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var lm := G.margin(list, 0, 3.2, 0, 0)
	lm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.add_child(lm)
	main.add_child(list_scroll)
	_actions = G.hbox(8)
	_actions.alignment = BoxContainer.ALIGNMENT_END
	main.add_child(_actions)
	var random := _action("Random", "dice", &"BtnSmall")
	random.pressed.connect(randomize_bot)
	var saves := _action("Saves", "copy", &"BtnSmall")
	saves.pressed.connect(saves_menu)
	var fight := _action("Fight", "swords", &"BtnPrimary")
	fight.pressed.connect(func() -> void: app.fight())
	add_child(_panel)


## A garage action button (.btn.small; Fight is the white one) with its icons.ts glyph.
func _action(text: String, icon_key: String, variant: StringName) -> Button:
	var b := UiTheme.button(text, "", variant)
	b.name = text
	var row := b.get_child(0) as HBoxContainer
	var t := UiTheme.theme()
	var ic := G.icon(icon_key, 16.5, t.get_color(&"font_color", variant))
	row.add_child(ic)
	row.move_child(ic, 0)
	b.custom_minimum_size.x = row.get_combined_minimum_size().x + 30.3
	_actions.add_child(b)
	return b


## .home-btn: a glass pill with a chevron, a house and "Home".
func _home_button() -> Button:
	var b := G.tap_area(1.0)
	b.name = "Home"
	b.tooltip_text = "Back to home"
	b.add_child(G.paint({"radius": 19.0, "fill": UiTheme.ICON_BG, "border": [1.0, UiTheme.LINE]}))
	var row := G.hbox(5.77)
	var chev := G.icon("back", 13, UiTheme.TEXT)
	chev.modulate.a = 0.6
	row.add_child(chev)
	row.add_child(G.icon("home", 16.6, UiTheme.TEXT))
	row.add_child(G.label("Home", 14.43, 650))
	var m := G.margin(row, 0, 15.15, 0, 10.82)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(-1, 37.5))
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	G.press(b, 0.94)
	# the chevron nudges back as it's pressed
	b.button_down.connect(func() -> void: chev.create_tween().tween_property(chev, "position:x", -3.0, 0.18).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT))
	b.button_up.connect(func() -> void: chev.create_tween().tween_property(chev, "position:x", 0.0, 0.18).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT))
	b.pressed.connect(func() -> void:
		tap("back")
		app.go("home"))
	return b


## .voice-btn: the commentators record the bot's name. That needs the game's server (the web's
## nameVoice API), which the app doesn't reach yet, so it shows as the web's disabled button.
func _voice_button() -> Button:
	var b := G.tap_area(1.0)
	b.name = "Voice"
	b.disabled = true
	b.modulate.a = 0.5
	b.add_child(G.paint({"radius": 12.0, "fill": UiTheme.ICON_BG, "border": [1.0, UiTheme.LINE_2]}))
	var row := G.hbox(4.15)
	row.add_child(G.icon("mic", 13.6, UiTheme.TEXT))
	row.add_child(G.label("Voice name", 11.86, 650))
	var m := G.margin(row, 0, 9.49, 0, 9.49)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(-1, 23.7))
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return b


## Place the frame's pieces (style.css: .garage-top, .statbox, .view-btn, .garage-panel), inside
## the 3% side margins.
func _layout() -> void:
	var w := size.x
	var h := size.y
	if w <= 0.0:
		return
	var m := FightHud.side_margin(self)
	var top := 12.0
	var bottom := FightHud.bottom_margin(self)
	var pw := minf(w * 0.58, 704.0)
	_panel.position = Vector2(w - m - pw, top)
	_panel.size = Vector2(pw, h - top - bottom)
	_top.position = Vector2(m, top)
	var top_w := maxf(0.0, w - pw - 2.0 * m - 32.0)
	_top.size = Vector2(top_w, 44)
	var sh := _stats_box.get_combined_minimum_size().y
	_stats_box.size = Vector2(237.6, sh)
	_stats_box.position = Vector2(m, h - bottom - sh)
	var vs := _view.get_combined_minimum_size()
	_view.size = vs
	_view.position = Vector2(w - m - pw - 8.98 - vs.x, h - bottom - vs.y)


# ------------------------------------------------------------------------------ screen

func enter() -> void:
	focus = null
	spin.vel = 0.0
	spin.idle = 0.0
	if not app.changed.is_connected(_on_changed):
		app.changed.connect(_on_changed)
	refresh_garage()
	set_focus(null)
	_layout()
	# .screen.show: fades in, settling from a touch larger
	pivot_offset = size * 0.5
	modulate.a = 0.0
	scale = Vector2(1.012, 1.012)
	if _fade_tw != null:
		_fade_tw.kill()
	_fade_tw = create_tween().set_parallel()
	_fade_tw.tween_property(self, "modulate:a", 1.0, 0.28)
	_fade_tw.tween_property(self, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	# the other slots' pictures, drawn in quiet moments
	_prewarm.clear()
	_pics_dirty = true
	for s in TItems.SLOTS:
		for item in TItems.itemsForSlot(s):
			_prewarm.append([item, item.tier])


func exit() -> void:
	drop_trial(false)
	close_modal()
	spin.dragging = false
	_prewarm.clear()


func refresh() -> void:
	if visible and not _quiet:
		refresh_garage()


func _on_changed() -> void:
	refresh()


func tick(dt: float) -> void:
	_garage_tick(dt)
	# pictures swap in as they land (looked for at most four times a second)
	_poll -= dt
	if _pics_dirty and _poll <= 0.0:
		_poll = 0.25
		_pics_dirty = false
		parts.poll_pictures()
		if _rail_pending:
			_draw_rail()
	# the other slots' pictures, one in each quiet moment (app.ts prewarmThumbs)
	_prewarm_t -= dt
	if not _prewarm.is_empty() and _prewarm_t <= 0.0 and modal == null and _has_thumbs():
		_prewarm_t = 0.06
		var e: Array = _prewarm.pop_front()
		thumb(e[0], e[1])


# ------------------------------------------------------------------------------ the bot

## The player's bot.
func player():
	return app.player


## Save the player and redraw what shows it (app.ts commitPlayer); `rebuild` puts the saved bot
## back on the lift (off: only the name, emotes or walk-on changed).
func commit_player(rebuild := true) -> void:
	Store.save_player(app.player)
	if rebuild:
		parts.clear()
		trial_shown = false
		app.game.show_bot(app.player)
	_quiet = true
	app.changed.emit()
	_quiet = false
	refresh_garage()


## Take any part on trial off the bot (and put the saved bot back on the lift if asked).
func drop_trial(restore := true) -> void:
	parts.clear()
	if trial_shown and restore:
		app.game.show_bot(app.player)
	trial_shown = false


## Put this bot on the lift without saving it (null: back to the saved bot).
func show_trial(spec) -> void:
	trial_shown = spec != null
	app.game.show_bot(spec if spec != null else app.player)


## Fit a part for real and save the bot (app.ts PartsMenu host equip).
func equip(s: String, id: String) -> void:
	app.player.loadout[s] = TItems.equip(TItems.ITEM_BY_ID[id])
	if TCareer.markSeen(app.record.career, [id]):
		Store.save_record(app.record)
	commit_player()
	pulse()


## Redraw the garage round the part picker (its title, rail and diagnostics).
func redraw() -> void:
	refresh_garage()


## Rare and Epic parts are earned in career mode: until then they can be tried on, not fitted
## (unless App.UNLOCK_ALL).
func locked(item) -> bool:
	return not app.owns(item)


func lock_text(item) -> String:
	return app.lock_text(item)


## A light sweeps up the bot (a part was fitted).
func pulse() -> void:
	if app.game.has_method("garage_pulse"):
		app.game.garage_pulse()


## A menu sound (app.ts tap); the player's walk-on theme is read in from the first tap.
func tap(kind := "tap") -> void:
	app.tap(kind)
	app.game.sfx.prime_walk_on(TWalkOns.walkOnFor(app.player))


func preview_move(id: String) -> void:
	if app.game.has_method("preview_move"):
		app.game.preview_move(id)
	elif app.game.showcase != null:
		app.game.showcase.preview_move(id)


func preview_emote(id: String) -> void:
	if app.game.has_method("preview_emote"):
		app.game.preview_emote(id)
	elif app.game.showcase != null:
		app.game.showcase.preview_emote(id, app.game.director.garage_yaw)


## The sparring dummy finishers are shown on (game.ts sparring), when the world has it.
func sparring(on: bool) -> void:
	if app.game.has_method("sparring"):
		app.game.sparring(on)


func _has_thumbs() -> bool:
	return "thumbs" in app.game and app.game.get("thumbs") != null


## Picture of the real part an item fits, at a rarity, in the player's paint (null while it's
## being drawn, or with no picture maker in the world).
func thumb(item, rarity) -> Texture2D:
	if not _has_thumbs():
		return null
	var th = app.game.get("thumbs")
	if not th.has_method("thumb"):
		return null
	if not th.is_connected("ready_thumb", _on_thumb):
		th.connect("ready_thumb", _on_thumb)
	var t = th.thumb(item, int(rarity), app.player.paint, app.player.loadout)
	return t if t is Texture2D else null


## A part's picture landed: tiles waiting on one look again soon.
func _on_thumb(_key: String, _tex: Texture2D) -> void:
	_pics_dirty = true


## Dice: a random bot under the same name, emotes and walk-on, in parts the player has.
func randomize_bot() -> void:
	tap("select")
	var b = TLoadout.randomBot(rng, rng.range_(0.2, 0.8))
	var p: Dictionary = b.duplicate()
	var was = app.player
	p.name_ = was.name_
	for k in ["emotes", "walkOn"]:
		if was.get(k) != null:
			p[k] = was[k]
		else:
			p.erase(k)
	app.player = p
	# (only parts the player has: the rest roll back to Common)
	app.fit_owned(app.player)
	commit_player()
	pulse()


func rename() -> void:
	Dialogs.rename(self)


func saves_menu() -> void:
	Dialogs.saves_menu(self)


# ------------------------------------------------------------------------------ camera

## Camera close-up on one slot's part, or the whole robot (null) (app.ts setFocus).
func set_focus(s) -> void:
	if tab != "part":
		s = null
	focus = s
	var f: Array = FOCUS[s] if s != null else OVERVIEW
	var d: Director = app.game.director
	# a bigger frame puts every part higher and needs the camera further back
	var z := float(_size_of(app.player))
	d.garage_target = Vector3(f[0] * z, f[1] * z, f[2] * z)
	d.garage_dist = f[3] * z
	if tab == "emotes" and emote_kind == "finish":
		sparring(true)
	if s != null:
		_view_icon.texture = G.Icons.tex("expand", 16)
		_view_text.text = "Whole bot"
	else:
		_view_icon.texture = G.Icons.tex("zoom", 16)
		_view_text.text = "Inspect " + TItems.SLOT_LABEL[slot]
	_layout_view()


func _layout_view() -> void:
	if size.x > 0.0:
		_layout()


static func _size_of(p) -> float:
	var s = p.get("size_")
	return 1.0 if s == null else float(s)


# ------------------------------------------------------------------------------ drawing

## Redraw the garage from the player's bot (app.ts refreshGarage).
func refresh_garage() -> void:
	if app == null:
		return
	_refresh()
	# a finger on a card or tile still scrolls the list it's in
	G.touch_scroll(list_scroll)
	G.touch_scroll(parts_root)


func _refresh() -> void:
	var p = app.player
	# the sparring dummy only stands in while finishers are on show
	if not (tab == "emotes" and emote_kind == "finish"):
		sparring(false)
	# a part on trial belongs to the part tab it was picked in
	if tab != "part":
		drop_trial()
	var build = TItems.computeBuild(p.loadout)
	_name_text.text = p.name_
	G.refit.call_deferred(_name_text)
	_power.text = JS.s(build.rating)
	if app.game.has_method("garage_bot"):
		app.game.garage_bot(p.name_, build.rating, p.paint)
	render_stats()
	_draw_rail()
	_view.visible = tab == "part"
	parts_root.visible = tab == "part"
	list_scroll.visible = tab != "part"
	match tab:
		"emotes":
			Tabs.render_emotes(self)
			return
		"paint":
			Tabs.render_paint(self)
			return
		"size":
			Tabs.render_size(self)
			return
	# a part is made at one rarity: nothing to pick, the maker tabs show every tier
	rar.visible = false
	var cur = TItems.ITEM_BY_ID[p.loadout[slot].id]
	var rr = TItems.RARITIES[cur.tier]
	set_title(TItems.SLOT_LABEL[slot], "Fitted: %s · " % cur.name_ if TItems.MAX_RARITY != 0.0 else "Fitted: %s" % cur.name_, rr.name_ if TItems.MAX_RARITY != 0.0 else "", G.c(rr.color))
	set_focus(slot if focus != null else null)
	parts.render(parts_root, slot)


## The tab's title: its name, then a quieter line (and a coloured word after it).
func set_title(b: String, span: String, tail := "", tail_col := UiTheme.MUTED) -> void:
	_title_b.text = b
	_title_span.text = span
	_title_rar.text = tail
	_title_rar.get_parent().visible = tail != ""
	G.set_color(_title_rar, tail_col)
	G.refit.call_deferred(_title_span)


## The loadout rail: each slot shows the part it has fitted, then the Emotes, Paint and Size tabs.
func _draw_rail() -> void:
	var p = app.player
	G.clear(_rail)
	_rail_pending = false
	for s: String in TItems.SLOTS:
		var eq = p.loadout[s]
		var item = TItems.ITEM_BY_ID[eq.id]
		var on := s == slot and tab == "part"
		var pic := thumb(item, eq.rarity)
		if pic == null and _has_thumbs():
			_rail_pending = true
		var t := _rail_tile(on, G.c(TItems.partTint(item)), "slot_" + s, TItems.SLOT_LABEL[s], false, pic)
		t.name = s
		t.pressed.connect(func() -> void:
			tap()
			if s == slot and tab == "part":
				set_focus(null if focus != null else s)
			else:
				drop_trial()
				slot = s
				tab = "part"
				set_focus(s)
				refresh_garage())
	var e = p.get("emotes")
	var picked := 0
	if e != null:
		for k in ["win", "taunt", "finish", "entrance"]:
			var l = e.get(k)
			if l != null:
				picked += (l as Array).size()
	if p.get("walkOn") != null:
		picked += 1
	_tab_tile("emotes", "star", "Emotes", G.c("#ffc23d") if picked > 0 else G.c("#5d6880"))
	_tab_tile("paint", "paint", "Paint", G.c(p.paint.accent))
	_tab_tile("size", "size", "Size", G.c("#5d6880") if _size_of(p) == 1.0 else G.CYAN)


func _tab_tile(t: String, icon_key: String, label: String, rc: Color) -> void:
	var b := _rail_tile(tab == t, rc, icon_key, label, true, null)
	b.name = t
	b.pressed.connect(func() -> void:
		if tab == t:
			return
		tap()
		tab = t
		list_scroll.scroll_vertical = 0
		refresh_garage())


## .slot: a rail tile, glowing in its colour (--rc), with the part's picture or an icon, its
## label and a coloured underline.
func _rail_tile(on: bool, rc: Color, icon_key: String, label: String, tinted: bool, pic: Texture2D) -> Button:
	var b := G.tap_area(1.0)
	b.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var face := {
		"radius": 11.0,
		"fill": Color(1, 1, 1, 0.06) if on else Color(1, 1, 1, 0.025),
		"border": [1.0, G.fade(G.mix(rc, 0.875, Color.WHITE), 0.8) if on else Color(1, 1, 1, 0.06)],
		"b": G.rad(Vector2(0.5, 0.45), [[G.fade(rc, 0.3 if on else 0.16), 0.0], [G.fade(rc, 0.0), 0.75 if on else 0.7]]),
	}
	if on:
		face.glow = [14.0, G.fade(rc, 0.3)]
	b.add_child(G.paint(face))
	var v := G.vbox(0)
	var col := Color.WHITE if on else UiTheme.MUTED
	if pic != null:
		var img := TextureRect.new()
		img.texture = pic
		img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		img.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		img.size_flags_vertical = Control.SIZE_EXPAND_FILL
		img.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(img)
	else:
		var ic := G.icon(icon_key, 17.9, (Color.WHITE if on else rc) if tinted else col)
		ic.size_flags_vertical = Control.SIZE_EXPAND_FILL
		v.add_child(ic)
	var l := G.label(label, 9.94, 500, col, 0.8, true)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	var m := G.margin(v, 1.5, 1, 6.46, 1)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	# ::after: the colour line under the label
	var line := ColorRect.new()
	line.color = rc
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(line)
	b.resized.connect(func() -> void:
		line.position = Vector2(b.size.x * 0.3, b.size.y - 2.98 - 2.0)
		line.size = Vector2(b.size.x * 0.4, 2))
	_rail.add_child(b)
	return b


## A tab button in the row under the title (.rar): `rc` its colour, lit when `on`; `dot` a colour
## swatch before the label (paint pages), `count` a quieter count after it (emote kinds).
func rar_button(label: String, on: bool, rc: Color, dot = null, count := "") -> Button:
	var b := G.tap_area(0.95)
	var face := {"radius": 8.0, "fill": rc if on else G.fade(rc, 0.07), "border": [1.0, rc if on else G.fade(rc, 0.4)]}
	if on:
		face.glow = [12.0, G.fade(rc, 0.45)]
	b.add_child(G.paint(face))
	var row := G.hbox(0)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	var col := Color("#0b0f1a") if on else rc
	if dot != null:
		var sw := G.GPaint.new({"radius": 4.2, "fill": dot, "ring": [1.0, Color(1, 1, 1, 0.4)]})
		sw.custom_minimum_size = Vector2(8.4, 8.4)
		sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(sw)
		var gap := Control.new()
		gap.custom_minimum_size.x = 3.9
		row.add_child(gap)
	row.add_child(G.label(label, 11.22, 800 if on else 500, col, 0.67, true))
	if count != "":
		var c := G.label(count, 9.54, 800 if on else 500, col, 0.67, true)
		c.modulate.a = 0.75
		row.add_child(G.margin(c, 1, 0, 0, 2.9))
	var m := G.margin(row, 3.6, 0, 3.6, 0)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(0, 23.2))
	rar.add_child(b)
	return b


## The diagnostics box; while a part is on trial it shows what fitting it would add or take away
## (app.ts renderStats).
func render_stats() -> void:
	var trial = parts.trial_loadout() if tab == "part" else null
	var size_ := _size_of(app.player)
	var now := _stat_rows(app.player.loadout, size_)
	var next := _stat_rows(trial, size_) if trial != null else now
	var b = TItems.computeBuild(trial if trial != null else app.player.loadout, size_)
	G.clear(_stats)
	var sh := G.hbox(7.5)
	var left := G.label("On trial" if trial != null else "Diagnostics", 10.63, 700, G.AMBER if trial != null else UiTheme.TEXT_2, 1.49, true)
	sh.add_child(left)
	var moves := G.trim(G.label("%s · %s" % [TMoves.MOVES[b.fistAbility].name_, TMoves.MOVES[b.kickAbility].name_], 9.14, 600, UiTheme.MUTED))
	moves.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	sh.add_child(moves)
	_stats.add_child(G.margin(sh, 0, 0, 2.1, 0))
	var grid := GridContainer.new()
	grid.columns = 3
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.add_theme_constant_override(&"h_separation", 9)
	grid.add_theme_constant_override(&"v_separation", 3)
	_stats.add_child(grid)
	for i in next.size():
		var row: Array = next[i]
		var k: float = row[1]
		var k0: float = now[i][1]
		var d := "" if absf(k - k0) < 0.005 else ("up" if k > k0 else "down")
		grid.add_child(G.label(row[0], 12.5, 600, UiTheme.MUTED))
		grid.add_child(_bar(k, k0, d))
		var val := G.label(row[2], 12.5, 700, G.GREEN if d == "up" else G.PINK if d == "down" else UiTheme.TEXT)
		val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		val.custom_minimum_size.x = 32.5
		grid.add_child(val)
	# makers fitted: each logo with its count; a working set spells out its bonus
	var sets := HFlowContainer.new()
	sets.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sets.add_theme_constant_override(&"h_separation", 3)
	sets.add_theme_constant_override(&"v_separation", 3)
	for st in b.sets:
		sets.add_child(_set_chip(st))
	if sets.get_child_count() > 0:
		_stats.add_child(G.margin(sets, 0.6, 0, 0, 0))
	if is_inside_tree():
		_layout()


## [label, bar fill (0..1, more is better), readout] for the six diagnostics lines.
static func _stat_rows(lo, size_: float) -> Array:
	var s = TItems.computeBuild(lo, size_).stats
	var strike: float = (s.punchPower + s.kickPower) / 2.0
	var feet: float = (s.moveSpeed / 2.1) * s.agility
	var rows := [
		["Health", (s.maxHp - 1100.0) / 800.0, JS.s(_round(s.maxHp))],
		["Strike", (strike - 0.85) / 0.9, JS.s(_round(strike * 100.0))],
		["Speed", (s.punchSpeed - 0.9) / 0.6, JS.s(_round(s.punchSpeed * 100.0))],
		["Defense", (s.armor + s.headGuard * 0.5) / 0.35, JS.s(_round(s.armor * 100.0)) + "%"],
		["Footwork", (feet - 0.9) / 0.8, JS.s(_round(feet * 100.0))],
		["Reflexes", (0.15 / s.reaction - 0.9) / 0.9, JS.s(_round(s.reaction * 1000.0)) + "ms"],
	]
	for r in rows:
		r[1] = maxf(0.04, minf(1.0, r[1]))
	return rows


## Math.round
static func _round(v: float) -> float:
	return floorf(v + 0.5)


## .bar: the bar as fitted, with what the trial adds (green) or takes away (outlined).
func _bar(k: float, k0: float, d: String) -> Control:
	var bar := Control.new()
	bar.custom_minimum_size = Vector2(0, 4.5)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.clip_contents = true
	var track := G.paint({"radius": 9.0, "fill": Color(1, 1, 1, 0.09)})
	bar.add_child(track)
	var fill := G.GPaint.new({"radius": 9.0, "fill": G.CLEAR, "a": G.lin(90, [[Color(1, 1, 1, 0.55), 0.0], [Color.WHITE, 1.0]])})
	bar.add_child(fill)
	var diff: Control = null
	if d == "up":
		diff = G.GPaint.new({"radius": 9.0, "fill": G.GREEN, "glow": [8.0, Color(62 / 255.0, 224 / 255.0, 143 / 255.0, 0.6)]})
	elif d == "down":
		diff = G.GPaint.new({"radius": 9.0, "fill": G.CLEAR, "border": [1.0, Color("#ff6b80")]})
	if diff != null:
		bar.add_child(diff)
	var lo := minf(k, k0) if d != "" else k
	bar.resized.connect(func() -> void:
		fill.position = Vector2.ZERO
		fill.size = Vector2(bar.size.x * lo, bar.size.y)
		if diff != null:
			diff.position = Vector2(bar.size.x * lo, 0)
			diff.size = Vector2(bar.size.x * absf(k - k0), bar.size.y))
	return bar


## .statbox .set: a maker's logo and how many of its parts are fitted; a working set (.on) takes
## the whole line and spells out its bonus.
func _set_chip(st) -> Control:
	var co = st.company
	var mc := G.c(co.color)
	var on: bool = st.active > 0.0
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_theme_stylebox_override(&"panel", G.none([1.25, 5.63, 1.25, 3.13]))
	var face := {"radius": 7.0, "fill": Color(1, 1, 1, 0.04), "border": [1.0, Color(1, 1, 1, 0.07)]}
	if on:
		face = {"radius": 7.0, "fill": G.CLEAR, "border": [1.0, G.fade(mc, 0.45)], "a": G.lin(90, [[G.fade(mc, 0.18), 0.0], [G.fade(mc, 0.0), 1.0]])}
		# flex: 1 1 100%: a working set takes its own line
		chip.custom_minimum_size.x = 237.6 - 2.0 * 10.63
	chip.add_child(G.paint(face))
	var row := G.hbox(3.75)
	row.add_child(PartsMenu._logo(co, 16.3, mc))
	row.add_child(G.label(JS.s(st.count), 12.5, 750, mc))
	if on:
		var next = null
		var live := []
		for x in co.sets:
			if st.count < x.at and next == null:
				next = x
			if st.count >= x.at:
				live.append(x.text)
		var stalled: bool = co.get("needsFull") == true and st.count < TItems.SLOTS.size()
		var hint := ""
		if stalled:
			hint = "Stalled: fit all six %s parts to start the engine" % co.short
		elif not live.is_empty():
			hint = " · ".join(live)
		elif next != null:
			hint = "%s more for %s" % [JS.s(next.at - st.count), next.text]
		row.add_child(G.trim(G.label(hint, 12.5, 500, Color("#dfe7f5"))))
	chip.add_child(row)
	chip.tooltip_text = co.name_
	return chip


# ------------------------------------------------------------------------------ the drag

## Drag or swipe sideways to turn the robot (it keeps spinning a little when let go)
## (app.ts setupGarageDrag). Only drags that start on the 3D view: the panels take their own.
func _unhandled_input(e: InputEvent) -> void:
	if not visible or app == null or app.current != "garage":
		return
	if modal != null:
		if e.is_action_pressed("ui_cancel"):
			close_modal()
			get_viewport().set_input_as_handled()
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			spin.dragging = true
			spin.vel = 0.0
			_last_x = mb.position.x
			_last_t = Time.get_ticks_usec()
		elif spin.dragging:
			spin.dragging = false
			if Time.get_ticks_usec() - _last_t > 80000:
				spin.vel = 0.0
			spin.idle = 0.0
		return
	if e is InputEventMouseMotion and spin.dragging:
		var mm := e as InputEventMouseMotion
		var now := Time.get_ticks_usec()
		var d := (mm.position.x - _last_x) * 0.012
		app.game.director.garage_yaw -= d
		var dt := maxf(1.0, (now - _last_t) / 1000.0) / 1000.0
		spin.vel = spin.vel * 0.5 + (-d / dt) * 0.5
		_last_x = mm.position.x
		_last_t = now
		spin.idle = 0.0
		return
	# a keyboard or pad browses the part picker like the web's arrows and Enter
	if tab == "part" and e is InputEventKey and e.is_pressed() and not e.is_echo():
		for a in ["ui_left", "ui_right", "ui_up", "ui_down", "ui_accept"]:
			if e.is_action(a) and parts.key(slot, a):
				get_viewport().set_input_as_handled()
				return


## Fling spin with inertia: the turn to apply this frame (app.ts flingStep).
func _fling_step(dt: float) -> float:
	spin.idle += dt
	spin.vel *= exp(-3.5 * dt)
	if absf(spin.vel) > 6.0:
		spin.vel = signf(spin.vel) * 6.0
	return spin.vel * dt


## app.ts garageTick: the fling, then a slow showroom drift once nobody has touched it a while.
func _garage_tick(dt: float) -> void:
	if spin.dragging:
		return
	var turn := _fling_step(dt)
	var drift := minf(1.0, (spin.idle - 5.0) / 3.0) * 0.06 if spin.idle > 5.0 else 0.0
	app.game.director.garage_yaw += turn + drift * dt


# ------------------------------------------------------------------------------ cards

## A card over the dimmed garage (app.ts openModal: .modal, .box): `fill(box)` fills its VBox;
## `width` its width; a tap on the dimmed garage closes it when `backdrop` is set.
func open_modal(title: String, fill: Callable, width: float, backdrop := false, on_close := Callable()) -> VBoxContainer:
	close_modal()
	var m := Control.new()
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_STOP
	m.set_meta("on_close", on_close)
	var dim := ColorRect.new()
	dim.color = Color(3 / 255.0, 5 / 255.0, 9 / 255.0, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	if backdrop:
		dim.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed:
				close_modal())
	m.add_child(dim)
	var card := PanelContainer.new()
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.add_theme_stylebox_override(&"panel", G.none([18.4, 20, 19.2, 20]))
	card.add_child(G.paint({"radius": 24.0, "fill": UiTheme.PANEL_2, "border": [1.0, UiTheme.LINE], "drop": [80.0, Color(0, 0, 0, 0.6), Vector2(0, 30)]}))
	var v := G.vbox(8.8)
	card.add_child(v)
	if title != "":
		var h2 := G.label(title, 20.8, 800, UiTheme.TEXT, -0.2)
		v.add_child(G.margin(h2, 0, 0, 4, 0))
	m.add_child(card)
	add_child(m)
	modal = m
	fill.call(v)
	card.custom_minimum_size.x = minf(width, size.x - 2.0 * FightHud.side_margin(self))
	# (the card rises into place; it re-centres if what's in it changes size meanwhile)
	var lift := [12.8]
	var place := func() -> void:
		if not is_instance_valid(card):
			return
		card.reset_size()
		card.size.x = card.custom_minimum_size.x
		card.size.y = minf(card.get_combined_minimum_size().y, size.y - 24.0)
		card.position = ((size - card.size) * 0.5).round() + Vector2(0, lift[0])
		card.pivot_offset = card.size * 0.5
	place.call()
	card.minimum_size_changed.connect(place)
	# .modal fadeIn 0.2s; .box boxIn 0.35s: up from 0.8em lower, from 97%
	m.modulate.a = 0.0
	var tw := m.create_tween().set_parallel()
	tw.tween_property(m, "modulate:a", 1.0, 0.2)
	card.scale = Vector2(0.97, 0.97)
	tw.tween_property(card, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(v: float) -> void:
		lift[0] = v
		place.call(), 12.8, 0.0, 0.35).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)
	return v


func close_modal() -> void:
	if modal == null:
		return
	var m := modal
	modal = null
	var cb: Callable = m.get_meta("on_close")
	if cb.is_valid():
		cb.call()
	m.queue_free()
