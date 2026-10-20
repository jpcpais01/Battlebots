## What a replay keeps of its fight while it's watched (and the live fight while it's fought,
## for its Replay button): checkpoints of the sim (SimSnap) to seek from, and the wear log, every
## blow that dented a robot and every part torn off, each with the robot's pose at that moment,
## so a seek can put the robots' metal back as it was at any step (the sim knows the parts'
## condition; the dents and the torn sockets are the robots' own).
##
## Whatever steps the fight (the game's own match, or a seek's copy on the worker) records
## into it through a Recorder. The sim is deterministic, so every run of the same steps records
## the same: the log only grows at its end (`covered`), and a run going over steps it already
## has drops its copies. Written on the worker, read on the main thread, under one lock.
class_name ReplayTimeline
extends RefCounted

const HIT := 0
const DETACH := 1
## Most checkpoints kept (each about half a megabyte).
const MAX_SNAPS := 48
## A seek's run past the last checkpoint leaves one this often (2 s of fight), so the next seek
## back there has one close by.
const SPACING := 240

## Checkpoints by step (one at step 0 always).
var snaps: Array[SimSnap] = []
## The wear log: {f, t, who, ...} by step (see Recorder).
var wear: Array = []
## The wear log holds every step from 1 to this.
var covered := 0
## The step on screen: the checkpoints round it are the last to go when there are too many.
var playhead := 0
## A checkpoint that's never let go (the fight's last step: Results come up at once).
var keep := -1
var _lock := Mutex.new()


## The latest checkpoint at or before `frame` (null: none).
func before(frame: int) -> SimSnap:
	_lock.lock()
	var best: SimSnap = null
	for s in snaps:
		if s.frame > frame:
			break
		best = s
	_lock.unlock()
	return best


## How far step `frame` is from the nearest checkpoint.
func gap(frame: int) -> int:
	_lock.lock()
	var g := 1 << 30
	for s in snaps:
		g = mini(g, absi(s.frame - frame))
	_lock.unlock()
	return g


## Whether a checkpoint at `frame` is worth taking (none within `every` steps either side).
func wants(frame: int, every := SPACING) -> bool:
	return gap(frame) >= every


func add(s: SimSnap) -> void:
	if s == null:
		return
	_lock.lock()
	var at := snaps.size()
	for i in snaps.size():
		if snaps[i].frame == s.frame:
			at = -1
			break
		if snaps[i].frame > s.frame:
			at = i
			break
	if at >= 0:
		snaps.insert(at, s)
		while snaps.size() > MAX_SNAPS:
			_evict()
	_lock.unlock()


## Let one checkpoint go: the one whose neighbours are closest together once it's gone (the
## ones round the step on screen count four times as far), never the first or the kept one.
func _evict() -> void:
	var best := -1
	var best_k := INF
	for i in range(1, snaps.size() - 1):
		var f := snaps[i].frame
		if f == keep:
			continue
		var k := float(snaps[i + 1].frame - snaps[i - 1].frame)
		if absi(f - playhead) < 360:
			k *= 4.0
		if k < best_k:
			best_k = k
			best = i
	if best < 0:
		best = snaps.size() - 1
	snaps.remove_at(best)


## Step `frame` ran, with these entries: kept if it's the next step the log is missing.
func log_step(frame: int, entries: Array) -> void:
	_lock.lock()
	if frame == covered + 1:
		wear.append_array(entries)
		covered = frame
	_lock.unlock()


## The wear log up to step `frame` (the entries themselves: a seek's landing notes on each the
## dent it worked out, so the next one only puts it in).
func wear_until(frame: int) -> Array:
	_lock.lock()
	var n := wear.size()
	for i in wear.size():
		if int(wear[i].f) > frame:
			n = i
			break
	var out := wear.slice(0, n)
	_lock.unlock()
	return out


## Where the checkpoints are, for the scrubber (a copy).
func frames() -> PackedInt32Array:
	_lock.lock()
	var out := PackedInt32Array()
	for s in snaps:
		out.append(s.frame)
	_lock.unlock()
	return out


