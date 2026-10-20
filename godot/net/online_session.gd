## One online room, from either side (src/net/session.ts OnlineSession, the same messages, so the
## other player may be on the web game).
##
## Fights are lockstep-free: the host picks a seed and sends it with both bots, and each phone then
## runs the whole fight itself. The sim is deterministic, so both screens show the same punches
## landing. What crosses the wire during a fight is just pacing (each side's step count, so a phone
## that stalled or went to the background catches up), the corners' coach calls (scheduled for one
## step on both phones), and a state hash every half second, which proves the two fights are still
## the same one. If they ever drift apart the host's result stands.
##
## A Node under the App, running even while the tree is paused, so the room stays up from any
## screen. Gone (freed) once closed.
class_name OnlineSession
extends Node

## Something on the room screen changed.
signal changed
## Start a fight between these bots with this seed (host left, guest right).
signal start(a, b, seed: float)
## The room is over (left, closed by the host, or the link died), and why.
signal ended(why: String)
## Opening the room or joining one failed, and why (the session is closed).
signal failed(why: String)

## Bump when the messages change shape (session.ts PROTOCOL).
const PROTOCOL := 2
## Steps between state hashes (half a second of fight).
const HASH_EVERY := 60
## Seconds between step-count updates during a fight.
const TICK_EVERY := 0.1
const STEPS_PER_S := 120.0
## Steps of headroom a coach call is scheduled ahead of both phones, on top of the network trip.
const COACH_LEAD := 30
const COACH_KINDS := ["go", "allIn", "defend", "head"]
const VERSIONS := "You're on different versions of the game. Both update to the newest version, then try again."

## "host" or "guest".
var role := "host"
## Fighter index this player controls: the host is on the left, the guest on the right.
var me := 0
var code := ""
## Still opening the room or joining it.
var connecting := true
var my_bot
var peer_bot = null
## Why the two can't fight together, if they can't (different game versions).
var blocker := ""
## Status line for the room screen.
var note := ""
## Both sides' "rematch" taps after a fight.
var rematch := [false, false]
## The fight on screen drifted from the other player's.
var desynced := false
## The other player left mid-fight (the fight still plays out here).
var peer_left := false
## The host's word on how the fight ended ({winner, kind}), for when the fights drifted apart.
var host_outcome = null
var closed := false

var link: NetLink
var _room: NetRoom
var _join: NetJoin
var _peer_fp := -1
var _peer_v := -1.0
## Their numbers have been checked against ours (see _versions).
var _versions_known := false
var _hello_due := false
var _m = null
var _game
var _peer_n := -1.0
## Smoothed step gap to the other phone (+ = they're ahead).
var _lag := 0.0
var _peer_at := 0
var _tick_t := 0.0
var _mine := {}
var _theirs := {}
var _sent_result = null


func _init(role_: String, bot) -> void:
	role = role_
	me = 0 if role == "host" else 1
	my_bot = bot
	process_mode = Node.PROCESS_MODE_ALWAYS
	name = "OnlineSession"
	NetFingerprint.start()


## Open a room and wait for someone to join with its code. Add it to the tree; `changed` once the
## code is ready, `failed` if no room could be opened.
static func host(bot) -> OnlineSession:
	var s := OnlineSession.new("host", bot)
	s._room = NetRoom.new()
	s._room.ready.connect(func() -> void:
		s.code = s._room.code
		s.connecting = false
		s.note = "Waiting for a challenger"
		s.changed.emit())
	s._room.failed.connect(s._failed)
	s._room.guest.connect(s._attach)
	s._room.open()
	return s


## Join the room with this code: `changed` once in, `failed` if not.
static func join(code_: String, bot) -> OnlineSession:
	var s := OnlineSession.new("guest", bot)
	s.code = NetRoom.normalize_code(code_)
	s._join = NetJoin.new()
	s._join.joined.connect(func(l: NetLink) -> void:
		s.connecting = false
		s._attach(l))
	s._join.failed.connect(s._failed)
	s._join.start(s.code)
	return s


func _failed(why: String) -> void:
	if closed:
		return
	close()
	failed.emit(why)


var connected: bool:
	get:
		return link != null and not link.closed
var peer_lost: bool:
	get:
		return link != null and link.lost
var rtt: float:
	get:
		return link.rtt if link != null else 0.0
var can_fight: bool:
	get:
		return connected and peer_bot != null and blocker == "" and _peer_fp >= 0 and not checking
## Still working out this phone's sim fingerprint (the hello waits for it).
var checking: bool:
	get:
		return not NetFingerprint.is_ready()


func _process(dt: float) -> void:
	if closed:
		return
	if _room != null:
		_room.poll(dt)
	if _join != null:
		_join.poll(dt)
	if link != null:
		link.poll(dt)
	if NetFingerprint.is_ready():
		if _hello_due:
			_hello_due = false
			_send({"t": "hello", "v": PROTOCOL, "fp": NetFingerprint.value, "bot": TInit.to_json(my_bot)})
		# (their hello came while this phone was still working its number out)
		if _peer_fp >= 0 and not _versions_known and _versions():
			changed.emit()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED and link != null:
		link.wake()


