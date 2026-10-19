## Loads the scripts the review touched, so a parse error in any shows up.
##   godot --headless --path . -s res://tests/review_parse.gd
extends SceneTree


func _init() -> void:
	var bad := 0
	for p in ["res://render/baked/baked_scene.gd", "res://render/thumbs/part_thumbs.gd", "res://audio/voice.gd", "res://audio/booth.gd", "res://audio/crowd_audio.gd", "res://audio/sfx.gd", "res://app/gacha/gacha_sound.gd", "res://render/fx/fight_fx.gd"]:
		var s: Script = load(p)
		if s == null or not s.can_instantiate():
			print("FAILED ", p)
			bad += 1
	print("review_parse: ", bad, " failed")
	quit(1 if bad else 0)
