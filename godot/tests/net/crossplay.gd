## One side of an online room against another process (a second copy of this, or the web game in
## a browser: tools/net/crossplay/run.mjs), through a local peer server (peer_server_main.gd).
##   BB_PEER=127.0.0.1:9124 BB_XP_ROLE=host|guest BB_XP_CODE=<file> godot --headless --path godot \
##     -s res://tests/net/crossplay.gd
## The host writes its room code to BB_XP_CODE; the guest reads it from there. Both play 20 s of a
## fight (stepping the sim in real time, paced by the session, a coach call from each corner) and
## print XP lines: the bots, the seed, the coach log, hashes compared, whether they drifted.
extends SceneTree

var session: OnlineSession
var m = null
var speed := 1.0
var net_hash_every := 0
var net_hashes: Array = []
var acc := 0.0
var t := 0.0
var compared := 0
var called := false
var done_at := -1.0
const END := 6000


func _initialize() -> void:
	TInit.run()
	var role := OS.get_environment("BB_XP_ROLE")
	var file := OS.get_environment("BB_XP_CODE")
	var rng := TMath.Rng.new(5.0 if role == "host" else 6.0)
	var bot = TLoadout.randomBot(rng)
	bot.name_ = "Godot " + role
	if role == "host":
		session = OnlineSession.host(bot)
	else:
		var code := ""
		while code == "":
			OS.delay_msec(200)
			if FileAccess.file_exists(file):
				code = FileAccess.get_file_as_string(file).strip_edges()
		session = OnlineSession.join(code, bot)
	session.failed.connect(func(w: String) -> void:
		print("XP failed ", w)
		quit(1))
	session.ended.connect(func(w: String) -> void: print("XP ended ", w))
	session.start.connect(_start)
	root.add_child(session)
	if role == "host":
		session.changed.connect(func() -> void:
			if OS.get_environment("BB_NET_DEBUG") != "":
				print("XP changed connected %s peer %s blocker '%s' checking %s note %s" % [session.connected, session.peer_bot != null, session.blocker, session.checking, session.note])
			if session.code != "" and not FileAccess.file_exists(file):
				var f := FileAccess.open(file, FileAccess.WRITE)
				f.store_string(session.code)
				f.close()
				print("XP code ", session.code)
			if session.can_fight and m == null:
				print("XP peer ", session.peer_bot.name_, " blocker '", session.blocker, "'")
				session.start_fight())
	else:
		session.changed.connect(func() -> void:
			if session.can_fight and m == null:
				print("XP peer ", session.peer_bot.name_, " blocker '", session.blocker, "'"))


func _start(a, b, seed: float) -> void:
	print("XP start seed %d a %s b %s" % [int(seed), a.name_, b.name_])
	print("XP bots ", JSON.stringify(TInit.to_json([a, b])).sha256_text().substr(0, 16))
	m = TMatch.Match.new(a, b, seed)
	session.watch(self, m)


func fast_forward(n: int) -> void:
	for i in n:
		if m.phase == "end" or int(m.frame) >= END:
			break
		_step()


func _step() -> void:
	m.step(1.0 / 120.0)
	if net_hash_every > 0 and int(m.frame) % net_hash_every == 0:
		net_hashes.append([int(m.frame), SimHash.of(m)])
		compared += 1


func _process(dt: float) -> bool:
	t += dt
	if t > float(OS.get_environment("BB_XP_TIMEOUT") if OS.get_environment("BB_XP_TIMEOUT") != "" else "120"):
		print("XP timeout")
		return true
	if m == null:
		return false
	session.frame(dt)
	if not called and m.phase == "fight" and m.coachReady(float(session.me)):
		called = true
		session.coach("allIn" if session.me == 0 else "head")
	acc += minf(dt, 0.1) * speed
	while acc >= 1.0 / 120.0 and int(m.frame) < END:
		acc -= 1.0 / 120.0
		_step()
	# the intro, the countdown and 20-odd s of fighting, then a moment for the other side to get
	# there too before the room closes
	if int(m.frame) >= END or m.phase == "end":
		if done_at < 0.0:
			done_at = t
			print("XP frame %d hashes %d desynced %s" % [int(m.frame), compared, session.desynced])
			print("XP coach ", JSON.stringify(m.coachLog))
			print("XP state %x" % SimHash.of(m))
		elif t - done_at > 4.0:
			print("XP desynced-after %s" % session.desynced)
			session.close()
			return true
	return false
