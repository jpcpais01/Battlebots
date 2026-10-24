## The League's screen (app/league/league.gd), over the ring where the next rival waits with the
## menu camera turning round them. Left, the table: the top three always, then the places round
## the player (their row lit cyan, the next rival's outlined, the Nemesis marked); any rival the
## player can pick is a button. Right, the next fight: who (their name, pilot, temper, what they
## say), the stakes, the score between them, Fight; then the League's news, the season and the
## Hall of Champions. A season that ended since the last look is shown once on top.
class_name LeagueScreen
extends AppScreen

const EM := UiTheme.EM
const GOLD := League.GOLD
const RIVAL := League.RIVAL
const ORANGE := Color(1.0, 0.55, 0.2)
## Places shown above and below the player (with the top three always there).
const ABOVE := 4
const BELOW := 3

var _wash := TextureRect.new()
var _top := HBoxContainer.new()
var _rank_chip: Label
var _season_chip: Label
var _scroll := ScrollContainer.new()
var _body := VBoxContainer.new()
var _row := BoxContainer.new()
var _table := VBoxContainer.new()
var _table_rise: Rise
var _main := VBoxContainer.new()
var _main_rise: Rise
var _rows := VBoxContainer.new()
var _foot: Label
## The rival on show in the ring (their id), so a new pick swaps the bot.
var _shown := -1


func _ready() -> void:
	_build()
	resized.connect(_layout)
	_body.minimum_size_changed.connect(_queue_layout)


# ------------------------------------------------------------------ building

func _build() -> void:
	# a gold and midnight wash over the ring: the panels read, the rival still shows round them
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.55, 1.0])
	g.colors = PackedColorArray([Color(0.05, 0.04, 0.02, 0.66), Color(0.02, 0.03, 0.06, 0.42), Color(0.02, 0.02, 0.05, 0.8)])
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
	# the top bar: home, the title, the player's rank, the season
	_top.add_theme_constant_override(&"separation", int(0.9 * EM))
	_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_top)
	var home := MenuKit.edge_pill("home", "Home", EM)
	home.name = "Home"
	home.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	_top.add_child(home)
	var title := MenuKit.grad_label("LEAGUE", 1.55 * EM, MenuKit.broadcast(400), Color(1.0, 0.94, 0.72), GOLD)
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	MenuKit.text_shadow(title, 0.45)
	_top.add_child(title)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top.add_child(gap)
	var sc := MenuKit.pill(MenuKit.box(MenuKit.PILL_BG, 999, [0.8 * EM, 0.35 * EM, 0.9 * EM, 0.35 * EM], UiTheme.LINE, 1), 0.45 * EM)
	sc.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sc.get_node("Row").add_child(MenuKit.icon("sun", 1.0 * EM, UiTheme.CYAN))
	_season_chip = MenuKit.label("", 0.8 * EM, 650, UiTheme.TEXT_2)
	sc.get_node("Row").add_child(_season_chip)
	_top.add_child(sc)
	var rc := MenuKit.pill(MenuKit.box(Color(GOLD, 0.12), 999, [0.8 * EM, 0.35 * EM, 0.9 * EM, 0.35 * EM], Color(GOLD, 0.45), 1), 0.45 * EM)
	rc.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	rc.get_node("Row").add_child(CareerKit.icon(League.SVG, 1.1 * EM, GOLD))
	_rank_chip = MenuKit.label("", 0.85 * EM, 750, Color(1.0, 0.9, 0.62))
	_rank_chip.name = "Rank"
	rc.get_node("Row").add_child(_rank_chip)
	_top.add_child(rc)

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

	# the table
	var tp := _panel(GOLD)
	var tv: VBoxContainer = tp[1]
	tv.add_child(MenuKit.kicker("The table", EM))
	_rows.add_theme_constant_override(&"separation", int(round(0.22 * EM)))
	_rows.mouse_filter = Control.MOUSE_FILTER_PASS
	tv.add_child(_rows)
	_foot = MenuKit.label("", 0.72 * EM, 600, UiTheme.MUTED)
	_foot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_foot.custom_minimum_size.x = 6.0 * EM
	tv.add_child(_foot)
	_table_rise = Rise.wrap(tp[0])
	_row.add_child(_table_rise)

	# the next fight, the news, the season
	var mp := _panel(UiTheme.CYAN)
	var mv: VBoxContainer = mp[1]
	_main.add_theme_constant_override(&"separation", int(round(0.6 * EM)))
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
	pad.mouse_filter = Control.MOUSE_FILTER_PASS
	for k in [["left", 0.9], ["top", 0.95], ["right", 0.9], ["bottom", 0.9]]:
		pad.add_theme_constant_override("margin_" + k[0], int(round(k[1] * EM)))
	p.add_child(pad)
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(round(0.55 * EM)))
	v.mouse_filter = Control.MOUSE_FILTER_PASS
	pad.add_child(v)
	return [p, v]


