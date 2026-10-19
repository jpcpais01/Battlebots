## Pictures of the real robot parts for the part tiles, the garage's parts picker and the market
## cards (src/render/partPreview.ts PartThumbs): each item's actual armour (the same baked parts
## the robot is built from, render/bot_parts.gd), posed like a product shot, in the player's paint
## and at a rarity, drawn into a small transparent picture. Pictures are cached per item, rarity,
## paint and the parts they depend on, so the first look at a slot costs a few small draws and
## every look after is free.
##
## thumb() hands back the picture if it's made, or null and queues it: at most one picture is
## drawn a frame (an offscreen SubViewport with its own world and lights). The frame after, its
## read-back is asked for with RenderingDevice.texture_get_data_async, which copies it out on the
## GPU's own time and lands it a frame or two later, so nothing waits on the GPU (a plain
## get_image() stalls the whole pipeline for each picture, up to ~160 of them as the garage's
## parts picker fills). The Compatibility renderer has no RenderingDevice and reads back with
## get_image() instead. When a picture lands, `ready_thumb` fires (and the optional `done`
## callbacks get it), so the screen can swap it in.
##
## The web draws at twice the card size, on black and on white, to get exact transparency. Here
## the parts are drawn at twice the size on a transparent background (its edges come out
## premultiplied) and a second, 2D pass averages each 2x2 block and divides the colour back out.
class_name PartThumbs
extends Node

## A picture landed: its cache key and texture.
signal ready_thumb(key: String, tex: Texture2D)

## Picture edge in pixels (drawn at twice this and filtered down).
const SIZE := 176
const PX := SIZE * 2
## Pictures kept: every part of the current paint job and a few recent ones.
const MAX_CACHED := 160
const FOREARM := 0.33
const LIMB := 0.46
const TOE_OFFSET := Vector3(0, -0.048, 0.072)
const FOV := 24.0
## partPreview.ts lights: hemisphere (sky, ground, intensity), then key, warm and cool directionals.
const HEMI := [0xc8d8ff, 0x1c1610, 0.9]
const LIGHTS := [[0xfff4e8, 2.6, Vector3(-1.4, 2.2, 2.4)], [0xff9a4a, 2.2, Vector3(2.4, 0.8, -1.6)], [0x5fd2ff, 1.8, Vector3(-2.4, 0.4, -1.8)]]
const ENV := 0.7

## Off: always read back with get_image() (tests compare the two ways).
static var async_readback := true

var _cache := {}
## Queued pictures, oldest first: [key, item, rarity, paint, loadout, callbacks]. A job stays in
## _queued until its picture lands, so asking again meanwhile only adds a callback to it.
var _queue: Array = []
var _queued := {}
## The job drawn last frame, read back this frame (empty when none).
var _drawn: Array = []
## Asynchronous read-backs asked for and not landed yet.
var reading := 0
var _vp3: SubViewport
var _vp2: SubViewport
var _holder: Node3D
var _cam: Camera3D
var _opaque_mat: ShaderMaterial
var _glow_mat: ShaderMaterial
var _opaque: MeshInstance3D
var _glow: MeshInstance3D
## Cost of the last picture's set-up and read-back (us), for checks.
var last_us := 0


## The picture of `item` at `rarity`, in `paint`, on a bot wearing `loadout` (the parts a slot
## depends on: the core sits in the chest, a shin guard on the legs; null: the stock robot's), or
## null if it isn't made yet (it's queued; ready_thumb and `done` bring it).
func thumb(item, rarity: int, paint, loadout = null, done := Callable()) -> Texture2D:
	var lo = loadout if loadout != null else TLoadout.DEFAULT_PLAYER.loadout
	var k := key_of(item, rarity, paint, lo)
	var tex: Texture2D = _cache.get(k)
	if tex != null:
		# most recently used last
		_cache.erase(k)
		_cache[k] = tex
		return tex
	if _queued.has(k):
		if done.is_valid():
			_queued[k][5].append(done)
		return null
	# (nothing draws headless: no pictures)
	if DisplayServer.get_name() == "headless":
		return null
	var job := [k, item, rarity, paint, lo, [done] if done.is_valid() else []]
	_queued[k] = job
	_queue.append(job)
	return null


