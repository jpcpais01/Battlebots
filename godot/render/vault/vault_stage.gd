## The Skin Vault's own place (app/gacha/vault_screen.gd): a bank vault after dark. Walls of
## safe-deposit boxes with their little status lights, neon strips along the floor and over the
## boxes, a polished black stone floor, and the player's robot in the middle of a brass combination
## dial inlaid in it. Behind it, set in the back wall, the vault's great round door: machined steel
## with a spoked wheel, a ring of locking bolts round its edge and a neon ring round its frame,
## under the SKIN VAULT sign, between two alarm beacons; a status panel beside it says what the
## vault is doing. Inside, a steel tube lined with glowing display pods, blazing at its far end.
## Shafts of light fall through the haze onto the robot and the door with dust drifting in them,
## pallets of gold bars sit either side of the door, a security camera pans the room from each back
## corner (it follows the pod once a pull is on), and today's featured Epic turns in a glass case
## on a plinth under its own spot.
## Game builds it the first time the world goes to "vault" (Game.PLACES) and calls enter(game),
## exit() and update(dt, time) round it: it lights the world its own way meanwhile
## (HomeStage.HomeLook) and flies its own camera (the director's "scene" mode).
##
## The pulls play out here (app/gacha/pull_show.gd drives them and puts the words and buttons
## over them). play(results, spec): the robot steps aside and the camera flies to the door. Its
## wheel spins, the bolts shoot back, it unseals in a gust of steam and swings open, and light
## pours out across the floor. One pull: a pod glides out of the vault down the lit lane, hovers,
## rises and charges. A Common stays calm; a Rare breaks violet through its seam and the room's
## neon turns with it; an Epic sets the vault off: alarms, red beacons sweeping the walls, a grid
## of lasers snapping on across the room, every box light blinking red, until it bursts and
## everything turns gold under a shower of coins. Then the camera cuts to the robot as a beam of
## light paints the skin onto it, god rays in its rarity's colour wheeling behind it (grander the
## rarer) and sparks rising round it. The gliding pod leaves a trail: pale, or violet for a Rare or
## better (an Epic keeps its secret till the charge). Ten: ten pods fly out of the door onto pads in an arc and pop
## one after another into hovering lights in their rarity's colour, an Epic tripping the alarm
## first. Each moment is told through `beat`. When the pull is done the door swings shut again.
class_name VaultStage
extends Node3D

## A moment of a pull: "burst" (the tier), "reveal" (the result shown on the robot), "pop"
## ([index, tier]), "cards" (the ten have all popped), "robot" (a skin shown on the robot).
signal beat(what: String, data)

## The middle of the door's round opening in the back wall; the door's radius, the opening's, the
## door's thickness.
const DOOR := Vector3(-0.2, 2.95, -11.0)
const DOOR_R := 2.5
const OPEN_R := 2.62
const DOOR_T := 0.8
## How far the door swings open (radians), on its hinge at the left.
const SWING := 1.75
## The room: half its width and depth (the robot in the middle), and its height.
const ROOM := 11.0
const ROOM_H := 8.0
## Where a single pull's pod stops (on the floor) and how high it hovers there; how high the ten
## hover over their pads.
const HERO := Vector3(-0.2, 0.0, -5.4)
const HOVER := 1.0
const HOVER_TEN := 0.78
## A pod: radius, half its length, half its glass band.
const POD_R := 0.24
const POD_LEN := 0.5
const POD_GLASS := 0.26
## The bolts round the door's edge; the pods on the vault's racks.
const BOLTS := 16
const RACK := 12
## How long a pod charges before it bursts, by the rarity inside.
const CHARGE := [1.15, 1.8, 3.0]
## The pods' anodised cap colours (sRGB).
const TOPS := [0xff3b5c, 0xffc23d, 0x3fa9ff, 0x45e08a, 0xff6ad5, 0x9b6bff, 0xff8a2a, 0x2ee6d6]
## The security lasers across the room: z, height, tilt (about the beam's normal), turn (about y).
const LASERS := [
	[-9.4, 0.55, 0.1, 0.05], [-8.5, 1.85, -0.14, -0.08], [-7.6, 0.95, 0.22, 0.12], [-6.8, 2.7, -0.06, 0.0],
	[-4.5, 0.45, -0.18, -0.1], [-3.8, 1.55, 0.12, 0.15], [-3.0, 2.45, -0.25, 0.05],
]
## The room's neon (linear, HDR): magenta low along the floor and down the pilasters, cyan over
## the boxes and along the lane.
const NEON_A := Vector3(1.0, 0.1, 0.55)
const NEON_B := Vector3(0.1, 0.72, 1.0)
const RED := Vector3(1.0, 0.035, 0.02)
const GOLD := Vector3(1.0, 0.6, 0.12)
const GREEN := Vector3(0.12, 1.0, 0.35)
const AMBER := Vector3(1.0, 0.45, 0.05)
## The vault's light (HomeStage.HomeLook): a dark room, a cool key over the robot, a magenta rim
## behind and a cyan one at the side.
const LOOK := {
	"background": 0x050409, "fog": 0x140c22, "fogDensity": 0.006, "envIntensity": 0.8,
	"hemi": {"sky": 0x5a6290, "ground": 0x1c1024, "intensity": 0.7},
	"key": {"color": 0xf2f0ff, "intensity": 3.4, "pos": [1.4, 5.2, 3.4], "target": [0, 0.9, 0], "angle": 0.6, "penumbra": 0.7, "near": 0.5, "far": 10},
	"rims": [
		{"color": 0xff4fd8, "intensity": 16, "distance": 9, "pos": [-2.3, 2.7, -1.8]},
		{"color": 0x3fe0ff, "intensity": 14, "distance": 9, "pos": [2.4, 2.3, -1.2]},
	],
}

var game: Game
var sound := GachaSound.new()
## The idle camera's turn round the robot (the screen's drag), and how far the picture slides
## right of the panel.
var yaw := 0.2
var idle_shift := -0.24
## What's playing: "idle", "single", "ten", "reveal" (a skin on the robot), "orbs" (the ten popped).
var mode := "idle"
## Held still (the shot tests step it themselves with step()).
var paused := false

var _active := false
## Whether the robot is on its turntable (it steps aside while the vault plays; a new showcase
## built meanwhile is put away too).
var _robot_on := true
var _look := HomeStage.HomeLook.new()
var _sky: Sky
var _floor_mat: ShaderMaterial
var _wall_mat: ShaderMaterial
var _tunnel_mat: ShaderMaterial
var _cap_mat: ShaderMaterial
var _ring_mat: ShaderMaterial
var _sign_bar: ShaderMaterial
var _status: Label3D
var _status_text := ""

## The door: its hinge (pulls out and swings), the door itself, its wheel, its bolts.
var _hinge: Node3D
var _wheel: Node3D
var _bolts: MultiMesh
var _steam: CPUParticles3D
var _spill: OmniLight3D
var _inner: OmniLight3D
## The door's state: the wheel's turn and spin, the bolts (1 drawn back), unsealed (1 pulled out),
## open (1 swung wide).
var _wheel_a := 0.0
var _wheel_v := 0.0
var _bolt := 0.0
var _pull := 0.0
var _swing := 0.0
var _open := 0.0

## The alarm: its beacons (a turning head with two beams and a spot light each), the lasers.
var _beacons: Array[Node3D] = []
var _beacon_mat: ShaderMaterial
var _beam_ray: ShaderMaterial
var _alarm_spots: Array[SpotLight3D] = []
## The alarm's red pulse over the whole room.
var _alarm_light: OmniLight3D
var _lasers: Array[MeshInstance3D] = []
var _laser_core: ShaderMaterial
var _laser_glow: ShaderMaterial
## How tripped the alarm is (0..1) and where it's going; how golden the room is (an Epic out);
## the rarity colour the room's neon is turning to, and how far; the lasers' level.
var _alarm := 0.0
var _alarm_to := 0.0
var _alarm_next := 0.0
var _gold := 0.0
var _gold_to := 0.0
var _gold_until := -1.0
var _tint := Vector3.ONE
var _tint_k := 0.0
var _tint_to := 0.0
var _laser := 0.0
var _laser_to := 0.0
var _laser_on := 0

var _pod_mesh: CapsuleMesh
var _hero: MeshInstance3D
var _hero_mat: ShaderMaterial
var _halves: Array[MeshInstance3D] = []
var _halves_v: Array[Vector3] = []
var _halves_w: Array[Vector3] = []
var _ten: Array[MeshInstance3D] = []
var _ten_mat: Array[ShaderMaterial] = []
var _orbs: Array[MeshInstance3D] = []
var _orb_mat: Array[ShaderMaterial] = []
var _halo_mat: Array[ShaderMaterial] = []
var _burst_light: OmniLight3D
var _shock: MeshInstance3D
var _shock_mat: ShaderMaterial
var _beam: MeshInstance3D
var _beam_mat: ShaderMaterial
var _confetti: CPUParticles3D
var _coins: CPUParticles3D
## The reveal's glory: god rays wheeling behind the robot (in the skin's rarity colour, `_aura_lvl`
## by rarity, eased in by `_aura_k`, its ring racing out `_aura_t`), sparks rising round it.
var _aura: MeshInstance3D
var _aura_mat: ShaderMaterial
var _aura_k := 0.0
var _aura_lvl := 0.0
var _aura_col := Vector3.ONE
var _aura_t := 1.0
var _motes: CPUParticles3D
## The trail of light a single pull's pod leaves as it glides out of the vault.
var _trail: CPUParticles3D

## The room's dressing: shafts of light from the ceiling (the one on the robot takes a reveal's
## colour), dust drifting in them, the security cameras (their heads, their red lights), the
## featured skin turning in its display case.
var _shaft_mat: ShaderMaterial
var _shaft_door: ShaderMaterial
var _haze: CPUParticles3D
var _cams: Array[Node3D] = []
var _cam_led: ShaderMaterial
var _feat: MeshInstance3D
var _feat_mat: ShaderMaterial
var _feat_id := ""
var _feat_name: Label3D
var _feat_tag: Label3D
var _feat_light: SpotLight3D

## The camera: where it is, what it looks at, the lens (x the screen's base), how tightly it
## follows (100+: exactly), a cut this frame.
var _cam_pos := Vector3(2.2, 1.3, 4.6)
var _cam_look := Vector3(0, 1.4, 0)
var _cam_fov := 1.0
var _cam_lambda := 3.0
var _cut := true

var _results: Array = []
var _spec = null
var _tier := 0
var _t := 0.0
var _time := 0.0
var _flash := 0.0
var _flash_col := Vector3.ONE
var _pulse := -1.0
var _beam_t := -1.0
var _shock_t := -1.0
var _shown_tier := 0
var _cracked := [false, false]
var _done_beats := {}
var _pops := 0
var _pod_glow := Vector3.ZERO
var _pads := 0.0
var _rng := RandomNumberGenerator.new()
## A ten-pull's pads (on the floor), and each pod's pop time (-1 not yet).
var _slots: Array[Vector3] = []
var _pop_at: Array[float] = []


func _init() -> void:
	name = "vault"
	visible = false
	_rng.randomize()
	add_child(sound)
	_build_room()
	_build_door()
	_build_vault()
	_build_alarm()
	_build_dressing()
	_build_pull_props()
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = preload("res://render/vault/vault_env.gdshader")
	sky_mat.set_shader_parameter("intensity", LOOK.envIntensity)
	_sky = Sky.new()
	_sky.sky_material = sky_mat
	_sky.process_mode = Sky.PROCESS_MODE_QUALITY
	_sky.radiance_size = Sky.RADIANCE_SIZE_128
	_room_tick(0.0, true)


# ------------------------------------------------------------------------------ building

static func _lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


static func _v(c: Color) -> Vector3:
	return Vector3(c.r, c.g, c.b)


