## The referee drone through a fight (render/referee/referee.gd): the fight scene plays a real
## fight from a seed (hud_shots.gd's bots and match), and at each of the referee's moments saves
## the broadcast frame and a close-up from a lens of our own in front of it
## (<out>/<moment>.png, <out>/<moment>_close.png). Run with a fixed frame rate:
##   BB_NOSKY=1 xvfb-run -a -s "-screen 0 1280x720x24" godot --path godot --rendering-driver opengl3 \
##     --resolution 1280x720 --fixed-fps 20 -s res://tests/referee_shots.gd -- <out dir> [seed] [intro|fight]
## then godot/tools/shots/srgb.py on each picture.
## ("intro" stops after FIGHT!, "fight" skips the walk-outs.) Ends with "referee shots: N".
extends SceneTree

var _out := "/tmp/referee"
var _seed := 22
var _part := ""
var _fight: Game
var _close: Camera3D
var _n := 0
var _shots := 0
var _done := {}
var _pending := []
var _time := 0.0
var _ko_at := -1.0
var _up_at := -1.0
var _start_at := -1.0
var _busy := false


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_seed = int(args[1])
	if args.size() > 2:
		_part = args[2]
	DirAccess.make_dir_recursive_absolute(_out)
	_fight = load("res://game/fight.tscn").instantiate()
	_fight.auto = false
	get_root().add_child.call_deferred(_fight)
	_close = Camera3D.new()
	_close.fov = 40.0
	get_root().add_child.call_deferred(_close)


func _begin() -> void:
	var rng = TMath.Rng.new(float(_seed))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	_fight.start_match(a, b, rng.int_(0.0, 1e9))
	if _part == "fight":
		_fight.m.skipIntro()
	_fight.match_event.connect(_on_event)


func _on_event(type: String, _data) -> void:
	match type:
		"fightStart":
			_start_at = _time
		"ko", "decision":
			_ko_at = _time


func _want(name_: String, ok: bool) -> void:
	if ok and not _done.has(name_):
		_done[name_] = true
		_pending.append(name_)


func _process(dt: float) -> bool:
	_n += 1
	_time += dt
	if _n == 3:
		# between fights: idling over the ring
		_pending.append("idle")
	if _n == 40:
		_begin()
	if _n == 4:
		_fight.settings.set_perf_stats(false)
	var m = _fight.m
	if m != null:
		var ph: String = m.phase
		var pt: float = m.phaseTime
		_want("descend", ph == "intro" and pt > 0.8)
		_want("present0", ph == "intro" and pt > 3.2)
		_want("present1", ph == "intro" and pt > 7.6)
		_want("count2", ph == "countdown" and pt > 1.4)
		_want("chop", _start_at >= 0.0 and _time - _start_at > 0.4)
		if _part == "intro" and _done.has("chop") and _pending.is_empty() and not _busy:
			print("referee shots: ", _shots)
			return true
		_want("watch", ph == "fight" and pt > 7.0)
		var calls: HudCalls = _fight.hud.calls
		_want("count", calls.ref_state == "down" and calls.ref_n >= 4)
		if calls.ref_state == "up" and _up_at < 0.0:
			_up_at = _time
		_want("up", _up_at >= 0.0 and _time - _up_at > 0.3)
		_want("waveoff", _ko_at >= 0.0 and _time - _ko_at > 1.0)
		_want("winner", ph == "end" and pt > 2.0)
		if _done.has("winner") and _pending.is_empty() and not _busy:
			print("referee shots: ", _shots)
			return true
	if not _pending.is_empty() and not _busy:
		_busy = true
		_shoot.call_deferred(_pending.pop_front())
	return false


func _shoot(name_: String) -> void:
	var ref: Referee = _fight.referee
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png("%s/%s.png" % [_out, name_])
	# the close-up: in front of its face, a little to one side and below
	var fwd := ref.transform.basis.z.normalized()
	var side := ref.transform.basis.x.normalized()
	var at := ref.global_position
	_close.look_at_from_position(at + fwd * 1.5 + side * 0.45 - Vector3(0, 0.25, 0), at + Vector3(0, -0.05, 0))
	_close.current = true
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png("%s/%s_close.png" % [_out, name_])
	_fight.cam.current = true
	_shots += 1
	_busy = false
	var heads := ""
	if _fight.models.size() == 2:
		heads = " heads %.2f %.2f" % [_fight.models[0].joints[3].y, _fight.models[1].joints[3].y]
	print("shot %s t=%.2f phase=%s ref %s cam %s%s" % [name_, _time, _fight.m.phase if _fight.m != null else "-", ref.pos, _fight.cam.global_position, heads])
