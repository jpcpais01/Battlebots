## The hit and damage effects of a fight, driven from the sim the way src/game/game.ts drives
## them: the effects side of Game.onEvent (impacts, flashes, bursts, arcs), partHit, tearOff,
## damageEffects (wrecked parts sparking, smoking and arcing, hinges venting, wounds and stumps
## bleeding), updateTrailsAndFlames, finisherGlow, finisherBlow and groundImpacts, then the
## per-frame steps of Fx, Debris, Oil and Steam. The camera's shakes and the crowd's excitement
## stay in game/fight.gd (its director and arena event handlers); the robots' own metal (dents,
## oil on the plating) is BotWear's.
class_name FightFx
extends Node3D

const J_PELVIS := BotModel.J_PELVIS
const J_CHEST := BotModel.J_CHEST
const J_NECK := BotModel.J_NECK
const J_HEAD := BotModel.J_HEAD
const J_SH_L := BotModel.J_SH_L
const J_EL_L := BotModel.J_EL_L
const J_HAND_L := BotModel.J_HAND_L
const J_SH_R := BotModel.J_SH_R
const J_EL_R := BotModel.J_EL_R
const J_HAND_R := BotModel.J_HAND_R
const J_HIP_L := BotModel.J_HIP_L
const J_KNEE_L := BotModel.J_KNEE_L
const J_FOOT_L := BotModel.J_FOOT_L
const J_HIP_R := BotModel.J_HIP_R
const J_KNEE_R := BotModel.J_KNEE_R
const J_FOOT_R := BotModel.J_FOOT_R
const PART_COUNT := 15
const SIM_DT := 1.0 / 120.0

## A part's hinge starts blowing high-pressure vapour below this condition (game.ts VENT_BELOW).
const VENT_BELOW := 0.2
## The hinge each part vents from (game.ts VENT_AT): joint a (t = 0) on the segment toward b,
## which the jet blows out across; how far out the seal sits (a limb radius from the model, or a
## fixed one); and which side a limb's jet faces (-1 left, 1 right, 0 anywhere).
const VENT_AT := [
	[J_NECK, J_HEAD, 0.35, 0.07, 0],
	[J_CHEST, J_NECK, 0.85, 0.12, 0],
	[J_PELVIS, J_CHEST, 0.3, 0.15, 0],
	[J_SH_L, J_EL_L, 0.0, "upper", -1],
	[J_EL_L, J_HAND_L, 0.0, "fore", -1],
	null,
	[J_SH_R, J_EL_R, 0.0, "upper", 1],
	[J_EL_R, J_HAND_R, 0.0, "fore", 1],
	null,
	[J_HIP_L, J_KNEE_L, 0.0, "thigh", -1],
	[J_KNEE_L, J_FOOT_L, 0.0, "shin", -1],
	null,
	[J_HIP_R, J_KNEE_R, 0.0, "thigh", 1],
	[J_KNEE_R, J_FOOT_R, 0.0, "shin", 1],
	null,
]
## Where each body part sits on the robot: one joint, or the middle of two (game.ts PART_AT).
const PART_AT := [
	[J_HEAD, J_HEAD], [J_CHEST, J_CHEST], [J_PELVIS, J_CHEST],
	[J_SH_L, J_EL_L], [J_EL_L, J_HAND_L], [J_HAND_L, J_HAND_L],
	[J_SH_R, J_EL_R], [J_EL_R, J_HAND_R], [J_HAND_R, J_HAND_R],
	[J_HIP_L, J_KNEE_L], [J_KNEE_L, J_FOOT_L], [J_FOOT_L, J_FOOT_L],
	[J_HIP_R, J_KNEE_R], [J_KNEE_R, J_FOOT_R], [J_FOOT_R, J_FOOT_R],
]
## The joint a torn-off part leaves its stump at (game.ts STUMP; anything else: the chest).
const STUMP := {
	BotModel.P_HEAD: J_NECK, BotModel.P_UP_L: J_SH_L, BotModel.P_FORE_L: J_EL_L, BotModel.P_UP_R: J_SH_R, BotModel.P_FORE_R: J_EL_R,
	BotModel.P_THIGH_L: J_HIP_L, BotModel.P_SHIN_L: J_KNEE_L, BotModel.P_THIGH_R: J_HIP_R, BotModel.P_SHIN_R: J_KNEE_R,
}
## The joint a stump hangs from, so a torn socket sprays oil outward along the lost limb.
const STUMP_PARENT := {
	J_NECK: J_CHEST, J_SH_L: J_CHEST, J_SH_R: J_CHEST, J_EL_L: J_SH_L, J_EL_R: J_SH_R,
	J_HIP_L: J_PELVIS, J_HIP_R: J_PELVIS, J_KNEE_L: J_HIP_L, J_KNEE_R: J_HIP_R,
}
const TRAIL_JOINTS := [J_HAND_L, J_HAND_R, J_FOOT_L, J_FOOT_R]
const GROUND_JOINTS := [J_PELVIS, J_CHEST, J_HEAD]

