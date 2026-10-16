## Frame profiler behind the performance overlay (ported from the web game's src/perf.ts). Off by
## default; while off every hook is one bool check, so the hooks can stay in the game loop.
##
## The fight calls frame() at the start of its _process and lap(section) after each part of it,
## so a section's cost is the time since the previous lap. Work outside that function (the HUD's
## _draw, the sound kit's own _process) is timed with now() + add() and charged without moving
## the lap. The sim steps on a worker thread, in parallel with the frame: its time is handed in by
## worker() after the main thread has waited for it, and shown apart from the frame's own cost.
##
## Render CPU and the GPU total come from the rendering server's own per-viewport timers
## (viewport_set_measure_render_time), switched on while the profiler is. The GPU's split by
## render stage comes from the renderer's own stage markers, which it stamps on the GPU's
## timeline once the project setting debug/settings/stdout/print_gpu_profile is on (it is, in
## project.godot): a stage's time is the gap to the next marker (stages()).
class_name Perf
extends RefCounted

## The sections, in the overlay's order. SIM_WAIT is part of SIM (the time the main thread sat
## waiting for the worker); WORKER and AI ran on the worker, in parallel; OTHER is the rest of the
## engine's process time (other nodes' _process, the scene tree itself) and PANEL the overlay's
## own cost, kept apart so it never hides in the others.
enum { SIM, SIM_WAIT, WORKER, AI, BOTS, FX, ARENA, CAMERA, AUDIO, HUD, OTHER, RENDER, PANEL, GPU, COUNT }

## The GPU's render stages (the overlay's live GPU rows): the shadow maps; the scene pass (opaque
## and transparent geometry, the sky); glow; the rest of the post chain (tonemap, exposure); the
## 2D canvas (the HUD); the contact AO map's own viewport; and the rest (copies to the screen).
enum { G_SHADOWS, G_SCENE, G_GLOW, G_POST, G_HUD, G_AO, G_OTHER, G_COUNT }
## Read the stages every this many frames (a read is ~40 bound calls).
const STAGE_EVERY := 3

## Seconds per report (perf.ts WINDOW).
const WINDOW := 0.5
## Frame intervals kept for the overlay's graph (perf.ts frames: about 3 s at 60 FPS).
const HISTORY := 180

static var on := false
## Called with a fresh Report every WINDOW seconds while on.
static var on_report := Callable()
## Recent frame intervals in ms, a ring buffer (read with history()).
static var frames := PackedFloat32Array()
static var last: Report

static var _head := 0
static var _start := 0
static var _last := 0
static var _win_start := 0
static var _count := 0
static var _worst := 0
static var _sum := PackedInt64Array()
## Main-thread lap and add time since the engine started processing nodes this frame (us), to
## work out what the rest of the nodes cost; and when it started.
static var _main_us := 0
static var _proc_t := 0
static var _proc_us := 0
static var _gpu_us := 0
static var _gpu_n := 0
## AI time the worker stamped (TPerf.add, runtime/perf.gd), read once the worker has finished.
static var _ai_pending := 0
static var _ai_seen := false
static var _vp := RID()
## The contact AO map's viewport (render/ao/contact_ao.gd), timed as a stage of its own, and its
## markers' names.
static var _ao_vp := RID()
static var _ao_begin := ""
static var _ao_end := ""
## Stage sums (ns) over the window, how many frames were read, and each marker name's stage.
static var _stage_ns := PackedFloat64Array()
static var _stage_n := 0
static var _stage_of := {}
static var _stage_tick := 0


## Averages over one window, in ms per frame.
class Report extends RefCounted:
	var fps := 0.0
	## Mean time between frames.
	var frame := 0.0
	## Slowest frame in the window.
	var worst := 0.0
	## Mean ms per frame for each section (indexed by the Perf enum).
	var ms := PackedFloat64Array()
	## Main-thread CPU: every top-level section, Render CPU and the overlay itself.
	var cpu := 0.0
	## The whole frame on the GPU, or -1 where the renderer has no GPU timer.
	var gpu := -1.0
	## Whether the sim's AI timing reaches here (runtime/perf.gd forwarding to add_ai()).
	var ai := false
	## Every node's _process together (process_begin() to process_end()), for checks.
	var process := 0.0
	## The GPU's frame by render stage (indexed G_*), in ms; empty where the renderer stamps no
	## stages (the Compatibility renderer, or the project setting off).
	var stages := PackedFloat64Array()


