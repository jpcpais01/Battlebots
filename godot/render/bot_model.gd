## A robot drawn from its loadout and paint: the baked armour (BotParts) as two rigidly skinned
## meshes, posed every frame from the sim's joints, its limbs slid out of either robot's armour
## (BotContact), and battered by the fight: dents, chipped paint, scorch, oil and glowing cracks
## (bot_damage.gdshaderinc). Port of src/render/botModel.ts.
##
## Per frame, like game.ts: begin() both robots (joints and the hulls the other one's contact
## pass reads), then end() both, each with the other as `opp`. pose() is the two in one, with no
## opponent contact.
class_name BotModel
extends Node3D

# bones (botModel.ts B), plus the core's two halves riding the torso (see bake_parts.ts)
enum { TORSO, PELVIS, HEAD, SPINE, NECK, UP_L, UP_R, FORE_L, FORE_R, FIST_L, FIST_R, THIGH_L, THIGH_R, SHIN_L, SHIN_R, FOOT_L, FOOT_R, TOE_L, TOE_R, ARM_BAR_L, ARM_BAR_R, ARM_ROD_L, ARM_ROD_R, LEG_BAR_L, LEG_BAR_R, LEG_ROD_L, LEG_ROD_R, ROCKET_L, ROCKET_R, CORE_F, CORE_B, BONE_COUNT }
# body parts (sim/damage.ts P)
enum { P_HEAD, P_CHEST, P_TORSO, P_UP_L, P_FORE_L, P_FIST_L, P_UP_R, P_FORE_R, P_FIST_R, P_THIGH_L, P_SHIN_L, P_FOOT_L, P_THIGH_R, P_SHIN_R, P_FOOT_R, PART_COUNT }
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
## Bones whose pieces are stretched to fit at run time: they never dent (botModel.ts STRETCHED).
const STRETCHED := [SPINE, NECK, ROCKET_L, ROCKET_R]
## The bone a sim joint's oil splash lands on (the armour round the joint).
const JOINT_BONE := [PELVIS, TORSO, TORSO, HEAD, UP_L, FORE_L, FIST_L, UP_R, FORE_R, FIST_R, THIGH_L, SHIN_L, FOOT_L, THIGH_R, SHIN_R, FOOT_R]
## Where a torn-off part leaves its socket: the bone that keeps it, and the joint it sits at.
const SOCKET_AT := {
	P_HEAD: [TORSO, J_NECK],
	P_UP_L: [TORSO, J_SH_L],
	P_FORE_L: [UP_L, J_EL_L],
	P_UP_R: [TORSO, J_SH_R],
	P_FORE_R: [UP_R, J_EL_R],
	P_THIGH_L: [PELVIS, J_HIP_L],
	P_SHIN_L: [THIGH_L, J_KNEE_L],
	P_THIGH_R: [PELVIS, J_HIP_R],
	P_SHIN_R: [THIGH_R, J_KNEE_R],
}
## Dents per robot (blows landing close together deepen the same dent instead of taking a slot).
const DENTS := 32
## Marks per robot: a few wrenched sockets, the rest oil splatters.
const MARKS := 12
const SOCKET_SLOTS := 4
const MARK_NONE := 0
const MARK_SOCKET := 1
const MARK_OIL := 2
## Dent springs: stiff and a little under-damped, so a dent punches in past its depth and springs back.
const DENT_K := 1400.0
const DENT_C := 34.0

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
## World-space interpolated joints (valid after begin()); limbs are slid out of armour by end().
var joints: Array[Vector3] = []
var glow_boost := 1.0
## Contact radii of the limbs (botModel.ts radii), in metres.
var radii := {}
## Where the joints of torn-off parts are drawn from: a Node3D per joint (the flying piece,
## set by detach_piece) or null, so contact shadows and rope contact follow the debris.
var anchors: Array = []
## The armour hulls placed by their bones, read by the opponent's contact pass.
var hull_torso: BotContact.Placed
var hull_head: BotContact.Placed
var hull_pelvis: BotContact.Placed
## The deepest limb contact last frame (metres), for checks.
var contact_worst := 0.0