var fx: Fx
var debris: FxDebris
var steam: FxSteam
var oil: FxOil
## Set by the fight: the building (stir and excite when a part lands in the stands) and the
## crowd's mood. Both optional.
var arena: Node = null
var crowd_mood: Object = null
## False: sparks, smoke and the rest stay off (BB_NOSPARKS shots); parts still come off.
var enabled := true
var m
var models: Array[BotModel] = []
## Per fighter: four swing trails (fists, feet).
var _trails := [[], []]
## Per fighter: stumps left by torn parts, [joint, age in seconds].
var _stumps := [[], []]
## Per fighter: where the chest's and lower torso's wounds open (angles off its front).
var _wounds := [[0.0, 0.0], [0.0, 0.0]]
var _ground_prev := [[false, false, false], [false, false, false]]
var _feet: Array = []
var _oil_feet: Array = [null, null, null, null]
## GDScript time the effects took last frame (us), for checks.
var prof_us := 0
## ...split: [trails and damage effects, debris, oil, steam, fx].
var prof_split := PackedInt32Array([0, 0, 0, 0, 0])


func _init() -> void:
	name = "FightFx"
	top_level = true
	fx = Fx.new()
	debris = FxDebris.new()
	steam = FxSteam.new()
	oil = FxOil.new()
	for n in [fx, debris, oil, steam]:
		add_child(n)


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


## A new fight: a clean canvas, these robots' trails, fresh wounds.
func start(match_, bot_models: Array[BotModel]) -> void:
	m = match_
	models = bot_models
	fx.clear()
	debris.clear()
	oil.clear()
	steam.clear()
	for list in _trails:
		for t in list:
			fx.remove_trail(t)
	_trails = [[], []]
	for i in 2:
		for k in 4:
			_trails[i].append(fx.make_trail(m.specs[i].paint.accent, 0.13))
	_stumps = [[], []]
	# wounds open somewhere on the front half of the body
	_wounds = [[(randf() - 0.5) * 2.4, (randf() - 0.5) * 2.4], [(randf() - 0.5) * 2.4, (randf() - 0.5) * 2.4]]
	_ground_prev = [[false, false, false], [false, false, false]]


func _paint(i: int):
	return m.specs[i].paint