func _send(m: Dictionary) -> void:
	if link != null:
		link.send(m)


func _attach(l: NetLink) -> void:
	link = l
	peer_bot = null
	blocker = ""
	_peer_fp = -1
	rematch = [false, false]
	peer_left = false
	note = "Connecting"
	l.message.connect(_receive)
	l.went_quiet.connect(func() -> void: changed.emit())
	l.came_back.connect(func() -> void: changed.emit())
	l.ended.connect(func() -> void: _dropped(l))
	_hello_due = true
	changed.emit()


func _dropped(l: NetLink) -> void:
	if l != link:
		return
	link = null
	peer_left = true
	rematch = [false, false]
	if closed:
		return
	if role == "host":
		# the room stays open: anyone (or the same player again) can come back in on the code
		var who = peer_bot.name_ if peer_bot != null else ""
		peer_bot = null
		blocker = ""
		_peer_fp = -1
		note = "%s left. Waiting for a challenger" % who if who != "" else "Waiting for a challenger"
		changed.emit()
	else:
		close()
		ended.emit("The host closed the room." if l.said_bye else "Lost the connection to the room.")


## A bot from the other side, made safe (store.ts sanitizeBot), in this app's key names.
static func _bot(raw):
	var b = TInit.from_json(raw) if raw is Dictionary else null
	return Store.keep_skin(TSaves.sanitizeBot(b), b)


func _receive(m: Dictionary) -> void:
	match str(m.t):
		"hello":
			peer_bot = _bot(m.get("bot"))
			_peer_fp = int(float(m.get("fp", -1))) & 0xFFFFFFFF
			_peer_v = float(m.get("v", 0))
			blocker = ""
			_versions_known = false
			_versions()
			note = "%s joined" % peer_bot.name_ if role == "host" else "Connected"
			changed.emit()
		"bot":
			peer_bot = _bot(m.get("bot"))
			changed.emit()
		"full":
			close()
			ended.emit("That room already has two players.")
		"start":
			if role != "guest":
				return
			_begin(_bot(m.get("a")), _bot(m.get("b")), float(int(float(m.get("seed", 0))) & 0xFFFFFFFF))
		"tick":
			_peer_n = float(m.get("n", 0))
			_peer_at = Time.get_ticks_msec()
		"hash":
			var n := int(float(m.get("n", -1)))
			var h := int(float(m.get("h", 0))) & 0xFFFFFFFF
			if _mine.has(n):
				_compare(n, _mine[n], h)
			else:
				_theirs[n] = h
		"coach":
			# the other corner's call, for the step they scheduled it at
			var kind := str(m.get("k", ""))
			var n = m.get("n")
			if _m != null and kind in COACH_KINDS and (n is float or n is int):
				_m.queueCoach(float(1 - me), kind, float(n))
		"result":
			host_outcome = {"winner": int(float(m.get("w", -1))), "kind": m.get("r")}
		"rematch":
			rematch[1 - me] = true
			changed.emit()
			_maybe_rematch()


## Whether the two can share a fight (the same protocol and sim fingerprint), once both numbers
## are known: whether that's newly settled.
func _versions() -> bool:
	if _peer_fp < 0 or not NetFingerprint.is_ready():
		return false
	blocker = VERSIONS if _peer_v != PROTOCOL or _peer_fp != NetFingerprint.value else ""
	var fresh := not _versions_known
	_versions_known = true
	return fresh


## Our own bot changed (the player went to the garage from the room).
func set_bot(bot) -> void:
	my_bot = bot
	if connected and not _hello_due:
		_send({"t": "bot", "bot": TInit.to_json(bot)})
	changed.emit()


## Host: start a fight with a fresh seed.
func start_fight() -> void:
	if role != "host" or not can_fight:
		return
	var a = _bot(TInit.to_json(my_bot))
	var b = _bot(TInit.to_json(peer_bot))
	var seed := float(Crypto.new().generate_random_bytes(4).decode_u32(0))
	_send({"t": "start", "seed": seed, "a": TInit.to_json(a), "b": TInit.to_json(b)})
	_begin(a, b, seed)


func _begin(a, b, seed: float) -> void:
	rematch = [false, false]
	desynced = false
	host_outcome = null
	_peer_n = -1.0
	_lag = 0.0
	_mine.clear()
	_theirs.clear()
	start.emit(a, b, seed)


## After a fight: this player wants another one. The host starts it once both do.
func vote_rematch() -> void:
	if not connected:
		return
	rematch[me] = true
	_send({"t": "rematch"})
	changed.emit()
	_maybe_rematch()


func _maybe_rematch() -> void:
	if role == "host" and rematch[0] and rematch[1]:
		start_fight()


