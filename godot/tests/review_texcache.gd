## BakedScene's shared textures: the same picture in two bakes is one texture (one object, one
## RID), different pictures stay apart, and a texture goes once no scene holds it. Also checks
## release() keeps what the scenes' owners read afterwards.
##   godot --headless --path . -s res://tests/review_texcache.gd
extends SceneTree

const BAKES := ["res://assets/venue/arena", "res://assets/venues/island", "res://assets/venues/rooftop", "res://assets/map/world", "res://assets/home/beach", "res://assets/home/gym", "res://assets/home/lounge"]

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


## What makes a texture the same, worked out here independently of BakedScene: the PNG's bytes
## (or the raw buffer's), flipped or not, mipmapped or not.
static func _ident(s: BakedScene, id: int) -> String:
	var t: Dictionary = s.json.textures[id]
	var mips: bool = t.get("mipmaps", true) and t.get("minFilter", 1008) >= 1004
	var b: PackedByteArray
	var how: String
	if t.has("png"):
		b = s._bin.slice(int(t.png.offset), int(t.png.offset) + int(t.png.bytes))
		how = "png %s" % t.flipY
	elif t.has("raw") and int(t.raw.type) != 1016:
		# (half floats: BakedScene doesn't read them, MapMaterials does)
		b = s.buffer(int(t.raw.buffer))
		how = "raw %s %s %s %s" % [t.raw.width, t.raw.height, t.raw.format, t.raw.type]
	else:
		return ""
	return "%d %d %s %s" % [b.size(), hash(b), how, mips]


func _init() -> void:
	var scenes: Array[BakedScene] = []
	# ident -> [texture, where]
	var seen := {}
	var shared := 0
	var wrong := 0
	var apart := 0
	for path in BAKES:
		var s := BakedScene.open(path)
		scenes.append(s)
		for id in s.json.textures.size():
			var ident := _ident(s, id)
			if ident == "":
				continue
			var tex := s.texture(id)
			if tex == null:
				continue
			if seen.has(ident):
				var was: Texture2D = seen[ident][0]
				if is_same(was, tex) and was.get_rid() == tex.get_rid():
					shared += 1
				else:
					wrong += 1
					print("  not shared: ", path, " #", id, " and ", seen[ident][1])
			else:
				for k in seen:
					if is_same(seen[k][0], tex):
						apart += 1
						print("  wrongly shared: ", path, " #", id, " with ", seen[k][1])
				seen[ident] = [tex, "%s #%d" % [path, id]]
	print("%d distinct textures, %d reuses" % [seen.size(), shared])
	_check(shared > 0, "the same picture in two bakes is one texture (%d times)" % shared)
	_check(wrong == 0, "every repeat is shared (%d not)" % wrong)
	_check(apart == 0, "different pictures stay different textures")
	# the arena's and a venue's crowd sheets, the case the review found
	var a := scenes[0]
	var v := scenes[1]
	var common := 0
	for i in a.json.textures.size():
		for j in v.json.textures.size():
			if _ident(a, i) != "" and _ident(a, i) == _ident(v, j) and is_same(a.texture(i), v.texture(j)):
				common += 1
	_check(common > 0, "the arena and island share %d texture(s)" % common)

	# release(): the bin goes, what owners read later stays
	var w := scenes[1]
	var named_before := w.named.size()
	var look = w.json.get("look")
	var nodes_n: int = w.json.nodes.size()
	var t0 := w.texture(0)
	w.release()
	_check(w._bin.is_empty() and not w.json.has("buffers") and not w.json.has("geometries"), "release() drops the bin and the buffer/geometry tables")
	_check(w.json.get("look") == look and w.json.nodes.size() == nodes_n and w.json.has("materials") and w.json.has("textures"), "...and keeps look, nodes, materials, textures")
	_check(w.named.size() == named_before and is_same(w.texture(0), t0), "...and named and the textures already made")

	# the cache lets go once nobody holds a texture
	var keys: Array = BakedScene._shared.keys()
	_check(not keys.is_empty(), "the cache has entries (%d)" % keys.size())
	scenes.clear()
	seen.clear()
	a = null
	v = null
	w = null
	t0 = null
	var alive := 0
	for k in keys:
		if BakedScene._shared_get(k) != null:
			alive += 1
	_check(alive == 0, "every texture freed once no scene holds it (%d alive)" % alive)
	print("review_texcache: ", _fails, " failed")
	quit(1 if _fails else 0)
