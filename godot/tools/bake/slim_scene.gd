## A baked scene (godot/tools/bake/web/scene_bake.ts: the arena, the event venues, the drones...)
## brought within a triangle budget: <bake>.slim, which BakedScene reads in place of the full
## triangle lists. Run after every bake of that scene:
##   godot --headless --path godot -s res://tools/bake/slim_scene.gd -- <res://bake path> <budget> [<always drawn with it>]
##
## Every rigid mesh (one the vertex shader doesn't bend: no crowd, ropes, sparks or beams) is
## simplified by the editor's mesh simplifier, keeping its corners where any attribute changes, so
## colours and spots stay where they were. All of them to one error as it looks from the ring
## (metres of error over metres from where the cameras fly): the least error that brings the
## whole scene within the budget. Far instanced things (the city's trees seen from Skydeck 88)
## also thin out where each one is only a few pixels on screen, a hashed few
## at a time, so the far ones fade in number rather than stop at a line.
## The last argument is what is drawn along with the scene (the ring round an event venue), so
## both together fit the budget.
## BB_SLIM_OBJECT=<metres>: a thing that flies about (the camera drones) rather than a place: every
## mesh simplified as it looks from that far, nothing culled for facing away or being hidden.
extends SceneTree

## Where the cameras film from: round the ring, this far out from its centre at most for the
## shots that matter (the wide and drone shots), at robot height.
const LENS := Vector3(0.0, 1.5, 0.0)
const LENS_R := 4.0
## Nearer than this (metres) counts as this near.
const NEAR := 1.5
## The most error (over distance) it may take to fit the budget: beyond this, things start to
## look different from the ring (the ring and tunnels are kept exact regardless). A place that
## can't fit within it is left over budget, and says so. BB_SLIM_MAX=<mm per metre> raises it for a
## place where more doesn't show: the indoor arena's dark stands (checked by eye at 45).
const MAX_ERROR := 0.016
## Vertex colours this close (1 / COLOR_STEPS of their square root, roughly as the eye sees
## shades) may merge when simplifying.
const COLOR_STEPS := 32.0
## Runs of fewer triangles are left as they are.
const MIN_TRIS := 16
## Instanced things with fewer instances are never thinned out.
const THIN_MIN := 64
## An instance is thinned out where its radius on screen is below this (radians: about 8 pixels
## across a phone's 50 degree view), the smaller the fewer. BB_SLIM_THIN=<radians> raises it for a
## place whose far things hardly show: Skydeck 88's city trees, dark specks far below at night.
const THIN_RADIUS := 0.006
static var _thin := THIN_RADIUS
## BB_SLIM_PARTS=1: a single drawing's loose pieces (each tree of a forest baked into one mesh)
## thin out like instances do. Only for places with nothing small that glows (a far lamp would go).
var _parts := false
var _GLOW := RegEx.create_from_string("\\*\\s*uGlow\\b|\\buGlow\\s*\\*")
## Shader kinds (venue_materials.gd) that draw their mesh where it stands: translated venue GLSL,
## the tunnels' LED strips and boards.
const RIGID_KINDS := ["glsl", "tunnel_led", "led", "led_ads"]
## Kinds whose shape stays as it is (only faces nobody sees go): the tunnels' LED cages are thin
## strips the simplifier would fold away from afar, though the high shots fly close by them.
const EXACT_KINDS := ["tunnel_led"]
## The ring's own pieces (under this node: posts, apron, truss, lifts) keep their shape too: the
## cameras come within a hand's breadth of them.
const RING_NODE := "arena"
## Names of rigid-looking meshes that move in their shader all the same.
const KEEP_NAMES := ["ropes"]
## Every place the fight cameras went in a few hours of fights (tests/lens_points.gd), plus the
## booth's filler shots of the house (director.gd _filler_shot): a one-sided face that has its
## back to all of them is never seen. (This far behind its plane to count as behind it.)
const LENS_POINTS := "res://tools/bake/lens_points.json"
const BACK_MARGIN := 0.3


class Run extends RefCounted:
	var geo := 0
	var group := 0
	## [[world error, indices]], finest (the run itself, at 0) first.
	var levels := []
	## Triangles drawn per triangle of the mesh (its instances, kept or not: see `inst`).
	var copies := 1
	## Its nearest point to the lens (metres, NEAR at least).
	var dist := NEAR
	## Instanced nodes drawing it: [node id, [per instance: [screen radius]]].
	var inst := []
	## Its triangles in the bake.
	var src := 0


var _scene: BakedScene
var _world: Array[Transform3D] = []
## The corners of the hull round every lens position (empty: no faces dropped for facing away).
var _lens := PackedVector3Array()
## The lens positions, a metre apart, for what hides what.
var _lens_set := PackedVector3Array()


