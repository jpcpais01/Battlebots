## The Tag Team screen: the team sheet before a two-a-side fight, over the ring (the menu camera
## orbiting the player's bot). The player's team on the left, the rivals on the right, a VS
## between (stacked, on a narrow screen).
##   Your team: the player's bot as its captain (it starts in the ring) and a partner on the
##   apron, picked from the garage's saved bots; with none saved, a made-up recruit in the
##   player's colours turned round (the dice makes another). The pair's team name.
##   Rivals: two AI bots, each about as strong as the bot it lines up against, in one team
##   livery, with a team name. New rivals rolls another team.
## Fight starts the tag team match (App.start_tag_fight). The tag team tally sits top right.
class_name TagTeamScreen
extends AppScreen

const EM := UiTheme.EM
const ORANGE := Color(1.0, 0.478, 0.102)
## Two bots side by side (the Tag Team button and kicker).
const TEAM_SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="6" height="5" rx="1.2"/><path d="M4.5 13.5h4M6.5 10v3.5M5 20l1.5-6.5L8 20"/><rect x="14.5" y="5" width="6" height="5" rx="1.2"/><path d="M15.5 13.5h4M17.5 10v3.5M16 20l1.5-6.5L19 20"/><path d="M10.5 7.5h3" stroke-dasharray="1 1.6"/></svg>'
const DICE_SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/></svg>'

## The partner: one of the saved bots (its index in App.saves) or the made-up recruit (-1).
var pick := -1
var partner = null
var recruit = null
var rivals: Array = []
var names := ["", ""]
var _rng := TMath.Rng.new(float(randi()))
## What the rivals were rolled against (the player's bot and partner): a change rolls new ones.
var _rolled_for := ""

var _wash := TextureRect.new()
var _top := HBoxContainer.new()
var _tally: Label
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _versus := BoxContainer.new()
var _ours: Control
var _theirs: Control
var _ours_rise: Rise
var _theirs_rise: Rise
var _vs: Control
var _vs_rise: Rise
var _our_name: Label
var _their_name: Label
var _our_cards := VBoxContainer.new()
var _their_cards := VBoxContainer.new()
var _picker := HFlowContainer.new()
var _picker_hint: Label
var _rules: Label
var _fight: Button
var _fight_rise: Rise


func _ready() -> void:
	_build()
	resized.connect(_layout)
	_body.minimum_size_changed.connect(_queue_layout)


# ------------------------------------------------------------------ building