var _pos: Array[Vector3] = []
var _rot: Array[Basis] = []
var _scl: Array[Vector3] = []
var _hidden := {}
var _head_hidden := false
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
# contact (botModel.ts solveContacts): per limb (arms, then legs) the settling, and when it last ran
var _contact := BotContact.new()
var _settle: Array[BotContact.LimbSettle] = []
var _contact_time := -INF
var _arm_hulls: Array = []
var _leg_hulls: Array = []
# the parts as built: [key, bone, slot, body part], their families, and where their corners start
var _list := []
var _parts: Array[BotParts.Part] = []
var _codes := PackedFloat32Array()
# damage (botModel.ts dent, mark): every material drawing this robot's metal, torn-off pieces too
var _mats: Array[ShaderMaterial] = []
var _wear := PackedFloat32Array()
var _dent_p := PackedVector4Array()
var _dent_n := PackedVector4Array()
var _dent_dir := PackedVector3Array()
var _dent_target := PackedFloat32Array()
var _dent_shown := PackedFloat32Array()
var _dent_vel := PackedFloat32Array()
var _dent_time := -1.0
var _dents_dirty := false
var _marks := PackedVector4Array()
var _mark_b := PackedVector3Array()
var _sockets := 0
var _oil_next := SOCKET_SLOTS
var _grime := 0.0
## Per body part, the bones carrying its armour (the ones a blow to it can dent).
var _part_bones: Array = []
## Per bone, its plating's corners in its rest frame: [positions, normals, shift] per part.
var _bone_corners := {}
## Blows waiting for their plating search (run on a worker thread), oldest first.
var _dent_jobs: Array = []
var _hull_task := -1
var _hulls_loaded: Array = []


func _init(bot_spec) -> void:
	spec = bot_spec
	size = float(JS.get_field(spec, "size")) if JS.get_field(spec, "size") != null else 1.0
	for i in 16:
		joints.append(Vector3.ZERO)
		anchors.append(null)
	for i in BONE_COUNT:
		_pos.append(Vector3.ZERO)
		_rot.append(Basis.IDENTITY)
		_scl.append(Vector3.ONE * size)
	for i in 4:
		_settle.append(BotContact.LimbSettle.new())
	_bones.resize(BONE_COUNT * 3)
	_wear.resize(PART_COUNT)
	_dent_p.resize(DENTS)
	_dent_n.resize(DENTS)
	for k in DENTS:
		_dent_n[k] = Vector4(0, 0, 0, -1)
	_dent_dir.resize(DENTS)
	_dent_target.resize(DENTS)
	_dent_shown.resize(DENTS)
	_dent_vel.resize(DENTS)
	_marks.resize(MARKS)
	_mark_b.resize(MARKS)
	for p in PART_COUNT:
		_part_bones.append([])
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
	_list = list

	for e in list:
		_parts.append(BotParts.get_part(e[0]))
		_codes.append(e[1] + 32 * e[3] + 512 * SLOTS.find(e[2]))
		# the plating a blow to this part can dent (the core's halves are the torso's)
		var bone: int = e[1]
		if bone in STRETCHED:
			continue
		var db := TORSO if bone >= CORE_F else bone
		if not _part_bones[e[3]].has(db):
			_part_bones[e[3]].append(db)
		var f: BotParts.Family = _parts[-1].opaque
		if not f.pos.is_empty():
			if not _bone_corners.has(db):
				_bone_corners[db] = []
			_bone_corners[db].append([f.pos, f.nor, _core_shift[bone - CORE_F] if bone >= CORE_F else Vector3.ZERO])

	_opaque_mat = ShaderMaterial.new()
	_opaque_mat.shader = OPAQUE_SHADER
	_glow_mat = ShaderMaterial.new()
	_glow_mat.shader = GLOW_SHADER
	_paint_surfaces()
	_glow_colours(core)
	_mats = [_opaque_mat, _glow_mat]
	for m in _mats:
		m.set_shader_parameter("core_shift", PackedVector3Array(_core_shift))
	_push_damage(true)

	_opaque = MeshInstance3D.new()
	_opaque.mesh = _family_mesh(true)
	_opaque.material_override = _opaque_mat
	_glow = MeshInstance3D.new()
	_glow.mesh = _family_mesh(false)
	_glow.material_override = _glow_mat
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for m in [_opaque, _glow]:
		# the bones move the corners on the GPU: the box has to hold any pose
		m.custom_aabb = AABB(Vector3(-2, -2.2, -2) * size, Vector3(4, 4.4, 4) * size)
		add_child(m)

	# contact hulls from the real armour (bake_parts.ts builds them as botModel.ts does), unpacked
	# on a worker thread: contact starts once they're in (a fight opens with its intro anyway)
	hull_torso = BotContact.Placed.new(null)
	hull_head = BotContact.Placed.new(null)
	hull_pelvis = BotContact.Placed.new(null)
	_hull_task = WorkerThreadPool.add_task(_load_hulls.bind(chest, core, head, legs), false, "hulls")
	# limb radii from the bare (common) armour, so a rarer item doesn't change how limbs clear the body
	var r: Dictionary = BotParts.info.radii
	radii = {
		"upper": float(r.upper[chest]) * size,
		"fore": float(r.fore[fist]) * size,
		"fist": float(r.fist[fist]) * size,
		"thigh": float(r.thigh[legs]) * size,
		"shin": float(r.shin[kick * 18 + legs]) * size,
	}

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


