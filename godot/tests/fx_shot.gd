## The hit effects at a scripted moment, for side-by-side checks against the web game
## (tools/bake/web/fx_ref.ts runs the same script): a heavy blow landing, a torn-off part in
## flight, a wrecked hinge venting and a wound bleeding, stepped `frames` frames at 60 fps.
##   BB_NOBOTS=1 BB_NOHUD=1 BB_NOSPARKS=1 BB_NOSKY=1 BB_CAM="0,1.6,4.6;0,0.9,0" \
##     tools/shots/shot.sh res://tests/fx_shot.gd <frames> <out.png>
extends SceneTree

var _fight
var _frames := 6
var _out := "user://fx.png"
var _n := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_frames = int(args[0])
	if args.size() > 1:
		_out = args[1]
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_n += 1
	if _n == 3:
		_run()
	if _n == 8:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false


func _run() -> void:
	var fx: Fx = Fx.new()
	var debris := FxDebris.new()
	var steam := FxSteam.new()
	var oil := FxOil.new()
	for n in [fx, debris, steam, oil]:
		_fight.add_child(n)
	var cam: Camera3D = _fight.cam
	var dt := 1.0 / 60.0
	var p := Vector3(0.15, 1.25, 0)
	var dir := Vector3(1, 0.1, 0.25).normalized()
	var hinge_a := Vector3(-0.9, 1.05, 0.2)
	var hinge_b := Vector3(-0.9, 1.45, 0.2)
	var wound := Vector3(-0.55, 1.15, 0.45)
	var trail := fx.make_trail(0xff7a2a, 0.13)
	for f in _frames:
		fx.begin_frame()
		if f == 0:
			fx.impact(p, dir, 0.9, 0xffb347)
			fx.flash(p, 0xffd28a, 1.4, 0.2)
			fx.burst(p, 0x2ad8ff, 44, 5)
			fx.smoke(p, 6, 1)
			fx.bits.spawn(p, dir, 24, 0x3366cc, 1)
			fx.arc(Vector3(0.6, 1.0, 0.1), 0.8)
			if not OS.get_environment("FX_SKIP").contains("splash"):
				oil.splash(p, dir, 1.0)
			if not OS.get_environment("FX_SKIP").contains("dust"):
				fx.dust(Vector3(0.9, 0.05, -0.4), 40, 1.5)
			var box := MeshInstance3D.new()
			var bm := BoxMesh.new()
			bm.size = Vector3(0.12, 0.32, 0.12)
			box.mesh = bm
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color.hex(0x556070ff)
			mat.metallic = 0.6
			mat.roughness = 0.4
			box.material_override = mat
			box.position = Vector3(0.3, 1.3, 0.1)
			if not OS.get_environment("FX_SKIP").contains("debris"):
				debris.spawn(box, dir, 90, true, 1)
		var a := f / 60.0 * 9.0
		if f < 14:
			trail.push(Vector3(-0.2 + cos(a) * 0.5, 1.5 + sin(a) * 0.3, 0.6))
		fx.flame(Vector3(-0.3, 0.4, 0.5), Vector3(0, -0.4, -1).normalized(), 1.2)
		steam.vent(0, hinge_a, hinge_b, 0.0, 0.08, Vector3(0, 0, 1), Vector3.ZERO, 0.9, 1.0, dt)
		oil.leak(0, wound, Vector3(0, 0, 1), 1.0, dt)
		debris.update(dt, fx, [])
		oil.update(dt, [])
		steam.update(dt)
		fx.update(dt, cam)
	var live := 0
	for i in oil._falling.count:
		var b := oil._falling.buf
		if b[i * 12 + 1] <= oil.clock and oil.clock < b[i * 12 + 1] + b[i * 12 + 5]:
			live += 1
	print("drops falling ", live, " hanging ", oil._hanging.size(), " pools ", oil._p_used)
