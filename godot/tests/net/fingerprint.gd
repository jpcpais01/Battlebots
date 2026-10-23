## The app's sim fingerprint must equal the web game's (FpData.WEB, written by
## tools/net/fingerprint.ts) for phones and browsers to share online rooms.
##   godot --headless --path godot -s res://tests/net/fingerprint.gd
extends SceneTree


func _init() -> void:
	TInit.run()
	var t0 := Time.get_ticks_msec()
	var fp := NetFingerprint.compute()
	print("fingerprint %x (web %x) in %d ms" % [fp, FpData.WEB, Time.get_ticks_msec() - t0])
	print("SAME" if fp == FpData.WEB else "DIFFERENT")
	quit(0 if fp == FpData.WEB else 1)
