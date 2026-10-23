## The knockout, again (a TV broadcast's instant replay): once the winner has had its moment, a
## wipe cuts to the blow that ended it played back in slow motion from a low, close angle, then
## wipes back to the ring for the stretcher and the results.
##
## It is the fight itself again, not a recording: a copy of the match made from the nearest
## checkpoint before the blow (ReplayTimeline, which a live fight fills at its big hits) steps on
## the worker, a little each frame while the knockout plays out live, until it stands a couple of
## seconds before the blow (prep_step). When the live match says "end", the Game holds that event,
## puts the copy on screen in its place (wear and torn parts as they were then) and plays it
## through the blow; then it puts the live match back, still in its first step of "end", and lets
## the event go: the stretcher, the booth's wrap-up and the results carry on as if nothing had
## happened. The live match never steps meanwhile, and the copy never writes anything the fight
## keeps (the tape, the pilot's log, the booth's script): it is only watched.
##
## Offline fights only (online, both phones have to show the same thing at the same time), and
## not in a replay of a tape (that has its own controls).
class_name InstantReplay
extends RefCounted

## How long before the blow the replay starts, and how long it runs on after it, in sim steps.
const LEAD := 180
const TAIL := 130
## The live fight takes its checkpoints this close together once someone is in trouble (below
## this share of its health, or down), so there is one near the knockout to start from.
const DANGER_HP := 0.32
const DANGER_SPACING := 120
## A copy further than this many steps from where the replay starts is too long to step there
## (the knockout's own slow motion is ~8 s; a phone steps a few hundred a second at most).
const MAX_PREP := 2400
## The worker's share of a frame the copy may take while the knockout plays out, and a frame's
## worth at most once the live fight is waiting on it.
const PREP_USEC := 7000
const PREP_USEC_WAIT := 14000
## How long the end of the fight may wait on the copy before giving up on the replay (s).
const WAIT_MAX := 3.0
## The blow counts if it landed this close before the knockout (a knockdown counts up to the
## referee's ten).
const BLOW_RECENT := 360
const DOWN_RECENT := 1500

enum { IDLE, PREP, READY, WIPE_IN, PLAY, WIPE_OUT }

var state := IDLE
## The checkpoint the copy starts from, the copy, its uid counter.
var _from: SimSnap = null
var copy = null
var copy_uid := 0.0
var tape: Dictionary
## The steps it plays: from `start` to `stop`, the blow at `focal`.
var start := 0
var focal := 0
var stop := 0
## Who threw it (the winner) and who it felled.
var att := 0
var vic := 1
## What it was: the move's name ("Spinning Heel"), the result ("KO", "TKO", "Dismantled"), the
## winner's name, its accent colour.
var move := ""
var result := "KO"
var winner_name := ""
var accent := Color(1, 0.3, 0.3)
## The live match while the copy is on screen, its uid counter, the player's speed.
var live = null
var live_uid := 0.0
var live_speed := 1.0
## The live "end" event, held until the replay is over ([type, data, frame]).
var held: Array = []
## How long the end has waited on the copy (s).
var waited := 0.0
## The copy's state hashes as it played ([frame, hash] every `every` steps: a test checks them
## against the live fight's).
var hashes: Array = []
## The blow has landed on screen (the overlay's stamp).
var landed := false

# what the live fight did, as it went: per corner, the last clean blow it landed, the knockdown
# its opponent is still down from, the last part it tore off, the finisher it is in, and the
# last blow it threw that connected at all, blocked or not ({f, move} or {})
var _blow := [{}, {}]
var _down := [{}, {}]
var _tear := [{}, {}]
var _fin := [{}, {}]
var _last := [{}, {}]
var _fight_from := 0

# the replay camera (eased each frame; `_cut`: the next frame jumps there)
var _pos := Vector3.ZERO
var _look := Vector3.ZERO
var _axis := Vector3.ZERO
var _sign := 1.0
var _cut := true


## A new fight, or the fight leaving the screen (sim idle): nothing tracked, nothing held. While
## the copy is on screen the Game lets it go as its match; the live one held aside goes here.
func reset() -> void:
	if on():
		if live != null:
			SimSnap.dispose_later(live)
		copy = null
	drop()
	_blow = [{}, {}]
	_down = [{}, {}]
	_tear = [{}, {}]
	_fin = [{}, {}]
	_last = [{}, {}]
	_fight_from = 0
	held = []
	hashes = []


