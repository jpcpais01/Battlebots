## How far the two robots' armour sinks into each other over real fights, as drawn (after the
## contact passes). Each bone's plating is voxelised once (its triangles marked in a 2 cm grid in
## the bone's rest frame, the outside flood-filled, what is left solid, with its depth in from
## the outside), and every frame the other robot's plating corners (thinned to one per 3 cm) are
## looked up in it. Reports, by what the robots are doing, how often and how deep anything sinks
## into the other robot, and which pairs of parts do it most.
##   godot --headless --path godot -s res://tests/bots_clip.gd -- [seeds 1,2,3] [frames per fight]
## Env: BB_NO_MEET=1 skips the body pass; BB_NO_OPP=1 all contact with the other robot.
extends SceneTree

const H := 0.02
const THIN := 0.03
const BONES := [BotModel.TORSO, BotModel.CORE_F, BotModel.CORE_B, BotModel.HEAD, BotModel.PELVIS, BotModel.UP_L, BotModel.UP_R, BotModel.FORE_L, BotModel.FORE_R, BotModel.FIST_L, BotModel.FIST_R, BotModel.THIGH_L, BotModel.THIGH_R, BotModel.SHIN_L, BotModel.SHIN_R, BotModel.FOOT_L, BotModel.FOOT_R]


## A bone's plating as solid voxels: depth (in cells) of each from the outside, 0 outside.
class Solid extends RefCounted:
	var o := Vector3.ZERO
	var n := Vector3i.ZERO
	var depth := PackedByteArray()
	var centre := Vector3.ZERO
	var radius := 0.0

	func at(l: Vector3) -> float:
		var q := ((l - o) / H).floor()
		if q.x < 0 or q.y < 0 or q.z < 0 or q.x >= n.x or q.y >= n.y or q.z >= n.z:
			return 0.0
		return depth[(int(q.z) * n.y + int(q.y)) * n.x + int(q.x)] * H


var _solids := {}
var _samples := {}


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seeds: PackedStringArray = (args[0] if args.size() > 0 else "1234,99,555").split(",")
	var frames := int(args[1]) if args.size() > 1 else 2400
	TInit.run()
	var meet := not OS.has_environment("BB_NO_MEET")
	var opp := not OS.has_environment("BB_NO_OPP")
	# per situation: [frames, frames over 1 cm, over 3 cm, over 6 cm, sum of deepest]; pairs: [sum, frames]
	var stats := {}
	var pairs := {}
	var us := 0.0
	var n_us := 0
	for sd in seeds:
		var rng := TMath.Rng.new(float(sd))
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		m.skipIntro()
		var root := Node3D.new()
		get_root().add_child(root)
		var models: Array[BotModel] = []
		for i in 2:
			var bm := BotModel.new(m.specs[i])
			root.add_child(bm)
			bm.wait_hulls()
			models.append(bm)
			_prepare(bm)
		for fr in frames:
			if m.phase == "end":
				break
			for s in 4:
				m.step(1.0 / 120.0)
			var t := Time.get_ticks_usec()
			var time := fr / 30.0
			for i in 2:
				models[i].begin(m.fighters[i], 0.5, _v(m.fighters[1 - i].body.pos[3]))
			if meet and models[0].has_method("meet"):
				models[0].call("meet", models[0], m.fighters[0], models[1], m.fighters[1], time)
			for i in 2:
				models[i].solve(m.fighters[i], time, models[1 - i] if opp else null)
			for i in 2:
				models[i].end(m.fighters[i], time, models[1 - i] if opp else null, true)
			us += Time.get_ticks_usec() - t
			n_us += 1
			if models[0].joints[1].distance_to(models[1].joints[1]) > 1.1 * (models[0].size + models[1].size) * 0.5:
				continue
			var g = m.grapple
			var sit := "standing up"
			if m.fighters[0].isDown or m.fighters[1].isDown:
				sit = "one down"
			elif g != null and g.live:
				sit = "grapple " + String(g.phase)
			elif m.fighters[0].strike != null or m.fighters[1].strike != null:
				sit = "striking"
			var got := {}
			_measure(models[0], models[1], got)
			_measure(models[1], models[0], got)
			var deepest := 0.0
			for key in got:
				deepest = maxf(deepest, got[key])
				var pk: String = sit + "|" + key
				if not pairs.has(pk):
					pairs[pk] = [0.0, 0]
				pairs[pk][0] += got[key]
				pairs[pk][1] += 1
			for key in [sit, "all close"]:
				if not stats.has(key):
					stats[key] = [0, 0, 0, 0, 0.0]
				var st: Array = stats[key]
				st[0] += 1
				st[1] += 1 if deepest > 0.01 else 0
				st[2] += 1 if deepest > 0.03 else 0
				st[3] += 1 if deepest > 0.06 else 0
				st[4] += deepest
		root.queue_free()
	print("posing with contact: %.3f ms a frame for both robots" % (us / maxf(1, n_us) / 1000.0))
	var keys := stats.keys()
	keys.sort()
	for key in keys:
		var st: Array = stats[key]
		var nf := maxf(1, st[0])
		print("%-16s %4d frames: deepest overlap %5.1f mm on average; >1 cm %5.1f%%, >3 cm %5.1f%%, >6 cm %5.1f%% of frames" % [key, st[0], st[4] / nf * 1000.0, 100.0 * st[1] / nf, 100.0 * st[2] / nf, 100.0 * st[3] / nf])
		var rows := []
		for pk in pairs:
			var parts: PackedStringArray = (pk as String).split("|")
			if parts[0] == key:
				rows.append([pairs[pk][0] / nf, parts[1], 100.0 * pairs[pk][1] / nf])
		rows.sort()
		rows.reverse()
		for r in rows.slice(0, 6):
			print("    %-28s %5.1f mm (in %3.0f%% of frames)" % [r[1], r[0] * 1000.0, r[2]])
	quit()


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


