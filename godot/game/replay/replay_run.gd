## A replay being watched (src/game/game.ts startReplay, seek, seekSlice): its tape, its timeline,
## and the transport (paused, frame steps, a seek in progress).
##
## The fight plays back as the live one ran: the Game steps its match on the worker, a frame
## ahead. A seek can't run the sim from the walkout as the web does (it's far too slow on a
## phone), so it runs from the nearest checkpoint before the step it wants: a copy of the fight
## made from it steps there on the worker, as fast as it can, while the picture holds; then the
## Game puts it on screen with the robots' wear as it was there (Game._land). While the replay
## is paused, the worker fills in checkpoints round the step on screen (frame steps back) and on
## ahead (seeks forward) the same way.
##
## Only one match steps at a time (the sim's modules share scratch vectors), so the Game steps
## its own match only while no job runs (busy()).
class_name ReplayRun
extends RefCounted

## Checkpoints this close together behind the step on screen while paused (a frame step back
## runs at most this many steps).
const DENSE := 24
## How far behind the step on screen that close.
const DENSE_SPAN := 240

var tape: Dictionary
var tl: ReplayTimeline
## The step its results came up at: the replay stops there.
var end := 0
## Paused by the player (the picture holds still: camera, sparks and smoke too).
var paused := false
## Sim steps asked for one at a time while paused (frame steps ahead).
var owed := 0
## The step a seek is running to (-1: none).
var seek_to := -1
## The results card once the seek lands (Results tapped with no summary on the tape).
var results_after := false
## The seek running, its progress (0..1).
var progress := 0.0
var _job: Job = null
var _task := -1
## Prefetch has run up to the step on screen for this one (nothing more to do until it moves).
var _dense_for := -1
var _dense_done := -1


func _init(tape_: Dictionary, timeline: ReplayTimeline) -> void:
	tape = tape_
	tl = timeline
	end = int(tape.end)


## The step on screen (or being sought), for the controls.
func shown(m) -> int:
	return seek_to if seek_to >= 0 else int(m.frame) if m != null else 0


func seeking() -> bool:
	return seek_to >= 0


## At its last step (and not seeking).
func ended(m) -> bool:
	return seek_to < 0 and m != null and int(m.frame) >= end


## The picture holds still this frame (paused or at its end, nothing owed).
func still(m) -> bool:
	return (paused or ended(m)) and owed == 0


## A job is running on the worker: nothing else may step a match.
func busy() -> bool:
	return _task >= 0


## Go to step `frame` (0 .. end). Lands a frame or more later (Game._land).
func seek(frame: int, m) -> void:
	frame = clampi(frame, 0, end)
	if seek_to < 0 and m != null and frame == int(m.frame):
		return
	seek_to = frame
	owed = 0
	if _job != null:
		_job.cancel = true


## Each frame, before the Game touches its match: a finished job is landed (a seek) or put away,
## and the next one started. True while a seek holds the picture.
func poll(g) -> bool:
	if _task >= 0:
		if not WorkerThreadPool.is_task_completed(_task):
			progress = _job.progress()
			return seek_to >= 0
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		var j := _job
		_job = null
		if j.land and not j.cancel and j.m != null and int(j.m.frame) == seek_to:
			seek_to = -1
			progress = 1.0
			g._land(j.m, j.uid)
	if _task >= 0:
		return true
	if seek_to >= 0:
		_start(g, seek_to, true)
		return true
	# paused (or at the end): fill in checkpoints while nothing else is asked for
	if still(g.m) and g.m != null:
		_prefetch(g)
	return false


## Cancel what's running and wait for it (the fight is leaving the screen, or the Game wants
## to step its match).
func stop() -> void:
	if _job != null:
		_job.cancel = true
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
	_job = null


## Let a prefetch go (the Game steps its own match next): cancelled now, done within a step.
func yield_worker() -> void:
	if _job != null and not _job.land:
		_job.cancel = true


