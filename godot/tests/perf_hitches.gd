## Plays real-time fights headless with the profiler on and prints every frame that took far
## longer than usual, with what each part of the frame cost in it (game/perf.gd sections).
##   godot --headless --path godot -s res://tests/perf_hitches.gd -- <seconds> [threshold ms]
## BB_VSYNC=<hz> holds every frame to that screen's refreshes, as a phone's vsync does (headless
## has none): a frame that misses one waits for the next. It also counts missed refreshes and the
## longest run of frames in a row that missed one (the "lag for a few seconds" a phone shows).
extends SceneTree


## Last in every frame: wait for the next refresh.
class Vsync extends Node:
	var period := 0
	var t0 := 0
	var missed := 0
	var run := 0
	var longest := 0
	var _next := 0

	func _ready() -> void:
		process_priority = 100000
		t0 = Time.get_ticks_usec()
		_next = t0 + period

	func _process(_dt: float) -> void:
		var now := Time.get_ticks_usec()
		if now > _next:
			# missed it: the frame shows a refresh late (or more)
			var late := (now - _next) / period + 1
			missed += late
			_next += late * period
			run += 1
			longest = maxi(longest, run)
		else:
			run = 0
		OS.delay_usec(maxi(0, _next - Time.get_ticks_usec()))
		_next += period


const NAMES := ["sim", "wait", "worker", "ai", "bots", "fx", "arena", "camera", "audio", "hud", "other", "render", "panel", "gpu"]
var _fight
var _secs := 60.0
var _limit := 12.0
var _t := 0.0
var _prev := PackedInt64Array()
var _last := 0
var _frames := 0
var _slow := 0
var _worst := 0.0
var _sum := PackedFloat64Array()
## Sim time played, over every fight.
var _sim_t := 0.0
var _frame0 := 0.0
var _vsync: Vsync


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_secs = float(args[0])
	if args.size() > 1:
		_limit = float(args[1])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)
	if OS.get_environment("BB_VSYNC") != "":
		_vsync = Vsync.new()
		_vsync.period = int(1e6 / float(OS.get_environment("BB_VSYNC")))
		get_root().add_child.call_deferred(_vsync)
	_sum.resize(Perf.COUNT)


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m == null:
		return false
	if not Perf.on:
		Perf.set_on(true)
	var now := Time.get_ticks_usec()
	var cur: PackedInt64Array = Perf._sum.duplicate()
	if _last != 0 and _prev.size() == cur.size() and _t > 3.0:
		var gap := (now - _last) / 1000.0
		var parts := ""
		var any := false
		for s in cur.size():
			var d := (cur[s] - _prev[s]) / 1000.0
			if d < 0.0:
				any = true
				continue
			_sum[s] += d
			if d >= 1.0:
				parts += " %s %.1f" % [NAMES[s], d]
		if not any:
			_frames += 1
			_worst = maxf(_worst, gap)
			if gap > _limit:
				_slow += 1
				print("%.2fs frame %.1f ms (%s %s/%s):%s" % [_t, gap, _fight.m.phase, _fight.m.fighters[0].state, _fight.m.fighters[1].state, parts])
	_prev = cur
	_last = now
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 1.6:
		_sim_t += (_fight.m.frame - _frame0) / 120.0
		_frame0 = 0.0
		_fight.new_fight()
	if _t > _secs:
		var line := ""
		for s in _sum.size():
			if _sum[s] > 0.0:
				line += " %s %.2f" % [NAMES[s], _sum[s] / maxi(1, _frames)]
		print("%d frames, %d over %.0f ms, worst %.1f ms; mean ms/frame:%s" % [_frames, _slow, _limit, _worst, line])
		_sim_t += (_fight.m.frame - _frame0) / 120.0
		print("sim time %.1f s in %.1f s; sim step estimate %.0f us" % [_sim_t, _t, _fight._step_cost])
		if _vsync != null:
			print("vsync: %d refreshes missed, longest run of late frames %d" % [_vsync.missed, _vsync.longest])
		return true
	return false
