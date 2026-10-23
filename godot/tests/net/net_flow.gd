## Online rooms end to end in one process, through a local PeerJS server (tests/net/peer_server.gd)
## and real WebRTC on this machine: open a room, a wrong code, join it, a third player turned away,
## both bots and the fingerprint check, a fight started from one seed on both sides, the two sims
## paced against each other with coach calls from both corners landing on the same steps, their
## hashes compared, a drift noticed, a rematch, and both ways of leaving.
##   godot --headless --path godot -s res://tests/net/net_flow.gd < /dev/null
extends SceneTree

const PORT := 9123

var server: PeerServer
var fails := 0


## A stand-in for the Game: steps its match in real time at the session's pace (Game.speed), takes
## its hashes like Game._run_steps, and catches up like Game.fast_forward.
class FakeGame extends Node:
	var m
	var speed := 1.0
	var net_hash_every := 0
	var net_hashes: Array = []
	var session
	var acc := 0.0
	var ff := 0
	var stall := 0.0

	func _process(dt: float) -> void:
		if m == null:
			return
		session.frame(dt)
		if stall > 0.0:
			stall -= dt
			return
		acc += minf(dt, 0.1) * speed
		while acc >= 1.0 / 120.0:
			acc -= 1.0 / 120.0
			_step()

	func _step() -> void:
		m.step(1.0 / 120.0)
		if net_hash_every > 0 and int(m.frame) % net_hash_every == 0:
			net_hashes.append([int(m.frame), SimHash.of(m)])

	func fast_forward(n: int) -> void:
		ff += n
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
	TInit.run()
	_run()


func wait_for(cond: Callable, secs := 10.0) -> bool:
	var t := 0.0
	while t < secs:
		if cond.call():
			return true
		await process_frame
		t += 1.0 / 60.0
		server.poll(1.0 / 60.0)
		OS.delay_msec(16)
	return cond.call()