## Let the copy go (if any) and stand down (sim idle).
func drop() -> void:
	if copy != null:
		SimSnap.dispose_later(copy)
	copy = null
	_from = null
	live = null
	state = IDLE


## The replay's copy is on screen (or about to be): the Game steps it, not the live match.
func on() -> bool:
	return state == PLAY or state == WIPE_OUT


## The copy wants steps on the worker this frame.
func prepping() -> bool:
	return state == PREP


## Whether a live fight's checkpoints should be closer together now (someone is in trouble).
static func danger(m) -> bool:
	if m.phase != "fight":
		return false
	for f in m.fighters:
		if f.isDown or float(f.hpRatio) < DANGER_HP:
			return true
	return false


## Each event of the live fight, in step order (main thread, sim idle). A knockout picks the
## blow and starts the copy on its way there, if the timeline has a checkpoint near enough.
func live_event(type: String, data, frame: int, m, timeline: ReplayTimeline, tape_: Dictionary) -> void:
	match type:
		"fightStart":
			_fight_from = frame
		"hit":
			if JS.truthy(data.shielded):
				return
			var i := int(data.attacker.index)
			var name := str(data.move.name_) if data.get("move") != null and data.move.get("name_") != null else ""
			var b := {"f": frame, "move": name}
			if JS.truthy(data.get("finisher")):
				b.move = str(_fin[i].get("move", name))
			_last[i] = b
			if JS.truthy(data.blocked):
				return
			_blow[i] = b
			if JS.truthy(data.knockdown):
				_down[i] = b
		"detach":
			# (a part can go through a guard: the blow that tore it may have been blocked)
			if data.get("by") != null:
				var i := int(data.by.index)
				_tear[i] = {"f": frame, "move": str(_last[i].get("move", "")) if int(_last[i].get("f", -1)) == frame else ""}
		"finisher":
			_fin[int(data.f.index)] = {"f": frame, "move": str(data.name_)}
		"finisherBlow":
			var i := int(data.f.index)
			_blow[i] = {"f": frame, "move": str(_fin[i].get("move", "Finisher"))}
		"getUp":
			_down[1 - int(data.f.index)] = {}
		"ko":
			if state == IDLE:
				_knockout(data, frame, m, timeline, tape_)


func _knockout(data, frame: int, m, timeline: ReplayTimeline, tape_: Dictionary) -> void:
	att = int(data.winner.index)
	vic = int(data.loser.index)
	result = str(data.kind)
	var b: Dictionary = {}
	if result == "Dismantled" and not _tear[att].is_empty() and frame - int(_tear[att].f) <= BLOW_RECENT:
		b = _tear[att]
	elif not _down[att].is_empty() and frame - int(_down[att].f) <= DOWN_RECENT:
		b = _down[att]
	elif not _blow[att].is_empty() and frame - int(_blow[att].f) <= BLOW_RECENT:
		b = _blow[att]
	focal = int(b.f) if not b.is_empty() else frame
	move = str(b.get("move", ""))
	start = maxi(_fight_from, focal - LEAD)
	stop = focal + TAIL
	var s := timeline.before(start)
	if s == null or start - s.frame > MAX_PREP:
		return
	_from = s
	tape = tape_
	winner_name = str(m.fighters[att].name_)
	accent = Color.hex((int(m.specs[att].paint.accent) << 8) | 0xff)
	waited = 0.0
	landed = false
	state = PREP


## On the worker, after the live fight's steps: the copy steps on toward `start` for up to `usec`
## (made from the checkpoint first). Leaves TFighter.UID as it found it.
func prep_step(usec: int) -> void:
	if state != PREP:
		return
	var t0 := Time.get_ticks_usec()
	var uid_was: float = TFighter.UID
	if copy == null:
		copy = _from.make()
		copy_uid = _from.uid
		copy.listeners = []
		ReplayRun.apply_tape(copy, tape, _from.frame)
	TFighter.UID = copy_uid
	while int(copy.frame) < start and Time.get_ticks_usec() - t0 < usec:
		copy.step(Game.SIM_DT)
	copy_uid = TFighter.UID
	TFighter.UID = uid_was
	if int(copy.frame) >= start:
		state = READY