var _frames := 0
var _t0 := 0
## Which faces some lens sees, per geometry/group: the slow part, kept between runs in
## BB_SLIM_CACHE (a directory) to try other budgets or settings on the same bake.
var _seen_cache := {}
## BB_SLIM_OBJECT: how far away the object is judged from (0: a place, seen from the ring).
var _object := 0.0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 2:
		print("usage: slim_scene.gd -- <res://bake path> <budget> [<always drawn with it>]")
		quit(1)
		return
	BakedScene.use_slim = false
	_object = float(OS.get_environment("BB_SLIM_OBJECT")) if OS.has_environment("BB_SLIM_OBJECT") else 0.0
	_parts = OS.get_environment("BB_SLIM_PARTS") == "1"
	if OS.has_environment("BB_SLIM_THIN"):
		_thin = float(OS.get_environment("BB_SLIM_THIN"))
	_scene = BakedScene.open(args[0])
	_t0 = Time.get_ticks_msec()
	var nodes: Array = _scene.json.nodes
	_world.resize(nodes.size())
	for i in nodes.size():
		var m: Array = nodes[i].matrix
		var t := Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))
		var p: int = nodes[i].parent
		_world[i] = t if p < 0 else _world[p] * t
	if _object <= 0.0:
		_occluders()


func _process(_dt: float) -> bool:
	# (the occluders go into the physics space on the first physics frame)
	_frames += 1
	if _frames == 3:
		_main()
		return true
	return false


func _main() -> void:
	var args := OS.get_cmdline_user_args()
	var path := args[0]
	var budget := int(args[1])
	var extra := int(args[2]) if args.size() > 2 else 0
	var t0 := _t0
	var json := _scene.json
	var nodes: Array = json.nodes

	# which geometries are rigid in every node that draws them, and who draws them
	var users := {}
	var rigid := {}
	var fixed := 0
	for i in nodes.size():
		var n: Dictionary = nodes[i]
		if not n.has("geometry") or n.get("primitive", "triangles") != "triangles":
			continue
		var g := int(n.geometry)
		if not users.has(g):
			users[g] = []
			rigid[g] = true
		users[g].append(i)
		if not _rigid(n):
			rigid[g] = false
	_lens = _lens_hull() if _object <= 0.0 else PackedVector3Array()
	var cache_path := ""
	if OS.has_environment("BB_SLIM_CACHE"):
		cache_path = OS.get_environment("BB_SLIM_CACHE").path_join(path.get_file() + ".seen")
		if FileAccess.file_exists(cache_path):
			_seen_cache = bytes_to_var(FileAccess.get_file_as_bytes(cache_path))
	var runs: Array[Run] = []
	var full := 0
	for g in users:
		var tris := _tris(g) * _copies(users[g])
		full += tris
		if users[g].all(func(i): return _static_inst(nodes[i])):
			# (a yard of containers: the ones hidden in the stacks go)
			for i in users[g]:
				runs.append(_occluded_run(g, i))
			continue
		if not rigid[g]:
			if _kind(users[g][0]) == "crowd" and (_scene.json.geometries[g].groups as Array).size() <= 1:
				runs.append(_crowd_run(g))
				continue
			fixed += tris
			continue
		runs.append_array(_runs(g, users[g]))
	var all := full + extra
	print("slim_scene %s: %d triangles (%d of them can't change), %d with what's drawn alongside; budget %d" % [path, full, fixed, all, budget])

	if OS.has_environment("BB_SLIM_DEBUG"):
		for e in [0.0, 0.002, 0.004, 0.006, 0.009, 0.015, 0.025, 0.04, 0.1]:
			print("  at %4.1f mm/m: %d" % [e * 1000.0, _total(runs, e) + fixed + extra])
	# the least error (over distance) that fits
	var lo := 1e-6
	var most := float(OS.get_environment("BB_SLIM_MAX")) / 1000.0 if OS.has_environment("BB_SLIM_MAX") else MAX_ERROR
	var hi := most
	if _total(runs, lo) + fixed + extra <= budget:
		hi = lo
	elif _total(runs, hi) + fixed + extra > budget:
		print("slim_scene: OVER BUDGET: %d at the most error that still looks the same (%.0f mm per metre)" % [_total(runs, hi) + fixed + extra, most * 1000.0])
		lo = hi
	else:
		for k in 40:
			var mid := sqrt(lo * hi)
			if _total(runs, mid) + fixed + extra <= budget:
				hi = mid
			else:
				lo = mid
	var tau := hi
	if OS.has_environment("BB_SLIM_TAU"):
		# (BB_SLIM_TAU=<mm per metre>: that error whatever the budget, to look at)
		tau = float(OS.get_environment("BB_SLIM_TAU")) / 1000.0
	var total := _total(runs, tau) + fixed
	print("slim_scene: %d -> %d triangles (%d with what's drawn alongside), error %.2f mm per metre away" % [full, total, total + extra, tau * 1000.0])
	if OS.has_environment("BB_SLIM_DEBUG"):
		var rows := {}
		for r in runs:
			var k := "geo %d" % r.geo
			if not rows.has(k):
				rows[k] = [0, 0, r.dist]
			rows[k][0] += r.src * r.copies
			rows[k][1] += _pick(r, tau).size() / 3 * _kept(r, tau)
		var ks := rows.keys()
		ks.sort_custom(func(a, b): return rows[a][1] > rows[b][1])
		for k in ks.slice(0, 60):
			print("  %-8s %6d -> %6d  (%.1f m)" % [k, rows[k][0], rows[k][1], rows[k][2]])
	if cache_path != "":
		var fc := FileAccess.open(cache_path, FileAccess.WRITE)
		fc.store_buffer(var_to_bytes(_seen_cache))
	_write(path + ".slim", runs, tau)
	print("slim_scene: done in %.1f s (%d faces no lens sees)" % [(Time.get_ticks_msec() - t0) / 1000.0, _hidden])


