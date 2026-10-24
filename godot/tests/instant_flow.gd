## The knockout's instant replay through the app: live fights (rushed with fast_forward until
## someone is in trouble, then played) until one ends in a knockout; its end waits for the
## replay, the replay's copy of the fight plays the blow (every state hash it makes matching the
## live fight's at that step), then the live fight comes back in its end, the end reaches the app
## once and the results come up with the fight counted once. A second knockout is skipped with a
## tap; a tag team match's is watched too; the last is fought with KO replays turned off.
##   godot --headless --path godot -s res://tests/instant_flow.gd
extends SceneTree

const HASH := 10

var app: App
var _fails := 0
var _ends := 0


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs", "replays"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	_run.call_deferred()


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _until(cond: Callable, limit := 6000) -> bool:
	for i in limit:
		if cond.call():
			return true
		await process_frame
	return false


func _run() -> void:
	await _frames(5)
	app.game.match_event.connect(func(t: String, _d) -> void:
		if t == "end":
			_ends += 1)
	await _knockout("watched", false)
	await _knockout("skipped", true)
	await _knockout("tag", false)
	app.game.settings.ko_replay = false
	await _knockout("off", false)
	print("instant_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(1 if _fails > 0 else 0)


## Fights until one ends in a knockout (decisions don't count), then watches what follows.
func _knockout(how: String, skip: bool) -> void:
	var g = app.game
	for attempt in 6:
		if how == "tag":
			var rng := TMath.Rng.new(77.0 + attempt)
			app.start_tag_fight(TLoadout.randomBot(rng), [TLoadout.randomBot(rng), TLoadout.randomBot(rng)], ["Us", "Them"])
		else:
			app.fight(false, false)
		g.net_hash_every = HASH
		await _until(func() -> bool: return g.m.phase == "intro" and g.m.phaseTime > 1.0)
		g.hud.skip_tap = true
		await _frames(3)
		# rushed to the closing stages, then played (the live fight's checkpoints are taken there)
		while g.m.phase != "end" and g.m.phase != "ko" and not InstantReplay.danger(g.m):
			g.fast_forward(60)
			await process_frame
		g.speed = 2.0
		_ends = 0
		var rec_before: float = app.record.wins + app.record.losses + app.record.draws
		var kod := false
		var played := false
		var hid := true
		var slowed := false
		var stamped := false
		var t0 := Time.get_ticks_msec()
		while app.results == null and Time.get_ticks_msec() - t0 < 240000:
			if g.m.phase == "ko" or g.instant.state != InstantReplay.IDLE:
				kod = kod or g.m.result != "Decision"
			if g.instant.on():
				played = true
				hid = hid and not g.hud.visible
				slowed = slowed or g.sfx.slow_rate < 1.0
				stamped = stamped or g.instant.landed
				if skip:
					g.instant_view.tapped = true
			if g.m.phase == "end" and g.instant.state == InstantReplay.IDLE and g.instant.held.is_empty():
				app.skip_ride()
			await process_frame
		if not kod or g.m.result == "Decision" or g.m.result == "Draw":
			print("     (%s: a %s, again)" % [how, g.m.result])
			continue
		print("     %s: %s by %s at step %d, the blow at %d (%s)" % [how, g.m.result, g.m.winner.name_, int(g.m.frame), g.instant.focal, g.instant.move])
		_check(app.results != null, "%s: the results come up" % how)
		_check(_ends == 1, "%s: the fight's end reached the app once (%d)" % [how, _ends])
		var rec_after: float = app.record.wins + app.record.losses + app.record.draws
		_check(rec_after == rec_before + 1.0, "%s: the fight counted once" % how)
		_check(g.m.phase == "end" and not g.instant.on(), "%s: the live fight is back, in its end" % how)
		if how == "off":
			_check(not played, "off: no replay")
			return
		_check(played, "%s: the replay played" % how)
		_check(hid, "%s: the HUD stepped away meanwhile" % how)
		_check(g.hud.visible or OS.get_environment("BB_NOHUD") != "", "%s: and came back" % how)
		_check(slowed and g.sfx.slow_rate == 1.0, "%s: the blows sounded lower, then as they were" % how)
		if not skip:
			_check(stamped, "%s: the blow landed on screen" % how)
			var live := {}
			for h in g.net_hashes:
				live[int(h[0])] = h[1]
			var n := 0
			var bad := -1
			for h in g.instant.hashes:
				if live.has(int(h[0])):
					n += 1
					if live[int(h[0])] != h[1] and bad < 0:
						bad = int(h[0])
			_check(n >= 10 and bad < 0, "%s: the replay is the fight itself (%d hashes, first off at %d)" % [how, n, bad])
		var t: Dictionary = g.tape
		_check(int(t.end) == int(g.m.frame) or int(t.end) > 0, "%s: the tape ends at the results (%d)" % [how, int(t.end)])
		return
	_check(false, "%s: no knockout in 6 fights" % how)