## The time rate the replay wants at step `frame`: brisk on the way in, crawling through the
## blow, easing back up as the loser goes down.
func rate(frame: int) -> float:
	var t := float(frame - focal)
	if t < -90.0:
		return 0.75
	if t < -10.0:
		return lerpf(0.75, 0.25, smoothstep(-90.0, -10.0, t))
	if t < 25.0:
		return 0.25
	return lerpf(0.25, 0.5, smoothstep(25.0, 90.0, t))


## How far through the replay step `frame` is (0..1).
func progress(frame: int) -> float:
	return clampf(float(frame - start) / float(maxi(1, stop - start)), 0.0, 1.0)


## The replay's shot this frame, from the robots as posed (joints: world positions; 1 chest,
## 3 head, 12 and 15 the feet): low beside the winner and a little behind it, looking past its
## shoulder at the one it fells, closing in as the blow comes. `cam`: where the lens was before
## the cut (the replay looks from the other side when it can). Returns {pos, look, fov_k, cut}.
func shot(dt: float, frame: int, ja: Array[Vector3], jv: Array[Vector3], cam: Vector3) -> Dictionary:
	var a := ja[1]
	var v := jv[1]
	var floor_y := minf(ja[12].y, ja[15].y)
	var h := maxf(0.6, ja[3].y - floor_y)
	var d := Vector3(v.x - a.x, 0.0, v.z - a.z)
	var sep := d.length()
	d = d / sep if sep > 1e-3 else (_axis if _axis != Vector3.ZERO else Vector3(1, 0, 0))
	var mid := a.lerp(v, 0.5)
	if _cut:
		_axis = d
		# the side that keeps the lens nearer the middle of the ring, away from where it just was
		var n := Vector3(-d.z, 0.0, d.x)
		var best := INF
		for sg in [1.0, -1.0]:
			var p: Vector3 = mid + (n * sg) * (sep + h) * 1.4
			var score := Vector2(p.x, p.z).length()
			if (p - mid).dot(cam - mid) > 0.0:
				score += 2.0 * h
			if score < best:
				best = score
				_sign = sg
	else:
		# the fighters turn about each other: the shot turns with them, slowly
		_axis = _axis.lerp(d, 1.0 - exp(-1.6 * dt)).normalized()
	d = _axis
	var side := Vector3(-d.z, 0.0, d.x) * _sign
	var u := progress(frame)
	var t := float(frame - focal)
	# the closing in, held through the blow, then a little room for the fall
	var near := smoothstep(-120.0, -5.0, t) * (1.0 - 0.45 * smoothstep(20.0, 110.0, t))
	var ang := deg_to_rad(lerpf(80.0, 56.0, u))
	var r := (sep * 0.75 + h * 1.25) * lerpf(1.0, 0.78, near)
	var pos := mid - d * (cos(ang) * r) + side * (sin(ang) * r)
	pos.y = floor_y + h * lerpf(0.5, 0.32, u)
	# looking at the one taking the blow more as it lands, and after it as it falls
	var look := mid.lerp(v, 0.25 + 0.35 * smoothstep(-60.0, 30.0, t))
	look.y = floor_y + (look.y - floor_y) * 0.92
	var cut := _cut
	if _cut:
		_pos = pos
		_look = look
		_cut = false
	else:
		var kp := 1.0 - exp(-5.0 * dt)
		var kl := 1.0 - exp(-7.0 * dt)
		_pos = _pos.lerp(pos, kp)
		_look = _look.lerp(look, kl)
	return {"pos": _pos, "look": _look, "fov_k": lerpf(0.95, 0.74, near), "cut": cut}


## The copy is on screen from here: the camera cuts to its first shot.
func begin_play() -> void:
	_cut = true
	landed = false
	state = PLAY


## On the worker, after each of the copy's steps on screen (tests: net_hash_every set).
func hash(m, every: int) -> void:
	if int(m.frame) % every == 0:
		hashes.append([int(m.frame), SimHash.of(m)])