func _mesh(m: Mesh, mat: Material, at := Vector3.ZERO, parent: Node = null) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.position = at
	(parent if parent != null else self).add_child(mi)
	return mi


func _std(hex: int, metal: float, rough: float, emit := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color.hex((hex << 8) | 0xff)
	m.metallic = metal
	m.roughness = rough
	m.metallic_specular = 0.6
	if emit > 0.0:
		m.emission_enabled = true
		m.emission = Color.hex((hex << 8) | 0xff)
		m.emission_energy_multiplier = emit
	return m


func _neon(col: Vector3, energy := 3.0) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/vault/vault_neon.gdshader")
	m.set_shader_parameter("color", col)
	m.set_shader_parameter("color2", col)
	m.set_shader_parameter("energy", energy)
	return m


func _steel(hex: int, rough: float, grooves := 2.2) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/vault/vault_steel.gdshader")
	m.set_shader_parameter("base", Color.hex((hex << 8) | 0xff))
	m.set_shader_parameter("rough", rough)
	m.set_shader_parameter("grooves", grooves)
	return m


static func _torus(r: float, tube: float, rings: int, segs: int) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = r - tube
	t.outer_radius = r + tube
	t.rings = rings
	t.ring_segments = segs
	return t


static func _cyl(r: float, h: float, segs: int, r2 := -1.0) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = r
	c.bottom_radius = r if r2 < 0.0 else r2
	c.height = h
	c.radial_segments = segs
	c.rings = 1
	return c


## A soft round dot (white, fading to clear at its edge) for the haze and the sparks.
static func _soft_tex() -> GradientTexture2D:
	var soft := GradientTexture2D.new()
	soft.fill = GradientTexture2D.FILL_RADIAL
	soft.fill_from = Vector2(0.5, 0.5)
	soft.fill_to = Vector2(0.5, 0.0)
	soft.width = 64
	soft.height = 64
	var sg := Gradient.new()
	sg.set_color(0, Color(1, 1, 1, 1))
	sg.set_color(1, Color(1, 1, 1, 0))
	soft.gradient = sg
	return soft


## Glowing specks for particles: a soft dot `size` across, added over the scene in the particle's
## colour.
static func _speck(size: float) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	var m := StandardMaterial3D.new()
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.albedo_texture = _soft_tex()
	q.material = m
	return q


func _shadowless(mi: GeometryInstance3D) -> GeometryInstance3D:
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


## The floor, the four walls (the back one with the door's opening cut out) and the ceiling.
func _build_room() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(ROOM * 2.0, ROOM * 2.0)
	_floor_mat = ShaderMaterial.new()
	_floor_mat.shader = preload("res://render/vault/vault_floor.gdshader")
	_floor_mat.set_shader_parameter("door", DOOR)
	_floor_mat.set_shader_parameter("door_r", OPEN_R)
	_floor_mat.set_shader_parameter("half_w", ROOM)
	_shadowless(_mesh(pm, _floor_mat))
	_wall_mat = ShaderMaterial.new()
	_wall_mat.shader = preload("res://render/vault/vault_wall.gdshader")
	_wall_mat.set_shader_parameter("hole", Vector4(DOOR.x, DOOR.y, DOOR.z, OPEN_R))
	var q := QuadMesh.new()
	q.size = Vector2(ROOM * 2.0, ROOM_H)
	for w in [[Vector3(0, ROOM_H * 0.5, -ROOM), 0.0], [Vector3(0, ROOM_H * 0.5, ROOM), PI], [Vector3(-ROOM, ROOM_H * 0.5, 0), PI * 0.5], [Vector3(ROOM, ROOM_H * 0.5, 0), -PI * 0.5]]:
		var mi := _mesh(q, _wall_mat, w[0])
		mi.rotation.y = w[1]
		_shadowless(mi)
	var c := QuadMesh.new()
	c.size = Vector2(ROOM * 2.0, ROOM * 2.0)
	var ceil := _mesh(c, _wall_mat, Vector3(0, ROOM_H, 0))
	ceil.rotation.x = PI * 0.5
	_shadowless(ceil)
	# the sign over the door, a neon bar under it
	var l := Label3D.new()
	l.text = "SKIN VAULT"
	l.font = MenuKit.broadcast(400)
	l.font_size = 200
	l.pixel_size = 0.0052
	l.outline_size = 34
	l.modulate = Color(2.8, 1.2, 2.4)
	l.outline_modulate = Color(0.85, 0.05, 0.6, 1.0)
	l.shaded = false
	l.double_sided = false
	l.position = Vector3(DOOR.x, 6.75, -ROOM + 0.06)
	add_child(l)
	var bar := BoxMesh.new()
	bar.size = Vector3(5.4, 0.05, 0.04)
	_sign_bar = _neon(NEON_B, 3.0)
	_shadowless(_mesh(bar, _sign_bar, Vector3(DOOR.x, 6.05, -ROOM + 0.04)))
	# the status panel beside the door
	var panel := BoxMesh.new()
	panel.size = Vector3(2.3, 0.62, 0.1)
	_mesh(panel, _std(0x0b0b10, 0.7, 0.3), Vector3(DOOR.x + 4.75, 2.35, -ROOM + 0.05))
	var frame := BoxMesh.new()
	frame.size = Vector3(2.42, 0.74, 0.06)
	_mesh(frame, _std(0x8a6a34, 1.0, 0.25), Vector3(DOOR.x + 4.75, 2.35, -ROOM + 0.02))
	_status = Label3D.new()
	_status.font = MenuKit.broadcast(400)
	_status.font_size = 72
	_status.pixel_size = 0.0036
	_status.outline_size = 0
	_status.shaded = false
	_status.double_sided = false
	_status.position = Vector3(DOOR.x + 4.75, 2.35, -ROOM + 0.11)
	add_child(_status)
	# a keypad under it: a dark plate with a grid of lit keys
	var pad := BoxMesh.new()
	pad.size = Vector3(0.5, 0.66, 0.08)
	_mesh(pad, _std(0x15151b, 0.8, 0.3), Vector3(DOOR.x + 4.75, 1.45, -ROOM + 0.04))
	var key := BoxMesh.new()
	key.size = Vector3(0.11, 0.09, 0.03)
	var keys := MultiMesh.new()
	keys.transform_format = MultiMesh.TRANSFORM_3D
	keys.mesh = key
	keys.instance_count = 12
	for i in 12:
		keys.set_instance_transform(i, Transform3D(Basis(), Vector3(DOOR.x + 4.75 + (i % 3 - 1) * 0.14, 1.66 - (i / 3) * 0.13, -ROOM + 0.09)))
	var kmi := MultiMeshInstance3D.new()
	kmi.multimesh = keys
	kmi.material_override = _neon(NEON_B * 0.6, 1.0)
	add_child(_shadowless(kmi))


## The door in its frame, on its hinge, with its wheel and bolts.
func _build_door() -> void:
	var chrome := _std(0xdfe5ee, 1.0, 0.1)
	var dark := _std(0x16161c, 0.9, 0.35)
	var brass := _std(0xd8a650, 1.0, 0.22)
	# the frame: a thick steel ring round the opening, a neon ring outside it
	var fr := _mesh(_torus(OPEN_R + 0.3, 0.32, 64, 12), _steel(0x8d929c, 0.3, 0.0), DOOR + Vector3(0, 0, 0.12))
	fr.rotation.x = PI * 0.5
	_ring_mat = _neon(RED, 3.0)
	var nr := _mesh(_torus(OPEN_R + 0.78, 0.045, 96, 6), _ring_mat, DOOR + Vector3(0, 0, 0.06))
	nr.rotation.x = PI * 0.5
	_shadowless(nr)
	# the threshold: a steel step up into the vault
	var th := BoxMesh.new()
	th.size = Vector3(3.4, 0.36, 1.0)
	_mesh(th, dark, Vector3(DOOR.x, 0.18, DOOR.z + 0.3))
	# the hinge: two knuckles on the wall at the left, the door hung off them by its arms
	var hx := DOOR.x - DOOR_R - 0.45
	for y in [-1.55, 1.55]:
		var plate := BoxMesh.new()
		plate.size = Vector3(0.7, 0.9, 0.12)
		_mesh(plate, dark, Vector3(hx - 0.1, DOOR.y + y, DOOR.z + 0.08))
	_hinge = Node3D.new()
	_hinge.position = Vector3(hx, DOOR.y, DOOR.z + 0.55)
	add_child(_hinge)
	for y in [-1.55, 1.55]:
		_mesh(_cyl(0.2, 0.75, 20), chrome, Vector3(0, y, 0), _hinge)
		var arm := BoxMesh.new()
		arm.size = Vector3(1.1, 0.22, 0.16)
		_mesh(arm, _steel(0x5a5e68, 0.4, 0.0), Vector3(0.55, y, 0.0), _hinge)
	# the door: a thick disc of machined steel hanging off the arms
	var door := Node3D.new()
	door.position = Vector3(DOOR_R + 0.45, 0, -0.55 + DOOR_T * 0.5 - 0.3)
	_hinge.add_child(door)
	var face_z := DOOR_T * 0.5
	var disc := _mesh(_cyl(DOOR_R, DOOR_T, 72), _steel(0xa9aeb8, 0.24), Vector3.ZERO, door)
	disc.rotation.x = PI * 0.5
	# its face: two raised rings, a neon ring near the edge, the hub
	for rr in [[DOOR_R - 0.3, 0.07, 72], [1.45, 0.06, 56]]:
		var ring := _mesh(_torus(rr[0], rr[1], rr[2], 8), chrome, Vector3(0, 0, face_z), door)
		ring.rotation.x = PI * 0.5
	var fn := _mesh(_torus(DOOR_R - 0.12, 0.028, 80, 5), _ring_mat, Vector3(0, 0, face_z + 0.01), door)
	fn.rotation.x = PI * 0.5
	_shadowless(fn)
	var hub := _mesh(_cyl(0.55, 0.3, 40), _steel(0xc4c9d2, 0.18, 6.0), Vector3(0, 0, face_z + 0.15), door)
	hub.rotation.x = PI * 0.5
	var cap := _mesh(_cyl(0.22, 0.12, 24), brass, Vector3(0, 0, face_z + 0.36), door)
	cap.rotation.x = PI * 0.5
	# the wheel: three spokes across, a ball on each end, a rim joining them
	_wheel = Node3D.new()
	_wheel.position = Vector3(0, 0, face_z + 0.42)
	door.add_child(_wheel)
	var ball := SphereMesh.new()
	ball.radius = 0.14
	ball.height = 0.28
	ball.radial_segments = 14
	ball.rings = 7
	for k in 3:
		var a := TAU * k / 6.0
		var sp := _mesh(_cyl(0.06, 2.9, 10), chrome, Vector3.ZERO, _wheel)
		sp.rotation.z = a
		for s in [-1.0, 1.0]:
			_mesh(ball, brass, Vector3(-sin(a), cos(a), 0) * 1.45 * s, _wheel)
	var rim := _mesh(_torus(1.08, 0.05, 48, 6), chrome, Vector3.ZERO, _wheel)
	rim.rotation.x = PI * 0.5
	# the bolts round its edge (shot out into the frame while it's locked)
	var bm := _cyl(0.1, 0.5, 12)
	_bolts = MultiMesh.new()
	_bolts.transform_format = MultiMesh.TRANSFORM_3D
	_bolts.mesh = bm
	_bolts.instance_count = BOLTS
	var bmi := MultiMeshInstance3D.new()
	bmi.multimesh = _bolts
	bmi.material_override = chrome
	door.add_child(bmi)
	_bolts_tick()
	# its back: two crossed bars and the gear that drives the bolts
	for a in [0.4, -0.4]:
		var b := BoxMesh.new()
		b.size = Vector3(4.2, 0.22, 0.14)
		var bar := _mesh(b, dark, Vector3(0, 0, -face_z - 0.07), door)
		bar.rotation.z = a
	var gear := _mesh(_cyl(0.6, 0.18, 24), brass, Vector3(0, 0, -face_z - 0.12), door)
	gear.rotation.x = PI * 0.5
	# the steam that bursts out round its edge as it unseals
	_steam = CPUParticles3D.new()
	_steam.emitting = false
	_steam.one_shot = true
	_steam.amount = 60
	_steam.lifetime = 2.2
	_steam.explosiveness = 0.8
	_steam.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	_steam.emission_ring_axis = Vector3(0, 0, 1)
	_steam.emission_ring_radius = OPEN_R + 0.05
	_steam.emission_ring_inner_radius = OPEN_R - 0.1
	_steam.emission_ring_height = 0.1
	_steam.direction = Vector3(0, 0, 1)
	_steam.spread = 50.0
	_steam.initial_velocity_min = 0.6
	_steam.initial_velocity_max = 2.2
	_steam.gravity = Vector3(0, 0.35, 0)
	_steam.damping_min = 0.8
	_steam.damping_max = 1.6
	_steam.scale_amount_min = 0.8
	_steam.scale_amount_max = 1.6
	var grow := Curve.new()
	grow.add_point(Vector2(0, 0.35))
	grow.add_point(Vector2(1, 1.6))
	_steam.scale_amount_curve = grow
	var fade := Gradient.new()
	fade.set_color(0, Color(0.85, 0.88, 0.95, 0.4))
	fade.set_color(1, Color(0.85, 0.88, 0.95, 0.0))
	_steam.color_ramp = fade
	var puff := QuadMesh.new()
	puff.size = Vector2(0.9, 0.9)
	var sm := StandardMaterial3D.new()
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	sm.vertex_color_use_as_albedo = true
	sm.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	sm.albedo_texture = _soft_tex()
	puff.material = sm
	_steam.mesh = puff
	_steam.position = DOOR + Vector3(0, 0, 0.6)
	add_child(_shadowless(_steam))
	# a cool spot from the ceiling on the door's face, so its steel shines
	var ds := SpotLight3D.new()
	ds.light_color = Color(0.85, 0.9, 1.0)
	ds.light_energy = 5.0
	ds.spot_range = 16.0
	ds.spot_angle = 26.0
	ds.spot_attenuation = 0.4
	add_child(ds)
	ds.look_at_from_position(DOOR + Vector3(1.2, 4.6, 7.0), DOOR + Vector3(0, -0.3, 0))
	# the light that pours out of the open door into the room
	_spill = OmniLight3D.new()
	_spill.position = DOOR + Vector3(0, -0.6, 1.4)
	_spill.light_color = Color(1.0, 0.82, 0.6)
	_spill.light_energy = 0.0
	_spill.omni_range = 11.0
	_spill.shadow_enabled = false
	add_child(_spill)


## Inside: the steel tube, its floor, its racks of glowing pods, the blaze at its far end.
func _build_vault() -> void:
	var depth := 7.0
	var tube := CylinderMesh.new()
	tube.top_radius = OPEN_R
	tube.bottom_radius = OPEN_R
	tube.height = depth
	tube.radial_segments = 40
	tube.rings = 1
	tube.cap_top = false
	tube.cap_bottom = false
	_tunnel_mat = ShaderMaterial.new()
	_tunnel_mat.shader = preload("res://render/vault/vault_tunnel.gdshader")
	_tunnel_mat.set_shader_parameter("len", depth)
	var tm := _mesh(tube, _tunnel_mat, Vector3(DOOR.x, DOOR.y, DOOR.z - depth * 0.5))
	tm.rotation.x = PI * 0.5
	_shadowless(tm)
	var cq := QuadMesh.new()
	cq.size = Vector2(OPEN_R * 2.0, OPEN_R * 2.0)
	_cap_mat = ShaderMaterial.new()
	_cap_mat.shader = preload("res://render/vault/vault_tunnel.gdshader")
	_cap_mat.set_shader_parameter("cap", true)
	# (turned to face away: the shader draws back faces only)
	_shadowless(_mesh(cq, _cap_mat, Vector3(DOOR.x, DOOR.y, DOOR.z - depth + 0.02))).rotation.y = PI
	# its floor: a steel deck at the opening's lower chord
	var fy := DOOR.y - OPEN_R + 0.55
	var deck := BoxMesh.new()
	deck.size = Vector3(3.2, 0.1, depth)
	_mesh(deck, _std(0x2a2c33, 0.9, 0.4), Vector3(DOOR.x, fy - 0.05, DOOR.z - depth * 0.5))
	# the racks: a pod on a lit pedestal either side, all the way in
	var ped := _cyl(0.2, 0.22, 16, 0.24)
	var peds := MultiMesh.new()
	peds.transform_format = MultiMesh.TRANSFORM_3D
	peds.mesh = ped
	peds.instance_count = RACK
	var pods := MultiMesh.new()
	pods.transform_format = MultiMesh.TRANSFORM_3D
	pods.use_colors = true
	pods.use_custom_data = true
	var pm := CapsuleMesh.new()
	pm.radius = POD_R * 0.8
	pm.height = POD_LEN * 2.0 * 0.8
	pm.radial_segments = 12
	pm.rings = 4
	pods.mesh = pm
	pods.instance_count = RACK
	for i in RACK:
		var side := -1.0 if i % 2 == 0 else 1.0
		var z := DOOR.z - 1.3 - float(i / 2) * 0.95
		peds.set_instance_transform(i, Transform3D(Basis(), Vector3(DOOR.x + side * 1.05, fy + 0.11, z)))
		pods.set_instance_transform(i, Transform3D(Basis(Vector3.UP, i * 0.7), Vector3(DOOR.x + side * 1.05, fy + 0.22 + POD_LEN * 0.8 + 0.06, z)))
		pods.set_instance_color(i, Color.hex((int(TOPS[(i * 3) % TOPS.size()]) << 8) | 0xff))
		var c := Color.from_hsv(fmod(i * 0.137 + 0.55, 1.0), 0.7, 1.0)
		pods.set_instance_custom_data(i, Color(c.r, c.g, c.b, 1.0))
	var pmi := MultiMeshInstance3D.new()
	pmi.multimesh = peds
	pmi.material_override = _std(0x3a3d46, 1.0, 0.25)
	add_child(pmi)
	var rack_mat := ShaderMaterial.new()
	rack_mat.shader = preload("res://render/vault/vault_pod.gdshader")
	rack_mat.set_shader_parameter("use_instance", true)
	rack_mat.set_shader_parameter("len", POD_LEN * 0.8)
	rack_mat.set_shader_parameter("glass", POD_GLASS * 0.8)
	rack_mat.set_shader_parameter("idle_glow", 0.9)
	var rmi := MultiMeshInstance3D.new()
	rmi.multimesh = pods
	rmi.material_override = rack_mat
	add_child(_shadowless(rmi))
	_inner = OmniLight3D.new()
	_inner.position = Vector3(DOOR.x, DOOR.y + 0.4, DOOR.z - 2.2)
	_inner.light_color = Color(1.0, 0.8, 0.55)
	_inner.light_energy = 0.0
	_inner.omni_range = 6.5
	add_child(_inner)


## The alarm: two beacons over the door (each a red dome turning two beams of light and a spot
## light round the walls), and the security lasers across the room.
func _build_alarm() -> void:
	_beacon_mat = _neon(RED, 1.0)
	_beam_ray = ShaderMaterial.new()
	_beam_ray.shader = preload("res://render/vault/vault_ray.gdshader")
	_beam_ray.set_shader_parameter("height", 6.0)
	var dome := SphereMesh.new()
	dome.radius = 0.24
	dome.height = 0.4
	dome.radial_segments = 16
	dome.rings = 8
	var cone := _cyl(0.06, 6.0, 14, 1.3)
	cone.cap_top = false
	cone.cap_bottom = false
	var dark := _std(0x18181e, 0.8, 0.3)
	for side in [-1.0, 1.0]:
		var at := Vector3(DOOR.x + side * 5.0, 6.15, -ROOM + 0.3)
		var base := BoxMesh.new()
		base.size = Vector3(0.5, 0.18, 0.5)
		_mesh(base, dark, at + Vector3(0, -0.26, 0))
		_shadowless(_mesh(dome, _beacon_mat, at))
		var head := Node3D.new()
		head.position = at
		add_child(head)
		for k in 2:
			var arm := Node3D.new()
			arm.rotation.y = PI * k
			head.add_child(arm)
			# (the cone's narrow top at the lamp, lying along +x, tipped down a little)
			var c := _mesh(cone, _beam_ray, Vector3(3.0, -0.35, 0), arm)
			c.rotation.z = PI * 0.5 + 0.12
			_shadowless(c)
		var spot := SpotLight3D.new()
		spot.light_color = Color(1.0, 0.05, 0.02)
		spot.light_energy = 0.0
		spot.spot_range = 16.0
		spot.spot_angle = 22.0
		spot.spot_attenuation = 0.5
		spot.visible = false
		head.add_child(spot)
		# (pointing along +x and down a little)
		spot.rotation = Vector3(-0.2, -PI * 0.5, 0)
		_alarm_spots.append(spot)
		_beacons.append(head)
	_alarm_light = OmniLight3D.new()
	_alarm_light.position = Vector3(DOOR.x, 6.5, -5.0)
	_alarm_light.light_color = Color(1.0, 0.06, 0.03)
	_alarm_light.omni_range = 17.0
	_alarm_light.omni_attenuation = 0.6
	_alarm_light.light_energy = 0.0
	_alarm_light.visible = false
	add_child(_alarm_light)
	_laser_core = ShaderMaterial.new()
	_laser_core.shader = preload("res://render/vault/vault_beam.gdshader")
	_laser_core.set_shader_parameter("fade", 0.0)
	_laser_glow = ShaderMaterial.new()
	_laser_glow.shader = preload("res://render/vault/vault_beam.gdshader")
	_laser_glow.set_shader_parameter("fade", 0.0)
	var core := _cyl(0.014, ROOM * 2.0, 6)
	core.cap_top = false
	core.cap_bottom = false
	var glow := _cyl(0.07, ROOM * 2.0, 8)
	glow.cap_top = false
	glow.cap_bottom = false
	for l in LASERS:
		var mi := _mesh(core, _laser_core, Vector3(0, l[1], l[0]))
		_shadowless(_mesh(glow, _laser_glow, Vector3.ZERO, mi))
		mi.rotation = Vector3(0, l[3], PI * 0.5 + l[2])
		mi.visible = false
		_shadowless(mi)
		_lasers.append(mi)


## The room's dressing: shafts of light down through the haze onto the robot and the door, dust
## drifting in them, pallets of gold bars either side of the door, a security camera high in each
## back corner panning the room, and the featured skin turning in a glass case under its own spot.
func _build_dressing() -> void:
	# the shafts: open cones from the ceiling, brightest at the lamp
	_shaft_mat = ShaderMaterial.new()
	_shaft_mat.shader = preload("res://render/vault/vault_ray.gdshader")
	_shaft_mat.set_shader_parameter("height", ROOM_H)
	_shaft_door = ShaderMaterial.new()
	_shaft_door.shader = preload("res://render/vault/vault_ray.gdshader")
	_shaft_door.set_shader_parameter("height", ROOM_H)
	_shaft_door.set_shader_parameter("color", Vector3(0.55, 0.62, 0.9))
	_shaft_door.set_shader_parameter("alpha", 0.11)
	var shaft := _cyl(0.12, ROOM_H, 24, 2.3)
	shaft.cap_top = false
	shaft.cap_bottom = false
	_shadowless(_mesh(shaft, _shaft_mat, Vector3(0, ROOM_H * 0.5, 0)))
	for x in [-3.4, 3.0]:
		var sh := _shadowless(_mesh(shaft, _shaft_door, Vector3(DOOR.x + x, ROOM_H * 0.5, -8.6)))
		sh.scale = Vector3(0.8, 1.0, 0.8)
	var lamp := _cyl(0.22, 0.1, 20)
	for at in [Vector3(0, ROOM_H - 0.07, 0), Vector3(DOOR.x - 3.4, ROOM_H - 0.07, -8.6), Vector3(DOOR.x + 3.0, ROOM_H - 0.07, -8.6)]:
		_shadowless(_mesh(lamp, _neon(Vector3(1.0, 0.95, 0.9), 1.4), at))
	# the dust in the light
	_haze = CPUParticles3D.new()
	_haze.amount = 90
	_haze.lifetime = 9.0
	_haze.preprocess = 9.0
	_haze.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	_haze.emission_box_extents = Vector3(5.0, 2.8, 5.5)
	_haze.direction = Vector3(0.3, 1.0, 0.1)
	_haze.spread = 180.0
	_haze.initial_velocity_min = 0.02
	_haze.initial_velocity_max = 0.12
	_haze.gravity = Vector3(0, 0.01, 0)
	_haze.scale_amount_min = 0.5
	_haze.scale_amount_max = 1.3
	var dfade := Gradient.new()
	dfade.offsets = PackedFloat32Array([0.0, 0.25, 0.75, 1.0])
	dfade.colors = PackedColorArray([Color(1, 0.92, 0.8, 0.0), Color(1, 0.92, 0.8, 0.55), Color(1, 0.92, 0.8, 0.55), Color(1, 0.92, 0.8, 0.0)])
	_haze.color_ramp = dfade
	_haze.mesh = _speck(0.035)
	_haze.position = Vector3(-0.2, 3.0, -4.0)
	add_child(_shadowless(_haze))
	# the gold: bars stacked crosswise on a pallet either side of the door
	var bar := _cyl(0.072, 0.075, 4, 0.1)
	var bars := MultiMesh.new()
	bars.transform_format = MultiMesh.TRANSFORM_3D
	bars.mesh = bar
	var xf: Array[Transform3D] = []
	for side in [[DOOR.x - 5.6, -9.4, 0.25], [DOOR.x + 5.9, -9.6, -0.3]]:
		var c := Vector3(side[0], 0.0, side[1])
		var turn := Basis(Vector3.UP, float(side[2]))
		var pal := BoxMesh.new()
		pal.size = Vector3(1.5, 0.14, 1.1)
		var pm := _mesh(pal, _std(0x2b2116, 0.0, 0.8), c + Vector3(0, 0.07, 0))
		pm.basis = turn
		# layers of bars, crossing each other, each layer a bar shorter
		for layer in 5:
			var n := 5 - layer
			var along := layer % 2 == 0
			for i in n:
				var off := (i - (n - 1) * 0.5) * (0.23 if along else 0.2)
				# (the bar: a four-sided frustum turned square-on, stretched along its length)
				var b := Basis(Vector3.UP, PI * 0.25).scaled(Vector3(1.0, 1.0, 1.0))
				var stretch := Basis.from_scale(Vector3(0.95, 1.0, 2.6) if along else Vector3(2.6, 1.0, 0.95))
				var at := Vector3(off, 0.14 + 0.04 + layer * 0.078, 0) if along else Vector3(0, 0.14 + 0.04 + layer * 0.078, off)
				xf.append(Transform3D(turn * stretch * b, c + turn * at))
	bars.instance_count = xf.size()
	for i in xf.size():
		bars.set_instance_transform(i, xf[i])
	var gold := StandardMaterial3D.new()
	gold.albedo_color = Color(1.0, 0.74, 0.28)
	gold.metallic = 1.0
	gold.roughness = 0.18
	gold.emission_enabled = true
	gold.emission = Color(1.0, 0.6, 0.2)
	gold.emission_energy_multiplier = 0.25
	var gmi := MultiMeshInstance3D.new()
	gmi.multimesh = bars
	gmi.material_override = gold
	add_child(gmi)
	for side in [[DOOR.x - 5.6, -9.4], [DOOR.x + 5.9, -9.6]]:
		var gl := OmniLight3D.new()
		gl.light_color = Color(1.0, 0.72, 0.35)
		gl.light_energy = 1.2
		gl.omni_range = 2.6
		gl.position = Vector3(side[0], 1.4, side[1] + 0.6)
		add_child(gl)
	# the security cameras, high in the back corners
	_cam_led = _neon(RED, 3.0)
	var body := BoxMesh.new()
	body.size = Vector3(0.24, 0.24, 0.6)
	var hood := BoxMesh.new()
	hood.size = Vector3(0.32, 0.04, 0.72)
	var lens := _cyl(0.085, 0.08, 16)
	var arm := _cyl(0.035, 0.5, 8)
	var led := SphereMesh.new()
	led.radius = 0.03
	led.height = 0.06
	led.radial_segments = 8
	led.rings = 4
	var shell := _std(0xd9dce2, 0.3, 0.35)
	var dark := _std(0x111116, 0.8, 0.3)
	for side in [-1.0, 1.0]:
		var at := Vector3(DOOR.x + side * 7.8, 6.3, -ROOM + 0.2)
		var mount := BoxMesh.new()
		mount.size = Vector3(0.22, 0.32, 0.06)
		_mesh(mount, dark, at)
		_mesh(arm, dark, at + Vector3(0, -0.1, 0.25)).rotation.x = PI * 0.5
		var head := Node3D.new()
		head.position = at + Vector3(0, -0.12, 0.5)
		add_child(head)
		var tilt := Node3D.new()
		tilt.rotation.x = -0.45
		head.add_child(tilt)
		_mesh(body, shell, Vector3(0, 0, 0.18), tilt)
		_mesh(hood, dark, Vector3(0, 0.14, 0.22), tilt)
		_mesh(lens, dark, Vector3(0, 0, 0.5), tilt).rotation.x = PI * 0.5
		var ring := _mesh(_torus(0.07, 0.012, 16, 4), _neon(Vector3(0.4, 0.5, 0.8), 1.5), Vector3(0, 0, 0.545), tilt)
		ring.rotation.x = PI * 0.5
		_shadowless(_mesh(led, _cam_led, Vector3(0.08, 0.07, 0.42), tilt))
		head.set_meta("side", side)
		_cams.append(head)
	# the featured skin: a ball of plating wearing it, turning in a glass case on a plinth, under a
	# spot of its own, its name over it
	var fc := Vector3(-2.4, 0.0, -2.7)
	var plinth := _cyl(0.46, 1.0, 32, 0.52)
	_mesh(plinth, _steel(0x24262d, 0.3, 0.0), fc + Vector3(0, 0.5, 0))
	var trim := _cyl(0.5, 0.05, 32)
	_mesh(trim, _std(0xd8a650, 1.0, 0.22), fc + Vector3(0, 1.02, 0))
	var base_ring := _mesh(_torus(0.56, 0.02, 48, 4), _neon(GOLD, 3.0), fc + Vector3(0, 0.05, 0))
	_shadowless(base_ring)
	var orb := SphereMesh.new()
	orb.radius = 0.3
	orb.height = 0.6
	orb.radial_segments = 28
	orb.rings = 14
	_feat_mat = ShaderMaterial.new()
	_feat_mat.shader = preload("res://render/vault/vault_skin.gdshader")
	_feat = _mesh(orb, _feat_mat, fc + Vector3(0, 1.45, 0))
	var glass := _cyl(0.44, 0.92, 32)
	glass.cap_bottom = false
	var gm := ShaderMaterial.new()
	gm.shader = preload("res://render/vault/vault_case.gdshader")
	_shadowless(_mesh(glass, gm, fc + Vector3(0, 1.51, 0)))
	_mesh(_cyl(0.47, 0.05, 32), _std(0xd8a650, 1.0, 0.22), fc + Vector3(0, 1.99, 0))
	_feat_light = SpotLight3D.new()
	_feat_light.light_color = Color(1.0, 0.92, 0.8)
	_feat_light.light_energy = 6.0
	_feat_light.spot_range = 7.0
	_feat_light.spot_angle = 11.0
	add_child(_feat_light)
	_feat_light.look_at_from_position(fc + Vector3(0.6, 6.0, 1.4), fc + Vector3(0, 1.4, 0))
	var tag := Label3D.new()
	_feat_tag = tag
	tag.text = "FEATURED EPIC"
	tag.font = MenuKit.broadcast(400)
	tag.font_size = 64
	tag.pixel_size = 0.0034
	tag.outline_size = 0
	tag.shaded = false
	tag.modulate = Color(2.2, 1.5, 0.5)
	tag.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	tag.position = fc + Vector3(0, 2.5, 0)
	add_child(tag)
	_feat_name = Label3D.new()
	_feat_name.font = MenuKit.broadcast(400)
	_feat_name.font_size = 80
	_feat_name.pixel_size = 0.0034
	_feat_name.outline_size = 18
	_feat_name.outline_modulate = Color(0, 0, 0, 0.6)
	_feat_name.shaded = false
	_feat_name.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	_feat_name.position = fc + Vector3(0, 2.27, 0)
	add_child(_feat_name)


## Today's featured skin into its case (it changes every day).
func _feature() -> void:
	var f = Gacha.featured()
	if f == null or String(f.id) == _feat_id:
		return
	_feat_id = String(f.id)
	Skins.apply(_feat_mat, f)
	_feat_name.text = String(f.name).to_upper()


func _build_pull_props() -> void:
	_pod_mesh = CapsuleMesh.new()
	_pod_mesh.radius = POD_R
	_pod_mesh.height = POD_LEN * 2.0
	_pod_mesh.radial_segments = 20
	_pod_mesh.rings = 6
	_hero_mat = _pod_mat(0xff3b5c)
	_hero = _mesh(_pod_mesh, _hero_mat)
	_hero.visible = false
	for k in 2:
		var m := _pod_mat(0xff3b5c)
		m.set_shader_parameter("half", k + 1)
		var h := _mesh(_pod_mesh, m)
		h.visible = false
		_halves.append(h)
		_halves_v.append(Vector3.ZERO)
		_halves_w.append(Vector3.ZERO)
	var s := SphereMesh.new()
	s.radius = 0.5
	s.height = 1.0
	s.radial_segments = 20
	s.rings = 10
	for i in 10:
		var m := _pod_mat(TOPS[i % TOPS.size()])
		var c := _mesh(_pod_mesh, m)
		c.visible = false
		_ten.append(c)
		_ten_mat.append(m)
		var om := _neon(Vector3.ONE, 4.0)
		om.set_shader_parameter("core", 0.75)
		var o := _mesh(s, om)
		o.visible = false
		_shadowless(o)
		_orbs.append(o)
		_orb_mat.append(om)
		# its halo: a bigger soft ball round it
		var hm := ShaderMaterial.new()
		hm.shader = preload("res://render/vault/vault_halo.gdshader")
		var halo := _mesh(s, hm, Vector3.ZERO, o)
		halo.scale = Vector3.ONE * 2.3
		_shadowless(halo)
		_halo_mat.append(hm)
	_burst_light = OmniLight3D.new()
	_burst_light.light_energy = 0.0
	_burst_light.omni_range = 10.0
	add_child(_burst_light)
	_shock_mat = ShaderMaterial.new()
	_shock_mat.shader = preload("res://render/vault/vault_beam.gdshader")
	_shock_mat.set_shader_parameter("fade", 0.0)
	_shock = _mesh(_torus(0.96, 0.04, 64, 6), _shock_mat)
	_shock.visible = false
	var bc := _cyl(0.7, 7.0, 40, 1.15)
	bc.cap_top = false
	bc.cap_bottom = false
	_beam_mat = ShaderMaterial.new()
	_beam_mat.shader = preload("res://render/vault/vault_beam.gdshader")
	_beam_mat.set_shader_parameter("height", 7.0)
	_beam = _mesh(bc, _beam_mat, Vector3(0, 3.5, 0))
	_beam.visible = false
	_shadowless(_beam)
	_confetti = CPUParticles3D.new()
	_confetti.emitting = false
	_confetti.one_shot = true
	_confetti.amount = 140
	_confetti.lifetime = 2.6
	_confetti.explosiveness = 0.95
	var q := BoxMesh.new()
	q.size = Vector3(0.09, 0.015, 0.06)
	var qm := StandardMaterial3D.new()
	qm.vertex_color_use_as_albedo = true
	qm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	q.material = qm
	_confetti.mesh = q
	_confetti.direction = Vector3.UP
	_confetti.spread = 75.0
	_confetti.initial_velocity_min = 4.0
	_confetti.initial_velocity_max = 8.5
	_confetti.gravity = Vector3(0, -5.0, 0)
	_confetti.damping_min = 1.2
	_confetti.damping_max = 2.4
	_confetti.angular_velocity_min = -600.0
	_confetti.angular_velocity_max = 600.0
	_confetti.particle_flag_rotate_y = true
	_confetti.angle_min = -180.0
	_confetti.angle_max = 180.0
	var ramp := Gradient.new()
	ramp.offsets = PackedFloat32Array([0.0, 0.2, 0.4, 0.6, 0.8, 1.0])
	ramp.colors = PackedColorArray([Color("#ff5ad0"), Color("#ffd36a"), Color("#6ae6ff"), Color("#9b6bff"), Color("#45e08a"), Color("#ff8a2a")])
	_confetti.color_initial_ramp = ramp
	add_child(_confetti)
	# an Epic's shower of gold coins
	_coins = CPUParticles3D.new()
	_coins.emitting = false
	_coins.one_shot = true
	_coins.amount = 100
	_coins.lifetime = 2.8
	_coins.explosiveness = 0.92
	var coin := _cyl(0.07, 0.014, 8)
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(1.0, 0.78, 0.3)
	gm.metallic = 1.0
	gm.roughness = 0.22
	gm.emission_enabled = true
	gm.emission = Color(1.0, 0.65, 0.2)
	gm.emission_energy_multiplier = 0.9
	coin.material = gm
	_coins.mesh = coin
	_coins.direction = Vector3.UP
	_coins.spread = 55.0
	_coins.initial_velocity_min = 5.0
	_coins.initial_velocity_max = 9.0
	_coins.gravity = Vector3(0, -9.0, 0)
	_coins.damping_min = 0.4
	_coins.damping_max = 1.0
	_coins.angular_velocity_min = -900.0
	_coins.angular_velocity_max = 900.0
	_coins.particle_flag_rotate_y = true
	_coins.angle_min = -180.0
	_coins.angle_max = 180.0
	add_child(_shadowless(_coins))
	# the reveal's glory behind the robot, and the sparks rising round it
	var aq := QuadMesh.new()
	aq.size = Vector2(7.5, 7.5)
	_aura_mat = ShaderMaterial.new()
	_aura_mat.shader = preload("res://render/vault/vault_aura.gdshader")
	_aura = _shadowless(_mesh(aq, _aura_mat, Vector3(0, 1.4, -1.6))) as MeshInstance3D
	_aura.visible = false
	_motes = CPUParticles3D.new()
	_motes.emitting = false
	_motes.amount = 70
	_motes.lifetime = 2.6
	_motes.emission_shape = CPUParticles3D.EMISSION_SHAPE_RING
	_motes.emission_ring_axis = Vector3.UP
	_motes.emission_ring_radius = 1.5
	_motes.emission_ring_inner_radius = 0.7
	_motes.emission_ring_height = 0.1
	_motes.direction = Vector3.UP
	_motes.spread = 12.0
	_motes.initial_velocity_min = 0.5
	_motes.initial_velocity_max = 1.4
	_motes.gravity = Vector3(0, 0.3, 0)
	_motes.scale_amount_min = 0.6
	_motes.scale_amount_max = 1.4
	var mfade := Gradient.new()
	mfade.offsets = PackedFloat32Array([0.0, 0.15, 0.7, 1.0])
	mfade.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 0.8), Color(1, 1, 1, 0)])
	_motes.color_ramp = mfade
	_motes.mesh = _speck(0.09)
	_motes.position = Vector3(0, 0.1, 0)
	add_child(_shadowless(_motes))
	# the glide's trail: specks shed in the world as the pod passes, shrinking away
	_trail = CPUParticles3D.new()
	_trail.emitting = false
	_trail.local_coords = false
	_trail.amount = 90
	_trail.lifetime = 0.7
	_trail.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_trail.emission_sphere_radius = 0.16
	_trail.direction = Vector3.UP
	_trail.spread = 180.0
	_trail.initial_velocity_min = 0.05
	_trail.initial_velocity_max = 0.35
	_trail.gravity = Vector3.ZERO
	var shrink := Curve.new()
	shrink.add_point(Vector2(0, 1.0))
	shrink.add_point(Vector2(1, 0.0))
	_trail.scale_amount_curve = shrink
	_trail.scale_amount_min = 0.7
	_trail.scale_amount_max = 1.5
	_trail.mesh = _speck(0.16)
	add_child(_shadowless(_trail))