func _run() -> void:
	server = PeerServer.new(PORT)
	var rng := TMath.Rng.new(77.0)
	var bot_a = TLoadout.randomBot(rng)
	var bot_b = TLoadout.randomBot(rng)
	bot_a.name_ = "Host Bot"
	bot_b.name_ = "Guest Bot"
	bot_b.size_ = 1.15

	# --- a room
	var host := OnlineSession.host(bot_a)
	root.add_child(host)
	check(await wait_for(func() -> bool: return host.code != ""), "room opened")
	check(host.code.length() == 4 and NetRoom.normalize_code(host.code) == host.code, "room code %s" % host.code)
	check(server.clients.has(NetRoom.ID_PREFIX + host.code), "on the broker as the web's room id")

	# --- a wrong code
	var bad_code := "ZZZZ" if host.code != "ZZZZ" else "YYYY"
	var bad := OnlineSession.join(bad_code, bot_b)
	var why := [""]
	bad.failed.connect(func(w: String) -> void: why[0] = w)
	root.add_child(bad)
	check(await wait_for(func() -> bool: return why[0] != "", 12.0), "wrong code fails: %s" % why[0])
	check(why[0].begins_with("No room"), "...saying there's no such room")

	# --- join
	var t0 := Time.get_ticks_msec()
	var guest := OnlineSession.join(NetRoom.normalize_code(host.code.to_lower()), bot_b)
	guest.failed.connect(func(w: String) -> void: print("guest failed: ", w))
	root.add_child(guest)
	check(await wait_for(func() -> bool: return host.can_fight and guest.can_fight, 20.0), "joined and both can fight (%d ms)" % (Time.get_ticks_msec() - t0))
	check(host.peer_bot != null and host.peer_bot.name_ == "Guest Bot" and host.peer_bot.size_ == 1.15, "host sees the guest's bot")
	check(guest.peer_bot != null and guest.peer_bot.name_ == "Host Bot", "guest sees the host's bot")
	check(host.blocker == "" and guest.blocker == "", "same fingerprint (%x)" % NetFingerprint.value)
	check(host.me == 0 and guest.me == 1, "host left, guest right")
	check(server.clients.size() == 1, "guest is off the broker again (%d on it)" % server.clients.size())

	# --- a third player
	var third := OnlineSession.join(host.code, bot_b)
	var why3 := [""]
	third.ended.connect(func(w: String) -> void: why3[0] = w)
	third.failed.connect(func(w: String) -> void: why3[0] = w)
	root.add_child(third)
	check(await wait_for(func() -> bool: return why3[0] != "", 20.0), "third player turned away: %s" % why3[0])
	check(why3[0] == "That room already has two players.", "...because the room is full")
	check(host.connected and guest.connected, "the two still connected")

	# --- the garage from the room: a new bot goes across
	bot_b.name_ = "Guest Bot II"
	guest.set_bot(bot_b)
	check(await wait_for(func() -> bool: return host.peer_bot.name_ == "Guest Bot II"), "a bot change goes across")

	# --- a fight
	var starts := [null, null]
	host.start.connect(func(a, b, seed: float) -> void: starts[0] = [a, b, seed])
	guest.start.connect(func(a, b, seed: float) -> void: starts[1] = [a, b, seed])
	host.start_fight()
	check(await wait_for(func() -> bool: return starts[0] != null and starts[1] != null), "fight started on both")
	var same: bool = JSON.stringify(TInit.to_json(starts[0][0])) == JSON.stringify(TInit.to_json(starts[1][0])) and JSON.stringify(TInit.to_json(starts[0][1])) == JSON.stringify(TInit.to_json(starts[1][1])) and starts[0][2] == starts[1][2]
	check(same, "same bots and seed (%d)" % int(starts[0][2]))
	var games := []
	for k in 2:
		var g := FakeGame.new()
		g.session = host if k == 0 else guest
		g.m = TMatch.Match.new(starts[k][0], starts[k][1], starts[k][2])
		g.m.skipIntro()
		root.add_child(g)
		g.session.watch(g, g.m)
		games.append(g)
	# the guest's phone starts a moment late (the start message's trip)
	games[1].stall = 0.4
	# both corners call, and the calls must land on the same steps on both sides
	var called := [false, false]
	check(await wait_for(func() -> bool:
		for k in 2:
			var s: OnlineSession = games[k].session
			if not called[k] and games[k].m.phase == "fight" and games[k].m.coachReady(float(s.me)):
				s.coach("go" if k == 0 else "defend")
				called[k] = true
		return games[0].m.frame > 2400 and games[1].m.frame > 2400, 40.0), "both fights ran 20 s")
	var gap := absf(float(games[0].m.frame) - float(games[1].m.frame))
	check(gap < 40.0, "guest kept pace with the host (gap %d steps)" % int(gap))
	check(called[0] and called[1], "both corners made a call")
	var log0: Array = games[0].m.coachLog
	var log1: Array = games[1].m.coachLog
	check(JSON.stringify(log0) == JSON.stringify(log1) and log0.size() >= 2, "coach calls on the same steps: %s" % JSON.stringify(log0))
	check(not host.desynced and not guest.desynced, "hashes agree")
	check(SimHash.of(games[0].m) == SimHash.of(games[1].m) if games[0].m.frame == games[1].m.frame else true, "same state")

	# --- a stall: the guest falls 2 s behind and catches up
	games[1].stall = 2.0
	await wait_for(func() -> bool: return games[1].stall <= 0.0, 5.0)
	check(await wait_for(func() -> bool: return games[1].ff > 0 and absf(float(games[0].m.frame) - float(games[1].m.frame)) < 60.0, 6.0), "guest caught up after a stall (%d steps fast-forwarded)" % games[1].ff)
	check(not host.desynced and not guest.desynced, "still in sync after the catch-up")

	# --- a drift: the guest's fight changes under it
	games[1].m.fighters[0].hp -= 1.0
	check(await wait_for(func() -> bool: return host.desynced and guest.desynced, 5.0), "a drift is noticed on both sides")

	# --- the end: run both to the end, the host's word stands for the guest
	for g in games:
		g.speed = 1.0
	for k in 2:
		var mm = games[k].m
		while mm.phase != "end":
			mm.step(1.0 / 120.0)
	await wait_for(func() -> bool: return guest.host_outcome != null, 5.0)
	check(guest.host_outcome != null, "the host sent its result")
	var o: Dictionary = guest.outcome(games[1].m)
	var oh: Dictionary = host.outcome(games[0].m)
	check(o.winner == oh.winner and str(o.kind) == str(oh.kind), "the guest takes the host's result (%s, %s)" % [o.winner, o.kind])
	for g in games:
		g.session.unwatch()
		g.queue_free()

	# --- a rematch: both vote, the host starts it
	starts[0] = null
	starts[1] = null
	guest.vote_rematch()
	check(await wait_for(func() -> bool: return host.rematch[1]), "host sees the guest wants a rematch")
	check(starts[0] == null, "...and waits for its own vote")
	host.vote_rematch()
	check(await wait_for(func() -> bool: return starts[0] != null and starts[1] != null), "rematch started on both")
	check(starts[0][2] == starts[1][2], "...with one new seed")

	# --- the guest leaves: the room stays open
	guest.close()
	check(await wait_for(func() -> bool: return not host.connected and host.note.contains("left")), "host sees the guest leave: %s" % host.note)
	check(not host.closed, "the room stays open")
	# --- and comes back on the same code
	var again := OnlineSession.join(host.code, bot_b)
	root.add_child(again)
	check(await wait_for(func() -> bool: return host.can_fight and again.can_fight, 20.0), "a guest can join again")
	# --- the host closes the room
	var why4 := [""]
	again.ended.connect(func(w: String) -> void: why4[0] = w)
	host.close()
	check(await wait_for(func() -> bool: return why4[0] != "", 8.0), "guest told: %s" % why4[0])
	check(why4[0] == "The host closed the room.", "...that the host closed the room")

	server.close()
	print("ALL OK" if fails == 0 else "%d FAILED" % fails)
	quit(1 if fails else 0)