# ------------------------------------------------------------------ the table

## The ranks the table shows: the top three, then ABOVE over the player to BELOW under (all of it
## in one run when the player is near the top). 0 marks a gap.
static func window(me: int) -> Array:
	var lo := maxi(1, me - ABOVE)
	var hi := mini(League.PILOTS + 1, me + BELOW)
	# (at least nine rows round the player when there's room)
	if hi - lo < ABOVE + BELOW:
		lo = maxi(1, hi - ABOVE - BELOW)
		hi = mini(League.PILOTS + 1, lo + ABOVE + BELOW)
	var out := []
	if lo > 4:
		out.append_array([1, 2, 3, 0])
	else:
		lo = 1
	for r in range(lo, hi + 1):
		out.append(r)
	return out


func _show_table() -> void:
	var g: Dictionary = app.league
	for c in _rows.get_children():
		c.queue_free()
	var me := League.me(g)
	var nf: Dictionary = League.next_foe(g)
	var nem := League.nemesis(g)
	for r in window(me):
		if r == 0:
			var dots := MenuKit.label("· · ·", 0.8 * EM, 700, UiTheme.MUTED)
			dots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			_rows.add_child(dots)
			continue
		_rows.add_child(_table_row(g, r, int(nf.id), nem))
	var bits := []
	if int(g.best) <= League.PILOTS:
		bits.append("Best ever #%d" % int(g.best))
	if int(g.titles) > 0:
		bits.append("%d title%s" % [int(g.titles), "" if int(g.titles) == 1 else "s"])
	if int(g.defences) > 0:
		bits.append("%d defence%s" % [int(g.defences), "" if int(g.defences) == 1 else "s"])
	_foot.text = " · ".join(bits) if not bits.is_empty() else "Beat a rival ranked above you to take their place."
	_rank_chip.text = League.rank_text(me, true)
	_season_chip.text = "Season %d · %s left" % [League.season_no(int(g.season)), League.left_words()]


