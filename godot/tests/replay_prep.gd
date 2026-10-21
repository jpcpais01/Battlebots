## app_shot.gd's prepare scripts for replays: a fight run to its results (through the Game, so
## the tape and the timeline have it all), then the replay's controls mid-fight (BB_REPLAY_SHOT
## "bar", the default), its results ("results") or the saved replays' list ("list").
##   godot/tools/shots/shot.sh res://tests/app_shot.gd /tmp/r.png home 1.5 res://tests/replay_prep.gd
extends RefCounted


static func prepare(app: App) -> void:
	var tree := app.get_tree()
	var g = app.game
	app.fight()
	await tree.process_frame
	while g.m.phase != "end":
		g.fast_forward(200)
		await tree.process_frame
	for i in 600:
		app.skip_ride()
		if app.results != null:
			break
		await tree.process_frame
	await _wait(tree, 30)
	var what := OS.get_environment("BB_REPLAY_SHOT")
	if what == "list":
		app.results.find_child("SaveReplay", true, false).pressed.emit()
		app.close_results()
		app.go("home")
		await _wait(tree, 20)
		app.screens.home.find_child("Replays", true, false).pressed.emit()
		return
	app.replay()
	await _wait(tree, 5)
	g.seek(int(g.replay.end * 0.62))
	while g.replay.seeking():
		await tree.process_frame
	await _wait(tree, 40)
	g.replay.paused = true
	if what == "results":
		g.hud.replay_results.emit()


static func _wait(tree: SceneTree, n: int) -> void:
	for i in n:
		await tree.process_frame
