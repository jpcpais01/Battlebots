## The Gauntlet's screen (app/gauntlet/gauntlet.gd), over the ring with the menu camera turning
## round the player's bot. Left, the ladder: the bank and what's locked in, the stages round the
## one to fight (cleared, next, bosses ahead with their venues and purses), the best run. Right,
## what to do now:
##   no run: how it works, the last run, Start run;
##   a stage won: Pick a boost, three cards (keep one for the rest of the run);
##   ready: the next rival (style, threat, boosts, venue, a boss's taunt), the boosts the run
##   holds, Fight, and Cash out (take the bank home).
class_name GauntletScreen
extends AppScreen

const EM := UiTheme.EM
const HOT := Color(1.0, 0.36, 0.22)
const GOLD := Color(1.0, 0.824, 0.29)
## The Gauntlet's mark: a fist through a ring of stages.
const SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4v-4h4v-4h4V8h4V4"/><path d="M4 20v-2M8 16v-2M12 12v-2M16 8V6"/><circle cx="20" cy="4" r="1.6" fill="currentColor"/></svg>'
const LOCK_SVG := '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>'
## How many stages the ladder shows (the next one third from the bottom).
const LADDER_ROWS := 7

var _wash := TextureRect.new()
var _top := HBoxContainer.new()
var _best: Label
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _row := BoxContainer.new()
var _ladder := VBoxContainer.new()
var _ladder_rise: Rise
var _main := VBoxContainer.new()
var _main_rise: Rise
var _bank: Label
var _safe: Label
var _rungs := VBoxContainer.new()
var _foot: Label
## The boost picked last (it pulses in the run's boosts), or "".
var _picked := ""


func _ready() -> void:
	_build()
	resized.connect(_layout)
	_body.minimum_size_changed.connect(_queue_layout)


# ------------------------------------------------------------------ building

func _build() -> void:
	# a red-hot wash over the ring: the panels read, the bot still shows round them
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	g.colors = PackedColorArray([Color(0.05, 0.02, 0.03, 0.7), Color(0.03, 0.02, 0.04, 0.45), Color(0.02, 0.02, 0.04, 0.8)])
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
	# the top bar: home, the title, the best run
	_top.add_theme_constant_override(&"separation", int(0.9 * EM))
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var home := MenuKit.edge_pill("home", "Home", EM)
	home.name = "Home"
	home.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	_top.add_child(home)
	var title := MenuKit.grad_label("GAUNTLET", 1.55 * EM, MenuKit.broadcast(400), Color(1.0, 0.86, 0.55), HOT)
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	MenuKit.text_shadow(title, 0.45)
	_top.add_child(title)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	var chip := MenuKit.pill(MenuKit.box(MenuKit.PILL_BG, 999, [0.8 * EM, 0.35 * EM, 0.9 * EM, 0.35 * EM], UiTheme.LINE, 1), 0.45 * EM)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.get_node("Row").add_child(MenuKit.icon("trophy", 1.05 * EM, GOLD))
	_best = MenuKit.label("", 0.85 * EM, 700, UiTheme.TEXT_2)
	chip.get_node("Row").add_child(_best)
	_top.add_child(chip)

	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(_scroll)
	_body.alignment = BoxContainer.ALIGNMENT_CENTER
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scroll.add_child(_body)
	_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_row.add_theme_constant_override(&"separation", int(round(0.9 * EM)))
	_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_child(_row)

	# the ladder
	var lp := _panel(HOT)
	var lv: VBoxContainer = lp[1]
	lv.add_child(MenuKit.kicker("The bank", EM))
	var bank_row := HBoxContainer.new()
	bank_row.add_theme_constant_override(&"separation", int(round(0.4 * EM)))
	bank_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bank_row.add_child(MenuKit.icon("coin", 1.7 * EM, GOLD))
	_bank = MenuKit.label("0", 2.0 * EM, 800, Color(1.0, 0.9, 0.62))
	_bank.name = "Bank"
	MenuKit.text_shadow(_bank, 0.5)
	bank_row.add_child(_bank)
	lv.add_child(bank_row)
	var safe_row := HBoxContainer.new()
	safe_row.add_theme_constant_override(&"separation", int(round(0.35 * EM)))
	safe_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	safe_row.add_child(CareerKit.icon(LOCK_SVG, 0.95 * EM, UiTheme.GREEN))
	_safe = MenuKit.label("", 0.8 * EM, 650, UiTheme.TEXT_2)
	_safe.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_safe.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_safe.custom_minimum_size.x = 6.0 * EM
	safe_row.add_child(_safe)
	lv.add_child(safe_row)
	var rule := ColorRect.new()
	rule.color = UiTheme.LINE
	rule.custom_minimum_size.y = 1
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lv.add_child(rule)
	_rungs.add_theme_constant_override(&"separation", 0)
	_rungs.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lv.add_child(_rungs)
	_foot = MenuKit.label("", 0.74 * EM, 600, UiTheme.MUTED)
	_foot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_foot.custom_minimum_size.x = 6.0 * EM
	lv.add_child(_foot)
	_ladder_rise = Rise.wrap(lp[0])
	_row.add_child(_ladder_rise)

	# what to do now
	var mp := _panel(UiTheme.CYAN)
	var mv: VBoxContainer = mp[1]
	_main.add_theme_constant_override(&"separation", int(round(0.7 * EM)))
	_main.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mv.add_child(_main)
	_main_rise = Rise.wrap(mp[0])
	_row.add_child(_main_rise)


