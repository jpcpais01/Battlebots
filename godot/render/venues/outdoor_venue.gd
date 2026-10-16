## A world map event's own venue round the ring (src/render/venues/outdoor.ts OutdoorVenue and the
## venue that dresses it: island.ts, harbor.ts, grove.ts, falls.ts, rooftop.ts), rebuilt from the
## web game's own build of it (godot/assets/venues/<id>.*, baked by tools/bake/web/venues_bake.ts).
## It keeps the indoor bowl's footprint (floor, barrier, the lower tier, the tunnels and their
## gates) under the venue's sky, with its own crowd, screens and light (look).
##
## Arena.set_venue puts it round the ring; from then the arena drives its crowd, its screens (the
## Scoreboard) and its gates as it does the indoor bowl's, and calls update() each frame for what
## the venue animates on the CPU (venue.ts tick: gulls, boats, cranes...). Everything else moves on
## the GPU, in the shaders the bake translated from the web's GLSL.
##
## Built with new(id, crowd) off the main thread if need be (no SubViewport, nothing in the tree);
## the screens' Scoreboard is made in _ready, once it is in the tree.
class_name OutdoorVenue
extends Node3D

const BAKE_DIR := "res://assets/venues/"

## The venue's id (events.ts ArenaId).
var id := ""
var scene: BakedScene
var mats := VenueGlslMaterials.new()
## Its fans (crowd.ts Crowd, outdoors: the lower tier in daylight).
var crowd: ArenaCrowd
## The big screens (venue.ts Scoreboard), made in _ready.
var board: Scoreboard
## The tunnels' energy gates, west then east (outdoor.ts gates).
var gates: Array[ShaderMaterial] = []
## How the place is lit (stage.ts LightLook, as the web builds it: hex colours, three intensities).
var look: Dictionary = {}
## The camera's far clip plane here (VenueLike.far).
var far := 900.0
## Ground height round the outside of the stands (VenueLike.outer: debris lands on it).
var outer := -0.62
## What the bake read back of the venue's animation (venues_bake.ts extract).
var anim: Dictionary = {}
## The sky dome's material (its colours feed the ambient sky, see VenueLook).
var sky_mat: ShaderMaterial
## Per named MultiMesh: its node's placement under the venue's root, which every instance matrix
## the venue's tick sets goes through (the web's instance matrices are in the node's own frame).
var inst_base := {}
var _gulls: MultiMeshInstance3D
var _gull_params: Array = []


func _init(venue_id := "", crowd_template: ShaderMaterial = null) -> void:
	if venue_id == "":
		return
	id = venue_id
	name = "venue_" + id
	var t0 := Time.get_ticks_msec()
	scene = BakedScene.open(BAKE_DIR + id)
	scene.factory = mats.make
	scene.build(self)
	look = scene.json.get("look", {})
	far = float(scene.json.get("far", 900.0))
	outer = float(scene.json.get("outer", -0.62))
	anim = scene.json.get("anim", {})
	_instances()
	var crowd_mats: Array = mats.base.by_kind.get("crowd", [])
	if crowd_mats.size() > 0:
		var cm: ShaderMaterial = crowd_mats[0]
		# the figure atlas is the indoor arena's (venues_bake.ts leaves it out)
		if crowd_template:
			for k in ["atlas", "bounds"]:
				cm.set_shader_parameter(k, crowd_template.get_shader_parameter(k))
		crowd = ArenaCrowd.new(cm)
	for i in 2:
		var g := node("gate%d" % i) as MeshInstance3D
		if g and g.mesh:
			gates.append(g.mesh.surface_get_material(0) as ShaderMaterial)
	var dome := node("skyDome") as MeshInstance3D
	if dome and dome.mesh:
		sky_mat = dome.mesh.surface_get_material(0) as ShaderMaterial
	_setup()
	print("venue ", id, " built in ", Time.get_ticks_msec() - t0, " ms")


func _ready() -> void:
	if board != null:
		return
	board = Scoreboard.new()
	add_child(board)
	for k in scene.named:
		if str(k).begins_with("scoreScreen"):
			board.attach(scene.named[k] as MeshInstance3D)


## A named node of the bake (venues_bake.ts names what the game drives).
func node(n: String) -> Node3D:
	return scene.named.get(n)