func _load_hulls(chest: int, core: int, head: int, legs: int) -> void:
	_hulls_loaded = [BotHull.torso(chest, core), BotHull.head(head), BotHull.pelvis(legs)]


## Are the contact hulls in? (They unpack in the background after the robot is built.)
func hulls_ready() -> bool:
	if _hull_task < 0:
		return true
	if not WorkerThreadPool.is_task_completed(_hull_task):
		return false
	wait_hulls()
	return true


## Block until the contact hulls are in.
func wait_hulls() -> void:
	if _hull_task < 0:
		return
	WorkerThreadPool.wait_for_task_completion(_hull_task)
	_hull_task = -1
	hull_torso.hull = _hulls_loaded[0]
	hull_head.hull = _hulls_loaded[1]
	hull_pelvis.hull = _hulls_loaded[2]


## One material family of the whole robot: every part's corners, the pieces ordered biggest first
## across the robot (as skin.ts does), so each detail level is just a shorter index list.
func _family_mesh(opaque: bool) -> ArrayMesh:
	var parts := _parts
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
		c.fill(_codes[i])
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
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], lods, _FLAGS)
	return mesh


const _FLAGS := (Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT)


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


# ------------------------------------------------------------------ posing (botModel.ts)

## Pose from a fighter's physical body with interpolation alpha, with no opponent contact.
## `look_at`: where the head turns.
func pose(f, alpha: float, time: float, look_at = null) -> void:
	begin(f, alpha, look_at)
	end(f, time)


## Interpolate the body and place torso, pelvis and head: everything the opponent's contact
## pass needs (botModel.ts begin).
func begin(f, alpha: float, look_at = null) -> void:
	var body = f.body
	for i in 16:
		if _anchored(i):
			joints[i] = anchors[i].global_position
			continue
		var a = body.last[i]
		var b = body.pos[i]
		joints[i] = Vector3(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha)
	_begin_core(f, look_at)


## begin() from joints given in world space instead of a fighter's body (a puppet: the loser
## riding off on the stretcher).
func begin_posed(f, world_joints: Array, look_at = null) -> void:
	for i in 16:
		joints[i] = anchors[i].global_position if _anchored(i) else world_joints[i]
	_begin_core(f, look_at)


## Joint j is drawn from a flying piece.
func _anchored(j: int) -> bool:
	var an = anchors[j]
	return an != null and is_instance_valid(an) and an.is_inside_tree()


func _begin_core(f, look_at) -> void:
	for i in BONE_COUNT:
		_scl[i] = Vector3.ONE * size
	_pose_core(f, look_at)
	# the hulls the contact passes read, placed by their bones (a torn-off head has none)
	var ready := hulls_ready()
	for h in [[hull_torso, TORSO], [hull_head, HEAD], [hull_pelvis, PELVIS]]:
		var p: BotContact.Placed = h[0]
		p.pos = _pos[h[1]]
		p.rot = _rot[h[1]]
		p.s = 0.0 if _hidden.has(h[1]) or not ready else size