## Nothing in the vertex shader moves it but its node: plain three materials and translated
## GLSL ones (venues), drawn where its bounds say (not frustumCulled = moved on the GPU).
func _rigid(n: Dictionary) -> bool:
	if not n.get("frustumCulled", true) or KEEP_NAMES.has(n.name):
		return false
	for mid in n.materials:
		var rec: Dictionary = _scene.json.materials[int(mid)]
		var kind = rec.get("kind")
		if kind != null and kind != "" and not RIGID_KINDS.has(kind):
			return false
		if rec.type == "ShaderMaterial" and not RIGID_KINDS.has(kind):
			return false
	return true


func _tris(g: int) -> int:
	return int(_scene.json.buffers[int(_scene.json.geometries[g].index.buffer)].bytes) / 12


func _copies(list: Array) -> int:
	var c := 0
	for i in list:
		var n: Dictionary = _scene.json.nodes[i]
		c += int(n.instanceMatrix.count) if n.has("instanceMatrix") else 1
	return c


static func _near(box: AABB) -> float:
	var p := LENS.clamp(box.position, box.end)
	return maxf(p.distance_to(LENS) - LENS_R, NEAR)


## Instanced and standing still, drawn whole and solid, but marked as moved on the GPU only so its
## spread-out instances aren't culled by one box (three's InstancedMesh): harbor's containers.
func _static_inst(n: Dictionary) -> bool:
	if not n.has("instanceMatrix") or n.get("frustumCulled", true) or _animated(n.get("name", "")):
		return false
	if int(n.instanceMatrix.count) < THIN_MIN or not _solid(n):
		return false
	for mid in n.materials:
		var kind = _scene.json.materials[int(mid)].get("kind")
		if kind != null and kind != "" and kind != "glsl":
			return false
	return true


## Node i's instances, placed in the world.
func _inst_xforms(i: int) -> Array[Transform3D]:
	var n: Dictionary = _scene.json.nodes[i]
	var f := _scene.floats(int(n.instanceMatrix.buffer))
	var out: Array[Transform3D] = []
	for k in int(n.instanceMatrix.count):
		var o := k * 16
		out.append(_world[i] * Transform3D(Basis(Vector3(f[o], f[o + 1], f[o + 2]), Vector3(f[o + 4], f[o + 5], f[o + 6]), Vector3(f[o + 8], f[o + 9], f[o + 10])), Vector3(f[o + 12], f[o + 13], f[o + 14])))
	return out


## The instances of node i that some lens can see a face of (its box's faces, sampled at the
## middle and near the corners); the others, deep in the stacks, go.
var _occl := {}


func _occluded_run(g: int, i: int) -> Run:
	var geo: Dictionary = _scene.json.geometries[g]
	var pos := _vec3(geo.attributes.position)
	var box := AABB(pos[0], Vector3.ZERO)
	for p in pos:
		box = box.expand(p)
	var c := box.get_center()
	var h := box.size * 0.5
	var keep := PackedInt32Array()
	var xs := _inst_xforms(i)
	var ck := "inst/%d" % i
	var cached: PackedInt32Array = _seen_cache.get(ck, PackedInt32Array([-1]))
	if cached.size() == 0 or cached[0] != -1:
		keep = cached
	else:
		for k in xs.size():
			var t := xs[k]
			var seen := false
			for ax in 3:
				for sg in [-1.0, 1.0]:
					var nl := Vector3.ZERO
					nl[ax] = sg
					var n := (t.basis * nl).normalized()
					var mid := t * (c + nl * h)
					# facing away from every lens: never seen
					var d := n.dot(mid) - BACK_MARGIN
					var any := false
					for p in _lens:
						if n.dot(p) > d:
							any = true
							break
					if not any:
						continue
					var u := Vector3.ZERO
					var v := Vector3.ZERO
					u[(ax + 1) % 3] = h[(ax + 1) % 3] * 0.8
					v[(ax + 2) % 3] = h[(ax + 2) % 3] * 0.8
					for q in [Vector3.ZERO, u + v, u - v, -u + v, -u - v]:
						if _sees(t * (c + nl * h + q), n, false, _lens_set):
							seen = true
							break
					if seen:
						break
				if seen:
					break
			if seen:
				keep.append(k)
		_seen_cache[ck] = keep
	_occl[i] = [xs.size(), keep]
	print("slim_scene: node %d: %d of %d instances can be seen" % [i, keep.size(), xs.size()])
	var r := Run.new()
	r.geo = g
	r.src = _tris(g)
	r.copies = keep.size()
	r.levels = [[0.0, _scene.buffer(int(geo.index.buffer)).to_int32_array()]]
	return r


