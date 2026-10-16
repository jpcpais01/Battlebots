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
## (viewport_set_measure_render_time), switched on while the profiler is.
class_name Perf
extends RefCounted

## The sections, in the overlay's order. SIM_WAIT is part of SIM (the time the main thread sat
## waiting for the worker); WORKER and AI ran on the worker, in parallel; OTHER is the rest of the
## engine's process time (other nodes' _process, the scene tree itself) and PANEL the overlay's
## own cost, kept apart so it never hides in the others.
enum { SIM, SIM_WAIT, WORKER, AI, BOTS, FX, ARENA, CAMERA, AUDIO, HUD, OTHER, RENDER, PANEL, GPU, COUNT }

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
	if t - _win_start >= int(WINDOW * 1e6):
		_report(t - _win_start)


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
