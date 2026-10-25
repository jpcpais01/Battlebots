## The titan city: where titan battles are fought (the Android app's own venue, built in code,
## not baked from the web game). The robots are the usual robots and the fight is the usual sim;
## what makes them 30 m titans is that the whole world round them is built to that scale: the
## Titan Ring is a steel stage in the middle of a harbour city's great square, packed with tens
## of thousands of people behind the barriers, the old buildings round the square standing no
## higher than the titans' shoulders, downtown's towers behind, the harbour and the sea to the
## north under a low evening sun. One unit is a robot metre, 15 m here: a person is 0.11 tall.
##
## It plugs into the event venues' machinery (EventVenues, Arena.set_venue, VenueLook) as an
## OutdoorVenue: the arena drives its crowd and its screens, VenueLook its light. The indoor
## ring's own scenery gives way to the Titan Ring's (set_ring_hidden); the corner lifts stay
## (their hatches open in the deck).
##
## Triangle budget (João, 2026-10-18: titan battles' venue under 100k): the crowd is a few hundred
## (titan_crowd.gdshader), the facades are boxes (titan_facade.gdshader), the streets one shader;
## tests/titan_check.gd counts the lot (`tris`).
class_name TitanVenue
extends OutdoorVenue

const FACADE := preload("res://render/titan/titan_facade.gdshader")
const GROUND := preload("res://render/titan/titan_ground.gdshader")
const WATER := preload("res://render/titan/titan_water.gdshader")
const STEEL := preload("res://render/titan/titan_steel.gdshader")
const CABLE := preload("res://render/titan/titan_cable.gdshader")
const CROWD := preload("res://render/titan/titan_crowd.gdshader")
const SKY := preload("res://render/titan/titan_sky.gdshader")
const SCREEN := preload("res://render/venue/scoreboard.gdshader")

## The sun (titan_common's T_SUN_DIR, T_SUN_COL): towards it, its colour and strength.
const SUN_DIR := Vector3(-0.4202, 0.2201, -0.8804)
const SUN_COLOR := Color(1.0, 0.6, 0.34)
const SUN_ENERGY := 2.6
## Godot's own fog (the titans' haze: the city's shaders write their own, titan_common t_haze).
## Half the city's: a few percent of it already lifts the titans' dark steel to grey (the tone
## curve's 1.8x lift and the sRGB curve both act on the darks), so they'd look washed out next
## to the same air over the paving.
const HAZE := 0.0015
const HAZE_COLOR := Color(0.4, 0.39, 0.45)
## The crowd round the ring: from the barriers out to the square's edge, in rows 0.67 m deep.
const CROWD_R0 := 9.8
const CROWD_ROW := 0.045
const CROWD_ROWS := 80
const CROWD_TOP := 0.14

## Always true: a titan venue (Game.set_titan follows it).
var titan := true
## The sun: lights the titans, the ring and the city, and casts their shadows.
var sun: DirectionalLight3D
## Materials whose colours follow the two fighters' (set_teams).
var team_mats: Array[ShaderMaterial] = []
## The ring's cables (arena.gd uploads the rope physics to it) and the steel's material.
var rope_mat: ShaderMaterial
var steel_mat: ShaderMaterial
var ground_mat: ShaderMaterial
var crowd_mat: ShaderMaterial
var water_mat: ShaderMaterial
## The city's layout (roofs a camera can stand on, the buildings).
var city: TitanCity
## Everything people-sized round the ring: the vehicles, the crews, the barriers, the camera
## towers, the lamps and trees, the big screens.
var props: TitanProps
## Triangles drawn by the whole venue (the budget), and the old name for them.
var tris := 0
var stadium_tris: int:
	get:
		return tris


func _init(venue_id := "titan", crowd_template: ShaderMaterial = null) -> void:
	id = venue_id
	name = "venue_titan"
	var t0 := Time.get_ticks_msec()
	far = 1600.0
	outer = TitanCity.PLAZA_Y
	look = _look()
	_build(crowd_template)
	print("venue titan built in ", Time.get_ticks_msec() - t0, " ms (", tris, " tris, ", city.buildings.size(), " buildings)")


