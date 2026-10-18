## Contact occlusion without a screen-space pass (src/render/ao.ts ContactAO): each robot is
## stood in for by spheres at its joints and limb midpoints, and every surface that includes
## contact_ao.gdshaderinc darkens near them analytically (the canvas under a robot, a downed
## robot's dark pool, limbs crowding a torso). This fills the shader globals once a frame and
## draws the floor's top-down map, so the floor reads one texture tap instead of looping.
class_name ContactAO
extends Node

## Spheres per robot: the 16 joints, then the 8 limb midpoints.
const PER := 24
## Armour radius round each physics joint, a bit inside the shell (ao.ts RADII).
const RADII := [0.28, 0.33, 0.12, 0.22, 0.18, 0.12, 0.14, 0.18, 0.12, 0.14, 0.15, 0.13, 0.11, 0.15, 0.13, 0.11]
## Limb midpoints: from joint, to joint, radius (ao.ts MIDS).
const MIDS := [[4, 5, 0.12], [5, 6, 0.12], [7, 8, 0.12], [8, 9, 0.12], [10, 11, 0.14], [11, 12, 0.12], [13, 14, 0.14], [14, 15, 0.12]]
## Each sphere's occlusion reaches zero at this many radii; the bounding sphere encloses it all.
const RANGE := 4.5
const MAP_SIZE := 384
## Robots it can hold: the two fighting, then a tag team's partners (only the floor map and the
## robots' own sphere lists see those).
const ROBOTS := 4

var _data := PackedFloat32Array()
var _image: Image
var _tex: ImageTexture
var _bounds := [Vector4(), Vector4(), Vector4(), Vector4()]
var _map: SubViewport
var _was_near := true


func _init() -> void:
	_data.resize(PER * ROBOTS * 4)
	_image = Image.create_from_data(PER, ROBOTS, false, Image.FORMAT_RGBAF, _data.to_byte_array())
	_tex = ImageTexture.create_from_image(_image)
	RenderingServer.global_shader_parameter_set("bb_ao_spheres", _tex)
	# the floor map: one quad drawn with the sphere maths into a small top-down texture
	_map = SubViewport.new()
	_map.size = Vector2i(MAP_SIZE, MAP_SIZE)
	_map.disable_3d = true
	_map.transparent_bg = false
	_map.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var quad := ColorRect.new()
	quad.size = Vector2(MAP_SIZE, MAP_SIZE)
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://render/ao/ao_map.gdshader")
	quad.material = mat
	_map.add_child(quad)
	add_child(_map)
	RenderingServer.global_shader_parameter_set("bb_ao_map", _map.get_texture())
	commit()


func _enter_tree() -> void:
	# (the overlay's GPU rows time this viewport as a stage of its own)
	Perf.watch_ao(_map.get_viewport_rid())


func _exit_tree() -> void:
	Perf.watch_ao(RID())


## The floor map's size in pixels, per quality tier (ao.ts MAP_SIZE: 256 low, 384 med, 512 high).
func set_map_size(n: int) -> void:
	if _map.size.x == n:
		return
	_map.size = Vector2i(n, n)
	(_map.get_child(0) as Control).size = Vector2(n, n)


## Place robot `i`'s spheres from its world-space joints, or take it away with an empty array.
func set_robot(i: int, joints: Array[Vector3], size := 1.0) -> void:
	if joints.is_empty():
		_bounds[i] = Vector4()
		var o0 := i * PER * 4
		for k in PER:
			_data[o0 + k * 4 + 3] = 0.0
		return
	var o := i * PER * 4
	var c := Vector3.ZERO
	for j in 16:
		var p := joints[j]
		_data[o] = p.x
		_data[o + 1] = p.y
		_data[o + 2] = p.z
		_data[o + 3] = RADII[j] * size
		o += 4
		c += p
	for mid in MIDS:
		var p := (joints[mid[0]] + joints[mid[1]]) * 0.5
		_data[o] = p.x
		_data[o + 1] = p.y
		_data[o + 2] = p.z
		_data[o + 3] = mid[2] * size
		o += 4
	c /= 16.0
	var r := 0.0
	for k in range(i * PER * 4, o, 4):
		r = maxf(r, Vector3(_data[k], _data[k + 1], _data[k + 2]).distance_to(c) + _data[k + 3] * RANGE)
	_bounds[i] = Vector4(c.x, c.y, c.z, r)


## This frame's spheres, four floats each (centre xyz, radius; 0 for none): robot 0's PER, then
## robot 1's (and a tag team's partners'), as the shaders' bb_ao_spheres rows hold them.
func spheres() -> PackedFloat32Array:
	return _data


## Upload this frame's spheres (once, after both robots are set).
func commit() -> void:
	_image.set_data(PER, ROBOTS, false, Image.FORMAT_RGBAF, _data.to_byte_array())
	_tex.update(_image)
	RenderingServer.global_shader_parameter_set("bb_ao_b0", _bounds[0])
	RenderingServer.global_shader_parameter_set("bb_ao_b1", _bounds[1])
	RenderingServer.global_shader_parameter_set("bb_ao_b2", _bounds[2])
	RenderingServer.global_shader_parameter_set("bb_ao_b3", _bounds[3])
	# nothing near the floor: the map can keep what it has
	var near := false
	for b in _bounds:
		near = near or (b.w > absf(b.y))
	_map.render_target_update_mode = SubViewport.UPDATE_ALWAYS if near or _was_near else SubViewport.UPDATE_DISABLED
	_was_near = near

