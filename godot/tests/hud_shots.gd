## The fight HUD's moments, for matching against the web game's (tools/bake/web/hud_ref.ts makes
## the web's): the same bots and fight from the same seed, the corner's Go in! call at the same
## step, the HUD driven at a steady 60 fps over a plain backdrop, and a picture at each moment
## (<out>/<moment>.png, the same names as the web's).
##   godot/tools/shots/shot.sh res://tests/hud_shots.gd <out dir> [seed] [only,moments]
## Prints each moment as it's taken; ends with "hud shots: N moments".
extends SceneTree

const DT := 1.0 / 60.0

class StubDirector:
	extends RefCounted
	var pov := -1
	var zoom := "normal"

## What the HUD reads of the Game.
class StubGame:
	extends Node
	var director := StubDirector.new()
	var sfx = null
	var speed := 1.0
	var cam: Camera3D

var _out := "/tmp/hud"
var _seed := 9
var _only: PackedStringArray = []
var hud: FightHud
var m
var _events := []
var _pending := []
var _firsts := {}
var _time := 0.0
var _shots := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_seed = int(args[1])
	if args.size() > 2:
		_only = args[2].split(",")
	DirAccess.make_dir_recursive_absolute(_out)
	load("res://gen/init.gd").run()
	_run.call_deferred()


func _backdrop() -> Control:
	var r := ColorRect.new()
	r.set_anchors_preset(Control.PRESET_FULL_RECT)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sh := Shader.new()
	# (hud_ref.ts: radial-gradient(ellipse at 50% 60%, #5a6070, #20242c 70%))
	sh.code = """shader_type canvas_item;
void fragment() {
	vec2 p = (UV - vec2(0.5, 0.6)) / vec2(0.5, 0.6);
	float d = clamp(length(p) / 0.7, 0.0, 1.0);
	COLOR = vec4(mix(vec3(90.0, 96.0, 112.0), vec3(32.0, 36.0, 44.0), d) / 255.0, 1.0);
}"""
	var mat := ShaderMaterial.new()
	mat.shader = sh
	r.material = mat
	return r


func _mark(name: String, ms: float) -> void:
	if _firsts.has(name):
		return
	_firsts[name] = true
	_pending.append([name, _time + ms / 1000.0])


func _on_event(type: String, data) -> void:
	_events.append([type, data])
	match type:
		"hit":
			if not data.blocked and float(data.damage) >= 8.0:
				_mark("hit", 260)
			if data.crit:
				_mark("crit", 300)
		"stagger":
			_mark("stagger", 350)
		"knockdown":
			_mark("knockdown", 500)
			_mark("count", 2600)
		"coach":
			_mark("coach", 450)
		"fightStart":
			_mark("fight", 300)
		"strikeStart":
			if data.s.move.get("ability") != null and not data.s.feint:
				_mark("ability", 350)
		"finisher":
			_mark("finisher", 600)
		"ko":
			_mark("finish", 1350)
			_mark("finish_dock", 3500)
		"decision":
			_mark("time", 600)


func _run() -> void:
	var root := get_root()
	var layer := CanvasLayer.new()
	layer.layer = -1
	layer.add_child(_backdrop())
	root.add_child(layer)
	var cam := Camera3D.new()
	cam.fov = 38.0
	cam.position = Vector3(0, 1.9, 7.2)
	root.add_child(cam)
	cam.look_at(Vector3(0, 1.0, 0))
	cam.current = true
	var game := StubGame.new()
	game.cam = cam
	root.add_child(game)
	hud = FightHud.new()
	hud.game = game
	hud.cam = cam
	game.add_child(hud)
	await process_frame
	var rng = TMath.Rng.new(float(_seed))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	m.skipIntro()
	m.on(_on_event)
	hud.start(m)
	var acc := 0.0
	var coached := false
	while true:
		_time += DT
		acc += DT
		while acc >= TMatch.SIM_DT:
			# the corner calls Go in! five seconds in, at the same step as the web's shots
			if m.phase == "fight" and m.phaseTime >= 5.0 and not coached:
				coached = true
				m.queueCoach(0.0, "go")
			m.step(TMatch.SIM_DT)
			acc -= TMatch.SIM_DT
		# a coach button tapped in the shots (none, but the path runs)
		var call := hud.take_coach()
		if call != "":
			m.queueCoach(0.0, call)
		var evs := _events
		_events = []
		for e in evs:
			hud.on_event(e[0], e[1])
		var view := hud.capture(m)
		hud.update_hud(view, false, DT)
		if m.phase == "countdown" and m.phaseTime > 0.3:
			_mark("count3", 0)
		if m.phase == "countdown" and m.phaseTime > 2.45:
			_mark("count1", 0)
		if m.phase == "fight" and m.phaseTime > 3.0:
			_mark("ready", 0)
		var rs = hud.calls.get("ref_state")
		if rs == "down":
			_mark("refcount", 2300)
		elif rs == "up":
			_mark("refup", 250)
		var ro = hud.bars.get("ready_on")
		if ro != null and (ro[0] or ro[1]):
			_mark("finready", 300)
		if hud.calls.get("callout_on") == true:
			_mark("callout", 250)
		if m.phase == "end" and m.phaseTime > 4.0:
			break
		await process_frame
		var due := -1
		for k in _pending.size():
			if _time >= _pending[k][1]:
				due = k
				break
		if due >= 0:
			var p: Array = _pending.pop_at(due)
			if _only.is_empty() or _only.has(p[0]):
				await RenderingServer.frame_post_draw
				root.get_texture().get_image().save_png("%s/%s.png" % [_out, p[0]])
				_shots += 1
				print("shot %s t=%.2f phase=%s" % [p[0], m.time, m.phase])
	print("hud shots: %d moments" % _shots)
	quit()
