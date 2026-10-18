## Runs after the fight scene each frame: puts the ad shot's lens where ad_fight.gd wants it.
extends Node

var cam: Camera3D
var pos = null
var look = null
var fov := 0.0


func _process(_dt: float) -> void:
	if cam == null:
		return
	if pos != null:
		cam.look_at_from_position(pos, look)
	if fov > 0.0:
		cam.fov = fov