## One place on the table: the rank (a crown on #1), the bot's paint, its name and its pilot, the
## score with the player; lit for the player, outlined for the next rival, a button when it can
## be picked.
func _table_row(g: Dictionary, rank: int, next_id: int, nem: int) -> Control:
	var id := League.at(g, rank)
	var you := id == League.YOU
	var nxt := id == next_id
	var pick := not you and not nxt and League.can_pick(g, id)
	var p = null if you else League.pilot(g, id)
	var bot = app.player if you else p.bot
	var face := PanelContainer.new()
	var bg := Color(UiTheme.CYAN, 0.16) if you else Color(ORANGE, 0.1) if nxt else Color(1, 1, 1, 0.035)
	var edge := Color(UiTheme.CYAN, 0.6) if you else Color(ORANGE, 0.8) if nxt else Color(1, 1, 1, 0.14) if pick else Color(0, 0, 0, 0)
	face.add_theme_stylebox_override(&"panel", MenuKit.box(bg, 12, [0.5 * EM, 0.32 * EM, 0.6 * EM, 0.32 * EM], edge, 1 if edge.a > 0.0 else 0))
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.add_child(row)
	# the rank
	var rk := HBoxContainer.new()
	rk.custom_minimum_size.x = 2.0 * EM
	rk.alignment = BoxContainer.ALIGNMENT_END
	rk.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if rank == 1:
		rk.add_child(MenuKit.icon("crown", 1.05 * EM, GOLD))
	else:
		var rc := GOLD.lerp(Color.WHITE, 0.45) if rank <= 3 else UiTheme.TEXT if you else UiTheme.TEXT_2
		rk.add_child(MenuKit.label(str(rank), 0.92 * EM, 800, rc))
	row.add_child(rk)
	# the paint
	var sw := Panel.new()
	var paint := MenuKit.hex(bot.paint.primary)
	var ss := MenuKit.box(paint, 99, [0, 0, 0, 0], MenuKit.hex(bot.paint.secondary), 2)
	sw.add_theme_stylebox_override(&"panel", ss)
	sw.custom_minimum_size = Vector2.ONE * 0.85 * EM
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(sw)
	# the bot and its pilot
	var col := VBoxContainer.new()
	col.add_theme_constant_override(&"separation", 0)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var nm := MenuKit.label(String(bot.name_), 0.86 * EM, 750, UiTheme.TEXT if you or nxt or rank == 1 else MenuKit.mix(UiTheme.TEXT, UiTheme.TEXT_2, 0.4))
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nm.custom_minimum_size.x = 4.0 * EM
	col.add_child(nm)
	var sub := "You · Lv %d" % int(app.pilot.get("level", 1)) if you else "%s · %s" % [String(p.pname), String(League.PERSONAS[String(p.temper)].name)]
	var sl := MenuKit.label(sub, 0.64 * EM, 600, UiTheme.CYAN if you else UiTheme.MUTED)
	sl.clip_text = true
	sl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	sl.custom_minimum_size.x = 4.0 * EM
	col.add_child(sl)
	row.add_child(col)
	# what marks them: next up (its outline says so too), the Nemesis
	if nxt and id != nem:
		row.add_child(_tag("NEXT", ORANGE))
	if id == nem:
		row.add_child(_tag("NEMESIS", RIVAL))
	# the score with them
	if not you and int(p.w) + int(p.l) + int(p.d) > 0:
		var sc := MenuKit.label("%d–%d" % [int(p.w), int(p.l)], 0.74 * EM, 750, UiTheme.GREEN if int(p.w) > int(p.l) else RIVAL.lerp(Color.WHITE, 0.2) if int(p.l) > int(p.w) else UiTheme.TEXT_2)
		sc.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(sc)
	if not pick:
		face.name = "Row%d" % rank
		return face
	var b := MenuKit.bare_button(0.97)
	b.name = "Pick%d" % rank
	b.tooltip_text = "Fight %s next" % String(bot.name_)
	face.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(face)
	var fit := func() -> void: b.custom_minimum_size = face.get_combined_minimum_size()
	face.minimum_size_changed.connect(fit)
	fit.call()
	b.pressed.connect(pick_rival.bind(id))
	return b


func _tag(text: String, col: Color) -> Control:
	var fs := 0.56 * EM
	var p := MenuKit.pill(MenuKit.box(Color(col, 0.18), 999, [0.5 * fs, 0.12 * fs, 0.5 * fs, 0.12 * fs], Color(col, 0.6), 1), 0)
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	p.get_node("Row").add_child(MenuKit.label(text, fs, 800, col.lerp(Color.WHITE, 0.35), int(round(fs * 0.12))))
	return p


# ------------------------------------------------------------------ the next fight

func _show_main(animate: bool) -> void:
	for c in _main.get_children():
		c.queue_free()
	var g: Dictionary = app.league
	if g.ended != null and not g.ended.seen:
		_main.add_child(_season_over(g.ended))
	_show_next(g)
	_main.add_child(_news(g))
	if animate:
		_main_rise.play(0.45, 0.0, Vector2(0.9 * EM, 0), 0.98)


## The season that just ended: where the player finished, their best, what it paid.
func _season_over(e: Dictionary) -> Control:
	var box := PanelContainer.new()
	box.name = "SeasonOver"
	box.add_theme_stylebox_override(&"panel", MenuKit.box(Color(GOLD, 0.1), 14, [0.85 * EM, 0.6 * EM, 0.85 * EM, 0.65 * EM], Color(GOLD, 0.45), 1))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(round(0.25 * EM)))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(v)
	v.add_child(MenuKit.label("Season %d is over" % int(e.season), 0.95 * EM, 800, GOLD.lerp(Color.WHITE, 0.3)))
	var words := "You finished %s, your best %s." % [League.rank_text(int(e.rank), true).replace("Champion", "as Champion"), League.rank_text(int(e.best))]
	if int(e.shards) > 0:
		words += " +%d Skin Vault shards." % int(e.shards)
	var l := MenuKit.label(words, 0.8 * EM, 600, UiTheme.TEXT_2)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = 8.0 * EM
	v.add_child(l)
	var l2 := MenuKit.label("A new season: everyone's back in the hunt, and you start %d places lower." % League.SEASON_DROP, 0.74 * EM, 550, UiTheme.MUTED)
	l2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l2.custom_minimum_size.x = 8.0 * EM
	v.add_child(l2)
	return box


