## Screen set-ups for tests/app_shot.gd (its `script` argument): the menus worker's views.
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> <screen> <secs> res://tests/menus_shot.gd
## with MENUS_PREP set to:
##   notes    the patch notes popup over home
##   settings the settings card over home
##   ask      a two-button question (Modal.ask)
##   intro    (screen fight) a map event's fight from its walkout, MENUS_T seconds in: the bot cards
##            and the rival's billing (4.4s on is the rival's turn)
##   event    a map event's round fought to its end: the results with the prize
##   ride     (screen fight) the fight run to its end, then MENUS_T seconds into the loser's
##            stretcher ride
extends RefCounted


static func prepare(app: App) -> void:
	var what := OS.get_environment("MENUS_PREP")
	var t := float(OS.get_environment("MENUS_T")) if OS.get_environment("MENUS_T") != "" else 3.0
	var tree := app.get_tree()
	# (the performance overlay would sit over the left card)
	app.game.hud.show_fps(false)
	match what:
		"notes":
			app.screens.home.patch_notes()
		"settings":
			app.screens.home.open_settings()
		"ask":
			Modal.ask(app.ui, "Start over?", "This event's run ends here: you keep what you've won, and its next run starts from round one.", [["BtnSmall", "Cancel"], ["BtnDanger", "Start over"]])
		"intro":
			OS.set_environment("BB_SKIPINTRO", "")
			app.close_results()
			app.fight_event(TEvents.EVENTS[0])
			# (on the match clock: real time runs slower than it under the software renderer)
			app.game._sync()
			var m = app.game.m
			while m.phaseTime < t - 0.4:
				m.step(1.0 / 120.0)
		"event":
			# a map event's round fought to its end and Skipped to: the results with the prize
			app.fight_event(TEvents.EVENTS[0])
			await tree.process_frame
			app.game._sync()
			var m = app.game.m
			m.skipIntro()
			while m.phase != "end":
				m.step(1.0 / 120.0)
			for i in 4:
				await tree.process_frame
			app.skip_ride()
			for i in 4:
				await tree.process_frame
		"ride":
			app.game._sync()
			var m = app.game.m
			while m.phase != "end":
				m.step(1.0 / 120.0)
			var hold := Stretcher.ride_end(m.result) - Stretcher.RIDE
			while m.phaseTime < hold + t - 0.4:
				m.step(1.0 / 120.0)
	await tree.process_frame