func _ready() -> void:
	if board != null:
		return
	board = Scoreboard.new()
	add_child(board)
	props.prop_mat.set_shader_parameter("screen_tex", board.get_texture())


## How it's lit, as a LightLook for VenueLook.apply (hex colours, three's intensities): the
## evening's haze and sky for the ambient, the rims. The key spot isn't used here: the sun is a
## directional light of the venue's own (Game.set_titan turns the spot off).
static func _look() -> Dictionary:
	var fog_hex := HAZE_COLOR.linear_to_srgb().to_rgba32() >> 8
	var to := SUN_DIR * 30.0
	return {
		"background": fog_hex,
		"fog": fog_hex,
		# (VenueLook: Godot's exp fog = 0.006 * fogDensity / 0.016)
		"fogDensity": HAZE * 0.016 / 0.006,
		"envIntensity": 0.25,
		"hemi": {"sky": 0x6d7f9e, "ground": 0x5a4a3c, "intensity": PI},
		"key": {"color": 0xffd9a8, "intensity": 0.0, "pos": [to.x, to.y, to.z], "target": [0, 0, 0], "angle": 0.5, "penumbra": 0.6},
		"rims": [
			{"color": 0xff9a5a, "intensity": 5.0, "distance": 14.0, "pos": [-5.5, 3.5, -2.0]},
			{"color": 0x8fc4ff, "intensity": 5.0, "distance": 14.0, "pos": [5.5, 3.5, 2.0]},
		],
	}


static func _mat(shader: Shader) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = shader
	return m


func _add(b: TitanBuild, m: Material, node_name: String, shadow := false) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = b.make(m)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	tris += b.tris()
	return mi


func _build(tmpl: ShaderMaterial) -> void:
	# the sky round it all (and its colours for the ambient light: VenueLook reads sky_mat)
	sky_mat = _mat(SKY)
	for k in ["uZenith", "uHorizon", "uGlowCol", "uHaze", "uGnd", "uSunDir", "uSunCol", "uCloud"]:
		sky_mat.set_shader_parameter(k, _sky_default(k))
	var dome := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 1400.0
	sphere.height = 2800.0
	sphere.radial_segments = 32
	sphere.rings = 16
	dome.mesh = sphere
	dome.material_override = sky_mat
	dome.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	dome.name = "skyDome"
	add_child(dome)

	city = TitanCity.new()
	ground_mat = _mat(GROUND)
	_add(TitanCity.ground_mesh(), ground_mat, "ground")
	water_mat = _mat(WATER)
	_add(TitanCity.water_mesh(), water_mat, "water")
	_add(city.building_mesh(), _mat(FACADE), "buildings", true)

	# the Titan Ring
	steel_mat = _mat(STEEL)
	for i in 2:
		var h: Array = TEntrance.hatchXZ(float(i))
		steel_mat.set_shader_parameter("hatch%d" % i, Vector2(h[0], h[1]))
	steel_mat.set_shader_parameter("hatch_r", TEntrance.HATCH_R)
	team_mats.append(steel_mat)
	_add(TitanRing.stage(), steel_mat, "stage", true)
	_add(TitanRing.pylons(), steel_mat, "pylons", true)
	rope_mat = _mat(CABLE)
	rope_mat.set_shader_parameter("radius", TitanRing.CABLE_R)
	var cm := _add(TitanRing.cables(), rope_mat, "cables", true)
	cm.custom_aabb = AABB(Vector3(-7, -1, -7), Vector3(14, 4, 14))

	# the crowd in the square
	crowd_mat = _mat(CROWD)
	if tmpl:
		for k in ["atlas", "bounds", "skin", "pants"]:
			crowd_mat.set_shader_parameter(k, tmpl.get_shader_parameter(k))
	team_mats.append(crowd_mat)
	var env := _add(_crowd_envelope(), crowd_mat, "crowd")
	env.extra_cull_margin = 0.5
	crowd = ArenaCrowd.new(crowd_mat)

	# everything people-sized: the yardstick the titans are measured by
	props = TitanProps.new()
	props.build(self, city, tmpl)
	tris += props.tris
	team_mats.append(props.people_mat)

	sun = DirectionalLight3D.new()
	sun.name = "sun"
	sun.light_color = SUN_COLOR.linear_to_srgb()
	sun.light_energy = SUN_ENERGY
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	# (the far split kept short: the low sun stretches the cables' and pylons' shadows across
	# the deck, and a coarse map draws their edges as staircases from the helicopter and roofs)
	sun.directional_shadow_split_1 = 0.25
	sun.directional_shadow_max_distance = 46.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.2
	sun.light_angular_distance = 0.6
	add_child(sun)
	sun.look_at_from_position(SUN_DIR * 50.0, Vector3.ZERO)