## Who's next: the kind of fight, their name, pilot and temper, what they say, their style,
## threat, power, frame and the score; what a win and a loss would do; Fight.
func _show_next(g: Dictionary) -> void:
	var nf: Dictionary = League.next_foe(g)
	var id := int(nf.id)
	var p := League.pilot(g, id)
	var bot = p.bot
	var r := League.rank_of(g, id)
	var nem := League.nemesis(g) == id
	var kind := String(nf.kind)
	var kick := "%s · %s" % [League.KIND_WORDS.get(kind, "Next fight"), League.rank_text(r, true)]
	if kind == "callout":
		kick = "Callout · %s wants a rematch" % League.rank_text(r)
	_main.add_child(MenuKit.kicker(kick, EM))
	var hot := RIVAL if nem else GOLD if r == 1 or kind == "defence" else UiTheme.CYAN
	var nl := MenuKit.grad_label(String(bot.name_).to_upper(), 1.7 * EM, MenuKit.broadcast(400), Color(1, 1, 1).lerp(hot, 0.15), hot)
	nl.name = "Rival"
	nl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nl.clip_text = true
	nl.custom_minimum_size.x = 6.0 * EM
	MenuKit.text_shadow(nl, 0.4)
	_main.add_child(nl)
	var who := MenuKit.label("Piloted by %s of %s · %s" % [String(p.pname), String(p.home), String(League.PERSONAS[String(p.temper)].name)], 0.78 * EM, 600, UiTheme.TEXT_2)
	who.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	who.custom_minimum_size.x = 8.0 * EM
	_main.add_child(who)
	var t := MenuKit.label("“%s”" % League.taunt(g, id, String(app.player.name_)), 0.92 * EM, 600, Color(1, 1, 1, 0.92))
	t.name = "Taunt"
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	t.custom_minimum_size.x = 8.0 * EM
	_main.add_child(t)
	var chips := HFlowContainer.new()
	chips.add_theme_constant_override(&"h_separation", int(round(0.3 * EM)))
	chips.add_theme_constant_override(&"v_separation", int(round(0.3 * EM)))
	chips.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if nem:
		chips.add_child(_chip("flame", "Your Nemesis", RIVAL))
	var style := String(bot.get("style", ""))
	if FightStyles.index(style) >= 0:
		chips.add_child(_chip_tex(FightStyles.icon(style, 0.9 * EM), style, FightStyles.color(style)))
	chips.add_child(_chip("flame", "Threat: " + League.threat(r), League.threat_color(r)))
	chips.add_child(_chip("bolt", "Power %d" % int(TItems.computeBuild(bot.loadout).rating), MenuKit.AMBER))
	var z := float(bot.get("size_", 1.0))
	if z != 1.0:
		chips.add_child(_chip("size", "%s frame" % HomeScreen.size_name(z), UiTheme.TEXT_2))
	var wl := int(p.w) - int(p.l)
	chips.add_child(_chip("swords", League.score_words(p), UiTheme.GREEN if wl > 0 else RIVAL if wl < 0 else UiTheme.TEXT_2))
	_main.add_child(chips)
	# the stakes
	var st := League.stakes(g, nf)
	var stakes := HBoxContainer.new()
	stakes.add_theme_constant_override(&"separation", int(round(0.4 * EM)))
	stakes.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stakes.add_child(_stake("Win", String(st[0]), UiTheme.GREEN))
	stakes.add_child(_stake("Lose", String(st[1]), RIVAL))
	_main.add_child(stakes)
	var fight_btn := UiTheme.button("Fight", "swords", &"BtnPrimary")
	var big := 1.3 * EM
	MenuKit.button_text(fight_btn, big, 750, 1.2 * big)
	MenuKit.pad_button(fight_btn, 2.0 * big, 3.1 * big)
	fight_btn.name = "Fight"
	fight_btn.pressed.connect(fight)
	_main.add_child(fight_btn)
	var me := League.me(g)
	var hint := "Tap a rival on the table to fight them instead: up to %d places above you, or one who beat you last time." % League.REACH
	if me == 1:
		hint = "You hold the belt. Every fight is a title defence: pick any of the next %d challengers." % League.REACH
	var hl := MenuKit.label(hint, 0.7 * EM, 550, UiTheme.MUTED)
	hl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hl.custom_minimum_size.x = 8.0 * EM
	_main.add_child(hl)