## game.ts onEvent, the effects' part.
func on_event(type: String, data) -> void:
	if type == "detach":
		tear_off(data)
		return
	if not enabled:
		return
	match type:
		"hit":
			var h = data
			var p := _v(h.point)
			var dir := _v(h.dir)
			var dmg: float = h.damage
			if h.shielded:
				fx.burst(p, 0x3cffd8, 40, 3.0)
			elif h.blocked:
				fx.impact(p, dir, minf(0.6, dmg / 160.0) + (0.3 if JS.truthy(h.get("guardBreak")) else 0.0), 0x8fd8ff)
				fx.flash(p, 0x8fd8ff, 0.5, 0.1)
			else:
				var crit := JS.truthy(h.get("crit"))
				var big := dmg >= 55.0 or crit
				fx.impact(p, dir, minf(1.0, dmg / 90.0 + (0.3 if crit else 0.0)), 0xffb347 if big else _paint(int(h.attacker.index)).accent)
				fx.flash(p, 0xffd28a if big else 0xffffff, 1.4 if big else 0.8, 0.2 if big else 0.12)
				if h.attacker.passive("siphon") > 0.0:
					fx.siphon(_v(h.defender.body.pos[J_CHEST]), _v(h.attacker.body.pos[J_CHEST]), 0x52ff6a)
			if h.move.get("vfx") == "shock" and not h.blocked:
				fx.arc(_v(h.defender.body.pos[J_HEAD]), 0.9)
			part_hit(h)
		"static":
			fx.arc(_v(data.to.body.pos[J_CHEST]), 0.4, 0xc77dff)
		"finisher":
			# the finisher's colours burst off it
			var at := _v(data.f.body.pos[J_CHEST])
			var accent = _paint(int(data.f.index)).accent
			fx.flash(at, accent, 2.4, 0.3)
			fx.burst(at, accent, 46, 4.0)
		"finisherBlow":
			finisher_blow(data)
		"fistBump":
			# touching gloves: a few sparks off the knuckles
			var at := Vector3(data.x, data.y, data.z)
			fx.sparks(at, Vector3.UP, 8, 0xffe2b0, 2.2, 1.4)
			fx.flash(at, 0xfff0d0, 0.35, 0.1)


## A hit on a battered part knocks bits of plating loose (game.ts partHit; the oil on the
## robots themselves is BotWear.on_hit's).
func part_hit(h) -> void:
	if h.shielded:
		return
	var cond: float = h.partCond
	var wear := 1.0 - cond
	var dmg: float = h.damage
	var crit := JS.truthy(h.get("crit"))
	var p := _v(h.point)
	var dir := _v(h.dir)
	# torn plate, nuts and bolts: a spray from a hard blow, more the worse the part gets
	var paint = _paint(int(h.defender.index)).primary
	var power := minf(1.0, dmg / 70.0 + wear * 0.45 + (0.3 if crit else 0.0))
	var n: int
	if h.blocked:
		n = floori(dmg / 30.0 + wear * 2.0 + randf() * 1.2)
	else:
		n = mini(24, floori(dmg / 10.0 + wear * wear * 12.0 + (4.0 if crit else 0.0) + (3.0 if JS.truthy(h.get("heavy")) else 0.0) + randf() * 2.0))
	if n > 0:
		fx.bits.spawn(p, dir, n, paint, power * 0.5 if h.blocked else power)
	if wear > 0.35 and dmg >= 6.0:
		fx.smoke(p, 1 + roundi(wear * 3.0), wear)
	# a blow to a venting part makes its hinge blow (if it hasn't just)
	if cond < VENT_BELOW:
		steam.kick(int(h.defender.index) * 16 + int(h.part))
	var k := BotWear.oil_leak(int(h.part), cond)
	if k > 0.0 and not h.blocked:
		oil.splash(p, dir, k)


## A part comes off: the piece flies, the stump bursts with sparks (game.ts tearOff; the
## socket's wrench and the oil over both robots are BotWear.on_detach's).
func tear_off(d) -> void:
	var i := int(d.f.index)
	var part := int(d.part)
	var model: BotModel = models[i]
	var dir := _v(d.dir)
	var piece: Node3D = null
	if model.has_method("detach_piece"):
		piece = model.detach_piece(part)
	else:
		model.tear_off(part)
		piece = _stand_in(model.joints[STUMP.get(part, J_CHEST)])
	if piece != null:
		debris.spawn(piece, dir, float(d.strength), true, i)
	var stump: int = STUMP.get(part, J_CHEST)
	_stumps[i].append([stump, 0.0])
	if not enabled:
		return
	var at := model.joints[stump]
	oil.splash(at, dir, 1.4, 70, 1.3)
	fx.sparks(at, Vector3(dir.x, 0.6, dir.z).normalized(), 60, 0xffc070, 9.0, 1.4)
	fx.sparks(at, Vector3.UP, 24, 0x9ad8ff, 5.0, 1.6)
	fx.flash(at, 0xffe0b0, 2.2, 0.28)
	fx.arc(at, 1.2)
	fx.bits.spawn(at, dir, 30, _paint(i).primary, 1.0)
	fx.smoke(at, 6, 1.0)


