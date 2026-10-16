## A camera-facing ribbon following a limb during strikes (port of fx.ts Trail). The web rebuilds
## the ribbon on the CPU each frame; here the last 14 points go to the shader as a uniform array
## (on a push only) and fx_trail.gdshader faces and fades the strip.
class_name FxTrail
extends MeshInstance3D

const N := 14

var _pts := PackedVector4Array()
var _mat: ShaderMaterial
var _live := false


func _init(color: Color, width: float) -> void:
	var v := PackedVector3Array()
	var idx := PackedInt32Array()
	for i in N:
		v.append(Vector3(i, 1, 0))
		v.append(Vector3(i, -1, 0))
	for i in N - 1:
		var a := i * 2
		idx.append_array([a, a + 1, a + 2, a + 1, a + 3, a + 2])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	mesh = m
	_mat = ShaderMaterial.new()
	_mat.shader = Fx.TRAIL_SHADER
	_mat.set_shader_parameter("color", Vector3(color.r, color.g, color.b))
	_mat.set_shader_parameter("width", width)
	material_override = _mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	custom_aabb = AABB(Vector3(-500, -500, -500), Vector3(1000, 1000, 1000))
	top_level = true
	visible = false
	_pts.resize(N)
	_pts.fill(Vector4(0, 0, 0, -99))
	_mat.set_shader_parameter("pts", _pts)


## Lays the next point (newest first), stamped with the effects clock.
var stamp := 0.0


func push(p: Vector3) -> void:
	for i in range(N - 1, 0, -1):
		_pts[i] = _pts[i - 1]
	_pts[0] = Vector4(p.x, p.y, p.z, stamp)
	_mat.set_shader_parameter("pts", _pts)
	_live = true


func update(clock: float) -> void:
	stamp = clock
	if not _live:
		return
	# every point fades 0.12 s after it was laid; the newest is the last to go
	_live = clock - _pts[0].w < 0.12
	visible = _live
	if _live:
		_mat.set_shader_parameter("now", clock)
