## The fight scene with some buses muted, for recording one part of the mix with Movie Maker
## (e.g. the sound kit alone: BB_MUTE=Crowd,Voice):
##   BB_MUTE=Crowd,Voice xvfb-run -a godot --path godot --rendering-driver opengl3 \
##     --write-movie out.avi --fixed-fps 30 --quit-after <frames> -s res://tests/sfx_stem.gd
extends SceneTree


func _init() -> void:
	for b in OS.get_environment("BB_MUTE").split(",", false):
		var i := AudioServer.get_bus_index(b)
		if i >= 0:
			AudioServer.set_bus_mute(i, true)
	get_root().add_child.call_deferred(load("res://game/fight.tscn").instantiate())
