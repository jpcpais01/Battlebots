## The fight's results (src/ui/app.ts showResults; style.css .results, .res-card, .verdict,
## .stats-table, .results .actions): one card on the right, the winner celebrating on the left
## behind a darkening wash. The kicker (the fight's length, or the event and round), the verdict
## (VICTORY, DEFEAT, DRAW, CUP WINNER or CHAMPION), who won and how, both bots' numbers side by
## side with the better one lit and a bar under each line split in the bots' colours, a map
## event's prize money (the career's reward view), and what to do next.
##
## An online fight's card (info.net) offers a rematch through the room instead, both players voting
## (app.ts netResults).
##
## Every fight's card (and a replay's) offers it again: Replay, and Save replay onto the shelf
## (app.ts keep, saveReplayBtn). A replay's card shows the numbers its tape kept (info.m is
## ReplayTape.summary's copy of the match) and counts nothing.
##
## The App makes one per fight (App._show_results) and calls show_results(info); App.close_results
## frees it.
class_name ResultsView
extends Control

const CAREER_VIEWS := "res://app/career/career_views.gd"
const EM := UiTheme.EM

var app
var info := {}
var _card := PanelContainer.new()
var _rise: Rise
var _scroll := ScrollContainer.new()
var _col := VBoxContainer.new()
var _wash := TextureRect.new()
## Online: the Rematch button and the line over it (sync_net).
var _rematch: Button
var _net_note: Label


func _init() -> void:
	theme = UiTheme.theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# .results: linear-gradient(90deg, transparent 30%, rgba(5,7,12,0.55) 62%, rgba(5,7,12,0.8))
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.3, 0.62, 1.0])
	g.colors = PackedColorArray([Color(0.02, 0.027, 0.047, 0), Color(0.02, 0.027, 0.047, 0), Color(0.02, 0.027, 0.047, 0.55), Color(0.02, 0.027, 0.047, 0.8)])
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
	# .res-card: the solid card, rounded 24, a hairline, a deep shadow
	var sb := MenuKit.box(UiTheme.PANEL_2, 24, [1.15 * EM, 1.05 * EM, 1.15 * EM, 1.1 * EM], UiTheme.LINE, 1)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 25
	sb.shadow_offset = Vector2(0, 18)
	_card.add_theme_stylebox_override(&"panel", sb)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	# (scrollbar-width: none)
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_card.add_child(_scroll)
	_col.add_theme_constant_override(&"separation", int(round(0.8 * EM)))
	_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_col)
	_rise = Rise.wrap(_card)
	add_child(_rise)
	resized.connect(_layout)
	_col.minimum_size_changed.connect(_layout.call_deferred)


