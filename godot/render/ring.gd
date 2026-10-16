## The ring: printed canvas over a padded bumper, steel lip, LED skirt down to the arena floor,
## padded corner posts with beacons, and three neon ropes a side. Footprint and heights match the
## sim (sim/body.ts); shapes follow src/render/arena.ts.
class_name Ring
extends Node3D

const SIDES := 8
const RING_R := 5.0
const ROPE_HEIGHTS := [0.55, 0.95, 1.35]
const FLOOR := -0.62
const COS8 := 0.92387953

var _rope_mat: ShaderMaterial
var _skirt_mat: ShaderMaterial
var _glow_mat: StandardMaterial3D


static func corner_angle(i: int) -> float:
	return float(i) / SIDES * TAU + PI / SIDES


static func _std(hex: int, metal: float, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color.hex((hex << 8) | 0xff)
	m.metallic = metal
	m.roughness = rough
	return m


func _init() -> void:
	var R := RING_R + 0.55
	var B := RING_R + 0.75
	# canvas
	var canvas := MeshInstance3D.new()
	canvas.mesh = _oct_disc(R)
	var cm := ShaderMaterial.new()
	cm.shader = preload("res://render/canvas.gdshader")
	canvas.material_override = cm
	add_child(canvas)
	# the canvas wraps over a padded bumper at its edge
	var bumper := _band_mesh([[R - 0.11, 0.0005], [R - 0.05, 0.014], [R - 0.005, 0.012], [R + 0.02, -0.02], [R + 0.025, -0.07], [R + 0.01, -0.11], [R - 0.01, -0.125]])
	_add(bumper, _std(0x14161c, 0.05, 0.55))
	# steel lip and foot of the stage
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_oct_band(st, [[R - 0.02, -0.118], [B - 0.01, -0.118], [B + 0.015, -0.135], [B + 0.04, -0.17]])
	_oct_band(st, [[B + 0.11, -0.52], [B + 0.15, -0.56], [B + 0.21, FLOOR]])
	_add(st.commit(), _std(0x1b1f28, 0.6, 0.55))
	# LED skirt between them
	_skirt_mat = ShaderMaterial.new()
	_skirt_mat.shader = preload("res://render/skirt.gdshader")
	var skirt := _add(_band_mesh([[B + 0.04, -0.17], [B + 0.11, -0.52]]), _skirt_mat)
	skirt.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_build_posts()
	_build_ropes()
	# the arena floor round the stage
	var floor := MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 40.0
	disc.bottom_radius = 40.0
	disc.height = 0.02
	disc.radial_segments = 64
	disc.rings = 1
	floor.mesh = disc
	floor.position.y = FLOOR - 0.01
	floor.material_override = _std(0x0b0d12, 0.2, 0.7)
	floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(floor)
	_labels()


func _add(mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	add_child(mi)
	return mi


## Lights pulse with the crowd (0..1) and run their animations.
func animate(time: float, hype: float) -> void:
	for m in [_rope_mat, _skirt_mat]:
		m.set_shader_parameter("time", time)
		m.set_shader_parameter("hype", hype)
	_glow_mat.emission_energy_multiplier = 2.6 + hype * 1.2


func _oct_disc(r: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_normal(Vector3.UP)
	for i in SIDES:
		var a0 := corner_angle(i)
		var a1 := corner_angle(i + 1)
		for p in [Vector3.ZERO, Vector3(cos(a0) * r, 0, sin(a0) * r), Vector3(cos(a1) * r, 0, sin(a1) * r)]:
			st.set_uv(Vector2(p.x, p.z) / (2 * r) + Vector2(0.5, 0.5))
			st.add_vertex(p)
	return st.commit()


func _band_mesh(profile: Array) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_oct_band(st, profile)
	return st.commit()


## An octagonal band lofted from [corner radius, height] points (ring.ts octBand): each side has
## its own corners, so the octagon stays crisp; u runs once round the ring, v along the profile.
func _oct_band(st: SurfaceTool, profile: Array) -> void:
	var n := profile.size()
	var pn := []
	var lens := [0.0]
	for j in n:
		var a: Array = profile[maxi(0, j - 1)]
		var b: Array = profile[mini(n - 1, j + 1)]
		var dr: float = (b[0] - a[0]) * COS8
		var dy: float = b[1] - a[1]
		var l := maxf(1e-9, Vector2(dr, dy).length())
		pn.append(Vector2(-dy / l, dr / l))
		if j > 0:
			lens.append(lens[j - 1] + Vector2((profile[j][0] - profile[j - 1][0]) * COS8, profile[j][1] - profile[j - 1][1]).length())
	var total: float = maxf(1e-9, lens[n - 1])
	for s in SIDES:
		var a0 := corner_angle(s - 1)
		var a1 := corner_angle(s)
		var am := (a0 + a1) / 2
		var out := Vector3(cos(am), 0, sin(am))
		for j in n - 1:
			var quad := []
			for jj in [j, j + 1]:
				for aa in [a0, a1]:
					var pr: Array = profile[jj]
					var nn: Vector2 = pn[jj]
					quad.append([Vector3(cos(aa) * pr[0], pr[1], sin(aa) * pr[0]), (out * nn.x + Vector3.UP * nn.y).normalized(), Vector2((s + (1.0 if aa == a1 else 0.0)) / SIDES, lens[jj] / total)])
			# (0: j a0, 1: j a1, 2: j+1 a0, 3: j+1 a1); clockwise seen from outside (Godot's front)
			for k in [0, 3, 1, 0, 2, 3]:
				st.set_normal(quad[k][1])
				st.set_uv(quad[k][2])
				st.add_vertex(quad[k][0])


## A surface of revolution round Y from (radius, height) points.
static func _lathe(st: SurfaceTool, pts: Array, seg: int, at: Vector3) -> void:
	var n := pts.size()
	for i in seg:
		var a0 := float(i) / seg * TAU
		var a1 := float(i + 1) / seg * TAU
		for j in n - 1:
			var p0: Vector2 = pts[j]
			var p1: Vector2 = pts[j + 1]
			var d := p1 - p0
			var nr := Vector2(d.y, -d.x).normalized()
			var v := []
			for e in [[p0, a0], [p0, a1], [p1, a0], [p1, a1]]:
				var p: Vector2 = e[0]
				var a: float = e[1]
				v.append([at + Vector3(cos(a) * p.x, p.y, sin(a) * p.x), Vector3(cos(a) * nr.x, nr.y, sin(a) * nr.x)])
			for k in [0, 3, 2, 0, 1, 3]:
				st.set_normal(v[k][1])
				st.add_vertex(v[k][0])


static func _append(st: SurfaceTool, mesh: PrimitiveMesh, xf: Transform3D) -> void:
	st.append_from(mesh, 0, xf)


static func _cyl(top: float, bottom: float, h: float, seg: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	return c


## Corner posts: bolted flange, steel column, a tall vinyl pad, an LED strip down the pad's
## ring-facing side and a glowing beacon on top (arena.ts buildPosts).
func _build_posts() -> void:
	var steel := SurfaceTool.new()
	steel.begin(Mesh.PRIMITIVE_TRIANGLES)
	var pads := SurfaceTool.new()
	pads.begin(Mesh.PRIMITIVE_TRIANGLES)
	var glow := SurfaceTool.new()
	glow.begin(Mesh.PRIMITIVE_TRIANGLES)
	var pad_shape := [Vector2(0.07, 0.36), Vector2(0.14, 0.375), Vector2(0.165, 0.41), Vector2(0.172, 0.6), Vector2(0.172, 1.3), Vector2(0.165, 1.48), Vector2(0.14, 1.515), Vector2(0.07, 1.53)]
	for i in SIDES:
		var a := corner_angle(i)
		var c := Vector3(cos(a) * RING_R, 0, sin(a) * RING_R)
		_append(steel, _cyl(0.22, 0.25, 0.04, 8), Transform3D(Basis(), c + Vector3(0, 0.02, 0)))
		for b in 4:
			var ba := a + PI / 4 + b * PI / 2
			_append(steel, _cyl(0.022, 0.022, 0.03, 6), Transform3D(Basis(), c + Vector3(cos(ba) * 0.17, 0.05, sin(ba) * 0.17)))
		_append(steel, _cyl(0.07, 0.08, 1.66, 8), Transform3D(Basis(), c + Vector3(0, 0.83, 0)))
		_append(steel, _cyl(0.13, 0.1, 0.07, 12), Transform3D(Basis(), c + Vector3(0, 1.665, 0)))
		_lathe(pads, pad_shape, 12, c)
		_append(glow, _cyl(0.11, 0.12, 0.04, 12), Transform3D(Basis(), c + Vector3(0, 1.72, 0)))
		var led := BoxMesh.new()
		led.size = Vector3(0.035, 0.86, 0.02)
		_append(glow, led, Transform3D(Basis(Vector3.UP, atan2(-c.x, -c.z)), c - Vector3(cos(a), 0, sin(a)) * 0.168 + Vector3(0, 0.95, 0)))
	_add(steel.commit(), _std(0x3a404c, 0.85, 0.32))
	_add(pads.commit(), _std(0x1d2029, 0.1, 0.42))
	_glow_mat = StandardMaterial3D.new()
	_glow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_glow_mat.albedo_color = Color(1.0, 0.36, 0.05)
	_glow_mat.emission_enabled = true
	_glow_mat.emission = Color(1.0, 0.36, 0.05)
	_glow_mat.emission_energy_multiplier = 3.0
	var g := _add(glow.commit(), _glow_mat)
	g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## Three ropes a side with two vinyl straps tying them (arena.ts buildRopes; the ropes don't bow yet).
func _build_ropes() -> void:
	var ropes := SurfaceTool.new()
	ropes.begin(Mesh.PRIMITIVE_TRIANGLES)
	var straps := SurfaceTool.new()
	straps.begin(Mesh.PRIMITIVE_TRIANGLES)
	var h0: float = ROPE_HEIGHTS[0]
	var h1: float = ROPE_HEIGHTS[ROPE_HEIGHTS.size() - 1]
	for i in SIDES:
		var a0 := corner_angle(i - 1)
		var a1 := corner_angle(i)
		var p0 := Vector3(cos(a0), 0, sin(a0)) * RING_R
		var p1 := Vector3(cos(a1), 0, sin(a1)) * RING_R
		var length := p0.distance_to(p1)
		var dir := (p1 - p0) / length
		# Y of the cylinder along the rope
		var basis := Basis(Vector3.UP.cross(dir).normalized(), dir, Vector3.UP.cross(dir).normalized().cross(dir))
		for h in ROPE_HEIGHTS:
			var rope := _cyl(0.026, 0.026, length, 8)
			rope.rings = 16
			rope.cap_top = false
			rope.cap_bottom = false
			_append(ropes, rope, Transform3D(basis, (p0 + p1) / 2 + Vector3(0, h, 0)))
		for f in [1.0 / 3, 2.0 / 3]:
			var strap := BoxMesh.new()
			strap.size = Vector3(0.05, h1 - h0, 0.034)
			_append(straps, strap, Transform3D(Basis(Vector3.UP, -atan2(dir.z, dir.x)), p0.lerp(p1, f) + Vector3(0, (h0 + h1) / 2, 0)))
	_rope_mat = ShaderMaterial.new()
	_rope_mat.shader = preload("res://render/rope.gdshader")
	var r := _add(ropes.commit(), _rope_mat)
	r.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_add(straps.commit(), _std(0x15171d, 0.1, 0.5))


## Printed lettering on the apron and the BB mark (ring.ts canvasTexture's text).
func _labels() -> void:
	var apron := (RING_R * COS8 + (RING_R + 0.55) * COS8) / 2 + 0.03
	for i in SIDES:
		var a := (corner_angle(i - 1) + corner_angle(i)) / 2
		var l := Label3D.new()
		l.text = "ROBOT FIGHTING LEAGUE" if i % 2 else "BATTLEBOTS"
		l.font_size = 64
		l.pixel_size = 0.0028
		l.modulate = Color(1, 1, 1, 0.17)
		l.outline_size = 0
		l.shaded = true
		l.double_sided = false
		var out := Vector3(cos(a), 0, sin(a))
		# lying flat, reading from outside the ring
		l.transform = Transform3D(Basis(Vector3.UP.cross(out), -out, Vector3.UP), out * apron + Vector3(0, 0.003, 0))
		add_child(l)
	var bb := Label3D.new()
	bb.text = "BB"
	bb.font_size = 256
	bb.pixel_size = 0.0045
	bb.modulate = Color(1, 1, 1, 0.94)
	bb.outline_modulate = Color(1, 0.55, 0.16, 0.9)
	bb.outline_size = 16
	bb.shaded = true
	bb.transform = Transform3D(Basis(Vector3.RIGHT, -PI / 2), Vector3(0, 0.004, 0))
	add_child(bb)
