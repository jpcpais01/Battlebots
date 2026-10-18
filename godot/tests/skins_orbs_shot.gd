## Every skin's vault swatch in a grid, for looking them over (2D, already sRGB).
##   godot/tools/shots/shot.sh res://tests/skins_orbs_shot.gd <out.png> [seconds]
extends SceneTree


func _init() -> void:
	_run.call_deferred(OS.get_cmdline_user_args())


func _run(args: Array) -> void:
	var out: String = args[0] if args.size() > 0 else "/tmp/orbs.png"
	var bg := ColorRect.new()
	bg.color = Color(0.03, 0.035, 0.05)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	get_root().add_child(bg)
	var grid := GridContainer.new()
	grid.columns = 7
	grid.position = Vector2(20, 20)
	get_root().add_child(grid)
	for s in Skins.LIST:
		var v := VBoxContainer.new()
		v.add_child(SkinOrb.new(s, 150.0))
		var l := Label.new()
		l.text = s.name
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.add_theme_font_size_override(&"font_size", 12)
		v.add_child(l)
		grid.add_child(v)
	var secs := float(args[1]) if args.size() > 1 else 1.0
	await create_timer(secs).timeout
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(out)
	print("orbs: ", out)
	quit()
