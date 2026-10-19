## The Titan Colosseum: where titan battles are fought (events.ts has no such venue: this one is
## the Android app's own, built in code by TitanBuild, not baked from the web game). A flat grass
## plain inside a stone-and-steel bowl a kilometre and a half across, packed to the rim, under a
## low golden sun. The robots are the usual robots and the fight is the usual sim: what makes them
## 30 m titans is everything round them being built to that scale (TitanBuild), the fight running
## slower (Game.time_k), the camera filming them like giants (Director.titan) and the effects and
## sound weighing more (TitanFx, Sfx.titan).
##
## It plugs into the event venues' machinery (EventVenues, Arena.set_venue, VenueLook) as an
## OutdoorVenue: the arena drives its crowd, its screens and its gates, VenueLook its light. What
## the indoor ring would show (the stage, posts, ropes, truss) gives way to the deck, the pylons
## and the energy ropes here (set_ring_hidden).
##
## Triangle budget (João, 2026-10-18): the stadium and the crowd together stay under 100k
## triangles. The crowd is drawn on a few thousand (titan_crowd.gdshader); tests/titan_check.gd
## counts the lot.
class_name TitanVenue
extends OutdoorVenue

const STONE := preload("res://render/titan/titan_stone.gdshader")
const CROWD := preload("res://render/titan/titan_crowd.gdshader")
const STEEL := preload("res://render/titan/titan_steel.gdshader")
const MEMBRANE := preload("res://render/titan/titan_membrane.gdshader")
const BANNER := preload("res://render/titan/titan_banner.gdshader")
const GRASS := preload("res://render/titan/titan_grass.gdshader")
const PYLON := preload("res://render/titan/titan_pylon.gdshader")
const ENERGY := preload("res://render/titan/titan_energy.gdshader")
const SKY := preload("res://render/titan/titan_sky.gdshader")
const SCREEN := preload("res://render/venue/scoreboard.gdshader")
const GATE := preload("res://render/venue/gate.gdshader")

## The sun (titan_common's T_SUN_DIR, T_SUN_COL): towards it, its colour (linear) and strength.
const SUN_DIR := Vector3(-0.5496, 0.4997, -0.6695)
const SUN_COLOR := Color(1.0, 0.70, 0.44)
const SUN_ENERGY := 2.35
## The haze over the plain (Godot's fog, exponential per world unit).
const HAZE := 0.0009
const HAZE_COLOR := Color(0.46, 0.47, 0.52)

## Always true: a titan venue (Game.set_titan follows it).
var titan := true
## The sun: lights the robots, the deck and the plain, and casts their shadows.
var sun: DirectionalLight3D
## Materials whose colours follow the two fighters' (set_teams).
var team_mats: Array[ShaderMaterial] = []
## The energy ropes and the pylons' emitters (they flare with the arena's rope flash).
var rope_mat: ShaderMaterial
## The crowd's material (Game sets its "seat": the fans round the crowd shot's lens).
var crowd_mat: ShaderMaterial
var pylon_mat: ShaderMaterial
var grass_deck: ShaderMaterial
var grass_plain: ShaderMaterial
## The giant screens' quads (Scoreboard attaches to them in _ready).
var screen_quads: Array[MeshInstance3D] = []
## Triangles in the stadium and crowd (the budget), and in the field (deck, pylons, ropes, plain).
var stadium_tris := 0
var field_tris := 0
var _arena: Node = null


func _init(venue_id := "titan", crowd_template: ShaderMaterial = null) -> void:
	id = venue_id
	name = "venue_titan"
	var t0 := Time.get_ticks_msec()
	far = 480.0
	outer = TitanBuild.GROUND_Y
	look = _look()
	_build(crowd_template)
	print("venue titan built in ", Time.get_ticks_msec() - t0, " ms (stadium ", stadium_tris, " tris, field ", field_tris, ")")


func _ready() -> void:
	if board != null:
		return
	board = Scoreboard.new()
	add_child(board)
	for q in screen_quads:
		board.attach(q)
		# (outdoors, in daylight: brighter than the indoor screens)
		(q.mesh.surface_get_material(0) as ShaderMaterial).set_shader_parameter("color", Vector3(2.2, 2.2, 2.2))