func _pod_mat(top: int) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/vault/vault_pod.gdshader")
	m.set_shader_parameter("top_col", Color.hex((top << 8) | 0xff))
	m.set_shader_parameter("len", POD_LEN)
	m.set_shader_parameter("glass", POD_GLASS)
	m.set_shader_parameter("seam_col", _v(Skins.RARITY_COL[0].srgb_to_linear()))
	return m


# ------------------------------------------------------------------------------ the game's side

## The world arrives (Game.set_place): light it, take the camera.
func enter(g: Game) -> void:
	game = g
	if _active:
		return
	_active = true
	visible = true
	_look.save(game)
	_look.apply(game, LOOK, _sky)
	yaw = 0.2
	_feature()
	_reset()
	_after_enter.call_deferred()


func _after_enter() -> void:
	if not _active or game == null:
		return
	game.director.mode = "scene"
	game.director.menu_turn = 0.0
	game.director.menu_live = false
	_cut = true


## The world leaves: hand the light back, put the pull away.
func exit() -> void:
	if not _active:
		return
	_active = false
	visible = false
	_reset()
	_look.restore(game)
	sound.stop_all()


## Back to the robot on its turntable, nothing playing (the camera cuts there, or glides). On a cut
## the vault is shut and quiet at once; otherwise the door swings shut and the alarm dies away.
func _reset(cut := true) -> void:
	mode = "idle"
	_results = []
	_t = 0.0
	_wheel_v = 0.0
	_hero.visible = false
	for h in _halves:
		h.visible = false
	for c in _ten:
		c.visible = false
	for o in _orbs:
		o.visible = false
	_beam_t = -1.0
	_beam.visible = false
	_shock_t = -1.0
	_shock.visible = false
	_burst_light.light_energy = 0.0
	_pod_glow = Vector3.ZERO
	_motes.emitting = false
	_trail.emitting = false
	_alarm_to = 0.0
	_gold_to = 0.0
	_gold_until = -1.0
	_tint_to = 0.0
	_laser_to = 0.0
	_floor_mat.set_shader_parameter("table_col", Vector3(0.9, 0.3, 1.0))
	if cut:
		_aura_k = 0.0
		_alarm = 0.0
		_gold = 0.0
		_tint_k = 0.0
		_laser = 0.0
		_pads = 0.0
		_bolt = 0.0
		_pull = 0.0
		_swing = 0.0
		_door_apply()
	_robot(true)
	_cut = cut