func _build() -> void:
	# a wash over the ring: the sheet reads, the bot still shows round it
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	g.colors = PackedColorArray([Color(0.02, 0.027, 0.047, 0.72), Color(0.02, 0.027, 0.047, 0.5), Color(0.02, 0.027, 0.047, 0.78)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.45)
	gt.fill_to = Vector2(1.1, 1.1)
	gt.width = 128
	gt.height = 128
	_wash.texture = gt
	_wash.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_wash.stretch_mode = TextureRect.STRETCH_SCALE
	_wash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_wash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_wash)
	# the top bar: home, the title, the tally
	_top.add_theme_constant_override(&"separation", int(0.9 * EM))
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var home := MenuKit.edge_pill("home", "Home", EM)
	home.name = "Home"
	home.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	_top.add_child(home)
	var title := MenuKit.grad_label("TAG TEAM", 1.55 * EM, MenuKit.broadcast(400), Color(0.62, 0.93, 1.0), Color(0.2, 0.62, 1.0))
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	MenuKit.text_shadow(title, 0.45)
	_top.add_child(title)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	var chip := MenuKit.pill(MenuKit.box(MenuKit.PILL_BG, 999, [0.8 * EM, 0.35 * EM, 0.9 * EM, 0.35 * EM], UiTheme.LINE, 1), 0.45 * EM)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.get_node("Row").add_child(CareerKit.icon(TEAM_SVG, 1.1 * EM, UiTheme.CYAN))
	_tally = MenuKit.label("", 0.85 * EM, 700, UiTheme.TEXT_2)
	chip.get_node("Row").add_child(_tally)
	_top.add_child(chip)

	# the sheet, scrolling when the screen is too short for it
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(_scroll)
	_body.add_theme_constant_override(&"separation", int(round(0.9 * EM)))
	_body.alignment = BoxContainer.ALIGNMENT_CENTER
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scroll.add_child(_body)
	_versus.alignment = BoxContainer.ALIGNMENT_CENTER
	_versus.add_theme_constant_override(&"separation", int(round(0.9 * EM)))
	_versus.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_child(_versus)

	# your team
	var ov := _team_panel(UiTheme.CYAN, "Your team")
	_ours = ov[0]
	_our_name = ov[1]
	var oc: VBoxContainer = ov[2]
	_our_cards.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	_our_cards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	oc.add_child(_our_cards)
	var pk := VBoxContainer.new()
	pk.add_theme_constant_override(&"separation", int(round(0.35 * EM)))
	pk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pk.add_child(MenuKit.kicker("Choose your partner", EM))
	_picker.add_theme_constant_override(&"h_separation", int(round(0.4 * EM)))
	_picker.add_theme_constant_override(&"v_separation", int(round(0.4 * EM)))
	_picker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pk.add_child(_picker)
	_picker_hint = MenuKit.label("", 0.78 * EM, 500, UiTheme.MUTED)
	_picker_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_picker_hint.custom_minimum_size.y = 0
	pk.add_child(_picker_hint)
	oc.add_child(pk)
	_ours_rise = Rise.wrap(_ours)
	_versus.add_child(_ours_rise)

	# VS
	_vs = _vs_badge()
	_vs_rise = Rise.wrap(_vs)
	_vs_rise.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_vs_rise.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_versus.add_child(_vs_rise)

	# the rivals
	var tv := _team_panel(ORANGE, "Rivals")
	_theirs = tv[0]
	_their_name = tv[1]
	var tc: VBoxContainer = tv[2]
	_their_cards.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	_their_cards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tc.add_child(_their_cards)
	var reroll := CareerKit.button("New rivals", DICE_SVG, &"BtnSmall")
	reroll.name = "Reroll"
	reroll.size_flags_horizontal = Control.SIZE_SHRINK_END
	reroll.pressed.connect(func() -> void:
		app.tap("select")
		roll_rivals()
		_show_teams(false)
		_theirs_rise.play(0.4, 0.0, Vector2(0.8 * EM, 0), 0.97))
	tc.add_child(reroll)
	_theirs_rise = Rise.wrap(_theirs)
	_versus.add_child(_theirs_rise)

	# how it works, and Fight
	_rules = MenuKit.label("Two bots a side, one in the ring at a time. Tag your partner in at your corner; a knocked-out bot is out, and the last bot standing wins it for its team.", 0.8 * EM, 500, UiTheme.TEXT_2)
	_rules.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_rules.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_rules.custom_minimum_size.y = 0
	MenuKit.text_shadow(_rules, 0.7, 1)
	_body.add_child(_rules)
	_fight = UiTheme.button("Fight", "swords", &"BtnPrimary")
	_fight.name = "Fight"
	var big := 1.3 * EM
	MenuKit.button_text(_fight, big, 750, 1.2 * big)
	MenuKit.pad_button(_fight, 2.6 * big, 3.1 * big)
	_fight.pressed.connect(fight)
	_fight_rise = Rise.wrap(_fight)
	_fight_rise.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_body.add_child(_fight_rise)


## A team's panel: dark glass with a stripe of the team's colour along the top. Returns [panel,
## its name label, the column to fill].
func _team_panel(col: Color, kicker: String) -> Array:
	var p := MarginContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	# a deep shadow under it
	var sh := Panel.new()
	var sb := MenuKit.box(Color(0, 0, 0, 0.01), 22)
	sb.shadow_color = Color(0, 0, 0, 0.45)
	sb.shadow_size = 22
	sb.shadow_offset = Vector2(0, 14)
	sh.add_theme_stylebox_override(&"panel", sb)
	sh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(sh)
	# dark glass washed with the team's colour, its colour along the top edge fading out across
	var base := Color(0.05, 0.06, 0.09)
	p.add_child(MenuKit.grad_panel({
		"radius": 22.0, "c0": Color(MenuKit.mix(col, base, 0.08), 0.9), "c1": Color(0.03, 0.035, 0.055, 0.92), "angle": 165.0,
		"stop1": 0.6, "border": UiTheme.LINE, "border_w": 1.0,
		"bar": Color(col, 0.95), "bar_h": 3.0, "bar_dir": 1.0 if col == UiTheme.CYAN else -1.0,
	}))
	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in [["left", 1.0], ["top", 0.95], ["right", 1.0], ["bottom", 1.0]]:
		pad.add_theme_constant_override("margin_" + k[0], int(round(k[1] * EM)))
	p.add_child(pad)
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(round(0.6 * EM)))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.add_child(v)
	var head := VBoxContainer.new()
	head.add_theme_constant_override(&"separation", 0)
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var k := HBoxContainer.new()
	k.add_theme_constant_override(&"separation", int(round(0.4 * EM)))
	k.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dot := Panel.new()
	var ds := MenuKit.box(col, 99)
	ds.shadow_color = Color(col, 0.8)
	ds.shadow_size = 4
	dot.add_theme_stylebox_override(&"panel", ds)
	dot.custom_minimum_size = Vector2.ONE * round(0.45 * EM)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	k.add_child(dot)
	k.add_child(MenuKit.kicker(kicker, EM))
	head.add_child(k)
	var top := Color(0.85, 0.97, 1.0) if col == UiTheme.CYAN else Color(1.0, 0.86, 0.62)
	var name_l := MenuKit.grad_label("", 1.35 * EM, MenuKit.broadcast(400), top, col)
	name_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_l.clip_text = true
	name_l.custom_minimum_size.x = 40
	MenuKit.text_shadow(name_l, 0.4)
	head.add_child(name_l)
	v.add_child(head)
	return [p, name_l, v]


