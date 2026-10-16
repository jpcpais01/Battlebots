## The loser's ride home (port of src/render/stretcher.ts Stretcher). The victory plays out first,
## with the loser left lying in the ring; then, a few seconds after the winner was decided, the
## show cuts to a new scene: the loser already aboard a hover stretcher (with every part that was
## torn off it), gliding down the walkout carpet on its side and on down the LED-lit tunnel. All
## smiles, it does one of five bits for the camera that follows it: a peace sign, double thumbs
## up, a wave to the crowd, a lie-back with its hands behind its head, or disco pointing to a
## beat. Nearing the tunnel it waves goodbye, and the energy gate in there swallows it up.
##
## The ride is picked from the match seed and timed off the match clock after the final bell,
## so it plays the same every time. Render only: the sim's loser keeps lying on the canvas; this
## poses its model elsewhere (BotModel.begin_posed from `joints`, read through `puppet`).
## The stretcher's geometry is the web's own, baked (tools/bake/web/menus_stretcher.ts).
class_name Stretcher
extends Node3D

const BAKE := "res://assets/stretcher/stretcher"
const RIDES := ["peace", "thumbs", "wave", "chill", "disco"]
## Timeline, in match seconds after the fight ends ("end" phase). The victory before the cut: a
## KO's slow motion already took ~8 s; a decision ends quicker.
const HOLD_KO := 4.0
const HOLD_DECISION := 9.0
## The ride itself, from the cut to gone through the gate.
const RIDE := 11.0
## The second shot: watching it go, from back down the carpet.
const WIDE := 4.6
## Waving goodbye, from this far into the ride.
const BYE := RIDE - 4.2
## Hover height of the deck over the arena floor.
const HOVER := 0.62
## Pelvis position along the deck (unit space: the stretcher is built for a size-1 bot).
const ZP := -0.12
## bowl.ts: the front row's half-length, the arena floor, the tunnel's mouth and its gate.
const AX := 13.0
const FLOOR := -0.62
const TUNNEL_OPEN_HW := 1.48
const TUNNEL_GATE := 8.0
const CYAN := 0x4ff3ff
## Spots for torn parts: beside the legs, then the foot end, then by the shoulders.
const SLOTS := [[0.33, -0.6], [-0.33, -0.6], [0.33, -1.05], [-0.33, -1.05], [0.0, -1.45], [0.34, -0.2], [-0.34, -0.2], [0.24, -1.45], [-0.24, -1.45]]
enum { J_PELVIS, J_CHEST, J_NECK, J_HEAD, J_SH_L, J_EL_L, J_HAND_L, J_SH_R, J_EL_R, J_HAND_R, J_HIP_L, J_KNEE_L, J_FOOT_L, J_HIP_R, J_KNEE_R, J_FOOT_R }


## A pose on the deck, in the bot's own frame. Hands and elbow poles per side (0 left, 1 right).
class Pose:
	## Backrest angle (0 flat on its back), head nod forward and tilt sideways (towards its right).
	var th := 0.0
	var nod := 0.0
	var tilt := 0.0
	## Hand target from the shoulder: [outward, up the spine, forward]; elbow pole [outward, up, forward].
	var hand: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
	var pole: Array[Vector3] = [Vector3(1, 0, 0), Vector3(1, 0, 0)]
	## Knee raise per side (0 straight, 1 foot drawn right up).
	var knee: Array[float] = [0.0, 0.0]
	## Left ankle resting on the right knee; crossed at the ankles; foot tap (radians of ankle flex).
	var cross := 0.0
	var ankles := 0.0
	var tap := 0.0


## What the model reads besides the joints (botModel.ts PoseSource), writable.
class RidePuppet:
	var faceYaw := 0.0
	var stance := -1.0
	var parts
	var state := "ko"
	var strike = null
	var dodge = null
	var isDown := false
	var shield := false
	var overdrive := 0.0
	var index := 0.0
	var shockTime := 0.0
	var handRoll := [0.0, 0.0]
	var footYaw := [0.0, 0.0]
	var footHeel := [0.0, 0.0]
	var footAir := [1.0, 1.0]
	var footFlex := [0.25, 0.25]