## How it's lit, as a LightLook for VenueLook.apply (hex colours, three's intensities): a warm
## haze, the sky's ambient and the rims. The key spot isn't used here: the sun is a directional
## light of the venue's own (Game.set_titan turns the spot off).
static func _look() -> Dictionary:
	var fog_hex := HAZE_COLOR.linear_to_srgb().to_rgba32() >> 8
	var to := SUN_DIR * 30.0
	return {
		"background": fog_hex,
		"fog": fog_hex,
		# (VenueLook: Godot's exp fog = 0.006 * fogDensity / 0.016)
		"fogDensity": HAZE * 0.016 / 0.006,
		"envIntensity": 0.22,
		"hemi": {"sky": 0x748499, "ground": 0x5a5445, "intensity": PI},
		"key": {"color": 0xffd9a8, "intensity": 0.0, "pos": [to.x, to.y, to.z], "target": [0, 0, 0], "angle": 0.5, "penumbra": 0.6},
		"rims": [
			{"color": 0xff9a5a, "intensity": 7.0, "distance": 14.0, "pos": [-5.5, 3.5, -2.0]},
			{"color": 0x7fc4ff, "intensity": 6.0, "distance": 14.0, "pos": [5.5, 3.5, 2.0]},
		],
	}


func _mat(shader: Shader) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = shader
	return m


