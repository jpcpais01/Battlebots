## Compiles shaders (a directory of .gdshader files, or one file) on a quad each and draws a frame,
## so the GL renderer reports any compile error (venues port).
##   tools/shots/shot.sh res://tests/venues_shadercheck.gd <dir-or-file> [more...]
extends SceneTree


func _init() -> void:
	var files: Array[String] = []
	for a in OS.get_cmdline_user_args():
		if a.ends_with(".gdshader"):
			files.append(a)
		else:
			var d := DirAccess.open(a)
			if d:
				for f in d.get_files():
					if f.ends_with(".gdshader"):
						files.append(a.path_join(f))
	var root := Node3D.new()
	get_root().add_child(root)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.position = Vector3(0, 0, 3)
	for f in files:
		var sh := Shader.new()
		sh.code = FileAccess.get_file_as_string(f)
		var m := ShaderMaterial.new()
		m.shader = sh
		var mi := MeshInstance3D.new()
		mi.mesh = QuadMesh.new()
		mi.material_override = m
		root.add_child(mi)
		print("SHADER ", f)
	for i in 3:
		await process_frame
	print("done ", files.size())
	quit()