## The cache key (partPreview.ts get): the item, rarity, paint and the parts its picture shows of
## the other slots.
static func key_of(item, rarity: int, paint, lo) -> String:
	var deps := ""
	match str(item.slot):
		"core":
			deps = str(_look(lo, "chest"))
		"chest":
			deps = "%d%d" % [_look(lo, "core"), int(lo.core.rarity)]
		"legs":
			deps = "%d%d" % [_look(lo, "kick"), int(lo.kick.rarity)]
		"kick":
			deps = "%d%d" % [_look(lo, "legs"), int(lo.legs.rarity)]
	return "%s|%d|%s|%s" % [item.id, rarity, TPaint.paintKey(paint), deps]


static func _look(lo, slot: String) -> int:
	return int(TItems.ITEM_BY_ID.get(lo[slot].id).look)


func _process(_dt: float) -> void:
	if not _drawn.is_empty():
		_read_back()
	if _queue.is_empty():
		return
	var job: Array = _queue.pop_front()
	_draw(job)


func _read_back() -> void:
	var t0 := Time.get_ticks_usec()
	var job: Array = _drawn
	_drawn = []
	var rd := _async_device()
	if rd != null:
		var rid := RenderingServer.texture_get_rd_texture(_vp2.get_texture().get_rid())
		if rid.is_valid() and rd.texture_get_data_async(rid, 0, _landed.bind(job)) == OK:
			reading += 1
			last_us += Time.get_ticks_usec() - t0
			return
	_land(job, _vp2.get_texture().get_image())
	last_us += Time.get_ticks_usec() - t0


## The RenderingDevice to read back through, or null for get_image(): none on the Compatibility
## renderer, and only while rendering runs on the main thread (a separate render thread would
## need every call handed over to it; the project uses the default, safe model).
func _async_device() -> RenderingDevice:
	if not async_readback or int(ProjectSettings.get_setting("rendering/driver/threads/thread_model", 1)) == 2:
		return null
	return RenderingServer.get_rendering_device()


## An asynchronous read-back has landed: the 2D pass's pixels, tightly packed RGBA8 (the format
## get_image() hands back for this viewport, byte for byte).
func _landed(data: PackedByteArray, job: Array) -> void:
	reading -= 1
	var img: Image = null
	if data.size() == SIZE * SIZE * 4:
		img = Image.create_from_data(SIZE, SIZE, false, Image.FORMAT_RGBA8, data)
	else:
		# (not the format expected: draw it again and read it back the plain way)
		push_warning("PartThumbs: read-back of %d bytes, expected %d" % [data.size(), SIZE * SIZE * 4])
		async_readback = false
		_queue.push_front(job)
		return
	_land(job, img)


## A picture is in: cache it and hand it to whoever asked (in the order they asked).
func _land(job: Array, img: Image) -> void:
	var k: String = job[0]
	_queued.erase(k)
	var tex: Texture2D = null
	if img != null and not img.is_empty():
		tex = ImageTexture.create_from_image(img)
		# trying paint jobs makes a new set of pictures each time: forget the oldest
		if _cache.size() >= MAX_CACHED:
			_cache.erase(_cache.keys()[0])
		_cache[k] = tex
	if tex == null:
		return
	ready_thumb.emit(k, tex)
	for c: Callable in job[5]:
		if c.is_valid():
			c.call(tex)


# ------------------------------------------------------------------ the product shot

static func _at(x: float, y: float, z: float, rx := 0.0, ry := 0.0, rz := 0.0, s := 1.0) -> Transform3D:
	# three's Euler 'XYZ': Rx * Ry * Rz
	var b := Basis(Vector3.RIGHT, rx) * Basis(Vector3.UP, ry) * Basis(Vector3.BACK, rz)
	return Transform3D(b * Basis.from_scale(Vector3.ONE * s) if s != 1.0 else b, Vector3(x, y, z))


