## Turns the bits.ts fragment shapes baked by tools/bake/web/fx_bake.ts (assets/fx/bits.json) into
## one ArrayMesh resource, a surface per kind (assets/fx/bits.res), which exports like any asset.
##   godot --headless --path godot -s res://tests/fx_make_bits.gd
extends SceneTree


func _init() -> void:
	var j: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/fx/bits.json"))
	var mesh := ArrayMesh.new()
	for kind in j.kinds:
		var v := PackedVector3Array()
		var n := PackedVector3Array()
		for t in range(0, kind.size(), 9):
			var a := Vector3(kind[t], kind[t + 1], kind[t + 2])
			var b := Vector3(kind[t + 3], kind[t + 4], kind[t + 5])
			var c := Vector3(kind[t + 6], kind[t + 7], kind[t + 8])
			# (wound clockwise for Godot: the outward normal is (c - a) x (b - a))
			var fn := (c - a).cross(b - a).normalized()
			v.append_array([a, b, c])
			n.append_array([fn, fn, fn])
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = v
		arr[Mesh.ARRAY_NORMAL] = n
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	print(ResourceSaver.save(mesh, "res://assets/fx/bits.res"), " surfaces ", mesh.get_surface_count())
	quit()