## Whether any of these nodes is the ring's (under RING_NODE).
func _in_ring(list: Array) -> bool:
	for i in list:
		var p: int = i
		while p >= 0:
			if _scene.json.nodes[p].get("name", "") == RING_NODE:
				return true
			p = int(_scene.json.nodes[p].parent)
	return false


## Its first material's shader kind (venue_materials.gd), or "".
func _kind(node: int) -> String:
	var n: Dictionary = _scene.json.nodes[node]
	if n.materials.is_empty():
		return ""
	var k = _scene.json.materials[int(n.materials[0])].get("kind")
	return k if k is String else ""


## The crowd (crowd.gdshader): each fan's quad as one triangle twice its size that covers it, its
## two lower corners and its top left one (the shader doubles the corners; what's outside the
## figure and its seat back is discarded as before), so half the triangles.
func _crowd_run(g: int) -> Run:
	var geo: Dictionary = _scene.json.geometries[g]
	var corner := _vec3(geo.attributes.position)
	var index := _scene.buffer(int(geo.index.buffer)).to_int32_array()
	var out := PackedInt32Array()
	for q in index.size() / 6:
		var vs := {}
		for k in 6:
			vs[index[q * 6 + k]] = true
		var bl := -1
		var br := -1
		var tl := -1
		for v in vs:
			var c := corner[v]
			if c.y < 0.5:
				if c.x < 0.0:
					bl = v
				else:
					br = v
			elif c.x < 0.0:
				tl = v
		if bl < 0 or br < 0 or tl < 0:
			# (not a fan's quad: as it was)
			out.append_array(index.slice(q * 6, q * 6 + 6))
		else:
			out.append_array([bl, br, tl])
	var r := Run.new()
	r.geo = g
	r.src = index.size() / 3
	r.levels = [[0.0, out]]
	return r


## Geometry g's runs (one per group), with their levels and where they are.
func _runs(g: int, list: Array) -> Array[Run]:
	var geo: Dictionary = _scene.json.geometries[g]
	var attrs: Dictionary = geo.attributes
	var pos := _vec3(attrs.position)
	var box := AABB(pos[0], Vector3.ZERO)
	for p in pos:
		box = box.expand(p)
	var radius := box.size.length() * 0.5
	var dist := INF
	var scale := 0.0
	var copies := 0
	var inst := []
	var place := Transform3D.IDENTITY
	for i in list:
		var n: Dictionary = _scene.json.nodes[i]
		var w := _world[i]
		if n.has("instanceMatrix"):
			var count := int(n.instanceMatrix.count)
			copies += count
			var f := _scene.floats(int(n.instanceMatrix.buffer))
			var sizes := PackedFloat32Array()
			for k in count:
				var o := k * 16
				var t := w * Transform3D(Basis(Vector3(f[o], f[o + 1], f[o + 2]), Vector3(f[o + 4], f[o + 5], f[o + 6]), Vector3(f[o + 8], f[o + 9], f[o + 10])), Vector3(f[o + 12], f[o + 13], f[o + 14]))
				var s := maxf(t.basis.x.length(), maxf(t.basis.y.length(), t.basis.z.length()))
				scale = maxf(scale, s)
				var d := _near(t * box)
				dist = minf(dist, d)
				# (lit things, windows and signs, thin out only as far as THIN_RADIUS says)
				sizes.append(radius * s / d * (_thin / THIN_RADIUS if _glows(n) else 1.0))
			if count >= THIN_MIN and not _animated(n.name):
				inst.append([i, sizes])
		else:
			copies += 1
			var d := _near(w * box)
			if d < dist:
				dist = d
				place = w
	# simplified where it stands, as seen from the ring: a single drawing is warped so that a
	# metre of error weighs one over its distance (_warp); instances are simplified as they are,
	# their error over the nearest one's distance
	var shape := PackedVector3Array()
	var unit := 1.0
	if _object > 0.0:
		# (an object: as it looks from that far, every copy)
		inst = []
		dist = _object
		shape = pos
		unit = 1.0 / _object
	elif inst.is_empty() and copies == 1:
		shape.resize(pos.size())
		for i in pos.size():
			shape[i] = _warp(place * pos[i])
	else:
		shape = pos
		unit = scale / dist
	var index := _weld(attrs, pos.size(), _scene.buffer(int(geo.index.buffer)).to_int32_array())
	var groups: Array = geo.groups
	if groups.is_empty():
		groups = [[0, index.size(), 0]]
	var out: Array[Run] = []
	for gi in groups.size():
		var gr: Array = groups[gi]
		var r := Run.new()
		r.geo = g
		r.group = gi
		r.copies = copies
		r.dist = dist
		r.inst = inst
		var slice := index.slice(int(gr[0]), int(gr[0]) + int(gr[1]))
		var as_is := _scene.buffer(int(geo.index.buffer)).to_int32_array().slice(int(gr[0]), int(gr[0]) + int(gr[1]))
		r.src = as_is.size() / 3
		if inst.is_empty() and copies == 1:
			var side := int(_scene.json.materials[int(_scene.json.nodes[list[0]].materials[mini(int(gr[2]), _scene.json.nodes[list[0]].materials.size() - 1)])].side)
			var ck := "%d/%d" % [g, gi]
			var seen: PackedByteArray = _seen_cache.get(ck, PackedByteArray())
			if seen.is_empty():
				seen = _facing(slice, pos, place, side)
				_seen_cache[ck] = seen
			slice = _keep(slice, seen)
			as_is = _keep(as_is, seen)
			if _parts and not _glows(_scene.json.nodes[list[0]]):
				var parts := _parts_kept(as_is, pos, place)
				slice = _keep(slice, parts)
				as_is = _keep(as_is, parts)
		r.levels = [[0.0, as_is]]
		if slice.size() >= MIN_TRIS * 3 and not EXACT_KINDS.has(_kind(list[0])) and not _in_ring(list):
			_levels(r, shape, pos, slice, unit)
		out.append(r)
		if OS.has_environment("BB_SLIM_DEBUG") and slice.size() > 3000:
			var lv := ""
			for l in r.levels:
				lv += " %d@%.4f" % [l[1].size() / 3, l[0]]
			print("geo %d: %d corners, dist %.1f x%d:%s" % [g, pos.size(), dist, copies, lv])
	return out


