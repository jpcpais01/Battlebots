## The Skin Vault: where skins are won. The vault is its own place, a neon-lit bank vault
## (render/vault/vault_stage.gd): the player's bot on a glowing turntable on the right (drag to turn
## round it) in front of the vault's great round door; the panel on the left has two tabs.
##   Vault: today's featured Epic turning in its halo, the rates, how close the Epic pity is (the
##   vault's combination dial, a lamp lit for every pull since the last Epic: tap it for the free
##   pull when one's waiting), the free pull (or when it's back), and the pulls (one, or ten with
##   a Rare or better in them, a tenth off), paid in career credits, a glint running over them now
##   and then. The first visit has a free 10-pull waiting.
##   Collection: every skin as a card (the ones not owned yet veiled), by rarity. Tapping one
##   paints it onto the bot with a sweep of light: one owned goes on for good, one not owned is
##   only tried on, with the shards it costs.
## Credits and shards sit top right. Pulls play out in the vault (VaultStage.play), with PullShow's
## words and buttons over them.
class_name VaultScreen
extends AppScreen

const EM := 16.0
const TABS := [["vault", "Vault"], ["collection", "Collection"]]
const FILTERS := [[-1, "All"], [0, "Common"], [1, "Rare"], [2, "Epic"]]

var tab := "vault"
var filter := -1
var sound := GachaSound.new()
var show: PullShow = null
## The skin the collection has picked (null: the plain paint) and whether it's only tried on.
var picked = null
var trial := false

var _top: HBoxContainer
var _wallet: HBoxContainer
var _coins: Label
var _shards: Label
var _panel: PanelContainer
var _tabs: HBoxContainer
var _body: VBoxContainer
var _feat_orb: SkinOrb
var _feat_name: Label
var _feat_blurb: Label
var _feat_clock: Label
var _free_btn: Button
var _free_l: Label
var _one: Button
var _ten: Button
var _grid: GridContainer
var _grid_scroll: ScrollContainer
var _strip: PanelContainer
var _strip_name: Label
var _strip_info: Label
var _strip_btn: Button
var _wearing: Button
var _toast: Label
## The pity dial on the vault tab: its face, the pulls left in its middle, the words beside it,
## its turn (and a spin when it's tapped), and its lamps easing to how many are lit.
var _dial: Button
var _dial_mat: ShaderMaterial
var _dial_n: Label
var _dial_big: Label
var _dial_sub: Label
var _dial_turn := 0.0
var _dial_kick := 0.0
var _dial_fill := -1.0
var _clock_t := 0.0
var _spin := {"dragging": false, "vel": 0.0, "idle": 0.0, "x": 0.0, "t": 0}
var _fade_tw: Tween


func _ready() -> void:
	add_child(sound)
	_build()
	resized.connect(_layout)
	_layout()


func g() -> Dictionary:
	return app.skins


# ------------------------------------------------------------------------------ the frame

func _build() -> void:
	_top = HBoxContainer.new()
	_top.add_theme_constant_override(&"separation", 14)
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var home := MenuKit.edge_pill("home", "Home", EM)
	home.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	_top.add_child(home)
	var title := MenuKit.grad_label("SKIN VAULT", 1.55 * EM, MenuKit.broadcast(400), Color(1.0, 0.9, 0.62), Color(1.0, 0.55, 0.2))
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	MenuKit.text_shadow(title, 0.4)
	_top.add_child(title)
	# the wallet: career credits and shards
	_wallet = HBoxContainer.new()
	_wallet.add_theme_constant_override(&"separation", 8)
	_wallet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_wallet)
	var cp := _chip()
	cp.get_node("Row").add_child(CareerKit.icon(CareerIcons.ICON.coin, EM * 1.1, CareerKit.GOLD))
	_coins = MenuKit.label("0", 0.95 * EM, 750)
	cp.get_node("Row").add_child(_coins)
	cp.tooltip_text = "Credits: every fight pays, and daily contracts and level ups pay more"
	_wallet.add_child(cp)
	var sp := _chip()
	sp.get_node("Row").add_child(MenuKit.icon("star", EM * 1.05, Skins.RARITY_COL[1]))
	_shards = MenuKit.label("0", 0.95 * EM, 750)
	sp.get_node("Row").add_child(_shards)
	sp.tooltip_text = "Shards: from duplicate skins. Spend them in the Collection"
	_wallet.add_child(sp)
	# the panel on the left
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override(&"panel", MenuKit.box(Color(0.035, 0.043, 0.066, 0.86), 22, [16, 14, 16, 14], UiTheme.LINE, 1))
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", 12)
	_panel.add_child(v)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override(&"separation", 6)
	v.add_child(_tabs)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override(&"separation", 12)
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	v.add_child(_body)
	# bottom right: what the bot wears now (tap: the collection)
	_wearing = MenuKit.edge_pill("paint", "Plain paint", EM)
	_wearing.pressed.connect(func() -> void:
		app.tap("select")
		set_tab("collection"))
	add_child(_wearing)
	_toast = MenuKit.label("", EM, 700)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.modulate.a = 0.0
	_toast.visible = false
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	MenuKit.text_shadow(_toast, 0.8)
	add_child(_toast)


