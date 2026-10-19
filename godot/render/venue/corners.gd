## The two fighters' corners (src/render/corners.ts Corners). Each has a lift: a round hatch in
## the canvas ringed with light, doors that slide apart, a lit shaft, and the deck that carries the
## robot up and then stays flush with the canvas as the corner's floor plate. The corner post wears
## the corner's colours, and CO2 cannons at its foot fire as the lift locks. Driven by the entrance
## timeline (src/sim/entrance.ts, gen TEntrance), so it can be scrubbed: everything follows match
## time. The geometry is the arena bake's (nodes corner{i}, corner{i}_deck, ... see venue.ts).
##
## `m` below is the match, or anything with `phase` and `phaseTime` (a snapshot taken while the
## sim is not stepping); null means no fight, everything at rest.
class_name Corners
extends RefCounted

## Corner colours: the blue corner (fighter 0) and the orange corner (fighter 1).
const CORNER_COLOR := [0x2ad8ff, 0xff7a2a]

## Beats of an entrance, for the sound: called with (fighter index, "open" | "rise" | "arrive").
var on_cue: Callable

## Per corner: a Dictionary of its nodes, materials and state (corners.ts Corner).
var _c: Array[Dictionary] = []
## Each fighter's accent colour (linear): the light show of its entrance is in its own colours.
var _accents: Array[Color] = [_lin(CORNER_COLOR[0]), _lin(CORNER_COLOR[1])]
var _v := Vector3()


func _init(arena: Arena) -> void:
	for i in 2:
		var xz: Array = TEntrance.hatchXZ(i)
		var x: float = xz[0]
		var z: float = xz[1]
		var d := sqrt(x * x + z * z)
		var p := "corner%d" % i
		var deck_top: MeshInstance3D = arena.node(p + "_deckTop")
		var shaft: Node3D = arena.node(p + "_shaft")
		var sleeve: MeshInstance3D = arena.node(p + "_sleeve")
		var column: MeshInstance3D = arena.node(p + "_column")
		var beam: MeshInstance3D = arena.node(p + "_beam")
		var ring: MeshInstance3D = arena.node(p + "_ring")
		# the corner post's CO2 cannons, either side of it on the canvas edge
		var a: float = (TEntrance.CORNER_OF[i] + 0.5) * PI / 4.0
		var px := cos(a) * TBody.RING_CORNER
		var pz := sin(a) * TBody.RING_CORNER
		var tx := -sin(a)
		var tz := cos(a)
		var jets: Array[Vector3] = []
		for s in [-1.0, 1.0]:
			jets.append(Vector3(px * 0.97 + tx * s * 0.42, 0.06, pz * 0.97 + tz * s * 0.42))
		var c := {
			"i": i, "x": x, "z": z, "in_x": -x / d, "in_z": -z / d,
			"deck": arena.node(p + "_deck"),
			"rod": arena.node(p + "_rod"),
			"doors": [arena.node(p + "_door0"), arena.node(p + "_door1")],
			"shaft": shaft,
			"column": column,
			"beam": beam,
			"ring": _mat(ring, 0),
			"column_mat": _mat(column, 0),
			"beam_mat": _mat(beam, 0),
			# emissive materials: [material, emissive colour (linear)], intensity set per frame
			"deck_glow": _emissive(arena, deck_top, 1),
			"sleeve": _emissive(arena, sleeve, 0),
			"shaft_mat": _emissive(arena, shaft.get_child(0) if shaft and shaft.get_child_count() > 0 else null, 0),
			"jets": jets,
			"last_t": INF,
			"drop": 0.0,
			"flare": 0.0,
		}
		_c.append(c)
	_pose(null)


static func _mat(mi: MeshInstance3D, surface: int) -> ShaderMaterial:
	if mi == null or mi.mesh == null or mi.mesh.get_surface_count() <= surface:
		return null
	return mi.mesh.surface_get_material(surface) as ShaderMaterial


