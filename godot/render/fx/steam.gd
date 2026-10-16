## High-pressure vapour blowing out of the hinges of wrecked parts (port of src/render/steam.ts
## Steam). Once a part is badly beaten its joint seals fail and every 3 to 7 seconds blast out a
## hissing jet of white vapour, anywhere from a short puff to a full blast (harder the closer the
## part is to failing). A hit can set it off early. A part that comes off stops venting.
##
## The vents run here as in the web; the puffs are GPU-animated (steam.gdshader replays each
## puff's flight from its birth), so a venting robot costs only the puffs it emits.
class_name FxSteam
extends Node3D

## Vapour puffs alive at once (one instanced draw).
const MAX_PUFFS := 1100
## Hinges venting at once: every venting part of both robots.
const MAX_VENTS := 32
## Seconds between bursts of one hinge: a random wait in this range.
const WAIT_MIN := 3.0
const WAIT_MAX := 7.0
## The smallest burst, as a share of the fullest.
const MIN_BLOW := 0.3
## Puff kinds: the pressurised core streaking out, the cloud rolling off it, and a seep.
const CORE := 0
const BILLOW := 1
const WISP := 2
const SHADER := preload("res://render/fx/steam.gdshader")
const ATLAS := preload("res://assets/fx/vapour.png")


class Vent:
	## Which way round the hinge the jet points (radians from the robot's front).
	var angle := 0.0
	## Seconds until the next burst (3 to 7, at random).
	var wait := 0.0
	## Seconds since the last burst started.
	var since := 0.0
	## How big the current burst is: 1 is the fullest blast, down to MIN_BLOW.
	var blow := 1.0
	## Seconds left of the current burst (0 when only seeping).
	var burst := 0.0
	## Length of the current burst, for its envelope.
	var burst_len := 0.0
	## 0..1 how wrecked the part is (from the last update).
	var k := 0.0
	## Fractional puffs carried between frames (jet core, billows).
	var carry := 0.0
	var carry_b := 0.0
	var seen := true
	var pos := Vector3.ZERO
	var dir := Vector3.ZERO
	var size := 1.0


var clock := 0.0
var _vents := {}
var _pool: FxPool


func _init() -> void:
	name = "Steam"
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	_pool = FxPool.new(MAX_PUFFS, quad, SHADER, true, true)
	_pool.mat.set_shader_parameter("atlas", ATLAS)
	# drawn after the glows (the web's renderOrder 1)
	_pool.sorting_offset = -1.0
	add_child(_pool)


static func _next_wait() -> float:
	return WAIT_MIN + randf() * (WAIT_MAX - WAIT_MIN)


## Keep the hinge of one wrecked part venting this frame. `a`->`b` is the segment the jet blows
## out across, `t` how far along it the hinge is, `radius` how far out its seal is. `fwd` is the
## robot's facing; `side` (or ZERO) turns a limb's jet to its outer side. `k` is 0 (just heavily
## damaged) to 1 (about to fail). Returns the length of a burst that starts now (for its hiss;
## its size is then blow_of(key)), else 0.
func vent(key: int, a: Vector3, b: Vector3, t: float, radius: float, fwd: Vector3, side: Vector3, k: float, size: float, dt: float) -> float:
	var v: Vent = _vents.get(key)
	if v == null:
		if _vents.size() >= MAX_VENTS:
			return 0.0
		v = Vent.new()
		v.angle = (randf() - 0.5) * 2.6
		# the seal gives straight away, then every few seconds
		v.wait = 0.0
		_vents[key] = v
	v.seen = true
	v.k = k
	v.size = size
	# a frame around the segment: its axis, the robot's front squared off against it, and the side
	var ax := b - a
	if ax.length_squared() < 1e-8:
		ax = Vector3.UP
	ax = ax.normalized()
	var r := fwd - ax * fwd.dot(ax)
	if r.length_squared() < 1e-6:
		r = ax.cross(Vector3.UP if absf(ax.y) < 0.9 else Vector3.RIGHT)
	r = r.normalized()
	var s := ax.cross(r)
	var c := cos(v.angle)
	var sn := sin(v.angle)
	v.dir = r * c + s * sn
	if side != Vector3.ZERO and v.dir.dot(side) < 0.0:
		v.dir = r * c - s * sn
	v.pos = a.lerp(b, t) + v.dir * radius
	if dt <= 0.0:
		return 0.0
	var started := 0.0
	v.since += dt
	if v.burst > 0.0:
		v.burst -= dt
	v.wait -= dt
	if v.wait <= 0.0 and v.burst <= 0.0:
		# every 3 to 7 seconds the seal blows, anywhere from a short puff to the full blast
		v.wait = _next_wait()
		v.since = 0.0
		v.blow = MIN_BLOW + randf() * (1.0 - MIN_BLOW)
		v.burst = (0.45 + k * 0.9 + randf() * 0.4) * (0.5 + 0.5 * v.blow)
		v.burst_len = v.burst
		started = v.burst_len
	# a burst screams out at full pressure, then sputters; between bursts the hinge weeps a wisp
	if v.burst > 0.0:
		var e := v.burst / v.burst_len
		var env := minf(1.0, (1.0 - e) * 20.0) * (0.3 + 0.7 * minf(1.0, e * 2.5))
		var speed := (10.0 + k * 5.0) * (0.45 + 0.55 * env) * (0.55 + 0.45 * v.blow)
		# a hard streak of pressure down the middle, with the cloud rolling off it
		v.carry += (70.0 + k * 50.0) * env * v.blow * dt
		v.carry_b += (34.0 + k * 26.0) * env * v.blow * dt
		while v.carry >= 1.0:
			v.carry -= 1.0
			_puff(v, CORE, speed * (0.85 + randf() * 0.3))
		while v.carry_b >= 1.0:
			v.carry_b -= 1.0
			_puff(v, BILLOW, speed * (0.85 + randf() * 0.3))
	else:
		v.carry_b += (2.5 + k * 5.0) * dt
		while v.carry_b >= 1.0:
			v.carry_b -= 1.0
			_puff(v, WISP, 0.5 + randf() * 0.4)
	return started


