## The six part pictures of a bot side by side on grey, for comparing with the web's
## (godot/tools/bake/web/garage3d_thumbs.ts draws the same sheet).
##   godot/tools/shots/shot.sh res://tests/garage3d_thumbs.gd <out.png> [rarity]
extends SceneTree

var _out := "/tmp/thumbs.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	var rarity := int(args[1]) if args.size() > 1 else 2
	TInit.run()
	var th := PartThumbs.new()
	get_root().add_child(th)
	_run.call_deferred(th, rarity)


func _run(th: PartThumbs, rarity: int) -> void:
	var spec = TLoadout.DEFAULT_PLAYER
	var got := {}
	th.ready_thumb.connect(func(k: String, t: Texture2D) -> void: got[k] = t)
	var keys := []
	var us := []
	for slot in TItems.SLOTS:
		var item = TItems.ITEM_BY_ID.get(spec.loadout[slot].id)
		th.thumb(item, rarity, spec.paint, spec.loadout)
		keys.append(PartThumbs.key_of(item, rarity, spec.paint, spec.loadout))
	var frames := 0
	while got.size() < keys.size() and frames < 120:
		await process_frame
		frames += 1
		us.append(th.last_us)
		th.last_us = 0
	print("pictures: %d in %d frames; per frame set-up + read-back us: %s" % [got.size(), frames, us])
	var sheet := Image.create(PartThumbs.SIZE * 6, PartThumbs.SIZE, false, Image.FORMAT_RGBA8)
	sheet.fill(Color(0.24, 0.26, 0.3))
	for i in keys.size():
		var t: Texture2D = got.get(keys[i])
		if t == null:
			continue
		var img := t.get_image()
		img.convert(Image.FORMAT_RGBA8)
		sheet.blend_rect(img, Rect2i(0, 0, PartThumbs.SIZE, PartThumbs.SIZE), Vector2i(i * PartThumbs.SIZE, 0))
	sheet.save_png(_out)
	quit()