func _chip() -> PanelContainer:
	var p := MenuKit.pill(MenuKit.box(MenuKit.PILL_BG, 999, [12, 6, 14, 6], UiTheme.LINE, 1), 6)
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	return p


func _layout() -> void:
	var w := size.x
	var h := size.y
	if w <= 0.0:
		return
	var m := FightHud.side_margin(self)
	var top := 12.0
	var bottom := FightHud.bottom_margin(self)
	_top.position = Vector2(m, top)
	_top.size = Vector2(w * 0.5, 44)
	var ws := _wallet.get_combined_minimum_size()
	_wallet.size = ws
	_wallet.position = Vector2(w - m - ws.x, top + (44 - ws.y) * 0.5)
	var pw := minf(w * 0.47, 600.0)
	_panel.position = Vector2(m, top + 54)
	_panel.size = Vector2(pw, h - top - 54 - bottom)
	var ps := _wearing.get_combined_minimum_size()
	_wearing.size = ps
	_wearing.position = Vector2(w - m - ps.x, h - bottom - ps.y)
	# the toast over the bot, between the panel and the right margin
	var tx := m + pw + 12.0
	_toast.size = Vector2(w - m - tx, 30)
	_toast.position = Vector2(tx, h * 0.82)


# ------------------------------------------------------------------------------ screen

func enter() -> void:
	tab = "vault" if tab == "" else tab
	picked = null
	trial = false
	_spin.vel = 0.0
	_spin.idle = 0.0
	refresh()
	_layout()
	pivot_offset = size * 0.5
	modulate.a = 0.0
	if show != null:
		return
	if _fade_tw != null:
		_fade_tw.kill()
	_fade_tw = create_tween()
	_fade_tw.tween_property(self, "modulate:a", 1.0, 0.28)


func exit() -> void:
	_drop_trial()
	_close_show()


func refresh() -> void:
	if app == null or not is_inside_tree():
		return
	_coins.text = TCareer.credits(app.record.career.credits)
	_shards.text = str(int(g().shards))
	var worn = Skins.of(app.player)
	MenuKit.set_edge_pill(_wearing, "paint", "Wearing " + (worn.name if worn != null else "plain paint"))
	_draw_tabs()
	_draw_body()
	_layout.call_deferred()


func _draw_tabs() -> void:
	for c in _tabs.get_children():
		c.queue_free()
	for t in TABS:
		var label: String = t[1]
		if t[0] == "collection":
			label += "  %d/%d" % [g().owned.size(), Skins.LIST.size()]
		var b := Button.new()
		b.text = label
		b.theme_type_variation = &"SegOn" if tab == t[0] else &"SegBtn"
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size.y = 40
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var id: String = t[0]
		b.pressed.connect(func() -> void:
			if tab != id:
				app.tap("select")
				set_tab(id))
		_tabs.add_child(b)


func set_tab(t: String) -> void:
	tab = t
	if t != "collection":
		_drop_trial()
	refresh()


func _draw_body() -> void:
	for c in _body.get_children():
		_body.remove_child(c)
		c.queue_free()
	_grid = null
	_strip = null
	if tab == "vault":
		_draw_vault()
	else:
		_draw_collection()


# ------------------------------------------------------------------------------ the vault tab

