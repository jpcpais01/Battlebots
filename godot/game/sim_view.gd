## What a frame draws from the match, copied out while the sim is idle so the next sim steps can
## run on the worker for the whole frame (game/fight.gd). Field and method names match the sim's
## own (Match, Fighter, Body, Parts), so the robots, effects, corners and arena read a view
## exactly as they read the match. Anything a frame reads after the steps start must be here.
class_name SimView
extends RefCounted


## The match's side (Match).
class MatchView extends RefCounted:
	var phase := ""
	var phaseTime := 0.0
	var clock := 0.0
	var pace := 1.0
	var slowmo := 1.0
	var presenting := -1.0
	var introLength := 0.0
	var seed_ := 0.0
	## The robots' specs (fixed for the whole fight, shared, never written).
	var specs: Array = []
	var fighters: Array = []
	## null, or the finisher running (FinisherRun: att, glow, glowJoint).
	var fin = null
	## null, or the winner's view.
	var winner = null
	## A tag team match's teams (TagView), or null one-on-one.
	var tag = null
	var _fin := FinView.new()
	var _tag: TagView

	func _init() -> void:
		fighters = [FighterView.new(), FighterView.new()]

	func capture(m) -> void:
		phase = m.phase
		phaseTime = m.phaseTime
		clock = m.clock
		pace = m.pace
		slowmo = m.slowmo
		presenting = m.presenting
		introLength = m.introLength
		seed_ = m.seed_
		specs = m.specs
		fighters[0].capture(m.fighters[0])
		fighters[1].capture(m.fighters[1])
		var f = m.fin
		if f == null:
			fin = null
		else:
			_fin.att = fighters[int(f.att.index)]
			_fin.glow = f.glow
			_fin.glowJoint = f.glowJoint
			fin = _fin
		winner = null if m.winner == null else fighters[int(m.winner.index)]
		if m.tag == null:
			tag = null
		else:
			if _tag == null:
				_tag = TagView.new()
			_tag.capture(m.tag)
			tag = _tag


## A tag team match (tag.ts TagTeam): who is in the ring for each side, and the partners outside it.
class TagView extends RefCounted:
	## Per bot, in tag.ts order (side 0's starter and partner, then side 1's).
	var members: Array[MemberView] = []
	## Index into members of each side's legal bot (the one the match's fighters hold).
	var legal := PackedInt32Array([0, 2])
	## Each side's bot out of the ring (its partner), drawn from this view.
	var bench: Array[FighterView] = []
	## Index into members of each side's bench bot.
	var bench_of := PackedInt32Array([1, 3])
	## Can each side tag now (the HUD's TAG button)?
	var can_tag := [false, false]
	## Each side's run to its corner for a tag: seconds into it, -1 when not running.
	var run := PackedFloat32Array([-1.0, -1.0])
	## Health of each team, 0..1: both bots' together.
	var team_hp := PackedFloat32Array([1.0, 1.0])
	## Tags each side has made.
	var tags := PackedInt32Array([0, 0])
	## The fight is stopped for an elimination.
	var paused := false
	## The partner in on a double team (index into members), or -1.
	var assist := -1

	func _init() -> void:
		for i in 4:
			members.append(MemberView.new())
		bench = [FighterView.new(), FighterView.new()]

	func capture(t) -> void:
		var ms: Array = t.members
		for i in 4:
			members[i].capture(ms[i])
		for side in 2:
			legal[side] = int(t.legal[side])
			var b := side * 2 + (1 if legal[side] == side * 2 else 0)
			bench_of[side] = b
			bench[side].capture(ms[b].f)
			can_tag[side] = t.canTag(float(side))
			run[side] = t.run[side]
			team_hp[side] = t.teamHp(float(side))
			tags[side] = int(t.tags[side])
		paused = t.paused
		assist = -1 if t.assist == null else ms.find(t.assist)

	## How far through its last update bench bot `side` is drawn at, for the step alpha `alpha`:
	## on the apron it moves every few steps, so one update's motion is spread over them.
	func bench_alpha(side: int, alpha: float) -> float:
		var mb := members[bench_of[side]]
		if mb.every <= 1.0:
			return alpha
		return clampf((mb.acc / (1.0 / 120.0) + alpha) / mb.every, 0.0, 1.0)


## One bot of a tag team (tag.ts TagMember).
class MemberView extends RefCounted:
	var side := 0
	var slot := 0
	var status := ""
	var out := false
	var cheer := false
	var name_ := ""
	var hpRatio := 1.0
	var staminaRatio := 1.0
	## Seconds in its status.
	var t := 0.0
	var acc := 0.0
	var every := 1.0
	## Reaching for the tag (0..1).
	var reachW := 0.0
	var spec

	func capture(mb) -> void:
		side = int(mb.side)
		slot = int(mb.slot)
		status = mb.status
		out = mb.out
		cheer = mb.cheer
		name_ = mb.f.name_
		hpRatio = mb.f.hpRatio
		staminaRatio = mb.f.staminaRatio
		t = mb.t
		acc = mb.acc
		every = mb.every
		reachW = mb.reachW
		spec = mb.spec


