## A robot drawn from its loadout and paint: the baked armour (BotParts) as two rigidly skinned
## meshes, posed every frame from the sim's joints. Port of src/render/botModel.ts.
class_name BotModel
extends Node3D

# bones (botModel.ts B), plus the core's two halves riding the torso (see bake_parts.ts)
enum { TORSO, PELVIS, HEAD, SPINE, NECK, UP_L, UP_R, FORE_L, FORE_R, FIST_L, FIST_R, THIGH_L, THIGH_R, SHIN_L, SHIN_R, FOOT_L, FOOT_R, TOE_L, TOE_R, ARM_BAR_L, ARM_BAR_R, ARM_ROD_L, ARM_ROD_R, LEG_BAR_L, LEG_BAR_R, LEG_ROD_L, LEG_ROD_R, ROCKET_L, ROCKET_R, CORE_F, CORE_B, BONE_COUNT }
# body parts (sim/damage.ts P)
enum { P_HEAD, P_CHEST, P_TORSO, P_UP_L, P_FORE_L, P_FIST_L, P_UP_R, P_FORE_R, P_FIST_R, P_THIGH_L, P_SHIN_L, P_FOOT_L, P_THIGH_R, P_SHIN_R, P_FOOT_R }
# joints (sim/body.ts J)
enum { J_PELVIS, J_CHEST, J_NECK, J_HEAD, J_SH_L, J_EL_L, J_HAND_L, J_SH_R, J_EL_R, J_HAND_R, J_HIP_L, J_KNEE_L, J_FOOT_L, J_HIP_R, J_KNEE_R, J_FOOT_R }
const SLOTS := ["head", "fist", "core", "chest", "legs", "kick"]

## Bones that leave the body when a part is torn off (the part and everything below it).
const TORN_BONES := {
	P_HEAD: [HEAD, NECK],
	P_UP_L: [UP_L, FORE_L, FIST_L, ARM_BAR_L, ARM_ROD_L, ROCKET_L],
	P_FORE_L: [FORE_L, FIST_L, ARM_BAR_L, ARM_ROD_L, ROCKET_L],
	P_UP_R: [UP_R, FORE_R, FIST_R, ARM_BAR_R, ARM_ROD_R, ROCKET_R],
	P_FORE_R: [FORE_R, FIST_R, ARM_BAR_R, ARM_ROD_R, ROCKET_R],
	P_THIGH_L: [THIGH_L, SHIN_L, FOOT_L, TOE_L, LEG_BAR_L, LEG_ROD_L],
	P_SHIN_L: [SHIN_L, FOOT_L, TOE_L, LEG_BAR_L, LEG_ROD_L],
	P_THIGH_R: [THIGH_R, SHIN_R, FOOT_R, TOE_R, LEG_BAR_R, LEG_ROD_R],
	P_SHIN_R: [SHIN_R, FOOT_R, TOE_R, LEG_BAR_R, LEG_ROD_R],
}

# piston anchors, in their parent bone's frame
const ARM_A := Vector3(0, 0.1, -0.075)
const ARM_B := Vector3(0, -0.06, 0)
const LEG_A := Vector3(0, 0.14, -0.075)
const LEG_B := Vector3(0, 0.12, -0.08)
const TOE_OFFSET := Vector3(0, -0.048, 0.072)
## How strongly a bone keeps last frame's roll against a weak hint (orient_held).
const HOLD := 0.15
## Radius on screen, in pixels, below which a piece is dropped (botModel.ts DETAIL_PX).
const DETAIL_PX := 0.7
## Detail levels handed to Godot's mesh LOD: drop pieces smaller than these radii (metres).
const LOD_RADII := [0.004, 0.008, 0.016, 0.03]
const HOT := Color(1, 0.13, 0.05)

const OPAQUE_SHADER := preload("res://render/bot_opaque.gdshader")
const GLOW_SHADER := preload("res://render/bot_glow.gdshader")

var spec
var size := 1.0
## World-space interpolated joints (valid after pose()).
var joints: Array[Vector3] = []
var glow_boost := 1.0

