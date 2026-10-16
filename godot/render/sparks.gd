## Hit sparks: short-lived streaks thrown from where a blow lands (a light stand-in for the web's
## fx.ts sparks until phase 2).
class_name Sparks
extends Node3D

const POOL := 6

var _emitters: Array[CPUParticles3D] = []
var _next := 0


func _init() -> void:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	var quad := QuadMesh.new()
	quad.size = Vector2(0.025, 0.025)
	quad.material = mat
	for i in POOL:
		var p := CPUParticles3D.new()
		p.emitting = false
		p.one_shot = true
		p.explosiveness = 1.0
		p.amount = 40
		p.lifetime = 0.45
		p.mesh = quad
		p.direction = Vector3(0, 0, 1)
		p.spread = 55.0
		p.initial_velocity_min = 2.0
		p.initial_velocity_max = 6.5
		p.gravity = Vector3(0, -9.8, 0)
		p.damping_min = 1.0
		p.damping_max = 3.0
		p.scale_amount_min = 0.6
		p.scale_amount_max = 1.4
		var fade := Gradient.new()
		fade.set_color(0, Color(1, 1, 1, 1))
		fade.set_color(1, Color(1, 1, 1, 0))
		p.color_ramp = fade
		p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(p)
		_emitters.append(p)


## Throw `n` sparks from `at`, back along the blow `dir`, glowing `col` (HDR).
func burst(at: Vector3, dir: Vector3, n: int, col: Color) -> void:
	var p := _emitters[_next]
	_next = (_next + 1) % POOL
	p.global_position = at
	var back := -dir.normalized() if dir.length_squared() > 1e-6 else Vector3.UP
	p.direction = back + Vector3(0, 0.4, 0)
	p.amount = maxi(1, n)
	p.color = col
	p.restart()
