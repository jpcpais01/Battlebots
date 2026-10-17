## The garage screen headless (app/garage): every tab draws, a part is tried on and fitted (and a
## locked one can't be), the paint, size, emotes and walk-on change and are saved, a bot is saved,
## used and deleted in the saved bots card, the name dialog renames, Random keeps the name, and
## the back button closes a card before it leaves. Prints what each step costs.
##   godot --headless --path godot -s res://tests/garageui_flow.gd
extends SceneTree

const Tabs := preload("res://app/garage/garage_tabs.gd")

var app: App
var g
var _fails := 0


func _init() -> void:
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	OS.set_environment("BB_SCREEN", "garage")
	OS.set_environment("BB_SKIPINTRO", "1")
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	get_root().add_child.call_deferred(app)
	_run.call_deferred()


func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		_fails += 1


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _button(root: Node, name: String) -> Button:
	return root.find_child(name, true, false) as Button


func _run() -> void:
	await _frames(10)
	g = app.screens.get("garage")
	_check(g != null and app.current == "garage" and g.visible, "the garage is on screen")

	# every tab draws
	for t in [["part", ""], ["paint", "schemes"], ["paint", "primary"], ["paint", "accent"], ["paint", "finish"], ["size", ""], ["emotes", "win"], ["emotes", "taunt"], ["emotes", "finish"], ["emotes", "entrance"]]:
		g.tab = t[0]
		if t[0] == "paint":
			g.paint_page = t[1]
		if t[0] == "emotes":
			g.emote_kind = t[1]
		var t0 := Time.get_ticks_usec()
		g.refresh_garage()
		var us := Time.get_ticks_usec() - t0
		await _frames(2)
		var n: int = g.parts_root.get_child_count() if t[0] == "part" else g.list.get_child_count()
		_check(n > 0, "%s %s draws (%d items, %.1f ms)" % [t[0], t[1], n, us / 1000.0])
	for s in TItems.SLOTS:
		g.tab = "part"
		g.slot = s
		g.refresh_garage()
		await _frames(1)
		_check(g.parts_root.get_child_count() == 3, "the %s picker draws" % s)

	# try a part on, then fit it
	g.tab = "part"
	g.slot = "fist"
	g.refresh_garage()
	var fitted: String = app.player.loadout.fist.id
	var other = null
	var locked = null
	for it in TItems.itemsForSlot("fist"):
		if it.id == fitted:
			continue
		if TCareer.owns(app.record.career, it):
			if other == null:
				other = it
		elif locked == null:
			locked = it
	_check(other != null, "an owned part to fit: %s" % (other.id if other else "none"))
	g.parts.pick("fist", other, false)
	_check(g.parts.trial != null and g.trial_shown and app.player.loadout.fist.id == fitted, "picking it puts it on trial, not on the bot")
	var head := (g._stats.get_child(0).get_child(0) as HBoxContainer).get_child(0) as Label
	_check(head.text == "On trial", "the diagnostics say On trial")
	g.parts.fit("fist", other)
	_check(app.player.loadout.fist.id == other.id and Store.load_player().loadout.fist.id == other.id, "fitting it saves it")
	_check(g.parts.trial == null and not g.trial_shown, "and the trial is over")
	if locked != null:
		g.parts.pick("fist", locked, false)
		g.parts.fit("fist", locked)
		if App.UNLOCK_ALL:
			_check(app.player.loadout.fist.id == locked.id, "with everything unlocked, an unearned part (%s) fits" % locked.id)
		else:
			_check(app.player.loadout.fist.id == other.id, "a locked part (%s) can be tried on but not fitted" % locked.id)
		g.drop_trial()

	# paint, size, emotes, walk-on
	g.tab = "paint"
	g.paint_page = "schemes"
	g.refresh_garage()
	var sch = TPaint.SCHEMES[3]
	Tabs.set_paint(g, sch.paint.duplicate())
	_check(TPaint.samePaint(Store.load_player().paint, sch.paint), "a paint scheme is saved")
	var p2 = app.player.paint.duplicate()
	p2.finish = 3.0
	Tabs.set_paint(g, p2)
	_check(int(Store.load_player().paint.finish) == 3, "a finish is saved")
	g.tab = "size"
	g.refresh_garage()
	var slider := g.list.find_child("*Slider*", true, false) as HSlider
	if slider == null:
		for c in g.list.find_children("*", "HSlider", true, false):
			slider = c
	_check(slider != null, "the size slider is there")
	slider.value = 110
	_check(is_equal_approx(float(app.player.size_), 1.1), "sliding it resizes the bot")
	slider.drag_ended.emit(true)
	_check(is_equal_approx(float(Store.load_player().size_), 1.1), "letting go saves the size")
	_check(g._title_span.text.begins_with("110%"), "the title says 110%")
	g.tab = "emotes"
	g.emote_kind = "win"
	g.refresh_garage()
	var e0 = TEmote.EMOTE_INFO[0]
	Tabs.toggle_emote(g, e0)
	var sp = Store.load_player()
	_check(sp.get("emotes") != null and (sp.emotes.win as Array).has(e0.id), "equipping an emote saves it")
	Tabs.toggle_emote(g, e0)
	_check(Store.load_player().get("emotes") == null, "taking it off again leaves the bot picking its own")
	g.emote_kind = "entrance"
	g.refresh_garage()
	var wo = TWalkOns.WALK_ONS[2]
	app.player.walkOn = wo.id
	g.commit_player(false)
	_check(Store.load_player().get("walkOn") == wo.id, "a walk-on pick is saved")

	# saved bots: save this one, change it, use the save, delete it
	g.saves_menu()
	await _frames(2)
	_check(g.modal != null, "the saved bots card opens")
	_button(g.modal, "SaveThis").pressed.emit()
	_check(Store.load_saves().size() == 1, "Save keeps a copy (%d saved)" % Store.load_saves().size())
	var name0: String = app.player.name_
	g.close_modal()
	app.player.name_ = "Changed"
	g.commit_player(false)
	g.saves_menu()
	await _frames(1)
	_button(g.modal, "Use").pressed.emit()
	_check(app.player.name_ == name0 and Store.load_player().name_ == name0 and g.modal == null, "Use brings the saved bot back")
	g.saves_menu()
	await _frames(1)
	var del := _button(g.modal, "Delete")
	del.pressed.emit()
	_check(Store.load_saves().size() == 1, "one tap on delete only arms it")
	del.pressed.emit()
	_check(Store.load_saves().is_empty(), "the second deletes it")
	var cancel := InputEventAction.new()
	cancel.action = "ui_cancel"
	cancel.pressed = true
	g._unhandled_input(cancel)
	_check(g.modal == null and app.current == "garage", "back closes the card first")

	# rename
	g.rename()
	await _frames(2)
	var field := g.modal.find_child("NameField", true, false) as LineEdit
	field.text = "  Tin Can Tommy  "
	_button(g.modal, "Save").pressed.emit()
	_check(Store.load_player().name_ == "Tin Can Tommy" and g._name_text.text == "Tin Can Tommy", "the name dialog renames the bot")
	g.rename()
	await _frames(1)
	(g.modal.find_child("NameField", true, false) as LineEdit).text = "   "
	_button(g.modal, "Save").pressed.emit()
	_check(g.modal != null and app.player.name_ == "Tin Can Tommy", "an empty name isn't saved")
	g.close_modal()

	# random keeps the name; the rail and focus
	g.randomize_bot()
	_check(app.player.name_ == "Tin Can Tommy" and Store.load_player().name_ == "Tin Can Tommy", "Random keeps the name")
	g.tab = "part"
	g.slot = "head"
	g.refresh_garage()
	g.set_focus("head")
	_check(is_equal_approx(app.game.director.garage_dist, 2.3 * g._size_of(app.player)), "a close-up on the head")
	g.set_focus(null)
	_check(is_equal_approx(app.game.director.garage_dist, 4.7 * g._size_of(app.player)), "and back to the whole bot")

	# the spin: a drag turns the bot, a fling keeps it turning
	var yaw: float = app.game.director.garage_yaw
	var down := InputEventMouseButton.new()
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	down.position = Vector2(300, 300)
	g._unhandled_input(down)
	var mv := InputEventMouseMotion.new()
	mv.position = Vector2(340, 300)
	g._unhandled_input(mv)
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	up.position = Vector2(340, 300)
	g._unhandled_input(up)
	_check(absf(app.game.director.garage_yaw - (yaw - 40 * 0.012)) < 0.05, "dragging turns the bot")

	# cost: a frame of the garage's own work, and a redraw
	var t1 := Time.get_ticks_usec()
	for i in 1000:
		g.tick(1.0 / 120.0)
	var tick_us := (Time.get_ticks_usec() - t1) / 1000.0
	var t2 := Time.get_ticks_usec()
	for i in 10:
		g.refresh_garage()
	var redraw_ms := (Time.get_ticks_usec() - t2) / 10000.0
	print("garage tick: %.1f us a frame; a redraw (part tab): %.1f ms" % [tick_us, redraw_ms])

	# back home
	app.go("home")
	await _frames(2)
	_check(app.current == "home" and not g.visible, "Home leaves the garage")
	print("garageui_flow: %s" % ("PASS" if _fails == 0 else "FAIL (%d)" % _fails))
	quit(1 if _fails > 0 else 0)