func _robot(on: bool) -> void:
	_robot_on = on
	if game != null and game.showcase != null:
		game.showcase.model.visible = on


## A light sweeps up the robot (a skin went on).
func pulse() -> void:
	_beam_t = 0.0
	_beam_mat.set_shader_parameter("color", Vector3(0.9, 0.5, 1.4))


# ------------------------------------------------------------------------------ pulls

## Play a pull: `results` from Gacha.pull, `spec` the player's bot (the skins are shown on a copy).
func play(results: Array, spec) -> void:
	# (the door still open from the last pull: straight on to the pods)
	var was_open := _swing > 0.5
	_reset(false)
	_results = results
	_spec = spec
	# (the plating shaders for the skins about to go on the robot: compiling while the vault opens)
	BotModel.warm(results.map(func(r): return r.skin))
	_tier = int(Gacha.best_of(results).skin.r)
	_shown_tier = 0
	_cracked = [false, false]
	_done_beats = {}
	_pops = 0
	_pop_from = -1.0
	_t = 0.0
	_robot(false)
	_cam_lambda = 1.6
	if was_open:
		_t = T_POD - 0.35
		for id in ["wheel", "bolts", "unseal"]:
			_done_beats[id] = true
	if results.size() == 1:
		mode = "single"
		var m := _hero_mat
		m.set_shader_parameter("top_col", Color.hex((int(TOPS[_rng.randi() % TOPS.size()]) << 8) | 0xff))
		m.set_shader_parameter("seam_col", _v(Skins.RARITY_COL[0].srgb_to_linear()))
		m.set_shader_parameter("charge", 0.0)
		m.set_shader_parameter("crack", 0.0)
	else:
		mode = "ten"
		_slots.clear()
		_pop_at.clear()
		var n := results.size()
		var arr := PackedVector2Array()
		for i in n:
			var a := lerpf(-0.45, 1.0, float(i) / maxf(1.0, n - 1.0))
			# two rows: the odd ones a little further out
			var rr := 4.5 + (0.6 if i % 2 == 1 else 0.0)
			var s := Vector3(DOOR.x + sin(a) * rr, 0.0, DOOR.z + 0.3 + cos(a) * rr)
			_slots.append(s)
			arr.append(Vector2(s.x, s.z))
			_pop_at.append(-1.0)
			_ten_mat[i].set_shader_parameter("top_col", Color.hex((int(TOPS[(i * 5 + _rng.randi()) % TOPS.size()]) << 8) | 0xff))
			_ten_mat[i].set_shader_parameter("charge", 0.0)
			_ten_mat[i].set_shader_parameter("seam_col", _v(Skins.RARITY_COL[0].srgb_to_linear()))
		while arr.size() < 10:
			arr.append(Vector2(999, 999))
		_floor_mat.set_shader_parameter("slots", arr)