## The hull round every lens position: its corners.
func _lens_hull() -> PackedVector3Array:
	if not FileAccess.file_exists(LENS_POINTS):
		return PackedVector3Array()
	var pts := PackedVector3Array()
	for q in JSON.parse_string(FileAccess.get_file_as_string(LENS_POINTS)):
		pts.append(Vector3(q[0], q[1], q[2]))
	# director.gd _filler_shot: ringside, high over the bowl, the upper tier, low on the floor
	for k in 0 if OS.has_environment("BB_SLIM_NOFILL") else 72:
		var a := TAU * k / 72.0
		pts.append(Vector3(cos(a) * 8.0, 1.5, sin(a) * 6.5))
		pts.append(Vector3(cos(a) * 22.0, 14.0, sin(a) * 18.0))
		pts.append(Vector3(cos(a) * (13.0 + 13.5 - 2.0), 9.4 + 1.2, sin(a) * (10.0 + 13.5 - 2.0)))
		pts.append(Vector3(cos(a) * (13.0 - 2.5), 0.4, sin(a) * (10.0 - 2.5)))
	var tris := PackedVector3Array()
	for i in pts.size() - 2:
		tris.append_array([pts[i], pts[i + 1], pts[i + 2]])
	var m := ArrayMesh.new()
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = tris
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var hull := (m.create_convex_shape(true, false) as ConvexPolygonShape3D).points
	var spread := {}
	for p in pts:
		spread[p.snapped(Vector3.ONE)] = p
	_lens_set = PackedVector3Array(spread.values())
	# (nearest the ring first: most faces anyone sees, they see)
	var near := Array(_lens_set)
	near.sort_custom(func(a, b): return a.length_squared() < b.length_squared())
	_lens_set = PackedVector3Array(near)
	print("slim_scene: %d lens positions (%d a metre apart), %d round their hull" % [pts.size(), _lens_set.size(), hull.size()])
	return hull


## Everything solid that stands still, as one collision shape: what hides what from the lenses.
func _occluders() -> void:
	var tris := PackedVector3Array()
	var nodes: Array = _scene.json.nodes
	for i in nodes.size():
		var n: Dictionary = nodes[i]
		if not n.has("geometry") or n.get("primitive", "triangles") != "triangles" or not n.get("visible", true):
			continue
		var geo: Dictionary = _scene.json.geometries[int(n.geometry)]
		var pos := _vec3(geo.attributes.position)
		var index := _scene.buffer(int(geo.index.buffer)).to_int32_array()
		if n.has("instanceMatrix"):
			# instanced: only what stands still and is never thinned out (container yards)
			if not _static_inst(n):
				continue
			for t in _inst_xforms(i):
				for k in index:
					tris.append(t * pos[k])
			continue
		if not _rigid(n) or not _solid(n):
			continue
		var w := _world[i]
		for k in index:
			tris.append(w * pos[k])
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(tris)
	var body := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	root.add_child(body)
	print("slim_scene: %d triangles hide what's behind them" % (tris.size() / 3))


## Opaque and drawn in depth: it hides what's behind it.
func _solid(n: Dictionary) -> bool:
	for mid in n.materials:
		var rec: Dictionary = _scene.json.materials[int(mid)]
		if rec.get("transparent", false) or int(rec.get("blending", 1)) != BakedScene.NORMAL_BLEND or float(rec.get("alphaTest", 0.0)) > 0.0 or not rec.get("depthWrite", true) or rec.has("map") and rec.get("transparent", false):
			return false
	return true


var _ray: PhysicsRayQueryParameters3D
var _hidden := 0


