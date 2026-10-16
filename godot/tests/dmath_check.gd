extends SceneTree


func _hx(v: float) -> String:
	var b := PackedByteArray()
	b.resize(8)
	b.encode_double(0, v)
	return "%08x%08x" % [b.decode_u32(4), b.decode_u32(0)]


func _init() -> void:
	quit.call_deferred(2)
	var s := [12345.0]
	var out := PackedStringArray()
	var rnd := func() -> float:
		s[0] = fmod(s[0] * 1103515245.0 + 12345.0, 2147483648.0)
		return s[0] / 2147483648.0
	for i in 400:
		var x: float = (rnd.call() - 0.5) * 20.0
		var y: float = (rnd.call() - 0.5) * 20.0
		var p: float = rnd.call() * 3.0
		var a: float = rnd.call() * 2.0 - 1.0
		var c: float = rnd.call() * 2.0 - 1.0
		var vals := [DM.sin(x), DM.cos(x), DM.atan(x), DM.atan2(y, x), DM.exp(x), DM.log(p + 0.001), DM.pow(p, x * 0.3), DM.asin(a), DM.acos(c), DM.hypot(x, y)]
		var row := PackedStringArray()
		for v in vals:
			row.append(_hx(v))
		out.append(" ".join(row))
	print("\n".join(out))
	quit(0)