## Jump to the end of what's playing (a tap): one pull to its reveal, ten to their lights.
func skip() -> void:
	if mode == "single" or mode == "ten":
		_swing = 1.0
		_pull = 1.0
		_bolt = 1.0
		_door_apply()
	if mode == "single":
		if not _done_beats.has("burst"):
			_burst(false)
		if not _done_beats.has("reveal"):
			_reveal()
	elif mode == "ten":
		for i in _results.size():
			_ten[i].visible = false
			if _pop_at[i] < 0.0:
				_pop(i, true)
		_alarm_to = 0.0
		_laser_to = 0.0
		_cards()


## Show skin `id` on the robot ("" the plain paint): the camera cuts to it and a beam of light
## paints it on.
func show_on_robot(id: String) -> void:
	if game == null or _spec == null:
		return
	var spec = _spec.duplicate(true)
	if id == "":
		spec.erase("skin")
	else:
		spec.skin = id
	var was = Skins.of(game._shown_spec) if game._shown_spec != null else null
	game.show_bot(spec)
	_robot(true)
	if game.showcase != null:
		game.showcase.model.paint_on(was)
	var s = Skins.get_skin(id)
	var col: Color = Skins.RARITY_COL[int(s.r)] if s != null else Color(0.8, 0.85, 1.0)
	var lc := _v(col.srgb_to_linear())
	_beam_mat.set_shader_parameter("color", lc * 2.2)
	_beam_t = 0.0
	# the glory behind it and the sparks round it, grander the rarer
	var tier := int(s.r) if s != null else 0
	_aura_col = lc
	_aura_lvl = [0.4, 0.75, 1.2][tier] if s != null else 0.25
	_aura_t = 0.0
	_motes.color = Color(col.r * 1.6, col.g * 1.6, col.b * 1.6) if s != null else Color(0.8, 0.85, 1.0)
	_motes.emitting = true
	_floor_mat.set_shader_parameter("table_col", lc * 1.6)
	_pulse = 0.0
	_floor_mat.set_shader_parameter("pulse_col", lc)
	_floor_mat.set_shader_parameter("pulse_at", Vector2.ZERO)
	sound.play("paint", 0.7)
	if game.effects != null and game.effects.fx != null:
		for k in 3:
			game.effects.fx.sparks(Vector3(0, 0.1 + k * 0.6, 0), Vector3.UP, 10, col.to_html(false).hex_to_int(), 3.0, 1.4)
	# the room in the skin's colour; an Epic's gold lingers, its beacons turning slowly
	_tint = lc
	_tint_to = 0.6 if s != null and int(s.r) >= 1 else 0.0
	_alarm_to = 0.0
	_laser_to = 0.0
	if s != null and int(s.r) == Skins.EPIC:
		_gold_to = 1.0
		_gold_until = -1.0
	else:
		_gold_to = 0.0
	mode = "reveal"
	_t = 0.0
	_cut = true
	beat.emit("robot", id)


