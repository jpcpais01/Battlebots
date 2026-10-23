## app_shot.gd prepare script for the Gauntlet (app/gauntlet): a run set up some way in, then its
## screen, or a stage fought out to its results card.
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> gauntlet 3 res://tests/gauntlet_prep.gd
##   BB_GAUNTLET= (no run: how it works) | ready (three stages in) | offer (the first boss just
##   beaten: pick a boost) | results (screen home: the boss fought, a bot boosted to win it)
extends RefCounted


static func before(app: App) -> void:
	var mode := OS.get_environment("BB_GAUNTLET")
	if mode == "":
		return
	var g: Dictionary = app.gauntlet
	Gauntlet.start(g)
	var upto := 3 if mode == "ready" else 5 if mode == "offer" else 4
	for s in upto:
		Gauntlet.foe(g, app.player)
		Gauntlet.settle(g, true, false)
		if mode == "offer" and s == upto - 1:
			break
		Gauntlet.pick(g, g.run.offer[s % 3])
	if mode == "results":
		g.run.boosts = ["juggernaut", "juggernaut", "juggernaut", "glass_cannon", "glass_cannon", "overdrive", "overdrive", "fortress"]
	Gauntlet.save_state(g)
	app.changed.emit()


static func prepare(app: App) -> void:
	# (the fresh save's one-time gift banner out of the way)
	await app.get_tree().create_timer(1.2).timeout
	app._gift = 0.0
	for c in app.ui.get_children():
		if c is Button and c.find_children("*", "Label", true, false).any(func(l): return l.text == "A GIFT FOR YOU"):
			c.queue_free()
	if OS.get_environment("BB_GAUNTLET") != "results":
		return
	app.start_gauntlet()
	await app.get_tree().create_timer(0.3).timeout
	app.game._sync()
	var mt = app.game.m
	while mt.phase != "end":
		mt.step(1.0 / 120.0)
	await app.get_tree().create_timer(0.5).timeout
	app.skip_ride()
	await app.get_tree().create_timer(2.5).timeout
