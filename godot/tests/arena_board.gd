## Saves what the scoreboard draws (its SubViewport), for checking against the web canvas.
##   shot.sh res://tests/arena_board.gd out.png [score|logo|present]
extends SceneTree

var _b: Scoreboard
var _f := 0
var _out := ""


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0]
	_b = Scoreboard.new()
	get_root().add_child.call_deferred(_b)
	var mode := args[1] if args.size() > 1 else "score"
	if mode == "score":
		_b.update(1.0, {"names": ["Rapid Ranger", "Diesel Knox"], "hp": [0.62, 0.2], "clock": 69.0, "phase": "fight", "presenting": -1})
	elif mode == "present":
		_b.update(1.0, {"names": ["Rapid Ranger", "Diesel Knox"], "hp": [1.0, 1.0], "clock": 90.0, "phase": "intro", "presenting": 1})


func _process(_dt: float) -> bool:
	_f += 1
	if _f == 5:
		_b.get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
