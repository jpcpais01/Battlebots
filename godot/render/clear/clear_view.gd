## Keeps the camera's view of the fight clear (src/render/clearView.ts ClearView.update): fills
## the globals clear_view.gdshaderinc reads, so ropes, posts and rigging between the lens and the
## robots dissolve. Pass no points to switch it off.
class_name ClearView
extends RefCounted


static func update(camera: Camera3D, points: Array[Vector3]) -> void:
	RenderingServer.global_shader_parameter_set("bb_clear_on", 1.0 if not points.is_empty() else 0.0)
	if points.is_empty():
		return
	var fwd := -camera.global_transform.basis.z
	var l := Vector2(fwd.x, fwd.z).length()
	if l < 1e-6:
		l = 1.0
	var fx := fwd.x / l
	var fz := fwd.z / l
	var cx := camera.global_position.x
	var cz := camera.global_position.z
	var d := INF
	var lo := INF
	var hi := -INF
	for p in points:
		var f := maxf(0.3, (p.x - cx) * fx + (p.z - cz) * fz)
		var a := ((p.z - cz) * fx - (p.x - cx) * fz) / f
		d = minf(d, f)
		# a robot reaches about 0.7 m either side of its chest
		lo = minf(lo, a - 0.7 / f)
		hi = maxf(hi, a + 0.7 / f)
	RenderingServer.global_shader_parameter_set("bb_clear_fwd", Vector2(fx, fz))
	RenderingServer.global_shader_parameter_set("bb_clear_cam", Vector2(cx, cz))
	RenderingServer.global_shader_parameter_set("bb_clear_depth", d)
	RenderingServer.global_shader_parameter_set("bb_clear_span", Vector2(lo, hi))