# ------------------------------------------------------------------------------ the fight

## Follow this match: pace it against the other phone and compare hashes.
func watch(game, m) -> void:
	_game = game
	_m = m
	game.net_hash_every = HASH_EVERY


func unwatch() -> void:
	if _game != null:
		_game.speed = 1.0
		_game.net_hash_every = 0
	_m = null
	_game = null


## Whether this session is following match `m`.
func watching(m) -> bool:
	return m != null and _m == m


## This player's corner makes a call. Both phones must apply it on the same step, so it's
## scheduled a little past where either of them is now (plus the time the message takes to get
## there), and sent to the other side with that step. (Called while the sim is idle.)
func coach(kind: String) -> void:
	var m = _m
	if m == null or not m.coachReady(float(me)):
		return
	var peer: float = m.frame if _peer_n < 0.0 else _peer_estimate(m)
	var trip := ceili(rtt / 1000.0 * STEPS_PER_S)
	var at := float(roundi(maxf(m.frame, peer)) + COACH_LEAD + mini(trip, 120))
	m.queueCoach(float(me), kind, at)
	_send({"t": "coach", "k": kind, "n": at})


## Where the other phone's fight is now, by its last word and how long ago that was.
func _peer_estimate(m) -> float:
	var silent := (Time.get_ticks_msec() - _peer_at) / 1000.0
	return _peer_n + (silent + rtt / 2000.0) * STEPS_PER_S * float(m.pace)


## The state hashes the fight took since the last frame ([step, hash] pairs, Game.net_hashes).
func _hashes(list: Array) -> void:
	for e in list:
		var n: int = e[0]
		var h: int = e[1]
		_mine[n] = h
		_send({"t": "hash", "n": n, "h": h})
		if _theirs.has(n):
			_compare(n, h, _theirs[n])
			_theirs.erase(n)
		# only recent history matters
		_mine.erase(n - HASH_EVERY * 40)
	for n in _theirs.keys():
		if n < int(_m.frame) - HASH_EVERY * 40:
			_theirs.erase(n)


func _compare(n: int, mine: int, theirs: int) -> void:
	if mine == theirs or desynced:
		return
	desynced = true
	push_warning("online: the fights drifted apart at step %d: %x vs %x" % [n, mine, theirs])
	changed.emit()


func _send_result(m) -> void:
	if _sent_result == m:
		return
	_sent_result = m
	_send({"t": "result", "w": int(m.winner.index) if m.winner != null else -1, "r": m.result})


## How the fight ended ({winner, kind}), by the host's word if the two fights drifted apart.
func outcome(m) -> Dictionary:
	if role == "guest" and desynced and host_outcome != null:
		return host_outcome
	return {"winner": int(m.winner.index) if m.winner != null else -1, "kind": m.result}


## Every frame of an online fight, while the sim is idle (Game.net_frame): tell the other side where
## we are. The guest runs a little faster or slower to show the same moment as the host, and either
## phone that fell well behind (it was in the background, or stalled) catches up at once, silently.
func frame(dt: float) -> void:
	var m = _m
	var g = _game
	if m == null or g == null:
		return
	if not g.net_hashes.is_empty():
		var list: Array = g.net_hashes
		g.net_hashes = []
		_hashes(list)
	if m.phase == "end":
		g.speed = 1.0
		if role == "host":
			_send_result(m)
		return
	_tick_t -= dt
	if _tick_t <= 0.0:
		_tick_t = TICK_EVERY
		_send({"t": "tick", "n": m.frame})
	var silent := (Time.get_ticks_msec() - _peer_at) / 1000.0
	if not connected or _peer_n < 0.0 or silent > 1.0:
		# no fresh word from them: play on at normal speed, they'll catch up
		g.speed = 1.0
		return
	var est := _peer_estimate(m)
	var diff: float = est - m.frame
	if diff > 90.0:
		# way behind (this phone stalled or was in the background): jump, silently
		g.fast_forward(mini(roundi(diff), 240))
		_lag = 0.0
		g.speed = 1.0
		return
	# the host keeps the beat; the guest follows it. (One steering side can't drift: two would
	# both read a slow network as "the other one is ahead" and speed up together.)
	if role == "host":
		g.speed = 1.0
		return
	# frame times and message timing are noisy: steer on a smoothed gap, gently
	_lag += (diff - _lag) * minf(1.0, dt * 3.0)
	var gap := 0.0 if absf(_lag) < 4.0 else _lag
	g.speed = minf(1.35, maxf(0.0 if diff < -90.0 else 0.65, 1.0 + gap / 60.0))


# ------------------------------------------------------------------------------ teardown

func close() -> void:
	if closed:
		return
	closed = true
	unwatch()
	var l := link
	link = null
	if l != null:
		l.leave()
	if _room != null:
		_room.close()
	if _join != null:
		_join.cancel()
	queue_free()
