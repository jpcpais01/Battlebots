## Headless check of the world map (render/map/world_map.gd): builds it, prints what it holds
## (draws, triangles, instances), how long the build took and the per-frame update cost.
##   godot --headless --path godot -s res://tests/worldmap_check.gd
extends SceneTree


func _init() -> void:
	_run.call_deferred()


func _run() -> void:
	var w := WorldMap.new()
	get_root().add_child(w)
	var t0 := Time.get_ticks_usec()
	w._build_step(1000000)
	var t1 := Time.get_ticks_usec()
	w.build_now()
	var t2 := Time.get_ticks_usec()
	print("open %.1f ms, nodes %.1f ms" % [(t1 - t0) / 1000.0, (t2 - t1) / 1000.0])
	var surfaces := 0
	var tris := 0
	var mms := 0
	var inst := 0
	for n in w.find_children("*", "GeometryInstance3D", true, false):
		var mesh: Mesh = null
		var count := 1
		if n is MeshInstance3D:
			mesh = n.mesh
		elif n is MultiMeshInstance3D:
			mesh = n.multimesh.mesh
			count = n.multimesh.instance_count
			mms += 1
			inst += count
		if mesh == null:
			continue
		for s in mesh.get_surface_count():
			surfaces += 1
			var a := mesh.surface_get_arrays(s)
			var idx = a[Mesh.ARRAY_INDEX]
			var nv: int = (a[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()
			tris += (idx.size() / 3 if idx != null and mesh.surface_get_primitive_type(s) == Mesh.PRIMITIVE_TRIANGLES else 0) * count
	print("surfaces %d, multimeshes %d (%d instances), triangles %d" % [surfaces, mms, inst, tris])
	print("missing ports: ", w._mats.missing.keys())
	print("anchors ", w.sites.anchors)
	# the per-frame cost
	var n := 300
	var t := 0.0
	var u0 := Time.get_ticks_usec()
	for i in n:
		t += 1.0 / 60.0
		w.update(1.0 / 60.0, t)
	print("update day: %.3f ms/frame" % [(Time.get_ticks_usec() - u0) / 1000.0 / n])
	w._night = 1.0
	w._night_to = 1.0
	w._apply_time()
	u0 = Time.get_ticks_usec()
	for i in n:
		t += 1.0 / 60.0
		w.update(1.0 / 60.0, t)
	print("update night: %.3f ms/frame" % [(Time.get_ticks_usec() - u0) / 1000.0 / n])
	print("ground at grand %.2f, cam pos %s look %s" % [w.ground_at(206, -190), w.cam.pos, w.cam.look])
	quit()
