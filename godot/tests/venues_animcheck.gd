## Holds each venue's ported tick (render/venues/*.gd) to the web's: builds the venue, runs its
## update() at the time the bake recorded (venues_bake.ts extract: anim.check) and compares every
## animated node's placement, visibility and first instances with the web's matrices.
##   tools/shots/shot.sh res://tests/venues_animcheck.gd   (a real renderer: the headless one keeps no
##   MultiMesh instances)
extends SceneTree

const TOL := 5e-3


func _init() -> void:
	var failed := 0
	for id in EventVenues.SCRIPTS:
		if not EventVenues.has_venue(id):
			continue
		var path: String = EventVenues.SCRIPTS[id]
		var script: GDScript = load(path) if path != "" else OutdoorVenue
		var v: OutdoorVenue = script.new(id, null)
		var check: Dictionary = v.anim.get("check", {})
		var nodes: Dictionary = check.get("nodes", {})
		v.update(0.016, float(check.get("t", 0.0)))
		var worst := 0.0
		var bad: Array = []
		for name in nodes:
			var rec: Dictionary = nodes[name]
			var n := v.node(name)
			if n == null:
				bad.append(name + " missing")
				continue
			if n.visible != bool(rec.visible):
				bad.append(name + " visible")
			var world := _world(v, n)
			if n is MultiMeshInstance3D:
				var mm: MultiMesh = (n as MultiMeshInstance3D).multimesh
				var list: Array = rec.inst
				for i in list.size():
					var e := _diff(world * mm.get_instance_transform(i), list[i])
					worst = maxf(worst, e)
					if e > TOL:
						bad.append("%s[%d] off by %.4f" % [name, i, e])
			else:
				var e := _diff(world, rec.world)
				worst = maxf(worst, e)
				if e > TOL:
					bad.append("%s off by %.4f" % [name, e])
		print("%s %s: %d animated, worst %.5f %s" % ["ok  " if bad.is_empty() else "FAIL", id, nodes.size(), worst, ", ".join(bad)])
		failed += 0 if bad.is_empty() else 1
		v.free()
	print("venues_animcheck: ", failed, " failed")
	quit(1 if failed > 0 else 0)


## `n`'s transform relative to the venue's root (it isn't in the tree here).
static func _world(v: Node3D, n: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	var p: Node = n
	while p != null and p != v:
		t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


## The largest difference between a transform and a three column-major matrix.
static func _diff(t: Transform3D, m: Array) -> float:
	var b := t.basis
	var want := [b.x.x, b.x.y, b.x.z, b.y.x, b.y.y, b.y.z, b.z.x, b.z.y, b.z.z, t.origin.x, t.origin.y, t.origin.z]
	var got := [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14]]
	var e := 0.0
	for i in 12:
		# (relative for the far ones: the city's things are kilometres out)
		e = maxf(e, absf(float(want[i]) - float(got[i])) / maxf(1.0, absf(float(got[i])) * 0.001 if i >= 9 else 1.0))
	return e