## A grey box standing in for a torn part (only for a BotModel that can't hand its metal over).
static func _stand_in(at: Vector3) -> Node3D:
	var node := Node3D.new()
	node.position = at
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.14, 0.3, 0.14)
	mi.mesh = bm
	node.add_child(mi)
	return node


## The last blow of a finisher: each one lands with its own kind of bang (game.ts finisherBlow).
func finisher_blow(d) -> void:
	var p := _v(d.point)
	var dir := _v(d.dir)
	var accent = _paint(int(d.f.index)).accent
	fx.flash(p, 0xfff0d0, 3.0, 0.32)
	fx.burst(p, accent, 60, 6.0)
	fx.sparks(p, dir, 70, 0xffc070, 10.0, 1.3)
	match str(d.kind):
		"slam":
			# the canvas takes it: a ring of dust
			fx.dust(Vector3(p.x, 0.05, p.z), 60, 2.0)
		"launch":
			fx.sparks(p, Vector3.UP, 50, accent, 9.0, 0.6)
		"blast":
			var f = d.f
			fx.flame(_v(f.body.pos[J_HAND_L if f.rearSide == "L" else J_HAND_R]), dir, 1.6)
			fx.burst(p, 0xff7a2a, 40, 7.0)


## Once a frame, after the robots are posed and before the next sim steps start (the sim must
## be idle): `dt` is real time, `flow` the fight's own (Match.pace slows it round big hits).
func update(dt: float, flow: float, camera: Camera3D) -> void:
	var t0 := Time.get_ticks_usec()
	fx.begin_frame()
	if m != null and enabled:
		for i in 2:
			update_trails_and_flames(i)
			if m.fin != null and m.fin.att == m.fighters[i]:
				finisher_glow(i, dt)
			ground_impacts(i)
			damage_effects(i, flow)
	if m != null:
		_feet.clear()
		for i in 2:
			var f = m.fighters[i]
			_oil_feet[i * 2] = null if f.parts.legOut(0.0) else models[i].joints[J_FOOT_L]
			_oil_feet[i * 2 + 1] = null if f.parts.legOut(1.0) else models[i].joints[J_FOOT_R]
			if _oil_feet[i * 2] != null:
				_feet.append(_oil_feet[i * 2])
			if _oil_feet[i * 2 + 1] != null:
				_feet.append(_oil_feet[i * 2 + 1])
	var t1 := Time.get_ticks_usec()
	debris.update(flow, fx, _feet, Callable(), _on_crowd)
	var t2 := Time.get_ticks_usec()
	var stepped := oil.update(flow, _oil_feet)
	# stepping in a puddle splashes the foot and shin
	for fi in 4:
		if not (stepped & (1 << fi)):
			continue
		var md: BotModel = models[fi >> 1]
		var left := (fi & 1) == 0
		md.oil_splash(J_FOOT_L if left else J_FOOT_R, 0.12, 1.0, 0.04)
		if randf() < 0.5:
			md.oil_splash(J_KNEE_L if left else J_KNEE_R, 0.09, 0.8)
		md.grime += 0.03
	var t3 := Time.get_ticks_usec()
	steam.update(flow)
	var t4 := Time.get_ticks_usec()
	fx.update(dt, camera)
	var t5 := Time.get_ticks_usec()
	prof_us = t5 - t0
	prof_split[0] = t1 - t0
	prof_split[1] = t2 - t1
	prof_split[2] = t3 - t2
	prof_split[3] = t4 - t3
	prof_split[4] = t5 - t4


