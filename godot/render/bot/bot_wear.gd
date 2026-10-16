## What a fight does to the robots' own metal, from the sim's events: the BotModel side of
## src/game/game.ts (the "hit" case's dent, partHit's and tearOff's oil on the robots, and the
## steady bleed of a wrecked trunk or a torn socket in damageEffects). The oil pools, smoke and
## steam on the canvas are the effects' job, not this.
class_name BotWear
extends RefCounted

## A trunk part starts bleeding oil below this condition (game.ts LEAK_BELOW).
const LEAK_BELOW := 0.35
## Joints oil gets splashed onto when it flies about (game.ts SPLASH_JOINTS).
const SPLASH_JOINTS := [BotModel.J_CHEST, BotModel.J_CHEST, BotModel.J_PELVIS, BotModel.J_HEAD, BotModel.J_SH_L, BotModel.J_SH_R, BotModel.J_EL_L, BotModel.J_EL_R, BotModel.J_HAND_L, BotModel.J_HAND_R, BotModel.J_KNEE_L, BotModel.J_KNEE_R, BotModel.J_HIP_L, BotModel.J_HIP_R]


## How badly a trunk part bleeds oil, 0 (not at all) to 1, from its condition (game.ts oilLeak).
static func oil_leak(part: int, cond: float) -> float:
	if (part != BotModel.P_CHEST and part != BotModel.P_TORSO) or cond >= LEAK_BELOW:
		return 0.0
	return 0.15 + 0.85 * ((LEAK_BELOW - cond) / LEAK_BELOW)


## The fist or foot nearest a point (the one that just landed a blow there).
static func nearest_striker(joints: Array[Vector3], p: Vector3) -> int:
	var best := BotModel.J_HAND_L
	var bd := INF
	for j in [BotModel.J_HAND_L, BotModel.J_HAND_R, BotModel.J_FOOT_L, BotModel.J_FOOT_R]:
		var d := joints[j].distance_squared_to(p)
		if d < bd:
			bd = d
			best = j
	return best


static func _splash() -> int:
	return SPLASH_JOINTS[randi() % SPLASH_JOINTS.size()]


## A "hit" event: the metal gives where it struck, and a blow to a bleeding trunk comes away
## dripping (game.ts partHit and the dent).
static func on_hit(models: Array[BotModel], h) -> void:
	var dm: BotModel = models[int(h.defender.index)]
	dm.dent(h)
	if h.shielded:
		return
	var k := oil_leak(int(h.part), float(h.partCond))
	if k > 0.0 and not h.blocked:
		var am: BotModel = models[int(h.attacker.index)]
		am.oil_splash(nearest_striker(am.joints, Vector3(h.point.x, h.point.y, h.point.z)), 0.08 + k * 0.05, 0.8 + k * 0.2, 0.05)
		am.grime += 0.02
		if randf() < 0.5:
			dm.oil_splash(BotModel.J_CHEST if int(h.part) == BotModel.P_CHEST else BotModel.J_PELVIS, 0.12 + k * 0.06)


## A "detach" event: the torn socket wrenches the metal round it and gushes oil over both
## robots (game.ts tearOff, after the piece is handed to the debris). `quiet`: a part torn off
## while seeking, which landed a while ago.
static func on_detach(models: Array[BotModel], d, quiet := false) -> void:
	var model: BotModel = models[int(d.f.index)]
	var at = model.socket_wrench(int(d.part))
	model.grime += 0.12
	if quiet:
		return
	for n in 3:
		model.oil_splash(_splash(), 0.1 + randf() * 0.08)
	var bm: BotModel = models[int(d.by.index)]
	if at != null:
		bm.oil_splash(nearest_striker(bm.joints, at), 0.14, 1.0, 0.05)
	bm.oil_splash(BotModel.J_CHEST if randf() < 0.5 else BotModel.J_HEAD, 0.1 + randf() * 0.06)
	bm.grime += 0.08


## Once a frame: a wrecked trunk or a torn socket keeps bleeding oil down its own plating and
## flicks it onto the other robot when they're close (game.ts damageEffects).
static func update(models: Array[BotModel], m, dt: float) -> void:
	for i in 2:
		var f = m.fighters[i]
		var bleed := 0.0
		for p in [BotModel.P_CHEST, BotModel.P_TORSO]:
			bleed += oil_leak(p, float(f.parts.cond[p]))
		var torn := 0
		for p in BotModel.TORN_BONES:
			if f.parts.off[p] != 0.0:
				torn += 1
		bleed += torn * 0.8
		if bleed <= 0.0:
			continue
		var me := models[i]
		me.grime += dt * 0.006 * bleed
		if randf() < dt * 0.6 * bleed:
			me.oil_splash(_splash(), 0.07 + randf() * 0.08, 0.6 + randf() * 0.4)
		var other := models[1 - i]
		if other.joints[BotModel.J_CHEST].distance_to(me.joints[BotModel.J_CHEST]) < 1.4 and randf() < dt * 0.4 * bleed:
			other.oil_splash(_splash(), 0.06 + randf() * 0.07, 0.6 + randf() * 0.4)
			other.grime += 0.015