## Build the card for a finished fight. `info`: {m, me, winner, won, draw, kind, event} with event
## null or {e, round, title, reward} (App._show_results); a tag team fight adds teams (the teams'
## names, ours first); tape, the fight's tape for Replay and Save replay; replay, it's a replay's.
func show_results(info_: Dictionary) -> void:
	info = info_
	var m = info.m
	var tag: bool = m.tag != null
	var teams: Array = info.get("teams", ["", ""])
	# (a tag team fight: each team's numbers together, under its name)
	var a = team_stats(m, 0, teams[0]) if tag else m.fighters[0]
	var b = team_stats(m, 1, teams[1]) if tag else m.fighters[1]
	var ev = info.get("event")
	var won: bool = info.won
	var draw: bool = info.draw
	var winner: int = info.winner
	var kind = info.kind
	var title: bool = ev != null and ev.title
	var verdict := ("CUP WINNER" if ev.e.kind == "cup" else "CHAMPION") if title else "DRAW" if draw else "VICTORY" if won else "DEFEAT"
	if tag and not draw:
		verdict = "TEAM " + verdict
	var kicker := ""
	if ev != null:
		var n: int = ev.e.rivals.size()
		var rd := int(ev.round)
		kicker = "%s · %s" % [ev.e.name_, "Final" if rd == n - 1 else "Round %d of %d" % [rd + 1, n]]
	elif tag:
		kicker = "Tag team · %d seconds" % roundi(float(m.fightTime))
	elif info.has("net"):
		kicker = "Online · %d seconds" % roundi(float(m.fightTime))
	else:
		kicker = "%d seconds" % roundi(float(m.fightTime))
	var how := {"Decision": "on points", "TKO": "by TKO", "KO": "by knockout", "Dismantled": "by tearing it apart"}.get(str(kind) if kind != null else "", "")
	var who := "Split down the middle" if draw else "[color=#ffffff][b]%s[/b][/color] wins %s" % [_esc(m.fighters[winner].name_), how]
	if tag and not draw:
		var team: String = teams[winner] if String(teams[winner]) != "" else "%s's team" % m.fighters[winner].name_
		who = "[color=#ffffff][b]%s[/b][/color] win it %s, [b]%s[/b] landing the last blow" % [_esc(team), how, _esc(m.fighters[winner].name_)]
	var ca := bar_colors(m.specs[0].paint)[0]
	var cb := bar_colors(m.specs[1].paint)[0]

	# the head: kicker, verdict, who and how
	var head := VBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(round(0.2 * EM)))
	head.add_child(MenuKit.kicker(kicker, EM))
	var vpx := 2.6 * EM
	var lose := not won and not draw
	var v := MenuKit.grad_label(verdict, vpx, UiTheme.font(850, -1), MenuKit.css("#e3e9f5") if lose else MenuKit.css("#ffd27a"), MenuKit.css("#8e9ab3") if lose else MenuKit.css("#ff7a1a"))
	v.name = "Verdict"
	# (line-height 1: the box no taller than the type)
	v.custom_minimum_size.y = vpx
	v.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(v)
	var w := RichTextLabel.new()
	w.bbcode_enabled = true
	w.fit_content = true
	w.scroll_active = false
	w.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	w.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var wpx := int(round(0.95 * EM))
	w.add_theme_font_override(&"normal_font", UiTheme.font(500))
	w.add_theme_font_override(&"bold_font", UiTheme.font(750))
	w.add_theme_font_size_override(&"normal_font_size", wpx)
	w.add_theme_font_size_override(&"bold_font_size", wpx)
	w.add_theme_color_override(&"default_color", UiTheme.TEXT_2)
	w.text = who
	w.name = "Who"
	head.add_child(w)
	_col.add_child(head)

	# a tag team fight: both teams' bots, how each came out of it, and the tags
	if tag:
		_col.add_child(_roster(m, teams))
	# the stats, side by side
	_col.add_child(_stats(a, b, ca, cb))

	# a map event's pay (career mode's own view, when it's there)
	if ev != null and ev.reward != null and ResourceLoader.exists(CAREER_VIEWS):
		var cv = load(CAREER_VIEWS)
		if cv != null and cv.has_method("reward_view"):
			var rival = ev.e.rivals[int(ev.round)]
			var on_change := func() -> void: app.changed.emit()
			var view = cv.reward_view(app, ev.reward, rival, lose, on_change)
			if view is Control:
				_col.add_child(view)

	_col.add_child(_net_actions() if info.has("net") else _actions(ev, won, draw))
	_layout()
	# .results fadeIn 0.5s; .res-card cardIn 0.55s 0.1s, from 1.5em to the right
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.5)
	_rise.play(0.55, 0.1, Vector2(1.5 * EM, 0))


## What to do next: the next fight and a rematch, or the event's next round, starting it over,
## fighting it again or the map; then the garage and home.
func _actions(ev, won: bool, draw: bool) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	var primary: Button
	if ev != null:
		var e = ev.e
		var next := int(TEvents.progressOf(app.record.events, e.id).run)
		if ev.title:
			primary = _btn("Map", "map", &"BtnPrimary", _to_map)
		else:
			var n: int = e.rivals.size()
			var label := "Fight again" if draw else ("%s: %s" % ["Final" if next == n - 1 else "Round %d" % (next + 1), e.rivals[next].name_]) if won else "Start over"
			primary = _btn(label, "swords", &"BtnPrimary", func() -> void: app.fight_event(e))
			row.add_child(_btn("Map", "map", &"Btn", _to_map))
	elif info.m.tag != null:
		# tag team again: new rivals, the same ones, or back to the team sheet
		primary = _btn("Next fight", "swords", &"BtnPrimary", func() -> void: app.tag_fight(false))
		row.add_child(_btn("Rematch", "refresh", &"Btn", func() -> void: app.tag_fight(true)))
	else:
		# (after a titan battle, titans again)
		var titans: bool = app.titan_run
		primary = _btn("Next fight", "swords", &"BtnPrimary", func() -> void: app.fight(false, titans))
		row.add_child(_btn("Rematch", "refresh", &"Btn", func() -> void: app.fight(true, titans)))
	primary.name = "Primary"
	box.add_child(primary)
	var keep := _keep_row()
	if keep != null:
		box.add_child(keep)
	if info.m.tag != null and app.screens.has("tagteam"):
		var team := _btn("Team", "", &"Btn", func() -> void:
			app.tap("select")
			app.close_results()
			app.go("tagteam"))
		var ic := team.find_child("Icon", true, false) as TextureRect
		ic.texture = CareerKit.svg(TagTeamScreen.TEAM_SVG, 19)
		ic.visible = true
		row.add_child(team)
	else:
		var garage := _btn("Garage", "wrench", &"Btn", func() -> void:
			app.tap("select")
			app.close_results()
			app.go("garage"))
		garage.disabled = not app.screens.has("garage")
		row.add_child(garage)
	var home := _btn("Home", "home", &"BtnSmall", func() -> void:
		app.tap("back")
		app.close_results()
		app.go("home"))
	home.name = "Home"
	# (.btn.small: flex none, 0.86em)
	home.size_flags_horizontal = Control.SIZE_SHRINK_END
	row.add_child(home)
	box.add_child(row)
	return box


