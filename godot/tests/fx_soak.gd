## Runs fights fast-forwarded (extra sim steps each frame) so they reach the wrecked end, with
## every effect live: parts torn off, oil, steam, debris. Reports the effects' GDScript cost per
## frame (FightFx.prof_us) and how much was going on.
##   godot --headless --path godot -s res://tests/fx_soak.gd -- [seconds] [extra steps per frame]
extends SceneTree

var _fight
var _secs := 60.0
var _extra := 12
var _t := 0.0
var _n := 0
var _sum := 0.0
var _worst := 0
var _fights := 0
var _detach := 0
var _all := PackedInt32Array()


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_secs = float(args[0])
	if args.size() > 1:
		_extra = int(args[1])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m == null or _fight.effects == null:
		return false
	var fx: FightFx = _fight.effects
	if _t > 1.0:
		_n += 1
		_sum += fx.prof_us
		_worst = maxi(_worst, fx.prof_us)
		_all.append(fx.prof_us)
		if fx.prof_us > 2000:
			print("slow frame ", fx.prof_us, " split ", fx.prof_split)
	# fast-forward: the queued events are handled by the fight's next frame like any others
	_fight._sync()
	if _fight.m.phase != "end":
		for k in _extra:
			if _fight.m.phase == "end":
				break
			_fight.m.step(1.0 / 120.0)
	for e in _fight._events:
		if e[0] == "detach":
			_detach += 1
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 2.0:
		print("fight %d over (%s): bits %d, debris %d, detaches so far %d" % [_fights, _fight.m.result, fx.fx.bits._live.size(), fx.debris.count(), _detach])
		_fights += 1
		_fight.new_fight()
	if _t > _secs:
		_all.sort()
		var big := 0
		for u in _all:
			if u > 2000:
				big += 1
		print("p50 %.3f p99 %.3f p999 %.3f ms; frames over 2 ms: %d" % [_all[_all.size() / 2] / 1000.0, _all[int(_all.size() * 0.99)] / 1000.0, _all[int(_all.size() * 0.999)] / 1000.0, big])
		print("fx soak: %d frames, effects mean %.3f ms, worst %.3f ms, %d fights" % [_n, _sum / maxf(1, _n) / 1000.0, _worst / 1000.0, _fights])
		return true
	return false
