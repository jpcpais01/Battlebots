## The animated home screen end to end, headless: each ported place shows with the default
## player's robot, plays its performance and sounds, runs the Fight button's way out to its cut, and
## hands the arena's light back on the way out; prints what HomeStage.update costs a frame.
##   godot --headless --path godot -s res://tests/homescene_flow.gd
extends SceneTree

var game: Game
var _fails := 0


func _init() -> void:
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	_run.call_deferred()


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _run() -> void:
	await process_frame
	var env: Environment = game._env
	var bg := env.background_color
	game.show_bot(TSaves.clone(TLoadout.DEFAULT_PLAYER))
	for sid in HomeStage.HOME_SCENES:
		if not HomeStage.has_scene(sid):
			print("skip %s (not ported)" % sid)
			continue
		game.home_scene(sid)
		game.set_place("home")
		var home: HomeStage = game.get_place("home")
		await process_frame
		_check(home.id == sid and home.model != null, "%s: shows with the robot" % sid)
		_check(not game._key.visible, "%s: the arena's key light is off" % sid)
		_check(home.sound.kind == sid, "%s: its sounds play" % sid)
		# a few seconds of its idle performance, timed
		var us := 0
		var n := 0
		var t0 := Time.get_ticks_msec()
		while Time.get_ticks_msec() - t0 < 2500:
			var a := Time.get_ticks_usec()
			home.update(1.0 / 60.0, 10.0 + n / 60.0)
			us += Time.get_ticks_usec() - a
			n += 1
			if n % 4 == 0:
				await process_frame
		print("%s: HomeStage.update %.3f ms a frame (%d frames)" % [sid, us / 1000.0 / n, n])
		_check(game.director.mode == "scene", "%s: the director flies the scene's camera" % sid)
		# the Fight button: the way out plays and calls back at its cut
		var done := [false]
		game.home_outro(func(): done[0] = true)
		_check(game.home_leaving(), "%s: leaving" % sid)
		var steps := 0
		while not done[0] and steps < 60 * 15:
			home.update(1.0 / 60.0, 20.0 + steps / 60.0)
			steps += 1
		_check(done[0], "%s: the way out reaches its cut (%.1f s)" % [sid, steps / 60.0])
		game.set_place("arena")
		await process_frame
		_check(game._key.visible and env.background_color == bg, "%s: the arena's light is back" % sid)
		_check(home.sound.kind == "", "%s: its sounds stop" % sid)
	print("homescene_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(1 if _fails > 0 else 0)
