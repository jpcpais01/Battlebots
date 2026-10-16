## Broadcast camera drones, ported from src/render/drones.ts (class Drones). Three ducted-fan
## camera drones film the fight: one is always "live" (it sits at the lens, hidden, so the shot
## you see is its feed), the others hold station on the far side of the ring, high up and off to
## the sides of the frame, lenses on the fighters. On every hard cut the drone nearest the new
## angle takes over and the one that just filmed is left hanging where the camera was, from where
## it climbs away to its standby slot.
##
## The geometry is the web's own, baked by godot/tools/bake/web/drones.ts into assets/drones/.
## Render only. Four MultiMesh draws for all of them (hulls, fan blur discs, glow, REC lights).
class_name Drones
extends Node3D

const BAKE := "res://assets/drones/drones"
const N := 3
## Built at about 0.55 m across, shown a bit bigger so they read from across the arena.
const SCALE := 1.35
## Standby ring: out past the ropes, under the stands' front row.
const SLOT_R := 7.2
const SLOT_Y := [3.7, 4.4, 4.0]
## Ducted fan centres in the body frame (+Z is where the eye looks).
const MOTORS := [Vector3(0.19, 0.012, 0.11), Vector3(-0.19, 0.012, 0.11), Vector3(0.19, 0.012, -0.13), Vector3(-0.19, 0.012, -0.13)]
## Red recording lights (body frame + radius): a big REC dome on the nose, and the eye's tally.
const RECS := [Vector4(0, 0.05, 0.085, 0.012), Vector4(0, -0.004, 0.17, 0.0075)]
const ZERO := Transform3D(Basis(Vector3.ZERO, Vector3.ZERO, Vector3.ZERO), Vector3.ZERO)

# MeshStandardMaterial({ vertexColors, roughness: 0.28, metalness: 0.55 })
const BODY_SHADER := """
shader_type spatial;
render_mode cull_back;
#include "res://render/venue/common.gdshaderinc"
varying vec3 v_col;
void vertex() {
	v_col = CUSTOM0.rgb;
}
void fragment() {
	ALBEDO = v_col;
	METALLIC = 0.55;
	ROUGHNESS = 0.28;
	FOG = bb_fog(VERTEX);
}
"""
# MeshBasicMaterial({ vertexColors, color: glow(2.2), toneMapped: false }) x the per-drone glow
const LIGHTS_SHADER := """
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"
varying vec3 v_col;
void vertex() {
	v_col = CUSTOM0.rgb * 2.2 * INSTANCE_CUSTOM.r;
}
void fragment() {
	ALBEDO = v_col;
	FOG = bb_fog(VERTEX);
}
"""
# MeshBasicMaterial({ color: (1, 0.06, 0.04) x glow(3), toneMapped: false }) x the blink
const REC_SHADER := """
shader_type spatial;
render_mode unshaded, cull_back;
#include "res://render/venue/common.gdshaderinc"
varying float v_k;
void vertex() {
	v_k = INSTANCE_CUSTOM.r;
}
void fragment() {
	ALBEDO = vec3(3.0, 0.18, 0.12) * v_k;
	FOG = bb_fog(VERTEX);
}
"""
# MeshBasicMaterial({ map: rotorTexture(), color: 0x8fdcf0, transparent, opacity: 0.55, depthWrite: false, DoubleSide })
const ROTOR_SHADER := """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, blend_mix;
#include "res://render/venue/common.gdshaderinc"
uniform sampler2D map : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 color = vec3(0.2747, 0.7157, 0.8714);
void fragment() {
	vec4 t = texture(map, UV);
	ALBEDO = color * t.rgb;
	ALPHA = 0.55 * t.a;
	FOG = bb_fog(VERTEX);
}
"""


class Drone extends RefCounted:
	var pos := Vector3.ZERO
	var vel := Vector3.ZERO
	var yaw := 0.0
	var pitch := 0.0
	var roll := 0.0
	var phase := 0.0
	## Seconds since it last went live (its standby slot fans out from the camera's azimuth).
	var spin := 0.0


var _bodies: MultiMesh
var _rotors: MultiMesh
var _lights: MultiMesh
var _recs: MultiMesh
var _drones: Array[Drone] = []
var _live := -1
## The feed is a bot's eyes: the live drone is just hovering, and drawn.
var _pov := false
var _last_cuts := -1
var _last_mode := ""
var _t := 0.0
var _last_cam := Vector3.ZERO