## Resolve limb contacts (own armour and, if given, the opponent's), then place the limbs and
## draw (botModel.ts end).
func end(f, time: float, opp: BotModel = null) -> void:
	_solve_contacts(f, opp, time)
	_pose_limbs(f)
	for b in _hidden:
		_scl[b] = Vector3.ZERO
	_effects(f, time)
	_upload()


## Collapse the head and neck while the camera looks out of them (the director's bot's-eye
## shot). Only the drawing: the opponent's contact pass still meets the head.
func set_head_hidden(on: bool) -> void:
	_head_hidden = on


## Collapse a torn-off part's bones (and everything below) for the rest of the fight.
func tear_off(part: int) -> void:
	for b in TORN_BONES.get(part, []):
		_hidden[b] = true


func _upload() -> void:
	# the meshes sit at the chest, so Godot's culling and detail levels see where the robot is
	var origin := joints[J_CHEST]
	position = origin
	for b in BONE_COUNT:
		var sc := Vector3.ZERO if _head_hidden and (b == HEAD or b == NECK) else _scl[b]
		var m := _rot[b] * Basis.from_scale(sc)
		var p := _pos[b] - origin
		_bones[b * 3] = Vector4(m.x.x, m.y.x, m.z.x, p.x)
		_bones[b * 3 + 1] = Vector4(m.x.y, m.y.y, m.z.y, p.y)
		_bones[b * 3 + 2] = Vector4(m.x.z, m.y.z, m.z.z, p.z)
	_opaque_mat.set_shader_parameter("bones", _bones)
	_glow_mat.set_shader_parameter("bones", _bones)


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


## Slide elbows, fists, knees and airborne feet out of armour they would pass through
## (botModel.ts solveContacts).
func _solve_contacts(f, opp: BotModel, time: float) -> void:
	var P := joints
	_arm_hulls.clear()
	_arm_hulls.append_array([hull_torso, hull_pelvis, hull_head])
	_leg_hulls.clear()
	_leg_hulls.append(hull_torso)
	if opp != null:
		_arm_hulls.append_array([opp.hull_torso, opp.hull_head, opp.hull_pelvis])
		_leg_hulls.append_array([opp.hull_torso, opp.hull_pelvis, opp.hull_head])
	var dt := time - _contact_time
	_contact_time = time
	var frame := _rot[TORSO]
	var c := _contact
	var worst := 0.0
	for side in 2:
		var L := side == 0
		var arm := _settle[side]
		if f.parts.armOut(side):
			arm.reset()
		else:
			var js := J_SH_L if L else J_SH_R
			var je := J_EL_L if L else J_EL_R
			var jh := J_HAND_L if L else J_HAND_R
			var mid0 := P[je]
			var end0 := P[jh]
			worst = maxf(worst, c.solve_limb(P[js], mid0, end0, _arm_hulls, radii.upper, radii.fore, radii.fist, 0.02))
			arm.apply(frame, P[js], c.mid, c.end, mid0, end0, dt)
			P[je] = arm.mid
			P[jh] = arm.end
		# legs only meet armour in the air (kicks, knees); when they come down, what contact did
		# to them lets go at the settling speed rather than all at once
		var leg := _settle[2 + side]
		if f.parts.legOut(side):
			leg.reset()
		else:
			var jhip := J_HIP_L if L else J_HIP_R
			var jk := J_KNEE_L if L else J_KNEE_R
			var jf := J_FOOT_L if L else J_FOOT_R
			var mid0 := P[jk]
			var end0 := P[jf]
			var mid := mid0
			var tip := end0
			if f.footAir[side] > 0.3:
				worst = maxf(worst, c.solve_limb(P[jhip], mid0, end0, _leg_hulls, radii.thigh, radii.shin, radii.shin, 0.0))
				mid = c.mid
				tip = c.end
			leg.apply(frame, P[jhip], mid, tip, mid0, end0, dt)
			P[jk] = leg.mid
			P[jf] = leg.end
	contact_worst = worst


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
		# upper arm: front faces the bend (a stump just hangs off the shoulder)
		var bend_hint := _torso_z if _anchored(J_HAND_L if L else J_HAND_R) else (hd - el).normalized()
		_orient_held(up, sh, el, bend_hint, _held_up, side, _torso_z)
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
	# battle damage shading follows the parts' condition
	var cond = f.parts.cond
	var changed := false
	for i in PART_COUNT:
		var w := 1.0 - float(cond[i])
		if w != _wear[i]:
			_wear[i] = w
			changed = true
	if changed:
		for m in _mats:
			m.set_shader_parameter("wear", _wear)
	_finish_dents()
	_settle_dents(0.0 if _dent_time < 0.0 else time - _dent_time)
	_dent_time = time
	_push_damage(false)
	for m in _mats:
		m.set_shader_parameter("time", time)
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
	# mythic items shimmer
	for i in 6:
		if int(spec.loadout[SLOTS[i]].rarity) == 4:
			_cols[2 + i] = lin(TItems.RARITIES[4].glow) * (2.6 + sin(time * 5 + SLOTS[i].length()) * 1.2)
	for m in _mats:
		if m.shader == GLOW_SHADER:
			m.set_shader_parameter("cols", _cols)