## The VS between the teams: the broadcast face in a hot gradient, in a dark ring.
func _vs_badge() -> Control:
	var s := 3.6 * EM
	var p := PanelContainer.new()
	var sb := MenuKit.box(Color(0.03, 0.035, 0.055, 0.92), s * 0.5 - 1.0, [0, 0, 0, 0], Color(1.0, 0.7, 0.3, 0.55), 2)
	sb.shadow_color = Color(1.0, 0.45, 0.1, 0.35)
	sb.shadow_size = 14
	p.add_theme_stylebox_override(&"panel", sb)
	p.custom_minimum_size = Vector2(s, s)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := MenuKit.grad_label("VS", 1.45 * EM, MenuKit.broadcast(400), MenuKit.css("#ffd27a"), MenuKit.css("#ff6a12"))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	p.add_child(l)
	return p


## One bot of a team: its colours, its role, its name and power, its moves and frame.
func _member(spec, role: String, col: Color, right: bool) -> Control:
	var paint := MenuKit.hex(spec.paint.primary)
	var card := PanelContainer.new()
	# a dark card washed with the bot's paint, its colour down the outer edge
	var bg := MenuKit.mix(paint, Color(0.078, 0.094, 0.133), 0.14)
	var sb := MenuKit.box(Color(bg, 0.94), 14, [0.75 * EM, 0.55 * EM, 0.85 * EM, 0.6 * EM], Color(1, 1, 1, 0.07), 1)
	if right:
		sb.border_width_right = 4
	else:
		sb.border_width_left = 4
	sb.border_color = Color(paint, 0.95) if _luma(paint) > 0.12 else Color(MenuKit.hex(spec.paint.accent), 0.95)
	card.add_theme_stylebox_override(&"panel", sb)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.75 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(row)
	var sw := Swatch.new()
	sw.paint = spec.paint
	sw.custom_minimum_size = Vector2.ONE * 2.9 * EM
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var info := VBoxContainer.new()
	info.add_theme_constant_override(&"separation", 0)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var b = TItems.computeBuild(spec.loadout, float(spec.get("size_", 1.0)))
	# role and power
	var cap := HBoxContainer.new()
	cap.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	cap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rl := MenuKit.label(role.to_upper(), 0.66 * EM, 700, Color(col, 0.9), int(round(0.66 * EM * 0.14)))
	rl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cap.add_child(rl)
	var pw := MenuKit.pill(MenuKit.box(Color(1, 1, 1, 0.07), 999, [0.5 * EM, 0.05 * EM, 0.55 * EM, 0.05 * EM]), 0.25 * EM)
	pw.get_node("Row").add_child(MenuKit.icon("bolt", 0.8 * EM, MenuKit.AMBER))
	pw.get_node("Row").add_child(MenuKit.label("%d" % int(b.rating), 0.78 * EM, 750, UiTheme.TEXT))
	pw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	cap.add_child(pw)
	info.add_child(cap)
	var nl := MenuKit.label(String(spec.name_), 1.12 * EM, 800, UiTheme.TEXT)
	nl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nl.clip_text = true
	nl.custom_minimum_size.x = 40
	info.add_child(nl)
	var moves := []
	for id in [b.fistAbility, b.kickAbility]:
		moves.append(String(TMoves.MOVES[id].name_))
	var z := float(spec.get("size_", 1.0))
	var meta := " · ".join(moves) + (" · %d%% frame" % roundi(z * 100.0) if z != 1.0 else "")
	var ml := MenuKit.label(meta, 0.74 * EM, 550, UiTheme.MUTED)
	ml.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	ml.clip_text = true
	ml.custom_minimum_size.x = 40
	info.add_child(ml)
	if right:
		for l in [nl, ml]:
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		cap.move_child(rl, 1)
		rl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(info)
		row.add_child(sw)
	else:
		row.add_child(sw)
		row.add_child(info)
	return card