## Whether some lens sees point `p` on a face with front normal `n` (unit): from in front of the
## face, with nothing solid in between.
func _sees(p: Vector3, n: Vector3, two_sided: bool, lenses: PackedVector3Array) -> bool:
	var space := root.world_3d.direct_space_state
	if _ray == null:
		_ray = PhysicsRayQueryParameters3D.new()
		_ray.hit_back_faces = true
	for l in lenses:
		var v := l - p
		var dn := n.dot(v)
		if dn <= 0.0 and not two_sided:
			continue
		var len := v.length()
		if len < 1e-4:
			return true
		# (from just off the face, towards the lens)
		_ray.from = p + v / len * 0.02 + (n if dn > 0.0 else -n) * 0.005
		_ray.to = l
		if space.intersect_ray(_ray).is_empty():
			return true
	return false


## Per triangle of `slice`, whether any lens can see its face (always, if it has two).
## (Bakes wind front faces clockwise; side is three's: 0 front, 1 back, 2 both.)
func _facing(slice: PackedInt32Array, pos: PackedVector3Array, w: Transform3D, side: int) -> PackedByteArray:
	var seen := PackedByteArray()
	seen.resize(slice.size() / 3)
	seen.fill(1)
	if _lens.is_empty():
		return seen
	if side == 2:
		# two-sided: only what's hidden from both sides
		for t in seen.size():
			var a := w * pos[slice[t * 3]]
			var b := w * pos[slice[t * 3 + 1]]
			var c := w * pos[slice[t * 3 + 2]]
			var n := (c - a).cross(b - a)
			if n.length() < 1e-12:
				continue
			n = n.normalized()
			var m := (a + b + c) / 3.0
			var visible := false
			for q in [m, m.lerp(a, 0.85), m.lerp(b, 0.85), m.lerp(c, 0.85)]:
				if _sees(q, n, true, _lens_set):
					visible = true
					break
			if not visible:
				seen[t] = 0
				_hidden += 1
		return seen
	for t in seen.size():
		var a := w * pos[slice[t * 3]]
		var b := w * pos[slice[t * 3 + 1]]
		var c := w * pos[slice[t * 3 + 2]]
		var n := (c - a).cross(b - a)
		if side == 1:
			n = -n
		var l := n.length()
		if l < 1e-12:
			continue
		n /= l
		var d := n.dot(a) - BACK_MARGIN
		var any := false
		for p in _lens:
			if n.dot(p) > d:
				any = true
				break
		if not any:
			seen[t] = 0
			continue
		# hidden behind something solid from every lens: sampled at its middle, near its corners
		# and its edges' middles
		var m := (a + b + c) / 3.0
		var visible := false
		for q in [m, m.lerp(a, 0.85), m.lerp(b, 0.85), m.lerp(c, 0.85), m.lerp((a + b) * 0.5, 0.85), m.lerp((b + c) * 0.5, 0.85), m.lerp((c + a) * 0.5, 0.85)]:
			if _sees(q, n, false, _lens_set):
				visible = true
				break
		if not visible:
			seen[t] = 0
			_hidden += 1
	return seen


## Which triangles of a single drawing stay when its loose pieces (joined where corners meet)
## thin out as instances do (_keeps), by their size on screen from the nearest lens.
static func _parts_kept(tris: PackedInt32Array, pos: PackedVector3Array, w: Transform3D) -> PackedByteArray:
	var n := pos.size()
	var up := PackedInt32Array()
	up.resize(n)
	for i in n:
		up[i] = i
	var at := {}
	for i in n:
		var k := pos[i].snapped(Vector3.ONE * 1e-3)
		if at.has(k):
			up[_root(up, i)] = _root(up, at[k])
		else:
			at[k] = i
	for t in tris.size() / 3:
		var a := _root(up, tris[t * 3])
		up[_root(up, tris[t * 3 + 1])] = a
		up[_root(up, tris[t * 3 + 2])] = a
	var boxes := {}
	for v in tris:
		var r := _root(up, v)
		var p := w * pos[v]
		boxes[r] = (boxes[r] as AABB).expand(p) if boxes.has(r) else AABB(p, Vector3.ZERO)
	var keep := {}
	var k := 0
	for r in boxes:
		var b: AABB = boxes[r]
		keep[r] = _keeps(k, b.size.length() * 0.5 / _near(b), 0.0)
		k += 1
	var out := PackedByteArray()
	out.resize(tris.size() / 3)
	for t in out.size():
		out[t] = 1 if keep[_root(up, tris[t * 3])] else 0
	return out


## A material that lights itself (venue GLSL scaled by uGlow: lit windows, neon signs, lamps).
func _glows(n: Dictionary) -> bool:
	for m in n.get("materials", []):
		var src = _scene.json.materials[int(m)].get("src")
		if src is Dictionary and _GLOW.search(String(src.get("fragment", ""))) != null:
			return true
	return false


static func _root(up: PackedInt32Array, i: int) -> int:
	while up[i] != i:
		up[i] = up[up[i]]
		i = up[i]
	return i


