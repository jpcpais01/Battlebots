## Headless checks of the review's audio and effects fixes: the crowd's silent beds pause out of a
## fight and come back, Voice.stock lets go of clips nobody wants (never a pinned, decoded or
## lately wanted one), flush() reads off the main thread, the booth's after-fight restock waits
## for later frames and is spread over them, and FightFx's tag team rematch frees the benched
## partners' trails.
##   godot --headless --path . -s res://tests/review_audio.gd
extends SceneTree

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


## A booth's audio side that only notes what it's asked.
class Out:
	var wanted: Array = []
	var stocks: Array = []
	var loaded := {}

	func ready(f: String) -> bool:
		return loaded.has(f)

	func want(files: Array) -> void:
		wanted.append_array(files)

	func stock(files: Array) -> void:
		stocks.append(files.duplicate())

	func prime(_files: Array) -> void:
		pass


class Tag:
	func partnerOf(_side: float):
		return {"spec": {"paint": {"accent": 0x33ff66}}}


func _initialize() -> void:
	await _crowd()
	await _voice()
	_booth()
	_fx()
	print("review_audio: ", _fails, " failed")
	quit(1 if _fails else 0)


func _crowd() -> void:
	var crowd := CrowdAudio.new()
	root.add_child(crowd)
	await process_frame
	var beds: Array = [crowd._murmur, crowd._roar, crowd._applause]
	_check(crowd._murmur.playing, "the beds start playing")
	# the vault: no crowd at all
	crowd.ambience(0.0)
	for i in 120:
		crowd.tick(1.0 / 60.0, null)
	var paused := beds.all(func(p: AudioStreamPlayer) -> bool: return p.stream == null or p.stream_paused)
	_check(paused, "silent out of a fight for a while: all three beds paused")
	# back home: the murmur is heard again, the roar (no excitement) stays resting
	crowd.ambience(0.25)
	var at_db := 0.0
	for i in 6:
		crowd.tick(1.0 / 60.0, null)
		if not crowd._murmur.stream_paused and at_db == 0.0:
			at_db = crowd._murmur.volume_db
	_check(not crowd._murmur.stream_paused, "the murmur resumes as soon as it's due to be heard")
	_check(at_db < -50.0, "...from near silence (%.1f dB as it resumes), so no click" % at_db)
	# a fight: everything runs, whatever its level
	var st := CrowdAudio.State.new()
	st.phase = "fight"
	st.clock = 60.0
	crowd.tick(1.0 / 60.0, st)
	_check(beds.all(func(p: AudioStreamPlayer) -> bool: return not p.stream_paused), "in a fight no bed is paused")
	crowd.queue_free()


func _voice() -> void:
	var v := Voice.new()
	root.add_child(v)
	await process_frame
	v.add("mine", PackedByteArray([1, 2, 3]))
	v.stock(["a", "b", "c"])
	# (stand in for the reads: there's no voice pack in the container)
	v._wanted.clear()
	for f in ["a", "b", "c"]:
		v._enc[f] = PackedByteArray([7])
	v.want(["extra"])
	v._wanted.clear()
	v._enc["extra"] = PackedByteArray([8])
	v._dec["c"] = AudioStreamMP3.new()
	v.stock(["b", "d"])
	_check(not v._enc.has("a"), "a clip only in the last stock is let go")
	_check(v.ready("b"), "a clip in the new stock stays")
	_check(v.ready("c"), "a decoded clip stays")
	_check(v.ready("extra"), "a clip wanted since the last stock stays through this one")
	_check(v.ready("mine"), "a clip handed in with add() stays")
	_check(v._enc.has("d") and v._wanted.has("d"), "the new stock's clips are queued")
	v._dec.clear()
	v.stock(["b"])
	_check(not v._enc.has("extra") and not v._enc.has("c"), "...and go at the next one")
	_check(v.ready("mine"), "the added clip never goes")
	# flush() reads off the main thread (missing files here: they're dropped, to be retried)
	v.want(["nope1", "nope2"])
	v.flush()
	_check(v._wanted.is_empty() and v._bg_task >= 0, "flush() hands the reads to a worker")
	var frames := 0
	while v._bg_task >= 0 and frames < 300:
		await process_frame
		frames += 1
	_check(v._bg_task < 0 and not v._enc.has("nope1"), "the worker's reads land and the task is retired (%d frames)" % frames)
	v.queue_free()


func _booth() -> void:
	var out := Out.new()
	var b := Booth.new(out)
	var lines: Array = []
	for t in 40:
		for k in 30:
			lines.append({"id": "l%d_%d" % [t, k], "t": "trig%d" % t, "v": ["p", "c", "r"][k % 3], "f": [["f%d_%d.mp3" % [t, k], 1.0]], "e": 2})
	b.set_manifest({"lines": lines, "names": {}})
	_check(out.stocks.size() == 1 and not out.stocks[0].is_empty(), "the manifest's first stock is handed over at once")
	var first: Array = out.stocks[0]
	# a fight that said one line, ended: the restock waits
	b.m = {"frame": 0}
	b._used[first[0].get_basename().replace("f", "l")] = true
	b.end()
	_check(out.stocks.size() == 1, "end() doesn't restock in its own frame")
	var ticks := 0
	while out.stocks.size() < 2 and ticks < 400:
		b.tick(1.0 / 60.0, 0.3, false)
		ticks += 1
	_check(out.stocks.size() == 2, "the restock lands a few frames later (%d)" % ticks)
	_check(b._stock_at < 0, "and nothing's left in progress")


func _fx() -> void:
	var ff := FightFx.new()
	var m := {"specs": [{"paint": {"accent": 0xff3344}}, {"paint": {"accent": 0x3344ff}}], "tag": Tag.new()}
	var none: Array[BotModel] = []
	ff.start(m, none)
	var n0 := ff.fx._trails.size()
	ff.start(m, none)
	ff.start(m, none)
	_check(n0 == 16 and ff.fx._trails.size() == n0, "a tag team rematch keeps 16 trails, not more (%d after 3 starts)" % ff.fx._trails.size())
	ff.stop()
	_check(ff.fx._trails.is_empty(), "stop() drops them all")
	ff.free()