func _init() -> void:
	name = "drones"
	var meshes := _load_meshes()
	_bodies = _multi(meshes.get("body"), _material(BODY_SHADER), N, false)
	_rotors = _multi(meshes.get("rotor"), meshes.get("rotor_mat"), N * MOTORS.size(), false)
	_lights = _multi(meshes.get("lights"), _material(LIGHTS_SHADER), N, true)
	_recs = _multi(meshes.get("rec"), _material(REC_SHADER), N * RECS.size(), true)
	for i in N:
		var d := Drone.new()
		d.phase = i * 2.1
		d.spin = i * 7.0
		_drones.append(d)


static func _material(code: String) -> ShaderMaterial:
	var s := Shader.new()
	s.code = code
	var m := ShaderMaterial.new()
	m.shader = s
	return m


## The four baked meshes (vertex colours in a float slot: the hull's gunmetal is too dark for 8 bits).
func _load_meshes() -> Dictionary:
	var out := {}
	if not FileAccess.file_exists(BAKE + ".json"):
		push_warning("drones: no bake at " + BAKE)
		return out
	var bs := BakedScene.open(BAKE)
	var rotor := _material(ROTOR_SHADER)
	bs.factory = func(rec: Dictionary, _node: Dictionary, scene: BakedScene) -> Array:
		if rec.has("map"):
			rotor.set_shader_parameter("map", scene.texture(int(rec.map.tex)))
			return [rotor, {}]
		return [rotor, {"color": "CUSTOM0"}]
	var tmp := Node3D.new()
	bs.build(tmp)
	for k in ["body", "rotor", "lights", "rec"]:
		var mi := bs.named.get(k) as MeshInstance3D
		if mi != null:
			out[k] = mi.mesh
	out["rotor_mat"] = rotor
	tmp.free()
	return out


func _multi(mesh: Mesh, mat: Material, count: int, custom: bool) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = custom
	if mesh != null:
		# the materials are ours: the baked mesh keeps its geometry only
		var m := mesh.duplicate() as ArrayMesh
		for s in m.get_surface_count():
			m.surface_set_material(s, null)
		mm.mesh = m
	mm.instance_count = count
	for i in count:
		mm.set_instance_transform(i, ZERO)
		if custom:
			mm.set_instance_custom_data(i, Color(0, 0, 0, 0))
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# instances fly far from the base geometry's bounds
	mi.extra_cull_margin = 16384.0
	add_child(mi)
	return mm


## Move the crew. `cuts` and `mode` come from the Director: a change in either is a hard cut,
## and the drone nearest the new lens takes over the feed. `focus` is what they film. While
## `pov` holds the feed comes from a bot's eyes, not a drone: the drone that was live stays
## where it was, hovering in view, and the next cut hands over as usual.
func update(dt: float, camera: Camera3D, cuts: int, mode: String, focus: Vector3, pov := false) -> void:
	if not visible:
		return
	dt = minf(dt, 0.05)
	_t += dt
	var cam := camera.global_position
	var fresh := _live < 0
	_pov = pov and not fresh
	if _pov:
		_last_cuts = cuts
		_last_mode = mode
	elif fresh or cuts != _last_cuts or mode != _last_mode:
		# hand the feed to the drone closest to the new angle; the old one stays where it was
		var best := 0
		var best_d := INF
		for i in N:
			if i == _live:
				continue
			var d := _drones[i].pos.distance_squared_to(cam)
			if d < best_d:
				best_d = d
				best = i
		var was := _live
		if was >= 0:
			_drones[was].vel = Vector3.ZERO
		_live = best
		_drones[best].pos = cam
		_drones[best].vel = Vector3.ZERO
		_last_cam = cam
		_last_cuts = cuts
		_last_mode = mode
		if fresh:
			for i in N:
				if i != best:
					_drones[i].pos = _slot(i, camera, focus)

	# the live drone is the lens (off duty in a bot's-eye shot: it holds its spot)
	var ld := _drones[_live]
	if _pov:
		ld.vel *= exp(-4.0 * dt)
		ld.pos += ld.vel * dt
	else:
		if dt > 0.0:
			ld.vel = (cam - _last_cam) / dt
		ld.pos = cam
	_last_cam = cam

	for i in N:
		if i == _live:
			continue
		var d := _drones[i]
		d.spin += dt
		var s := _slot(i, camera, focus)
		# climb first, then drift across: a released drone rises out of the shot before it travels
		var a := Vector3((s.x - d.pos.x) * 1.6 - d.vel.x * 2.5, (s.y - d.pos.y) * 5.0 - d.vel.y * 4.5, (s.z - d.pos.z) * 1.6 - d.vel.z * 2.5)
		d.vel += a * dt
		var sp := d.vel.length()
		if sp > 6.0:
			d.vel *= 6.0 / sp
		d.pos += d.vel * dt
	_pose(focus, dt)


