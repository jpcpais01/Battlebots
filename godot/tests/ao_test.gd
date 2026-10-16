## Contact AO check: a standing robot's spheres over a grey floor that reads the AO map, and a
## sphere-lit ball beside it (shot.sh res://tests/ao_test.gd out.png).
extends SceneTree


func _init() -> void:
	var out := OS.get_cmdline_user_args()[0]
	var root := Node3D.new()
	get_root().add_child(root)
	var ao := ContactAO.new()
	root.add_child(ao)
	var j: Array[Vector3] = []
	var pts := [[0, 1.0, 0], [0, 1.45, 0], [0, 1.75, 0], [0, 1.95, 0], [-0.3, 1.6, 0], [-0.5, 1.3, 0], [-0.55, 1.0, 0.2], [0.3, 1.6, 0], [0.5, 1.3, 0], [0.55, 1.0, 0.2], [-0.15, 0.95, 0], [-0.2, 0.5, 0], [-0.2, 0.1, 0], [0.15, 0.95, 0], [0.2, 0.5, 0], [0.2, 0.1, 0]]
	for p in pts:
		j.append(Vector3(p[0], p[1], p[2]))
	ao.set_robot(0, j, 1.0)
	ao.set_robot(1, [] as Array[Vector3])
	ao.commit()
	var floor := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(8, 8)
	floor.mesh = pm
	var m := ShaderMaterial.new()
	m.shader = Shader.new()
	m.shader.code = "shader_type spatial; render_mode unshaded;\n#include \"res://render/ao/contact_ao.gdshaderinc\"\nvarying vec3 w; void vertex(){ w = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; } void fragment(){ ALBEDO = vec3(0.5) * ao_floor_map(w.xz) * ao_spheres(w + vec3(0.0, 0.001, 0.0), vec3(0.0, 1.0, 0.0), 0.0); }"
	floor.material_override = m
	root.add_child(floor)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.look_at_from_position(Vector3(0, 6, 4), Vector3(0, 0, 0))
	for f in 8:
		await process_frame
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(out)
	print("saved ", out)
	quit()
