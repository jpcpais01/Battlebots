## The fight arena, rebuilt from the web game's own build of it (godot/assets/venue/arena.*,
## baked by godot/tools/bake/web/venue.ts): the stage, posts, ropes, truss, the corner lifts and
## the indoor bowl with its crowd. This drives what moves (src/render/arena.ts, venue.ts update).
class_name Arena
extends Node3D

const BAKE := "res://assets/venue/arena"

var scene: BakedScene
var mats := VenueMaterials.new()
var _spots := [Vector4(), Vector4(), Vector4()]
var _flash := 0.0
var _house := 0.7


func _init() -> void:
	var t0 := Time.get_ticks_msec()
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	print("arena built in ", Time.get_ticks_msec() - t0, " ms")


func node(name: String) -> Node3D:
	return scene.named.get(name)


## Strobe the boards (knockdowns, KOs).
func strobe(k: float) -> void:
	_flash = minf(1.0, _flash + k)


func update(dt: float, time: float, hype: float) -> void:
	_flash = maxf(0.0, _flash - dt * 0.8)
	RenderingServer.global_shader_parameter_set("bb_time", time)
	RenderingServer.global_shader_parameter_set("bb_hype", hype)
	RenderingServer.global_shader_parameter_set("bb_flash", _flash)
	# follow spots roaming the stands, livelier with the crowd (venue.ts update)
	for i in 3:
		var a := time * (0.09 + i * 0.03) * (-1.0 if i % 2 else 1.0) + i * 2.1
		var d := 7.0 + 9.0 * (0.5 + 0.5 * sin(time * 0.17 + i * 1.7))
		var xz := _towards(a, d)
		RenderingServer.global_shader_parameter_set("bb_spot%d" % i, Vector4(xz.x, xz.y, 3.2 + d * 0.08, minf(1.1, 0.35 + hype * 0.55)))


## House-light exposure (house.ts update): `subject` is the camera's distance to what it frames
## in a fight (tight shots sink the house into the dark), or < 0 in menus.
func expose(dt: float, subject: float) -> void:
	var target := 0.7
	if subject >= 0.0:
		target = 0.42 + (0.78 - 0.42) * smoothstep(0.0, 1.0, (subject - 3.0) / 9.0)
	_house += (target - _house) * (1.0 - exp(-dt * 2.3 / 1.2))
	RenderingServer.global_shader_parameter_set("bb_house", _house)


## bowl.ts towards(): roughly the point `d` metres out along the bowl's outline at angle `a`.
static func _towards(a: float, d: float) -> Vector2:
	return Vector2(cos(a) * (13.0 + d), sin(a) * (10.0 + d))