func _draw_vault() -> void:
	var gs := g()
	# today's featured Epic
	var f = Gacha.featured()
	var fc: Color = Skins.swatch(f)
	var card := CareerBox.new(18).linear(100.0, Color(fc, 0.26), Color(0.04, 0.05, 0.08, 0.6), 0.0, 1.0)
	card.pad = Vector4(10, 10, 16, 10)
	_body.add_child(card)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 14)
	card.add_child(row)
	_feat_orb = SkinOrb.new(f, 132)
	_feat_orb.set_spin(0.07)
	_feat_orb.set_halo(0.8)
	row.add_child(_feat_orb)
	var col := VBoxContainer.new()
	col.add_theme_constant_override(&"separation", 2)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)
	var k := MenuKit.label("FEATURED EPIC", 0.68 * EM, 800, Skins.RARITY_COL[2], 2)
	col.add_child(k)
	_feat_name = MenuKit.label(f.name, 1.6 * EM, 400)
	_feat_name.add_theme_font_override(&"font", MenuKit.broadcast(400))
	MenuKit.text_shadow(_feat_name, 0.5)
	col.add_child(_feat_name)
	_feat_blurb = MenuKit.label(f.blurb, 0.82 * EM, 500, UiTheme.TEXT_2)
	_feat_blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_feat_blurb.custom_minimum_size.x = 120
	col.add_child(_feat_blurb)
	_feat_clock = MenuKit.label("", 0.74 * EM, 600, UiTheme.MUTED)
	col.add_child(_feat_clock)
	var own := MenuKit.label("Owned" if Gacha.owns(gs, f.id) else "Half of all Epics pulled today are this one", 0.74 * EM, 650, UiTheme.GREEN if Gacha.owns(gs, f.id) else UiTheme.TEXT_2)
	own.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	own.custom_minimum_size.x = 120
	col.add_child(own)
	# the rates, and the details behind them
	var rates := HBoxContainer.new()
	rates.add_theme_constant_override(&"separation", 6)
	_body.add_child(rates)
	for r in [2, 1, 0]:
		var chip := MenuKit.pill(MenuKit.box(Color(Skins.RARITY_COL[r], 0.12), 999, [10, 4, 12, 4], Color(Skins.RARITY_COL[r], 0.45), 1), 5)
		var dot := Panel.new()
		dot.custom_minimum_size = Vector2(8, 8)
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		dot.add_theme_stylebox_override(&"panel", MenuKit.box(Skins.RARITY_COL[r], 99))
		chip.get_node("Row").add_child(dot)
		chip.get_node("Row").add_child(MenuKit.label("%s %d%%" % [Skins.RARITY_NAME[r], int(round(Gacha.RATES[r] * 100.0))], 0.78 * EM, 700))
		rates.add_child(chip)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rates.add_child(gap)
	var info := UiTheme.button("Details", "", &"BtnSmall")
	MenuKit.pad_button(info, 14, 34)
	info.pressed.connect(_details)
	rates.add_child(info)
	# the pity: the vault's combination dial, a lamp for every pull since the last Epic, the pulls
	# left in its middle (tap it: the free pull if one's waiting, or just a spin)
	var prow := HBoxContainer.new()
	prow.add_theme_constant_override(&"separation", 16)
	prow.size_flags_vertical = Control.SIZE_EXPAND_FILL
	prow.custom_minimum_size.y = 92
	_body.add_child(prow)
	_dial = Button.new()
	_dial.flat = true
	_dial.focus_mode = Control.FOCUS_NONE
	for st in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus"]:
		_dial.add_theme_stylebox_override(st, StyleBoxEmpty.new())
	_dial.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_dial_mat = ShaderMaterial.new()
	_dial_mat.shader = preload("res://app/gacha/pity_dial.gdshader")
	_dial_mat.set_shader_parameter("lamps", float(Gacha.HARD_PITY))
	_dial_mat.set_shader_parameter("soft", float(Gacha.SOFT_PITY) / float(Gacha.HARD_PITY))
	var face := ColorRect.new()
	face.material = _dial_mat
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dial.add_child(face)
	var mid := VBoxContainer.new()
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	mid.add_theme_constant_override(&"separation", -4)
	mid.set_anchors_preset(Control.PRESET_FULL_RECT)
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dial.add_child(mid)
	_dial_n = MenuKit.label("", 1.6 * EM, 400)
	_dial_n.add_theme_font_override(&"font", MenuKit.broadcast(400))
	_dial_n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.add_child(_dial_n)
	var left_l := MenuKit.label("LEFT", 0.55 * EM, 800, UiTheme.MUTED, 1)
	left_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.add_child(left_l)
	_dial.pressed.connect(func() -> void:
		if Gacha.gift_ready(g()):
			_free_pull()
		else:
			app.tap("tap")
			sound.play("crank", 0.35, 1.6)
			_dial_kick = 1.0)
	prow.add_child(_dial)
	prow.resized.connect(func() -> void:
		var d := clampf(prow.size.y, 80.0, 132.0)
		_dial.custom_minimum_size = Vector2(d, d))
	var words := VBoxContainer.new()
	words.alignment = BoxContainer.ALIGNMENT_CENTER
	words.add_theme_constant_override(&"separation", 2)
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	prow.add_child(words)
	words.add_child(MenuKit.label("EPIC GUARANTEE", 0.68 * EM, 800, Skins.RARITY_COL[2], 2))
	_dial_big = MenuKit.label("", 1.35 * EM, 400)
	_dial_big.add_theme_font_override(&"font", MenuKit.broadcast(400))
	MenuKit.text_shadow(_dial_big, 0.5)
	words.add_child(_dial_big)
	_dial_sub = MenuKit.label("", 0.78 * EM, 600, UiTheme.TEXT_2)
	_dial_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dial_sub.custom_minimum_size.x = 120
	words.add_child(_dial_sub)
	# the free pull (or the welcome gift), then the paid pulls
	_free_btn = UiTheme.button("", "star", &"BtnPrimary")
	MenuKit.pad_button(_free_btn, 18, 50)
	_free_btn.pressed.connect(_free_pull)
	_sheen(_free_btn, 999.0, 4.2, 0.5, 0.45)
	_body.add_child(_free_btn)
	_free_l = MenuKit.label("", 0.8 * EM, 600, UiTheme.MUTED)
	_free_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(_free_l)
	var pulls := HBoxContainer.new()
	pulls.add_theme_constant_override(&"separation", 10)
	_body.add_child(pulls)
	_one = _pull_button("Pull", 1, Gacha.PULL_COST, "")
	_one.pressed.connect(func() -> void: pull(1))
	pulls.add_child(_one)
	_ten = _pull_button("Pull ×10", 10, Gacha.TEN_COST, "Rare or better inside")
	_ten.pressed.connect(func() -> void: pull(10))
	pulls.add_child(_ten)
	_sheen(card, 18.0, 5.5, 0.2, 0.22)
	_tick_clocks()