## Online (app.ts netResults): a rematch both players vote for, the room, and leaving it. The line
## over them says how the vote stands, or that the other player left.
func _net_actions() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	if info.get("drifted", false):
		var d := MenuKit.label("Your screens drifted apart, so the host's result counts.", 0.86 * EM, 600, UiTheme.TEXT_2)
		d.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d.custom_minimum_size.x = 10.0 * EM
		box.add_child(d)
	_net_note = MenuKit.label("", 0.9 * EM, 650, Color(1.0, 0.82, 0.48))
	_net_note.name = "NetNote"
	_net_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_net_note.custom_minimum_size.x = 10.0 * EM
	box.add_child(_net_note)
	_rematch = _btn("Rematch", "swords", &"BtnPrimary", func() -> void:
		var s = info.get("net")
		if is_instance_valid(s):
			app.tap("select")
			s.vote_rematch())
	_rematch.name = "Primary"
	box.add_child(_rematch)
	var keep := _keep_row()
	if keep != null:
		box.add_child(keep)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	var room := _btn("Room", "globe", &"Btn", func() -> void:
		app.tap("select")
		app.close_results()
		app.go(app.back_to()))
	room.name = "Room"
	row.add_child(room)
	var leave := _btn("Leave room", "exit", &"BtnSmall", func() -> void:
		app.tap("back")
		app.close_results()
		app.go("home"))
	leave.name = "Home"
	leave.size_flags_horizontal = Control.SIZE_SHRINK_END
	row.add_child(leave)
	box.add_child(row)
	sync_net()
	return box


## The room changed (a vote, the other player leaving): the Rematch button and its line follow it.
func sync_net() -> void:
	if _rematch == null:
		return
	var s = info.get("net")
	var them := String(info.m.specs[1 - int(info.me)].name_)
	if not is_instance_valid(s) or app.net != s or not s.connected:
		_rematch.disabled = true
		UiTheme.set_button(_rematch, "Rematch", "swords")
		_net_note.text = "%s left the room." % them
		_net_note.visible = true
		return
	var mine: bool = s.rematch[s.me]
	var theirs: bool = s.rematch[1 - s.me]
	_rematch.disabled = mine
	UiTheme.set_button(_rematch, "Ready" if mine else "Rematch", "swords")
	_net_note.text = "%s wants a rematch!" % them if theirs and not mine else "Waiting for %s…" % them if mine else ""
	_net_note.visible = _net_note.text != ""


## Replay (the fight again, from the walkout) and Save replay (Saved once it's on the shelf; a
## full shelf says so) (app.ts keep, saveReplayBtn). Null without a tape to play.
func _keep_row() -> Control:
	var t = info.get("tape")
	if not t is Dictionary or int(t.end) <= 0:
		return null
	var row := HBoxContainer.new()
	row.name = "Keep"
	row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	var again := _btn("Replay", "replay", &"Btn", func() -> void: app.replay())
	again.name = "Replay"
	row.add_child(again)
	var how := {"winner": int(info.winner), "kind": str(info.kind) if info.kind != null else "", "secs": roundi(float(info.m.fightTime))}
	# (lambdas capture by value: the button through this holder)
	var hold: Array[Button] = [null]
	var mark := func() -> void:
		var saved := ReplayShelf.is_saved(t)
		UiTheme.set_button(hold[0], "Saved" if saved else "Save replay", "check" if saved else "star")
		hold[0].disabled = saved
	var save := _btn("Save replay", "star", &"Btn", func() -> void:
		if hold[0].disabled:
			return
		app.tap("select")
		if not ReplayShelf.save(t, how):
			Modal.ask(app.ui, "Replays full", "You can keep %d replays. Delete one from Replays on the home screen to save this fight." % ReplayShelf.MAX, [["cyan", "OK"]])
			return
		mark.call())
	hold[0] = save
	save.name = "SaveReplay"
	row.add_child(save)
	mark.call()
	return row