## Set up for this match's ride (from the end of the fight until it's gone).
var on := false
## The fighter on it, and its bit.
var loser := -1
var ride := "peace"
## World joints the loser's model is posed from while it's aboard.
var joints: Array[Vector3] = []
var puppet := RidePuppet.new()
## The camera's wishes this frame ({pos, look, fov_k, cut}; empty: leave it to the director).
var shot := {}
## The model is posed from `joints` this frame (false until the ride's scene cuts in).
var posed := false
## Where the stretcher is this frame.
var at := Vector3.ZERO

var _rig := Node3D.new()
var _back := Node3D.new()
var _glow_mat: ShaderMaterial
var _pool := MeshInstance3D.new()
var _pool_mat: ShaderMaterial
var _fingers := MultiMeshInstance3D.new()
var _finger_mat := StandardMaterial3D.new()
var _bubbles: Array[Sprite3D] = []
var _bub := []
var _glyphs: Texture2D
var _size := 1.0
var _len := {"ua": 0.28, "fa": 0.27, "th": 0.4, "sh": 0.4}
var _side := 1.0
var _x0 := 8.0
var _x1 := 17.0
var _wide := Vector3.ZERO
var _hold := HOLD_KO
var _took := false
var _pieces := []
var _mirrored := false
var _has_hand := [true, true]
var _signs := ["none", "none"]
var _glyph := 0
var _glyph_col := Color.WHITE
var _puff := 0.0
var _t := -1.0
var _cam_pos := Vector3.ZERO
var _cam_look := Vector3.ZERO
var _shot_no := -1
var _a := Pose.new()
var _b := Pose.new()
var _cur := Pose.new()
var _rig_xf := Transform3D.IDENTITY


func _init() -> void:
	name = "Stretcher"
	for i in 16:
		joints.append(Vector3.ZERO)
	_build()
	visible = false


func _build() -> void:
	add_child(_rig)
	var bs := BakedScene.open(BAKE)
	var shell := StandardMaterial3D.new()
	shell.vertex_color_use_as_albedo = true
	shell.roughness = 0.32
	shell.metallic = 0.25
	_glow_mat = ShaderMaterial.new()
	_glow_mat.shader = _unlit_shader(true, false)
	bs.factory = func(rec: Dictionary, _n: Dictionary, scene: BakedScene) -> Array:
		if rec.type == "MeshStandardMaterial":
			return [shell, {}]
		if rec.has("map"):
			_glyphs = scene.texture(int(rec.map.tex))
			return [null, {}]
		return [_glow_mat, {}]
	var holder := Node3D.new()
	bs.build(holder)
	# deck, keel, rails and pods (and the glowing strips) ride the rig; the back section hinges
	for n in ["hull", "glow"]:
		var mi: MeshInstance3D = bs.named[n]
		mi.get_parent().remove_child(mi)
		mi.extra_cull_margin = 16384.0
		_rig.add_child(mi)
	_rig.get_node("hull").cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	var back: MeshInstance3D = bs.named["back"]
	back.get_parent().remove_child(back)
	back.extra_cull_margin = 16384.0
	back.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	_back.position = Vector3(0, 0.03, ZP)
	_back.add_child(back)
	_rig.add_child(_back)
	holder.free()
	# a pool of light on whatever is under it
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.45, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.35), Color(1, 1, 1, 0)])
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 64
	gt.height = 64
	var plane := PlaneMesh.new()
	plane.size = Vector2.ONE
	_pool.mesh = plane
	_pool_mat = ShaderMaterial.new()
	_pool_mat.shader = _unlit_shader(false, true)
	_pool_mat.set_shader_parameter("tex", gt)
	_pool_mat.set_shader_parameter("tint", Color.hex((CYAN << 8) | 0xff).srgb_to_linear())
	_pool.material_override = _pool_mat
	_pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_pool.extra_cull_margin = 16384.0
	add_child(_pool)
	# fingers for the hand signs: two for a V, a thumb, or a whole open hand
	var cap := CapsuleMesh.new()
	cap.radius = 0.017
	cap.height = 0.075 + 0.034
	cap.radial_segments = 8
	cap.rings = 3
	cap.material = _finger_mat
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = cap
	mm.instance_count = 10
	mm.visible_instance_count = 0
	_fingers.multimesh = mm
	_fingers.extra_cull_margin = 16384.0
	add_child(_fingers)
	# hearts, notes and stars floating up off a happy robot
	for i in 10:
		var s := Sprite3D.new()
		s.texture = _glyphs
		s.region_enabled = true
		s.region_rect = Rect2(0, 0, 64, 64)
		s.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		s.shaded = false
		s.transparent = true
		s.no_depth_test = false
		s.pixel_size = 1.0 / 64.0
		s.visible = false
		add_child(s)
		_bubbles.append(s)
		_bub.append({"age": 0.0, "life": 1.0, "vx": 0.0, "vz": 0.0, "ph": 0.0})