# ------------------------------------------------------------------ battle damage (botModel.ts)

## Oily grime over the whole robot, 0..1.
var grime: float:
	get:
		return _grime
	set(v):
		_grime = clampf(v, 0.0, 1.0)
		for m in _mats:
			if m.shader == OPAQUE_SHADER:
				m.set_shader_parameter("grime", _grime)


## A world point into `bone`'s rest frame (the frame its plating is modelled in).
func _to_bone(bone: int, p: Vector3) -> Vector3:
	return ((_parent_xf().affine_inverse() * p - _pos[bone]) * _rot[bone]) / size


## A world direction into `bone`'s rest frame (unit length).
func _dir_to_bone(bone: int, d: Vector3) -> Vector3:
	return ((_parent_xf().basis.inverse() * d) * _rot[bone]).normalized()


func _parent_xf() -> Transform3D:
	var p := get_parent_node_3d()
	return p.global_transform if p != null and p.is_inside_tree() else Transform3D.IDENTITY


## A blow landed (a sim "hit" event's data): punch a dent into the plating where it struck,
## pushed in along the blow. Bigger and deeper for harder blows and for parts already battered;
## a blow landing on an earlier dent deepens and widens it instead. `instant` skips the punch-in
## and the wait (botModel.ts dent). The plating search runs on a worker thread; the dent goes in
## a frame later.
func dent(h, instant := false) -> void:
	if h.shielded:
		return
	var bones: Array = _part_bones[int(h.part)]
	if bones.is_empty():
		return
	var dir := Vector3(h.dir.x, h.dir.y, h.dir.z)
	var at := Vector3(h.point.x, h.point.y, h.point.z)
	var rays := []
	for bone in bones:
		if _hidden.has(bone):
			continue
		var dd := _dir_to_bone(bone, dir)
		if not (dd.length_squared() > 0.5):
			continue
		rays.append([bone, dd, _to_bone(bone, at) - dd * 0.4])
	if rays.is_empty():
		return
	var job := {
		"rays": rays, "reach": 0.075 / size, "wear": 1.0 - float(h.partCond), "damage": float(h.damage),
		"kick": h.move.kind == "kick", "crit": bool(h.crit), "heavy": bool(h.heavy), "blocked": bool(h.blocked),
		"instant": instant, "task": -1,
	}
	if instant:
		_find_plating(job)
		_place_dent(job)
		return
	job.task = WorkerThreadPool.add_task(_find_plating.bind(job), false, "dent")
	_dent_jobs.append(job)