## A pull button: its name, the price in credits, and a line under it.
func _pull_button(text: String, n: int, cost: int, sub: String) -> Button:
	var b := MenuKit.bare_button(0.96)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size.y = 74
	var ten := n == 10
	var face := CareerBox.new(18).linear(180.0, Color(1.0, 0.62, 0.2, 0.95) if ten else Color(0.16, 0.19, 0.26, 0.95), Color(0.9, 0.36, 0.1, 0.95) if ten else Color(0.09, 0.11, 0.16, 0.95))
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(face)
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override(&"separation", 1)
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(v)
	var t := MenuKit.label(text, 1.2 * EM, 400, UiTheme.INK if ten else UiTheme.TEXT)
	t.add_theme_font_override(&"font", MenuKit.broadcast(400))
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var price := HBoxContainer.new()
	price.alignment = BoxContainer.ALIGNMENT_CENTER
	price.add_theme_constant_override(&"separation", 4)
	price.mouse_filter = Control.MOUSE_FILTER_IGNORE
	price.add_child(CareerKit.icon(CareerIcons.ICON.coin, EM, UiTheme.INK if ten else CareerKit.GOLD))
	price.add_child(MenuKit.label(TCareer.credits(cost), 0.95 * EM, 800, UiTheme.INK if ten else UiTheme.TEXT))
	v.add_child(price)
	if sub != "":
		var s := MenuKit.label(sub, 0.68 * EM, 700, Color(UiTheme.INK, 0.75) if ten else UiTheme.MUTED)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		v.add_child(s)
	if ten:
		_sheen(b, 18.0, 3.6, 0.0, 0.5)
		# a tenth off, on a ribbon across its corner
		var off := int(round((1.0 - float(cost) / float(n * Gacha.PULL_COST)) * 100.0))
		if off > 0:
			var tag := MenuKit.pill(MenuKit.box(Color(0.92, 0.12, 0.3), 999, [8, 2, 8, 2], Color(1, 1, 1, 0.5), 1))
			tag.get_node("Row").add_child(MenuKit.label("SAVE %d%%" % off, 0.62 * EM, 900, Color.WHITE, 1))
			tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
			b.add_child(tag)
			tag.rotation = 0.12
			b.resized.connect(func() -> void:
				var ts := tag.get_combined_minimum_size()
				tag.size = ts
				tag.position = Vector2(b.size.x - ts.x + 6.0, -ts.y * 0.45))
	b.set_meta("cost", cost)
	return b