static func _sky_default(k: String):
	match k:
		"uZenith":
			return Vector3(0.12, 0.155, 0.29)
		"uHorizon":
			return Vector3(0.86, 0.56, 0.38)
		"uGlowCol":
			return Vector3(1.0, 0.5, 0.18)
		"uHaze":
			return Vector3(0.4, 0.39, 0.45)
		"uGnd":
			return Vector3(0.16, 0.12, 0.08)
		"uSunDir":
			return SUN_DIR
		"uSunCol":
			return Vector3(1.0, 0.6, 0.34)
		_:
			return Vector4(0.5, 0.5, 0.0, 1.0)


## The crowd's envelope: a ring at head height over the people from the barriers out, with walls
## down to the paving at its inner and outer edges (a ray from the ring's side comes in through
## the inner wall). CUSTOM0 = (front radius, row depth, ground, 0), CUSTOM1.x = rows.
static func _crowd_envelope() -> TitanBuild:
	var b := TitanBuild.new()
	b.custom = true
	var segs := 96
	var y0 := TitanCity.PLAZA_Y
	var y1 := y0 + CROWD_TOP
	var r0 := CROWD_R0 - 0.02
	var r1 := CROWD_R0 + CROWD_ROWS * CROWD_ROW
	var tier := Vector4(CROWD_R0, CROWD_ROW, y0, 0)
	var rows := Vector4(CROWD_ROWS, 0, 0, 0)
	for ring in 3:
		var base := b.v.size()
		for i in segs + 1:
			var a := TAU * float(i) / segs
			var d := Vector3(cos(a), 0, sin(a))
			match ring:
				0:
					b.vert(d * r0 + Vector3(0, y0, 0), -d, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
					b.vert(d * r0 + Vector3(0, y1, 0), -d, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
				1:
					b.vert(d * r0 + Vector3(0, y1, 0), Vector3.UP, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
					b.vert(d * r1 + Vector3(0, y1, 0), Vector3.UP, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
				_:
					b.vert(d * r1 + Vector3(0, y1, 0), d, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
					b.vert(d * r1 + Vector3(0, y0, 0), d, Vector2.ZERO, Vector2.ZERO, Color.WHITE, tier, rows)
		for i in segs:
			var k := base + i * 2
			b.quad(k, k + 2, k + 3, k + 1)
	return b


## The two fighters' colours (their paint accents, linear): the crowd's shirts and flags, the
## deck's corners, the pylons' and the stage's lights take sides.
func set_teams(a: Color, b: Color) -> void:
	for m in team_mats:
		m.set_shader_parameter("team0", Vector3(a.r, a.g, a.b))
		m.set_shader_parameter("team1", Vector3(b.r, b.g, b.b))


## The indoor ring's own scenery (the stage, its posts, ropes and truss) shown or hidden: the
## Titan Ring stands in for it here. The corner lifts stay (their hatches open in the deck).
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
		Mats.put(steel_mat, "flare", f)
	var e = crowd_mat.get_shader_parameter("excite")
	if e != null:
		Mats.put(props.people_mat, "excite", e)