static func _keep(slice: PackedInt32Array, seen: PackedByteArray) -> PackedInt32Array:
	var out := PackedInt32Array()
	for t in seen.size():
		if seen[t]:
			out.append_array([slice[t * 3], slice[t * 3 + 1], slice[t * 3 + 2]])
	return out


## Where a point lands in the space the simplifier works in for a scene's own meshes: pulled in
## towards the lens so that each metre away from it counts one over its distance (radially; across
## it counts a little more, which only keeps more).
static func _warp(p: Vector3) -> Vector3:
	var v := p - LENS
	var r := v.length()
	if r < 1e-6:
		return Vector3.ZERO
	var k := LENS_R + NEAR
	var w := r / NEAR if r <= k else k / NEAR + log((r - LENS_R) / NEAR)
	return v / r * w


## The instanced nodes the venue's tick moves one by one (rooftop.gd's searchlights, rotors,
## gondolas and train, the gulls): every instance stays.
func _animated(name: String) -> bool:
	if name == "":
		return false
	var anim: Dictionary = _scene.json.get("anim", {})
	for r in anim.get("inst", []):
		if r.name == name:
			return true
	var train: Dictionary = anim.get("train", {})
	return name == "gulls" or name == train.get("name", "") or name == train.get("glow", "")


func _vec3(a: Dictionary) -> PackedVector3Array:
	var bytes := _scene.buffer(int(a.buffer))
	if int(a.itemSize) == 3:
		return bytes.to_vector3_array()
	var f := bytes.to_float32_array()
	var w := int(a.itemSize)
	var out := PackedVector3Array()
	out.resize(f.size() / w)
	for i in out.size():
		out[i] = Vector3(f[i * w], f[i * w + 1] if w > 1 else 0.0, f[i * w + 2] if w > 2 else 0.0)
	return out


## The index with each corner swapped for the first one exactly like it in everything but its
## normal: the simplifier takes corners at one place that differ in anything as a seam to keep, so
## colour and texture edges stay put, while hard (creased) edges can fold away where the error
## allows. `_alts` keeps, per such corner, the others there with other normals (see _renormal).
var _alts := {}
var _nor := PackedVector3Array()


func _weld(attrs: Dictionary, n: int, index: PackedInt32Array) -> PackedInt32Array:
	var cols := []
	for name in attrs:
		if name == "normal":
			continue
		var a: Dictionary = attrs[name]
		var f := _scene.buffer(int(a.buffer)).to_float32_array()
		if name == "color":
			# colours within a shade of each other count as one (the bakes jitter each face's
			# colour a little: welded exactly, every face would stand alone and nothing could go)
			f = f.duplicate()
			for k in f.size():
				f[k] = roundf(sqrt(maxf(f[k], 0.0)) * COLOR_STEPS)
		if f.size() >= n * int(a.itemSize):
			cols.append([f, int(a.itemSize)])
	_nor = _vec3(attrs.normal) if attrs.has("normal") else PackedVector3Array()
	_alts = {}
	var first := {}
	var remap := PackedInt32Array()
	remap.resize(n)
	for i in n:
		var key := PackedFloat32Array()
		for c in cols:
			var w: int = c[1]
			key.append_array((c[0] as PackedFloat32Array).slice(i * w, i * w + w))
		remap[i] = first.get(key, i)
		if remap[i] == i:
			first[key] = i
		elif not _nor.is_empty() and _nor[i] != _nor[remap[i]]:
			if not _alts.has(remap[i]):
				_alts[remap[i]] = PackedInt32Array([remap[i]])
			var list: PackedInt32Array = _alts[remap[i]]
			var dup := false
			for j in list:
				if _nor[j] == _nor[i]:
					dup = true
					break
			if not dup:
				list.append(i)
				_alts[remap[i]] = list
	var out := index.duplicate()
	for k in out.size():
		out[k] = remap[out[k]]
	return out


## A simplified list's corners given back their normals: where a welded corner stood for several
## (a crease), the one whose normal is nearest its new face's.
func _renormal(idx: PackedInt32Array, pos: PackedVector3Array) -> PackedInt32Array:
	if _alts.is_empty():
		return idx
	var out := idx.duplicate()
	for t in idx.size() / 3:
		var a := pos[idx[t * 3]]
		var n := (pos[idx[t * 3 + 2]] - a).cross(pos[idx[t * 3 + 1]] - a)
		for c in 3:
			var list: PackedInt32Array = _alts.get(idx[t * 3 + c], PackedInt32Array())
			var best := -INF
			for j in list:
				var d := _nor[j].dot(n)
				if d > best:
					best = d
					out[t * 3 + c] = j
	return out