static func _scaled(xf: Transform3D, s: Vector3) -> Transform3D:
	return xf * Transform3D(Basis.from_scale(s), Vector3.ZERO)


## Hanging limb: +Y of the bone points down and slightly out (`out`), bent forward by `bend`.
static func _limb(x: float, y: float, z: float, out: float, bend: float) -> Transform3D:
	return Transform3D(Basis(Vector3.BACK, PI + out) * Basis(Vector3.RIGHT, bend), Vector3(x, y, z))


static func _limb_end(xf: Transform3D, length: float) -> Vector3:
	return xf * Vector3(0, length, 0)


## partPreview.ts shotFor: the parts an item puts on the bot ([part key, placement, rarity]),
## and the turntable's yaw, pitch and roll.
static func shot_for(item, rarity: int, lo) -> Dictionary:
	var look := int(item.look)
	match str(item.slot):
		"head":
			return {"parts": [
				["head/%d" % look, _at(0, 0, 0), rarity],
				# a stub of the neck under the helmet
				["neck", _scaled(_at(0, -0.16, -0.01), Vector3(1, 0.1, 1)), rarity],
			], "yaw": 0.55, "pitch": 0.12, "roll": 0.0}
		"fist":
			var parts := [
				["forearm/%d" % look, _at(0, 0, 0), rarity],
				["fist/%d/1" % look, _at(0, FOREARM, 0), rarity],
			]
			if item.get("ability") == "rocketPunch":
				parts.append(["rocket", _scaled(_at(0, 0.2, 0), Vector3(1, FOREARM - 0.2, 1)), rarity])
			# a jab thrown past the viewer's shoulder: the fist comes forward and fills the frame
			return {"parts": parts, "yaw": -0.95, "pitch": 0.3, "roll": -1.25}
		"core":
			# only the chest-mounted reactor, not the back unit (where on the chest doesn't matter:
			# the picture is centred on it)
			return {"parts": [["coreF/%d" % look, _at(0, 0, 0), rarity]], "yaw": 0.5, "pitch": 0.2, "roll": 0.0}
		"chest":
			var core = lo.core
			var shift: Array = BotParts.info.coreShift[look]
			return {"parts": [
				["torso/%d" % look, _at(0, 0, 0), rarity],
				["coreF/%d" % _look(lo, "core"), _at(shift[0], shift[1], shift[2]), int(core.rarity)],
				["coreB/%d" % _look(lo, "core"), _at(shift[3], shift[4], shift[5]), int(core.rarity)],
				["upperArm/%d/-1" % look, _limb(0.31, 0.1, 0, 0.22, 0.05), rarity],
				["upperArm/%d/1" % look, _limb(-0.31, 0.1, 0, -0.22, 0.05), rarity],
			], "yaw": 0.55, "pitch": 0.12, "roll": 0.0}
		"legs":
			var kick := _look(lo, "kick")
			var kr := int(lo.kick.rarity)
			var parts := [["pelvis/%d" % look, _at(0, 0, 0), rarity]]
			for side in [1.0, -1.0]:
				var thigh := _limb(side * 0.15, -0.07, 0, side * 0.08, 0.2)
				var knee := _limb_end(thigh, LIMB)
				var shin := _limb(knee.x, knee.y, knee.z, side * 0.08, -0.2)
				var ankle := _limb_end(shin, LIMB)
				var foot := _at(ankle.x, ankle.y, ankle.z, 0, side * 0.12, 0)
				parts.append_array([
					["thigh/%d" % look, thigh, rarity],
					["shin/%d" % look, shin, rarity],
					["shinGuard/%d" % kick, shin, kr],
					["foot/%d" % kick, foot, kr],
					["toe/%d" % kick, foot * _at(TOE_OFFSET.x, TOE_OFFSET.y, TOE_OFFSET.z), kr],
				])
			return {"parts": parts, "yaw": 0.5, "pitch": 0.1, "roll": 0.0}
		"kick":
			var shin := _limb(0, 0, 0, 0, -0.12)
			var ankle := _limb_end(shin, LIMB)
			var foot := _at(ankle.x, ankle.y, ankle.z)
			return {"parts": [
				["shin/%d" % _look(lo, "legs"), shin, int(lo.legs.rarity)],
				["shinGuard/%d" % look, shin, rarity],
				["foot/%d" % look, foot, rarity],
				["toe/%d" % look, foot * _at(TOE_OFFSET.x, TOE_OFFSET.y, TOE_OFFSET.z), rarity],
			], "yaw": 0.6, "pitch": 0.12, "roll": 0.0}
	return {"parts": [], "yaw": 0.0, "pitch": 0.0, "roll": 0.0}


