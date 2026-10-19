## Triangles the world map draws (meshes and MultiMeshes, counted from the data), split by node
## name, with what the city's street life adds at close zoom:
##   godot --headless --path godot -s res://tests/worldmap_tris.gd
extends SceneTree

var _game: Game
var _frames := 0


func _init() -> void:
	OS.set_environment("BB_SKIPINTRO", "1")
	_game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	_game.auto = false
	get_root().add_child.call_deferred(_game)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		var w: WorldMap = _game.get_place("map")
		var t0 := Time.get_ticks_usec()
		w.build_now()
		print("built in %d ms" % ((Time.get_ticks_usec() - t0) / 1000))
		var tally := {}
		var total := _count(w, tally)
		var names := tally.keys()
		names.sort_custom(func(a, b): return tally[a] > tally[b])
		for n in names.slice(0, 25):
			print("%-28s %8d" % [n, tally[n]])
		print("world map total %d triangles" % total)
		print("street life ", w.life.counts)
		return true
	return false


func _count(n: Node, tally: Dictionary) -> int:
	var t := 0
	if n is GeometryInstance3D:
		var k = load("res://tests/tri_budget.gd").node_tris(n)
		var key := str(n.name).rstrip("0123456789").rstrip("_")
		tally[key] = tally.get(key, 0) + k
		t += k
	for c in n.get_children():
		t += _count(c, tally)
	return t