## A partner to pick: its colours, name and power; lit when it's the one.
func _choice(spec, idx: int, on: bool) -> Button:
	var b := MenuKit.bare_button(0.95)
	b.name = "Pick%d" % idx if idx >= 0 else "PickRecruit"
	var face := MenuKit.pill(MenuKit.box(Color(UiTheme.CYAN, 0.16) if on else MenuKit.PILL_BG, 999, [0.55 * EM, 0.3 * EM, 0.85 * EM, 0.3 * EM], Color(UiTheme.CYAN, 0.9) if on else UiTheme.LINE, 2 if on else 1), 0.4 * EM)
	face.name = "Face"
	var row := face.get_node("Row") as HBoxContainer
	if idx < 0:
		row.add_child(CareerKit.icon(DICE_SVG, 1.0 * EM, UiTheme.CYAN if on else UiTheme.TEXT_2))
	var sw := Swatch.new()
	sw.paint = spec.paint
	sw.custom_minimum_size = Vector2.ONE * 1.15 * EM
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(sw)
	row.add_child(MenuKit.label(String(spec.name_), 0.82 * EM, 700, UiTheme.TEXT if on else UiTheme.TEXT_2))
	row.add_child(MenuKit.label("%d" % int(TagTeamKit.power(spec)), 0.74 * EM, 650, UiTheme.MUTED))
	b.add_child(face)
	var sync := func() -> void:
		var ms := face.get_combined_minimum_size()
		b.custom_minimum_size = Vector2(ms.x, maxf(UiTheme.TAP, ms.y))
		face.size = ms
		face.position = ((b.size - ms) * 0.5).round()
	face.minimum_size_changed.connect(sync)
	b.resized.connect(sync)
	sync.call()
	b.pressed.connect(func() -> void:
		app.tap("select")
		if idx < 0 and pick < 0:
			# the recruit again: another one
			recruit = TagTeamKit.make_partner(app, _rng)
		choose(idx))
	return b


# ------------------------------------------------------------------ the teams

## The saved bots that can be partners (not a copy of the player's own bot).
func candidates() -> Array:
	var out := []
	var me := JSON.stringify(app.player)
	for s in app.saves:
		if JSON.stringify(s) != me:
			out.append(s)
	return out


## Make saved bot `idx` the partner (-1: the recruit), and roll rivals for the new pair.
func choose(idx: int) -> void:
	var c := candidates()
	pick = idx if idx < c.size() else -1
	if pick < 0:
		if recruit == null:
			recruit = TagTeamKit.make_partner(app, _rng)
		partner = recruit
	else:
		partner = c[pick]
		Store.set_pref("tagPartner", String(partner.name_))
	if pick < 0:
		Store.set_pref("tagPartner", "")
	_sync_rivals()
	_show_teams(true)


## Rivals for the pair as it is now, unless they were rolled for it already.
func _sync_rivals() -> void:
	var key := JSON.stringify([app.player, partner])
	if key != _rolled_for or rivals.is_empty():
		roll_rivals()


## A new rival team for the player's pair.
func roll_rivals() -> void:
	rivals = TagTeamKit.make_rivals(app, partner, _rng)
	names[1] = TagTeamKit.team_name(_rng)
	while names[1] == names[0]:
		names[1] = TagTeamKit.team_name(_rng)
	_rolled_for = JSON.stringify([app.player, partner])