var _pos: Array[Vector3] = []
var _rot: Array[Basis] = []
var _scl: Array[Vector3] = []
var _hidden := {}
var _rocket := [false, false]
var _held_up: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _held_fore: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _core_shift := [Vector3.ZERO, Vector3.ZERO]
var _torso_x := Vector3.RIGHT
var _torso_z := Vector3.BACK
var _torso_up := Vector3.UP
var _opaque_mat: ShaderMaterial
var _glow_mat: ShaderMaterial
var _opaque: MeshInstance3D
var _glow: MeshInstance3D
var _shield: MeshInstance3D
var _shield_alpha := 0.0
var _bones := PackedVector4Array()
var _cols := PackedColorArray()
var _base_glow: Color
var _base_core: Color
var _rarity: Array = []


func _init(bot_spec) -> void:
	spec = bot_spec
	size = float(JS.get_field(spec, "size")) if JS.get_field(spec, "size") != null else 1.0
	for i in 16:
		joints.append(Vector3.ZERO)
	for i in BONE_COUNT:
		_pos.append(Vector3.ZERO)
		_rot.append(Basis.IDENTITY)
		_scl.append(Vector3.ONE * size)
	_bones.resize(BONE_COUNT * 3)
	_build()


static func _item(lo, slot: String):
	return TItems.ITEM_BY_ID.get(lo[slot].id)


static func look_of(lo, slot: String) -> int:
	return int(_item(lo, slot).look)


## Linear colour of a 0xRRGGBB number (three's Color(hex) does the same sRGB decode).
static func lin(hex) -> Color:
	return Color.hex((int(hex) << 8) | 0xff).srgb_to_linear()


func _build() -> void:
	var lo = spec.loadout
	var head := look_of(lo, "head")
	var fist := look_of(lo, "fist")
	var core := look_of(lo, "core")
	var chest := look_of(lo, "chest")
	var legs := look_of(lo, "legs")
	var kick := look_of(lo, "kick")
	BotParts.has("neck")
	var shift: Array = BotParts.info.coreShift[chest]
	_core_shift = [Vector3(shift[0], shift[1], shift[2]), Vector3(shift[3], shift[4], shift[5])]
	# [part key, bone, slot, body part]
	var list := [
		["torso/%d" % chest, TORSO, "chest", P_CHEST],
		["coreF/%d" % core, CORE_F, "core", P_CHEST],
		["coreB/%d" % core, CORE_B, "core", P_CHEST],
		["head/%d" % head, HEAD, "head", P_HEAD],
		["neck", NECK, "head", P_HEAD],
		["spine", SPINE, "chest", P_TORSO],
		["pelvis/%d" % legs, PELVIS, "legs", P_TORSO],
	]
	var heavy: bool = JS.truthy(_item(lo, "legs").get("rams"))
	var leg_r := "0.0324" if heavy else "0.024"
	var rocket: bool = _item(lo, "fist").get("ability") == "rocketPunch"
	for side in 2:
		var L := side == 0
		var arm := P_UP_L if L else P_UP_R
		var leg := P_THIGH_L if L else P_THIGH_R
		list.append(["upperArm/%d/%d" % [chest, -1 if L else 1], UP_L if L else UP_R, "chest", arm])
		list.append(["forearm/%d" % fist, FORE_L if L else FORE_R, "fist", arm + 1])
		list.append(["fist/%d/%d" % [fist, 1 if L else -1], FIST_L if L else FIST_R, "fist", arm + 2])
		list.append(["thigh/%d" % legs, THIGH_L if L else THIGH_R, "legs", leg])
		list.append(["shin/%d" % legs, SHIN_L if L else SHIN_R, "legs", leg + 1])
		list.append(["shinGuard/%d" % kick, SHIN_L if L else SHIN_R, "kick", leg + 1])
		list.append(["foot/%d" % kick, FOOT_L if L else FOOT_R, "kick", leg + 2])
		list.append(["toe/%d" % kick, TOE_L if L else TOE_R, "kick", leg + 2])
		list.append(["barrel/0.13/0.018", ARM_BAR_L if L else ARM_BAR_R, "chest", arm])
		list.append(["rod/0.17/0.018", ARM_ROD_L if L else ARM_ROD_R, "chest", arm + 1])
		list.append(["barrel/0.2/" + leg_r, LEG_BAR_L if L else LEG_BAR_R, "legs", leg])
		list.append(["rod/0.25/" + leg_r, LEG_ROD_L if L else LEG_ROD_R, "legs", leg + 1])
		if rocket:
			list.append(["rocket", ROCKET_L if L else ROCKET_R, "fist", arm + 1])
			_rocket[side] = true

	var parts: Array[BotParts.Part] = []
	var codes := PackedFloat32Array()
	for e in list:
		parts.append(BotParts.get_part(e[0]))
		codes.append(e[1] + 32 * e[3] + 512 * SLOTS.find(e[2]))

	_opaque_mat = ShaderMaterial.new()
	_opaque_mat.shader = OPAQUE_SHADER
	_glow_mat = ShaderMaterial.new()
	_glow_mat.shader = GLOW_SHADER
	_paint_surfaces()
	_glow_colours(core)

	_opaque = MeshInstance3D.new()
	_opaque.mesh = _family_mesh(parts, codes, true)
	_opaque.material_override = _opaque_mat
	_glow = MeshInstance3D.new()
	_glow.mesh = _family_mesh(parts, codes, false)
	_glow.material_override = _glow_mat
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for m in [_opaque, _glow]:
		# the bones move the corners on the GPU: the box has to hold any pose
		m.custom_aabb = AABB(Vector3(-2, -2.2, -2) * size, Vector3(4, 4.4, 4) * size)
		add_child(m)

	# Aegis bubble
	_shield = MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radial_segments = 24
	sphere.rings = 16
	sphere.radius = 1.0
	sphere.height = 2.0
	_shield.mesh = sphere
	var sm := ShaderMaterial.new()
	sm.shader = preload("res://render/shield.gdshader")
	_shield.material_override = sm
	_shield.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_shield.scale = Vector3(0.75, 1.15, 0.75) * size
	_shield.visible = false
	add_child(_shield)


