## Triangle counts of what a fight draws: each robot (and the heaviest and lightest robot any
## loadout can build), and the arena, the event venues and everything else in the fight scene,
## grouped by node. Headless (counts come from the meshes, not the renderer):
##   godot --headless --path godot -s res://tests/tri_budget.gd [-- <depth>]
extends SceneTree

const ROBOT_BUDGET := 30000
## Everything a fight's place draws: the ring with the arena or event venue round it (stands,
## crowd, scenery), as one total.
const PLACE_BUDGET := 50000
## One camera drone, the referee drone.
const DRONE_BUDGET := 3000
const REFEREE_BUDGET := 8000

var _fight
var _t := 0
var _depth := 3
var _fails := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_depth = int(args[0])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child(_fight)
	process_frame.connect(_frame)


static func mesh_tris(mesh: Mesh) -> int:
	if mesh == null:
		return 0
	var n := 0
	for s in mesh.get_surface_count():
		var a := mesh.surface_get_arrays(s)
		var idx = a[Mesh.ARRAY_INDEX]
		var c: int = idx.size() if idx != null and idx.size() > 0 else (a[Mesh.ARRAY_VERTEX] as PackedVector3Array).size()
		var prim := Mesh.PRIMITIVE_TRIANGLES
		if mesh is ArrayMesh:
			prim = (mesh as ArrayMesh).surface_get_primitive_type(s)
		if prim == Mesh.PRIMITIVE_TRIANGLES:
			n += c / 3
		elif prim == Mesh.PRIMITIVE_TRIANGLE_STRIP:
			n += maxi(c - 2, 0)
	return n


static func node_tris(n: Node) -> int:
	if n is MeshInstance3D:
		return mesh_tris((n as MeshInstance3D).mesh)
	if n is MultiMeshInstance3D:
		var mm := (n as MultiMeshInstance3D).multimesh
		if mm == null:
			return 0
		var k := mm.visible_instance_count if mm.visible_instance_count >= 0 else mm.instance_count
		return mesh_tris(mm.mesh) * k
	return 0


## Triangles under `n`, visible ones only, grouped by path down to `depth` levels below `top`.
static func tally(n: Node, top: Node, depth: int, out: Dictionary) -> void:
	if n is Node3D and not (n as Node3D).visible:
		return
	var t := node_tris(n)
	if t > 0:
		var p := String(top.get_path_to(n)).split("/")
		var key := "/".join(p.slice(0, mini(depth, p.size())))
		out[key] = int(out.get(key, 0)) + t
	for c in n.get_children():
		tally(c, top, depth, out)


static func print_tally(title: String, out: Dictionary) -> int:
	var keys := out.keys()
	keys.sort_custom(func(a, b): return out[a] > out[b])
	var total := 0
	for k in keys:
		total += out[k]
	print("%s: %d triangles" % [title, total])
	for k in keys:
		print("  %8d  %s" % [out[k], k])
	return total


## Triangles of one robot part (both families), as the app draws it.
static func part_tris(key: String) -> int:
	var p := BotParts.get_part(key)
	return (p.opaque.index.size() + p.glow.index.size()) / 3


func _robots() -> void:
	BotParts.has("neck")
	var looks: int = BotParts.info.coreShift.size()
	# every slot's look picks its own parts, so the heaviest robot is each slot's heaviest
	var fixed := part_tris("neck") + part_tris("spine") + 2 * (part_tris("barrel/0.13/0.018") + part_tris("rod/0.17/0.018"))
	var slot := {"chest": [], "core": [], "head": [], "legs": [], "fist": [], "kick": []}
	for l in looks:
		slot.chest.append(part_tris("torso/%d" % l) + part_tris("upperArm/%d/-1" % l) + part_tris("upperArm/%d/1" % l))
		slot.core.append(part_tris("coreF/%d" % l) + part_tris("coreB/%d" % l))
		slot.head.append(part_tris("head/%d" % l))
		# (heavy legs' thicker pistons: the bigger of the two)
		slot.legs.append(part_tris("pelvis/%d" % l) + 2 * (part_tris("thigh/%d" % l) + part_tris("shin/%d" % l)
			+ maxi(part_tris("barrel/0.2/0.024") + part_tris("rod/0.25/0.024"), part_tris("barrel/0.2/0.0324") + part_tris("rod/0.25/0.0324"))))
		slot.fist.append(2 * (part_tris("forearm/%d" % l) + part_tris("rocket")) + part_tris("fist/%d/1" % l) + part_tris("fist/%d/-1" % l))
		slot.kick.append(2 * (part_tris("shinGuard/%d" % l) + part_tris("foot/%d" % l) + part_tris("toe/%d" % l)))
	var hi := fixed
	var lo := fixed
	for s in slot:
		var a: Array = slot[s]
		print("  %-6s  per look: %s" % [s, a])
		hi += a.max()
		lo += a.min()
	print("robot (any loadout): %d to %d triangles%s" % [lo, hi, "" if BotParts.lite else " (full bake)"])
	if hi > ROBOT_BUDGET:
		print("FAIL the heaviest robot is over %d triangles" % ROBOT_BUDGET)
		_fails += 1
	else:
		print("ok   every robot is at most %d triangles" % ROBOT_BUDGET)


func _frame() -> void:
	_t += 1
	if _fight.m == null or _t < 20:
		return
	process_frame.disconnect(_frame)
	_robots()
	for i in _fight.models.size():
		var out := {}
		tally(_fight.models[i], _fight.models[i], 1, out)
		print_tally("fight robot %d" % i, out)
	var all := {}
	tally(_fight, _fight, _depth, all)
	print_tally("whole fight scene (indoor arena)", all)
	_place("grand (indoor arena)")
	var drone := {}
	tally(_fight.drones, _fight.drones, 1, drone)
	_check("camera drones", print_tally("camera drones (%d)" % Drones.N, drone) / Drones.N, DRONE_BUDGET, "each camera drone")
	var ref := {}
	tally(_fight.referee, _fight.referee, 1, ref)
	_check("referee", print_tally("referee drone", ref), REFEREE_BUDGET, "the referee drone")
	var ids: Array = EventVenues.SCRIPTS.keys()
	for id in ids:
		if not EventVenues.has_venue(id):
			continue
		_fight.set_arena(id)
		_place(id)
	print("FAILED: %d over budget" % _fails if _fails > 0 else "every budget met")
	quit(1 if _fails > 0 else 0)


## The place the fight is in now: the ring and the arena or venue round it.
func _place(title: String) -> void:
	var out := {}
	tally(_fight.arena, _fight.arena, 2, out)
	var v = _fight.venues.current if _fight.venues != null else null
	if v != null and not _fight.arena.is_ancestor_of(v):
		tally(v, v, 1, out)
	_check(title, print_tally("place %s" % title, out), PLACE_BUDGET, "the ring and " + title)


func _check(_title: String, n: int, budget: int, what: String) -> void:
	if n > budget:
		print("FAIL %s: %d triangles, over %d" % [what, n, budget])
		_fails += 1
	else:
		print("ok   %s: %d triangles (at most %d)" % [what, n, budget])