static func _cls(bone: int, v: Vector3) -> String:
	match bone:
		BotModel.TORSO, BotModel.CORE_F, BotModel.CORE_B:
			return "chest"
		BotModel.HEAD:
			return "head"
		BotModel.PELVIS:
			return "pelvis"
		BotModel.UP_L, BotModel.UP_R:
			return "pauldron" if v.y < 0.06 or Vector2(v.x, v.z).length() > 0.125 else "upper arm"
		BotModel.FORE_L, BotModel.FORE_R:
			return "forearm"
		BotModel.FIST_L, BotModel.FIST_R:
			return "fist"
		BotModel.THIGH_L, BotModel.THIGH_R:
			return "thigh"
		BotModel.SHIN_L, BotModel.SHIN_R:
			return "shin"
	return "foot"


## Each bone's thinned corners (and their class) and its solid.
func _prepare(bm: BotModel) -> void:
	var tris := {}
	for e in bm._list:
		var bone: int = e[1]
		if not (bone in BONES):
			continue
		var p: BotParts.Part = BotParts.get_part(e[0])
		if not tris.has(bone):
			tris[bone] = []
		tris[bone].append(p.opaque)
		tris[bone].append(p.glow)
	var samples := {}
	var solids := {}
	for bone in tris:
		var seen := {}
		var pts := PackedVector3Array()
		var cls := PackedStringArray()
		for fam: BotParts.Family in tris[bone]:
			for v in fam.pos:
				var k := Vector3i((v / THIN).floor())
				if not seen.has(k):
					seen[k] = true
					pts.append(v)
					cls.append(_cls(bone, v))
		samples[bone] = [pts, cls]
		solids[bone] = _solid(tris[bone])
	_samples[bm] = samples
	_solids[bm] = solids