## One material family of the whole robot: every part's corners, the pieces ordered biggest first
## across the robot (as skin.ts does), so each detail level is just a shorter index list.
func _family_mesh(parts: Array[BotParts.Part], codes: PackedFloat32Array, opaque: bool) -> ArrayMesh:
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var tag := PackedFloat32Array()
	var code := PackedFloat32Array()
	var runs := []
	var bases := PackedInt32Array()
	for i in parts.size():
		var f: BotParts.Family = parts[i].opaque if opaque else parts[i].glow
		bases.append(pos.size())
		pos.append_array(f.pos)
		if opaque:
			nor.append_array(f.nor)
		tag.append_array(f.tag)
		var c := PackedFloat32Array()
		c.resize(f.pos.size())
		c.fill(codes[i])
		code.append_array(c)
		var start := 0
		for g in f.radii.size():
			var r := f.radii[g]
			runs.append([INF if r < 0 else r, runs.size(), i, start, f.ends[g]])
			start = f.ends[g]
	# biggest first; equal sizes keep their build order
	runs.sort_custom(func(a, b): return a[0] > b[0] or (a[0] == b[0] and a[1] < b[1]))
	var index := PackedInt32Array()
	var cut := PackedInt32Array()
	var lod_at := 0
	for run in runs:
		var r: float = run[0]
		while lod_at < LOD_RADII.size() and r < LOD_RADII[lod_at]:
			cut.append(index.size())
			lod_at += 1
		var f: BotParts.Family = parts[run[2]].opaque if opaque else parts[run[2]].glow
		var s := f.index.slice(run[3], run[4])
		var base := bases[run[2]]
		for k in s.size():
			s[k] += base
		index.append_array(s)
	while lod_at < LOD_RADII.size():
		cut.append(index.size())
		lod_at += 1
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	if opaque:
		arrays[Mesh.ARRAY_NORMAL] = nor
	arrays[Mesh.ARRAY_CUSTOM0] = tag
	arrays[Mesh.ARRAY_CUSTOM1] = code
	arrays[Mesh.ARRAY_INDEX] = index
	# Godot picks a level when its "edge length" covers about a pixel; a dropped piece is fine
	# while its radius stays under DETAIL_PX
	var lods := {}
	for l in LOD_RADII.size():
		var n := cut[l] - cut[l] % 3
		if n > 0 and n < index.size():
			lods[LOD_RADII[l] * size / DETAIL_PX] = index.slice(0, n)
	var mesh := ArrayMesh.new()
	if pos.is_empty():
		return mesh
	var flags := (Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], lods, flags)
	return mesh