## Redraw both teams (and the partner choices).
func _show_teams(_animate: bool) -> void:
	if partner == null:
		return
	names[0] = TagTeamKit.our_name(app.player, partner)
	_our_name.text = names[0]
	_their_name.text = names[1]
	for c in _our_cards.get_children() + _their_cards.get_children() + _picker.get_children():
		c.queue_free()
	_our_cards.add_child(_member(app.player, "Captain · starts in the ring", UiTheme.CYAN, false))
	_our_cards.add_child(_member(partner, "Partner · on the apron", UiTheme.CYAN, false))
	_their_cards.add_child(_member(rivals[0], "Starts in the ring", ORANGE, true))
	_their_cards.add_child(_member(rivals[1], "On the apron", ORANGE, true))
	var c := candidates()
	for i in c.size():
		_picker.add_child(_choice(c[i], i, i == pick))
	if recruit == null:
		recruit = TagTeamKit.make_partner(app, _rng)
	_picker.add_child(_choice(recruit, -1, pick < 0))
	_picker_hint.text = "Save bots in the garage to bring them in as partners. The dice signs up a recruit." if c.is_empty() else "Saved bots from your garage. The dice signs up a recruit."
	var t := TagTeamKit.tally()
	_tally.text = "Record %d–%d%s" % [t[0], t[1], "–%d" % t[2] if t[2] > 0 else ""]
	_queue_layout()


## Fight: the tag team match, these two against those two.
func fight() -> void:
	if partner == null or rivals.size() < 2:
		return
	app.tap("start")
	app.start_tag_fight(partner, rivals, names.duplicate())


# ------------------------------------------------------------------ screen

func enter() -> void:
	# the partner last picked, if it's still saved
	var c := candidates()
	var want := String(Store.pref("tagPartner", ""))
	var idx := -1
	if pick >= 0 and pick < c.size() and partner != null and JSON.stringify(c[pick]) == JSON.stringify(partner):
		idx = pick
	elif want != "":
		for i in c.size():
			if String(c[i].name_) == want:
				idx = i
				break
	elif pick < 0 and partner == null and not c.is_empty():
		idx = 0
	# (the rivals faced last stay up for a rematch from here)
	if app.tag_setup != null and rivals.is_empty():
		rivals = app.tag_setup.rivals
		names[1] = app.tag_setup.names[1]
	choose(idx)
	_layout()
	# the teams slide in from their sides, the VS pops between them
	_ours_rise.play(0.55, 0.0, Vector2(-1.4 * EM, 0))
	_theirs_rise.play(0.55, 0.06, Vector2(1.4 * EM, 0))
	_vs_rise.play(0.45, 0.22, Vector2.ZERO, 0.6, Tween.TRANS_BACK)
	_fight_rise.play(0.5, 0.28, Vector2(0, 0.8 * EM))


func refresh() -> void:
	if visible and partner != null:
		_sync_rivals()
		_show_teams(false)


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
	_top.position = Vector2(side, top)
	_top.size = Vector2(size.x - side * 2.0, UiTheme.TAP)
	var y0 := top + UiTheme.TAP + 0.6 * EM
	var w := size.x - side * 2.0
	# side by side when there's room for both teams; stacked on a narrow (portrait) screen
	var wide := w >= 2.0 * 19.0 * EM + 3.6 * EM + 2.0 * 0.9 * EM
	_versus.vertical = not wide
	var pw := minf((w - 3.6 * EM - 2.0 * 0.9 * EM) * 0.5, 25.0 * EM) if wide else minf(w, 30.0 * EM)
	for r in [_ours_rise, _theirs_rise]:
		r.custom_minimum_size.x = pw
	_rules.custom_minimum_size.x = minf(w, 2.0 * pw + 5.4 * EM if wide else pw)
	_scroll.position = Vector2(side, y0)
	_scroll.size = Vector2(w, size.y - y0 - bottom)
	_body.custom_minimum_size = Vector2(w, maxf(0.0, size.y - y0 - bottom))


static func _luma(c: Color) -> float:
	return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b


## A bot's colours as a round badge: its main colour, its second colour inside, a ring of its glow.
class Swatch extends Control:
	var paint

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		if paint == null:
			return
		var r := minf(size.x, size.y) * 0.5
		var c := size * 0.5
		var glow := MenuKit.hex(paint.accent)
		draw_circle(c, r, Color(glow, 0.22))
		draw_circle(c, r * 0.84, MenuKit.hex(paint.primary))
		# the second colour as the lower half's band, a chevron of it across the middle
		var sec := MenuKit.hex(paint.secondary)
		var pts := PackedVector2Array()
		for k in 17:
			var a := PI * k / 16.0
			pts.append(c + Vector2(cos(a), sin(a)) * r * 0.84)
		draw_colored_polygon(pts, sec)
		draw_arc(c, r * 0.84, 0.0, TAU, 40, Color(glow, 0.95), maxf(1.5, r * 0.12), true)
		draw_circle(c, r * 0.2, glow)