## Back from a skin on the robot to the ten lights.
func back_to_orbs() -> void:
	mode = "orbs"
	_robot(false)
	_gold_to = 0.0
	_tint_to = 0.0
	_cut = true


## The pull is over: the robot back on its turntable, the camera back round it.
func finish() -> void:
	# (from the robot, a cut; from the ten's lights, a glide back as the door swings shut)
	var cut := mode == "reveal" or mode == "idle"
	_reset(false)
	_cut = cut
	_cam_lambda = 2.2


# ------------------------------------------------------------------------------ each frame

func update(dt: float, time: float) -> void:
	if not paused:
		step(dt, time)


func step(dt: float, time: float) -> void:
	if not _active:
		return
	dt = minf(dt, 0.05)
	_time = time
	_t += dt
	if game != null and game.showcase != null and game.showcase.model.visible != _robot_on:
		game.showcase.model.visible = _robot_on
	_door_tick(dt)
	# the burst's light, the flash, the floor's pulse, the shock ring and the beam
	_flash = maxf(0.0, _flash - dt * 1.8)
	_burst_light.light_energy = maxf(0.0, _burst_light.light_energy - dt * 30.0)
	if _pulse >= 0.0:
		_pulse += dt / 1.3
		_floor_mat.set_shader_parameter("pulse", minf(_pulse, 1.0))
		if _pulse >= 1.0:
			_pulse = -1.0
	if _shock_t >= 0.0:
		_shock_t += dt
		var k := _shock_t / 0.7
		_shock.visible = k < 1.0
		_shock.scale = Vector3.ONE * (0.4 + k * 7.0)
		_shock_mat.set_shader_parameter("alpha", (1.0 - k) * (1.0 - k) * 2.0)
		if k >= 1.0:
			_shock_t = -1.0
	if _beam_t >= 0.0:
		_beam_t += dt
		var k := _beam_t / 1.6
		_beam.visible = k < 1.0
		_beam_mat.set_shader_parameter("alpha", sin(PI * minf(1.0, k * 1.4)) * 1.0 if k < 1.0 else 0.0)
		_beam.scale = Vector3(1.0 - k * 0.3, 1.0, 1.0 - k * 0.3)
		if k >= 1.0:
			_beam_t = -1.0
	for i in 2:
		var h := _halves[i]
		if h.visible:
			_halves_v[i] += Vector3(0, -9.0, 0) * dt
			h.position += _halves_v[i] * dt
			h.rotate(_halves_w[i].normalized(), _halves_w[i].length() * dt)
			if h.position.y < -1.0:
				h.visible = false
	match mode:
		"idle":
			_idle_cam()
		"single":
			_single(dt)
		"ten":
			_ten_tick(dt)
		"orbs":
			_orbs_tick()
			_wide_cam(1.0)
		"reveal":
			_reveal_cam()
	_room_tick(dt)
	_dress_tick(dt)
	_write_cam()


## The reveal's glory, the shafts of light, the cameras, the featured skin's turn.
func _dress_tick(dt: float) -> void:
	_aura_k = move_toward(_aura_k, 1.0 if mode == "reveal" else 0.0, dt * (2.5 if mode == "reveal" else 4.0))
	_aura_t = minf(1.0, _aura_t + dt / 0.9)
	_aura.visible = _aura_k > 0.01
	if _aura.visible:
		# (behind the robot, from wherever the camera is)
		var away := Vector3(_cam_pos.x, 0.0, _cam_pos.z).normalized()
		_aura.position = Vector3(0, 1.35, 0) - away * 1.5
		_aura_mat.set_shader_parameter("color", _aura_col)
		_aura_mat.set_shader_parameter("alpha", smoothstep(0.0, 1.0, _aura_k) * _aura_lvl)
		_aura_mat.set_shader_parameter("burst", _aura_t)
	if mode != "reveal" and _motes.emitting:
		_motes.emitting = false
	var cool := Vector3(0.62, 0.68, 0.95)
	var gold_k := maxf(_gold, _alarm)
	var room := cool.lerp(RED.lerp(GOLD, _gold), gold_k * 0.8)
	_shaft_mat.set_shader_parameter("color", room.lerp(_aura_col * 1.4, _aura_k))
	_shaft_mat.set_shader_parameter("alpha", 0.16 + _aura_k * _aura_lvl * 0.25 - (0.08 if not _robot_on else 0.0))
	_shaft_door.set_shader_parameter("color", room)
	# the cameras: panning slowly; once a pull is on, following the pod (the robot at a reveal)
	var watch := mode != "idle"
	var target := Vector3(0, 1.2, 0)
	if _hero.visible:
		target = _hero.position
	elif mode == "ten" or mode == "orbs":
		target = Vector3(DOOR.x + 1.5, 1.0, -7.5)
	for c in _cams:
		var side: float = c.get_meta("side")
		var to := sin(_time * 0.3 + side * 1.3) * 0.55 - side * 0.3
		if watch:
			var d := target - c.position
			to = atan2(d.x, d.z)
		c.rotation.y = lerp_angle(c.rotation.y, to, minf(1.0, dt * (5.0 if watch else 2.0)))
	var blink := 1.0 if fmod(_time * (4.0 if _alarm > 0.3 else 0.8), 1.0) < 0.5 else 0.15
	_cam_led.set_shader_parameter("energy", 3.5 * blink)
	# (its words only while the vault's quiet: they'd float over the pulls)
	_feat_tag.visible = mode == "idle"
	_feat_name.visible = mode == "idle"
	_feat.rotation.y += dt * 0.45
	_feat.position.y = 1.45 + sin(_time * 1.3) * 0.03


func _write_cam() -> void:
	if game == null:
		return
	var d: Director = game.director
	if d.mode != "scene":
		return
	d.shift_x = idle_shift if mode == "idle" or mode == "reveal" else 0.0
	d.scene_pos = _cam_pos
	d.scene_look = _cam_look
	d.scene_fov = _cam_fov
	d.scene_roll = 0.0
	d.scene_lambda = _cam_lambda
	if _cut:
		d.snap()
		d.cuts += 1
	_cut = false


func _idle_cam() -> void:
	var r := 7.0
	_cam_pos = Vector3(sin(yaw) * r, 1.45, cos(yaw) * r)
	_cam_look = Vector3(0, 2.3, 0)
	_cam_fov = 1.05
	_cam_lambda = 3.0


func _reveal_cam() -> void:
	var a := 0.25 + sin(_t * 0.25) * 0.35
	var r := 4.1
	_cam_pos = Vector3(sin(a) * r, 1.25, cos(a) * r)
	_cam_look = Vector3(0, 1.15, 0)
	_cam_fov = 0.95
	_cam_lambda = 2.5


## The door from the front, wide (the ten), `push` closer.
func _wide_cam(push: float) -> void:
	_cam_pos = DOOR + Vector3(1.9 - push * 0.3, 0.5 - push * 0.5, 13.6 - push * 2.4)
	_cam_look = DOOR + Vector3(1.0, -1.3 - push * 0.25, 3.6)
	_cam_fov = 1.0
	_cam_lambda = 2.0


## The door at its own pace: while a pull plays the timeline opens it (its wheel spins, the bolts
## draw back, it pulls out of its seal and swings wide); otherwise it swings shut again, seals and
## shoots its bolts home.
func _door_tick(dt: float) -> void:
	var opening := mode == "single" or mode == "ten"
	var t := _t
	if opening:
		_wheel_v = lerpf(_wheel_v, 6.5 if t < T_BOLTS else 0.0, minf(1.0, dt * (3.0 if t < T_BOLTS else 6.0)))
		_bolt = move_toward(_bolt, 1.0 if t >= T_BOLTS else _bolt, dt / 0.4)
		_pull = move_toward(_pull, 1.0 if t >= T_UNSEAL else _pull, dt / 0.3)
		_swing = move_toward(_swing, 1.0 if t >= T_SWING else _swing, dt / 1.15)
	elif mode == "idle" and (_swing > 0.0 or _pull > 0.0 or _bolt > 0.0):
		_swing = move_toward(_swing, 0.0, dt / 1.9)
		if _swing <= 0.0:
			var was := _pull
			_pull = move_toward(_pull, 0.0, dt / 0.35)
			if was > 0.0 and _pull <= 0.0:
				sound.play("bolts", 0.55, 0.9)
				_thud(0.4)
			if _pull <= 0.0:
				_bolt = move_toward(_bolt, 0.0, dt / 0.4)
				_wheel_v = -4.0 if _bolt > 0.0 else 0.0
	else:
		_wheel_v = lerpf(_wheel_v, 0.0, minf(1.0, dt * 6.0))
	_wheel_a += _wheel_v * dt
	_door_apply()


## Pose the door from its state.
func _door_apply() -> void:
	var s := smoothstep(0.0, 1.0, _swing)
	_hinge.rotation.y = -s * SWING
	_hinge.position.z = DOOR.z + 0.55 + _pull * 0.55
	_wheel.rotation.z = _wheel_a
	_open = smoothstep(0.0, 0.6, _swing)
	_bolts_tick()


func _bolts_tick() -> void:
	var r := lerpf(DOOR_R + 0.2, DOOR_R - 0.12, smoothstep(0.0, 1.0, _bolt))
	for i in BOLTS:
		var a := TAU * (i + 0.5) / BOLTS
		var d := Vector3(cos(a), sin(a), 0.0)
		# (a cylinder stands along y: lay it along d)
		var b := Basis(d.cross(Vector3(0, 0, 1)), d, Vector3(0, 0, 1))
		_bolts.set_instance_transform(i, Transform3D(b, d * r))


