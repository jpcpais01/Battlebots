## PartThumbs' asynchronous read-back gives exactly the pictures get_image() does, in the right
## order, with a picture asked for twice landing once for both callers. On the GL renderer (no
## RenderingDevice) both runs are the get_image() path; run it on Vulkan to check the async one.
##   godot/tools/shots/vkshot.sh res://tests/review_thumbs_async.gd
##   godot/tools/shots/shot.sh res://tests/review_thumbs_async.gd
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	TInit.run()
	var th := PartThumbs.new()
	get_root().add_child(th)
	_run.call_deferred(th)


## Every slot's picture of the stock bot at `rarity`: key -> Image. Each is asked for twice (the
## second with a callback) to check both callers hear of it.
func _shots(th: PartThumbs, rarity: int, use_async: bool) -> Dictionary:
	PartThumbs.async_readback = use_async
	var spec = TLoadout.DEFAULT_PLAYER
	var got := {}
	var called := {}
	var order: Array = []
	var on_ready := func(k: String, t: Texture2D) -> void:
		got[k] = t.get_image()
		order.append(k)
	th.ready_thumb.connect(on_ready)
	var keys: Array = []
	for slot in TItems.SLOTS:
		var item = TItems.ITEM_BY_ID.get(spec.loadout[slot].id)
		th.thumb(item, rarity, spec.paint, spec.loadout)
		var k := PartThumbs.key_of(item, rarity, spec.paint, spec.loadout)
		th.thumb(item, rarity, spec.paint, spec.loadout, func(_t: Texture2D) -> void: called[k] = int(called.get(k, 0)) + 1)
		keys.append(k)
	var frames := 0
	var max_reading := 0
	while got.size() < keys.size() and frames < 240:
		await process_frame
		frames += 1
		max_reading = maxi(max_reading, th.reading)
	th.ready_thumb.disconnect(on_ready)
	print("%s: %d pictures in %d frames, up to %d read-backs in flight" % ["async" if use_async else "get_image", got.size(), frames, max_reading])
	_check(got.size() == keys.size(), "every picture landed (%s)" % ("async" if use_async else "get_image"))
	_check(order == keys, "they landed in the order asked")
	var twice := true
	for k in keys:
		twice = twice and int(called.get(k, 0)) == 1
	_check(twice, "a picture asked for twice lands once, for both")
	return got


func _run(th: PartThumbs) -> void:
	var dev := RenderingServer.get_rendering_device()
	print("renderer: ", RenderingServer.get_current_rendering_method(), ", RenderingDevice: ", dev != null)
	var a := await _shots(th, 2, true)
	# (forget them, so the second run draws them all again)
	th._cache.clear()
	var b := await _shots(th, 2, false)
	var same := 0
	for k in a:
		var ia: Image = a[k]
		var ib: Image = b.get(k)
		if ib != null and ia.get_format() == ib.get_format() and ia.get_data() == ib.get_data():
			same += 1
		elif ib != null:
			print("  differs: ", k, " ", ia.get_format(), " vs ", ib.get_format())
	_check(same == a.size() and same > 0, "%d of %d async pictures byte-identical to get_image()'s" % [same, a.size()])
	print("review_thumbs_async: ", _fails, " failed")
	quit(1 if _fails else 0)