## The plating, frame metal and trim of a robot wearing its paint (botModel.ts botSurfaces).
func _paint_surfaces() -> void:
	var p = spec.paint
	var f = TPaint.FINISHES[int(p.finish)] if int(p.finish) < TPaint.FINISHES.size() else TPaint.FINISHES[0]
	var fr = TPaint.FRAMES[int(p.frame)] if int(p.frame) < TPaint.FRAMES.size() else TPaint.FRAMES[0]
	var s := {
		"paint": [p.primary, f.metal, f.rough],
		"paint2": [p.secondary, f.metal2, f.rough2],
		"metal": [fr.metal, fr.m, fr.r],
		"chrome": [0xd9dee6, 1.0, 0.14],
		"dark": [fr.dark, 0.45, 0.58],
		"joint": [fr.joint, minf(fr.m, 0.8), fr.r + 0.04],
		"brass": [0xc99a3e, 1.0, 0.24],
		"glass": [0x0a0e14, 0.6, 0.06],
		"rubber": [0x141516, 0.0, 0.88],
		"steel": [0x737a83, 0.88, 0.4],
		"carbon": [0x1e2128, 0.35, 0.34],
		"alu": [0xc5cbd3, 0.9, 0.26],
	}
	var surf := PackedVector4Array()
	var rough := PackedFloat32Array()
	for k in BotParts.OPAQUE_KEYS:
		var e: Array = s[k]
		var c := lin(e[0])
		surf.append(Vector4(c.r, c.g, c.b, e[1]))
		rough.append(e[2])
	_opaque_mat.set_shader_parameter("surf", surf)
	_opaque_mat.set_shader_parameter("rough", rough)


func _glow_colours(core_look: int) -> void:
	_base_glow = lin(spec.paint.accent) * 3.4
	_base_core = lin(BotParts.info.coreColors[core_look]) * 3.2
	_rarity.clear()
	for slot in SLOTS:
		var r := int(spec.loadout[slot].rarity)
		_rarity.append(lin(TItems.RARITIES[r].glow) * 3.0)
	_cols.resize(8)


## Pose from a fighter's physical body with interpolation alpha. `look_at`: where the head turns.
func pose(f, alpha: float, time: float, look_at = null) -> void:
	var body = f.body
	for i in 16:
		var a = body.last[i]
		var b = body.pos[i]
		joints[i] = Vector3(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha)
	for i in BONE_COUNT:
		_scl[i] = Vector3.ONE * size
	_pose_core(f, look_at)
	_pose_limbs(f)
	for b in _hidden:
		_scl[b] = Vector3.ZERO
	_effects(f, time)
	_upload()


## Collapse a torn-off part's bones (and everything below) for the rest of the fight.
func tear_off(part: int) -> void:
	for b in TORN_BONES.get(part, []):
		_hidden[b] = true


func _upload() -> void:
	# the meshes sit at the chest, so Godot's culling and detail levels see where the robot is
	var origin := joints[J_CHEST]
	position = origin
	for b in BONE_COUNT:
		var m := _rot[b] * Basis.from_scale(_scl[b])
		var p := _pos[b] - origin
		_bones[b * 3] = Vector4(m.x.x, m.y.x, m.z.x, p.x)
		_bones[b * 3 + 1] = Vector4(m.x.y, m.y.y, m.z.y, p.y)
		_bones[b * 3 + 2] = Vector4(m.x.z, m.y.z, m.z.z, p.z)
	_opaque_mat.set_shader_parameter("bones", _bones)
	_glow_mat.set_shader_parameter("bones", _bones)


# ------------------------------------------------------------------ posing (botModel.ts)

## Y along a→b, Z towards z_hint.
func _orient_segment(bone: int, a: Vector3, b: Vector3, z_hint: Vector3, fallback: Vector3) -> float:
	var y := b - a
	var l := y.length()
	_pos[bone] = a
	if l < 1e-5:
		return l
	y /= l
	var z := z_hint - y * z_hint.dot(y)
	if z.length_squared() < 1e-4:
		z = fallback - y * fallback.dot(y)
	z = z.normalized()
	_rot[bone] = Basis(y.cross(z), y, z)
	return l


