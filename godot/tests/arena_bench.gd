## Per-frame cost of the arena's CPU side (rope physics, crowd, floor, board, globals), headless:
##   godot --headless --path godot -s res://tests/arena_bench.gd
extends SceneTree


func _init() -> void:
	var arena := Arena.new()
	get_root().add_child.call_deferred(arena)
	var mood := CrowdMood.new()
	var joints: Array[Vector3] = []
	for j in 16:
		joints.append(Vector3(4.4, 0.2 + j * 0.1, 0.3))
	var other: Array[Vector3] = []
	for j in 16:
		other.append(Vector3(-1.0, 0.2 + j * 0.1, 0.0))
	var hit := {"shielded": false, "blocked": false, "guardBreak": false, "damage": 60.0, "crit": false, "counter": false, "knockdown": false, "attacker": {"index": 0}}
	var n := 2000
	var t0 := Time.get_ticks_usec()
	for i in n:
		var dt := 1.0 / 60.0
		if i % 90 == 0:
			mood.event("hit", hit)
			arena.event("hit", hit)
			arena.excite(0.5)
			arena.rope_hit(4.4, 0.3, 2.0)
			arena.flash_ropes(0.8)
		if i % 40 == 0:
			arena.stir(Vector3(15, 4, 3), 1.0)
		arena.press_ropes([joints, other], [1.0, 1.1])
		mood.tick(dt, "fight", 60.0, 0.5, 0.8)
		arena.crowd.update(dt, mood.excite, true)
		arena.score(dt, {"names": ["A", "B"], "hp": [0.5, 0.8], "clock": 60.0 - i * dt, "phase": "fight", "presenting": -1})
		arena.update(dt, i * dt)
		arena.expose(dt, 6.0)
	var us := float(Time.get_ticks_usec() - t0) / n
	print("arena per frame: %.3f ms (hype %.2f, rope bow %.3f)" % [us / 1000.0, arena.hype, arena._rope_u[1]])
	quit()
