## The arena floor's live part (src/render/floor.ts FloorShow.event/update): big moments set the
## photographers' flashes off round the ring (photo_flash.gdshader fires each one from `now`,
## `burst` and `burst_k`). The uplights at the foot of the boards pulse with bb_hype on their own.
class_name FloorShow
extends RefCounted

var _flash: ShaderMaterial
var _t := 0.0


func _init(flash_mat: ShaderMaterial) -> void:
	_flash = flash_mat


## Big moments set the photographers' flashes off (floor.ts event).
func event(type: String, data) -> void:
	var big := type == "knockdown" or type == "ko" or type == "decision" or type == "fightStart"
	if type == "hit" and data is Dictionary:
		big = not data.blocked and not data.shielded and (float(data.damage) >= 45.0 or data.crit)
	if not big or _flash == null:
		return
	_flash.set_shader_parameter("burst", _t)
	_flash.set_shader_parameter("burst_k", 1.0 if type == "ko" or type == "knockdown" else 0.55)


func update(dt: float) -> void:
	_t += dt
	if _flash:
		_flash.set_shader_parameter("now", _t)
