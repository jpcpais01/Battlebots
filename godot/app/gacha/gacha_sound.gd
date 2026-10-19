## The Skin Vault's own sounds, synthesized once (no clips to ship): the capsule's rising charge,
## the seam's crack and burst, a chime per rarity (a bell for a Common, a bright run up for a Rare,
## a full shimmering chord for an Epic), a card flipping and the paint-on hiss, and the gumball
## machine's own: its crank's ratchet, the chute's clunk and a capsule's pop.
## Played on the effects bus, so the sound switch mutes them with everything else.
##
## The synthesis is a per-sample loop in GDScript (the Epic chime alone is ~380k iterations, half
## a second on a phone), so it all runs once on a WorkerThreadPool task, started the first time a
## GachaSound is made (the vault building its screen or stage), long before the first pull. The
## worker only fills PCM bytes under a mutex; the AudioStreamWAVs are wrapped around them on the
## caller's thread the first time each is played. A sound asked for before the worker got to it is
## skipped that once rather than made on the main thread (the order below makes the pull's first
## sounds first, so in practice everything is ready seconds before it's wanted).
class_name GachaSound
extends Node

const RATE := 22050
## Every sound, in the order the worker makes them: the pull's own first (crank, chute, pop, the
## capsule's riser, crack and burst, the chimes), then the rest.
const IDS := ["crank", "chute", "pop", "riser", "crack", "burst", "chime0", "chime1", "chime2", "paint", "flip", "coin"]

## Made streams, by id (main thread side; built from _pcm on first use).
static var _bank := {}
## 16-bit PCM the worker has finished, by id, waiting to be wrapped in a stream.
static var _pcm := {}
## Guards _bank, _pcm and _task (the vault can be built on a loader thread).
static var _mutex := Mutex.new()
## The synthesis task: -1 not started, -2 finished and reaped, else its WorkerThreadPool id.
static var _task := -1
var _players: Array[AudioStreamPlayer] = []


func _init() -> void:
	# the vault's screen and stage each make one when they're built: start making the sounds now
	_start()


func _ready() -> void:
	for i in 6:
		var p := AudioStreamPlayer.new()
		p.bus = &"Fx"
		add_child(p)
		_players.append(p)


## Play one ("riser", "crack", "burst", "chime0".."chime2", "flip", "paint", "coin", "crank",
## "chute", "pop"). Silently skipped if the worker hasn't made it yet.
func play(id: String, gain := 1.0, pitch := 1.0) -> void:
	var s := stream(id)
	if s == null:
		return
	var best := _players[0]
	for p in _players:
		if not p.playing:
			best = p
			break
	best.stream = s
	best.volume_linear = gain
	best.pitch_scale = pitch
	best.play()


func stop_all() -> void:
	for p in _players:
		p.stop()


## The sound `id`, or null when it's unknown or the worker hasn't finished it yet (never made
## here: see the top of the file).
static func stream(id: String) -> AudioStreamWAV:
	_start()
	_mutex.lock()
	var s: AudioStreamWAV = _bank.get(id)
	if s == null and _pcm.has(id):
		s = _wav(_pcm[id])
		_bank[id] = s
		_pcm.erase(id)
	_mutex.unlock()
	_reap()
	return s


## Starts the synthesis task if it isn't running or done.
static func _start() -> void:
	_mutex.lock()
	if _task == -1:
		_task = WorkerThreadPool.add_task(_make_all, false, "GachaSound")
	_mutex.unlock()


## Once the task has finished, waits on it (instant then) so the pool can drop its record. The
## id is claimed under the lock so it's only ever waited on once.
static func _reap() -> void:
	_mutex.lock()
	var id := _task
	var done := id >= 0 and WorkerThreadPool.is_task_completed(id)
	if done:
		_task = -2
	_mutex.unlock()
	if done:
		WorkerThreadPool.wait_for_task_completion(id)


## The worker: makes every sound in turn, handing each over as soon as it's done. Pure maths on
## locals only (no nodes, no shared buffers), so it's safe off the main thread.
static func _make_all() -> void:
	for id in IDS:
		var bytes := _pcm16(_synth(id))
		_mutex.lock()
		_pcm[id] = bytes
		_mutex.unlock()