## A MeshStandardMaterial port and its baked emissive colour (VenueMaterials bakes emissive x intensity).
static func _emissive(arena: Arena, mi: MeshInstance3D, surface: int) -> Array:
	var m := _mat(mi, surface)
	if m == null:
		return []
	var n: Dictionary = mi.get_meta("bake")
	var groups: Array = arena.scene.json.geometries[int(n.geometry)].groups
	var slot: int = int(groups[surface][2]) if groups.size() > surface else 0
	var rec: Dictionary = arena.scene.json.materials[int(n.materials[mini(slot, n.materials.size() - 1)])]
	var e: Array = rec.emissive.color
	return [m, Vector3(e[0], e[1], e[2])]


static func _set_glow(em: Array, k: float) -> void:
	if not em.is_empty():
		Mats.put(em[0], "emissive", em[1] * k)


## A 0xRRGGBB colour (sRGB) in linear, as three's Color.setHex.
static func _lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


static func _ease(u: float) -> float:
	return 0.0 if u <= 0.0 else 1.0 if u >= 1.0 else u * u * (3.0 - 2.0 * u)


## Seconds into fighter i's presentation (negative: not yet; INF: no intro on).
static func _entry_time(m, i: int) -> float:
	return INF if m == null else TEntrance.entryTime(m.phase, m.phaseTime, i)


## Each fighter's accent colour (the light show of its entrance), as 0xRRGGBB (paint.accent).
func set_accents(a: int, b: int) -> void:
	_accents[0] = _lin(a)
	_accents[1] = _lin(b)


## How far below the canvas fighter i's lift deck is at this moment of the match (0 = flush).
## The robot rides on it: game.ts raises the whole model by this (model.root.position.y = drop),
## so add it to the bot model's height after posing it.
func drop(m, i: int) -> float:
	var t := _entry_time(m, i)
	return 0.0 if t == INF else TEntrance.liftDrop(t)


## How hard fighter i's corner is lit up right now (0..1): the house lights follow it.
func flare(i: int) -> float:
	return _c[i].flare


## Pose the corners for this moment of the match (null: no fight, everything at rest).
func _pose(m, time := 0.0) -> void:
	var E: Dictionary = TEntrance.ENTRY
	for c in _c:
		var t := _entry_time(m, c.i)
		var done := t == INF
		var open := 1.0 if done else _ease((t - E.open) / (E.opened - E.open))
		var up := 1.0 if done else TEntrance.liftUp(t)
		var dr := 0.0 if done else TEntrance.liftDrop(t)
		c.drop = dr
		if c.deck:
			c.deck.position.y = dr
		if c.rod:
			c.rod.visible = absf(dr) > 0.002
		for k in 2:
			var door: Node3D = c.doors[k]
			if door == null:
				continue
			door.visible = open < 0.999
			# each half slides out along its own side (local z), under the canvas
			door.position.z = (-1.0 if k == 0 else 1.0) * open * (TEntrance.HATCH_R + 0.04)
		if c.shaft:
			c.shaft.visible = open > 0.001 and up < 0.999
		# how hot the corner runs: builds as the doors open, peaks on the reveal, settles
		var live := 0.0
		if not done and t >= 0.0:
			live = 0.25 + 0.75 * _ease(t / E.arrive) if t < E.arrive else exp(-(t - E.arrive) * 1.1)
		c.flare = live
		var waiting := not done and t < 0.0
		var ring: ShaderMaterial = c.ring
		if ring:
			Mats.put(ring, "glow", 1.2 + 0.4 * sin(time * 3.0) if waiting else 1.4 + live * 2.2)
			Mats.put(ring, "chase", live)
			# (the shader turns it by bb_time, so a ring at rest needs no new value each frame)
			Mats.put(ring, "spin_rate", 0.4 + live * 3.0)
		_set_glow(c.deck_glow, 0.9 + live * 2.5)
		_set_glow(c.sleeve, 1.1 + live * 2.2 * (0.75 + 0.25 * sin(time * 14.0)))
		_set_glow(c.shaft_mat, 1.2 + live * 2.0)
		# light pouring out of the open shaft, and the spot from above
		var acc: Color = _accents[c.i]
		var ck := 0.0 if done else open * (1.0 if t < E.arrive else exp(-(t - E.arrive) * 2.2))
		if c.column_mat:
			Mats.put(c.column_mat, "k", ck * 1.6)
			Mats.put(c.column_mat, "color", Vector3(acc.r, acc.g, acc.b))
		if c.column:
			c.column.visible = ck > 0.01
		var bk := 0.0
		if not done and t >= 0.0:
			bk = _ease(t / 0.6) * 0.7 if t < E.arrive else 0.7 + 0.5 * exp(-(t - E.arrive) * 2.0) - _ease((t - E.arrive - 1.2) / 1.2) * 0.7
		if c.beam_mat:
			var bc := acc.lerp(Color(1, 1, 1), 0.35)
			Mats.put(c.beam_mat, "k", maxf(0.0, bk) * 0.5)
			Mats.put(c.beam_mat, "color", Vector3(bc.r, bc.g, bc.b))
		if c.beam:
			c.beam.visible = bk > 0.01