## The run's levels: the simplifier (meshoptimizer, through SurfaceTool) at errors growing from
## a hair to a quarter of the shape's size, each kept if it has fewer triangles than the last.
## `unit` turns the shape's error into error over distance.
func _levels(r: Run, shape: PackedVector3Array, pos: PackedVector3Array, slice: PackedInt32Array, unit: float) -> void:
	# only the corners it uses: the simplifier takes any two corners at one place as a seam, even
	# one no triangle uses, which would pin every corner of a mesh baked one triangle at a time
	var local := {}
	var back := PackedInt32Array()
	var verts := PackedVector3Array()
	var idx0 := PackedInt32Array()
	idx0.resize(slice.size())
	for k in slice.size():
		var v := slice[k]
		if not local.has(v):
			local[v] = back.size()
			back.append(v)
			verts.append(shape[v])
		idx0[k] = local[v]
	var box := AABB(verts[0], Vector3.ZERO)
	for p in verts:
		box = box.expand(p)
	var extent := maxf(box.size.x, maxf(box.size.y, box.size.z))
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_INDEX] = idx0
	var st := SurfaceTool.new()
	st.create_from_arrays(arr)
	var rel := 2e-5
	while rel < 0.3:
		var idx := st.generate_lod(rel, 3)
		if idx.size() >= 3 and idx.size() < r.levels[-1][1].size():
			for k in idx.size():
				idx[k] = back[idx[k]]
			r.levels.append([rel * extent * unit, _renormal(idx, pos)])
		rel *= 1.4


## The coarsest level within `tau` (error over distance).
static func _pick(r: Run, tau: float) -> PackedInt32Array:
	var out: PackedInt32Array = r.levels[0][1]
	for l in r.levels:
		if l[0] <= tau:
			out = l[1]
	return out


## Whether instance k (screen radius `size`) stays at `tau`: always where it is big enough on
## screen, else with a chance that falls with its size (hashed, so the same ones every time).
static func _keeps(k: int, size: float, tau: float) -> bool:
	var p := size / _thin
	if p >= 1.0:
		return true
	var hsh := float(hash(k * 7919 + 13) % 10007) / 10007.0
	return hsh < p


static func _kept(r: Run, tau: float) -> int:
	if r.inst.is_empty():
		return r.copies
	var c := r.copies
	for e in r.inst:
		var sizes: PackedFloat32Array = e[1]
		for k in sizes.size():
			if not _keeps(k, sizes[k], tau):
				c -= 1
	return c


func _total(runs: Array[Run], tau: float) -> int:
	var n := 0
	for r in runs:
		n += _pick(r, tau).size() / 3 * _kept(r, tau)
	return n


func _write(out_path: String, runs: Array[Run], tau: float) -> void:
	# per geometry: its runs' new lists, back to back as groups
	var by_geo := {}
	for r in runs:
		if not by_geo.has(r.geo):
			by_geo[r.geo] = []
		by_geo[r.geo].append(r)
	var body := StreamPeerBuffer.new()
	var changed := []
	for g in by_geo:
		var same := true
		for r: Run in by_geo[g]:
			if _pick(r, tau).size() != r.src * 3:
				same = false
		if not same:
			changed.append(g)
	body.put_u32(changed.size())
	var groups_src := {}
	for g in changed:
		var geo: Dictionary = _scene.json.geometries[g]
		var src: Array = geo.groups
		var index := PackedInt32Array()
		var groups := []
		for r: Run in by_geo[g]:
			var idx := _pick(r, tau)
			var mat := int(src[r.group][2]) if not src.is_empty() else 0
			groups.append([index.size(), idx.size(), mat])
			index.append_array(idx)
		body.put_u32(g)
		body.put_u32(_tris(g) * 3)
		body.put_u32(groups.size())
		for gr in groups:
			body.put_u32(gr[0])
			body.put_u32(gr[1])
			body.put_u32(gr[2])
		body.put_u32(index.size())
		body.put_data(index.to_byte_array())
	# the instanced nodes thinned out
	var thinned := {}
	for r in runs:
		for e in r.inst:
			thinned[e[0]] = e[1]
	var lists := []
	for i in thinned:
		var sizes: PackedFloat32Array = thinned[i]
		var keep := PackedInt32Array()
		for k in sizes.size():
			if _keeps(k, sizes[k], tau):
				keep.append(k)
		if keep.size() < sizes.size():
			lists.append([i, sizes.size(), keep])
	for i in _occl:
		if _occl[i][1].size() < _occl[i][0]:
			lists.append([i, _occl[i][0], _occl[i][1]])
	body.put_u32(lists.size())
	for e in lists:
		body.put_u32(e[0])
		body.put_u32(e[1])
		body.put_u32(e[2].size())
		body.put_data(e[2].to_byte_array())
		print("slim_scene: node %d keeps %d of %d instances" % [e[0], e[2].size(), e[1]])
	var raw := body.data_array
	var out := StreamPeerBuffer.new()
	out.put_data("BBSL".to_ascii_buffer())
	out.put_u32(1)
	out.put_u32(raw.size())
	out.put_data(raw.compress(FileAccess.COMPRESSION_ZSTD))
	var f := FileAccess.open(out_path, FileAccess.WRITE)
	f.store_buffer(out.data_array)
	f.close()
	print("slim_scene: %s: %d geometries slimmed, %d KB" % [out_path, changed.size(), out.get_size() / 1024])
