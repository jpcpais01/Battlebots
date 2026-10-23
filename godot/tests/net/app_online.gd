## The app's online loop, through its own screens: the room screen opens a room on a local PeerJS
## server (tests/net/peer_server.gd), a second player (a bare OnlineSession stepping its own copy
## of the match, as the other phone would) joins on the code, the host taps Fight, the real Game
## runs the online fight in the host's corner while the guest's copy keeps pace, a coach call
## from each corner, the results with the rematch vote, the rematch, the guest leaving mid-fight,
## and Home closing the room. Run it with BB_GUEST_HOST=1 to have the app join instead (the player
## in the right corner).
##   godot --headless --path godot -s res://tests/net/app_online.gd < /dev/null
extends SceneTree

const PORT := 9124

var app: App
var server: PeerServer
var fails := 0
var guest_side := false


## The other phone: steps its copy of the fight in real time at its session's pace, hashing like
## Game._run_steps, catching up like Game.fast_forward. (One process can't step two fights at once:
## the sim's scratch vectors are shared, so it waits for the app's steps on the worker first.)
class Twin extends Node:
	var game: Game
	var m
	var speed := 1.0
	var net_hash_every := 0
	var net_hashes: Array = []
	var session
	var acc := 0.0

	func _process(dt: float) -> void:
		if m == null or not is_instance_valid(session):
			return
		game._sync()
		session.frame(dt)
		acc += minf(dt, 0.1) * speed
		while acc >= 1.0 / 120.0 and m.phase != "end":
			acc -= 1.0 / 120.0
			_step()

	func _step() -> void:
		m.step(1.0 / 120.0)
		if net_hash_every > 0 and int(m.frame) % net_hash_every == 0:
			net_hashes.append([int(m.frame), SimHash.of(m)])

	func fast_forward(n: int) -> void:
		for i in n:
			if m.phase == "end":
				break
			_step()


func check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		fails += 1


