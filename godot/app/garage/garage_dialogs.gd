## The garage's cards (src/ui/app.ts rename, savesMenu, randomizeName; style.css .box.dialog,
## .acct-in, .dialog-btns, .box.saves, .save-row): naming the bot, and the saved bots to switch
## between (at most TSaves.MAX_SAVES, kept by Store.save_saves).
extends RefCounted

const G := preload("res://app/garage/gstyle.gd")


## "Name your bot": a text field and Cancel / Save (20 letters at most; empty doesn't save).
static func rename(s) -> void:
	s.tap()
	s.open_modal("Name your bot", func(box: VBoxContainer) -> void:
		var inp := LineEdit.new()
		inp.name = "NameField"
		inp.text = s.app.player.name_
		inp.max_length = 20
		inp.context_menu_enabled = false
		inp.virtual_keyboard_enabled = true
		inp.caret_blink = true
		inp.select_all_on_focus = true
		inp.custom_minimum_size.y = 42
		inp.add_theme_font_override(&"font", UiTheme.font(600))
		inp.add_theme_font_size_override(&"font_size", 16)
		inp.add_theme_color_override(&"font_color", Color.WHITE)
		inp.add_theme_color_override(&"caret_color", Color.WHITE)
		inp.add_theme_color_override(&"selection_color", Color(0.24, 0.55, 1.0, 0.55))
		var well := G.flat(Color(0, 0, 0, 0.35), 14, UiTheme.LINE_2, 1, [8.8, 13.9, 8.8, 13.9])
		var lit := G.flat(Color(0, 0, 0, 0.35), 14, Color.WHITE, 1, [8.8, 13.9, 8.8, 13.9])
		lit.shadow_color = Color(1, 1, 1, 0.14)
		lit.shadow_size = 3
		inp.add_theme_stylebox_override(&"normal", well)
		inp.add_theme_stylebox_override(&"focus", lit)
		box.add_child(inp)
		var row := G.hbox(8)
		var cancel := UiTheme.button("Cancel", "", &"BtnSmall")
		cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cancel.pressed.connect(s.close_modal)
		row.add_child(cancel)
		var save := UiTheme.button("Save", "", &"BtnPrimary")
		save.name = "Save"
		save.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(save)
		box.add_child(G.margin(row, 5.6, 0, 0, 0))
		var submit := func(_t := "") -> void:
			var n := inp.text.strip_edges().substr(0, 20)
			if n == "":
				inp.grab_focus()
				return
			s.tap("select")
			s.close_modal()
			if n != s.app.player.name_:
				s.app.player.name_ = n
				s.commit_player(false)
		save.pressed.connect(submit)
		inp.text_submitted.connect(submit)
		(func() -> void:
			if is_instance_valid(inp):
				inp.grab_focus()
				inp.select_all()).call_deferred(), 368.0)


## A random name for the bot (app.ts randomizeName).
static func randomize_name(s) -> void:
	s.app.player.name_ = TLoadout.randomName(s.rng)


