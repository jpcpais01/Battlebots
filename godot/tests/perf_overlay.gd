## Checks the performance overlay (ui/perf_overlay.gd, game/perf.gd) in a running fight:
## - the CPU sections add up to the engine's own process time for the frame;
## - with the GPU probe's layers in place the fight's own picture doesn't change, and Measure
##   runs to the end and puts everything back (mesh layers, camera and light masks, its viewport);
## - what the hooks cost per frame with the overlay on and with it off.
## With an output prefix it also saves the open panel over the fight as <prefix>.png, and folded as
## <prefix>_compact.png, each with the _3d / _2d layers for tools/shots/ui_srgb.py. "quick" after
## the prefix measures one round instead of three (big windows are slow on llvmpipe).
##   godot/tools/shots/shot.sh res://tests/perf_overlay.gd [out prefix [quick]]     (GL: GPU timers)
##   godot --headless --path godot -s res://tests/perf_overlay.gd           (no GPU: "n/a" path)
extends SceneTree

var _fight
var _out := ""
var _bad := 0
var _frames := 0
var _gl := false


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1 and args[1] == "quick":
		PerfOverlay.GpuProbe.rounds = 1
	Settings.path = "user://perf_test_settings.cfg"
	PerfOverlay.cfg_path = "user://perf_test_overlay.cfg"
	for p in [Settings.path, PerfOverlay.cfg_path]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(p))
	OS.set_environment("BB_SKIPINTRO", "1")
	if OS.get_environment("BB_SEED") == "":
		OS.set_environment("BB_SEED", "7")
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 3:
		_run()
	return false


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_bad += 1


func _wait(n: int) -> void:
	for i in n:
		await process_frame


## The live GPU split: a Mobile renderer frame's stamps (in the order servers/rendering stamps
## them; Vulkan only, so made up here) land in the right stages, the AO map's viewport as its own.
func _stages() -> void:
	var ao := Perf._ao_vp
	var fake := RenderingServer.viewport_create()
	Perf.watch_ao(fake)
	var ao_id: String = Perf._ao_begin.substr(9)
	var frame := [
		["> Render Viewports", 0], ["> Render Viewport 0", 2], ["vp_begin_" + ao_id, 3], ["> Render Canvas 0", 5],
		["< Render Canvas 0", 205], ["vp_end_" + ao_id, 206], ["< Render Viewport 0", 207],
		["> Render Viewport 1", 210], ["vp_begin_1", 211], ["> Render 3D Scene", 212], ["Prepare 3D Scene", 215],
		["Setup 3D Scene", 220], ["Setup Sky", 300], ["Setup Shadows", 400], ["Render Shadows", 450],
		["Render Opaque + Transparent", 1450], ["Tonemap", 6450], ["Glow", 6460], ["Tonemap", 7460],
		["< Render 3D Scene", 7960], ["> Render Canvas 0", 7961], ["< Render Canvas 0", 8261], ["vp_end_1", 8262],
		["< Render Viewport 1", 8263], ["< Render Viewports", 8300],
	]
	var names := PackedStringArray()
	var times := PackedInt64Array()
	for e in frame:
		names.append(e[0])
		times.append(int(e[1]) * 1000)
	var was_on := Perf.on
	Perf.on = true
	Perf._reset_window()
	Perf.add_stages(names, times)
	var got := Perf._stage_ns.duplicate()
	Perf._reset_window()
	Perf.on = was_on
	Perf.watch_ao(ao)
	RenderingServer.free_rid(fake)
	# (in us: 3D scene setup and the sky are the scene's, the canvas inside the AO viewport its own)
	var want := {Perf.G_SHADOWS: 1050, Perf.G_SCENE: 5000 + 3 + 5 + 80 + 100, Perf.G_GLOW: 1000, Perf.G_POST: 10 + 500, Perf.G_HUD: 300, Perf.G_AO: 203, Perf.G_OTHER: 2 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 1 + 37}
	var ok := got.size() == Perf.G_COUNT
	var total := 0.0
	for g in want:
		if ok and absf(got[g] / 1000.0 - want[g]) > 0.01:
			ok = false
			print("  stage %d: %.1f us, want %d" % [g, got[g] / 1000.0, want[g]])
	for v in got:
		total += v
	_check(ok and absf(total / 1000.0 - 8300.0) < 0.01, "the live GPU stages split a frame's stamps as the renderer means them")