## A small unlit shader: vertex colours times a glow factor (the LED strips), or a texture tinted
## and blended additively (the pool of light).
static func _unlit_shader(vcol: bool, add: bool) -> Shader:
	var s := Shader.new()
	var code := "shader_type spatial;\nrender_mode unshaded%s;\n" % (", blend_add, depth_draw_never, cull_disabled" if add else "")
	if add:
		code += "uniform sampler2D tex : source_color, filter_linear;\nuniform vec4 tint : source_color;\nuniform float opacity = 0.0;\n"
		code += "void fragment() {\n\tvec4 t = texture(tex, UV);\n\tALBEDO = tint.rgb * t.rgb * t.a * opacity;\n}\n"
	elif vcol:
		code += "uniform float k = 2.4;\nvoid fragment() {\n\tALBEDO = COLOR.rgb * k;\n}\n"
	s.code = code
	return s


## The ride for a match (stretcher.ts pickRide): from its seed, so every showing agrees.
static func pick_ride(seed: float, loser_: int) -> String:
	var h: int = (int(seed) & 0xFFFFFFFF) ^ (((loser_ + 1) * 0x9e3779b9) & 0xFFFFFFFF)
	h = ((h ^ (h >> 16)) * 0x45d9f3b) & 0xFFFFFFFF
	h = ((h ^ (h >> 16)) * 0x45d9f3b) & 0xFFFFFFFF
	h ^= h >> 16
	return RIDES[h % RIDES.size()]


## When the ride is over, in "end" phase time (stretcher.ts rideEnd: the results come up after).
static func ride_end(result) -> float:
	return (HOLD_DECISION if str(result) == "Decision" else HOLD_KO) + RIDE