## A panel: dark glass washed with `col`, its colour along the top. [panel, the column to fill].
func _panel(col: Color) -> Array:
	var p := MarginContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_PASS
	var sh := Panel.new()
	var sb := MenuKit.box(Color(0, 0, 0, 0.01), 22)
	sb.shadow_color = Color(0, 0, 0, 0.45)
	sb.shadow_size = 22
	sb.shadow_offset = Vector2(0, 14)
	sh.add_theme_stylebox_override(&"panel", sb)
	sh.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(sh)
	p.add_child(MenuKit.grad_panel({
		"radius": 22.0, "c0": Color(MenuKit.mix(col, Color(0.05, 0.06, 0.09), 0.08), 0.92), "c1": Color(0.03, 0.035, 0.055, 0.93), "angle": 165.0,
		"stop1": 0.6, "border": UiTheme.LINE, "border_w": 1.0,
		"bar": Color(col, 0.95), "bar_h": 3.0, "bar_dir": 1.0,
	}))
	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in [["left", 1.0], ["top", 0.95], ["right", 1.0], ["bottom", 1.0]]:
		pad.add_theme_constant_override("margin_" + k[0], int(round(k[1] * EM)))
	p.add_child(pad)
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(round(0.55 * EM)))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.add_child(v)
	return [p, v]


# ------------------------------------------------------------------ the ladder

func _show_ladder() -> void:
	var g: Dictionary = app.gauntlet
	var run = g.run
	_bank.text = TCareer.credits(int(run.bank)) if run != null else "0"
	if run == null:
		_safe.text = "Win a stage to start banking"
	elif int(run.safe) > 0:
		_safe.text = "%s locked in" % TCareer.credits(int(run.safe))
	else:
		_safe.text = "Nothing locked in yet: beat the stage %d boss" % Gauntlet.BOSS_EVERY
	for c in _rungs.get_children():
		c.queue_free()
	var next := Gauntlet.next_stage(g)
	var lo := maxi(1, next - 2)
	for s in range(lo + LADDER_ROWS - 1, lo - 1, -1):
		_rungs.add_child(_rung(s, next, s == lo + LADDER_ROWS - 1, s == lo))
	var bits := []
	if int(g.best) > 0:
		bits.append("Best: stage %d" % int(g.best))
	if int(g.bosses) > 0:
		bits.append("%d boss%s beaten" % [int(g.bosses), "" if int(g.bosses) == 1 else "es"])
	if int(g.taken) > 0:
		bits.append("%s taken home" % TCareer.credits(int(g.taken)))
	_foot.text = " · ".join(bits) if not bits.is_empty() else "Every fifth stage is a boss, each floor in a new venue."
	_best.text = "Best: stage %d" % int(g.best) if int(g.best) > 0 else "No runs yet"