func _btn(text: String, icon_name: String, variant: StringName, on: Callable) -> Button:
	var b := UiTheme.button(text, icon_name, variant)
	b.pressed.connect(on)
	if variant != &"BtnSmall":
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	else:
		MenuKit.button_text(b, 0.86 * EM, 700, 1.2 * 0.86 * EM)
		MenuKit.pad_button(b, 1.1 * 0.86 * EM)
	return b


## The Skip button while the loser is carried out (app.ts queueResults .skip-ride): small,
## bottom centre, fading in after a moment. App adds it to its UI layer and drops it.
static func skip_button(app_) -> Button:
	var b := UiTheme.button("Skip", "", &"BtnSmall")
	MenuKit.button_text(b, 0.86 * EM, 700, 1.2 * 0.86 * EM)
	MenuKit.pad_button(b, 1.1 * 0.86 * EM, 2.4 * 0.86 * EM)
	b.name = "SkipRide"
	b.theme = UiTheme.theme()
	b.pressed.connect(func() -> void: app_.skip_ride())
	b.modulate.a = 0.0
	b.ready.connect(func() -> void:
		# bottom centre, 14 up, growing up and out from there
		b.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
		b.grow_horizontal = Control.GROW_DIRECTION_BOTH
		b.grow_vertical = Control.GROW_DIRECTION_BEGIN
		b.offset_left = 0.0
		b.offset_right = 0.0
		b.offset_top = -14.0
		b.offset_bottom = -14.0
		var tw := b.create_tween()
		tw.tween_interval(1.2)
		tw.tween_property(b, "modulate:a", 0.85, 0.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT))
	return b


func _to_map() -> void:
	app.tap("back")
	app.close_results()
	app.go("map")


