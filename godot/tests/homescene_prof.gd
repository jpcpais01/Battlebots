## Where a home scene's frame goes: its update split into the room's life, the performance, the
## live fighter's sim steps and the model's pose (headless).
##   godot --headless --path godot -s res://tests/homescene_prof.gd -- [id]
extends SceneTree

var game: Game


func _init() -> void:
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	_run.call_deferred()


func _run() -> void:
	await process_frame
	var args := OS.get_cmdline_user_args()
	var sid: String = args[0] if args.size() > 0 else "gym"
	game.show_bot(TSaves.clone(TLoadout.DEFAULT_PLAYER))
	game.home_scene(sid)
	game.set_place("home")
	await process_frame
	game.set_process(false)
	var home: HomeStage = game.get_place("home")
	var k = home._kit_now()
	var s = home._scene
	var a: HomeActor = k.actor
	var parts := {"life": 0, "step": 0, "draw": 0, "all": 0}
	var n := 600
	for i in n:
		var t := 1.0 + i / 60.0
		var t0 := Time.get_ticks_usec()
		if s.has_method("_life"):
			s._life(1.0 / 60.0, t)
		var t1 := Time.get_ticks_usec()
		a.step(1.0 / 60.0)
		var t2 := Time.get_ticks_usec()
		a.draw(t)
		var t3 := Time.get_ticks_usec()
		home.update(1.0 / 60.0, t)
		var t4 := Time.get_ticks_usec()
		parts.life += t1 - t0
		parts.step += t2 - t1
		parts.draw += t3 - t2
		parts.all += t4 - t3
	for p in parts:
		print("%s: %.3f ms" % [p, parts[p] / 1000.0 / n])
	quit()
