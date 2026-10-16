## Hot metal sparks as motion-blurred streaks (port of src/render/sparks.ts Sparks). Each spark
## is one instance of a quad that the shader stretches on screen back along its velocity; they
## start white hot, cool through their tint to an ember, and bounce and skid on the deck. The
## web steps them on the CPU; here each is written once and sparks.gdshader flies it.
class_name FxSparks
extends Node3D

const MAX := 640
const SHADER := preload("res://render/fx/sparks.gdshader")

var pool: FxPool
var clock := 0.0
var _seed := 0.0


func _init() -> void:
	var mesh := ArrayMesh.new()
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	# x across the streak (-1..1), y along it (0 head .. 1 tail)
	arr[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(-1, 0, 0), Vector3(1, 0, 0), Vector3(-1, 1, 0), Vector3(1, 1, 0)])
	arr[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 1, 3, 2])
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	pool = FxPool.new(MAX, mesh, SHADER, true, false)
	pool.mat.set_shader_parameter("glow", Fx.glow(4.0))
	add_child(pool)


## One spark at p flying with (vx, vy, vz). `color` is linear.
func emit(p: Vector3, vx: float, vy: float, vz: float, color: Color, life: float, width: float, drag := 1.4, grav := 9.0) -> void:
	_seed += 1.0
	pool.put(Vector3(vx, vy, vz), Vector3(clock, life, width), Vector3(drag, grav, fmod(_seed * 0.618034, 97.0)), p, color)
	pool.expires = maxf(pool.expires, clock + life)


## A spray of sparks thrown along `dir` in a cone (spread 0 = a jet, 1 = a wide fan). Most are
## slow and a few are fast, the way grinding sparks come off.
func spray(p: Vector3, dir: Vector3, count: int, color: Color, speed := 6.0, spread := 1.0, life := 1.0) -> void:
	for i in count:
		var v := (Vector3(randf() * 2.0 - 1.0, randf() * 2.0 - 1.0, randf() * 2.0 - 1.0) * spread + dir).normalized()
		var s := speed * (0.35 + 1.0 * pow(randf(), 1.8))
		emit(p, v.x * s, v.y * s + speed * 0.12, v.z * s, color, (0.25 + randf() * 0.45) * life, 0.007 + randf() * 0.009)


func update(dt: float) -> void:
	clock += dt
	pool.flush(clock)


func clear() -> void:
	pool.clear()