## The InstancedMeshes (harbor's containers, the gulls): one MultiMesh draw each, with each
## instance's matrix (and colour) from the bake. The node goes to the venue's root, its transform
## folded into the instances (the shaders take the instance from MODEL_MATRIX, see venues_glsl.ts).
func _instances() -> void:
	var list: Array = scene.json.nodes
	var world: Array[Transform3D] = []
	world.resize(list.size())
	for i in list.size():
		var p: int = list[i].parent
		world[i] = scene.nodes[i].transform if p < 0 else world[p] * scene.nodes[i].transform
	for i in list.size():
		var n: Dictionary = list[i]
		if not n.has("instanceMatrix"):
			continue
		var mi := scene.nodes[i] as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		var count := int(n.instanceMatrix.count)
		var f := scene.floats(int(n.instanceMatrix.buffer))
		var cols := PackedFloat32Array()
		if n.has("instanceColor"):
			cols = scene.floats(int(n.instanceColor.buffer))
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_custom_data = not cols.is_empty()
		mm.mesh = mi.mesh
		mm.instance_count = count
		# the node's own placement, relative to the venue's root
		var base := world[i]
		for k in count:
			var o := k * 16
			var t := Transform3D(Basis(Vector3(f[o], f[o + 1], f[o + 2]), Vector3(f[o + 4], f[o + 5], f[o + 6]), Vector3(f[o + 8], f[o + 9], f[o + 10])), Vector3(f[o + 12], f[o + 13], f[o + 14]))
			mm.set_instance_transform(k, base * t)
			if mm.use_custom_data:
				mm.set_instance_custom_data(k, Color(cols[k * 3], cols[k * 3 + 1], cols[k * 3 + 2], 1.0))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.name = mi.name
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if not n.frustumCulled:
			# (moved every frame, anywhere: the gulls, the city's train and searchlights)
			mmi.custom_aabb = AABB(Vector3(-5000, -1000, -5000), Vector3(10000, 4000, 10000))
		add_child(mmi)
		mi.get_parent().remove_child(mi)
		mi.free()
		scene.nodes[i] = mmi
		if n.name != "":
			scene.named[n.name] = mmi
			inst_base[n.name] = base
	_gulls = node("gulls") as MultiMeshInstance3D
	if _gulls:
		_gull_params = anim.get("gulls", [])


## For the venue's own nodes, once it's built (the per-venue scripts override it).
func _setup() -> void:
	pass


## The venue's per-frame animation beyond the shaders (venue.ts tick), on the arena's clock.
func update(dt: float, time: float) -> void:
	if _gulls:
		_update_gulls(time)
	_tick(dt, time)


## For the venues that move something themselves (island.gd, harbor.gd...).
func _tick(_dt: float, _t: float) -> void:
	pass


## props.ts gulls: a handful wheeling overhead, banking round their circles, wings flapping.
func _update_gulls(t: float) -> void:
	var mm := _gulls.multimesh
	var base: Transform3D = inst_base.get("gulls", Transform3D.IDENTITY)
	for i in mini(_gull_params.size(), mm.instance_count):
		var b: Dictionary = _gull_params[i]
		var w: float = b.w
		var a: float = b.ph + t * w
		var p := Vector3(b.cx + cos(a) * b.rad, b.h + sin(t * 0.7 + b.ph) * 1.5, b.cz + sin(a) * b.rad)
		var flap := 0.7 + 0.3 * sin(t * 7.0 + b.ph * 5.0)
		var s: float = b.s
		var r := euler_xyz(0.0, -a - (0.0 if w > 0.0 else PI), sin(a) * 0.3)
		mm.set_instance_transform(i, base * Transform3D(r * Basis.from_scale(Vector3(s, s * flap * 1.6, s)), p))


## three's Euler 'XYZ' (the default order): Rx * Ry * Rz.
static func euler_xyz(x: float, y: float, z: float) -> Basis:
	return Basis(Vector3.RIGHT, x) * Basis(Vector3.UP, y) * Basis(Vector3.BACK, z)


## three's Euler 'YXZ': Ry * Rx * Rz.
static func euler_yxz(x: float, y: float, z: float) -> Basis:
	return Basis(Vector3.UP, y) * Basis(Vector3.RIGHT, x) * Basis(Vector3.BACK, z)