## Frame with X along xb→xa (the bot's left), Y roughly up.
func _orient_frame(bone: int, p: Vector3, xa: Vector3, xb: Vector3, ua: Vector3, ub: Vector3) -> void:
	var x := (xa - xb).normalized()
	var y := ub - ua
	y = (y - x * y.dot(x)).normalized()
	_rot[bone] = Basis(x, y, x.cross(y))
	_pos[bone] = p


## _orient_segment for a bone whose roll hint can line up with the bone itself: where the hint
## runs short the bone keeps last frame's roll (botModel.ts orientHeld).
func _orient_held(bone: int, a: Vector3, b: Vector3, hint: Vector3, held: Array[Vector3], side: int, fallback: Vector3) -> float:
	var y := b - a
	var l := y.length()
	_pos[bone] = a
	if l < 1e-5:
		return l
	y /= l
	var z := hint - y * hint.dot(y)
	var h := held[side] - y * held[side].dot(y)
	var hl := h.length()
	if hl > 1e-3:
		z += h * (HOLD / hl)
	if z.length_squared() < 1e-8:
		z = fallback - y * fallback.dot(y)
	z = z.normalized()
	held[side] = z
	_rot[bone] = Basis(y.cross(z), y, z)
	return l


func _pose_core(f, look_at) -> void:
	var P := joints
	var yaw: float = f.faceYaw
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	_orient_frame(TORSO, P[J_CHEST], P[J_SH_L], P[J_SH_R], P[J_PELVIS], P[J_NECK])
	_orient_frame(PELVIS, P[J_PELVIS], P[J_HIP_L], P[J_HIP_R], P[J_PELVIS], P[J_CHEST])
	var tb := _rot[TORSO]
	_torso_x = tb.x
	_torso_z = tb.z
	_torso_up = tb.y
	# head: look toward the opponent
	var look := _torso_z
	if look_at != null:
		var d: Vector3 = look_at - P[J_HEAD]
		if d.length_squared() > 1e-4:
			look = look.lerp(d.normalized(), 0.6)
	_orient_segment(HEAD, P[J_NECK], P[J_HEAD], look, _torso_z)
	_pos[HEAD] = P[J_HEAD]
	var sl := _orient_segment(SPINE, P[J_PELVIS], P[J_CHEST], _torso_z, fwd)
	_scl[SPINE] = Vector3(size, sl, size)
	var nl := _orient_segment(NECK, P[J_NECK], P[J_HEAD], _torso_z, fwd)
	_scl[NECK] = Vector3(size, nl * 0.75, size)
	# the core's halves sit where the chest puts them
	for k in 2:
		var b := CORE_F if k == 0 else CORE_B
		_rot[b] = tb
		_pos[b] = _pos[TORSO] + tb * (_core_shift[k] * size)