## One stage on the ladder: a node on the line (a check when cleared, its number, a crown for a
## boss), its name and venue, what it pays.
func _rung(s: int, next: int, first: bool, last: bool) -> Control:
	var done := s < next
	var now := s == next
	var big := Gauntlet.boss(s)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.6 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.name = "Stage%d" % s
	var node := Rung.new()
	node.stage = s
	node.state = 0 if done else 1 if now else 2
	node.boss = big
	node.line_up = not first
	node.line_down = not last
	node.custom_minimum_size = Vector2(2.2 * EM, 2.5 * EM if big or now else 2.1 * EM)
	row.add_child(node)
	var text := VBoxContainer.new()
	text.add_theme_constant_override(&"separation", 0)
	text.alignment = BoxContainer.ALIGNMENT_CENTER
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var name_col := UiTheme.MUTED if done else Color(1.0, 0.86, 0.6) if big else UiTheme.TEXT if now else UiTheme.TEXT_2
	var nm := ("Boss · " + String(Gauntlet.boss_def(s).name)) if big else "Stage %d" % s
	var nl := MenuKit.label(nm, (0.9 if now or big else 0.82) * EM, 750 if now or big else 650, name_col)
	nl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nl.clip_text = true
	nl.custom_minimum_size.x = 4.0 * EM
	text.add_child(nl)
	if big or now:
		var sub := "Next up · " if now else ""
		var vl := MenuKit.label(sub + Gauntlet.venue_name(Gauntlet.arena(s)), 0.7 * EM, 600, UiTheme.CYAN if now else UiTheme.MUTED)
		vl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		vl.clip_text = true
		vl.custom_minimum_size.x = 4.0 * EM
		text.add_child(vl)
	row.add_child(text)
	var pay := MenuKit.label(("+" if not done else "") + TCareer.credits(Gauntlet.purse(s)), 0.78 * EM, 700, UiTheme.MUTED if done else GOLD if big else UiTheme.TEXT_2)
	pay.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(pay)
	return row


# ------------------------------------------------------------------ what to do now

func _show_main(animate: bool) -> void:
	for c in _main.get_children():
		c.queue_free()
	var g: Dictionary = app.gauntlet
	if g.run == null:
		_show_start()
	elif not g.run.offer.is_empty():
		_show_offer()
	else:
		_show_next()
	if animate:
		_main_rise.play(0.45, 0.0, Vector2(0.9 * EM, 0), 0.98)


## No run: how it works, how the last one went, and Start run.
func _show_start() -> void:
	var g: Dictionary = app.gauntlet
	_main.add_child(MenuKit.kicker("How far can you go?", EM))
	var head := MenuKit.label("One bot. Endless rivals.", 1.45 * EM, 800, UiTheme.TEXT)
	MenuKit.text_shadow(head, 0.4)
	_main.add_child(head)
	var rules := [
		["swords", UiTheme.CYAN, "Every win puts the stage's purse in the bank, and you keep one of three boosts for the rest of the run."],
		["flame", HOT, "Rivals get tougher every stage. Every fifth is a boss, and each floor is in a new venue."],
		["crown", GOLD, "Beat a boss to lock the bank in and win Skin Vault shards."],
		["coin", GOLD, "Cash out between fights to take the whole bank home. Lose, and only what's locked in comes home."],
	]
	for r in rules:
		_main.add_child(_bullet(String(r[0]), r[1], String(r[2])))
	var last = g.get("last")
	if last != null:
		var words := ("Last run: cashed out after stage %d with %s" if last.cashed else "Last run: stopped at stage %d, %s came home") % [int(last.stage) + (0 if last.cashed else 1), TCareer.credits(int(last.took))]
		var ll := MenuKit.label(words, 0.8 * EM, 650, UiTheme.TEXT_2)
		ll.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		ll.custom_minimum_size.x = 8.0 * EM
		_main.add_child(ll)
	var go_btn := _big_button("Start run", "swords")
	go_btn.name = "Start"
	go_btn.pressed.connect(start_run)
	_main.add_child(go_btn)