static func _synth(id: String) -> PackedFloat32Array:
	match id:
		"riser":
			return _riser(1.9)
		"crack":
			return _crack()
		"burst":
			return _burst()
		"chime0":
			return _chord([523.25, 783.99], 0.0, 0.9, 0.5)
		"chime1":
			return _chord([587.33, 739.99, 880.0, 1174.66], 0.07, 1.4, 0.55)
		"chime2":
			return _chord([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.06, 2.6, 0.6, true)
		"flip":
			return _flip()
		"paint":
			return _paint()
		"coin":
			return _chord([1318.5, 1975.5], 0.05, 0.5, 0.35)
		"crank":
			return _crank(1.5)
		"chute":
			return _chute()
		"pop":
			return _pop()
	return PackedFloat32Array()


static func _pcm16(d: PackedFloat32Array) -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(d.size() * 2)
	for i in d.size():
		bytes.encode_s16(i * 2, int(clampf(d[i], -1.0, 1.0) * 32000.0))
	return bytes


static func _wav(bytes: PackedByteArray) -> AudioStreamWAV:
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = bytes
	return s


static func _buf(secs: float) -> PackedFloat32Array:
	var d := PackedFloat32Array()
	d.resize(int(secs * RATE))
	return d


## A swell: a tone sweeping up an octave and a half over breathy noise, with a tremolo that
## quickens, cut off at its peak (the burst takes over).
static func _riser(secs: float) -> PackedFloat32Array:
	var d := _buf(secs)
	var ph := 0.0
	var ph2 := 0.0
	var lp := 0.0
	var seed := 1234567
	for i in d.size():
		var t := float(i) / RATE
		var k := t / secs
		var f := 110.0 * pow(2.0, k * 2.6)
		ph += TAU * f / RATE
		ph2 += TAU * f * 1.503 / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		lp += (n - lp) * (0.05 + k * 0.4)
		var trem := 0.75 + 0.25 * sin(TAU * (4.0 + k * 22.0) * t)
		var env := k * k * (1.0 - smoothstep(0.96, 1.0, k))
		d[i] = (sin(ph) * 0.35 + sin(ph2) * 0.15 + lp * 0.5) * env * trem * 0.8
	return d


## The seam cracking open: a sharp click and a short metallic ring.
static func _crack() -> PackedFloat32Array:
	var d := _buf(0.5)
	var seed := 98765
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		var click := n * exp(-t * 90.0)
		var ring := (sin(TAU * 1870.0 * t) + sin(TAU * 2630.0 * t) * 0.6) * exp(-t * 14.0) * 0.25
		d[i] = (click * 0.8 + ring) * 0.9
	return d


## The capsule bursting: a deep boom under a bright shower of noise.
static func _burst() -> PackedFloat32Array:
	var d := _buf(1.6)
	var seed := 424242
	var hp := 0.0
	var last := 0.0
	var ph := 0.0
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		hp = 0.92 * (hp + n - last)
		last = n
		ph += TAU * (40.0 + 90.0 * exp(-t * 9.0)) / RATE
		var boom := sin(ph) * exp(-t * 3.5)
		var shower := hp * exp(-t * 2.2) * (0.6 + 0.4 * sin(TAU * 31.0 * t))
		d[i] = boom * 0.75 + shower * 0.35
	return d


## A bell-like chord, each note `stagger` s after the last, ringing `secs`; a shimmer of fast
## high partials over it when `sparkle`.
static func _chord(freqs: Array, stagger: float, secs: float, gain: float, sparkle := false) -> PackedFloat32Array:
	var d := _buf(secs + stagger * freqs.size())
	for j in freqs.size():
		var f: float = freqs[j]
		var start := int(stagger * j * RATE)
		for i in range(start, d.size()):
			var t := float(i - start) / RATE
			var env := minf(1.0, t * 200.0) * exp(-t * 3.2 / secs)
			# a bell: the fundamental, an inharmonic partial and the octave
			var v := sin(TAU * f * t) + sin(TAU * f * 2.756 * t) * 0.25 * exp(-t * 6.0) + sin(TAU * f * 2.0 * t) * 0.3
			d[i] += v * env * gain / freqs.size() * 1.6
	if sparkle:
		var seed := 777
		for i in d.size():
			var t := float(i) / RATE
			seed = (seed * 1103515245 + 12345) & 0x7fffffff
			if seed % 900 == 0:
				var f := 2400.0 + float(seed % 2400)
				for k in range(i, mini(i + 2200, d.size())):
					var u := float(k - i) / RATE
					d[k] += sin(TAU * f * u) * exp(-u * 30.0) * 0.08 * exp(-t * 1.2)
	return d


## A card turning over: a soft swish and a tap.
static func _flip() -> PackedFloat32Array:
	var d := _buf(0.18)
	var seed := 31337
	var lp := 0.0
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		lp += (n - lp) * 0.3
		var swish := lp * sin(PI * minf(1.0, t / 0.12))
		var tap := sin(TAU * 900.0 * t) * exp(-maxf(0.0, t - 0.1) * 120.0) * (1.0 if t >= 0.1 else 0.0) * 0.4
		d[i] = (swish * 0.5 + tap) * 0.7
	return d


## A spray of paint going on (the sweep up the robot).
static func _paint() -> PackedFloat32Array:
	var d := _buf(1.1)
	var seed := 2468
	var bp := 0.0
	var bp2 := 0.0
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		# a rough band-pass, rising as it sweeps up
		var k := 0.25 + 0.5 * (t / 1.1)
		bp += (n - bp) * k
		bp2 += (bp - bp2) * k
		var env := sin(PI * minf(1.0, t / 1.1)) * (0.8 + 0.2 * sin(TAU * 13.0 * t))
		d[i] = (bp - bp2) * env * 0.9
	return d


## The crank turning: a ratchet's clicks, quickening as it gets going, over a low gear grind.
static func _crank(secs: float) -> PackedFloat32Array:
	var d := _buf(secs)
	var seed := 5150
	var lp := 0.0
	# the clicks: each a short knock with a little ring, closer together as the crank speeds up
	var t_click := 0.0
	var gap := 0.11
	while t_click < secs - 0.05:
		var start := int(t_click * RATE)
		var f := 1500.0 + float(int(t_click * 1000.0) % 3) * 180.0
		for i in range(start, mini(start + int(0.05 * RATE), d.size())):
			var u := float(i - start) / RATE
			seed = (seed * 1103515245 + 12345) & 0x7fffffff
			var n := float(seed) / 0x7fffffff * 2.0 - 1.0
			d[i] += (n * exp(-u * 260.0) * 0.7 + sin(TAU * f * u) * exp(-u * 90.0) * 0.35) * 0.75
		t_click += gap
		gap = maxf(0.055, gap * 0.93)
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		lp += (n - lp) * 0.02
		var env := minf(1.0, t * 6.0) * (1.0 - smoothstep(secs - 0.25, secs, t))
		d[i] = d[i] * (1.0 - smoothstep(secs - 0.2, secs, t)) + (lp * 1.6 + sin(TAU * 55.0 * t) * 0.08) * env * 0.5
	return d


## The chute's flap swinging open: a heavy clunk, then the whoosh of the capsule rolling out.
static func _chute() -> PackedFloat32Array:
	var d := _buf(0.9)
	var seed := 8080
	var bp := 0.0
	var bp2 := 0.0
	var ph := 0.0
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		ph += TAU * (90.0 + 60.0 * exp(-t * 30.0)) / RATE
		var clunk := (sin(ph) * 0.8 + n * 0.3 * exp(-t * 80.0)) * exp(-t * 16.0)
		var k := 0.04 + 0.2 * smoothstep(0.1, 0.6, t)
		bp += (n - bp) * k
		bp2 += (bp - bp2) * k
		var whoosh := (bp - bp2) * sin(PI * clampf((t - 0.08) / 0.8, 0.0, 1.0)) * 2.2
		d[i] = clunk * 0.8 + whoosh * 0.45
	return d


## A capsule popping open: a cork's pop, a bright squeak up and a fizz of sparkle.
static func _pop() -> PackedFloat32Array:
	var d := _buf(0.6)
	var seed := 6060
	var hp := 0.0
	var last := 0.0
	var ph := 0.0
	for i in d.size():
		var t := float(i) / RATE
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		var n := float(seed) / 0x7fffffff * 2.0 - 1.0
		hp = 0.85 * (hp + n - last)
		last = n
		ph += TAU * (320.0 + 900.0 * smoothstep(0.0, 0.07, t)) / RATE
		var pop := sin(ph) * exp(-t * 28.0)
		var click := n * exp(-t * 400.0)
		var fizz := hp * exp(-t * 7.0) * (0.5 + 0.5 * sin(TAU * 47.0 * t)) * smoothstep(0.0, 0.03, t)
		d[i] = pop * 0.7 + click * 0.6 + fizz * 0.25
	return d


## Kept for the vault screen's tick: makes sure the worker is going (nothing is made here) and
## reaps it once it's done. Whether any sounds are still to come.
static func warm_one() -> bool:
	_start()
	_reap()
	_mutex.lock()
	var left := _task != -2
	_mutex.unlock()
	return left