## The bot in tag.ts order (crew index) a fighter is: its corner one on one.
static func crew_of(m, f) -> int:
	if m.tag != null:
		var mb: Array = m.tag.members
		for i in mb.size():
			if is_same(mb[i].f, f):
				return i
	return int(f.index)


## Listens to one match as it steps (on whichever thread steps it) and writes into the log.
class Recorder:
	var tl: ReplayTimeline
	var m
	var _buf := []

	func _init(timeline: ReplayTimeline, match_) -> void:
		tl = timeline
		m = match_

	## Listen to the match (Match.on).
	func listen() -> void:
		m.on(on_event)

	func on_event(type: String, data) -> void:
		if type == "hit":
			var h = data
			if JS.truthy(h.shielded):
				return
			_buf.append({
				"f": int(m.frame), "t": HIT, "who": ReplayTimeline.crew_of(m, h.defender),
				"pose": Pose.of(h.defender, h.attacker.body.pos[3], -1),
				"h": {
					"shielded": false, "part": int(h.part), "dir": _v(h.dir), "point": _v(h.point),
					"partCond": float(h.partCond), "damage": float(h.damage), "move": {"kind": str(h.move.kind)},
					"crit": JS.truthy(h.get("crit")), "heavy": JS.truthy(h.get("heavy")), "blocked": JS.truthy(h.get("blocked")),
				},
			})
		elif type == "detach":
			var d = data
			_buf.append({
				"f": int(m.frame), "t": DETACH, "who": ReplayTimeline.crew_of(m, d.f), "side": int(d.f.index),
				"part": int(d.part), "dir": _v(d.dir), "strength": float(d.strength),
				"pose": Pose.of(d.f, d.by.body.pos[3] if d.get("by") != null else null, int(d.part)),
			})

	## After each step of the match.
	func stepped() -> void:
		tl.log_step(int(m.frame), _buf)
		_buf = []

	static func _v(p) -> Vector3:
		return Vector3(p.x, p.y, p.z)


## A robot's pose at one step, as BotModel.pose_still reads it (what begin and the limbs read
## off a fighter), and where its head was turned.
class Pose:
	var joints: Array[Vector3] = []
	var look = null
	var faceYaw := 0.0
	var handRoll := [0.0, 0.0]
	var footYaw := [0.0, 0.0]
	var footHeel := [0.0, 0.0]
	var footAir := [0.0, 0.0]
	var footFlex := [0.0, 0.0]
	var parts: PartsView

	## Fighter f's pose now; `look`: where its head turns; `torn`: a part that's coming off
	## this step (still on, as the robot is drawn when it goes).
	static func of(f, look_at, torn: int) -> Pose:
		var p := Pose.new()
		var pos: Array = f.body.pos
		for i in 16:
			p.joints.append(Vector3(pos[i].x, pos[i].y, pos[i].z))
		p.look = Vector3(look_at.x, look_at.y, look_at.z) if look_at != null else null
		p.faceYaw = float(f.faceYaw)
		for k in 2:
			p.handRoll[k] = float(f.handRoll[k])
			p.footYaw[k] = float(f.footYaw[k])
			p.footHeel[k] = float(f.footHeel[k])
			p.footAir[k] = float(f.footAir[k])
			p.footFlex[k] = float(f.footFlex[k])
		p.parts = PartsView.new(f.parts, torn)
		return p


## A fighter's parts as the limbs read them (which are off), copied.
class PartsView:
	var off: Array
	var cond: Array

	func _init(parts, torn: int) -> void:
		off = (parts.off as Array).duplicate()
		cond = (parts.cond as Array).duplicate()
		if torn >= 0 and torn < off.size():
			off[torn] = 0.0

	func armOut(side: float) -> bool:
		return off[TDamage.armPart(side, 0.0)] != 0.0 or off[TDamage.armPart(side, 1.0)] != 0.0

	func legOut(side: float) -> bool:
		return off[TDamage.legPart(side, 0.0)] != 0.0 or off[TDamage.legPart(side, 1.0)] != 0.0
