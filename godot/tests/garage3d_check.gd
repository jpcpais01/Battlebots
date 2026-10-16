## Headless check of the garage's 3D side: the workshop place (build, enter, update, exit and the
## arena's look coming back), the sparring dummy and a finisher on it, and the part pictures.
## Prints what each costs per frame.
##   godot --headless --path godot -s res://tests/garage3d_check.gd
extends SceneTree

var game: Game
var _fail := 0


func _init() -> void:
	_run.call_deferred()


func _check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		_fail += 1


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _run() -> void:
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	await _frames(3)
	var spec = TSaves.clone(TLoadout.DEFAULT_PLAYER)
	game.show_bot(spec)
	game.garage_bot("Rustbucket", 812.0, spec.paint)
	var bg0: Color = game._env.background_color
	var key0: Vector3 = game._key.position
	var t0 := Time.get_ticks_usec()
	game.set_place("garage")
	print("set_place(garage) first time: %.1f ms" % ((Time.get_ticks_usec() - t0) / 1000.0))
	game.director.mode = "garage"
	game.director.garage_yaw = 0.45
	game.director.shift_x = 0.27
	var g: Garage = game.get_place("garage")
	_check(g != null and g.visible, "garage built and shown")
	_check(not game.arena.visible, "arena hidden")
	_check(game._env.background_color.is_equal_approx(Color.hex(0x0b0d11ff)), "garage background")
	_check(game.director.garage_dist == 4.7, "overview framing")
	_check(g.screens.bot_name == "Rustbucket", "monitor shows the bot")
	await _frames(30)
	# per-frame cost of the place's update
	var n := 200
	t0 = Time.get_ticks_usec()
	for i in n:
		g.update(1.0 / 120.0, i / 120.0)
	print("garage.update: %.1f us/frame" % ((Time.get_ticks_usec() - t0) / float(n)))
	t0 = Time.get_ticks_usec()
	for i in n:
		game.showcase.update(1.0 / 120.0, i / 120.0)
	print("showcase.update (alone): %.1f us/frame" % ((Time.get_ticks_usec() - t0) / float(n)))
	game.garage_pulse()
	await _frames(10)
	_check(g._scan.visible, "scan sweeps up")
	game.garage_focus("head")
	_check(is_equal_approx(game.director.garage_dist, 2.3), "head close-up")
	game.garage_focus("")
	# a finisher on the sparring dummy
	game.sparring(true)
	_check(game.showcase.spar_model != null, "sparring dummy out")
	_check(is_equal_approx(game.director.garage_dist, 5.3), "pair framed")
	var fin_ids: Array = []
	for id in TEmote.EMOTE_KIND:
		if TEmote.EMOTE_KIND[id] == "finish":
			fin_ids.append(id)
	print("finishers: ", fin_ids)
	var worst := 0
	var hits := [0]
	for id in fin_ids:
		game.preview_emote(id)
		_check(game.showcase.spar_run != null, "finisher %s runs" % id)
		var frames := 0
		while game.showcase.spar_run != null and frames < 2400:
			var a := Time.get_ticks_usec()
			game.showcase.update(1.0 / 120.0, frames / 120.0)
			worst = maxi(worst, Time.get_ticks_usec() - a)
			frames += 1
			if frames % 8 == 0:
				await process_frame
		_check(game.showcase.spar_run == null, "finisher %s ends (%d frames)" % [id, frames])
	print("showcase.update with a finisher, worst: %d us" % worst)
	game.sparring(false)
	_check(game.showcase.spar_model == null, "dummy put away")
	# part pictures
	var th: PartThumbs = game.thumbs
	var got := [0]
	th.ready_thumb.connect(func(_k, _t): got[0] += 1)
	var asked := 0
	for slot in TItems.SLOTS:
		var item = TItems.ITEM_BY_ID.get(spec.loadout[slot].id)
		if th.thumb(item, 2, spec.paint, spec.loadout) == null:
			asked += 1
	await _frames(60)
	if DisplayServer.get_name() == "headless":
		# (nothing draws headless: tests/garage3d_thumbs.gd checks the pictures on screen)
		print("  skip six part pictures land (headless: %d asked)" % asked)
	else:
		_check(got[0] == asked and asked == 6, "six part pictures land (%d of %d)" % [got[0], asked])
	game.set_place("arena")
	_check(game.arena.visible and not g.visible, "back in the arena")
	_check(game._env.background_color.is_equal_approx(bg0), "arena background back")
	_check(game._key.position.is_equal_approx(key0), "arena key light back")
	print("garage3d_check: ", _fail, " failed")
	quit(1 if _fail else 0)