## A part came down among the fans: the seats round it erupt (first), then simmer down.
func _on_crowd(p: Vector3, k: float, first: bool) -> void:
	if arena != null and arena.has_method("stir"):
		arena.stir(p, k)
	if not first:
		return
	if crowd_mood != null and crowd_mood.has_method("event"):
		crowd_mood.event("debrisCrowd", null)
	if arena != null and arena.has_method("excite"):
		arena.excite(0.8)


## Swing trails behind the striking limbs, thrusters for rocket and jet moves, crackle and
## embers on shock and fire moves (game.ts updateTrailsAndFlames).
func update_trails_and_flames(i: int) -> void:
	var f = m.fighters[i]
	var model: BotModel = models[i]
	var trails: Array = _trails[i]
	var s = f.strike
	for k in 4:
		if JS.truthy(f.trailActive[k]):
			var j: int = TRAIL_JOINTS[k]
			if s != null and s.move.get("striker") == "knee":
				j = J_KNEE_L if k == 2 else J_KNEE_R
			trails[k].push(model.joints[j])
	if s == null:
		return
	var v = s.move.get("vfx")
	if v == null or v == "":
		return
	if not (s.phase == "active" or (s.phase == "windup" and s.t > s.windup * 0.5)):
		return
	var left: bool = s.side == "L"
	var J := model.joints
	if v == "rocket":
		var h := J[J_HAND_L if left else J_HAND_R]
		var e := J[J_EL_L if left else J_EL_R]
		fx.flame(e.lerp(h, 0.3), (h - e).normalized(), 0.9)
	elif v == "jet":
		var dir := Vector3(0, 0.3, 0) - Vector3(sin(f.yaw), 0, cos(f.yaw))
		fx.flame(J[J_FOOT_L], dir, 1.2)
		fx.flame(J[J_FOOT_R], dir, 1.2)
	elif v == "shock" and randf() < 0.4:
		fx.arc(J[J_HAND_L if left else J_HAND_R], 0.08)
	elif v == "fire" and randf() < 0.5:
		fx.sparks(J[J_HAND_L if left else J_HAND_R], Vector3(0, 0.5, 0), 2, 0xff7a2a, 1.5, 0.6)


## A finisher charging up: the fist crackles and spits sparks, more as it builds (game.ts finisherGlow).
func finisher_glow(i: int, dt: float) -> void:
	var fin = m.fin
	var g: float = fin.glow
	if g < 0.03:
		return
	var at := models[i].joints[int(fin.glowJoint)]
	var col = _paint(i).accent
	var k := dt * maxf(0.3, m.slowmo)
	if randf() < k * 30.0 * g:
		fx.sparks(at, Vector3.UP, 1 + roundi(g * 4.0), col, 1.6 + g * 2.0, 1.5)
	if randf() < k * 9.0 * g:
		fx.arc(at, 0.06 + g * 0.12, col)
	if randf() < k * 14.0 * g:
		fx.flash(at, col, 0.25 + g * 0.5, 0.08)


## Dust when a ragdolled body slams into the canvas (game.ts groundImpacts; the thud's camera
## shake is the fight's).
func ground_impacts(i: int) -> void:
	var f = m.fighters[i]
	if not f.isDown:
		_ground_prev[i] = [false, false, false]
		return
	var body = f.body
	for k in 3:
		var idx: int = GROUND_JOINTS[k]
		var g := JS.truthy(body.grounded[idx])
		if g and not _ground_prev[i][k]:
			var sp: float = body.velocity(idx, SIM_DT, V3.new()).length()
			if sp > 1.2:
				fx.dust(_v(body.pos[idx]), 10 + roundi(sp * 4.0), minf(1.5, sp / 3.0))
		_ground_prev[i][k] = g


