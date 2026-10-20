## What this phone's fight sim does, boiled down to one number (src/net/fingerprint.ts
## simFingerprint): the game data's hash (FpData.DATA, from the web game) and then a few seconds of a
## fixed fight, hashed to the last bit. Two players can only share a fight when theirs match; a
## different number means a different version of the game (or maths that round differently), so
## the fight would drift apart on their screens. It equals the web game's (FpData.WEB) when both are
## built from the same game, so phones and browsers can meet in a room.
##
## The fight costs a couple of seconds of GDScript, so it runs on a worker thread when the room
## screen opens (start), and is kept for this build of the app on this phone.
class_name NetFingerprint
extends RefCounted

const SIM_DT := 1.0 / 120.0

## The number, or -1 until it's worked out.
static var value := -1
static var _task := -1


## Work it out in the background (or read it from this build's last run).
static func start() -> void:
	if value >= 0 or _task >= 0:
		return
	var cached = Store.pref("simFingerprint")
	if cached is Dictionary and str(cached.get("key", "")) == _key() and _key() != "":
		value = int(cached.get("fp", -1))
		if value >= 0:
			return
	_task = WorkerThreadPool.add_task(_run, false, "sim fingerprint")


## Whether it's ready (picks up the worker's result).
static func is_ready() -> bool:
	if _task >= 0 and WorkerThreadPool.is_task_completed(_task):
		wait()
	return value >= 0


## Wait for the worker, if it's running (Game.start_match: a fight can't step alongside it).
static func wait() -> void:
	if _task < 0:
		return
	WorkerThreadPool.wait_for_task_completion(_task)
	_task = -1
	if _key() != "":
		Store.set_pref("simFingerprint", {"key": _key(), "fp": value})


## Still working (nothing else may step a fight meanwhile: the sim's scratch vectors are shared).
static func busy() -> bool:
	return _task >= 0 and not is_ready()


## This build on this engine: a local build ("dev") works it out every time.
static func _key() -> String:
	var v := str(ProjectSettings.get_setting("application/config/version", "dev"))
	if v == "" or v == "dev":
		return ""
	return "%s|%s|%d" % [v, Engine.get_version_info().string, FpData.DATA]


static func _run() -> void:
	var t0 := Time.get_ticks_msec()
	value = compute()
	if OS.get_environment("BB_NET_DEBUG") != "":
		print("[net] sim fingerprint %x in %d ms" % [value, Time.get_ticks_msec() - t0])


static func compute() -> int:
	var rng := TMath.Rng.new(float(0xb07b07))
	var a = TLoadout.randomBot(rng, 0.9)
	var b = TLoadout.randomBot(rng, 0.9)
	var m = TMatch.Match.new(a, b, float(0x5eed))
	m.skipIntro()
	# the countdown, touching gloves, then a few seconds of fighting
	for i in 1800:
		if m.phase == "end":
			break
		m.step(SIM_DT)
	# (fingerprint.ts mix: h = Math.imul(h ^ v, 0x01000193), the low 32 bits)
	return ((FpData.DATA ^ SimHash.of(m)) * 0x01000193) & 0xFFFFFFFF