## The room's light from the moment: the neon turning to the rarity's colour, the alarm and its
## beacons and lasers, the gold, the door's ring and the status panel, all eased.
func _room_tick(dt: float, snap := false) -> void:
	var e := 1.0 if snap else minf(1.0, dt * 3.0)
	_alarm = move_toward(_alarm, _alarm_to, 1.0 if snap else dt * (4.0 if _alarm_to > _alarm else 1.6))
	if _gold_until >= 0.0 and _time > _gold_until:
		_gold_to = 0.0
		_gold_until = -1.0
	_gold = move_toward(_gold, _gold_to, 1.0 if snap else dt * (3.0 if _gold_to > _gold else 0.7))
	_tint_k = lerpf(_tint_k, _tint_to, e)
	_laser = move_toward(_laser, _laser_to, 1.0 if snap else dt * (2.2 if _laser_to > _laser else 1.2))
	_pads = move_toward(_pads, 1.0 if mode == "ten" or mode == "orbs" else 0.0, 1.0 if snap else dt * 1.5)
	var blink := 0.5 + 0.5 * sin(_time * TAU * 1.6)
	var a := NEON_A.lerp(_tint, _tint_k)
	var b := NEON_B.lerp(_tint, _tint_k * 0.8)
	var alarm_col := RED.lerp(GOLD, _gold)
	var alarm_k := maxf(_alarm, _gold)
	a = a.lerp(alarm_col * (0.35 + 0.65 * blink), _alarm * 0.85).lerp(GOLD * 1.3, _gold * 0.85)
	b = b.lerp(alarm_col * 0.6, _alarm * 0.6).lerp(GOLD * 1.1, _gold * 0.7)
	# the door's ring: red while it's shut, amber blinking as the wheel turns, green as it opens,
	# then the room's light
	var ring := RED * (0.7 + 0.3 * sin(_time * 2.0))
	if mode == "single" or mode == "ten":
		if _t < T_BOLTS:
			ring = AMBER * (0.4 + 0.6 * (1.0 if fmod(_t * 3.0, 1.0) >= 0.5 else 0.0))
		elif _t < T_POD + 0.6:
			ring = GREEN
		else:
			ring = b
	elif mode != "idle" or _swing > 0.0:
		ring = b
	ring = ring.lerp(alarm_col * (0.3 + 0.7 * blink), _alarm).lerp(GOLD * 1.4, _gold)
	_ring_mat.set_shader_parameter("color", ring)
	_ring_mat.set_shader_parameter("color2", ring)
	_sign_bar.set_shader_parameter("color", b)
	_sign_bar.set_shader_parameter("color2", b)
	var spill := Vector3(1.0, 0.82, 0.6).lerp(_tint, _tint_k * 0.6).lerp(GOLD, _gold)
	for m in [_wall_mat, _floor_mat]:
		m.set_shader_parameter("mood_a", a)
		m.set_shader_parameter("mood_b", b)
		m.set_shader_parameter("ring_col", ring)
		m.set_shader_parameter("flash", _flash * _flash)
		m.set_shader_parameter("flash_col", _flash_col)
	_wall_mat.set_shader_parameter("alarm", _alarm)
	_wall_mat.set_shader_parameter("alarm_col", RED)
	_wall_mat.set_shader_parameter("gold", _gold)
	_floor_mat.set_shader_parameter("open", _open)
	_floor_mat.set_shader_parameter("spill_col", spill)
	_floor_mat.set_shader_parameter("dial", _wheel_a * 0.25)
	_floor_mat.set_shader_parameter("pod", _pod_glow)
	_floor_mat.set_shader_parameter("pads", _pads)
	_tunnel_mat.set_shader_parameter("open", _open)
	_tunnel_mat.set_shader_parameter("tint", spill)
	_cap_mat.set_shader_parameter("open", _open)
	_cap_mat.set_shader_parameter("tint", spill)
	_spill.light_energy = _open * (2.2 + _gold * 2.0)
	_spill.light_color = Color(spill.x, spill.y, spill.z)
	_inner.light_energy = _open * 3.0
	_inner.light_color = _spill.light_color
	# the beacons: dark domes until the alarm trips, then turning red (gold for an Epic)
	var beacon := clampf(alarm_k, 0.0, 1.0)
	_beacon_mat.set_shader_parameter("color", alarm_col * (0.15 + beacon * 3.0))
	_beacon_mat.set_shader_parameter("color2", alarm_col * (0.15 + beacon * 3.0))
	_beam_ray.set_shader_parameter("color", alarm_col * 1.2)
	_beam_ray.set_shader_parameter("alpha", beacon)
	var spin := (7.0 * _alarm + 2.5 * _gold * (1.0 - _alarm))
	for k in _beacons.size():
		var bh := _beacons[k]
		bh.rotation.y += spin * dt * (1.0 if k == 0 else -1.0)
		bh.visible = true
		for c in bh.get_children():
			if c is Node3D and not (c is SpotLight3D):
				(c as Node3D).visible = beacon > 0.01
		var sp := _alarm_spots[k]
		sp.visible = beacon > 0.01
		sp.light_energy = beacon * 6.0
		sp.light_color = Color(alarm_col.x, alarm_col.y, alarm_col.z)
	_alarm_light.visible = _alarm > 0.01
	_alarm_light.light_energy = _alarm * (0.6 + 2.4 * blink * blink)
	# the lasers: snapping on one after another, sweeping slowly up and down
	var n_on := int(ceil(_laser * LASERS.size() - 0.001)) if _laser_to > 0.0 else (LASERS.size() if _laser > 0.0 else 0)
	if n_on > _laser_on and _laser_to > 0.0:
		sound.play("laser", 0.35, 0.9 + 0.05 * n_on)
	_laser_on = n_on
	var lc := RED.lerp(GOLD, _gold) * (2.5 + blink * 0.5)
	var lvl := clampf(_laser if _laser_to <= 0.0 else 1.0, 0.0, 1.0)
	_laser_core.set_shader_parameter("color", lc)
	_laser_core.set_shader_parameter("alpha", lvl * 1.4)
	_laser_glow.set_shader_parameter("color", lc * 0.35)
	_laser_glow.set_shader_parameter("alpha", lvl)
	for i in _lasers.size():
		var l: Array = LASERS[i]
		var mi := _lasers[i]
		mi.visible = i < n_on and lvl > 0.01
		if mi.visible:
			mi.position.y = float(l[1]) + sin(_time * (0.9 + i * 0.13) + i * 1.7) * 0.35
			mi.rotation.z = PI * 0.5 + float(l[2]) + sin(_time * 0.6 + i) * 0.06
	# the alarm's klaxon while it's tripped
	if _alarm_to > 0.5 and _time >= _alarm_next:
		sound.play("alarm", 0.5)
		_alarm_next = _time + 1.05
	# the status panel
	_status_set()


func _status_set() -> void:
	var text := "SECURE"
	var col := NEON_B
	if mode == "single" or mode == "ten":
		if _t < T_BOLTS:
			text = "VERIFYING"
			col = AMBER
		elif _t < T_POD + 0.6:
			text = "ACCESS GRANTED"
			col = GREEN
		else:
			text = "RETRIEVING"
			col = NEON_B
		if _shown_tier == 1:
			text = "RARE SIGNAL"
			col = _v(Skins.RARITY_COL[1].srgb_to_linear())
		if _alarm_to > 0.5:
			text = "!! ALERT !!"
			col = RED
	elif mode == "reveal" or mode == "orbs":
		text = "ACCESS GRANTED"
		col = GREEN
	if _gold > 0.5:
		text = "EPIC"
		col = GOLD
	if text != _status_text:
		_status_text = text
		_status.text = text
	var blink := 1.0 if _alarm < 0.5 else (0.3 + 0.7 * (1.0 if fmod(_time * 3.0, 1.0) >= 0.5 else 0.0))
	_status.modulate = Color(col.x * 2.0, col.y * 2.0, col.z * 2.0) * blink


## A hop from a to b, `h` high at its top, k 0..1 along it.
static func _hop(a: Vector3, b: Vector3, h: float, k: float) -> Vector3:
	return a.lerp(b, k) + Vector3(0, 4.0 * h * k * (1.0 - k), 0)


func _once(id: String) -> bool:
	if _done_beats.has(id):
		return false
	_done_beats[id] = true
	return true


func _thud(k: float) -> void:
	if game != null and game.sfx != null:
		game.sfx.thud(k)


# ------------------------------------------------------------------------------ the door opening

## The opening, shared by both pulls: the wheel spins, then the bolts draw back, the door pulls out
## of its seal and swings open; the pods set off at T_POD.
const T_BOLTS := 1.05
const T_UNSEAL := 1.5
const T_SWING := 1.8
const T_POD := 2.75


## The door's moments (sounds, steam, shakes) and the camera on it, until T_POD.
func _opening(dt: float) -> void:
	var t := _t
	if _once("wheel"):
		sound.play("crank", 0.75)
	if t >= T_BOLTS and _once("bolts"):
		sound.play("bolts", 0.85)
		if game != null:
			game.director.shake(0.15)
	if t >= T_UNSEAL and _once("unseal"):
		sound.play("hiss", 0.8)
		_steam.restart()
		_thud(0.6)
		if game != null:
			game.director.shake(0.3)
	if mode == "single":
		if t < T_SWING:
			_cam_pos = DOOR + Vector3(2.0, -1.1, 6.4)
			_cam_look = DOOR + Vector3(0.0, -0.25, 0.0)
		else:
			_cam_pos = DOOR + Vector3(2.8, -1.25, 8.2)
			_cam_look = DOOR + Vector3(-0.3, -0.8, -1.0)
		_cam_fov = 1.0
		_cam_lambda = 1.6 if t < T_SWING else 1.3


# ------------------------------------------------------------------------------ one pull

## The pod's glide out of the vault to where it hovers.
const T_GLIDE := 1.3
const T_REST := T_POD + T_GLIDE + 0.25


func _glide(k: float) -> Vector3:
	var a := Vector3(DOOR.x, 1.55, DOOR.z - 2.6)
	var b := Vector3(DOOR.x, 1.6, DOOR.z + 0.4)
	var c := HERO + Vector3(0, HOVER + 0.15, -1.6)
	var d := HERO + Vector3(0, HOVER, 0)
	var u := 1.0 - k
	return a * u * u * u + b * 3.0 * u * u * k + c * 3.0 * u * k * k + d * k * k * k


func _single(dt: float) -> void:
	var t := _t
	if t < T_POD:
		_opening(dt)
		return
	if _once("pod"):
		_hero.visible = true
		_trail.position = _glide(0.0)
		_trail.restart()
		sound.play("chute", 0.8)
	var rest := HERO + Vector3(0, HOVER, 0)
	var lc0 := _v(Skins.RARITY_COL[0].srgb_to_linear())
	if t < T_REST:
		var k := smoothstep(0.0, 1.0, clampf((t - T_POD) / T_GLIDE, 0.0, 1.0))
		var p := _glide(k)
		if t - T_POD >= T_GLIDE:
			p = rest + Vector3(0, 0.04 * sin((t - T_POD - T_GLIDE) * 12.0) * exp(-(t - T_POD - T_GLIDE) * 6.0), 0)
			if _once("arrive"):
				_thud(0.25)
		_hero.position = p
		# its trail: pale for a Common, violet for anything better (an Epic keeps its secret)
		var tc: Color = Skins.RARITY_COL[mini(_tier, 1)]
		_trail.color = Color(tc.r * 1.8, tc.g * 1.8, tc.b * 1.8)
		_trail.position = p
		_trail.emitting = k < 0.97
		# leaning into the glide, turning slowly
		_hero.basis = Basis(Vector3.RIGHT, (1.0 - k) * k * 1.2) * Basis(Vector3.UP, t * 1.4)
		_pod_glow = Vector3(p.x, p.z, 0.9 * (1.0 - smoothstep(0.8, 2.0, p.y)))
		_floor_mat.set_shader_parameter("pod_col", lc0)
		_cam_pos = p + Vector3(2.3, 0.45, 3.4)
		_cam_look = p + Vector3(0, -0.1, -0.5)
		_cam_fov = 1.0
		_cam_lambda = 2.6
		return
	var len_c: float = CHARGE[_tier]
	var ct := t - T_REST
	var k := clampf(ct / len_c, 0.0, 1.0)
	if not _done_beats.has("burst"):
		if _once("charge"):
			sound.play("riser", 0.85, 1.9 / len_c)
		# the tease: violet breaks through for a Rare or better; an Epic then sets the vault off
		if _tier >= 1 and k > 0.42 and not _cracked[0]:
			_cracked[0] = true
			_shown_tier = 1
			sound.play("crack", 0.8)
			game.director.shake(0.25)
			_tint = _v(Skins.RARITY_COL[1].srgb_to_linear())
			_tint_to = 0.75
		if _tier >= 2 and k > 0.6 and not _cracked[1]:
			_cracked[1] = true
			_shown_tier = 2
			sound.play("crack", 1.0, 1.35)
			game.director.shake(0.45)
			_flash = 0.55
			_flash_col = RED
			_alarm_to = 1.0
			_alarm_next = _time
			_laser_to = 1.0
		var sc: Vector3 = _v(Skins.RARITY_COL[mini(_shown_tier, 1)].srgb_to_linear())
		if _shown_tier == 2:
			# (red and gold fighting in its seam)
			sc = RED.lerp(GOLD, pow(0.5 + 0.5 * sin(ct * 23.0), 6.0))
		var pulse_k := 0.5 + 0.5 * sin(ct * (8.0 + k * 30.0))
		var power := 0.15 + k * 0.75 + pulse_k * 0.15 * k
		_hero_mat.set_shader_parameter("seam_col", sc)
		_hero_mat.set_shader_parameter("charge", power)
		_hero_mat.set_shader_parameter("crack", smoothstep(0.5, 1.0, k) * (0.5 + 0.25 * _shown_tier))
		# it rises, spinning faster and faster, shuddering
		var up := smoothstep(0.0, 0.35, ct)
		var spin := ct * (2.0 + k * 10.0) + k * k * 8.0
		var shudder := Vector3(sin(ct * 61.0), 0, cos(ct * 53.0)) * 0.02 * k * (1.0 + _shown_tier)
		_hero.basis = Basis(Vector3.UP, spin + t * 1.4)
		_hero.position = rest.lerp(HERO + Vector3(0, 1.35, 0), up) + shudder
		_pod_glow = Vector3(HERO.x, HERO.z, 0.9 + power * 2.0)
		_floor_mat.set_shader_parameter("pod_col", sc)
		_burst_light.position = _hero.position
		_burst_light.light_color = Color(sc.x, sc.y, sc.z)
		_burst_light.light_energy = maxf(_burst_light.light_energy, power * 3.0)
		game.director.shake(k * k * dt * (0.6 + _shown_tier * 0.5))
		# the camera pushes in and slowly circles
		var a := 0.35 - k * 0.5
		var r := 3.9 - k * 1.4
		_cam_pos = HERO + Vector3(sin(a) * r, 1.3 + k * 0.15, cos(a) * r)
		_cam_look = HERO + Vector3(0, 1.3, 0)
		_cam_fov = 1.0 - k * 0.12
		_cam_lambda = 3.0
		if k >= 1.0:
			_burst(false)
		return
	# after the burst: hold on the light, then cut to the robot
	if t > _burst_t + 0.85 and _once("reveal"):
		_reveal()


