## Replays through the app: a titan fight and a tag team fight played live (the intro tapped
## away, coach calls, TAG taps), each watched again from its results, seeking about (back to the
## start, into the middle, frame steps, to the end); then one saved to the shelf, read back and
## watched cold (no checkpoints but the walkout's). Every step the replays show must be the one
## the live fight ran: the state hashes match, and so do the results.
##   godot --headless --path godot -s res://tests/replay_flow.gd
extends SceneTree

## A state hash every this many steps, live and in the replays.
const HASH := 30

var app: App
var _fails := 0
var _live := {}


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


## Wait until `cond` holds (false after `limit` frames).
func _until(cond: Callable, limit := 6000) -> bool:
	for i in limit:
		if cond.call():
			return true
		await process_frame
	return false


func _run() -> void:
	await _frames(5)
	await _fight(false)
	var tape: Dictionary = app.game.tape
	await _replay(false)
	await _saved(tape)
	await _fight(true)
	await _replay(true)
	print("replay_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(1 if _fails > 0 else 0)


## A live fight to its results, its state hashes kept.
func _fight(tag: bool) -> void:
	var g = app.game
	if tag:
		var rng := TMath.Rng.new(77.0)
		app.start_tag_fight(TLoadout.randomBot(rng), [TLoadout.randomBot(rng), TLoadout.randomBot(rng)], ["Us", "Them"])
	else:
		app.fight(false, true)
	g.net_hash_every = HASH
	_check(app.current == "fight" and g.m != null and not g.replaying(), "%s: a live fight" % ("tag" if tag else "titans"))
	await _until(func() -> bool: return g.m.phase == "intro" and g.m.phaseTime > 2.0)
	g.hud.skip_tap = true
	await _frames(3)
	_check(int(g.tape.cut) > 0 and g.m.phase != "intro", "the intro tapped away (cut at %d)" % int(g.tape.cut))
	var calls := ["go", "defend", "allIn", "head"]
	var made := 0
	var tags := 0
	while g.m.phase != "end":
		var f := int(g.m.frame)
		if g.m.phase == "fight":
			if made < calls.size() and f % 900 < 60:
				g.hud.coach_tap = calls[made]
				made += 1
			if tag and tags < 3 and f % 1300 < 60:
				g.hud.tag_tap = true
				tags += 1
		g.fast_forward(40)
		await process_frame
	var up := await _until(func() -> bool:
		app.skip_ride()
		return app.results != null)
	_check(up, "the results come up")
	_live = {}
	for h in g.net_hashes:
		_live[int(h[0])] = h[1]
	var t: Dictionary = g.tape
	_check(int(t.end) > 0 and t.result != null, "the tape ends at %d with the results' numbers" % int(t.end))
	_check((t.coach as Array).size() >= 1, "the coach's calls are on it (%d)" % (t.coach as Array).size())
	if tag:
		_check((t.tags as Array).size() >= 1, "so are the TAG taps (%d)" % (t.tags as Array).size())
	_check(not (t.marks as Array).is_empty(), "big moments marked for the scrubber (%d)" % (t.marks as Array).size())
	await _frames(3)
	var s: SimSnap = g.timeline.before(int(t.end))
	_check(s != null and s.frame == int(t.end) and g.timeline.keep == int(t.end), "a checkpoint kept at its end")
	_check(_button("Replay") != null and _button("SaveReplay") != null, "Replay and Save replay on the results")


func _button(n: String) -> Button:
	return app.results.find_child(n, true, false) as Button if app.results != null else null


## The hashes the replay made since `since` that the live fight made too: how many, and the
## first that differs (-1: none).
func _compare(since: int) -> Array:
	var g = app.game
	var n := 0
	for i in range(since, g.net_hashes.size()):
		var h: Array = g.net_hashes[i]
		if _live.has(int(h[0])):
			n += 1
			if _live[int(h[0])] != h[1]:
				return [n, int(h[0])]
	return [n, -1]


## Wait for a seek to land, then play on `steps` steps.
func _land_and_play(steps: int) -> bool:
	var g = app.game
	var landed := await _until(func() -> bool: return not g.replay.seeking(), 20000)
	var at := int(g.m.frame)
	g.replay.paused = false
	g.speed = 4.0
	await _until(func() -> bool: return int(g.m.frame) >= mini(at + steps, g.replay.end), 3000)
	return landed


## The fight on screen watched again from its results.
func _replay(tag: bool) -> void:
	var g = app.game
	var verdict := _verdict()
	(_button("Replay") as Button).pressed.emit()
	await _frames(2)
	_check(g.replaying() and app.results == null, "Replay starts it again")
	_check(g.hud.replay_bar.visible, "with the replay's controls")
	if tag:
		_check(g.crew.size() == 4, "all four robots back")
	else:
		_check(g.titan, "in the Titan Colosseum")
	g.net_hash_every = HASH
	var mark: int = g.net_hashes.size()
	# from the walkout, through the tapped intro (the cut comes where it came)
	await _until(func() -> bool: return int(g.m.frame) > int(g.tape.cut) + 400, 20000)
	var c := _compare(mark)
	_check(c[0] > 5 and c[1] < 0, "the walkout and the start the same (%d hashes, first off: %d)" % c)
	# into the middle, back to the start, to near the end
	var end: int = g.replay.end
	for to in [end / 2, 60, end - 700]:
		mark = g.net_hashes.size()
		g.seek(to)
		var landed := await _land_and_play(300)
		c = _compare(mark)
		_check(landed and c[0] > 3 and c[1] < 0, "seek to %d lands on the same fight (%d hashes, first off: %d)" % [to, c[0], c[1]])
	# paused, a frame step on and two back
	g.replay.paused = true
	await _frames(3)
	var f0 := int(g.m.frame)
	g.replay.owed = HudReplay.STEP
	# (a prefetch on the worker lets go first)
	await _until(func() -> bool: return int(g.m.frame) >= f0 + HudReplay.STEP, 300)
	await _frames(2)
	_check(int(g.m.frame) == f0 + HudReplay.STEP, "a frame step on (%d to %d)" % [f0, int(g.m.frame)])
	g.seek(int(g.m.frame) - 2 * HudReplay.STEP)
	await _until(func() -> bool: return not g.replay.seeking(), 20000)
	_check(int(g.m.frame) == f0 - HudReplay.STEP, "two back (%d)" % int(g.m.frame))
	# its Results
	g.hud.replay_results.emit()
	var up := await _until(func() -> bool: return app.results != null, 20000)
	_check(up and int(g.m.frame) == end, "Results: to its end, then the card")
	_check(_verdict() == verdict, "the same verdict (%s)" % _verdict())
	var r = app.record
	var n: float = r.wins + r.losses + r.draws
	_check(n == (2.0 if tag else 1.0), "a replay counts for nothing (%d fights counted)" % int(n))


func _verdict() -> String:
	var v := app.results.find_child("Verdict", true, false) if app.results != null else null
	return String(v.text) if v != null and "text" in v else ""


## Save replay, then watch it off the shelf, cold.
func _saved(tape: Dictionary) -> void:
	var g = app.game
	(_button("SaveReplay") as Button).pressed.emit()
	await _frames(1)
	_check((_button("SaveReplay") as Button).disabled, "Save replay: Saved")
	var l := ReplayShelf.list()
	_check(l.size() == 1, "on the shelf")
	var back: Dictionary = l[0].tape
	var same: bool = int(back.seed) == int(tape.seed) and int(back.end) == int(tape.end) and int(back.cut) == int(tape.cut) and JSON.stringify(back.coach) == JSON.stringify(tape.coach) and back.arena == tape.arena
	_check(same, "read back as it was saved (seed, end, intro cut, calls, venue)")
	var bots_same := true
	for k in ["a", "b"]:
		var x := JSON.stringify(Store.keep_skin(TSaves.sanitizeBot(tape[k]), tape[k]), "", true, true)
		var y := JSON.stringify(back[k], "", true, true)
		if x != y:
			print("  %s: %s\n  vs %s" % [k, x, y])
			bots_same = false
	_check(bots_same, "...and both bots, to the last digit")
	_check(not ReplayShelf.outdated(l[0]), "made on this version")
	app.close_results()
	app.go("home")
	await _frames(3)
	var btn := app.screens.home.find_child("Replays", true, false) as Button
	_check(btn != null and not btn.disabled, "home's Replays button is on")
	btn.pressed.emit()
	await _frames(3)
	var md := Modal.current(app.ui)
	var watch := md.find_child("Watch", true, false) as Button if md != null else null
	_check(watch != null, "the list shows it")
	watch.pressed.emit()
	await _frames(3)
	_check(g.replaying() and app.current == "fight" and g.timeline.snaps.size() == 1, "watched cold (one checkpoint)")
	g.net_hash_every = HASH
	var mark: int = g.net_hashes.size()
	var to: int = g.replay.end - 900
	g.seek(to)
	var landed := await _land_and_play(200)
	var c := _compare(mark)
	_check(landed and c[0] > 3 and c[1] < 0, "a long seek lands on the same fight (%d hashes, first off: %d)" % c)
	g.hud.replay_results.emit()
	var up := await _until(func() -> bool: return app.results != null, 20000)
	_check(up, "its results, from the tape")
	(_button("Home") as Button).pressed.emit()
	await _frames(3)
	_check(app.current == "home" and g.m == null, "home")
