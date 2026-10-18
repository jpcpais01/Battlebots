extends SceneTree
## Tag team from the menus, headless: home's Tag Team button, the team sheet (a recruit with no
## saved bots, then a saved bot as the partner, new rivals), Fight (a tag team match: four bots),
## a forfeit back to the sheet (counted on both tallies), then a whole tag team fight to its
## results and the results' Rematch.
##   godot --headless --path godot -s res://tests/tagteam_flow.gd < /dev/null

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _sheet: TagTeamScreen


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	OS.set_environment("BB_SKIPINTRO", "1")
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			var btn := app.screens.home.find_child("TagTeam", true, false) as Button
			_check(btn != null and not btn.disabled, "home has a Tag Team button")
			btn.pressed.emit()
			_stage = 1
			_t = 0
		1:
			_sheet = app.screens.tagteam
			# (from the beach to the arena: the screen comes on behind the dip through black)
			if (app.current != "tagteam" or _sheet.partner == null) and _t < 300:
				return
			_check(app.current == "tagteam" and _sheet.visible, "the team sheet opens")
			_check(app.game.showcase != null, "the player's bot stands in the ring behind it")
			_check(_sheet.partner != null and _sheet.pick == -1, "no saved bots: a recruit partners the player")
			_check(_sheet.rivals.size() == 2 and _sheet.names[0] != "" and _sheet.names[1] != "", "two rivals and both teams' names")
			# a saved bot to pick
			var saved = TLoadout.randomBot(TMath.Rng.new(5.0))
			saved.name_ = "Saved Sam"
			app.saves.append(saved)
			_sheet.refresh()
			_sheet.choose(0)
			_check(_sheet.partner.name_ == "Saved Sam" and Store.pref("tagPartner", "") == "Saved Sam", "a saved bot can be the partner (and is remembered)")
			var before: String = JSON.stringify(_sheet.rivals)
			(_sheet.find_child("Reroll", true, false) as Button).pressed.emit()
			_check(JSON.stringify(_sheet.rivals) != before, "New rivals rolls another team")
			_check(TagTeamKit.contrasts(_sheet.rivals[0].paint, [app.player.paint, _sheet.partner.paint]), "the rivals' livery stands out against ours")
			(_sheet.find_child("Fight", true, false) as Button).pressed.emit()
			_stage = 2
			_t = 0
		2:
			var m = app.game.m
			_check(app.current == "fight" and m != null and m.tag != null, "Fight starts a tag team match")
			_check(app.game.models.size() == 2 and app.game.bench.size() == 2, "four robots: two fighting, two on the apron")
			_check(m.tag.members[1].spec.name_ == "Saved Sam", "the saved partner is on the player's apron")
			app.game.forfeit()
			_stage = 3
			_t = 0
		3:
			if _t < 3:
				return
			_check(app.current == "tagteam", "a forfeit goes back to the team sheet")
			_check(app.record.losses == 1.0 and TagTeamKit.tally()[1] == 1, "the forfeit counts as a loss on both tallies")
			_sheet.fight()
			_stage = 4
			_t = 0
		4:
			# run the sim to its end in big strides (on the main thread: the worker is synced)
			app.game._sync()
			var m = app.game.m
			for i in 1200:
				if m.phase == "end":
					break
				m.step(1.0 / 120.0)
			if m.phase == "end":
				_stage = 5
				_t = 0
		5:
			if app.results == null and app.has_method("skip_ride"):
				app.skip_ride()
			if app.results != null:
				var r = app.record
				_check(r.wins + r.losses + r.draws == 2.0, "the fight is counted once")
				var t := TagTeamKit.tally()
				_check(t[0] + t[1] + t[2] == 2, "and once on the tag team tally")
				var v := app.results.find_child("Verdict", true, false) as Label
				_check(v != null and (v.text.begins_with("TEAM") or v.text == "DRAW"), "the results call it for the team (%s)" % (v.text if v != null else "?"))
				_check(app.results.find_child("Roster", true, false) != null, "the results list both teams' bots")
				var rivals: String = JSON.stringify(app.tag_setup.rivals)
				var rm := app.results.find_child("Rematch", true, false)
				for b in app.results.find_children("*", "Button", true, false):
					if (b.find_child("Text", true, false) as Label).text == "Rematch":
						rm = b
				rm.pressed.emit()
				_check(app.game.m != null and app.game.m.tag != null and JSON.stringify(app.tag_setup.rivals) == rivals, "Rematch: tag team again, the same rivals")
				print("tagteam_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
				quit(1 if _fails > 0 else 0)