## The first plating the blow meets: cast back along it from a little way out, and take the
## nearest corner facing it within a fist's width of that line (else the one closest to it).
func _find_plating(job: Dictionary) -> void:
	var reach2: float = job.reach * job.reach
	var best := -1
	var best_bone := -1
	var best_t := INF
	var best_lat := INF
	var best_c := Vector3.ZERO
	var best_n := Vector3.ZERO
	for ray in job.rays:
		var dd: Vector3 = ray[1]
		for chunk in _bone_corners.get(ray[0], []):
			var pos: PackedVector3Array = chunk[0]
			var nor: PackedVector3Array = chunk[1]
			var shift: Vector3 = chunk[2]
			var o: Vector3 = ray[2] - shift
			for i in pos.size():
				if nor[i].dot(dd) > 0.1:
					continue
				var v := pos[i] - o
				var t := v.dot(dd)
				if t < 0.0:
					continue
				var lat := (v - dd * t).length_squared()
				# inside the fist's line: the first one along it; otherwise whatever lies closest to it
				var take := (best_lat >= reach2 or t < best_t) if lat < reach2 else (best_lat >= reach2 and lat < best_lat)
				if take:
					best = i
					best_bone = ray[0]
					best_t = t
					best_lat = lat
					best_c = pos[i] + shift
					best_n = nor[i]
	job.bone = best_bone if best >= 0 else -1
	job.c = best_c
	job.n = best_n
	for ray in job.rays:
		if ray[0] == best_bone:
			job.dd = ray[1]


## Put in the dents whose plating search is done, in the order the blows landed.
func _finish_dents() -> void:
	while not _dent_jobs.is_empty():
		var job: Dictionary = _dent_jobs[0]
		if not WorkerThreadPool.is_task_completed(job.task):
			return
		WorkerThreadPool.wait_for_task_completion(job.task)
		_dent_jobs.pop_front()
		_place_dent(job)


func _place_dent(job: Dictionary) -> void:
	var bone: int = job.bone
	if bone < 0 or _hidden.has(bone):
		return
	var c: Vector3 = job.c
	# the metal goes in mostly square to the plate, leaning the way the blow travelled
	var n: Vector3 = ((job.n as Vector3) * -1.2 + job.dd).normalized()
	var wear: float = job.wear
	var r := minf(0.15, maxf(0.06, 0.05 + job.damage * 0.0012)) * (1.15 if job.kick else 1.0)
	var depth := r * (0.13 + 0.25 * wear) * (1.3 if job.crit else 1.0) * (1.15 if job.heavy else 1.0)
	if job.blocked:
		r *= 0.85
		depth *= 0.5
	r /= size
	depth /= size
	# land on an earlier dent: it goes deeper and wider, and creeps towards the new blow
	var same := -1
	var near := INF
	var empty := -1
	var shallow := -1
	for k in DENTS:
		var b := int(_dent_n[k].w)
		if b < 0:
			if empty < 0:
				empty = k
			continue
		# (a torn-off piece keeps its dents)
		if not _hidden.has(b) and (shallow < 0 or _dent_target[k] < _dent_target[shallow]):
			shallow = k
		if b != bone:
			continue
		var p := _dent_p[k]
		var d := Vector3(p.x, p.y, p.z).distance_to(c) / maxf(p.w, r)
		if d < near:
			near = d
			same = k
	var slot := -1
	var merge := false
	if same >= 0 and near <= 0.6:
		slot = same
		merge = true
	elif empty >= 0:
		slot = empty
	elif same >= 0 and near <= 1.6:
		# no room for another: the nearest dent takes it
		slot = same
		merge = true
	elif shallow >= 0:
		slot = shallow
	else:
		return
	if merge:
		var old := _dent_target[slot]
		var w := depth / (old + depth)
		var p := _dent_p[slot]
		var at := Vector3(p.x, p.y, p.z)
		at += (c - at) * (w * 0.5)
		_dent_p[slot] = Vector4(at.x, at.y, at.z, minf(0.17 / size, maxf(p.w, r) * 1.05 + r * 0.1))
		_dent_dir[slot] = (_dent_dir[slot] * old + n * depth).normalized()
		_dent_target[slot] = minf(_dent_p[slot].w * 0.42, old + depth * 0.8)
	else:
		_dent_p[slot] = Vector4(c.x, c.y, c.z, r)
		_dent_dir[slot] = n
		_dent_n[slot].w = bone
		_dent_target[slot] = minf(r * 0.42, depth)
		_dent_shown[slot] = 0.0
		_dent_vel[slot] = 0.0
	if job.instant:
		_dent_shown[slot] = _dent_target[slot]
		_dent_vel[slot] = 0.0
	else:
		# the blow drives it in: it starts moving at full speed
		_dent_vel[slot] = maxf(_dent_vel[slot], (_dent_target[slot] - _dent_shown[slot]) * 32.0)
	_write_dent(slot)