func _start(g, frame: int, land: bool, every := ReplayTimeline.SPACING, from_live := true) -> void:
	var j := Job.new()
	j.tl = tl
	j.tape = tape
	j.target = frame
	j.land = land
	j.every = every
	var s := tl.before(frame)
	# the fight on screen is nearer: a checkpoint of it is taken first (on the worker: the Game
	# only reads it meanwhile) and the copy steps on from there
	var at := int(g.m.frame) if g.m != null else -1
	if from_live and at >= 0 and at <= frame and (s == null or at > s.frame):
		j.of = g.m
		j.uid = g._uid
	else:
		j.from = s
	_job = j
	_task = WorkerThreadPool.add_task(j.run, true, "replay seek" if land else "replay prefetch")


## Paused: a checkpoint of the step on screen, checkpoints close together just behind it (each
## step's once), then on ahead past the last one, until the whole fight is covered.
func _prefetch(g) -> void:
	var at := int(g.m.frame)
	tl.playhead = at
	if _dense_for != at:
		_dense_for = at
		if tl.wants(at, DENSE):
			_start(g, at, false, DENSE)
			return
	if _dense_for == at and _dense_done != at:
		_dense_done = at
		var s := tl.before(at - 1)
		if s != null and at - s.frame > DENSE:
			_start(g, at - 1, false, DENSE, false)
			_job.dense_from = at - DENSE_SPAN
			return
	if tl.covered < end:
		_start(g, mini(end, tl.covered + ReplayTimeline.SPACING * 4), false, ReplayTimeline.SPACING, false)


## Put the tape's inputs into a match from step `from` on (a fresh one, or one made from a
## checkpoint, which may have been taken of the live fight): where the intro ends, and the
## coach's calls and the TAG button's taps still to come.
static func apply_tape(m, t: Dictionary, from: int) -> void:
	if int(t.cut) >= 0:
		m.replayCut = float(t.cut)
	elif float(t.intro) > 0.0:
		m.introLength = float(t.intro)
	m.coachQueue.clear()
	for c in t.coach:
		if int(c.frame) >= from:
			m.queueCoach(float(c.side), c.kind, float(c.frame))
	m.tagQueue.clear()
	if m.tag != null:
		for c in t.tags:
			if int(c.frame) >= from:
				m.queueTag(float(c.side), float(c.frame))


## One run of the sim on the worker: a copy of the fight (from a checkpoint, or from one taken
## of the live match first) stepped to `target`, leaving checkpoints every `every` steps where
## there are none and writing the wear log as it goes.
class Job:
	var tl: ReplayTimeline
	var tape: Dictionary
	var target := 0
	var land := false
	var every := 0
	var from: SimSnap
	## The live match to start from instead (read only), and its uid counter.
	var of = null
	var uid := 0.0
	var m = null
	var cancel := false
	## Checkpoints every `every` steps only from here on (SPACING before it).
	var dense_from := 0
	var _start := 0
	var _at := 0

	func progress() -> float:
		return 0.0 if target <= _start else clampf(float(_at - _start) / float(target - _start), 0.0, 1.0)

	func run() -> void:
		if of != null:
			var s := SimSnap.take(of, uid)
			if s != null:
				tl.add(s)
				from = s
			else:
				from = tl.before(target)
			# (just the checkpoint: there's nothing to step)
			if s != null and s.frame >= target and not land:
				return
		if from == null or cancel:
			return
		m = from.make()
		uid = from.uid
		ReplayRun.apply_tape(m, tape, from.frame)
		var rec := ReplayTimeline.Recorder.new(tl, m)
		rec.listen()
		_start = int(m.frame)
		_at = _start
		TFighter.UID = uid
		while int(m.frame) < target and not cancel:
			m.step(Game.SIM_DT)
			rec.stepped()
			_at = int(m.frame)
			if every > 0 and _at < target and tl.wants(_at, every if _at >= dense_from else ReplayTimeline.SPACING):
				tl.add(SimSnap.take(m, TFighter.UID))
		uid = TFighter.UID
		if not land and not cancel and tl.wants(_at, every):
			tl.add(SimSnap.take(m, uid))