## Standby spot for drone i: past the fight from the camera, off to one side, near the frame's edge.
func _slot(i: int, camera: Camera3D, focus: Vector3) -> Vector3:
	var cam := camera.global_position
	var dx := cam.x - focus.x
	var dz := cam.z - focus.z
	var cam_dist := maxf(0.5, sqrt(dx * dx + dz * dz))
	var cam_az := atan2(dx, dz)
	# aim for a spot a set fraction of the half-width off centre, whatever the screen shape
	var vp := camera.get_viewport().get_visible_rect().size
	var aspect := vp.x / maxf(1.0, vp.y)
	var half := atan(tan(deg_to_rad(camera.fov) / 2.0) * aspect)
	var d := _drones[i]
	var frac := 0.62 + sin(d.spin * 0.13 + d.phase) * 0.2
	var k := tan(minf(1.2, half * frac))
	var phi := atan(k) + asin(minf(1.0, (k * cam_dist) / (SLOT_R * sqrt(1.0 + k * k))))
	# idle drones take alternate sides; with all three idle (no live one yet), the third goes high centre
	var order := (i - _live + N) % N
	var side := 1.0 if order == 1 else -1.0 if order == 2 else 0.0
	var a := cam_az + PI + side * phi
	return Vector3(focus.x + sin(a) * SLOT_R, SLOT_Y[i] + sin(d.spin * 0.21 + d.phase) * 0.35, focus.z + cos(a) * SLOT_R)


## Write every instance: bodies lean into their motion, props spin, lights blink.
func _pose(focus: Vector3, dt: float) -> void:
	var t := _t
	var nm := MOTORS.size()
	var nr := RECS.size()
	for i in N:
		var d := _drones[i]
		if i == _live and not _pov:
			# inside the lens: not drawn
			_bodies.set_instance_transform(i, ZERO)
			for j in nm:
				_rotors.set_instance_transform(i * nm + j, ZERO)
			_lights.set_instance_transform(i, ZERO)
			for j in nr:
				_recs.set_instance_transform(i * nr + j, ZERO)
			continue
		var want := atan2(focus.x - d.pos.x, focus.z - d.pos.z)
		d.yaw += atan2(sin(want - d.yaw), cos(want - d.yaw)) * minf(1.0, dt * 2.5)
		var fx := sin(d.yaw)
		var fz := cos(d.yaw)
		var fwd := d.vel.x * fx + d.vel.z * fz
		var right := d.vel.x * fz - d.vel.z * fx
		var sway := sin(t * 1.3 + d.phase)
		var kp := clampf(fwd * 0.09, -0.35, 0.35) + sin(t * 0.9 + d.phase * 1.7) * 0.025
		var kr := clampf(-right * 0.09, -0.35, 0.35) + sway * 0.03
		var lerp_k := minf(1.0, dt * 6.0)
		d.pitch += (kp - d.pitch) * lerp_k
		d.roll += (kr - d.roll) * lerp_k
		var at := Vector3(d.pos.x + sway * 0.03, d.pos.y + sin(t * 1.9 + d.phase) * 0.05, d.pos.z)
		# three's Euler(pitch, yaw, roll, 'YXZ')
		var body := Transform3D(Basis.from_euler(Vector3(d.pitch, d.yaw, d.roll), EULER_ORDER_YXZ) * Basis.from_scale(Vector3.ONE * SCALE), at)
		_bodies.set_instance_transform(i, body)
		for j in nm:
			var mp: Vector3 = MOTORS[j]
			# neighbours counter-rotate
			var spin := (1.0 if j == 0 or j == 3 else -1.0) * (t * 47.0 + j)
			_rotors.set_instance_transform(i * nm + j, body * Transform3D(Basis(Vector3.UP, spin), Vector3(mp.x, mp.y + 0.004, mp.z)))
		# the lights breathe, with a quick shimmer as the drone works hard
		var effort := minf(1.0, d.vel.length() * 0.25)
		var glow := 0.78 + 0.16 * sin(t * 2.2 + d.phase) + effort * (0.25 + 0.1 * sin(t * 31.0 + d.phase))
		_lights.set_instance_transform(i, body)
		_lights.set_instance_custom_data(i, Color(glow, 0, 0, 0))
		# REC: on most of each second, a short blink off, like a camera that's rolling
		var rec := 1.0 if fmod(t + d.phase * 0.31, 1.0) < 0.72 else 0.05
		for j in nr:
			var r: Vector4 = RECS[j]
			_recs.set_instance_transform(i * nr + j, body * Transform3D(Basis.from_scale(Vector3(r.w, r.w, r.w)), Vector3(r.x, r.y, r.z)))
			_recs.set_instance_custom_data(i * nr + j, Color(rec, 0, 0, 0))