## Every frame: pose the corners and fire the entrance's beats. `fx`: the hit effects (anything
## with vapor(p, vx, vy, vz, size), sparks(p, dir, count, color, speed, spread) and
## flash(p, color, size, life) like the web Fx; null for none). `quiet`: seeking or skipping, so
## the beats pass without fireworks or cues.
func update(dt: float, time: float, m, fx = null, quiet := false) -> void:
	_pose(m, time)
	if m == null or quiet or dt <= 0.0:
		for c in _c:
			c.last_t = _entry_time(m, c.i)
		return
	var E: Dictionary = TEntrance.ENTRY
	for c in _c:
		var t := _entry_time(m, c.i)
		var t0: float = c.last_t
		c.last_t = t
		if t == INF:
			continue
		var i: int = c.i
		# a beat passed this frame (and not long ago: a seek or a skip lands without fireworks)
		if _at(t0, t, E.open):
			_cue(i, "open")
		if _at(t0, t, E.rise):
			_cue(i, "rise")
		if fx == null:
			if _at(t0, t, E.arrive):
				_cue(i, "arrive")
			continue
		var acc: Color = _accents[i]
		var hr := TEntrance.HATCH_R
		# cold fog spilling over the rim while the shaft is open
		if t > E.open and t < E.arrive + 0.3:
			if randf() < dt * 32.0:
				var a := randf() * TAU
				_v = Vector3(c.x + cos(a) * hr * 0.9, 0.06, c.z + sin(a) * hr * 0.9)
				var sp := 0.4 + randf() * 0.5
				fx.vapor(_v, cos(a) * sp, 0.15 + randf() * 0.3, sin(a) * sp, 0.16)
			# and a hot draught straight up the middle
			if t > E.rise and randf() < dt * 14.0:
				_v = Vector3(c.x + (randf() - 0.5) * 0.4, 0.1, c.z + (randf() - 0.5) * 0.4)
				fx.vapor(_v, 0.0, 1.4 + randf(), 0.0, 0.12)
		if _at(t0, t, E.arrive):
			_cue(i, "arrive")
			# the reveal: a ring of sparks off the rim, a flash, the cannons
			for k in 6:
				var a := float(k) / 6.0 * TAU + randf() * 0.4
				_v = Vector3(c.x + cos(a) * hr, 0.05, c.z + sin(a) * hr)
				fx.sparks(_v, Vector3(cos(a) * 0.35, 1.0, sin(a) * 0.35).normalized(), 7, acc, 5.0, 0.5)
			fx.flash(Vector3(c.x, 0.5, c.z), acc, 2.2, 0.25)
		# CO2: two white columns for the best part of a second
		var s: float = t - E.arrive
		if s >= 0.0 and s < 0.85:
			for j: Vector3 in c.jets:
				var n := roundi(dt * 45.0 * (1.0 - s * 0.6))
				for k in n:
					fx.vapor(j + Vector3(0, 0.12, 0), c.in_x * 0.4 + (randf() - 0.5) * 0.35, 6.0 + randf() * 2.5, c.in_z * 0.4 + (randf() - 0.5) * 0.35, 0.13)
			if s < 0.2 and randf() < dt * 30.0:
				fx.sparks(c.jets[randi() % 2], Vector3.UP, 4, _lin(0xfff2d0), 4.0, 0.4)


static func _at(t0: float, t: float, b: float) -> bool:
	return t0 < b and t >= b and t - b < 0.25


func _cue(i: int, cue: String) -> void:
	if on_cue.is_valid():
		on_cue.call(i, cue)