## A won stage: three boosts, keep one.
func _show_offer() -> void:
	var run: Dictionary = app.gauntlet.run
	_main.add_child(MenuKit.kicker("Stage %d cleared" % int(run.stage), EM))
	var head := MenuKit.label("Pick a boost", 1.45 * EM, 800, UiTheme.TEXT)
	MenuKit.text_shadow(head, 0.4)
	_main.add_child(head)
	var hint := MenuKit.label("It stays on your bot for the rest of this run.", 0.8 * EM, 550, UiTheme.TEXT_2)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size.x = 8.0 * EM
	_main.add_child(hint)
	var cards := HBoxContainer.new()
	cards.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	cards.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_main.add_child(cards)
	var i := 0
	for id in run.offer:
		var card := _boost_card(String(id), run.boosts.count(id))
		var r := Rise.wrap(card)
		r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cards.add_child(r)
		r.play(0.5, 0.08 + 0.09 * i, Vector2(0, 1.2 * EM), 0.85, Tween.TRANS_BACK)
		i += 1
	if not run.boosts.is_empty():
		_main.add_child(_held(run.boosts))


## A boost to pick: its rarity along the top, its icon, name and stat lines, and how many the run
## already holds.
func _boost_card(id: String, held: int) -> Button:
	var b := MenuKit.bare_button(0.95)
	b.name = "Boost_" + id
	var col := Gauntlet.tier_color(id)
	var def: Dictionary = Gauntlet.BOOSTS[id]
	var face := PanelContainer.new()
	var sb := MenuKit.box(Color(MenuKit.mix(col, Color(0.06, 0.07, 0.1), 0.12), 0.96), 16, [0.7 * EM, 0.7 * EM, 0.7 * EM, 0.75 * EM], Color(col, 0.75), 1)
	sb.border_width_top = 3
	sb.shadow_color = Color(col, 0.25)
	sb.shadow_size = 10
	face.add_theme_stylebox_override(&"panel", sb)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(round(0.3 * EM)))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.add_child(v)
	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tier := MenuKit.label(String(Gauntlet.TIER_NAME[int(def.tier)]).to_upper(), 0.62 * EM, 750, col, int(round(0.62 * EM * 0.14)))
	tier.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(tier)
	if held > 0:
		top.add_child(MenuKit.label("Held ×%d" % held, 0.62 * EM, 700, UiTheme.MUTED))
	v.add_child(top)
	var disc := PanelContainer.new()
	disc.add_theme_stylebox_override(&"panel", MenuKit.box(Color(col, 0.16), 999, [0.45 * EM, 0.45 * EM, 0.45 * EM, 0.45 * EM], Color(col, 0.5), 1))
	disc.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	disc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	disc.add_child(MenuKit.icon(String(def.icon), 1.6 * EM, col.lerp(Color.WHITE, 0.35)))
	v.add_child(disc)
	var nm := MenuKit.label(String(def.name), 0.92 * EM, 800, UiTheme.TEXT)
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	nm.custom_minimum_size.x = 5.0 * EM
	v.add_child(nm)
	for line in Gauntlet.lines(id):
		var bad := String(line).begins_with("−")
		var l := MenuKit.label(String(line), 0.74 * EM, 650, UiTheme.RED.lerp(Color.WHITE, 0.25) if bad else UiTheme.GREEN.lerp(Color.WHITE, 0.2))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size.x = 5.0 * EM
		v.add_child(l)
	b.add_child(face)
	var fit := func() -> void: b.custom_minimum_size = face.get_combined_minimum_size()
	face.minimum_size_changed.connect(fit)
	fit.call()
	b.pressed.connect(pick.bind(id))
	return b


