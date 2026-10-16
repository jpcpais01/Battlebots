## Loads every translated script so parse errors show up in one run.
extends SceneTree


func _init() -> void:
	quit.call_deferred(2)
	var dirs := ["res://runtime", "res://gen"]
	var bad := 0
	for d in dirs:
		for f in DirAccess.get_files_at(d):
			if not f.ends_with(".gd"):
				continue
			var s: Script = load(d + "/" + f)
			if s == null or not s.can_instantiate():
				print("FAILED ", d, "/", f)
				bad += 1
	TInit.run()
	print("parse_all: ", bad, " failed")
	quit(1 if bad else 0)
