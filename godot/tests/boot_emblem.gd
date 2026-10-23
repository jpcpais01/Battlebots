## Pictures of the loading screen's big animated app icon (app/boot/boot_emblem.gd) through its
## moves: coming up, the eyes powering on, a jab landing, the finale, and a failed start; landscape
## on the window and portrait in a tall viewport.
##   godot/tools/shots/shot.sh res://tests/boot_emblem.gd out_dir
extends SceneTree

const SCREEN := preload("res://app/boot/boot_screen.gd")

var _out := ""


func _shot(vp: Viewport, name: String) -> void:
	await RenderingServer.frame_post_draw
	vp.get_texture().get_image().save_png(_out.path_join(name + ".png"))
	print("shot " + name)


func _wait(s: float) -> void:
	await create_timer(maxf(s, 0.01)).timeout


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else "/tmp"
	DirAccess.make_dir_recursive_absolute(_out)
	var layer := CanvasLayer.new()
	get_root().add_child(layer)
	var screen = SCREEN.new()
	layer.add_child(screen)
	screen.job("load", "Loading the game", 1.0)
	# portrait, in a phone-shaped viewport of its own
	var svc := SubViewportContainer.new()
	var sv := SubViewport.new()
	sv.size = Vector2i(540, 1170)
	sv.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	svc.add_child(sv)
	svc.position = Vector2(4000, 0)
	get_root().add_child(svc)
	var tall = SCREEN.new()
	sv.add_child(tall)
	tall.job("load", "Loading the game", 1.0)
	var emblem = screen._emblem
	emblem._next_jab = 1.9
	emblem._side = 0
	for t in [0.18, 0.4, 0.7, 1.15]:
		await _wait(t - emblem._t)
		await _shot(get_root(), "up_%03d" % int(t * 100))
	screen.set_job("load", 0.4, 0.6, "Building the arena")
	await _wait(1.6 - emblem._t)
	await _shot(get_root(), "idle")
	await _shot(sv, "portrait")
	# the jab (no one-two: just the one hand, then the other)
	for t in [1.9 + 0.08, 1.9 + 0.18, 1.9 + 0.23, 1.9 + 0.3, 1.9 + 0.45]:
		await _wait(t - emblem._t)
		await _shot(get_root(), "jab_%03d" % int((t - 1.9) * 100))
	await _wait(3.4 - emblem._t)
	screen.finish()
	for i in 8:
		await _wait(0.25 if i < 4 else 0.08)
		await _shot(get_root(), "finale_%d" % i)
	tall.fail("test")
	await _wait(1.0)
	await _shot(sv, "portrait_fail")
	quit(0)