func _run() -> void:
	var f = _fight
	var ov: PerfOverlay = f.hud.perf
	_gl = RenderingServer.get_current_rendering_method() != "dummy" and DisplayServer.get_name() != "headless"
	print("renderer: ", RenderingServer.get_current_rendering_method(), " / ", RenderingServer.get_current_rendering_driver_name(), " / ", RenderingServer.get_video_adapter_name())
	_check(ov.visible and Perf.on, "the overlay is on by default (Performance stats)")
	ov.set_compact(false)
	await _cpu_sums(f)
	await _gpu_live()
	_stages()
	await _invariance(f, ov)
	await _measure(f, ov)
	if _out != "":
		await _shots(f, _out)
		f.hud.perf.set_compact(true)
		await _shots(f, _out + "_compact")
		f.hud.perf.set_compact(false)
	_bench()
	print("perf_overlay: %d failed" % _bad)
	quit(1 if _bad else 0)


## Every main-thread section, against the engine's process time sampled here, frame by frame.
func _cpu_sums(f) -> void:
	# (the sim and the arena warm up over the first frames)
	await _wait(30)
	var proc := 0.0
	var peak := 0.0
	var n := 0
	var reports: Array[Perf.Report] = []
	var last: Perf.Report = Perf.last
	var t0 := Time.get_ticks_msec()
	while reports.size() < 6 and Time.get_ticks_msec() - t0 < 60000:
		await process_frame
		if Perf.last != last and Perf.last != null:
			last = Perf.last
			reports.append(last)
			proc += last.process
			n += 1
			# (Performance's own figure is the slowest frame of the last second)
			peak = maxf(peak, Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
	_check(reports.size() >= 4, "%d reports in the run (one per 0.5 s)" % reports.size())
	if reports.is_empty():
		return
	var ms := PackedFloat64Array()
	ms.resize(Perf.COUNT)
	var frame := 0.0
	var cpu := 0.0
	for r in reports:
		for s in Perf.COUNT:
			ms[s] += r.ms[s] / reports.size()
		frame += r.frame / reports.size()
		cpu += r.cpu / reports.size()
	proc /= maxi(1, n)
	var names := ["Sim", "  wait", "  worker*", "  AI*", "Bot anim", "Effects", "Arena", "Camera", "Audio", "HUD", "Other", "Render CPU", "panel", "gpu"]
	for s in Perf.COUNT:
		print("  %-11s %8.3f ms" % [names[s], ms[s]])
	print("  frame %.2f ms, CPU total %.2f ms, every node's _process %.2f ms (engine's slowest %.2f ms)" % [frame, cpu, proc, peak])
	var hooked := ms[Perf.SIM] + ms[Perf.BOTS] + ms[Perf.FX] + ms[Perf.ARENA] + ms[Perf.CAMERA] + ms[Perf.AUDIO] + ms[Perf.HUD] + ms[Perf.PANEL]
	var all := hooked + ms[Perf.OTHER]
	print("  hooked sections %.3f ms = %.0f%% of process; with Other %.3f ms" % [hooked, 100.0 * hooked / maxf(proc, 1e-6), all])
	# (the HUD's and the panel's _draw run just after the node pass, so they sit outside it)
	var inside := hooked - ms[Perf.HUD] - ms[Perf.PANEL]
	_check(inside <= proc + 0.02, "the hooked sections fit inside the node pass (%.3f <= %.3f ms)" % [inside, proc])
	_check(inside >= proc * 0.6, "the hooks see most of it: the fight loop (%.0f%%)" % (100.0 * inside / maxf(proc, 1e-6)))
	_check(proc <= peak + 0.5, "the node pass is no longer than the engine's own slowest process time")
	_check(ms[Perf.WORKER] > 0.0, "the worker's step time comes through")
	_check(ms[Perf.SIM] >= ms[Perf.SIM_WAIT], "the wait is part of Sim")
	_check(absf(cpu - (all + ms[Perf.RENDER])) < 0.01, "CPU total = sections + Render CPU")
	# (on llvmpipe "render CPU" includes the rasterizing itself, so allow for some overlap)
	_check(frame * 1.3 + 1.0 >= cpu, "the frame is no shorter than its CPU work")


func _gpu_live() -> void:
	var r: Perf.Report = Perf.last
	if _gl:
		_check(r != null and r.gpu > 0.0, "the GPU total is measured (%.2f ms)" % (r.gpu if r else -1.0))
		_check(r != null and r.ms[Perf.RENDER] > 0.0, "Render CPU is measured (%.2f ms)" % (r.ms[Perf.RENDER] if r else -1.0))
	else:
		_check(r != null and r.gpu < 0.0, "no GPU timer here: the GPU total says n/a")


## Layers, camera and light masks as they are now.
func _snapshot(f) -> Dictionary:
	var out := {}
	for n in f.find_children("*", "GeometryInstance3D", true, false):
		out[n.get_instance_id()] = n.layers
	for n in f.find_children("*", "Light3D", true, false):
		out["L%d" % n.get_instance_id()] = [n.light_cull_mask, n.shadow_caster_mask, n.layers]
	out["cam"] = f.cam.cull_mask
	return out


func _same(a: Dictionary, b: Dictionary) -> int:
	var diff := 0
	for k in a:
		if b.has(k) and str(a[k]) != str(b[k]):
			diff += 1
	return diff


func _image() -> Image:
	await RenderingServer.frame_post_draw
	return get_root().get_texture().get_image()


static func _max_diff(a: Image, b: Image) -> int:
	if a == null or b == null or a.get_size() != b.get_size():
		return 999
	var da := a.get_data()
	var db := b.get_data()
	var worst := 0
	for i in range(0, da.size(), 7):
		worst = maxi(worst, absi(da[i] - db[i]))
	return worst


## The probe's layers in place (the fight held still), the fight's picture as before.
func _invariance(f, ov: PerfOverlay) -> void:
	paused = true
	await _wait(3)
	var before := _snapshot(f)
	var a: Image = await _image() if _gl else null
	var probe := PerfOverlay.GpuProbe.new(f, ov)
	_check(probe.refused == "", "the probe accepts this scene (%s)" % probe.refused)
	var moved := 0
	for n in f.find_children("*", "GeometryInstance3D", true, false):
		if n.layers >= (1 << PerfOverlay.GpuProbe.BIT0):
			moved += 1
	print("  %d meshes moved to part layers; per part %s" % [moved, str(probe._count)])
	_check(moved > 50, "the parts' meshes are on their own layers")
	await _wait(3)
	if _gl:
		var b: Image = await _image()
		_check(_max_diff(a, b) <= 2, "the fight looks the same with the parts on their layers (max diff %d)" % _max_diff(a, b))
	probe.abort()
	await _wait(2)
	_check(_same(before, _snapshot(f)) == 0, "layers and masks back as they were")
	_check(ov.find_child("PerfProbe", true, false) == null, "the probe's viewport is freed")
	paused = false
	await _wait(2)


func _measure(f, ov: PerfOverlay) -> void:
	await _wait(5)
	var before := _snapshot(f)
	var cam_mask: int = f.cam.cull_mask
	var t0 := Time.get_ticks_msec()
	ov.measure()
	_check(ov.measuring() or not _gl, "Measure starts")
	var frames := 0
	while ov.measuring() and Time.get_ticks_msec() - t0 < 240000:
		await process_frame
		frames += 1
	var res := ov.result()
	print("  measure took %d frames, %.1f s; lag %d frames" % [frames, (Time.get_ticks_msec() - t0) / 1000.0, PerfOverlay.GpuProbe._lag])
	if _gl:
		_check(res != null, "Measure finished with a result (%s)" % ov._note)
		if res != null:
			var parts := 0.0
			for i in PerfOverlay.GpuProbe.ROWS.size():
				print("  %-11s %s" % [PerfOverlay.GpuProbe.ROWS[i], "off" if res.ms[i] == -2.0 else "%.3f ms" % res.ms[i]])
				if i < PerfOverlay.GpuProbe.PARTS:
					parts += maxf(0.0, res.ms[i])
			for v in res.samples:
				print("    version %d: %d samples, median of %s" % [v, res.samples[v].size(), str(res.samples[v])])
			_check(res.full > 0.0, "the full offscreen frame was timed (%.2f ms)" % res.full)
			_check(res.ms[PerfOverlay.GpuProbe.BOTS] >= 0.0 and res.ms[PerfOverlay.GpuProbe.CROWD] >= 0.0, "parts have numbers")
			var base: float = res.full - maxf(0.0, res.ms[PerfOverlay.GpuProbe.SHADOWS]) - maxf(0.0, res.ms[PerfOverlay.GpuProbe.GLOW])
			_check(parts + res.ms[PerfOverlay.GpuProbe.OTHER] >= base * 0.98 - 0.01, "parts + Other make up the base frame")
	else:
		_check(res == null and ov._note != "", "no GPU timer: Measure says so (%s)" % ov._note)
	await _wait(2)
	_check(_same(before, _snapshot(f)) == 0, "after Measure: every mesh's layers, the camera and the lights as before")
	_check(f.cam.cull_mask == cam_mask, "the fight's camera mask untouched")
	_check(ov.find_child("PerfProbe", true, false) == null, "after Measure: the probe's viewport is freed")


## The open panel over the fight, and its two layers for ui_srgb.py (see tests/ui_shot.gd).
func _shots(f, out: String) -> void:
	paused = true
	await _wait(2)
	var full: Image = await _image()
	full.save_png(out + ".png")
	f.hud.visible = false
	await _wait(1)
	var d3: Image = await _image()
	d3.save_png(out + "_3d.png")
	f.hud.visible = true
	get_root().disable_3d = true
	var clear := RenderingServer.get_default_clear_color()
	RenderingServer.set_default_clear_color(Color.BLACK)
	await _wait(1)
	var d2: Image = await _image()
	d2.save_png(out + "_2d.png")
	get_root().disable_3d = false
	RenderingServer.set_default_clear_color(clear)
	print("saved ", out, ".png (+ _3d, _2d)")
	# the panel stays inside the side margins
	var ov: PerfOverlay = f.hud.perf
	var m := FightHud.side_margin(ov)
	_check(ov._panel.position.x >= m - 0.5 and ov._panel.end.x <= ov.size.x - m + 0.5, "the panel is inside the 3%% margins (x %.0f..%.0f, margin %.0f, width %.0f)" % [ov._panel.position.x, ov._panel.end.x, m, ov.size.x])
	paused = false


## What the hooks cost per frame: the fight loop's laps, frame(), the worker hand-over and the
## adds from the HUD and the sound kit, with the overlay off and on.
func _bench() -> void:
	var was := Perf.on
	var n := 20000
	# the loop alone, to take off the others
	var tb := Time.get_ticks_usec()
	for i in n:
		for s in [Perf.SIM, Perf.CAMERA, Perf.BOTS, Perf.FX, Perf.AUDIO, Perf.ARENA, Perf.AUDIO, Perf.ARENA, Perf.CAMERA, Perf.HUD, Perf.SIM]:
			pass
		for k in 4:
			pass
	var base := float(Time.get_ticks_usec() - tb) / n
	print("  (bench loop alone: %.2f us per frame, taken off below)" % base)
	for on in [false, true]:
		Perf.on = on
		var t0 := Time.get_ticks_usec()
		for i in n:
			Perf.frame()
			Perf.lap(Perf.SIM_WAIT)
			Perf.worker(0)
			for s in [Perf.SIM, Perf.CAMERA, Perf.BOTS, Perf.FX, Perf.AUDIO, Perf.ARENA, Perf.AUDIO, Perf.ARENA, Perf.CAMERA, Perf.HUD, Perf.SIM]:
				Perf.lap(s)
			for k in 4:
				Perf.add(Perf.AUDIO, Perf.now())
		var us := float(Time.get_ticks_usec() - t0) / n - base
		print("  hooks with the overlay %s: %.2f us per frame" % ["on" if on else "off", us])
	Perf.on = was
	var r: Perf.Report = Perf.last
	if r != null:
		print("  the panel's own _draw/_process (measured in the fight): %.3f ms per frame" % r.ms[Perf.PANEL])