## A glint of light that slides over `on` every `period` seconds (`radius` its corners).
func _sheen(on: Control, radius: float, period: float, phase: float, strength: float) -> void:
	var m := ShaderMaterial.new()
	m.shader = preload("res://app/gacha/sheen.gdshader")
	m.set_shader_parameter("period", period)
	m.set_shader_parameter("phase", phase)
	m.set_shader_parameter("strength", strength)
	var r := ColorRect.new()
	r.material = m
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	on.add_child(r)
	r.resized.connect(func() -> void:
		m.set_shader_parameter("rect", r.size)
		m.set_shader_parameter("radius", minf(radius, minf(r.size.x, r.size.y) * 0.5)))


func _tick_clocks() -> void:
	if tab != "vault" or _free_btn == null or not is_instance_valid(_free_btn):
		return
	var gs := g()
	_feat_clock.text = "New featured skin in " + Gacha.clock(Gacha.featured_in())
	var left := Gacha.pity_left(gs)
	_dial_n.text = str(left)
	_dial_big.text = "In at most %d pulls" % left if left > 1 else "Your next pull is an Epic"
	var pct := int(round(Gacha.epic_chance(gs) * 100.0))
	var boosted := int(gs.since_epic) + 1 > Gacha.SOFT_PITY
	_dial_sub.text = "Epic chance boosted to %d%% a pull" % pct if boosted else "Epic chance %d%% a pull, rising after %d pulls" % [pct, Gacha.SOFT_PITY]
	var credits: float = app.record.career.credits
	if not gs.welcome:
		_free_btn.visible = true
		UiTheme.set_button(_free_btn, "Welcome gift: a free ×10 pull", "star")
		_free_l.text = "On the house, to start your collection"
	elif Gacha.free_in(gs) <= 0.0:
		_free_btn.visible = true
		UiTheme.set_button(_free_btn, "Free pull ready", "star")
		_free_l.text = "A new one every 4 hours"
	else:
		_free_btn.visible = false
		_free_l.text = "Next free pull in " + Gacha.clock(Gacha.free_in(gs))
	for b in [_one, _ten]:
		var ok: bool = credits >= float(b.get_meta("cost"))
		b.modulate.a = 1.0 if ok else 0.55


func tick(dt: float) -> void:
	_clock_t -= dt
	if _clock_t <= 0.0:
		_clock_t = 0.5
		_tick_clocks()
	# the sounds are made a few at a time before they're needed
	GachaSound.warm_one()
	_spin_tick(dt)
	_dial_tick(dt)


## The pity dial: turning slowly (a spin when tapped), its lamps easing to the pulls since the
## last Epic, glowing while a free pull waits.
func _dial_tick(dt: float) -> void:
	if _dial == null or not is_instance_valid(_dial) or not _dial.is_visible_in_tree():
		return
	_dial_kick = maxf(0.0, _dial_kick - dt * 0.9)
	_dial_turn += dt * (0.12 + _dial_kick * _dial_kick * 9.0)
	_dial_mat.set_shader_parameter("turn", _dial_turn)
	var to := float(g().since_epic) / float(Gacha.HARD_PITY)
	_dial_fill = to if _dial_fill < 0.0 else move_toward(_dial_fill, to, dt * 0.35)
	_dial_mat.set_shader_parameter("fill", _dial_fill)
	_dial_mat.set_shader_parameter("ready", 1.0 if Gacha.gift_ready(g()) else 0.0)


# ------------------------------------------------------------------------------ pulling

func _free_pull() -> void:
	var gs := g()
	if not gs.welcome:
		gs.welcome = true
		_open(10, 0)
	elif Gacha.free_in(gs) <= 0.0:
		gs.free_at = Gacha.now() + Gacha.FREE_EVERY
		_open(1, 0)


## Pay for `n` pulls in credits and play them out (or say why not).
func pull(n: int) -> void:
	var cost := Gacha.PULL_COST if n == 1 else Gacha.TEN_COST
	var c = app.record.career
	if c.credits < cost:
		app.tap("back")
		toast("Not enough credits. Every fight pays, and daily contracts pay more")
		var b := _one if n == 1 else _ten
		if b != null and is_instance_valid(b):
			var tw := b.create_tween()
			for i in 4:
				tw.tween_property(b, "position:x", b.position.x + (6.0 if i % 2 == 0 else -6.0), 0.04)
			tw.tween_property(b, "position:x", b.position.x, 0.04)
		return
	c.credits -= cost
	_open(n, cost)