func _stake(head: String, text: String, col: Color) -> Control:
	var box := PanelContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_theme_stylebox_override(&"panel", MenuKit.box(Color(col, 0.08), 12, [0.6 * EM, 0.35 * EM, 0.6 * EM, 0.4 * EM], Color(col, 0.3), 1))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", 0)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(v)
	v.add_child(MenuKit.label(head.to_upper(), 0.58 * EM, 800, col.lerp(Color.WHITE, 0.2), int(round(0.58 * EM * 0.14))))
	var l := MenuKit.label(text, 0.84 * EM, 750, UiTheme.TEXT)
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.custom_minimum_size.x = 3.0 * EM
	v.add_child(l)
	return box


## The League's news (newest first), the season and the Hall of Champions.
func _news(g: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.name = "News"
	box.add_theme_constant_override(&"separation", int(round(0.3 * EM)))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rule := ColorRect.new()
	rule.color = UiTheme.LINE
	rule.custom_minimum_size.y = 1
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(rule)
	box.add_child(MenuKit.kicker("League news", EM))
	var items: Array = g.news.slice(0, 5)
	if items.is_empty():
		items = [{"t": "A new season. Twenty pilots, one belt. You start at the bottom.", "k": "season"}]
	for n in items:
		var k := String(n.k)
		var ic := "crown" if k == "title" else "sun" if k == "season" else "swords" if k == "you" else "globe"
		var c := GOLD if k == "title" else UiTheme.CYAN if k == "you" else UiTheme.MUTED
		box.add_child(_line(ic, c, String(n.t), UiTheme.TEXT_2 if k == "you" or k == "title" else UiTheme.MUTED))
	if not g.champs.is_empty():
		var bits := []
		for ch in g.champs.slice(0, 3):
			bits.append("S%d %s" % [int(ch.season), "You" if ch.you else String(ch.who)])
		box.add_child(_line("trophy", GOLD, "Hall of Champions: " + " · ".join(bits), UiTheme.MUTED))
	return box


func _line(icon_name: String, col: Color, text: String, text_col: Color) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ic := MenuKit.icon(icon_name, 0.9 * EM, col)
	ic.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	row.add_child(ic)
	var l := MenuKit.label(text, 0.74 * EM, 550, text_col)
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


# ------------------------------------------------------------------ actions

## Pick `id` to fight next: the table and the card follow, and they step into the ring.
func pick_rival(id: int) -> void:
	if not League.choose(app.league, id):
		return
	app.tap("select")
	League.save_state(app.league)
	_show_all(true)


## Fight the next rival (App.start_fight takes them off the League).
func fight() -> void:
	app.fight(false, false)


## The next rival in the ring, turning on the menu camera (a new pick swaps them in).
func _show_rival() -> void:
	var g: Dictionary = app.league
	var id := int(League.next_foe(g).id)
	if id == _shown:
		return
	_shown = id
	var b := League.bot_for(g, id, app.player)
	b.erase("boost")
	app.game.show_bot(b)


# ------------------------------------------------------------------ screen

func _show_all(animate: bool) -> void:
	_show_table()
	_show_main(animate)
	_show_rival()
	_queue_layout()


func enter() -> void:
	# (a new week since the app opened: the season rolls over now)
	app.league_season()
	_shown = -1
	_show_all(false)
	# the season that ended is shown this once
	if app.league.ended != null and not app.league.ended.seen:
		app.league.ended.seen = true
	League.save_state(app.league)
	_layout()
	_table_rise.play(0.55, 0.0, Vector2(-1.4 * EM, 0))
	_main_rise.play(0.55, 0.08, Vector2(1.4 * EM, 0))


func exit() -> void:
	_shown = -1


func refresh() -> void:
	if visible:
		_show_table()


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
	var tw := 17.5 * EM
	var wide := w >= tw + 0.9 * EM + 22.0 * EM
	_row.vertical = not wide
	_table_rise.custom_minimum_size.x = minf(tw, w) if wide else minf(w, 30.0 * EM)
	_main_rise.custom_minimum_size.x = minf(w - tw - 0.9 * EM, 28.0 * EM) if wide else minf(w, 30.0 * EM)
	_scroll.position = Vector2(side, y0)
	_scroll.size = Vector2(w, size.y - y0 - bottom)
	_body.custom_minimum_size = Vector2(w, maxf(0.0, size.y - y0 - bottom))