## Let punched-in dents settle (a spring per dent: in past its depth, then a little back).
func _settle_dents(dt: float) -> void:
	dt = minf(dt, 1.0 / 20.0)
	if dt <= 0.0:
		return
	for k in DENTS:
		var s := _dent_shown[k]
		var t := _dent_target[k]
		var v := _dent_vel[k]
		if s == t and v == 0.0:
			continue
		# two half steps keep the stiff spring stable at low frame rates
		var h := dt / 2.0
		for n in 2:
			v += ((t - s) * DENT_K - v * DENT_C) * h
			s = maxf(0.0, s + v * h)
		if absf(t - s) < 1e-5 and absf(v) < 1e-4:
			s = t
			v = 0.0
		_dent_shown[k] = s
		_dent_vel[k] = v
		_write_dent(k)


func _write_dent(k: int) -> void:
	var d := _dent_dir[k] * _dent_shown[k]
	_dent_n[k] = Vector4(d.x, d.y, d.z, _dent_n[k].w)
	_dents_dirty = true


## Hand the dents and marks to every material drawing this robot's metal.
func _push_damage(all: bool) -> void:
	if not (all or _dents_dirty):
		return
	_dents_dirty = false
	for m in _mats:
		m.set_shader_parameter("dent_p", _dent_p)
		m.set_shader_parameter("dent_n", _dent_n)
		if all:
			m.set_shader_parameter("wear", _wear)
		if m.shader == OPAQUE_SHADER:
			m.set_shader_parameter("marks", _marks)
			m.set_shader_parameter("mark_b", _mark_b)
			m.set_shader_parameter("grime", _grime)


## Put a damage mark on `bone` at a world point (stored in the bone's own frame, so it moves with it).
func _mark(slot: int, bone: int, at: Vector3, radius: float, kind: int, strength: float) -> void:
	if _hidden.has(bone):
		return
	var p := _to_bone(bone, at)
	_marks[slot] = Vector4(p.x, p.y, p.z, radius)
	_mark_b[slot] = Vector3(bone, kind, strength)
	_dents_dirty = true
	_push_damage(false)


## A part was torn off: the socket it left is wrenched (its metal wrecked round the joint) and
## slick with oil. Returns where the socket is (for the spill), or null (botModel.ts socketWrench).
func socket_wrench(part: int):
	var s: Array = SOCKET_AT.get(part, [])
	if s.is_empty():
		return null
	var at := joints[s[1]]
	if _sockets < SOCKET_SLOTS:
		_mark(_sockets, s[0], at, 0.26, MARK_SOCKET, 0.95)
		_sockets += 1
	oil_splash(s[1], 0.17, 1.0, 0.0)
	return at


## Oil splashed onto the armour round a joint: a glossy black splash that runs down the part.
## `out` pushes the splash to one side of the part (0 = centred on the joint).
func oil_splash(joint: int, radius: float, strength := 1.0, out := 0.11) -> void:
	var dir := Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1))
	while dir.length_squared() > 1.0 or dir.length_squared() < 1e-4:
		dir = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1))
	_mark(_oil_next, JOINT_BONE[joint], joints[joint] + dir.normalized() * out, radius, MARK_OIL, strength)
	_oil_next = SOCKET_SLOTS if _oil_next + 1 >= MARKS else _oil_next + 1