## Start or stop profiling. `vp` is the viewport whose render time is read (the fight's).
static func set_on(enable: bool, vp := RID()) -> void:
	if _sum.size() != COUNT:
		_sum.resize(COUNT)
		frames.resize(HISTORY)
	if _vp.is_valid() and _vp != vp:
		RenderingServer.viewport_set_measure_render_time(_vp, false)
	_vp = vp
	if _vp.is_valid():
		RenderingServer.viewport_set_measure_render_time(_vp, enable)
	if _ao_vp.is_valid():
		RenderingServer.viewport_set_measure_render_time(_ao_vp, enable)
	on = enable
	_win_start = 0
	frames.fill(0.0)
	last = null


## Start of a game frame: closes the last frame, and every WINDOW seconds the report.
static func frame() -> void:
	if not on:
		return
	var t := Time.get_ticks_usec()
	var gap := t - _start
	_start = t
	_last = t
	if _win_start == 0 or gap > 1000000:
		# first frame, or back from a pause: don't count the gap
		_win_start = t
		_reset_window()
		return
	frames[_head] = gap / 1000.0
	_head = (_head + 1) % HISTORY
	_count += 1
	_worst = maxi(_worst, gap)
	if _vp.is_valid():
		# (the latest the server has measured: a frame or more behind, which a 0.5 s mean doesn't mind)
		var cpu := RenderingServer.viewport_get_measured_render_time_cpu(_vp) + RenderingServer.get_frame_setup_time_cpu()
		_sum[RENDER] += int(cpu * 1000.0)
		var gpu := RenderingServer.viewport_get_measured_render_time_gpu(_vp)
		if gpu > 0.0:
			_gpu_us += int(gpu * 1000.0)
			_gpu_n += 1
	_stage_tick += 1
	if _stage_tick >= STAGE_EVERY:
		_stage_tick = 0
		# (the captured timestamps belong to the render thread)
		RenderingServer.call_on_render_thread(_read_stages)
	if t - _win_start >= int(WINDOW * 1e6):
		_report(t - _win_start)


## Time the contact AO map's viewport (`vp`, or none) as a GPU stage of its own.
static func watch_ao(vp: RID) -> void:
	if _ao_vp.is_valid() and on:
		RenderingServer.viewport_set_measure_render_time(_ao_vp, false)
	_ao_vp = vp
	_ao_begin = "vp_begin_%d" % vp.get_id() if vp.is_valid() else ""
	_ao_end = "vp_end_%d" % vp.get_id() if vp.is_valid() else ""
	if _ao_vp.is_valid() and on:
		RenderingServer.viewport_set_measure_render_time(_ao_vp, true)


## Add the last measured frame's GPU stages to the window (on the render thread).
static func _read_stages() -> void:
	var rd := RenderingServer.get_rendering_device()
	if rd == null:
		return
	var n := rd.get_captured_timestamps_count()
	if n < 2:
		return
	var names := PackedStringArray()
	var times := PackedInt64Array()
	names.resize(n)
	times.resize(n)
	for i in n:
		names[i] = rd.get_captured_timestamp_name(i)
		times[i] = rd.get_captured_timestamp_gpu_time(i)
	add_stages(names, times)


## Add one frame's stage stamps (names, GPU times in ns, in order) to the window. The renderer
## stamps each stage as it starts, so a stage lasts until the next stamp. A "> Name" stamp opens a
## block and "< Name" closes it: the time after an opening stamp is that block's own work (a
## canvas's drawing) until a stamp inside it, the time after a closing one is the stage it returns
## to, here Other. The viewport timers' stamps take no time of their own, but the AO map's pair
## brackets its viewport, all of it its own stage.
static func add_stages(names: PackedStringArray, times: PackedInt64Array) -> void:
	var n := mini(names.size(), times.size())
	if n < 2:
		return
	if _stage_ns.size() != G_COUNT:
		_stage_ns.resize(G_COUNT)
	var sums := PackedFloat64Array()
	sums.resize(G_COUNT)
	var staged := false
	var in_ao := false
	for i in n - 1:
		var name := names[i]
		var d := times[i + 1] - times[i]
		# (a clock that went backwards: not a frame to trust)
		if d < 0:
			return
		if name == _ao_begin:
			in_ao = true
		elif name == _ao_end:
			in_ao = false
		var g: int = _stage_of.get(name, -1)
		if g < 0:
			g = _stage_for(name)
			_stage_of[name] = g
		if g != G_OTHER:
			staged = true
		sums[G_AO if in_ao else g] += d
	if not staged:
		return
	for g in G_COUNT:
		_stage_ns[g] += sums[g]
	_stage_n += 1