func _open(n: int, paid: int) -> void:
	var gs := g()
	var results := Gacha.pull(gs, n)
	Gacha.save_state(gs)
	app.save_record()
	_close_show()
	show = PullShow.new(app, results, sound)
	var cost := Gacha.PULL_COST if n == 1 else Gacha.TEN_COST
	show.again_text = ("Pull again  ·  %s" if n == 1 else "Pull ×10 again  ·  %s") % TCareer.credits(cost)
	show.again_ok = app.record.career.credits >= cost
	show.finished.connect(func(action: String, data) -> void: _on_show(action, data, n))
	app.ui.add_child(show)
	_panel_shown(false)


func _on_show(action: String, data, n: int) -> void:
	match action:
		"again":
			app.tap("select")
			pull(n)
		"wear":
			app.tap("select")
			_close_show()
			wear(data)
		_:
			app.tap("back")
			_close_show()
	refresh()


func _close_show() -> void:
	if show == null:
		return
	var s := show
	show = null
	sound.stop_all()
	s.mouse_filter = Control.MOUSE_FILTER_IGNORE
	s.set_process(false)
	s._exit_tree()
	var tw := s.create_tween()
	tw.tween_property(s, "modulate:a", 0.0, 0.25)
	tw.tween_callback(s.queue_free)
	# the vault shutting again, the player's own bot back on the turntable (a 10-pull's card may
	# have left another skin on it), and the panel back
	var st := stage()
	if st != null:
		st.finish()
	if app.game._shown_spec != app.player and app.current == "vault":
		app.game.show_bot(app.player)
	_panel_shown(true)


## The panel and the wallet out of the way while a pull plays in the vault, or back.
func _panel_shown(on: bool) -> void:
	if _fade_tw != null:
		_fade_tw.kill()
	_fade_tw = create_tween()
	_fade_tw.tween_property(self, "modulate:a", 1.0 if on else 0.0, 0.3 if on else 0.2)


## Put a skin on the bot for good ("" for the plain paint), painted on with a sweep.
func wear(id: String) -> void:
	_drop_trial(false)
	app.wear_skin(id)
	sound.play("paint", 0.7)
	picked = Skins.get_skin(id)
	refresh()


func toast(text: String) -> void:
	_toast.text = text
	_toast.visible = true
	var tw := _toast.create_tween()
	_toast.modulate.a = 1.0
	tw.tween_interval(2.2)
	tw.tween_property(_toast, "modulate:a", 0.0, 0.5)
	tw.tween_callback(func() -> void: _toast.visible = false)


## The rules, plainly (rates, pity, the featured skin, shards, the free pull).
func _details() -> void:
	app.tap("tap")
	Modal.open(app.ui, "How the vault works", func(m: Modal) -> void:
		m.width = 30.0 * EM
		var lines := [
			"Every pull is one skin: Epic %d%%, Rare %d%%, Common %d%%." % [int(Gacha.RATES[2] * 100), int(Gacha.RATES[1] * 100), int(Gacha.RATES[0] * 100)],
			"Every 10th pull without a Rare or better gives you one, so a ×10 pull always has one.",
			"After %d pulls without an Epic, the Epic chance rises %d%% a pull, and pull %d is always an Epic." % [Gacha.SOFT_PITY, int(Gacha.SOFT_STEP * 100), Gacha.HARD_PITY],
			"Half of all Epics pulled are today's featured skin. It changes every day.",
			"A skin you already have turns into shards: Common %d, Rare %d, Epic %d." % Gacha.DUPE_SHARDS,
			"Shards buy any skin in the Collection: Common %d, Rare %d, Epic %d." % Gacha.SHARD_PRICE,
			"One free pull every 4 hours. Skins are only paint: they never change how a bot fights.",
		]
		for l in lines:
			var row := HBoxContainer.new()
			row.add_theme_constant_override(&"separation", 8)
			var dot := MenuKit.label("•", 15, 700, Skins.RARITY_COL[2])
			dot.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
			row.add_child(dot)
			var t := m.text_label(l, 15, UiTheme.TEXT_2)
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(t)
			m.body.add_child(row), Callable(), true)


# ------------------------------------------------------------------------------ the collection

