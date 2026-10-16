## Headless cost of the hit effects in a heavy exchange: both robots wrecked (every part venting,
## bleeding, sparking), a blow landing every few frames with a tear-off now and then, bits and
## debris flying, oil underfoot. Prints the GDScript ms per frame the effects take.
##   godot --headless --path godot -s res://tests/fx_bench.gd -- [frames]
extends SceneTree

var fx: Fx
var debris: FxDebris
var steam: FxSteam
var oil: FxOil
var _frames := 600
var _n := 0
var _t := 0.0
var _worst := 0.0
var _root: Node3D


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_frames = int(args[0])
	_root = Node3D.new()
	get_root().add_child.call_deferred(_root)
	fx = Fx.new()
	debris = FxDebris.new()
	steam = FxSteam.new()
	oil = FxOil.new()
	for n in [fx, debris, steam, oil]:
		_root.add_child(n)
	for i in 8:
		fx.make_trail(0xff7a2a, 0.13)


func _process(_dt: float) -> bool:
	var dt := 1.0 / 60.0
	_n += 1
	var t0 := Time.get_ticks_usec()
	_frame(dt)
	var us := float(Time.get_ticks_usec() - t0)
	if _n > 30:
		_t += us
		_worst = maxf(_worst, us)
	if _n >= _frames:
		print("fx bench: %d frames, mean %.3f ms, worst %.3f ms; live bits %d, debris %d" % [_frames - 30, _t / (_frames - 30) / 1000.0, _worst / 1000.0, fx.bits._live.size(), debris.count()])
		return true
	return false


func _frame(dt: float) -> void:
	fx.begin_frame()
	var time := _n * dt
	var a := Vector3(-0.5 + sin(time) * 0.3, 1.2, 0.0)
	var b := Vector3(0.5, 1.2, cos(time) * 0.3)
	# a blow every 12 frames, a heavy one every 48, a tear-off every 240
	if _n % 12 == 0:
		var heavy := _n % 48 == 0
		var dir := (b - a).normalized()
		fx.impact(b, dir, 0.9 if heavy else 0.4, 0xffb347)
		fx.flash(b, 0xffd28a, 1.4 if heavy else 0.8, 0.14)
		fx.bits.spawn(b, dir, 12 if heavy else 5, 0x3366cc, 0.8)
		fx.smoke(b, 3, 0.8)
		oil.splash(b, dir, 0.8)
		if heavy:
			fx.burst(b, 0xff7a2a, 44, 5)
			fx.arc(b, 0.8)
	if _n % 240 == 0:
		var box := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.12, 0.3, 0.12)
		box.mesh = bm
		box.position = b
		debris.spawn(box, Vector3(1, 0, 0.3), 90.0, true, 1)
		fx.sparks(b, Vector3.UP, 60, 0xffc070, 9, 1.4)
		fx.bits.spawn(b, Vector3(1, 0, 0), 30, 0x3366cc, 1.0)
		oil.splash(b, Vector3(1, 0, 0), 1.4, 70, 1.3)
	# both robots wrecked: 2 x 12 parts sparking/smoking, 2 x 10 hinges venting, 4 wounds bleeding
	for i in 2:
		var c := a if i == 0 else b
		for p in 12:
			var at := c + Vector3(0, p * 0.05 - 0.3, 0)
			if randf() < dt * 6.4:
				fx.sparks(at, Vector3.UP, 10, 0xffb050, 3.5, 1.3)
			if randf() < dt * 10.6:
				fx.smoke(at, 2, 1.0)
			if randf() < dt * 1.8:
				fx.arc(at, 0.16)
		for p in 10:
			steam.vent(i * 16 + p, c, c + Vector3(0, 0.3, 0), 0.2, 0.08, Vector3(0, 0, 1), Vector3.ZERO, 0.9, 1.0, dt)
		for w in 2:
			oil.leak(i * 2 + w, c + Vector3(0.2, 0, 0), Vector3(1, 0, 0), 1.0, dt)
	for t in fx._trails:
		t.push(a + Vector3(randf(), randf(), randf()) * 0.1)
	fx.flame(a, Vector3(0, 0, 1), 1.0)
	var feet: Array = [Vector3(a.x, 0.05, 0.2), Vector3(a.x, 0.05, -0.2), Vector3(b.x, 0.05, 0.2), Vector3(b.x, 0.05, -0.2)]
	debris.update(dt, fx, feet)
	oil.update(dt, feet)
	steam.update(dt)
	fx.update(dt)