func _pose_limbs(f) -> void:
	var P := joints
	for side in 2:
		var L := side == 0
		var sh := P[J_SH_L if L else J_SH_R]
		var el := P[J_EL_L if L else J_EL_R]
		var hd := P[J_HAND_L if L else J_HAND_R]
		var up := UP_L if L else UP_R
		var fore := FORE_L if L else FORE_R
		var fist := FIST_L if L else FIST_R
		# upper arm: front faces the bend
		_orient_held(up, sh, el, (hd - el).normalized(), _held_up, side, _torso_z)
		# forearm: the back of the hand turns from "outward" by the roll (see botModel.ts)
		var t := hd - el
		var len := t.length()
		t *= 1.0 / maxf(1e-5, len)
		var outward := _torso_x * (1.0 if L else -1.0)
		var ahead := _torso_z.dot(t)
		if ahead > -0.999:
			# Rodrigues, with k = ahead x forearm: v c + k x v + k (k . v) / (1 + c)
			var k := _torso_z.cross(t)
			var kv := k.dot(outward)
			outward = outward * ahead + k.cross(outward) + k * (kv / (1.0 + ahead))
		outward = (outward - t * outward.dot(t)) * minf(1.0, (1.0 + ahead) * 2.0)
		var a2 := t.cross(outward)
		var phi: float = f.handRoll[side] * (PI / 2) * (1.0 if L else -1.0)
		_orient_held(fore, el, hd, outward * cos(phi) + a2 * sin(phi), _held_fore, side, _torso_up)
		_pos[fist] = hd
		_rot[fist] = _rot[fore]
		if _rocket[side]:
			var rp := ROCKET_L if L else ROCKET_R
			_rot[rp] = _rot[fore]
			_pos[rp] = el + t * (0.2 * size)
			_scl[rp] = Vector3(size, maxf(0.001, len - 0.2 * size), size)
		# triceps piston
		var pa := _pos[up] + _rot[up] * (ARM_A * size)
		var pb := _pos[fore] + _rot[fore] * (ARM_B * size)
		var rz := _rot[up].z
		_orient_segment(ARM_BAR_L if L else ARM_BAR_R, pa, pb, rz, _torso_z)
		_orient_segment(ARM_ROD_L if L else ARM_ROD_R, pb, pa, rz, _torso_z)

		# legs: the front of thigh and shin faces where the knee points
		var hip := P[J_HIP_L if L else J_HIP_R]
		var knee := P[J_KNEE_L if L else J_KNEE_R]
		var foot := P[J_FOOT_L if L else J_FOOT_R]
		var bend := (knee - (hip + foot) * 0.5) * 5.0 + _torso_z
		var thigh := THIGH_L if L else THIGH_R
		var shin := SHIN_L if L else SHIN_R
		_orient_segment(thigh, hip, knee, bend, _torso_z)
		_orient_segment(shin, knee, foot, bend, _torso_z)
		pa = _pos[thigh] + _rot[thigh] * (LEG_A * size)
		pb = _pos[shin] + _rot[shin] * (LEG_B * size)
		rz = _rot[thigh].z
		_orient_segment(LEG_BAR_L if L else LEG_BAR_R, pa, pb, rz, _torso_z)
		_orient_segment(LEG_ROD_L if L else LEG_ROD_R, pb, pa, rz, _torso_z)

		# foot: flat on the floor when planted (with heel lift), hinged off the shin in the air
		var fy: float = f.footYaw[side]
		var qa := Quaternion(Vector3.UP, fy)
		var qc := qa
		qa = qa * Quaternion(Vector3.RIGHT, f.footHeel[side])
		var air: float = f.footAir[side]
		if air > 0.001:
			var y := (knee - foot).normalized()
			var z := _rot[shin].z
			z = (z - y * z.dot(y)).normalized()
			var qb := Basis(y.cross(z), y, z).get_rotation_quaternion()
			qb = qb * Quaternion(Vector3.RIGHT, f.footFlex[side])
			qa = qa.slerp(qb, air)
			qc = Quaternion(Vector3.UP, fy).slerp(qa, air)
		var fb := FOOT_L if L else FOOT_R
		var toe := TOE_L if L else TOE_R
		_pos[fb] = foot
		_rot[fb] = Basis(qa)
		_pos[toe] = foot + qa * (TOE_OFFSET * size)
		_rot[toe] = Basis(qc)


func _effects(f, time: float) -> void:
	# Aegis shield bubble
	var target := 1.0 if f.shield and not f.isDown else 0.0
	_shield_alpha += (target - _shield_alpha) * 0.15
	_shield.visible = _shield_alpha > 0.02
	if _shield.visible:
		_shield.position = joints[J_CHEST].lerp(joints[J_PELVIS], 0.35) - joints[J_CHEST]
		_shield.rotation.y = time * 0.5
		_shield_alpha *= 0.9 + sin(time * 9) * 0.05 + 0.05
		(_shield.material_override as ShaderMaterial).set_shader_parameter("alpha", _shield_alpha)
	# overdrive: glow runs hot
	var od := 0.5 + 0.5 * sin(time * 14) if f.overdrive > 0 else 0.0
	_cols[0] = _base_glow.lerp(HOT * 6.0, od * 0.6) * glow_boost
	var pulse := 1.0 + sin(time * 3 + f.index) * 0.15 + (1.5 if f.shockTime > 0 else 0.0)
	_cols[1] = _base_core * ((0.15 if f.state == "ko" else pulse) * glow_boost)
	for i in 6:
		_cols[2 + i] = _rarity[i]
	_glow_mat.set_shader_parameter("cols", _cols)