## .stats-table: the two names over the numbers, the better number lit white, and a thin bar
## under each line split at each side's share, in the bots' colours.
func _stats(a, b, ca: Color, cb: Color) -> Control:
	var acc := func(f) -> String:
		return "%d%%" % roundi(float(f.stats.landed) / float(f.stats.thrown) * 100.0) if float(f.stats.thrown) > 0.0 else "–"
	var rows := [
		["Damage", roundi(float(a.stats.dealt)), roundi(float(b.stats.dealt))],
		["Landed", "%d/%d" % [int(a.stats.landed), int(a.stats.thrown)], "%d/%d" % [int(b.stats.landed), int(b.stats.thrown)]],
		["Accuracy", acc.call(a), acc.call(b)],
		["Blocks", int(a.stats.blocked), int(b.stats.blocked)],
		["Dodges", int(a.stats.dodged), int(b.stats.dodged)],
		["Knockdowns", int(a.stats.knockdowns), int(b.stats.knockdowns)],
	]
	if float(a.stats.takedowns) + float(b.stats.takedowns) > 0.0:
		rows.append(["Takedowns", int(a.stats.takedowns), int(b.stats.takedowns)])
	rows.append(["Best shot", str(roundi(float(a.stats.biggest))) if float(a.stats.biggest) > 0.0 else "–", str(roundi(float(b.stats.biggest))) if float(b.stats.biggest) > 0.0 else "–"])
	var fs := 0.9 * EM
	var t := VBoxContainer.new()
	t.name = "Stats"
	t.add_theme_constant_override(&"separation", 0)
	var mids: Array[Label] = []
	# the names: 800, 0.95em, a hairline under them
	var hp := 0.95 * fs
	var h := HBoxContainer.new()
	h.add_theme_constant_override(&"separation", int(round(EM * 0.9)))
	var ha := MenuKit.label(String(a.name_), hp, 800, ca)
	var hl := MenuKit.label("vs", hp, 650, UiTheme.MUTED)
	var hb := MenuKit.label(String(b.name_), hp, 800, cb)
	hb.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for l in [ha, hb]:
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		l.clip_text = true
		l.custom_minimum_size.x = 20
	h.add_child(ha)
	h.add_child(hl)
	h.add_child(hb)
	mids.append(hl)
	var hm := MarginContainer.new()
	hm.add_theme_constant_override(&"margin_bottom", int(round(0.45 * hp)))
	hm.add_child(h)
	t.add_child(hm)
	var rule := ColorRect.new()
	rule.color = UiTheme.LINE
	rule.custom_minimum_size.y = 1
	t.add_child(rule)
	var gap := Control.new()
	gap.custom_minimum_size.y = round(0.15 * hp)
	t.add_child(gap)
	for r in rows:
		var va = r[1]
		var vb = r[2]
		var na := _num(va)
		var nb := _num(vb)
		var both := not is_nan(na) and not is_nan(nb)
		var wa := both and na > nb
		var wb := both and nb > na
		var sum := na + nb
		var k := na / sum if both and sum > 0.0 else -1.0
		var line := HBoxContainer.new()
		line.add_theme_constant_override(&"separation", int(round(EM * 0.9)))
		var la := MenuKit.label(str(va), fs, 700, Color.WHITE if wa else UiTheme.TEXT_2)
		var ll := MenuKit.label(String(r[0]), 0.86 * fs, 600, UiTheme.MUTED)
		var lb := MenuKit.label(str(vb), fs, 700, Color.WHITE if wb else UiTheme.TEXT_2)
		la.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		ll.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ll.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
		ll.size_flags_vertical = Control.SIZE_SHRINK_END
		line.add_child(la)
		line.add_child(ll)
		line.add_child(lb)
		mids.append(ll)
		var lm := MarginContainer.new()
		lm.add_theme_constant_override(&"margin_top", int(round(0.4 * fs)))
		lm.add_child(line)
		t.add_child(lm)
		var bar := CmpBar.new()
		bar.k = k
		bar.ca = ca
		bar.cb = cb
		bar.custom_minimum_size.y = 2.0 + round(0.3 * fs)
		t.add_child(bar)
	# the middle column as wide as its widest label (grid-template-columns: 1fr auto 1fr)
	var mid := 0.0
	for l in mids:
		mid = maxf(mid, l.get_combined_minimum_size().x)
	for l in mids:
		l.custom_minimum_size.x = mid
	return t


## A tag team's numbers together, shaped as a fighter's for _stats ({name_, stats}): the sums, and
## the biggest single shot either landed.
static func team_stats(m, side: int, team: String) -> Dictionary:
	var st := {"dealt": 0.0, "landed": 0.0, "thrown": 0.0, "blocked": 0.0, "dodged": 0.0, "knockdowns": 0.0, "takedowns": 0.0, "biggest": 0.0}
	var names := []
	for mb in m.tag.members:
		if int(mb.side) != side:
			continue
		names.append(String(mb.f.name_))
		var fs = mb.f.stats
		for k in st:
			st[k] = maxf(st[k], float(fs[k])) if k == "biggest" else st[k] + float(fs[k])
	return {"name_": team if team != "" else " & ".join(names), "stats": st}