## Wrecked parts spit sparks and smoke, worse the more wrecked they are; badly damaged ones vent
## vapour from their hinges; a wrecked trunk bleeds oil from a wound; stumps of torn parts arc,
## smoke and bleed, settling to a steady smoulder (game.ts damageEffects).
func damage_effects(i: int, dt: float) -> void:
	if dt <= 0.0:
		return
	var f = m.fighters[i]
	var md: BotModel = models[i]
	var J0 := md.joints
	var parts = f.parts
	var cond: PackedFloat32Array = parts.cond
	var off: Array = parts.off
	for p in PART_COUNT:
		if off[p] != 0.0:
			continue
		var w := 1.0 - cond[p]
		if w < 0.3:
			continue
		# a light wisp at first, then sparks, thick smoke and arcing as the part fails
		var k := (w - 0.3) / 0.7
		var kk := k * k
		var ab: Array = PART_AT[p]
		var at: Vector3 = J0[ab[0]].lerp(J0[ab[1]], 0.5)
		if randf() < dt * (0.4 + kk * 6.0):
			fx.sparks(at, Vector3.UP, 2 + roundi(kk * 8.0), 0xffb050, 2.0 + kk * 1.5, 1.3)
		if w > 0.4 and randf() < dt * (0.6 + kk * 10.0):
			fx.smoke(at, 1 + roundi(kk), 0.2 + kk * 0.8)
		if w > 0.75 and randf() < dt * (0.3 + kk * 1.5):
			fx.arc(at, 0.1 + kk * 0.06)
	# badly damaged parts blow high-pressure vapour from their hinges (it stops when the part comes off)
	var yaw: float = f.yaw
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var side := J0[J_SH_R] - J0[J_SH_L]
	side.y = 0.0
	if side.length_squared() < 1e-6:
		side = Vector3(cos(yaw), 0, -sin(yaw))
	side = side.normalized()
	for p in PART_COUNT:
		var va = VENT_AT[p]
		if va == null or off[p] != 0.0 or cond[p] >= VENT_BELOW:
			continue
		var r = va[3]
		var radius: float = r * md.size if r is float else float(md.radii.get(r, 0.06))
		var sgn: int = va[4]
		var k := (VENT_BELOW - cond[p]) / VENT_BELOW
		steam.vent(i * 16 + p, J0[va[0]], J0[va[1]], va[2], radius, fwd, side * sgn, k, md.size, dt)
	# a wrecked chest or lower torso bleeds oil from a wound on its plating
	for w in 2:
		var p := BotModel.P_CHEST if w == 0 else BotModel.P_TORSO
		var k := BotWear.oil_leak(p, cond[p])
		if k <= 0.0:
			continue
		var ang: float = yaw + _wounds[i][w]
		var dq := Vector3(sin(ang), 0, cos(ang))
		var dp := J0[J_CHEST] + dq * 0.21 if w == 0 else J0[J_PELVIS].lerp(J0[J_CHEST], 0.3) + dq * 0.17
		oil.leak(i * 2 + w, dp, dq, k, dt)
	for s in _stumps[i]:
		s[1] += dt
		var age: float = s[1]
		var joint: int = s[0]
		var heat := maxf(0.15, 1.0 - age / 5.0)
		var at := J0[joint]
		# a torn socket gushes, then keeps bleeding steadily
		if STUMP_PARENT.has(joint):
			var dq := at - J0[STUMP_PARENT[joint]]
			if dq.length_squared() < 1e-6:
				dq = Vector3.UP
			oil.leak(100 + i * 16 + joint, at, dq.normalized(), 0.6 + maxf(0.0, 1.0 - age / 6.0) * 0.9, dt)
		if randf() < dt * 9.0 * heat:
			fx.sparks(at, Vector3.UP, 2 + roundi(heat * 6.0), 0xffb050, 2.0 + heat * 3.0, 1.4)
		if randf() < dt * 7.0 * heat:
			fx.smoke(at, 1, heat)
		if randf() < dt * 2.5 * heat:
			fx.arc(at, 0.15)
