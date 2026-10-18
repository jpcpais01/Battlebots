## The Skin Vault's own place (app/gacha/vault_screen.gd): a round platform of violet glass
## floating in deep space under a ringed planet, the player's robot on a glowing turntable at the
## front, and behind it a giant gumball machine, its glass globe heaped with skin capsules, ringed
## with chasing bulbs and orbited by two neon rings, under a neon sign. Capsules drift in the sky.
## Game builds it the first time the world goes to "vault" (Game.PLACES) and calls enter(game),
## exit() and update(dt, time) round it: it lights the world its own way meanwhile
## (HomeStage.HomeLook) and flies its own camera (the director's "scene" mode).
##
## The pulls play out here (app/gacha/pull_show.gd drives them and puts the words and buttons
## over them). play(results, spec): the robot steps aside and the camera flies to the machine, its
## crank turns and the capsules churn in the globe. One pull: a capsule drops out of the chute,
## bounces and rolls out, rises and charges (its seam teasing violet for a Rare, then gold for an
## Epic), and bursts; the camera cuts to the robot as a beam of light paints the skin onto it. Ten:
## ten capsules shoot out and land in an arc, then pop one after another into hovering lights in
## their rarity's colour, an Epic trembling first. Each moment is told through `beat`.
class_name VaultStage
extends Node3D

## A moment of a pull: "burst" (the tier), "reveal" (the result shown on the robot), "pop"
## ([index, tier]), "cards" (the ten have all popped), "robot" (a skin shown on the robot).
signal beat(what: String, data)