## Build the shot's meshes, frame the lens round them and draw (partPreview.ts draw): the parts are
## placed on the CPU (natively, a whole array at a time), turned to their best side, centred.
func _draw(job: Array) -> void:
	var t0 := Time.get_ticks_usec()
	if _vp3 == null:
		_build()
	var item = job[1]
	var lo = job[4]
	var paint = job[3]
	# (opens the parts file: shot_for reads its table of core shifts)
	BotParts.has("neck")
	var shot := shot_for(item, int(job[2]), lo)
	# the turntable (three's rotation order 'YXZ': Ry * Rx * Rz)
	var turn := Basis(Vector3.UP, shot.yaw) * Basis(Vector3.RIGHT, shot.pitch) * Basis(Vector3.BACK, shot.roll)
	var om := ArrayMesh.new()
	var gm := ArrayMesh.new()
	var all := PackedVector3Array()
	for p in shot.parts:
		if not BotParts.has(p[0]):
			continue
		var part := BotParts.get_part(p[0])
		var xf: Transform3D = Transform3D(turn, Vector3.ZERO) * p[1]
		var nxf := Transform3D(xf.basis.inverse().transposed(), Vector3.ZERO)
		for opaque in [true, false]:
			var f: BotParts.Family = part.opaque if opaque else part.glow
			if f.index.is_empty():
				continue
			var pos: PackedVector3Array = xf * f.pos
			all.append_array(pos)
			var arrays := []
			arrays.resize(Mesh.ARRAY_MAX)
			arrays[Mesh.ARRAY_VERTEX] = pos
			arrays[Mesh.ARRAY_NORMAL] = nxf * f.nor if opaque else null
			arrays[Mesh.ARRAY_CUSTOM0] = f.tag
			arrays[Mesh.ARRAY_INDEX] = f.index
			var fl := Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT
			if not opaque:
				var r := PackedFloat32Array()
				r.resize(pos.size())
				r.fill(float(p[2]))
				arrays[Mesh.ARRAY_CUSTOM1] = r
				fl |= Mesh.ARRAY_CUSTOM_R_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT
			(om if opaque else gm).add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {}, fl)
	# the box round everything, worked out natively (a mesh's own bounds)
	var box := AABB()
	if not all.is_empty():
		var bm := ArrayMesh.new()
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = all
		bm.add_surface_from_arrays(Mesh.PRIMITIVE_POINTS, a)
		box = bm.get_aabb()
	var c := box.get_center()
	_holder.position = -c
	_opaque.mesh = om
	_glow.mesh = gm
	var sz := box.size
	var half := maxf(sz.x, sz.y) * 0.5 * 1.1
	var dist := half / tan(deg_to_rad(FOV * 0.5)) + sz.z * 0.5
	_cam.near = maxf(0.01, dist - sz.z * 2.0)
	_cam.far = dist + sz.z * 2.0
	_cam.position = Vector3(0, 0, dist)
	_paint(paint, _look(lo, "core") if str(item.slot) != "core" else int(item.look))
	_vp3.render_target_update_mode = SubViewport.UPDATE_ONCE
	_vp2.render_target_update_mode = SubViewport.UPDATE_ONCE
	_drawn = job
	last_us = Time.get_ticks_usec() - t0