func _draw_collection() -> void:
	var gs := g()
	var seg := HBoxContainer.new()
	seg.add_theme_constant_override(&"separation", 6)
	_body.add_child(seg)
	var counts := Gacha.owned_counts(gs)
	for fl in FILTERS:
		var b := Button.new()
		var r: int = fl[0]
		b.text = fl[1] if r < 0 else "%s %d/%d" % [fl[1], counts[r], Skins.of_rarity(r).size()]
		b.theme_type_variation = &"SegOn" if filter == r else &"SegBtn"
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size.y = 34
		b.add_theme_font_size_override(&"font_size", 13)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(func() -> void:
			if filter != r:
				app.tap("tap")
				filter = r
				_draw_body())
		seg.add_child(b)
	_grid_scroll = ScrollContainer.new()
	_grid_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_grid_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.add_child(_grid_scroll)
	var pad := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		pad.add_theme_constant_override("margin_" + side, 10)
	pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid_scroll.add_child(pad)
	_grid = GridContainer.new()
	_grid.add_theme_constant_override(&"h_separation", 12)
	_grid.add_theme_constant_override(&"v_separation", 12)
	pad.add_child(_grid)
	var pw := minf(size.x * 0.47, 600.0) - 32.0 - 20.0
	var cols := clampi(int(pw / 112.0), 3, 5)
	_grid.columns = cols
	var cw := floorf((pw - 12.0 * (cols - 1)) / cols) - 2.0
	var ch := cw * 1.38
	var worn = Skins.of(app.player)
	var list: Array = [null]
	for s in Skins.LIST:
		if filter < 0 or int(s.r) == filter:
			list.append(s)
	if filter >= 0:
		list.remove_at(0)
	# rarest first, owned before not
	list.sort_custom(func(a, b) -> bool:
		if a == null or b == null:
			return a == null
		var oa := 1 if Gacha.owns(gs, a.id) else 0
		var ob := 1 if Gacha.owns(gs, b.id) else 0
		if int(a.r) != int(b.r):
			return int(a.r) > int(b.r)
		return oa > ob)
	for s in list:
		var owned := s == null or Gacha.owns(gs, s.id)
		var c := SkinCard.new(s, cw, ch)
		c.set_skin(s, not owned)
		c.orb.set_spin(0.03)
		if s != null and owned:
			var n := int(gs.owned[s.id])
			if gs.fresh.has(s.id):
				c.set_badge("NEW")
			elif n > 1:
				c.set_badge("×%d" % n, Color(1, 1, 1, 0.16), UiTheme.TEXT)
		elif s != null:
			c.set_badge("%d" % Gacha.SHARD_PRICE[int(s.r)], Color(Skins.RARITY_COL[1], 0.3), UiTheme.TEXT)
		var is_worn: bool = (s == null and worn == null) or (s != null and worn != null and s.id == worn.id)
		c.worn.visible = is_worn
		c.pressed.connect(func() -> void: _pick(s))
		_grid.add_child(c)
	# the strip under the grid: what's picked and what can be done with it
	_strip = PanelContainer.new()
	_strip.add_theme_stylebox_override(&"panel", MenuKit.box(Color(1, 1, 1, 0.05), 16, [14, 10, 10, 10], UiTheme.LINE, 1))
	_body.add_child(_strip)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 10)
	_strip.add_child(row)
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override(&"separation", 0)
	tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(tv)
	_strip_name = MenuKit.label("", 1.05 * EM, 800)
	tv.add_child(_strip_name)
	_strip_info = MenuKit.label("", 0.78 * EM, 550, UiTheme.TEXT_2)
	_strip_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_strip_info.custom_minimum_size.x = 120
	tv.add_child(_strip_info)
	_strip_btn = UiTheme.button("Wear", "paint", &"BtnPrimary")
	MenuKit.pad_button(_strip_btn, 16, 42)
	_strip_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_strip_btn.pressed.connect(_strip_action)
	row.add_child(_strip_btn)
	_sync_strip()
	# what's been looked at isn't new any more
	if not gs.fresh.is_empty() and filter < 0:
		gs.fresh.clear()
		Gacha.save_state(gs)


## A card tapped: an owned skin goes on; one not owned is tried on.
func _pick(s) -> void:
	var gs := g()
	picked = s
	var owned := s == null or Gacha.owns(gs, s.id)
	if owned:
		app.tap("select")
		var worn = Skins.of(app.player)
		if (s == null and worn == null) or (s != null and worn != null and s.id == worn.id):
			_drop_trial()
			_sync_strip()
			return
		wear(s.id if s != null else "")
		return
	app.tap("tap")
	_try_on(s)
	_sync_strip()


