## Loads the fight HUD's scripts (and the fight's) so their parse errors show up in one run.
##   godot --headless --path godot -s res://tests/hud_parse.gd
extends SceneTree


func _init() -> void:
	var bad := 0
	var files := ["res://game/fight_hud.gd", "res://game/fight.gd"]
	for f in DirAccess.get_files_at("res://game/hud"):
		if f.ends_with(".gd"):
			files.append("res://game/hud/" + f)
	for f in files:
		var s: Script = load(f)
		if s == null or not s.can_instantiate():
			print("FAILED ", f)
			bad += 1
	print("hud_parse: ", bad, " failed")
	quit(1 if bad else 0)
