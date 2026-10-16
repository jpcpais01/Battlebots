## Builds each mesh of a venue's bake one by one, printing its node first, so the engine's errors
## about a bad surface show which node they belong to.
##   godot --headless --path godot -s res://tests/venues_meshcheck.gd -- <id>
extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var id: String = args[0] if args.size() > 0 else "rooftop"
	var mats := VenueGlslMaterials.new()
	var scene := BakedScene.open("res://assets/venues/" + id)
	scene.factory = mats.make
	for n in scene.json.nodes:
		if n.has("geometry"):
			print("NODE ", n.get("name", ""), " geo ", n.geometry, " ", scene.json.geometries[int(n.geometry)].attributes.keys(), " prim ", n.get("primitive", ""))
			scene._mesh(n)
	quit()