static func _smooth(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


static func _damp(a: float, b: float, lam: float, dt: float) -> float:
	return b + (a - b) * exp(-lam * dt)


## Each bit, authored for a right-handed performer; t is seconds into it (stretcher.ts ridePose).
static func ride_pose(ride_: String, t: float, o: Pose) -> void:
	o.cross = 0.0
	o.ankles = 0.0
	o.tap = 0.0
	match ride_:
		"peace":
			# propped up, a V by its face, rocking it; the other hand behind its head
			o.th = 0.55
			o.nod = 0.22 + 0.05 * sin(t * 5.0)
			o.tilt = 0.2 * sin(t * 3.0)
			o.hand[1] = Vector3(-0.03 + 0.05 * sin(t * 3.0), 0.44, 0.12)
			o.pole[1] = Vector3(1, -1, 0.1)
			o.hand[0] = Vector3(-0.24, 0.32, -0.1)
			o.pole[0] = Vector3(1, 0.6, 0.5)
			o.knee[0] = 0.0
			o.knee[1] = 0.5
			o.tap = 0.3 * sin(t * 6.0)
		"thumbs":
			# sat right up, both thumbs up, pumping them
			var pump := maxf(0.0, sin(t * 5.0))
			o.th = 1.0
			o.nod = 0.12 + 0.14 * pump
			o.tilt = 0.06 * sin(t * 2.5)
			for s in 2:
				o.hand[s] = Vector3(0.05, -0.3 + 0.07 * pump, 0.38 + 0.05 * pump)
				o.pole[s] = Vector3(0.8, -1, -0.2)
			o.knee[0] = 0.55
			o.knee[1] = 0.55
		"wave":
			# a big wave to the crowd, the other hand on its belly, ankles crossed
			o.th = 0.75
			o.nod = 0.18
			o.tilt = 0.12 * sin(t * 7.0)
			o.hand[1] = Vector3(0.18 + 0.15 * sin(t * 7.0), 0.55, 0.12)
			o.pole[1] = Vector3(1, -0.2, -0.3)
			o.hand[0] = Vector3(-0.18, -0.32, 0.22)
			o.pole[0] = Vector3(1, 0, -0.2)
			o.knee[0] = 0.05
			o.knee[1] = 0.05
			o.ankles = 1.0
			o.tap = 0.35 * sin(t * 3.5)
		"chill":
			# lying back, hands behind its head, one ankle up on the other knee, foot tapping
			o.th = 0.3
			o.nod = 0.3
			o.tilt = 0.14 * sin(t * 1.6)
			for s in 2:
				o.hand[s] = Vector3(-0.24, 0.34, -0.12)
				o.pole[s] = Vector3(1, 0.5, 0.5)
			o.knee[0] = 0.0
			o.knee[1] = 0.85
			o.cross = 1.0
			o.tap = 0.45 * sin(t * 6.0)
		"disco":
			# sat up, disco pointing: up and out, then down across, to the beat; other hand on its hip
			var k := _smooth(-0.5, 0.5, sin(t * 4.2))
			o.th = 0.9
			o.nod = 0.12 + 0.12 * absf(sin(t * 4.2))
			o.tilt = 0.22 * (k - 0.5)
			o.hand[1] = Vector3(-0.35 + 0.65 * k, -0.4 + 0.85 * k, 0.32 - 0.12 * k)
			o.pole[1] = Vector3(1, -0.6 + 0.6 * k, 0.2)
			o.hand[0] = Vector3(0.12, -0.42, 0.05)
			o.pole[0] = Vector3(1, 0, -0.5)
			o.knee[0] = 0.35 + 0.1 * k
			o.knee[1] = 0.45 - 0.1 * k
			o.tap = 0.4 * sin(t * 8.4)


static func _lerp_pose(a: Pose, b: Pose, k: float, o: Pose) -> void:
	o.th = lerpf(a.th, b.th, k)
	o.nod = lerpf(a.nod, b.nod, k)
	o.tilt = lerpf(a.tilt, b.tilt, k)
	for s in 2:
		o.hand[s] = a.hand[s].lerp(b.hand[s], k)
		o.pole[s] = a.pole[s].lerp(b.pole[s], k)
		o.knee[s] = lerpf(a.knee[s], b.knee[s], k)
	o.cross = lerpf(a.cross, b.cross, k)
	o.ankles = lerpf(a.ankles, b.ankles, k)
	o.tap = lerpf(a.tap, b.tap, k)


## Swap sides (the bit's main arm is gone: the other one does it).
static func _mirror_pose(p: Pose) -> void:
	var h := p.hand[0]
	p.hand[0] = p.hand[1]
	p.hand[1] = h
	var q := p.pole[0]
	p.pole[0] = p.pole[1]
	p.pole[1] = q
	p.tilt = -p.tilt


## Two-bone IK: from `a` towards `target`, the middle joint bent towards `pole` (a direction).
## Returns [mid, end].
static func _ik(a: Vector3, target: Vector3, l1: float, l2: float, pole: Vector3) -> Array:
	var d := target - a
	var len := maxf(1e-4, d.length())
	d /= len
	var dist := minf(maxf(len, absf(l1 - l2) + 0.02), (l1 + l2) * 0.998)
	var end := a + d * dist
	var x := (l1 * l1 - l2 * l2 + dist * dist) / (2.0 * dist)
	var h := sqrt(maxf(0.0, l1 * l1 - x * x))
	var w := pole - d * pole.dot(d)
	if w.length_squared() < 1e-6:
		w = Vector3(0, 1, 0) - d * d.y
	w = w.normalized()
	return [a + d * x + w * h, end]


## The fight is over: send the stretcher for the match's loser. `mv` is the frame's view of the
## match (SimView.MatchView), `body` the loser's sim body (its rest lengths), `result` the match's.
func begin(mv, body, result, loser_: int) -> void:
	clear()
	on = true
	loser = loser_
	var f = mv.fighters[loser_]
	ride = pick_ride(float(mv.seed_), loser_)
	_size = float(f.size_)
	var s := _size
	# the bot's real limb lengths (the rig is built in unit space)
	var rest := func(a: int, b: int, d: float) -> float:
		var r: float = body.restBetween(float(a), float(b))
		return r / s if r >= 0.0 else d
	_len = {"ua": rest.call(J_SH_R, J_EL_R, 0.28), "fa": rest.call(J_EL_R, J_HAND_R, 0.27), "th": rest.call(J_HIP_R, J_KNEE_R, 0.4), "sh": rest.call(J_KNEE_R, J_FOOT_R, 0.4)}
	var parts = f.parts
	_has_hand = [not parts.armOut(0.0), not parts.armOut(1.0)]
	# the bit's main hand is the right; with that arm gone the left does it
	_mirrored = not _has_hand[1] and _has_hand[0]
	var two := ride == "thumbs"
	var main: String = {"peace": "v", "thumbs": "thumb", "wave": "open", "disco": "point"}.get(ride, "none")
	_signs = [main, main if two else "none"] if _mirrored else [main if two else "none", main]
	_glyph = 1 if ride == "chill" or ride == "disco" else 2 if ride == "thumbs" or ride == "wave" else 0
	var spec = mv.specs[loser_]
	var gc: int = 0xff5c9a if _glyph == 0 else int(spec.paint.accent) if _glyph == 1 else 0xffd34d
	_glyph_col = Color.hex((gc << 8) | 0xff) * Fx.glow(1.5)
	_glyph_col.a = 1.0
	var frames: Array = TPaint.FRAMES
	var fr = frames[int(spec.paint.frame)] if int(spec.paint.frame) < frames.size() else frames[0]
	_finger_mat.albedo_color = Color.hex((int(fr.metal) << 8) | 0xff)
	_finger_mat.metallic = float(fr.m)
	_finger_mat.roughness = float(fr.r)
	puppet = RidePuppet.new()
	puppet.parts = parts
	puppet.index = float(loser_)
	# straight down the walkout carpet on the loser's side, and through the gate in its tunnel
	_side = 1.0 if f.body.pos[J_PELVIS].x >= 0.0 else -1.0
	_x0 = 8.0
	# (done once its foot end is through the gate)
	_x1 = AX + TUNNEL_GATE + 1.95 * s
	# the wide shot: from back down the carpet, a little off to one side and up
	_wide = Vector3(_side * 8.6, FLOOR + 1.9, -0.6)
	_hold = HOLD_DECISION if str(result) == "Decision" else HOLD_KO
	visible = false
	posed = false
	_took = false
	_shot_no = -1
	_t = -1.0


## Done (or a new fight): put everything away. Held pieces stay with the debris, which owns them.
func clear() -> void:
	on = false
	posed = false
	shot = {}
	_pieces.clear()
	visible = false
	for b in _bubbles:
		b.visible = false


## Still on its way (the results wait for it).
func busy() -> bool:
	return on and _t < _hold + RIDE


## Gone down the tunnel: the loser's model stays hidden from here on.
func gone() -> bool:
	return on and _t >= _hold + RIDE


## Move everything to match time `t` (seconds since the fight ended). `dt` is how much match time
## passed this frame (0 while paused), for the bits that just drift.
func update(t: float, dt: float, model: BotModel, debris: FxDebris, sfx, quiet: bool) -> void:
	if not on:
		return
	var prev := _t
	_t = t
	var rt := t - _hold
	if rt < 0.0 or rt >= RIDE:
		# the victory still playing (the loser lies where it fell), or the ride's over
		visible = false
		posed = false
		shot = {}
		if rt >= RIDE:
			for r in _pieces:
				r.obj.visible = false
			for b in _bubbles:
				b.visible = false
		return
	visible = true
	var s := _size
	# ---- where the stretcher is: already under way when the scene cuts in, gathering speed
	var k := rt / RIDE
	var u := k * (0.72 + 0.28 * k)
	var sx := _side
	var p := Vector3(sx * (_x0 + (_x1 - _x0) * u), FLOOR + HOVER * s + sin(t * 2.3) * 0.025, 0.0)
	# a lazy sway down the carpet
	p.z = sin(t * 0.7) * 0.12 * (1.0 - _smooth(_x1 - 4.0, _x1 - 2.5, sx * p.x))
	var yaw := (PI / 2.0 if sx > 0.0 else -PI / 2.0) + cos(t * 0.7) * 0.06
	var pitch := sin(t * 1.3) * 0.015
	var roll := sin(t * 1.7) * 0.025
	at = p
	_rig_xf = Transform3D(Basis.from_euler(Vector3(pitch, yaw, roll), EULER_ORDER_YXZ).scaled(Vector3(s, s, s)), p)
	_rig.transform = _rig_xf
	puppet.faceYaw = yaw
	# hover pool on the floor below (the hall's floor too), glow pulse, thrusters up at the end
	var in_hall := absf(p.x) > AX - 0.7 and absf(p.z) < TUNNEL_OPEN_HW
	var ground := FLOOR if in_hall else FxDebris.ground_at(p.x, p.z)
	_pool.position = Vector3(p.x, ground + 0.012, p.z)
	_pool.scale = Vector3.ONE * 2.6 * s
	_pool_mat.set_shader_parameter("opacity", 0.55 * maxf(0.0, 1.0 - (p.y - ground) / 3.2))
	_glow_mat.set_shader_parameter("k", Fx.glow(2.2 + 0.4 * sin(t * 9.0) + 1.2 * _smooth(RIDE - 3.0, RIDE - 1.0, rt)))
	# ---- the loser, already into its bit (with its torn parts aboard), then waving goodbye
	ride_pose(ride, rt + 1.0, _a)
	ride_pose("wave", rt - BYE, _b)
	if _mirrored:
		_mirror_pose(_a)
		_mirror_pose(_b)
	_lerp_pose(_a, _b, 0.0 if ride == "wave" else _smooth(BYE, BYE + 0.8, rt), _cur)
	_back.rotation.x = -_cur.th
	puppet.state = "ready"
	var crossed := func(x: float) -> bool: return not quiet and prev >= 0.0 and prev < x and t >= x
	if sfx != null:
		if crossed.call(_hold):
			sfx.stretcher("depart")
		if crossed.call(_hold + 0.3):
			sfx.stretcher("cheer")
		# a chime as it goes through the gate
		var gate_at := (AX + TUNNEL_GATE - _x0) / (_x1 - _x0)
		if crossed.call(_hold + RIDE * ((-0.72 + sqrt(0.72 * 0.72 + 4.0 * 0.28 * gate_at)) / (2.0 * 0.28))):
			sfx.stretcher("arrive")
	if crossed.call(_hold + 0.3):
		_puff = 0.0
	_deck_pose(_cur)
	posed = true
	if not _took:
		_took = true
		_hold_pieces(debris)
	_move_pieces()
	# ---- happy bubbles
	_bubble_up(rt, dt, model)
	# ---- the camera
	_film(rt, dt, yaw)


## Joints for pose `pp` on the deck, in world space (stretcher.ts deckPose).
func _deck_pose(pp: Pose) -> void:
	var L := _len
	var J := joints
	var th := pp.th
	# the bot's frame on the deck: spine up the backrest, front facing away from it
	var up := Vector3(0, sin(th), cos(th))
	var fw := Vector3(0, cos(th), -sin(th))
	var rt := up.cross(fw)
	var pel := Vector3(0, 0.03 + maxf(0.2 * cos(th), 0.17), ZP - 0.2 * sin(th))
	J[J_PELVIS] = pel
	var chest := pel + up * 0.42
	J[J_CHEST] = chest
	var neck := chest + up * 0.22
	J[J_NECK] = neck
	var hd := (up * cos(pp.nod) + fw * sin(pp.nod) + rt * pp.tilt).normalized()
	J[J_HEAD] = neck + hd * 0.21
	# arms
	for side in 2:
		var sg := -1.0 if side == 0 else 1.0
		var sh := chest + up * 0.1 + rt * (0.31 * sg)
		J[J_SH_L if side == 0 else J_SH_R] = sh
		var h := pp.hand[side]
		var pl := pp.pole[side]
		var target := sh + rt * (h.x * sg) + up * h.y + fw * h.z
		var pole := rt * (pl.x * sg) + up * pl.y + fw * pl.z
		var r := _ik(sh, target, L.ua, L.fa, pole)
		J[J_EL_L if side == 0 else J_EL_R] = r[0]
		J[J_HAND_L if side == 0 else J_HAND_R] = r[1]
	# legs: along the deck, knees drawn up, crossed at the ankles or an ankle up on a knee
	var leg_len: float = L.th + L.sh
	for side in [1, 0]:
		var sg := -1.0 if side == 0 else 1.0
		var hip := pel + rt * (0.15 * sg) + up * -0.07
		J[J_HIP_L if side == 0 else J_HIP_R] = hip
		var kn := pp.knee[side]
		var w := Vector3(hip.x, 0.09, hip.z - leg_len * (0.97 - 0.42 * kn))
		# crossed at the ankles: each foot over to the other leg's line
		w += rt * (-sg * 0.19 * pp.ankles)
		w.y += 0.05 * pp.ankles * (1.0 if side == 1 else 0.0)
		if side == 0 and pp.cross > 0.0:
			# left ankle onto the right knee
			w = w.lerp(J[J_KNEE_R] + Vector3(0.05, 0.11, 0.02), pp.cross)
		w.y += maxf(0.0, pp.tap) * 0.06 if side == 0 else 0.0
		# knees up, and a little out (well out for the leg that's crossed over)
		var pole := Vector3(0, 1, 0) + rt * (sg * (0.15 + (0.5 * pp.cross if side == 0 else 0.0)))
		var r := _ik(hip, w, L.th, L.sh, pole)
		J[J_KNEE_L if side == 0 else J_KNEE_R] = r[0]
		J[J_FOOT_L if side == 0 else J_FOOT_R] = r[1]
		puppet.footFlex[side] = 0.25 + (pp.tap if side == 0 else -pp.tap * 0.5) * 0.6
	# into the world, with the deck
	for i in 16:
		J[i] = _rig_xf * J[i]


func _hold_pieces(debris: FxDebris) -> void:
	if debris == null:
		return
	var held: Array = debris.hold(loser)
	# aboard, each keeps the way up it lay in, turned with the deck
	var inv := _rig_xf.basis.get_rotation_quaternion().inverse()
	for i in held.size():
		var hp: Dictionary = held[i]
		var sl: Array = SLOTS[i % SLOTS.size()]
		var obj: Node3D = hp.obj
		_pieces.append({
			"obj": obj,
			"ql": inv * obj.quaternion,
			"slot": Vector3(sl[0], float(hp.lift) / _size * 0.9, sl[1] + (0.1 if i >= SLOTS.size() else 0.0)),
		})


func _move_pieces() -> void:
	var q := _rig_xf.basis.get_rotation_quaternion()
	for r in _pieces:
		var o: Node3D = r.obj
		if not is_instance_valid(o):
			continue
		o.visible = true
		o.position = _rig_xf * (r.slot as Vector3)
		o.quaternion = q * (r.ql as Quaternion)


## Lay the finger signs on the model's hands (after it's posed: contacts move the hands).
func dress(model: BotModel) -> void:
	var n := 0
	var mm := _fingers.multimesh
	if posed:
		var P := model.joints
		var s := _size
		# the bot's right and up, from its shoulders and spine
		var rt := (P[J_SH_R] - P[J_SH_L]).normalized()
		var up := (P[J_NECK] - P[J_PELVIS]).normalized()
		for side in 2:
			# waving goodbye at the end: an open hand
			var bye := ride != "wave" and _t - _hold > BYE + 0.4
			var sign: String = ("open" if side == (0 if _mirrored else 1) else "none") if bye else _signs[side]
			if sign == "none" or not _has_hand[side]:
				continue
			var hand := P[J_HAND_L if side == 0 else J_HAND_R]
			var fw := (hand - P[J_EL_L if side == 0 else J_EL_R]).normalized()
			# spread across the hand
			var w := (rt - fw * rt.dot(fw)).normalized()
			if sign == "point":
				n = _finger(mm, n, hand + fw * (0.05 * s), fw, s * 1.1)
			elif sign == "v":
				# up off the hand, between the forearm and the spine
				var pl := (fw + up).normalized()
				w = (rt - pl * rt.dot(pl)).normalized()
				for kk: float in [-1.0, 1.0]:
					var d := (pl + w * (kk * 0.32)).normalized()
					n = _finger(mm, n, hand + fw * (0.05 * s) + w * (kk * 0.018 * s), d, s)
			elif sign == "thumb":
				# straight up off the top of the fist
				var d := (up - fw * up.dot(fw)).normalized()
				n = _finger(mm, n, hand + d * (0.045 * s), d, s)
			else:
				for i in 4:
					var kk := (i - 1.5) / 1.5
					var d := (fw + w * (kk * 0.28)).normalized()
					n = _finger(mm, n, hand + fw * (0.06 * s) + w * (kk * 0.045 * s), d, s)
				# thumb off the inside
				var sg := 1.0 if side == 0 else -1.0
				var d := (fw + w * (sg * 1.3)).normalized()
				n = _finger(mm, n, hand + w * (sg * 0.06 * s), d, s * 0.85)
	mm.visible_instance_count = n
	_fingers.visible = n > 0


func _finger(mm: MultiMesh, i: int, base: Vector3, dir: Vector3, s: float) -> int:
	if i >= mm.instance_count:
		return i
	var q := Quaternion(Vector3.UP, dir) if absf(dir.dot(Vector3.UP)) < 0.9999 else (Quaternion.IDENTITY if dir.y > 0.0 else Quaternion(Vector3.RIGHT, PI))
	mm.set_instance_transform(i, Transform3D(Basis(q).scaled(Vector3(s, s, s)), base + dir * (0.054 * s)))
	return i + 1


## Hearts (or notes, or stars) drifting up off its head while it's happy.
func _bubble_up(rt: float, dt: float, model: BotModel) -> void:
	var happy := rt > 0.3 and rt < RIDE - 0.6
	if happy and dt > 0.0:
		_puff -= dt
		if _puff <= 0.0:
			_puff = 0.3 if ride == "peace" else 0.42
			for i in _bubbles.size():
				if _bubbles[i].visible:
					continue
				var s := _bubbles[i]
				var b: Dictionary = _bub[i]
				s.visible = true
				b.age = 0.0
				b.life = 1.4 + randf() * 0.5
				b.vx = (randf() - 0.5) * 0.3
				b.vz = (randf() - 0.5) * 0.3
				b.ph = randf() * 6.0
				s.position = model.joints[J_HEAD] + Vector3((randf() - 0.5) * 0.3, 0.2, (randf() - 0.5) * 0.3) * _size
				s.region_rect = Rect2(_glyph * 64, 0, 64, 64)
				s.modulate = _glyph_col
				break
	for i in _bubbles.size():
		var s := _bubbles[i]
		if not s.visible:
			continue
		var b: Dictionary = _bub[i]
		b.age += dt
		var k: float = b.age / b.life
		if k >= 1.0:
			s.visible = false
			continue
		s.position.x += (b.vx + sin(b.age * 5.0 + b.ph) * 0.15) * dt
		s.position.z += b.vz * dt
		s.position.y += 0.55 * dt
		var sc: float = 0.16 * _size * minf(1.0, k * 5.0) * (1.0 + 0.15 * sin(b.age * 9.0 + b.ph))
		s.scale = Vector3(sc, sc, 1.0)
		s.modulate.a = 1.0 - _smooth(0.6, 1.0, k)


## Two shots: following it down the carpet from just behind (it rides head first, facing back down
## the deck at us), then from back down the carpet, watching it go into the tunnel.
func _film(rt: float, dt: float, yaw: float) -> void:
	var s := _size
	var no := 0 if rt < WIDE else 1
	var cut := _shot_no != no
	_shot_no = no
	var pos: Vector3
	var look: Vector3
	var fov_k: float
	if no == 0:
		var cy := cos(yaw)
		var sy := sin(yaw)
		# (x across, z along the way it's going)
		var local := func(x: float, y: float, z: float) -> Vector3:
			return Vector3(at.x + x * cy + z * sy, at.y + y, at.z - x * sy + z * cy)
		var push := _smooth(0.0, WIDE, rt)
		pos = local.call((0.8 - 0.25 * push) * s, (0.85 - 0.1 * push) * s, (-2.95 + 0.45 * push) * s)
		look = local.call(0.0, 0.48 * s, 0.15 * s)
		fov_k = 0.85
	else:
		pos = _wide
		look = at + Vector3(0, 0.45 * s, 0)
		fov_k = 0.8 - 0.32 * _smooth(WIDE, RIDE, rt)
	if cut:
		_cam_pos = pos
		_cam_look = look
	elif dt > 0.0:
		_cam_pos = Vector3(_damp(_cam_pos.x, pos.x, 5.0, dt), _damp(_cam_pos.y, pos.y, 5.0, dt), _damp(_cam_pos.z, pos.z, 5.0, dt))
		_cam_look = Vector3(_damp(_cam_look.x, look.x, 6.0, dt), _damp(_cam_look.y, look.y, 6.0, dt), _damp(_cam_look.z, look.z, 6.0, dt))
	shot = {"pos": _cam_pos, "look": _cam_look, "fov_k": fov_k, "cut": cut}
