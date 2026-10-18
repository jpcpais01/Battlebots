## The Skin Vault's own sounds, synthesized once on first use (no clips to ship): the capsule's
## rising charge, the seam's crack and burst, a chime per rarity (a bell for a Common, a bright
## run up for a Rare, a full shimmering chord for an Epic), a card flipping and the paint-on hiss.
## Played on the effects bus, so the sound switch mutes them with everything else.
class_name GachaSound
extends Node

const RATE := 22050

static var _bank := {}
var _players: Array[AudioStreamPlayer] = []


func _ready() -> void:
	for i in 6:
		var p := AudioStreamPlayer.new()
		p.bus = &"Fx"
		add_child(p)
		_players.append(p)


## Play one ("riser", "crack", "burst", "chime0".."chime2", "flip", "paint", "coin").
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


static func stream(id: String) -> AudioStreamWAV:
	if _bank.has(id):
		return _bank[id]
	var data: PackedFloat32Array
	match id:
		"riser":
			data = _riser(1.9)
		"crack":
			data = _crack()
		"burst":
			data = _burst()
		"chime0":
			data = _chord([523.25, 783.99], 0.0, 0.9, 0.5)
		"chime1":
			data = _chord([587.33, 739.99, 880.0, 1174.66], 0.07, 1.4, 0.55)
		"chime2":
			data = _chord([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.06, 2.6, 0.6, true)
		"flip":
			data = _flip()
		"paint":
			data = _paint()
		"coin":
			data = _chord([1318.5, 1975.5], 0.05, 0.5, 0.35)
		_:
			return null
	var s := _wav(data)
	_bank[id] = s
	return s


static func _wav(d: PackedFloat32Array) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(d.size() * 2)
	for i in d.size():
		bytes.encode_s16(i * 2, int(clampf(d[i], -1.0, 1.0) * 32000.0))
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


## Make the next sound not yet made (one per call: spread over frames before the first pull).
## Whether any were left.
static func warm_one() -> bool:
	for id in ["riser", "crack", "burst", "chime0", "chime1", "chime2", "flip", "paint", "coin"]:
		if not _bank.has(id):
			stream(id)
			return true
	return false