class FinView extends RefCounted:
	var att: FighterView
	var glow := 0.0
	var glowJoint := 0.0


## A fighter's side (Fighter): what the robot model, the effects and the camera read.
class FighterView extends RefCounted:
	var index := 0.0
	var name_ := ""
	var size_ := 1.0
	var state := ""
	var isDown := false
	var yaw := 0.0
	var faceYaw := 0.0
	var shield := false
	var overdrive := 0.0
	var shockTime := 0.0
	var rearSide := ""
	var hpRatio := 1.0
	var staminaRatio := 1.0
	var trailActive := [false, false, false, false]
	var handRoll := [0.0, 0.0]
	var footYaw := [0.0, 0.0]
	var footHeel := [0.0, 0.0]
	var footAir := [0.0, 0.0]
	var footFlex := [0.0, 0.0]
	## null, or the strike under way: {phase, t, windup, side, move} (move: the fixed move table's).
	var strike = null
	var emote = null
	var body := BodyView.new()
	var parts := PartsView.new()
	var _strike := {"phase": "", "t": 0.0, "windup": 0.0, "side": "", "move": {}}
	var _emote := EmoteView.new()

	func capture(f) -> void:
		index = f.index
		name_ = f.name_
		size_ = f.size_
		state = f.state
		isDown = f.isDown
		yaw = f.yaw
		faceYaw = f.faceYaw
		shield = f.shield
		overdrive = f.overdrive
		shockTime = f.shockTime
		rearSide = f.rearSide
		hpRatio = f.hpRatio
		staminaRatio = f.staminaRatio
		for k in 4:
			trailActive[k] = f.trailActive[k]
		for k in 2:
			handRoll[k] = f.handRoll[k]
			footYaw[k] = f.footYaw[k]
			footHeel[k] = f.footHeel[k]
			footAir[k] = f.footAir[k]
			footFlex[k] = f.footFlex[k]
		var s = f.strike
		if s == null:
			strike = null
		else:
			_strike.phase = s.phase
			_strike.t = s.t
			_strike.windup = s.windup
			_strike.side = s.side
			_strike.move = s.move
			strike = _strike
		var e = f.emote
		if e == null:
			emote = null
		else:
			_emote.gazeOn = e.gazeOn
			var g = e.gaze
			_emote.gaze = Vector3(g.x, g.y, g.z) if g != null else Vector3.ZERO
			_emote.w = e.w
			_emote.gripW[0] = e.gripW[0]
			_emote.gripW[1] = e.gripW[1]
			emote = _emote
		body.capture(f.body)
		parts.capture(f.parts)


class EmoteView extends RefCounted:
	var gazeOn := false
	var gaze := Vector3.ZERO
	## the emote's weight and each hand's grip (BotModel.meet: a gripping hand rides along)
	var w := 0.0
	var gripW := [0.0, 0.0]


## Body: the joints now, a step ago (velocity) and where the last step started (drawing
## interpolates from there), and which touch the canvas.
class BodyView extends RefCounted:
	var pos: Array = []
	var prev: Array = []
	var last: Array = []
	var grounded: Array = []

	func _init() -> void:
		for j in 16:
			pos.append(Vector3.ZERO)
			prev.append(Vector3.ZERO)
			last.append(Vector3.ZERO)
			grounded.append(false)

	func capture(b) -> void:
		var bp: Array = b.pos
		var bv: Array = b.prev
		var bl: Array = b.last
		var bg: Array = b.grounded
		for j in 16:
			var p = bp[j]
			pos[j] = Vector3(p.x, p.y, p.z)
			p = bv[j]
			prev[j] = Vector3(p.x, p.y, p.z)
			p = bl[j]
			last[j] = Vector3(p.x, p.y, p.z)
			grounded[j] = bg[j]

	## Body.velocity: (pos - prev) / dt (out is ignored; a Vector3 comes back).
	func velocity(i: int, dt: float, _out = null) -> Vector3:
		return (pos[i] - prev[i]) / dt


## Parts: condition and torn-off flags per part.
class PartsView extends RefCounted:
	var cond := PackedFloat32Array()
	var off: Array = []

	func capture(p) -> void:
		cond = p.cond.duplicate()
		off = p.off.duplicate()

	func armOut(side: float) -> bool:
		return off[TDamage.armPart(side, 0.0)] != 0.0 or off[TDamage.armPart(side, 1.0)] != 0.0

	func legOut(side: float) -> bool:
		return off[TDamage.legPart(side, 0.0)] != 0.0 or off[TDamage.legPart(side, 1.0)] != 0.0