func _add(b: TitanBuild, m: Material, node_name: String, shadow := false, stadium := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = b.make(m)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	if stadium:
		stadium_tris += b.tris()
	else:
		field_tris += b.tris()
	return mi


func _build(tmpl: ShaderMaterial) -> void:
	# the sky round it all (and its colours for the ambient light: VenueLook reads sky_mat)
	sky_mat = _mat(SKY)
	var dome := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 420.0
	sphere.height = 840.0
	sphere.radial_segments = 32
	sphere.rings = 16
	dome.mesh = sphere
	dome.material_override = sky_mat
	dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dome.name = "skyDome"
	add_child(dome)

	var stone := _mat(STONE)
	team_mats.append(stone)
	_add(TitanBuild.bowl(), stone, "bowl", true)

	crowd_mat = _mat(CROWD)
	if tmpl:
		for k in ["atlas", "bounds", "skin", "pants"]:
			crowd_mat.set_shader_parameter(k, tmpl.get_shader_parameter(k))
	team_mats.append(crowd_mat)
	var cm := _add(TitanBuild.crowd(), crowd_mat, "crowd")
	# (the cards stand a little in front of the envelope: never cull it at the frustum's edge)
	cm.extra_cull_margin = 1.0
	crowd = ArenaCrowd.new(crowd_mat)

	var steel := _mat(STEEL)
	_add(TitanBuild.roof(), steel, "roof", true)
	var mem := _add(TitanBuild.membrane(), _mat(MEMBRANE), "membrane", true)
	mem.sorting_offset = -10.0
	var banners := _mat(BANNER)
	team_mats.append(banners)
	_add(TitanBuild.banners(), banners, "banners")

	var sc := ShaderMaterial.new()
	sc.shader = SCREEN
	var made: Array = TitanBuild.screens(sc)
	_add(made[0], steel, "screenFrames", true)
	for q in made[1]:
		var mi := MeshInstance3D.new()
		mi.name = "screen%d" % screen_quads.size()
		# (each its own material: Scoreboard.attach replaces the surface's)
		q.surface_set_material(0, sc.duplicate())
		mi.mesh = q
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		screen_quads.append(mi)
		stadium_tris += 2

	# the gates' energy curtains (arena.gate_hit ripples them as the stretcher goes through), west
	# then east
	for g in 2:
		var gm := _mat(GATE)
		gm.set_shader_parameter("size", Vector2(TitanBuild.PORTAL_HW * 2.0, TitanBuild.PORTAL_SPRING + TitanBuild.PORTAL_HW))
		gm.set_shader_parameter("color", Vector3(0.1, 0.6, 1.0))
		var gb := TitanBuild.new()
		var x := (-1.0 if g == 0 else 1.0) * (TitanBuild.R_IN - 0.35)
		var hw := TitanBuild.PORTAL_HW
		var y0 := TitanBuild.GROUND_Y
		var sp := y0 + TitanBuild.PORTAL_SPRING
		var nn := Vector3(-signf(x), 0, 0)
		var size := Vector2(hw * 2.0, TitanBuild.PORTAL_SPRING + hw)
		# a rectangle up to the arch's spring, then a fan for the arch (UV over the whole opening)
		var pts := [Vector3(x, y0, -hw), Vector3(x, y0, hw), Vector3(x, sp, hw), Vector3(x, sp, -hw)]
		var ids := []
		for p in pts:
			ids.append(gb.vert(p, nn, Vector2((p.z + hw) / size.x, (p.y - y0) / size.y)))
		gb.quad(ids[0], ids[1], ids[2], ids[3])
		var centre := gb.vert(Vector3(x, sp, 0), nn, Vector2(0.5, (sp - y0) / size.y))
		var prev := -1
		for i in 17:
			var u := PI * float(i) / 16.0
			var p := Vector3(x, sp + sin(u) * hw, cos(u) * hw)
			var k := gb.vert(p, nn, Vector2((p.z + hw) / size.x, (p.y - y0) / size.y))
			if prev >= 0:
				gb.tri(centre, prev, k)
			prev = k
		_add(gb, gm, "gate%d" % g)
		gates.append(gm)

	# the field: the plain, the deck, the pylons and the energy ropes (lit, shadowed)
	grass_plain = _mat(GRASS)
	_add(TitanBuild.plain(), grass_plain, "plain", false, false)
	grass_deck = _mat(GRASS)
	grass_deck.set_shader_parameter("deck", true)
	for i in 2:
		var h: Array = TEntrance.hatchXZ(float(i))
		grass_deck.set_shader_parameter("hatch%d" % i, Vector2(h[0], h[1]))
	grass_deck.set_shader_parameter("hatch_r", TEntrance.HATCH_R)
	_add(TitanBuild.deck(), grass_deck, "deck", true, false)
	pylon_mat = _mat(PYLON)
	_add(TitanBuild.pylons(), pylon_mat, "pylons", true, false)
	rope_mat = _mat(ENERGY)
	team_mats.append_array([pylon_mat, rope_mat])
	var rm := _add(TitanBuild.ropes(), rope_mat, "energyRopes", false, false)
	rm.custom_aabb = AABB(Vector3(-7, -1, -7), Vector3(14, 4, 14))

	sun = DirectionalLight3D.new()
	sun.name = "sun"
	sun.light_color = SUN_COLOR.linear_to_srgb()
	sun.light_energy = SUN_ENERGY
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_split_1 = 0.18
	sun.directional_shadow_max_distance = 70.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.2
	sun.light_angular_distance = 0.6
	add_child(sun)
	sun.look_at_from_position(SUN_DIR * 50.0, Vector3.ZERO)


## The two fighters' colours (their paint accents, linear): the fans' shirts and flags, the
## banners, the gates and the LED ribbons all take sides.
func set_teams(a: Color, b: Color) -> void:
	for m in team_mats:
		m.set_shader_parameter("team0", Vector3(a.r, a.g, a.b))
		m.set_shader_parameter("team1", Vector3(b.r, b.g, b.b))
	for i in gates.size():
		var c := b if i == 0 else a
		gates[i].set_shader_parameter("color", Vector3(c.r, c.g, c.b) * 0.8)


## The indoor ring's own scenery (the stage, its posts, ropes and truss) shown or hidden: the
## deck, pylons and energy ropes stand in for it here. The corner lifts stay (their hatches open
## in the deck's turf).
static func set_ring_hidden(arena: Arena, hidden: bool) -> void:
	var ring := arena.node("arena")
	if ring == null:
		return
	for c in ring.get_children():
		if c is Node3D and c.find_child("corner0", false, false) == null:
			c.visible = not hidden
	for i in 2:
		var s := arena.node("corner%d_sleeve" % i)
		if s:
			s.visible = not hidden


func _tick(_dt: float, _t: float) -> void:
	var a = get_parent()
	if a != null and "_rope_flash" in a:
		var f: float = a._rope_flash
		Mats.put(rope_mat, "flare", f)
		Mats.put(pylon_mat, "flare", f)