func _initialize() -> void:
	OS.set_environment("BB_PEER", "127.0.0.1:%d" % PORT)
	guest_side = OS.get_environment("BB_GUEST_HOST") != ""
	for f in ["player", "record", "saves", "prefs", "skins"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	server = PeerServer.new(PORT)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	_run.call_deferred()


func wait_for(cond: Callable, secs := 10.0) -> bool:
	var until := Time.get_ticks_msec() + int(secs * 1000.0)
	while Time.get_ticks_msec() < until:
		if cond.call():
			return true
		server.poll(1.0 / 60.0)
		await process_frame
	return cond.call()


func hold(secs: float) -> void:
	await wait_for(func() -> bool: return false, secs)


func press(where: Node, name_: String) -> bool:
	var b := where.find_child(name_, true, false) as Button
	if b == null or b.disabled or not b.is_visible_in_tree():
		return false
	b.pressed.emit()
	return true


func _run() -> void:
	await hold(0.5)
	check(app.current == "home", "starts on home")
	var scr: OnlineScreen = app.screens.get("online")
	check(scr != null, "the room screen is there")
	app.go("online")
	await hold(0.3)
	check(app.current == "online" and scr.visible, "Online opens the room screen")
	var rng := TMath.Rng.new(5.0)
	var other = TLoadout.randomBot(rng)
	other.name_ = "Web Friend"

	# --- the room
	var peer: OnlineSession
	if not guest_side:
		check(press(scr, "Create"), "Create room")
		check(await wait_for(func() -> bool: return app.net != null and app.net.code != ""), "the room opened")
		var code_l := scr.find_child("Code", true, false) as Label
		check(code_l != null and code_l.text == app.net.code, "its code on screen (%s)" % app.net.code)
		check(scr.find_child("Fight", true, false).disabled, "Fight waits for a challenger")
		peer = OnlineSession.join(app.net.code, other)
	else:
		peer = OnlineSession.host(other)
		root.add_child(peer)
		check(await wait_for(func() -> bool: return peer.code != ""), "the friend's room opened")
		var inp := scr.find_child("CodeIn", true, false) as LineEdit
		inp.text = peer.code.to_lower()
		inp.text_changed.emit(inp.text)
		check(inp.text == peer.code, "the code box takes capitals")
		check(press(scr, "Join"), "Join")
	if peer.get_parent() == null:
		root.add_child(peer)
	var host: OnlineSession = peer if guest_side else app.net
	check(await wait_for(func() -> bool: return app.net != null and app.net.can_fight and peer.can_fight, 25.0), "both in the room and ready")
	check(app.net.peer_bot != null and app.net.peer_bot.name_ == "Web Friend", "the friend's bot is in the room")
	await hold(0.2)
	var status := scr.find_child("Status", true, false) as Label
	check(status != null and status.text.contains("Web Friend"), "status: %s" % (status.text if status != null else "-"))

	# --- a new paint from the garage goes across
	app.go("garage")
	await hold(0.3)
	app.player.name_ = "Phone Bot"
	app.commit_player()
	check(await wait_for(func() -> bool: return peer.peer_bot != null and peer.peer_bot.name_ == "Phone Bot"), "a garage change reaches the friend")
	check(app.back_to() == "online", "the garage's Home leads back to the room")
	app.go(app.back_to())
	await hold(0.3)

	# --- the fight
	var twin := Twin.new()
	twin.session = peer
	twin.game = app.game
	root.add_child(twin)
	var seen := [null]
	peer.start.connect(func(a, b, seed: float) -> void:
		seen[0] = seed
		app.game._sync()
		twin.m = TMatch.Match.new(a, b, seed)
		# (as the other phone's Game.start_match does online)
		twin.m.introLength += Game.ONLINE_INTRO_EXTRA
		twin.acc = 0.0
		peer.watch(twin, twin.m))
	if guest_side:
		peer.start_fight()
	else:
		check(press(scr, "Fight"), "the host taps Fight")
	check(await wait_for(func() -> bool: return app.current == "fight" and app.game.m != null and seen[0] != null), "the fight starts on both")
	var g: Game = app.game
	var me := 1 if guest_side else 0
	check(g.online and g.net_me == me, "an online fight, the player in corner %d" % me)
	check(g.director.player == me, "the camera keeps the player's robot on the left")
	check(g.m.introLength == twin.m.introLength, "the same intro on both (%.2f s)" % g.m.introLength)
	# into the fight, then a call from each corner
	check(await wait_for(func() -> bool: return g.m != null and g.m.phase == "fight" and twin.m.phase == "fight", 40.0), "into the fight")
	var calls := [false, false]
	await wait_for(func() -> bool:
		if not calls[0] and g.m.coachReady(float(me)):
			# (a tap on the coach bar: the Game hands it to the room)
			g.hud.coach_tap = "go"
			calls[0] = true
		if not calls[1] and twin.m.coachReady(float(1 - me)):
			peer.coach("defend")
			calls[1] = true
		return calls[0] and calls[1] and g.m.frame > twin.m.frame - 1 and g.m.coachLog.size() >= 2 and twin.m.coachLog.size() >= 2, 15.0)
	await hold(4.0)
	check(calls[0] and calls[1], "both corners made a call")
	var gap := absf(float(g.m.frame) - float(twin.m.frame))
	check(gap < 40.0, "the two fights keep pace (gap %d steps)" % int(gap))
	check(JSON.stringify(g.m.coachLog) == JSON.stringify(twin.m.coachLog), "calls on the same steps: %s" % JSON.stringify(g.m.coachLog))
	check(not app.net.desynced and not peer.desynced, "hashes agree")
	var pill = g.hud._net
	check(pill != null and pill.visible and String(pill.text).begins_with("Online"), "the HUD's pill: %s" % (pill.text if pill != null else "-"))
	# the online menu doesn't pause
	g.pause()
	await hold(0.2)
	check(g.pause_menu.is_open() and not paused, "the menu opens, the fight goes on")
	var f0: float = g.m.frame
	await hold(0.4)
	check(g.m.frame > f0, "...still running behind it")
	g.resume()

	# --- the end: both run out, the results come up online
	g._sync()
	for mm in [g.m, twin.m]:
		while mm.phase != "end":
			mm.step(1.0 / 120.0)
	check(await wait_for(func() -> bool:
		if app.results == null:
			app.skip_ride()
		return app.results != null, 20.0), "the results come up")
	var r: Control = app.results
	var rec = app.record
	check(rec.wins + rec.losses + rec.draws == 0.0, "an online fight isn't on the win record")
	check(r.find_child("Room", true, false) != null, "the results offer the room")
	var verdict := r.find_child("Verdict", true, false) as Label
	var w: int = int(g.m.winner.index) if g.m.winner != null else -1
	var expect := "DRAW" if w < 0 else "VICTORY" if w == me else "DEFEAT"
	check(verdict != null and verdict.text == expect, "the verdict from this corner: %s" % (verdict.text if verdict else "-"))

	# --- a rematch: the friend votes first
	peer.vote_rematch()
	var note := r.find_child("NetNote", true, false) as Label
	check(await wait_for(func() -> bool: return note.text.contains("wants a rematch")), "\"%s\"" % note.text)
	var seed0 = seen[0]
	check(press(r, "Primary"), "Rematch")
	check(await wait_for(func() -> bool: return app.results == null and app.current == "fight" and seen[0] != seed0, 10.0), "the rematch starts on both")
	check(g.online and app.net_fight == app.net, "...online again")

	# --- the friend leaves mid-fight: the fight plays out here
	await hold(1.0)
	peer.close()
	twin.queue_free()
	if guest_side:
		# (the room was the friend's: it's gone)
		check(await wait_for(func() -> bool: return app.net == null, 10.0), "the room closes when its host leaves")
	check(await wait_for(func() -> bool: return String(g.hud._net.text) == "Opponent left", 10.0), "the pill: Opponent left")
	check(g.m != null and g.online, "the fight plays on")
	g._sync()
	while g.m.phase != "end":
		g.m.step(1.0 / 120.0)
	check(await wait_for(func() -> bool:
		if app.results == null:
			app.skip_ride()
		return app.results != null, 20.0), "results after the friend left")
	note = app.results.find_child("NetNote", true, false) as Label
	check(note != null and note.text.ends_with("left the room."), "\"%s\"" % (note.text if note else "-"))
	check((app.results.find_child("Primary", true, false) as Button).disabled, "no rematch with nobody there")

	# --- home closes the room
	var room = app.net
	check(press(app.results, "Home"), "Leave room")
	await hold(0.3)
	check(app.current == "home" and app.net == null, "home, out of the room")
	check(room == null or not is_instance_valid(room) or room.closed, "the room is closed")
	check(not g.online and g.m == null, "the fight is gone")
	# an offline fight after: nothing online left on it
	app.fight()
	await hold(0.3)
	check(app.current == "fight" and not g.online and not g.net_frame.is_valid() and g.net_hash_every == 0, "the next fight is offline")
	app.go("home")

	server.close()
	print("ALL OK" if fails == 0 else "%d FAILED" % fails)
	quit(1 if fails else 0)
