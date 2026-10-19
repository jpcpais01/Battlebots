## GachaSound makes its sounds on a worker: nothing is synthesized on the main thread, every
## sound turns up, and (given BB_OLD_GACHA, a copy of the old main-thread script without its
## class_name) the samples match the old ones exactly.
## godot --headless --path . -s res://tests/review_gacha_sound.gd
extends SceneTree


func _init() -> void:
	var t0 := Time.get_ticks_usec()
	var g := GachaSound.new()
	var made_us := Time.get_ticks_usec() - t0
	# asking for one straight away must not stall: it's either ready or skipped
	t0 = Time.get_ticks_usec()
	var early := GachaSound.stream("chime2")
	var ask_us := Time.get_ticks_usec() - t0
	print("new: ", made_us, " us, early chime2: ", early != null, " in ", ask_us, " us")
	var bad := 0
	if ask_us > 20000:
		print("FAIL: stream() blocked for ", ask_us, " us")
		bad += 1
	var spins := 0
	while GachaSound.warm_one():
		OS.delay_msec(5)
		spins += 1
		if spins > 4000:
			print("FAIL: the worker never finished")
			quit(1)
			return
	var old: GDScript = null
	var old_path := OS.get_environment("BB_OLD_GACHA")
	if old_path != "":
		old = GDScript.new()
		old.source_code = FileAccess.get_file_as_string(old_path)
		old.reload()
	for id in GachaSound.IDS:
		var s := GachaSound.stream(id)
		if s == null or s.data.size() == 0:
			print("FAIL: ", id, " missing")
			bad += 1
			continue
		if old != null:
			var o: AudioStreamWAV = old.call("stream", id)
			if o.data != s.data:
				print("FAIL: ", id, " differs from the old synthesis")
				bad += 1
	if GachaSound.stream("nope") != null:
		print("FAIL: unknown id gave a stream")
		bad += 1
	g.free()
	print("review_gacha_sound: ", bad, " failed", " (compared with old)" if old != null else "")
	quit(1 if bad else 0)