## The machine's middle on the floor; the platform's middle; where one capsule rolls to.
const MACHINE := Vector3(0.4, 0.0, -9.0)
## The machine's scale (its measurements below are before it).
const MS := 0.8
const CENTER := Vector3(-0.3, 0.0, -3.8)
const RADIUS := 7.8
const HERO := Vector3(0.3, 0.0, -4.2)
## The machine's measurements: plinth, body, globe and the chute's mouth.
const PLINTH := Vector2(2.7, 0.5)
const BODY := Vector2(2.15, 3.0)
const GLOBE_R := 2.85
const GLOBE_Y := 5.85
const CHUTE := Vector3(0.0, 1.15, 2.25)
## The pile in the globe, the capsules drifting in the sky, the bulbs.
const PILE := 46
const DRIFT := 16
const BULBS_TOP := 30
const BULBS_FOOT := 36
## A pull's capsule: radius and half its length (the mesh runs -LEN..LEN).
const CAP_R := 0.3
const CAP_LEN := 0.5
## How long a capsule charges before it bursts, by the rarity inside.
const CHARGE := [1.15, 1.8, 2.6]
## Gumball colours for the capsules' tops (sRGB).
const TOPS := [0xff3b5c, 0xffc23d, 0x3fa9ff, 0x45e08a, 0xff6ad5, 0x9b6bff, 0xff8a2a, 0x2ee6d6]
## The vault's light (HomeStage.HomeLook): a violet night, a cool key over the turntable, a
## magenta rim behind and a cyan one at the side.
const LOOK := {
	"background": 0x0a0618, "fog": 0x1a0f33, "fogDensity": 0.004, "envIntensity": 0.8,
	"hemi": {"sky": 0x7a5ad8, "ground": 0x2a1440, "intensity": 0.75},
	"key": {"color": 0xf6f0ff, "intensity": 3.4, "pos": [1.4, 5.2, 3.4], "target": [0, 0.9, 0], "angle": 0.6, "penumbra": 0.7, "near": 0.5, "far": 10},
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
## Whether the robot is on its turntable (it steps aside while the machine plays; a new showcase
## built meanwhile is put away too).
var _robot_on := true
var _look := HomeStage.HomeLook.new()
var _sky: Sky
var _space: MeshInstance3D
var _space_mat: ShaderMaterial
var _floor_mat: ShaderMaterial
var _glass_mat: ShaderMaterial
var _globe_light: OmniLight3D
var _burst_light: OmniLight3D
var _crank: Node3D
var _flap: Node3D
var _pile: MultiMesh
var _pile_rest: Array[Transform3D] = []
var _drift: MultiMesh
var _drift_seed: Array[Vector4] = []
var _bulbs: Array[ShaderMaterial] = []
var _rings: Array[Node3D] = []
var _sign: Array[Label3D] = []

var _cap_mesh: CapsuleMesh
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
var _shock: MeshInstance3D
var _shock_mat: ShaderMaterial
var _beam: MeshInstance3D
var _beam_mat: ShaderMaterial
var _confetti: CPUParticles3D

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
var _churn := 0.0
var _churn_to := 0.0
var _churn_ph := 0.0
var _crank_v := 0.0
var _crank_a := 0.0
var _flap_to := 0.0
var _glow := 0.0
var _flash := 0.0
var _pulse := -1.0
var _beam_t := -1.0
var _shock_t := -1.0
var _shown_tier := 0
var _cracked := [false, false]
var _done_beats := {}
var _pops := 0
var _rng := RandomNumberGenerator.new()
## A ten-pull's capsule launch times and slots, and each one's pop time (-1 not yet).
var _slots: Array[Vector3] = []
var _pop_at: Array[float] = []


func _init() -> void:
	name = "vault"
	visible = false
	_rng.randomize()
	add_child(sound)
	_build_space()
	_build_platform()
	_build_machine()
	_build_drift()
	_build_pull_props()
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = preload("res://render/vault/vault_env.gdshader")
	sky_mat.set_shader_parameter("intensity", LOOK.envIntensity)
	_sky = Sky.new()
	_sky.sky_material = sky_mat
	_sky.process_mode = Sky.PROCESS_MODE_QUALITY
	_sky.radiance_size = Sky.RADIANCE_SIZE_128


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


func _build_space() -> void:
	var s := SphereMesh.new()
	s.radius = 50.0
	s.height = 100.0
	s.radial_segments = 24
	s.rings = 12
	_space_mat = ShaderMaterial.new()
	_space_mat.shader = preload("res://render/vault/vault_space.gdshader")
	_space = _mesh(s, _space_mat)
	_space.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_space.extra_cull_margin = 16384.0


func _build_platform() -> void:
	var c := CylinderMesh.new()
	c.top_radius = RADIUS
	c.bottom_radius = RADIUS - 1.4
	c.height = 0.9
	c.radial_segments = 96
	c.rings = 1
	_floor_mat = ShaderMaterial.new()
	_floor_mat.shader = preload("res://render/vault/vault_floor.gdshader")
	_floor_mat.set_shader_parameter("center", Vector2(CENTER.x, CENTER.z))
	_floor_mat.set_shader_parameter("table", Vector2.ZERO)
	_floor_mat.set_shader_parameter("radius", RADIUS)
	_floor_mat.set_shader_parameter("table_col", Vector3(0.9, 0.3, 1.0))
	var f := _mesh(c, _floor_mat, CENTER + Vector3(0, -0.45, 0))
	f.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# a cone of light under it, fading into the void
	var under := CylinderMesh.new()
	under.top_radius = RADIUS - 1.5
	under.bottom_radius = 0.6
	under.height = 3.5
	under.radial_segments = 48
	under.cap_top = false
	under.cap_bottom = false
	var um := ShaderMaterial.new()
	um.shader = preload("res://render/vault/vault_beam.gdshader")
	um.set_shader_parameter("color", Vector3(0.35, 0.12, 0.6))
	um.set_shader_parameter("alpha", 0.6)
	um.set_shader_parameter("fade", -1.0)
	_mesh(under, um, CENTER + Vector3(0, -2.65, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _build_machine() -> void:
	var root := Node3D.new()
	root.name = "machine"
	root.position = MACHINE
	root.scale = Vector3.ONE * MS
	add_child(root)
	var red := _std(0xe0203f, 0.25, 0.2)
	red.clearcoat_enabled = true
	red.clearcoat = 0.8
	red.clearcoat_roughness = 0.1
	var gold := _std(0xffc04a, 1.0, 0.22)
	var chrome := _std(0xe8eef6, 1.0, 0.08)
	var dark := _std(0x120a1c, 0.6, 0.4)
	# the plinth, the body and the collar the globe sits in
	var pl := CylinderMesh.new()
	pl.top_radius = PLINTH.x - 0.15
	pl.bottom_radius = PLINTH.x
	pl.height = PLINTH.y
	pl.radial_segments = 64
	_mesh(pl, dark, Vector3(0, PLINTH.y * 0.5, 0), root)
	var body := CylinderMesh.new()
	body.top_radius = BODY.x - 0.25
	body.bottom_radius = BODY.x
	body.height = BODY.y
	body.radial_segments = 64
	_mesh(body, red, Vector3(0, PLINTH.y + BODY.y * 0.5, 0), root)
	for y in [PLINTH.y + 0.08, PLINTH.y + BODY.y - 0.02]:
		var t := TorusMesh.new()
		var r: float = BODY.x + 0.04 if y < 1.0 else BODY.x - 0.2
		t.inner_radius = r - 0.12
		t.outer_radius = r + 0.12
		t.rings = 64
		t.ring_segments = 12
		_mesh(t, gold, Vector3(0, y, 0), root)
	var top_y := PLINTH.y + BODY.y
	var collar := CylinderMesh.new()
	collar.top_radius = 1.95
	collar.bottom_radius = 2.0
	collar.height = 0.45
	collar.radial_segments = 64
	_mesh(collar, gold, Vector3(0, top_y + 0.2, 0), root)
	# the globe and its lid
	var g := SphereMesh.new()
	g.radius = GLOBE_R
	g.height = GLOBE_R * 2.0
	g.radial_segments = 64
	g.rings = 32
	_glass_mat = ShaderMaterial.new()
	_glass_mat.shader = preload("res://render/vault/vault_glass.gdshader")
	_glass_mat.render_priority = 1
	var glass := _mesh(g, _glass_mat, Vector3(0, GLOBE_Y, 0), root)
	glass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var lid := CylinderMesh.new()
	lid.top_radius = 0.75
	lid.bottom_radius = 1.05
	lid.height = 0.55
	lid.radial_segments = 48
	_mesh(lid, red, Vector3(0, GLOBE_Y + GLOBE_R - 0.12, 0), root)
	var knob := SphereMesh.new()
	knob.radius = 0.32
	knob.height = 0.64
	_mesh(knob, gold, Vector3(0, GLOBE_Y + GLOBE_R + 0.32, 0), root)
	# the chute: a dark mouth in a gold frame, its flap hinged at the top
	var front := CHUTE
	var mouth := BoxMesh.new()
	mouth.size = Vector3(1.3, 1.0, 0.5)
	_mesh(mouth, _std(0x05030a, 0.0, 0.9), front + Vector3(0, 0, -0.2), root)
	var frame_mat := _neon(_v(_lin(0xffb84a)), 3.5)
	for b in [[Vector3(1.5, 0.1, 0.12), Vector3(0, 0.55, 0)], [Vector3(1.5, 0.1, 0.12), Vector3(0, -0.55, 0)], [Vector3(0.1, 1.2, 0.12), Vector3(0.7, 0, 0)], [Vector3(0.1, 1.2, 0.12), Vector3(-0.7, 0, 0)]]:
		var bm := BoxMesh.new()
		bm.size = b[0]
		_mesh(bm, frame_mat, front + (b[1] as Vector3), root)
	_flap = Node3D.new()
	_flap.position = front + Vector3(0, 0.5, 0.06)
	root.add_child(_flap)
	var fm := BoxMesh.new()
	fm.size = Vector3(1.24, 0.98, 0.05)
	_mesh(fm, chrome, Vector3(0, -0.49, 0), _flap)
	# a tray under the chute
	var tray := BoxMesh.new()
	tray.size = Vector3(1.5, 0.12, 0.7)
	_mesh(tray, gold, front + Vector3(0, -0.62, 0.28), root)
	# the crank on its right side: a chrome disc with its handle, turning as a pull is paid
	_crank = Node3D.new()
	_crank.position = Vector3(BODY.x - 0.2, 2.1, 0.0)
	_crank.rotation.y = PI * 0.5
	root.add_child(_crank)
	var disc := CylinderMesh.new()
	disc.top_radius = 0.55
	disc.bottom_radius = 0.55
	disc.height = 0.16
	disc.radial_segments = 40
	var dmi := _mesh(disc, chrome, Vector3(0, 0, 0.1), _crank)
	dmi.rotation.x = PI * 0.5
	var arm := BoxMesh.new()
	arm.size = Vector3(0.95, 0.16, 0.12)
	_mesh(arm, gold, Vector3(0.3, 0, 0.26), _crank)
	var kn := CylinderMesh.new()
	kn.top_radius = 0.1
	kn.bottom_radius = 0.12
	kn.height = 0.4
	var kmi := _mesh(kn, red, Vector3(0.72, 0, 0.44), _crank)
	kmi.rotation.x = PI * 0.5
	# the pile in the globe
	_cap_mesh = CapsuleMesh.new()
	_cap_mesh.radius = CAP_R
	_cap_mesh.height = CAP_LEN * 2.0
	_cap_mesh.radial_segments = 20
	_cap_mesh.rings = 6
	var small := CapsuleMesh.new()
	small.radius = 0.27
	small.height = 0.84
	small.radial_segments = 14
	small.rings = 4
	var pm := ShaderMaterial.new()
	pm.shader = preload("res://render/vault/vault_capsule.gdshader")
	pm.set_shader_parameter("use_instance", true)
	pm.set_shader_parameter("len", 0.42)
	pm.set_shader_parameter("seam_col", Vector3(1.0, 0.85, 0.6))
	pm.set_shader_parameter("charge", 0.08)
	_pile = MultiMesh.new()
	_pile.transform_format = MultiMesh.TRANSFORM_3D
	_pile.use_colors = true
	_pile.mesh = small
	_pile.instance_count = PILE
	var r := RandomNumberGenerator.new()
	r.seed = 77
	var placed: Array[Vector3] = []
	var tries := 0
	while placed.size() < PILE and tries < 4000:
		tries += 1
		var p := Vector3(r.randf_range(-1, 1), r.randf_range(-1, 0.25), r.randf_range(-1, 1)) * (GLOBE_R - 0.55)
		if p.length() > GLOBE_R - 0.55:
			continue
		var ok := true
		for q in placed:
			if q.distance_to(p) < 0.62:
				ok = false
				break
		if ok:
			placed.append(p)
	# (settled: the lowest first, so the heap looks heaped)
	placed.sort_custom(func(a: Vector3, b: Vector3) -> bool: return a.y < b.y)
	for i in placed.size():
		var b := Basis.from_euler(Vector3(r.randf() * TAU, r.randf() * TAU, r.randf() * TAU))
		var xf := Transform3D(b, placed[i] + Vector3(0, GLOBE_Y, 0))
		_pile_rest.append(xf)
		_pile.set_instance_transform(i, xf)
		_pile.set_instance_color(i, Color.hex((int(TOPS[i % TOPS.size()]) << 8) | 0xff))
	_pile.instance_count = placed.size()
	var pmi := MultiMeshInstance3D.new()
	pmi.multimesh = _pile
	pmi.material_override = pm
	root.add_child(pmi)
	_globe_light = OmniLight3D.new()
	_globe_light.position = Vector3(0, GLOBE_Y + 0.3, 0)
	_globe_light.light_color = Color(1.0, 0.55, 0.85)
	_globe_light.light_energy = 1.2
	_globe_light.omni_range = 7.5
	root.add_child(_globe_light)
	# the bulbs round the collar and the plinth, chasing
	for ring in [[BULBS_TOP, BODY.x - 0.05, PLINTH.y + BODY.y + 0.2, 0xffd36a, 0xff5ad0], [BULBS_FOOT, PLINTH.x - 0.12, PLINTH.y + 0.02, 0x6ae6ff, 0xffd36a]]:
		var n: int = ring[0]
		var sm := SphereMesh.new()
		sm.radius = 0.075
		sm.height = 0.15
		sm.radial_segments = 8
		sm.rings = 4
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = sm
		mm.instance_count = n
		for i in n:
			var a := TAU * i / n
			mm.set_instance_transform(i, Transform3D(Basis(), Vector3(sin(a) * float(ring[1]), float(ring[2]), cos(a) * float(ring[1]))))
		var bm := _neon(_v(_lin(ring[3])), 4.0)
		bm.set_shader_parameter("color2", _v(_lin(ring[4])))
		bm.set_shader_parameter("count", 6.0)
		bm.set_shader_parameter("speed", 0.6)
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = bm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(mmi)
		_bulbs.append(bm)
	# two neon rings orbiting the globe
	for k in 2:
		var pivot := Node3D.new()
		pivot.position = Vector3(0, GLOBE_Y, 0)
		root.add_child(pivot)
		var tr := TorusMesh.new()
		tr.inner_radius = GLOBE_R + 0.32
		tr.outer_radius = GLOBE_R + 0.4
		tr.rings = 96
		tr.ring_segments = 6
		var rm := _neon(_v(_lin(0xff4fd8 if k == 0 else 0x3fe0ff)), 3.6)
		var rmi := _mesh(tr, rm, Vector3.ZERO, pivot)
		rmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		rmi.rotation = Vector3(0.35 if k == 0 else -0.5, 0.0, 0.25 if k == 0 else -0.3)
		_rings.append(pivot)
	# the sign over it all
	# the name round the body's front, a letter at a time so it hugs the curve
	var text := "SKIN VAULT"
	var step := 0.125
	var sy := 2.75
	var sr := BODY.x - 0.25 * (sy - PLINTH.y) / BODY.y + 0.03
	for i in text.length():
		if text[i] == " ":
			continue
		var l := Label3D.new()
		l.text = text[i]
		l.font = MenuKit.broadcast(400)
		l.font_size = 160
		l.pixel_size = 0.0028
		l.outline_size = 28
		l.modulate = Color(2.6, 1.3, 2.4)
		l.outline_modulate = Color(0.9, 0.1, 0.7, 1.0)
		l.shaded = false
		l.double_sided = false
		var a := (float(i) - (text.length() - 1) * 0.5) * step
		l.position = Vector3(sin(a) * sr, sy, cos(a) * sr)
		l.rotation = Vector3(-0.08, a, 0.0)
		root.add_child(l)
		_sign.append(l)
	var spot := SpotLight3D.new()
	spot.light_color = Color(1.0, 0.9, 0.95)
	spot.light_energy = 3.0
	spot.spot_range = 22.0
	spot.spot_angle = 30.0
	spot.spot_attenuation = 0.0
	root.add_child(spot)
	spot.look_at_from_position(Vector3(3.5, 9.0, 7.5), Vector3(0, 2.5, 0))


func _build_drift() -> void:
	var dm := ShaderMaterial.new()
	dm.shader = preload("res://render/vault/vault_capsule.gdshader")
	dm.set_shader_parameter("use_instance", true)
	dm.set_shader_parameter("len", CAP_LEN)
	dm.set_shader_parameter("seam_col", Vector3(1.0, 0.7, 1.0))
	dm.set_shader_parameter("charge", 0.25)
	_drift = MultiMesh.new()
	_drift.transform_format = MultiMesh.TRANSFORM_3D
	_drift.use_colors = true
	_drift.mesh = _cap_mesh
	_drift.instance_count = DRIFT
	var r := RandomNumberGenerator.new()
	r.seed = 5
	for i in DRIFT:
		# angle round the platform, distance, height, size
		_drift_seed.append(Vector4(r.randf() * TAU, r.randf_range(15.0, 30.0), (r.randf_range(3.0, 12.0) if i % 3 != 0 else r.randf_range(-9.0, -3.5)), r.randf_range(1.4, 3.2)))
		_drift.set_instance_color(i, Color.hex((int(TOPS[(i * 3) % TOPS.size()]) << 8) | 0xff))
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = _drift
	mi.material_override = dm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.extra_cull_margin = 16384.0
	add_child(mi)
	_drift_tick(0.0)


func _drift_tick(time: float) -> void:
	for i in DRIFT:
		var s: Vector4 = _drift_seed[i]
		var a := s.x + time * 0.012 * (1.0 + float(i % 3) * 0.4)
		var p := CENTER + Vector3(sin(a) * s.y, s.z + sin(time * 0.3 + s.x * 3.0) * 0.6, cos(a) * s.y)
		var b := Basis.from_euler(Vector3(time * 0.15 + s.x, time * 0.1 + s.w, s.x * 2.0)).scaled(Vector3.ONE * s.w)
		_drift.set_instance_transform(i, Transform3D(b, p))


func _build_pull_props() -> void:
	_hero_mat = _capsule_mat(0xff3b5c)
	_hero = _mesh(_cap_mesh, _hero_mat)
	_hero.visible = false
	for k in 2:
		var m := _capsule_mat(0xff3b5c)
		m.set_shader_parameter("half", k + 1)
		var h := _mesh(_cap_mesh, m)
		h.visible = false
		_halves.append(h)
		_halves_v.append(Vector3.ZERO)
		_halves_w.append(Vector3.ZERO)
	for i in 10:
		var m := _capsule_mat(TOPS[i % TOPS.size()])
		var c := _mesh(_cap_mesh, m)
		c.visible = false
		_ten.append(c)
		_ten_mat.append(m)
		var om := _neon(Vector3.ONE, 4.0)
		var s := SphereMesh.new()
		s.radius = 0.5
		s.height = 1.0
		s.radial_segments = 24
		s.rings = 12
		om.set_shader_parameter("core", 0.75)
		var o := _mesh(s, om)
		o.visible = false
		o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_orbs.append(o)
		_orb_mat.append(om)
		# its halo: a bigger soft ball round it
		var hm := ShaderMaterial.new()
		hm.shader = preload("res://render/vault/vault_halo.gdshader")
		var halo := _mesh(s, hm, Vector3.ZERO, o)
		halo.scale = Vector3.ONE * 2.3
		halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_halo_mat.append(hm)
	_burst_light = OmniLight3D.new()
	_burst_light.light_energy = 0.0
	_burst_light.omni_range = 9.0
	add_child(_burst_light)
	var tm := TorusMesh.new()
	tm.inner_radius = 0.92
	tm.outer_radius = 1.0
	tm.rings = 64
	tm.ring_segments = 6
	_shock_mat = ShaderMaterial.new()
	_shock_mat.shader = preload("res://render/vault/vault_beam.gdshader")
	_shock_mat.set_shader_parameter("fade", 0.0)
	_shock = _mesh(tm, _shock_mat)
	_shock.visible = false
	var bc := CylinderMesh.new()
	bc.top_radius = 0.7
	bc.bottom_radius = 1.15
	bc.height = 7.0
	bc.radial_segments = 40
	bc.cap_top = false
	bc.cap_bottom = false
	_beam_mat = ShaderMaterial.new()
	_beam_mat.shader = preload("res://render/vault/vault_beam.gdshader")
	_beam_mat.set_shader_parameter("height", 7.0)
	_beam = _mesh(bc, _beam_mat, Vector3(0, 3.5, 0))
	_beam.visible = false
	_beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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


func _capsule_mat(top: int) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/vault/vault_capsule.gdshader")
	m.set_shader_parameter("top_col", Color.hex((top << 8) | 0xff))
	m.set_shader_parameter("len", CAP_LEN)
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


## Back to the robot on its turntable, nothing playing (the camera cuts there, or glides).
func _reset(cut := true) -> void:
	mode = "idle"
	_results = []
	_t = 0.0
	_churn_to = 0.0
	_crank_v = 0.0
	_flap_to = 0.0
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
	_floor_mat.set_shader_parameter("table_col", Vector3(0.9, 0.3, 1.0))
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
	_reset()
	_results = results
	_spec = spec
	# (the plating shaders for the skins about to go on the robot: compiling while the machine plays)
	BotModel.warm(results.map(func(r): return r.skin))
	_tier = int(Gacha.best_of(results).skin.r)
	_shown_tier = 0
	_cracked = [false, false]
	_done_beats = {}
	_pops = 0
	_t = 0.0
	_robot(false)
	_churn_to = 1.0
	_crank_v = 0.0
	sound.play("crank", 0.8)
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
		for i in n:
			var a := lerpf(-0.95, 0.95, float(i) / maxf(1.0, n - 1.0))
			# two rows: the odd ones a little further out
			var rr := 4.3 + (0.55 if i % 2 == 1 else 0.0)
			_slots.append(MACHINE + Vector3(sin(a) * rr, CAP_R, cos(a) * rr))
			_pop_at.append(-1.0)
			_ten_mat[i].set_shader_parameter("top_col", Color.hex((int(TOPS[(i * 5 + _rng.randi()) % TOPS.size()]) << 8) | 0xff))
			_ten_mat[i].set_shader_parameter("charge", 0.0)
			_ten_mat[i].set_shader_parameter("seam_col", _v(Skins.RARITY_COL[0].srgb_to_linear()))


## Jump to the end of what's playing (a tap): one pull to its reveal, ten to their lights.
func skip() -> void:
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
	_floor_mat.set_shader_parameter("table_col", lc * 1.6)
	_pulse = 0.0
	_floor_mat.set_shader_parameter("pulse_col", lc)
	sound.play("paint", 0.7)
	if game.effects != null and game.effects.fx != null:
		for k in 3:
			game.effects.fx.sparks(Vector3(0, 0.1 + k * 0.6, 0), Vector3.UP, 10, col.to_html(false).hex_to_int(), 3.0, 1.4)
	mode = "reveal"
	_t = 0.0
	_cut = true
	beat.emit("robot", id)


## Back from a skin on the robot to the ten lights.
func back_to_orbs() -> void:
	mode = "orbs"
	_robot(false)
	_cut = true


## The pull is over: the robot back on its turntable, the camera back round it.
func finish() -> void:
	_reset(mode == "reveal" or mode == "idle")
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
	# the sky follows the lens; the drifting capsules and the rings
	if game != null and game.cam != null:
		_space.global_position = game.cam.global_position
	if game != null and game.showcase != null and game.showcase.model.visible != _robot_on:
		game.showcase.model.visible = _robot_on
	_drift_tick(time)
	for k in _rings.size():
		_rings[k].rotation.y = time * (0.25 if k == 0 else -0.18)
	# the machine at work: the crank, the churning heap, the bulbs and the glow in the globe
	_churn = move_toward(_churn, _churn_to, dt * 1.5)
	_crank_a += _crank_v * dt
	_crank.rotation = Vector3(0.0, PI * 0.5, -_crank_a)
	_flap.rotation.x = lerp_angle(_flap.rotation.x, -_flap_to, minf(1.0, dt * 14.0))
	if _churn > 0.001:
		_churn_ph += dt * _churn * 2.2
		_churn_tick()
	for b in _bulbs:
		b.set_shader_parameter("speed", 0.6 + _churn * 2.4)
	_glow = lerpf(_glow, 0.25 + _churn * 0.9 + sin(time * 2.0) * 0.08, minf(1.0, dt * 4.0))
	_glass_mat.set_shader_parameter("glow", _glow)
	_globe_light.light_energy = 1.0 + _glow * 2.5
	# the burst's light, the sky's flash, the floor's pulse, the shock ring and the beam
	_flash = maxf(0.0, _flash - dt * 1.8)
	_space_mat.set_shader_parameter("flash", _flash * _flash)
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
		_beam_mat.set_shader_parameter("alpha", sin(PI * minf(1.0, k * 1.4)) * 1.4 if k < 1.0 else 0.0)
		_beam.scale = Vector3(1.0 - k * 0.3, 1.0, 1.0 - k * 0.3)
		if k >= 1.0:
			_beam_t = -1.0
	for i in 2:
		var h := _halves[i]
		if h.visible:
			_halves_v[i] += Vector3(0, -9.0, 0) * dt
			h.position += _halves_v[i] * dt
			h.rotate(_halves_w[i].normalized(), _halves_w[i].length() * dt)
			if h.position.y < -6.0:
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
			_wide_cam(0.0)
		"reveal":
			_reveal_cam()
	_write_cam()


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


## The machine from the front, wide (the ten), `push` closer.
func _wide_cam(push: float) -> void:
	_cam_pos = MACHINE + Vector3(0.6, 3.3 - push * 0.6, 12.2 - push * 2.0)
	_cam_look = MACHINE + Vector3(0, 2.7 - push * 0.7, 2.5)
	_cam_fov = 1.0
	_cam_lambda = 2.0


## The heap in the globe swirls round and tumbles while the crank turns.
func _churn_tick() -> void:
	var n := _pile.instance_count
	for i in n:
		var xf: Transform3D = _pile_rest[i]
		var p := xf.origin - Vector3(0, GLOBE_Y, 0)
		var a := _churn_ph * (1.0 + float(i % 3) * 0.35)
		var lift := (0.5 + 0.5 * sin(_churn_ph * 2.3 + float(i) * 1.7)) * _churn * 1.4
		var q := Vector3(p.x * cos(a) - p.z * sin(a), p.y + lift, p.x * sin(a) + p.z * cos(a))
		if q.length() > GLOBE_R - 0.4:
			q = q.normalized() * (GLOBE_R - 0.4)
		var b := xf.basis.rotated(Vector3(0.3, 1.0, 0.2).normalized(), a * 1.3)
		_pile.set_instance_transform(i, Transform3D(b, q + Vector3(0, GLOBE_Y, 0)))


## A hop from a to b, `h` high at its top, k 0..1 along it.
static func _hop(a: Vector3, b: Vector3, h: float, k: float) -> Vector3:
	return a.lerp(b, k) + Vector3(0, 4.0 * h * k * (1.0 - k), 0)


## A capsule lying on its side, rolled `roll` about the world x.
static func _lying(roll: float) -> Basis:
	return Basis(Vector3.RIGHT, roll) * Basis(Vector3.BACK, PI * 0.5)


func _once(id: String) -> bool:
	if _done_beats.has(id):
		return false
	_done_beats[id] = true
	return true


func _thud(k: float) -> void:
	if game != null and game.sfx != null:
		game.sfx.thud(k)


# ------------------------------------------------------------------------------ one pull

const T_DROP := 1.35
const T_LAND := T_DROP + 0.5
const T_REST := T_LAND + 0.32 + 0.22 + 0.25


func _single(dt: float) -> void:
	var t := _t
	var chute := MACHINE + CHUTE * MS
	var rest := HERO + Vector3(0, CAP_R, 0)
	# the crank turns twice, the heap churns
	if t < T_DROP:
		_crank_v = lerpf(_crank_v, 9.0, minf(1.0, dt * 3.0))
		_cam_pos = MACHINE + Vector3(5.2, 2.5, 6.6)
		_cam_look = MACHINE + Vector3(0.6, 2.7, 0.0)
		_cam_fov = 1.0
		_cam_lambda = 1.6
		if t < 0.05:
			_cut = false
		return
	_crank_v = lerpf(_crank_v, 0.0, minf(1.0, dt * 5.0))
	if _once("drop"):
		_flap_to = 1.2
		_churn_to = 0.15
		sound.play("chute", 0.9)
		_hero.visible = true
	var cp := chute
	var roll := 0.0
	if t < T_LAND:
		var k := (t - T_DROP) / 0.5
		var p1 := chute.lerp(rest, 0.55)
		p1.y = rest.y
		cp = _hop(chute, p1, 0.7, k)
		roll = k * 5.0
	elif t < T_LAND + 0.32:
		if _once("land1"):
			_thud(0.8)
			_dust(cp)
		var k := (t - T_LAND) / 0.32
		var p1 := chute.lerp(rest, 0.55)
		p1.y = rest.y
		var p2 := chute.lerp(rest, 0.86)
		p2.y = rest.y
		cp = _hop(p1, p2, 0.35, k)
		roll = 5.0 + k * 3.0
	elif t < T_LAND + 0.54:
		if _once("land2"):
			_thud(0.45)
		var k := (t - T_LAND - 0.32) / 0.22
		var p2 := chute.lerp(rest, 0.86)
		p2.y = rest.y
		cp = _hop(p2, rest, 0.1, k)
		roll = 8.0 + k * 1.5
	else:
		if _once("land3"):
			_thud(0.25)
			_flap_to = 0.0
		cp = rest
		roll = 9.5 + (1.0 - exp(-(t - T_LAND - 0.54) * 6.0)) * 0.5
	if t < T_REST:
		_hero.position = cp
		_hero.basis = _lying(roll)
		_cam_pos = HERO + Vector3(2.4, 1.9, 4.6)
		_cam_look = cp.lerp(HERO, 0.4) + Vector3(0, 0.5, 0)
		_cam_fov = 1.0
		_cam_lambda = 2.4
		return
	var len_c: float = CHARGE[_tier]
	var ct := t - T_REST
	var k := clampf(ct / len_c, 0.0, 1.0)
	if not _done_beats.has("burst"):
		if _once("charge"):
			sound.play("riser", 0.85, 1.9 / len_c)
		# the tease: violet breaks through for a Rare or better, then gold for an Epic
		if _tier >= 1 and k > 0.42 and not _cracked[0]:
			_cracked[0] = true
			_shown_tier = 1
			sound.play("crack", 0.8)
			game.director.shake(0.25)
		if _tier >= 2 and k > 0.72 and not _cracked[1]:
			_cracked[1] = true
			_shown_tier = 2
			sound.play("crack", 1.0, 1.35)
			game.director.shake(0.4)
			_flash = 0.5
			_space_mat.set_shader_parameter("flash_col", _v(Skins.RARITY_COL[2].srgb_to_linear()))
		var sc: Color = Skins.RARITY_COL[_shown_tier]
		var lc := _v(sc.srgb_to_linear())
		var pulse_k := 0.5 + 0.5 * sin(ct * (8.0 + k * 30.0))
		var power := 0.15 + k * 0.75 + pulse_k * 0.15 * k
		_hero_mat.set_shader_parameter("seam_col", lc)
		_hero_mat.set_shader_parameter("charge", power)
		_hero_mat.set_shader_parameter("crack", smoothstep(0.5, 1.0, k) * (0.5 + 0.25 * _shown_tier))
		# it rises and turns upright, spinning faster and faster, shuddering
		var up := smoothstep(0.0, 0.35, ct)
		var spin := ct * (2.0 + k * 10.0) + k * k * 8.0
		var q := Quaternion(_lying(10.0)).slerp(Quaternion(Basis(Vector3.UP, spin)), up)
		var shudder := Vector3(sin(ct * 61.0), 0, cos(ct * 53.0)) * 0.02 * k * (1.0 + _shown_tier)
		_hero.basis = Basis(q)
		_hero.position = rest.lerp(HERO + Vector3(0, 1.05, 0), up) + shudder
		_burst_light.position = _hero.position
		_burst_light.light_color = sc
		_burst_light.light_energy = maxf(_burst_light.light_energy, power * 3.0)
		game.director.shake(k * k * dt * (0.6 + _shown_tier * 0.5))
		# the camera pushes in and slowly circles
		var a := 0.35 - k * 0.5
		var r := 3.9 - k * 1.4
		_cam_pos = HERO + Vector3(sin(a) * r, 1.15 + k * 0.15, cos(a) * r)
		_cam_look = HERO + Vector3(0, 1.05, 0)
		_cam_fov = 1.0 - k * 0.12
		_cam_lambda = 3.0
		if k >= 1.0:
			_burst(false)
		return
	# after the burst: hold on the light, then cut to the robot
	if t > _burst_t + 0.85 and _once("reveal"):
		_reveal()


var _burst_t := 0.0


## The capsule bursts: its halves fly apart, a flash and a ring of light, sparks and confetti.
func _burst(quiet: bool) -> void:
	if not _once("burst"):
		return
	_burst_t = _t
	_shown_tier = _tier
	var col: Color = Skins.RARITY_COL[_tier]
	var lc := _v(col.srgb_to_linear())
	var at := HERO + Vector3(0, 1.05, 0)
	_hero.visible = false
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
		_space_mat.set_shader_parameter("flash_col", lc)
		_shock.position = at
		_shock.rotation = Vector3(PI * 0.5 - 0.3, 0, 0)
		_shock_mat.set_shader_parameter("color", lc * 3.0)
		_shock_t = 0.0
		_pulse = 0.0
		_floor_mat.set_shader_parameter("pulse_col", lc)
		_confetti.position = at
		if _tier >= 1:
			_confetti.amount = 80 if _tier == 1 else 160
			_confetti.restart()
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

const TEN_CRANK := 1.5
const TEN_EVERY := 0.17
const TEN_FLY := 0.62


func _ten_tick(dt: float) -> void:
	var t := _t
	var n := _results.size()
	var chute := MACHINE + CHUTE * MS
	_crank_v = lerpf(_crank_v, 11.0 if t < TEN_CRANK + n * TEN_EVERY else 0.0, minf(1.0, dt * 3.0))
	_wide_cam(clampf((t - TEN_CRANK) / 3.0, 0.0, 1.0))
	if t >= TEN_CRANK and _once("open"):
		_flap_to = 1.25
		sound.play("chute", 0.9)
	# the capsules shoot out one by one, land in an arc and hop to a stop
	var all_down := true
	for i in n:
		var t0 := TEN_CRANK + i * TEN_EVERY
		var c := _ten[i]
		if _pop_at[i] >= 0.0:
			continue
		if t < t0:
			all_down = false
			continue
		c.visible = true
		var k := (t - t0) / TEN_FLY
		var s: Vector3 = _slots[i]
		var dir := (s - chute)
		dir.y = 0.0
		var axis := Vector3.UP.cross(dir.normalized())
		# lying with its length along the roll's axis, so it rolls like a pill and doesn't tumble
		var lie := Basis(axis.cross(Vector3.UP), axis, Vector3.UP)
		if k < 1.0:
			all_down = false
			c.position = _hop(chute, s, 1.3, k)
			c.basis = Basis(axis, k * 7.0) * lie
		else:
			if _once("land%d" % i):
				_thud(0.35)
				_dust(s)
			var k2 := minf(1.0, (t - t0 - TEN_FLY) / 0.24)
			var hop := 4.0 * 0.18 * k2 * (1.0 - k2)
			c.position = s + Vector3(0, hop, 0)
			c.basis = Basis(axis, 7.0 + k2 * 1.0) * lie
			if k2 < 1.0:
				all_down = false
	if t > TEN_CRANK + n * TEN_EVERY:
		_churn_to = 0.15
	if all_down and _once("all_down"):
		_flap_to = 0.0
		_pop_from = t + 0.35
	if _pop_from < 0.0:
		return
	# then they pop, one after another; an Epic trembles and glows before it goes
	var at := _pop_from
	for i in n:
		var tier := int(_results[i].skin.r)
		var wait := 0.6 if tier == Skins.EPIC else 0.0
		if _pop_at[i] < 0.0:
			if t >= at and t < at + wait:
				var k := (t - at) / wait
				_ten[i].position = _slots[i] + Vector3(sin(t * 70.0), 0, cos(t * 63.0)) * 0.025 * (1.0 + k)
				_ten_mat[i].set_shader_parameter("seam_col", _v(Skins.RARITY_COL[2].srgb_to_linear()))
				_ten_mat[i].set_shader_parameter("charge", 0.3 + k * 0.7)
				if _once("tremble%d" % i):
					sound.play("riser", 0.5, 3.0)
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


## Capsule i pops into a hovering light in its rarity's colour.
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
	o.position = _slots[i] + Vector3(0, 0.75, 0)
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
		_space_mat.set_shader_parameter("flash_col", lc)
		_burst_light.position = o.position
		_burst_light.light_color = col
		_burst_light.light_energy = 16.0
		_confetti.position = o.position
		_confetti.amount = 120
		_confetti.restart()
		_shock.position = o.position
		_shock.rotation = Vector3(PI * 0.5, 0, 0)
		_shock_mat.set_shader_parameter("color", lc * 3.0)
		_shock_t = 0.0
		if game != null:
			game.director.shake(0.55)
	beat.emit("pop", [i, tier])


## The lights bob where their capsules were.
func _orbs_tick() -> void:
	for i in _orbs.size():
		var o := _orbs[i]
		if not o.visible or i >= _slots.size():
			continue
		var tier := int(_results[i].skin.r) if i < _results.size() else 0
		o.position = _slots[i] + Vector3(0, 0.75 + sin(_time * 2.0 + i) * 0.08, 0)
		var s := (0.32 + tier * 0.12) * (1.0 + 0.06 * sin(_time * 5.0 + i * 1.3))
		o.scale = Vector3.ONE * s


func _cards() -> void:
	_done_beats["cards"] = true
	mode = "orbs"
	_churn_to = 0.0
	_flap_to = 0.0
	beat.emit("cards", null)