## Saved bots: switch to one, keep this one, or save over a slot (app.ts savesMenu).
static func saves_menu(s) -> void:
	s.tap()
	# (lambdas capture by value: the list redraws itself through this holder)
	var holder := []
	var draw := func(box: VBoxContainer) -> void:
		G.clear(box)
		var head := G.hbox(16)
		var h2 := G.label("Saved bots", 20.8, 800, UiTheme.TEXT, -0.2)
		h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(h2)
		var x := UiTheme.icon_button("close", 40.0)
		x.pressed.connect(s.close_modal)
		head.add_child(x)
		box.add_child(head)
		var saves: Array = Store.load_saves()
		s.app.saves = saves
		var sc := G.vscroll()
		var lst := G.vbox(6.4)
		lst.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sc.add_child(lst)
		box.add_child(sc)
		if saves.is_empty():
			lst.add_child(G.para("No saved bots yet. Save this one to switch back to it any time.", 16))
		for i in saves.size():
			lst.add_child(_row(s, saves, i, func() -> void: holder[0].call(box)))
		# the list scrolls once it's taller than the card can hold (measured once it has its
		# width: wrapped text is only as tall as that makes it)
		var cap: float = s.size.y - 24.0 - 18.4 - 19.2 - 60.0 - 70.0
		lst.resized.connect(func() -> void:
			var h := minf(lst.get_combined_minimum_size().y, cap)
			if absf(sc.custom_minimum_size.y - h) > 0.5:
				sc.custom_minimum_size.y = h)
		if saves.size() < int(TSaves.MAX_SAVES):
			var add := UiTheme.button("Save %s" % s.app.player.name_, "", &"Btn")
			add.name = "SaveThis"
			var row := add.get_child(0) as HBoxContainer
			var ic := G.icon("copy", 19.2, UiTheme.TEXT)
			row.add_child(ic)
			row.move_child(ic, 0)
			add.pressed.connect(func() -> void:
				s.tap("select")
				saves.append(s.app.player.duplicate(true))
				Store.save_saves(saves)
				holder[0].call(box))
			box.add_child(add)
		else:
			box.add_child(G.para("All %d slots are used: save over one or delete one." % int(TSaves.MAX_SAVES), 16))
		G.touch_scroll(lst)
	holder.append(draw)
	s.open_modal("", func(box: VBoxContainer) -> void: draw.call(box), 512.0, true)


## .save-row: a saved bot's paint, name and power, then Use, Save here and delete (tapped twice).
static func _row(s, saves: Array, i: int, redraw: Callable) -> Control:
	var bot = saves[i]
	var row := PanelContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_stylebox_override(&"panel", G.flat(Color(1, 1, 1, 0.04), 16, UiTheme.LINE, 1, [7.2, 8, 7.2, 11.2]))
	var h := G.hbox(7.2)
	row.add_child(h)
	var paint := G.c(bot.paint.primary)
	var sw := G.GPaint.new({"radius": 5.6, "fill": paint, "glow": [10.0, G.fade(paint, 0.5)]})
	sw.custom_minimum_size = Vector2(11.2, 35.2)
	sw.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(sw)
	var nm := G.vbox(0)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nm.add_child(G.trim(G.label(bot.name_, 16, 750)))
	nm.add_child(G.label("Power %s" % JS.s(floorf(TItems.computeBuild(bot.loadout).rating + 0.5)), 12.5, 500, UiTheme.MUTED))
	h.add_child(G.margin(nm, 0, 0, 0, 3.2))
	var use := UiTheme.button("Use", "", &"BtnPrimary")
	use.name = "Use"
	use.pressed.connect(func() -> void:
		s.tap("select")
		s.app.player = bot.duplicate(true)
		s.app.fit_owned(s.app.player)
		s.commit_player()
		s.pulse()
		s.close_modal())
	h.add_child(use)
	var here := UiTheme.button("Save here", "", &"BtnSmall")
	here.name = "SaveHere"
	here.pressed.connect(func() -> void:
		s.tap()
		saves[i] = s.app.player.duplicate(true)
		Store.save_saves(saves)
		redraw.call())
	h.add_child(here)
	var del := UiTheme.icon_button("close", 35.2, 17)
	del.name = "Delete"
	del.tooltip_text = "Delete"
	var armed := [false]
	del.pressed.connect(func() -> void:
		if not armed[0]:
			# the first tap arms it (red); the second deletes
			armed[0] = true
			del.tooltip_text = "Tap again to delete"
			var st := G.flat(UiTheme.RED, 18, UiTheme.RED, 1)
			for k in [&"normal", &"hover", &"pressed", &"hover_pressed"]:
				del.add_theme_stylebox_override(k, st)
			return
		saves.remove_at(i)
		Store.save_saves(saves)
		redraw.call())
	h.add_child(del)
	return row