func _try_on(s) -> void:
	var was = Skins.of(app.game._shown_spec) if app.game._shown_spec != null else null
	var spec = app.player.duplicate(true)
	spec.skin = s.id
	trial = true
	app.game.show_bot(spec)
	if app.game.showcase != null:
		app.game.showcase.model.paint_on(was)
	var st := stage()
	if st != null:
		st.pulse()
	sound.play("paint", 0.5, 1.15)


func _drop_trial(restore := true) -> void:
	if not trial:
		return
	trial = false
	if restore and app.current == "vault":
		app.game.show_bot(app.player)


func _sync_strip() -> void:
	if _strip == null:
		return
	var gs := g()
	var s = picked
	var worn = Skins.of(app.player)
	if s == null and not trial:
		s = worn
	if s == null:
		_strip_name.text = "Plain paint"
		_strip_info.text = "Your own paint job, as the Paint tab in the garage has it."
		_strip_btn.visible = false
		return
	var owned := Gacha.owns(gs, s.id)
	_strip_name.text = s.name
	_strip_name.add_theme_color_override(&"font_color", Skins.RARITY_COL[int(s.r)].lerp(Color.WHITE, 0.4))
	var price: int = Gacha.SHARD_PRICE[int(s.r)]
	if owned:
		var n := int(gs.owned[s.id])
		_strip_info.text = "%s · %s%s" % [Skins.RARITY_NAME[int(s.r)], s.blurb, (" · %d copies" % n) if n > 1 else ""]
		var on: bool = worn != null and worn.id == s.id
		_strip_btn.visible = not on
		UiTheme.set_button(_strip_btn, "Wear", "paint")
	else:
		_strip_info.text = "%s · trying it on · %d shards (you have %d)" % [Skins.RARITY_NAME[int(s.r)], price, int(gs.shards)]
		_strip_btn.visible = true
		UiTheme.set_button(_strip_btn, "Get it · %d" % price, "star")
		_strip_btn.disabled = int(gs.shards) < price


func _strip_action() -> void:
	var gs := g()
	var s = picked
	if s == null:
		return
	if Gacha.owns(gs, s.id):
		wear(s.id)
		return
	if Gacha.exchange(gs, s):
		Gacha.save_state(gs)
		sound.play("chime%d" % int(s.r), 0.7)
		wear(s.id)
		toast("%s is yours" % s.name)


# ------------------------------------------------------------------------------ turning the bot

func _unhandled_input(e: InputEvent) -> void:
	if not visible or app == null or app.current != "vault" or show != null:
		return
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			_spin.dragging = true
			_spin.vel = 0.0
			_spin.x = mb.position.x
			_spin.t = Time.get_ticks_usec()
		elif _spin.dragging:
			_spin.dragging = false
			if Time.get_ticks_usec() - int(_spin.t) > 80000:
				_spin.vel = 0.0
			_spin.idle = 0.0
	elif e is InputEventMouseMotion and _spin.dragging:
		var mm := e as InputEventMouseMotion
		var now := Time.get_ticks_usec()
		var d := (mm.position.x - float(_spin.x)) * 0.012
		_turn(-d)
		var dt := maxf(1.0, (now - int(_spin.t)) / 1000.0) / 1000.0
		_spin.vel = float(_spin.vel) * 0.5 + (-d / dt) * 0.5
		_spin.x = mm.position.x
		_spin.t = now
		_spin.idle = 0.0


func _spin_tick(dt: float) -> void:
	if _spin.dragging:
		return
	_spin.idle = float(_spin.idle) + dt
	_spin.vel = clampf(float(_spin.vel) * exp(-3.5 * dt), -6.0, 6.0)
	# a slow showroom turn once nobody has touched it a while
	var drift := minf(1.0, (float(_spin.idle) - 3.0) / 3.0) * 0.12 if float(_spin.idle) > 3.0 else 0.0
	_turn(float(_spin.vel) * dt + drift * dt)


func _turn(by: float) -> void:
	var st := stage()
	if st != null:
		st.yaw += by


## The vault's place in the world (built the first time the screen opens).
func stage() -> VaultStage:
	return app.game.get_place("vault") as VaultStage if app != null and app.game != null else null
