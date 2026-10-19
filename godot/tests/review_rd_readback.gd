## The read-back PartThumbs uses, on a plain 2D SubViewport (quick even on SwiftShader): the bytes
## RenderingDevice.texture_get_data_async hands back are get_image()'s, byte for byte, and a copy
## asked for before the viewport redraws in the same frame still holds the old picture.
##   godot/tools/shots/vkshot.sh res://tests/review_rd_readback.gd
extends SceneTree

const SIZE := PartThumbs.SIZE

var _fails := 0
var _vp: SubViewport
var _rect: ColorRect


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(SIZE, SIZE)
	_vp.disable_3d = true
	_vp.transparent_bg = true
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	root.add_child(_vp)
	_rect = ColorRect.new()
	_rect.size = Vector2(SIZE, SIZE)
	_vp.add_child(_rect)
	# a gradient-ish picture with partial alpha, so channel order and premultiplying would show
	var g := ColorRect.new()
	g.size = Vector2(SIZE / 2, SIZE / 3)
	g.color = Color(0.1, 0.8, 0.3, 0.5)
	_vp.add_child(g)
	_run.call_deferred()


func _draw_once(c: Color) -> void:
	_rect.color = c
	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE


func _run() -> void:
	var rd := RenderingServer.get_rendering_device()
	print("renderer: ", RenderingServer.get_current_rendering_method(), ", RenderingDevice: ", rd != null)
	if rd == null:
		print("review_rd_readback: no RenderingDevice, nothing to check")
		quit(0)
		return
	_draw_once(Color(0.9, 0.2, 0.1, 0.75))
	await process_frame
	await process_frame
	var sync := _vp.get_texture().get_image()
	var rid := RenderingServer.texture_get_rd_texture(_vp.get_texture().get_rid())
	_check(rid.is_valid(), "the viewport's RenderingDevice texture")
	var fmt := rd.texture_get_format(rid)
	print("format ", fmt.format, " ", fmt.width, "x", fmt.height, "; get_image ", sync.get_format(), " ", sync.get_data().size(), " bytes")
	var got := []
	var err := rd.texture_get_data_async(rid, 0, func(d: PackedByteArray) -> void: got.append(d))
	# ...and draw something else into it this same frame
	_draw_once(Color(0.0, 0.0, 1.0, 1.0))
	_check(err == OK, "texture_get_data_async accepted")
	var frames := 0
	while got.is_empty() and frames < 30:
		await process_frame
		frames += 1
	_check(not got.is_empty(), "it landed after %d frames" % frames)
	if not got.is_empty():
		var d: PackedByteArray = got[0]
		_check(d.size() == SIZE * SIZE * 4, "tightly packed RGBA8 (%d bytes)" % d.size())
		_check(sync.get_format() == Image.FORMAT_RGBA8 and d == sync.get_data(), "byte-identical to get_image() of the picture before the redraw")
	print("review_rd_readback: ", _fails, " failed")
	quit(1 if _fails else 0)