var _burst_t := 0.0


## The pod bursts: its halves fly apart, a flash and a ring of light, sparks and confetti; an Epic
## stops the alarm dead and turns the whole vault gold under a shower of coins.
func _burst(quiet: bool) -> void:
	if not _once("burst"):
		return
	_burst_t = _t
	_shown_tier = _tier
	var col: Color = Skins.RARITY_COL[_tier]
	var lc := _v(col.srgb_to_linear())
	var at := HERO + Vector3(0, 1.35, 0)
	_hero.visible = false
	_pod_glow = Vector3.ZERO
	_alarm_to = 0.0
	_alarm_next = INF
	_tint = lc
	_tint_to = 0.0 if _tier == 0 else 0.8
	if _tier == Skins.EPIC:
		_gold_to = 1.0
		_laser_to = 0.0
	sound.stop_all()
	if not quiet:
		sound.play("burst", 0.9)
		sound.play("chime%d" % _tier, 0.85)
		for i in 2:
			var h := _halves[i]
			var m := h.material_override as ShaderMaterial
			m.set_shader_parameter("top_col", _hero_mat.get_shader_parameter("top_col"))
			m.set_shader_parameter("seam_col", lc)
			m.set_shader_parameter("charge", 0.6)
			h.visible = true
			h.position = at
			h.basis = _hero.basis
			var side := Vector3(-1.0 if i == 0 else 1.0, 0, 0)
			_halves_v[i] = (Vector3(0, 4.5 if i == 0 else -1.0, 1.2) + side * 2.6)
			_halves_w[i] = Vector3(_rng.randf_range(-6, 6), _rng.randf_range(-6, 6), _rng.randf_range(-6, 6))
		_burst_light.position = at
		_burst_light.light_color = col
		_burst_light.light_energy = 14.0 + 8.0 * _tier
		_flash = 0.7 + 0.25 * _tier
		_flash_col = lc
		_shock.position = at
		_shock.rotation = Vector3(PI * 0.5 - 0.3, 0, 0)
		_shock_mat.set_shader_parameter("color", lc * 3.0)
		_shock_t = 0.0
		_pulse = 0.0
		_floor_mat.set_shader_parameter("pulse_col", lc)
		_floor_mat.set_shader_parameter("pulse_at", Vector2(HERO.x, HERO.z))
		_confetti.position = at
		if _tier >= 1:
			_confetti.amount = 80 if _tier == 1 else 160
			_confetti.restart()
		if _tier == Skins.EPIC:
			_coins.position = at
			_coins.restart()
			sound.play("coin", 0.7)
		if game != null:
			game.director.shake(0.5 + 0.2 * _tier)
			if game.effects != null and game.effects.fx != null:
				var hex := col.to_html(false).hex_to_int()
				game.effects.fx.burst(at, hex, 40 + 30 * _tier, 5.0 + _tier)
				game.effects.fx.flash(at, hex, 2.2 + _tier, 0.25)
	beat.emit("burst", _tier)


## One pull's end: the camera cuts to the robot and the new skin paints on in a beam of light.
func _reveal() -> void:
	_done_beats["reveal"] = true
	var r: Dictionary = _results[0]
	show_on_robot(String(r.skin.id))
	beat.emit("reveal", r)


func _dust(p: Vector3) -> void:
	if game != null and game.effects != null and game.effects.fx != null:
		game.effects.fx.dust(p, 6, 0.6)


# ------------------------------------------------------------------------------ ten pulls

const TEN_EVERY := 0.17
const TEN_FLY := 0.7


func _ten_tick(dt: float) -> void:
	var t := _t
	var n := _results.size()
	_wide_cam(clampf((t - 0.6) / 4.0, 0.0, 1.0))
	if t < T_POD:
		_opening(dt)
		_orbs_tick()
		return
	var from := Vector3(DOOR.x, 1.55, DOOR.z - 2.4)
	# the pods fly out of the vault one by one, land on their pads and bob to a stop
	var all_down := true
	for i in n:
		var t0 := T_POD + i * TEN_EVERY
		var c := _ten[i]
		if _pop_at[i] >= 0.0:
			continue
		if t < t0:
			all_down = false
			continue
		if _once("launch%d" % i):
			sound.play("chute", 0.35, 1.2 + 0.03 * i)
		c.visible = true
		var k := (t - t0) / TEN_FLY
		var s: Vector3 = _slots[i] + Vector3(0, HOVER_TEN, 0)
		if k < 1.0:
			all_down = false
			c.position = _hop(from, s, 1.1, k)
			c.basis = Basis(Vector3.UP, k * 9.0 + i) * Basis(Vector3.RIGHT, sin(k * PI) * 0.5)
		else:
			if _once("land%d" % i):
				_thud(0.3)
				_dust(_slots[i])
			var k2 := minf(1.0, (t - t0 - TEN_FLY) / 0.3)
			c.position = s + Vector3(0, -0.12 * sin(k2 * PI) * (1.0 - k2), 0)
			c.basis = Basis(Vector3.UP, 9.0 + i + (t - t0 - TEN_FLY) * 1.2)
			if k2 < 1.0:
				all_down = false
	if all_down and _once("all_down"):
		_pop_from = t + 0.35
	if _pop_from < 0.0:
		return
	# then they pop, one after another; an Epic trips the alarm and glows before it goes
	var at := _pop_from
	for i in n:
		var tier := int(_results[i].skin.r)
		var wait := 0.85 if tier == Skins.EPIC else 0.0
		if _pop_at[i] < 0.0:
			if t >= at and t < at + wait:
				var k := (t - at) / wait
				_ten[i].position = _slots[i] + Vector3(0, HOVER_TEN, 0) + Vector3(sin(t * 70.0), 0, cos(t * 63.0)) * 0.025 * (1.0 + k)
				_ten_mat[i].set_shader_parameter("seam_col", RED.lerp(GOLD, 0.5 + 0.5 * sin(t * 26.0)))
				_ten_mat[i].set_shader_parameter("charge", 0.3 + k * 0.7)
				if _once("tremble%d" % i):
					sound.play("riser", 0.5, 3.0)
					_alarm_to = 1.0
					_alarm_next = _time
					_laser_to = 1.0
			elif t >= at + wait:
				_pop(i, false)
				_pop_at[i] = t
			break
		at = _pop_at[i] + 0.26
	_orbs_tick()
	if _pops >= n and t > _last_pop + 0.7 and _once("cards"):
		_cards()


var _pop_from := -1.0
var _last_pop := 0.0


## Pod i pops into a hovering light in its rarity's colour (an Epic's turns the vault gold a while).
func _pop(i: int, quiet: bool) -> void:
	if _pop_at[i] >= 0.0:
		return
	_pop_at[i] = _t
	_last_pop = _t
	_pops += 1
	var tier := int(_results[i].skin.r)
	var col: Color = Skins.RARITY_COL[tier]
	var lc := _v(col.srgb_to_linear())
	_ten[i].visible = false
	var o := _orbs[i]
	o.visible = true
	o.position = _slots[i] + Vector3(0, 1.3, 0)
	# (a little deeper than the rarity's own colour, so even a Common's pale blue reads as a colour)
	var deep := _v(col.lerp(Color(col.r * col.r, col.g * col.g, col.b * col.b), 0.6).srgb_to_linear())
	_orb_mat[i].set_shader_parameter("color", deep)
	_orb_mat[i].set_shader_parameter("energy", 2.2 + tier * 1.2)
	_halo_mat[i].set_shader_parameter("color", deep)
	_halo_mat[i].set_shader_parameter("energy", 0.7 + tier * 0.5)
	o.scale = Vector3.ONE * (0.32 + tier * 0.12)
	if quiet:
		return
	sound.play("pop", 0.7 + tier * 0.15, 1.0 + (2 - tier) * 0.12)
	if tier >= 1:
		sound.play("chime%d" % tier, 0.5 + tier * 0.15)
	if game != null and game.effects != null and game.effects.fx != null:
		var hex := col.to_html(false).hex_to_int()
		game.effects.fx.burst(o.position, hex, 14 + tier * 22, 2.5 + tier * 1.5)
		game.effects.fx.flash(o.position, hex, 0.8 + tier * 0.9, 0.18)
	if tier == Skins.EPIC:
		_flash = 0.6
		_flash_col = lc
		_alarm_to = 0.0
		_alarm_next = INF
		_laser_to = 0.0
		_gold_to = 1.0
		_gold_until = _time + 2.2
		_burst_light.position = o.position
		_burst_light.light_color = col
		_burst_light.light_energy = 16.0
		_confetti.position = o.position
		_confetti.amount = 120
		_confetti.restart()
		_coins.position = o.position
		_coins.restart()
		sound.play("coin", 0.6)
		_shock.position = o.position
		_shock.rotation = Vector3(PI * 0.5, 0, 0)
		_shock_mat.set_shader_parameter("color", lc * 3.0)
		_shock_t = 0.0
		if game != null:
			game.director.shake(0.55)
	beat.emit("pop", [i, tier])


## The lights bob where their pods were.
func _orbs_tick() -> void:
	for i in _orbs.size():
		var o := _orbs[i]
		if not o.visible or i >= _slots.size():
			continue
		var tier := int(_results[i].skin.r) if i < _results.size() else 0
		o.position = _slots[i] + Vector3(0, 1.3 + sin(_time * 2.0 + i) * 0.08, 0)
		var s := (0.32 + tier * 0.12) * (1.0 + 0.06 * sin(_time * 5.0 + i * 1.3))
		o.scale = Vector3.ONE * s


func _cards() -> void:
	_done_beats["cards"] = true
	mode = "orbs"
	beat.emit("cards", null)