## Tear a part off and hand it over as a piece (botModel.ts tearOff): its bones (and everything
## below) vanish from the body, and the same metal, dents, paint and all, comes back as a new
## Node3D centred on its middle (its `transform` is the world one: add it under a node at the
## world origin). Children: the opaque MeshInstance3D, then the glow one if it has lights. Its
## box is the "aabb" meta (and each mesh's custom_aabb). The torn joints are anchored to it
## (anchors), so contact shadows and rope contact follow the debris. Null if nothing is left.
func detach_piece(part: int) -> Node3D:
	var set := {}
	for b in TORN_BONES.get(part, []):
		if not _hidden.has(b):
			set[b] = true
	if set.is_empty():
		return null
	var xf := _parent_xf()
	# each torn bone in the world, as posed now
	var world := {}
	for b in set:
		world[b] = xf * Transform3D(_rot[b] * Basis.from_scale(_scl[b]), _pos[b])
	# centred on the mean of the opaque corners, like the web's piece
	var pieces: Dictionary = BotParts.info.pieces
	var sum := Vector3.ZERO
	var n := 0.0
	for i in _list.size():
		var b: int = _list[i][1]
		if set.has(b):
			var info: Array = pieces[_list[i][0]]
			var w: Transform3D = world[b]
			sum += w.basis * Vector3(info[6], info[7], info[8]) + w.origin * float(info[9])
			n += float(info[9])
	if n <= 0.0:
		tear_off(part)
		return null
	var centre := sum / n
	var box := AABB()
	var first := true
	for i in _list.size():
		var b: int = _list[i][1]
		if set.has(b) and float(pieces[_list[i][0]][9]) > 0.0:
			var info: Array = pieces[_list[i][0]]
			var w: Transform3D = world[b]
			for k in 8:
				var c := Vector3(info[3] if k & 1 else info[0], info[4] if k & 2 else info[1], info[5] if k & 4 else info[2])
				var p := w * c - centre
				if first:
					box = AABB(p, Vector3.ZERO)
					first = false
				else:
					box = box.expand(p)
	# the piece's bones: frozen where they were, round its centre (everything else collapsed)
	var bones := PackedVector4Array()
	bones.resize(BONE_COUNT * 3)
	for b in set:
		var w: Transform3D = world[b]
		var m := w.basis
		var p := w.origin - centre
		bones[b * 3] = Vector4(m.x.x, m.y.x, m.z.x, p.x)
		bones[b * 3 + 1] = Vector4(m.x.y, m.y.y, m.z.y, p.y)
		bones[b * 3 + 2] = Vector4(m.x.z, m.y.z, m.z.z, p.z)
	var node := Node3D.new()
	node.name = "piece"
	node.transform = Transform3D(Basis.IDENTITY, centre)
	node.set_meta("aabb", box)
	for opaque in [true, false]:
		var mesh := _piece_mesh(set, opaque)
		if mesh == null:
			continue
		mesh.custom_aabb = box
		var mat: ShaderMaterial = (_opaque_mat if opaque else _glow_mat).duplicate()
		mat.set_shader_parameter("bones", bones)
		_mats.append(mat)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = mat
		mi.custom_aabb = box
		if not opaque:
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.add_child(mi)
	tear_off(part)
	for j in TDamage.CUT_JOINTS[part]:
		anchors[int(j)] = node
	return node


## The corners and triangles of the parts on `set`'s bones, as a mesh of their own.
func _piece_mesh(set: Dictionary, opaque: bool) -> ArrayMesh:
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var tag := PackedFloat32Array()
	var code := PackedFloat32Array()
	var index := PackedInt32Array()
	for i in _list.size():
		if not set.has(_list[i][1]):
			continue
		var f: BotParts.Family = _parts[i].opaque if opaque else _parts[i].glow
		if f.pos.is_empty():
			continue
		var base := pos.size()
		pos.append_array(f.pos)
		if opaque:
			nor.append_array(f.nor)
		tag.append_array(f.tag)
		var c := PackedFloat32Array()
		c.resize(f.pos.size())
		c.fill(_codes[i])
		code.append_array(c)
		var s := f.index.duplicate()
		for k in s.size():
			s[k] += base
		index.append_array(s)
	if index.is_empty():
		return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	if opaque:
		arrays[Mesh.ARRAY_NORMAL] = nor
	arrays[Mesh.ARRAY_CUSTOM0] = tag
	arrays[Mesh.ARRAY_CUSTOM1] = code
	arrays[Mesh.ARRAY_INDEX] = index
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, _FLAGS)
	return mesh


func _exit_tree() -> void:
	wait_hulls()
	# a dent search still running reads this robot's corners
	for job in _dent_jobs:
		WorkerThreadPool.wait_for_task_completion(job.task)
	_dent_jobs.clear()