## The part was hit: the hinge blows on its next update, if it hasn't for 3 seconds.
func kick(key: int) -> void:
	var v: Vent = _vents.get(key)
	if v != null and v.burst <= 0.0 and v.since >= WAIT_MIN:
		v.wait = 0.0


## Size (0..1) of the burst a hinge last started.
func blow_of(key: int) -> float:
	var v: Vent = _vents.get(key)
	return v.blow if v != null else 1.0


## One puff. The core is a tight, fast streak (the pressure) that flares into vapour a hand's
## width out; billows are wider, slower and swell into the cloud around it; a wisp seeps and
## curls upward.
func _puff(v: Vent, kind: int, speed: float) -> void:
	var spread := 0.07 if kind == CORE else (0.38 if kind == BILLOW else 0.5)
	var d := Vector3(v.dir.x + (randf() - 0.5) * spread, v.dir.y + (randf() - 0.5) * spread, v.dir.z + (randf() - 0.5) * spread).normalized()
	var s := speed * (0.3 + randf() * 0.3) if kind == BILLOW else speed
	# billows bloom a little way out, where the jet starts to break up
	var o := (0.04 + randf() * 0.08 if kind == BILLOW else randf() * 0.02) * v.size
	var life: float
	var size0: float
	var grow: float
	var drag: float
	var peak: float
	if kind == CORE:
		life = 0.22 + randf() * 0.14
		size0 = 0.045 * v.size * (0.6 + 0.4 * v.blow)
		grow = 3.5 + randf() * 2.0
		drag = 6.5
		peak = 0.85
	elif kind == BILLOW:
		life = 0.9 + randf() * 0.7
		size0 = (0.08 + randf() * 0.05) * v.size * (0.5 + 0.5 * v.blow)
		grow = 5.0 + randf() * 3.0
		drag = 3.6
		peak = 0.5 + randf() * 0.2
	else:
		life = 1.1 + randf() * 0.7
		size0 = 0.06 * v.size
		grow = 3.5 + randf() * 1.5
		drag = 1.6
		peak = 0.3
	var spin := (randf() - 0.5) * (0.0 if kind == CORE else 2.4)
	_pool.put(Vector3(d.x * s, d.y * s + (0.25 if kind == WISP else 0.0), d.z * s), Vector3(clock, life, size0), Vector3(grow, drag, peak), v.pos + d * o,
		Color(randf() * TAU, spin, randf(), float(randi() % 4) / 4.0), Color(kind, 0, 0, 0))
	_pool.expires = maxf(_pool.expires, clock + life)


## Per frame (the fight's clock: slow motion slows the vapour too).
func update(dt: float) -> void:
	if dt > 0.0:
		# hinges that weren't refreshed went with their part (or the fight ended)
		for key in _vents.keys():
			var v: Vent = _vents[key]
			if not v.seen:
				_vents.erase(key)
			else:
				v.seen = false
	clock += dt
	_pool.flush(clock)


func clear() -> void:
	_vents.clear()
	_pool.clear()