## The plating and lights in `paint` (botModel.ts botSurfaces, botGlows).
func _paint(p, core_look: int) -> void:
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
		var col := BotModel.lin(e[0])
		surf.append(Vector4(col.r, col.g, col.b, e[1]))
		rough.append(e[2])
	_opaque_mat.set_shader_parameter("surf", surf)
	_opaque_mat.set_shader_parameter("rough", rough)
	var cols := PackedVector4Array()
	var a := BotModel.lin(p.accent) * 3.4
	var cc := BotModel.lin(BotParts.info.coreColors[core_look]) * 3.2
	cols.append(Vector4(a.r, a.g, a.b, 1))
	cols.append(Vector4(cc.r, cc.g, cc.b, 1))
	for r in TItems.RARITIES:
		var rc := BotModel.lin(r.glow) * 3.0
		cols.append(Vector4(rc.r, rc.g, rc.b, 1))
	_glow_mat.set_shader_parameter("cols", cols)


## The offscreen studio (partPreview.ts constructor): its own world, the lights, the lens, and
## the 2D pass that turns the picture into straight alpha at the card size.
func _build() -> void:
	_vp2 = SubViewport.new()
	_vp2.size = Vector2i(SIZE, SIZE)
	_vp2.disable_3d = true
	_vp2.transparent_bg = true
	_vp2.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_vp2)
	_vp3 = SubViewport.new()
	_vp3.size = Vector2i(PX, PX)
	_vp3.own_world_3d = true
	_vp3.transparent_bg = true
	_vp3.msaa_3d = Viewport.MSAA_4X
	_vp3.render_target_update_mode = SubViewport.UPDATE_DISABLED
	# (drawn inside the 2D pass's viewport, so it is drawn first in the same frame)
	_vp2.add_child(_vp3)
	var quad := ColorRect.new()
	quad.size = Vector2(SIZE, SIZE)
	var qm := ShaderMaterial.new()
	qm.shader = preload("res://render/thumbs/thumb_resolve.gdshader")
	qm.set_shader_parameter("src", _vp3.get_texture())
	# the Compatibility renderer leaves a 3D viewport's picture linear; the others encode it
	qm.set_shader_parameter("to_srgb", RenderingServer.get_current_rendering_method() == "gl_compatibility")
	quad.material = qm
	_vp2.add_child(quad)

	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	var sky := Sky.new()
	# the studio environment at 0.7 and the hemisphere light (the energy is in the sky)
	var sm := Garage.sky_material(HEMI, ENV)
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.0
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	# the stage's ACESFilmic at exposure 1.05 (fight.gd _build_world)
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	var we := WorldEnvironment.new()
	we.environment = env
	_vp3.add_child(we)
	for l in LIGHTS:
		var d := DirectionalLight3D.new()
		d.light_color = Color.hex((int(l[0]) << 8) | 0xff)
		# three's lights are in candela over pi (tests/bots_cal.gd)
		d.light_energy = float(l[1]) / PI
		_vp3.add_child(d)
		d.look_at_from_position(l[2], Vector3.ZERO, Vector3.UP if absf((l[2] as Vector3).normalized().y) < 0.99 else Vector3.BACK)
	_cam = Camera3D.new()
	_cam.fov = FOV
	_vp3.add_child(_cam)
	_cam.current = true
	_holder = Node3D.new()
	_vp3.add_child(_holder)
	_opaque_mat = ShaderMaterial.new()
	_opaque_mat.shader = preload("res://render/thumbs/thumb_opaque.gdshader")
	_glow_mat = ShaderMaterial.new()
	_glow_mat.shader = preload("res://render/thumbs/thumb_glow.gdshader")
	_opaque = MeshInstance3D.new()
	_opaque.material_override = _opaque_mat
	_opaque.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_glow = MeshInstance3D.new()
	_glow.material_override = _glow_mat
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_holder.add_child(_opaque)
	_holder.add_child(_glow)


static func _vec(c: Color) -> Vector3:
	return Vector3(c.r, c.g, c.b)