## The run's boosts, as chips (a count on each held more than once).
func _held(ids: Array) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", int(round(0.35 * EM)))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(MenuKit.kicker("Your boosts · %d" % ids.size(), EM))
	var flow := HFlowContainer.new()
	flow.name = "Held"
	flow.add_theme_constant_override(&"h_separation", int(round(0.3 * EM)))
	flow.add_theme_constant_override(&"v_separation", int(round(0.3 * EM)))
	flow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for st in Gauntlet.stacks(ids):
		var id := String(st[0])
		var col := Gauntlet.tier_color(id)
		var fs := 0.74 * EM
		var p := MenuKit.pill(MenuKit.box(Color(col, 0.12), 999, [0.5 * fs, 0.22 * fs, 0.7 * fs, 0.22 * fs], Color(col, 0.45), 1), 0.3 * fs)
		p.tooltip_text = ", ".join(Gauntlet.lines(id))
		var r := p.get_node("Row")
		r.add_child(MenuKit.icon(String(Gauntlet.BOOSTS[id].icon), 1.15 * fs, col.lerp(Color.WHITE, 0.3)))
		r.add_child(MenuKit.label(String(Gauntlet.BOOSTS[id].name) + (" ×%d" % int(st[1]) if int(st[1]) > 1 else ""), fs, 700, UiTheme.TEXT))
		flow.add_child(p)
		if id == _picked:
			# the one just picked lands with a pop
			p.pivot_offset = p.get_combined_minimum_size() * 0.5
			p.scale = Vector2(1.35, 1.35)
			p.modulate = Color(1.6, 1.6, 1.6)
			var tw := p.create_tween().set_parallel()
			tw.tween_property(p, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			tw.tween_property(p, "modulate", Color.WHITE, 0.6)
	box.add_child(flow)
	return box


## Ready: the next rival, the run's boosts, Fight and Cash out.
func _show_next() -> void:
	var g: Dictionary = app.gauntlet
	var run: Dictionary = g.run
	var stage := Gauntlet.next_stage(g)
	var big := Gauntlet.boss(stage)
	var foe: Dictionary = Gauntlet.foe(g, app.player)
	Gauntlet.save_state(g)
	var bot = foe.bot
	_main.add_child(MenuKit.kicker(("Stage %d · Boss fight" if big else "Stage %d") % stage, EM))
	# the rival: name, then its style, threat, frame, boosts and venue
	var col := Color(1.0, 0.82, 0.5) if big else UiTheme.TEXT
	var nl := MenuKit.grad_label(String(bot.name_).to_upper(), 1.7 * EM, MenuKit.broadcast(400), col.lerp(Color.WHITE, 0.4), HOT if big else UiTheme.CYAN)
	nl.name = "Rival"
	nl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nl.clip_text = true
	nl.custom_minimum_size.x = 6.0 * EM
	MenuKit.text_shadow(nl, 0.4)
	_main.add_child(nl)
	if big:
		var t := MenuKit.label("“%s”" % String(Gauntlet.boss_def(stage).taunt), 0.9 * EM, 600, Color(1, 1, 1, 0.9))
		t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		t.custom_minimum_size.x = 8.0 * EM
		_main.add_child(t)
	var chips := HFlowContainer.new()
	chips.add_theme_constant_override(&"h_separation", int(round(0.3 * EM)))
	chips.add_theme_constant_override(&"v_separation", int(round(0.3 * EM)))
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := String(bot.get("style", ""))
	var sc := FightStyles.color(style)
	chips.add_child(_chip_tex(FightStyles.icon(style, 0.9 * EM), style, sc))
	var threat := Gauntlet.threat(stage)
	var tc := UiTheme.GREEN if threat == "Rusty" else UiTheme.CYAN if threat == "Fair" else GOLD if threat == "Tough" else HOT if threat == "Brutal" else UiTheme.RED
	chips.add_child(_chip("flame", "Threat: " + threat, tc))
	chips.add_child(_chip("bolt", "Power %d" % int(TItems.computeBuild(bot.loadout).rating), MenuKit.AMBER))
	var z := float(bot.get("size_", 1.0))
	if z != 1.0:
		chips.add_child(_chip("size", "%s frame" % HomeScreen.size_name(z), UiTheme.TEXT_2))
	var nb: int = foe.boosts.size()
	if nb > 0:
		chips.add_child(_chip("plus", "%d boost%s" % [nb, "" if nb == 1 else "s"], Color(0.76, 0.55, 1.0)))
	_main.add_child(chips)
	var venue := MenuKit.label("At %s · pays %s%s" % [Gauntlet.venue_name(Gauntlet.arena(stage)), TCareer.credits(Gauntlet.purse(stage)), (" + %d shards" % Gauntlet.shards(stage)) if big else ""], 0.78 * EM, 600, UiTheme.TEXT_2)
	venue.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	venue.custom_minimum_size.x = 8.0 * EM
	_main.add_child(venue)
	if not run.boosts.is_empty():
		_main.add_child(_held(run.boosts))
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fight_btn := _big_button("Fight", "swords")
	fight_btn.name = "Fight"
	fight_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fight_btn.pressed.connect(fight)
	row.add_child(fight_btn)
	var cash := UiTheme.button("Cash out %s" % TCareer.credits(int(run.bank)), "coin", &"Btn")
	cash.name = "CashOut"
	MenuKit.pad_button(cash, 0.9 * EM, 3.1 * 1.3 * EM)
	cash.disabled = int(run.bank) <= 0
	HomeScreen._dim(cash)
	cash.pressed.connect(cash_out)
	row.add_child(cash)
	_main.add_child(row)


func _bullet(icon_name: String, col: Color, text: String) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.55 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ic := MenuKit.icon(icon_name, 1.1 * EM, col)
	ic.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(ic)
	var l := MenuKit.label(text, 0.82 * EM, 550, UiTheme.TEXT_2)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size.x = 8.0 * EM
	row.add_child(l)
	return row


func _chip(icon_name: String, text: String, col: Color) -> Control:
	return _chip_tex(UiTheme.icon(icon_name, int(ceil(0.9 * EM))), text, col)


func _chip_tex(tex: Texture2D, text: String, col: Color) -> Control:
	var fs := 0.76 * EM
	var p := MenuKit.pill(MenuKit.box(Color(col, 0.12), 999, [0.55 * fs, 0.22 * fs, 0.75 * fs, 0.22 * fs], Color(col, 0.5), 1), 0.3 * fs)
	var r := p.get_node("Row")
	var t := TextureRect.new()
	t.texture = tex
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2.ONE * 1.15 * fs
	t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	t.modulate = col.lerp(Color.WHITE, 0.25)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.add_child(t)
	r.add_child(MenuKit.label(text, fs, 700, col.lerp(Color.WHITE, 0.5)))
	return p


func _big_button(text: String, icon_name: String) -> Button:
	var b := UiTheme.button(text, icon_name, &"BtnPrimary")
	var big := 1.3 * EM
	MenuKit.button_text(b, big, 750, 1.2 * big)
	MenuKit.pad_button(b, 2.0 * big, 3.1 * big)
	return b


# ------------------------------------------------------------------ actions

## Start run: a fresh run, its first rival up.
func start_run() -> void:
	app.tap("start")
	Gauntlet.start(app.gauntlet)
	Gauntlet.save_state(app.gauntlet)
	_picked = ""
	_show_all(true)


## Keep boost `id`: it pops into the run's boosts and the next rival comes up.
func pick(id: String) -> void:
	if not Gauntlet.pick(app.gauntlet, id):
		return
	_ding("chime1")
	_picked = id
	Gauntlet.save_state(app.gauntlet)
	_show_all(true)


## One of the vault's synthesized chimes (shared with the pilot's).
func _ding(id: String) -> void:
	var snd = PilotViews._sound(app)
	if snd != null:
		snd.play(id)


## Fight the next stage.
func fight() -> void:
	app.tap("start")
	app.start_gauntlet()


## Cash out (asked first): the bank comes home and the run ends.
func cash_out() -> void:
	var run = app.gauntlet.run
	if run == null or int(run.bank) <= 0:
		return
	app.tap("tap")
	var m := Modal.ask(app.ui, "Cash out?", "Take %s home and end this run at stage %d. Your best stays." % [TCareer.credits(int(run.bank)), int(run.stage)], [["cyan", "Keep going"], ["primary", "Cash out"]])
	var i: int = await m.picked
	if i != 1 or app.gauntlet.run == null:
		return
	var took := Gauntlet.cash_out(app.gauntlet)
	app.gauntlet_pay(took, 0)
	_ding("coin")
	_show_all(true)


## The run just ended by walking out of its fight (App._on_forfeit): the screen shows how it went.
func walked_out() -> void:
	if visible:
		_show_all(true)


# ------------------------------------------------------------------ screen

func _show_all(animate: bool) -> void:
	_show_ladder()
	_show_main(animate)
	_queue_layout()


func enter() -> void:
	_show_all(false)
	_layout()
	_ladder_rise.play(0.55, 0.0, Vector2(-1.4 * EM, 0))
	_main_rise.play(0.55, 0.08, Vector2(1.4 * EM, 0))


func refresh() -> void:
	if visible:
		_show_ladder()


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
	# side by side when there's room; stacked on a narrow (portrait) screen
	var wide := w >= 17.0 * EM + 0.9 * EM + 24.0 * EM
	_row.vertical = not wide
	_ladder_rise.custom_minimum_size.x = minf(17.0 * EM, w) if wide else minf(w, 30.0 * EM)
	_main_rise.custom_minimum_size.x = minf(w - 17.0 * EM - 0.9 * EM, 30.0 * EM) if wide else minf(w, 30.0 * EM)
	_scroll.position = Vector2(side, y0)
	_scroll.size = Vector2(w, size.y - y0 - bottom)
	_body.custom_minimum_size = Vector2(w, maxf(0.0, size.y - y0 - bottom))


## A stage's node on the ladder: the line through it, and a disc (green with a check when cleared,
## glowing cyan for the next fight, gold with a crown for a boss).
class Rung extends Control:
	var stage := 1
	## 0 cleared, 1 next, 2 ahead.
	var state := 2
	var boss := false
	var line_up := true
	var line_down := true
	var _t := 0.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(dt: float) -> void:
		if state == 1:
			_t += dt
			queue_redraw()

	func _draw() -> void:
		var c := Vector2(size.x * 0.5, size.y * 0.5)
		var r := minf(size.x, size.y) * (0.36 if boss or state == 1 else 0.3)
		var line := Color(1, 1, 1, 0.14)
		var done_line := Color(UiTheme.GREEN, 0.55)
		if line_up:
			draw_line(Vector2(c.x, 0), Vector2(c.x, c.y - r), line, 2.0)
		if line_down:
			draw_line(Vector2(c.x, c.y + r), Vector2(c.x, size.y), done_line if state <= 1 else line, 2.0)
		var gold := Color(1.0, 0.824, 0.29)
		var col := UiTheme.GREEN if state == 0 else UiTheme.CYAN if state == 1 else gold if boss else Color(0.6, 0.66, 0.78)
		if state == 1:
			var k := 0.5 + 0.5 * sin(_t * 3.2)
			draw_circle(c, r * (1.35 + 0.15 * k), Color(col, 0.12 + 0.1 * k))
		draw_circle(c, r, Color(MenuKit.mix(col, Color(0.04, 0.05, 0.08), 0.22 if state == 1 else 0.14), 1.0))
		draw_arc(c, r, 0.0, TAU, 36, Color(col, 0.95 if state <= 1 or boss else 0.5), 2.0 if state == 1 or boss else 1.5, true)
		var f := UiTheme.font(800)
		if state == 0:
			# a check
			var s := r * 0.5
			draw_polyline(PackedVector2Array([c + Vector2(-s, 0.05 * s), c + Vector2(-0.3 * s, 0.7 * s), c + Vector2(s, -0.6 * s)]), col, 2.2, true)
			return
		var txt := str(stage)
		var fs := int(round(r * (0.95 if txt.length() < 3 else 0.75)))
		var ts := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
		draw_string(f, c + Vector2(-ts.x * 0.5, f.get_ascent(fs) * 0.5 - f.get_descent(fs) * 0.35), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE if state == 1 else col.lerp(Color.WHITE, 0.3))
		if boss:
			# a small crown over the disc
			var w := r * 0.9
			var y := c.y - r - 0.15 * r
			var pts := PackedVector2Array([Vector2(c.x - w * 0.5, y), Vector2(c.x - w * 0.5, y - w * 0.42), Vector2(c.x - w * 0.22, y - w * 0.18), Vector2(c.x, y - w * 0.5), Vector2(c.x + w * 0.22, y - w * 0.18), Vector2(c.x + w * 0.5, y - w * 0.42), Vector2(c.x + w * 0.5, y)])
			draw_colored_polygon(pts, gold)
