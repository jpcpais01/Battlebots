## The saved replays (src/ui/app.ts replaysMenu, watchSaved; style.css .box.saves, .save-row,
## .replay-row): each one's two bots, how the fight went for the player, its length and when it
## was saved, with Watch and delete (tapped twice). One saved on an older version of the game
## says so, and asks before it plays.
extends RefCounted

const G := preload("res://app/garage/gstyle.gd")
const MONTHS := ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


## Open the list over the home screen.
static func open(app) -> void:
	app.tap()
	Modal.open(app.ui, "Replays", func(md: Modal) -> void:
		md.width = 32.0 * UiTheme.EM
		var holder := VBoxContainer.new()
		holder.add_theme_constant_override(&"separation", 9)
		md.body.add_child(holder)
		_draw(app, md, holder), Callable(), true)


static func _draw(app, md: Modal, holder: VBoxContainer) -> void:
	G.clear(holder)
	var l := ReplayShelf.list()
	var sc := G.vscroll()
	var rows := G.vbox(6.4)
	rows.name = "Rows"
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(rows)
	holder.add_child(sc)
	if l.is_empty():
		rows.add_child(G.para("No saved replays yet. After a fight, tap Save replay on the results to keep it here.", 16))
	for r in l:
		rows.add_child(_row(app, md, holder, r))
	md.add_scroll(sc)
	G.touch_scroll(rows)
	holder.add_child(G.para("%d of %d kept on this phone." % [l.size(), ReplayShelf.MAX], 13))


## .save-row.replay-row: the player's bot's paint, both names, then how it went (an online fight's
## globe, Win / Loss / Draw and how, its length, the day it was saved, the crowd's stars, an older
## version's tag).
static func _row(app, md: Modal, holder: VBoxContainer, r: Dictionary) -> Control:
	var t: Dictionary = r.tape
	# this player's bot first (online they may have fought from the right corner)
	var me := int(t.me)
	var mine = t.b if me == 1 else t.a
	var theirs = t.a if me == 1 else t.b
	var row := PanelContainer.new()
	row.name = "Replay"
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_stylebox_override(&"panel", G.flat(Color(1, 1, 1, 0.04), 16, UiTheme.LINE, 1, [7.2, 8, 7.2, 11.2]))
	var h := G.hbox(7.2)
	row.add_child(h)
	var paint := G.c(mine.paint.primary)
	var sw := G.GPaint.new({"radius": 5.6, "fill": paint, "glow": [10.0, G.fade(paint, 0.5)]})
	sw.custom_minimum_size = Vector2(11.2, 35.2)
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(sw)
	var nm := G.vbox(1)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var title := "%s vs %s" % [mine.name_, theirs.name_]
	# a tag team fight: both teams, by name when they have one
	if t.partners != null:
		var teams: Array = t.teams
		title = "%s vs %s" % [teams[0] if String(teams[0]) != "" else "%s & %s" % [t.a.name_, t.partners.a.name_], teams[1] if String(teams[1]) != "" else "%s & %s" % [t.b.name_, t.partners.b.name_]]
	nm.add_child(G.trim(G.label(title, 16, 750)))
	var winner := int(r.winner)
	var verdict := "Draw" if winner < 0 else "Win" if winner == me else "Loss"
	var kind := String(r.kind)
	var how := (" by decision" if kind == "Decision" else " by " + kind) if kind != "" and kind != "Draw" else ""
	var line := G.hbox(4.8)
	if t.online:
		line.add_child(G.icon("globe", 13.7, UiTheme.MUTED if winner < 0 else UiTheme.GREEN if winner == me else UiTheme.RED))
	if t.arena == "titan":
		line.add_child(G.label("Titans ·", 12.5, 600, UiTheme.MUTED))
	elif t.partners != null:
		line.add_child(G.label("Tag team ·", 12.5, 600, UiTheme.MUTED))
	var sub := G.label("%s%s · %ds · %s" % [verdict, how, int(r.secs), _date(float(r.saved))], 12.5, 600, UiTheme.MUTED if winner < 0 else UiTheme.GREEN if winner == me else UiTheme.RED)
	line.add_child(G.trim(sub))
	sub.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# the crowd's stars for it (a fight from before ratings has none)
	if t.get("rating") is Dictionary:
		var st := RatingView.Stars.new(11.5)
		st.name = "Stars"
		st.value = float(t.rating.stars)
		line.add_child(st)
	if ReplayShelf.outdated(r):
		var old := PanelContainer.new()
		old.name = "Old"
		old.add_theme_stylebox_override(&"panel", G.flat(Color(0, 0, 0, 0), 999, UiTheme.LINE, 1, [0, 7.2, 0, 7.2]))
		old.add_child(G.label("Older version", 11.5, 600, UiTheme.MUTED))
		old.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(old)
	nm.add_child(line)
	var nmm := G.margin(nm, 0, 0, 0, 3.2)
	nmm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(nmm)
	var watch := UiTheme.button("Watch", "play", &"BtnPrimary")
	watch.name = "Watch"
	watch.pressed.connect(func() -> void: watch_saved(app, md, r))
	h.add_child(watch)
	var del := UiTheme.icon_button("close", 35.2, 17)
	del.name = "Delete"
	del.tooltip_text = "Delete"
	var armed := [false]
	del.pressed.connect(func() -> void:
		app.tap()
		if not armed[0]:
			# the first tap arms it (red); the second deletes
			armed[0] = true
			del.tooltip_text = "Tap again to delete"
			var st := G.flat(UiTheme.RED, 18, UiTheme.RED, 1)
			for k in [&"normal", &"hover", &"pressed", &"hover_pressed"]:
				del.add_theme_stylebox_override(k, st)
			return
		ReplayShelf.remove(r.id)
		_draw(app, md, holder))
	h.add_child(del)
	return row


## Watch a saved replay, asking first when an older version of the game recorded it.
static func watch_saved(app, md: Modal, r: Dictionary) -> void:
	md.close()
	if ReplayShelf.outdated(r):
		var i: int = await Modal.ask(app.ui, "Older replay", "This fight was saved on an older version of the game. The bots have changed since, so it may not play out the way it did.", [["cyan", "Cancel"], ["primary", "Watch anyway"]]).picked
		if i != 1:
			return
	app.watch_tape(r.tape.duplicate(true))


## The day it was saved ("Oct 20"), in the phone's time zone.
static func _date(ms: float) -> String:
	var bias := int(Time.get_time_zone_from_system().get("bias", 0)) * 60
	var d := Time.get_datetime_dict_from_unix_time(int(ms / 1000.0) + bias)
	return "%s %d" % [MONTHS[clampi(int(d.month) - 1, 0, 11)], int(d.day)]