## The two teams' bots (.tag-roster): each bot's colour, its name, how it came out of the fight
## (still standing with its health left, or knocked out of the match), and each team's tags.
func _roster(m, teams: Array) -> Control:
	var fs := 0.86 * EM
	var grid := HBoxContainer.new()
	grid.name = "Roster"
	grid.add_theme_constant_override(&"separation", int(round(0.9 * EM)))
	for side in 2:
		var col := VBoxContainer.new()
		col.add_theme_constant_override(&"separation", int(round(0.3 * EM)))
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var right := side == 1
		var head := MenuKit.label(("%d tag%s" % [int(m.tag.tags[side]), "" if int(m.tag.tags[side]) == 1 else "s"]).to_upper(), 0.7 * EM, 700, UiTheme.MUTED, int(round(0.7 * EM * 0.14)))
		head.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if right else HORIZONTAL_ALIGNMENT_LEFT
		col.add_child(head)
		for mb in m.tag.members:
			if int(mb.side) != side:
				continue
			var row := HBoxContainer.new()
			row.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
			if right:
				row.alignment = BoxContainer.ALIGNMENT_END
			var dot := Panel.new()
			var c := bar_colors(mb.spec.paint)[0]
			var ds := MenuKit.box(c if not mb.out else Color(c, 0.35), 99)
			dot.add_theme_stylebox_override(&"panel", ds)
			dot.custom_minimum_size = Vector2.ONE * round(0.6 * EM)
			dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var text := VBoxContainer.new()
			text.add_theme_constant_override(&"separation", 0)
			text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var nl := MenuKit.label(String(mb.f.name_), fs, 750, UiTheme.MUTED if mb.out else UiTheme.TEXT)
			# (out of the match, or the last bot standing for the losers when it ended inside the distance)
			var last: bool = m.winner != null and str(m.result) != "Decision" and mb.f == m.fighters[1 - int(m.winner.index)]
			var down: bool = mb.out or last or float(mb.f.hp) <= 0.0
			var how := "Knocked out" if down else "%d%% left" % roundi(float(mb.f.hpRatio) * 100.0)
			var sl := MenuKit.label(how, 0.74 * EM, 600, UiTheme.RED if down else UiTheme.TEXT_2)
			for l in [nl, sl]:
				l.custom_minimum_size.y = 0
				l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
				l.clip_text = true
				l.custom_minimum_size.x = 30
				if right:
					l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
				text.add_child(l)
			for n: Control in ([text, dot] if right else [dot, text]):
				row.add_child(n)
			col.add_child(row)
		grid.add_child(col)
	return grid


## parseFloat of a stat ("3/10" is 3, "–" is NaN).
static func _num(v) -> float:
	if v is int or v is float:
		return float(v)
	var s := String(v)
	var r := RegEx.create_from_string("^\\s*[-+]?(\\d+\\.?\\d*|\\.\\d+)")
	var mt := r.search(s)
	return float(mt.get_string()) if mt != null else NAN


static func _esc(s: String) -> String:
	return s.replace("[", "[lb]")


## Two bar colours from a bot's paint (hud.ts barColors): its main and second colour, any too dark
## to read on the dark track swapped for its glow colour. [leading edge, outer end].
static func bar_colors(p) -> Array[Color]:
	var ok := func(c: int) -> int:
		return int(p.accent) if _luma(c) < 0.3 else c
	var a: int = ok.call(int(p.primary))
	var b: int = ok.call(int(p.secondary))
	if b == a:
		b = int(p.primary) if int(p.accent) == a else int(p.accent)
	var out: Array[Color] = [MenuKit.hex(a), MenuKit.hex(b)]
	if _luma(a) > _luma(b):
		out.reverse()
	return out


static func _luma(c: int) -> float:
	return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255.0


func _layout() -> void:
	if size.x <= 0.0:
		return
	var side := FightHud.side_margin(self)
	var bottom := FightHud.bottom_margin(self)
	var top := 10.0
	var w := minf(size.x * 0.46, 27.0 * EM)
	var room := size.y - top - bottom
	var pad := 1.05 * EM + 1.1 * EM
	_scroll.custom_minimum_size = Vector2(w - 2.3 * EM, minf(_col.get_combined_minimum_size().y, room - pad))
	_card.custom_minimum_size.x = w
	_rise.reset_size()
	_rise.size.x = w
	_rise.position = Vector2(size.x - side - w, top + (room - _rise.size.y) * 0.5).round()


func _unhandled_input(e: InputEvent) -> void:
	# back: home (or the room, in one)
	if e.is_action_pressed("ui_cancel") and is_visible_in_tree() and app != null:
		get_viewport().set_input_as_handled()
		app.tap("back")
		app.close_results()
		app.go(app.back_to())


## The split bar under a stats line (.stats-table .cmp): the first bot's colour up to its share, a
## 2px gap, the second's after; a faint full line when the numbers don't compare.
class CmpBar extends Control:
	var k := -1.0
	var ca := Color.WHITE
	var cb := Color.WHITE

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var y := size.y - 2.0
		if k < 0.0:
			draw_rect(Rect2(0, y, size.x, 2), Color(1, 1, 1, 0.08))
			return
		var x := k * size.x
		var a := Color(ca, 0.6)
		var b := Color(cb, 0.6)
		if x - 1.0 > 0.0:
			draw_rect(Rect2(0, y, x - 1.0, 2), a)
		if size.x - (x + 1.0) > 0.0:
			draw_rect(Rect2(x + 1.0, y, size.x - x - 1.0, 2), b)