static func _solid(fams: Array) -> Solid:
	var lo := Vector3.INF
	var hi := -Vector3.INF
	for fam: BotParts.Family in fams:
		for v in fam.pos:
			lo = lo.min(v)
			hi = hi.max(v)
	var s := Solid.new()
	if lo.x > hi.x:
		return s
	s.o = lo - Vector3.ONE * 2.0 * H
	s.n = Vector3i(((hi - lo) / H).ceil()) + Vector3i(5, 5, 5)
	s.centre = (lo + hi) * 0.5
	s.radius = (hi - lo).length() * 0.5
	var nx := s.n.x
	var ny := s.n.y
	var nz := s.n.z
	var total := nx * ny * nz
	# 1 surface, 2 outside, 0 not reached yet
	var mark := PackedByteArray()
	mark.resize(total)
	for fam: BotParts.Family in fams:
		var pos := fam.pos
		var idx := fam.index
		for t in range(0, idx.size(), 3):
			var a := pos[idx[t]]
			var b := pos[idx[t + 1]]
			var c := pos[idx[t + 2]]
			var steps := maxi(1, int(ceil(maxf(a.distance_to(b), maxf(b.distance_to(c), c.distance_to(a))) / (H * 0.5))))
			for i in steps + 1:
				for j in steps + 1 - i:
					var p := a + (b - a) * (float(i) / steps) + (c - a) * (float(j) / steps)
					var q := Vector3i(((p - s.o) / H).floor())
					mark[(q.z * ny + q.y) * nx + q.x] = 1
	# flood the outside in from the grid's corner (the grid has a clear border all round)
	var queue := PackedInt32Array()
	queue.append(0)
	mark[0] = 2
	var head := 0
	var steps6 := [1, -1, nx, -nx, nx * ny, -nx * ny]
	while head < queue.size():
		var o := queue[head]
		head += 1
		var x := o % nx
		var y := (o / nx) % ny
		var z := o / (nx * ny)
		for k in 6:
			if (k == 0 and x == nx - 1) or (k == 1 and x == 0) or (k == 2 and y == ny - 1) or (k == 3 and y == 0) or (k == 4 and z == nz - 1) or (k == 5 and z == 0):
				continue
			var oo: int = o + steps6[k]
			if mark[oo] == 0:
				mark[oo] = 2
				queue.append(oo)
	# depth in from the outside (6-neighbour steps from outside cells)
	var dist := PackedInt32Array()
	dist.resize(total)
	queue = PackedInt32Array()
	for o in total:
		if mark[o] == 2:
			queue.append(o)
		else:
			dist[o] = -1
	head = 0
	while head < queue.size():
		var o := queue[head]
		head += 1
		var x := o % nx
		var y := (o / nx) % ny
		var z := o / (nx * ny)
		for k in 6:
			if (k == 0 and x == nx - 1) or (k == 1 and x == 0) or (k == 2 and y == ny - 1) or (k == 3 and y == 0) or (k == 4 and z == nz - 1) or (k == 5 and z == 0):
				continue
			var oo: int = o + steps6[k]
			if dist[oo] < 0:
				dist[oo] = dist[o] + 1
				queue.append(oo)
	s.depth.resize(total)
	for o in total:
		# (a surface cell is half in: depth counts from the cell past it)
		s.depth[o] = clampi(dist[o] - 1, 0, 255)
	return s


## The deepest of a's corners in each of b's parts, by "a part>b part".
func _measure(a: BotModel, b: BotModel, got: Dictionary) -> void:
	var sa: Dictionary = _samples[a]
	var sb: Dictionary = _solids[b]
	for bone in sa:
		if a._scl[bone] == Vector3.ZERO:
			continue
		var pts: PackedVector3Array = sa[bone][0]
		var cls: PackedStringArray = sa[bone][1]
		var xa := Transform3D(a._rot[bone] * Basis.from_scale(a._scl[bone]), a._pos[bone])
		var ca := xa * Vector3.ZERO
		for ob in sb:
			if b._scl[ob] == Vector3.ZERO:
				continue
			var sol: Solid = sb[ob]
			if sol.radius <= 0.0:
				continue
			var xb := Transform3D(b._rot[ob] * Basis.from_scale(b._scl[ob]), b._pos[ob])
			var wc := xb * sol.centre
			if wc.distance_to(ca) > sol.radius * b.size + 0.8 * a.size:
				continue
			var m := xb.affine_inverse() * xa
			var oc := "upper arm/pauldron" if ob == BotModel.UP_L or ob == BotModel.UP_R else _cls(ob, Vector3(0, 1, 0))
			for i in pts.size():
				var d := sol.at(m * pts[i]) * b.size
				if d > 0.0:
					var key := cls[i] + ">" + oc
					if d > got.get(key, 0.0):
						got[key] = d
