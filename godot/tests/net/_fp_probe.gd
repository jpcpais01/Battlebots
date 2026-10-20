extends SceneTree
var t := 0.0
var s
func _initialize() -> void:
	TInit.run()
	s = OnlineSession.host(TLoadout.randomBot(TMath.Rng.new(5.0)))
	root.add_child(s)
func _process(dt: float) -> bool:
	t += dt
	if int(t * 2) != int((t - dt) * 2):
		print("t %.1f checking %s task %d value %d" % [t, s.checking, NetFingerprint._task, NetFingerprint.value])
	if t > 1.0 and t - dt <= 1.0:
		var m = JSON.parse_string(FileAccess.get_file_as_string("/tmp/claude-0/hello.json"))
		print("bot ", OnlineSession._bot(m.bot).name_)
	return t > 8.0