## Which stage the renderer's stamp `name` starts (servers/rendering: RENDER_TIMESTAMP).
static func _stage_for(name: String) -> int:
	if name.begins_with("vp_") or name.begins_with("<"):
		return G_OTHER
	if name.begins_with(">"):
		name = name.substr(1)
	if name.contains("Viewport"):
		return G_OTHER
	if name.contains("Shadow"):
		return G_SHADOWS
	if name.contains("Glow"):
		return G_GLOW
	if name.contains("Opaque") or name.contains("Transparent") or name.contains("Sky") or name.contains("3D Scene") or name.contains("Motion Vectors"):
		return G_SCENE
	if name.contains("Tonemap") or name.contains("exposure") or name.contains("Depth of Field") or name.contains("SMAA") or name.contains("FSR"):
		return G_POST
	if name.contains("Canvas") or name.contains("2D"):
		return G_HUD
	return G_OTHER


## The engine starts on this frame's nodes (the overlay calls this from a node that processes
## before every other: Performance's process time is a once-a-second maximum, no use here).
static func process_begin() -> void:
	if not on:
		return
	_proc_t = Time.get_ticks_usec()
	_main_us = 0


## ...and is done with them (from a node that processes after every other): what the hooks didn't
## see in between is Other (the other nodes' _process: settings, the pause menu, tweens' owners).
static func process_end() -> void:
	if not on or _proc_t == 0:
		return
	var span := Time.get_ticks_usec() - _proc_t
	_proc_t = 0
	_proc_us += span
	_sum[OTHER] += maxi(0, span - _main_us)


## Charge the time since the previous lap to section `s`.
static func lap(s: int) -> void:
	if not on:
		return
	var t := Time.get_ticks_usec()
	_sum[s] += t - _last
	_main_us += t - _last
	_last = t


## A timestamp for add(), or 0 while off.
static func now() -> int:
	return Time.get_ticks_usec() if on else 0


## Charge the time since `t0` (from now()) to `s`, without moving the lap.
static func add(s: int, t0: int) -> void:
	if not on or t0 == 0:
		return
	var d := Time.get_ticks_usec() - t0
	_sum[s] += d
	_main_us += d


## The sim's own step time (`us`, measured on the worker), handed in on the main thread once the
## worker is done; the AI time it stamped comes along with it.
static func worker(us: int) -> void:
	if not on:
		return
	_sum[WORKER] += us
	_sum[AI] += _ai_pending
	_ai_pending = 0


## For TPerf.add("ai", t0) on the worker thread (src/sim/match.ts times the brains this way).
## Only the worker writes this, and the main thread reads it after waiting for the worker.
static func add_ai(t0: int) -> void:
	if t0 == 0:
		return
	_ai_pending += Time.get_ticks_usec() - t0
	_ai_seen = true


## Frame intervals oldest to newest, in ms, into `out`.
static func history(out: PackedFloat32Array) -> PackedFloat32Array:
	out.resize(0)
	for i in HISTORY:
		var v := frames[(_head + i) % HISTORY]
		if v > 0.0:
			out.append(v)
	return out


static func _report(span: int) -> void:
	var r := Report.new()
	var n := maxi(1, _count)
	r.ms.resize(COUNT)
	for s in COUNT:
		r.ms[s] = _sum[s] / 1000.0 / n
	# (the wait is laid apart from the rest of Sim, but shown as part of it)
	r.ms[SIM] += r.ms[SIM_WAIT]
	r.fps = _count * 1e6 / span
	r.frame = span / 1000.0 / n
	r.worst = _worst / 1000.0
	r.cpu = 0.0
	for s in [SIM, BOTS, FX, ARENA, CAMERA, AUDIO, HUD, OTHER, RENDER, PANEL]:
		r.cpu += r.ms[s]
	r.gpu = _gpu_us / 1000.0 / _gpu_n if _gpu_n > 0 else -1.0
	r.ai = _ai_seen
	r.process = _proc_us / 1000.0 / n
	if _stage_n > 0:
		r.stages.resize(G_COUNT)
		for g in G_COUNT:
			r.stages[g] = _stage_ns[g] / 1e6 / _stage_n
	last = r
	_win_start = _start
	_reset_window()
	if on_report.is_valid():
		on_report.call(r)


static func _reset_window() -> void:
	_count = 0
	_worst = 0
	_sum.fill(0)
	_gpu_us = 0
	_gpu_n = 0
	_proc_us = 0
	_stage_ns.fill(0.0)
	_stage_n = 0
