## The performance overlay (Settings: Performance stats), ported from the web game's
## src/ui/perfOverlay.ts and the fallback measurement in src/render/renderProbe.ts.
##
## A small panel in the top-left corner, under the health bars: FPS and frame time on top with a
## graph of the last few seconds' frames, then two columns. CPU splits the main thread's frame by
## game system (game/perf.gd laps around the fight loop), with the sim's own step time beside it
## (it runs on a worker, in parallel). GPU shows the whole frame's GPU time, live, and what each
## render stage costs, live (shadows, the scene pass, glow, the post chain, the HUD, the AO map:
## the renderer's own stage stamps, game/perf.gd), and what each part of the scene costs, live
## too: the GPU draws a stage's objects in one go, so to split a stage by part, as the web does
## where it has no timer queries, the frame is drawn again off-screen without each part and the
## cost read from the difference (GpuProbe, below), a round every few seconds while the panel is
## open (João: always showing). That extra drawing costs GPU time of its own, which the GPU numbers
## leave out (the frame row times the screen's viewport only, the stage rows skip the probe's
## stamps, each part is a difference inside the probe) but the FPS can't: the button under the
## parts stops it (and starts it again); the choice is kept. Tap the FPS line to fold the panel
## down to it. The text changes twice a second; hidden or folded, it costs nothing.
class_name PerfOverlay
extends Control

## Where the folded state and the live parts' switch are kept (a test points this somewhere else).
static var cfg_path := "user://perf_overlay.cfg"
## Whether the parts are measured live until the player says otherwise (a test turns it off).
static var live_default := true

## perfOverlay.ts graph colours (in budget, up to twice it, over).
const GOOD := Color(0.243, 0.878, 0.561)
const SLOW := Color(1.0, 0.706, 0.227)
const BAD := Color(1.0, 0.247, 0.369)
## style.css .perf: rgba(6, 8, 14, 0.78), a hairline, 6px corners.
const BG := Color(0.024, 0.031, 0.055, 0.78)
const TRACK := Color(1, 1, 1, 0.07)
## Below the health bars (style.css .perf: top 8px + 5.6rem).
const TOP := 84.0
## Layout, in units of the 720-tall canvas: padding, text size, row height, column width and gap.
const PAD := 8.0
const FS := 11
const ROW := 14.0
const COL := 152.0
const GAP := 14.0
## The CPU rows: section, label, indented (perf.ts SECTIONS, plus the worker the web hasn't).
## (* = on the sim's worker thread, beside the frame: not part of the frame's total.)
const CPU_ROWS := [
	[Perf.SIM, "Sim", false],
	[Perf.SIM_WAIT, "wait", true],
	[Perf.WORKER, "worker*", true],
	[Perf.AI, "AI*", true],
	[Perf.BOTS, "Bot anim", false],
	[Perf.FX, "Effects", false],
	[Perf.ARENA, "Arena", false],
	[Perf.CAMERA, "Camera", false],
	[Perf.AUDIO, "Audio", false],
	[Perf.HUD, "HUD", false],
	[Perf.OTHER, "Other", false],
	[Perf.RENDER, "Render CPU", false],
]

## The GPU rows read live: render stage (game/perf.gd G_*), label.
const GPU_STAGES := [
	[Perf.G_SHADOWS, "Shadows"],
	[Perf.G_SCENE, "Scene"],
	[Perf.G_GLOW, "Glow"],
	[Perf.G_POST, "Tonemap/post"],
	[Perf.G_HUD, "HUD (2D)"],
	[Perf.G_AO, "AO map"],
	[Perf.G_OTHER, "Other"],
]

## The fight scene, for Measure (game/fight.gd sets it).
var scene: Node3D

var _compact := false
## The parts measured round after round while the panel is open (the button stops it).
var _live := true
## A live measurement this scene can't run (Measure refused): not tried again until the button.
var _live_refused := false
var _rep: Perf.Report
var _hist := PackedFloat32Array()
var _probe: GpuProbe
var _result: GpuProbe.Result
var _note := ""
var _box := StyleBoxFlat.new()
var _btn_box := StyleBoxFlat.new()
var _font: Font
var _bold: Font
var _toggle := Button.new()
var _measure := Button.new()
var _panel := Rect2()
## Nodes that process before and after every other node, bracketing the engine's _process pass
## for Perf's Other row.
var _edges: Array[Edge] = [Edge.new(true), Edge.new(false)]
## Footer facts, read with each report: the 3D buffer, draw calls, triangles, the adapter.
var _foot := ""
var _foot2 := ""
var _gpu_name := ""


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	# only its two buttons take taps; the rest of the panel lets them through to the fight
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	_box.bg_color = BG
	_box.border_color = UiTheme.LINE
	_box.set_border_width_all(1)
	_box.set_corner_radius_all(6)
	_btn_box.bg_color = Color(1, 1, 1, 0.06)
	_btn_box.border_color = UiTheme.CYAN
	_btn_box.set_border_width_all(1)
	_btn_box.set_corner_radius_all(4)
	var mono := SystemFont.new()
	mono.font_names = PackedStringArray(["Roboto Mono", "Droid Sans Mono", "DejaVu Sans Mono", "Menlo", "Consolas", "monospace"])
	mono.font_weight = 600
	_font = mono
	var bold := SystemFont.new()
	bold.font_names = mono.font_names
	bold.font_weight = 800
	_bold = bold
	for b: Button in [_toggle, _measure]:
		# invisible hit areas at least a finger tall over what _draw paints
		b.flat = true
		b.focus_mode = Control.FOCUS_NONE
		for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
			b.add_theme_stylebox_override(s, StyleBoxEmpty.new())
		b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.button_down.connect(queue_redraw)
		b.button_up.connect(queue_redraw)
		add_child(b)
	for e in _edges:
		add_child(e)
	_toggle.pressed.connect(_on_toggle)
	_measure.pressed.connect(_on_measure)
	resized.connect(_layout)
	_live = live_default
	var cfg := ConfigFile.new()
	if cfg.load(cfg_path) == OK:
		_compact = bool(cfg.get_value("overlay", "compact", false))
		_live = bool(cfg.get_value("overlay", "live", live_default))


func _ready() -> void:
	# (_process only runs while a measurement does, or may start one)
	_sync_process()
	_layout()


func _sync_process() -> void:
	set_process(_probe != null or (visible and _live))


## Show or hide the overlay; the profiler runs only while it shows.
func set_on(on: bool) -> void:
	if not on:
		_stop_probe("")
	visible = on
	for e in _edges:
		e.set_process(on)
	Perf.set_on(on, get_viewport().get_viewport_rid() if is_inside_tree() else RID())
	Perf.on_report = _on_report if on else Callable()
	_rep = null
	_sync_process()
	_gpu_name = _fit("%s · %s" % [RenderingServer.get_video_adapter_name(), _renderer_name()], _font, FS - 1, COL * 2.0 + GAP)
	_layout()
	queue_redraw()


## Fold the panel down to its FPS line, or open it.
func set_compact(c: bool) -> void:
	_compact = c
	_save_cfg()
	_layout()
	queue_redraw()


func _save_cfg() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("overlay", "compact", _compact)
	cfg.set_value("overlay", "live", _live)
	cfg.save(cfg_path)


## Whether the parts are being measured live.
func is_live() -> bool:
	return _probe != null and _probe.live


## Turn the live parts on or off (the button; kept for next time).
func set_live(on: bool) -> void:
	_live = on
	_live_refused = false
	_save_cfg()
	if not on and _probe != null and _probe.live:
		_stop_probe("Live parts stopped.")
	_sync_process()
	queue_redraw()


func _on_measure() -> void:
	set_live(not _live)


## The panel is open on a scene to measure: the live parts may run.
func _want_live() -> bool:
	return _live and not _live_refused and visible and not _compact and scene != null and is_inside_tree() and not get_tree().paused


func is_compact() -> bool:
	return _compact


## Measure what each part of the scene costs on the GPU: once, or round after round (`live`).
func measure(live := false) -> void:
	if _probe != null or scene == null or not is_inside_tree():
		return
	_probe = GpuProbe.new(scene, self, live)
	_note = _probe.refused
	if _note != "":
		_probe = null
		_live_refused = live
	_sync_process()
	_layout()
	queue_redraw()


## Whether a measurement is running.
func measuring() -> bool:
	return _probe != null


## The last finished measurement, or null.
func result() -> GpuProbe.Result:
	return _result


func _on_toggle() -> void:
	set_compact(not _compact)


func _notification(what: int) -> void:
	# a paused or hidden game draws nothing worth timing (and may skip frames): stop measuring
	if what == NOTIFICATION_PAUSED or what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_stop_probe("Stopped: the game paused.")
	elif what == NOTIFICATION_EXIT_TREE:
		_stop_probe("")


func _stop_probe(note: String) -> void:
	if _probe == null:
		return
	_probe.abort()
	_probe = null
	_note = note
	_sync_process()
	_layout()
	queue_redraw()


func _process(_dt: float) -> void:
	var t0 := Perf.now()
	if _probe == null and _want_live():
		measure(true)
	elif _probe != null and _probe.live and not _want_live():
		# folded, hidden or paused: the live parts rest (the last ones stay on show)
		_stop_probe("")
	if _probe != null:
		var p := _probe
		p.step()
		if p.fresh:
			p.fresh = false
			_take_result(p.res)
			_note = ""
		if p.done:
			_probe = null
			if p.res != null:
				_take_result(p.res)
				_note = ""
			else:
				_note = p.refused
				_live_refused = p.live
			_sync_process()
			_layout()
		queue_redraw()
	Perf.add(Perf.PANEL, t0)


## A new measurement on show; live rounds ease into the last ones, so one noisy round doesn't
## make the rows jump.
func _take_result(r: GpuProbe.Result) -> void:
	if _result != null and _result != r and _result.ms.size() == r.ms.size() and is_live():
		for i in r.ms.size():
			if r.ms[i] >= 0.0 and _result.ms[i] >= 0.0:
				r.ms[i] = lerpf(_result.ms[i], r.ms[i], 0.5)
	_result = r


func _on_report(r: Perf.Report) -> void:
	_rep = r
	if not _compact:
		Perf.history(_hist)
		var vp := get_viewport()
		var rid := vp.get_viewport_rid()
		var px := _pixels(vp)
		var s3 := vp.scaling_3d_scale
		var draws := RenderingServer.viewport_get_render_info(rid, RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE, RenderingServer.VIEWPORT_RENDER_INFO_DRAW_CALLS_IN_FRAME)
		var tris := RenderingServer.viewport_get_render_info(rid, RenderingServer.VIEWPORT_RENDER_INFO_TYPE_VISIBLE, RenderingServer.VIEWPORT_RENDER_INFO_PRIMITIVES_IN_FRAME)
		var msaa: int = [1, 2, 4, 8][clampi(vp.msaa_3d, 0, 3)]
		_foot = "%d Hz · aim %d FPS · 3D %d×%d (%.2fx) · MSAA %dx" % [Display.hz(), Settings.target_fps(), roundi(px.x * s3), roundi(px.y * s3), s3, msaa]
		_foot2 = "%d draws · %s tris · this panel %.2f ms" % [draws, ("%dk" % roundi(tris / 1000.0)) if tris >= 1000 else str(tris), r.ms[Perf.PANEL]]
	queue_redraw()


func _layout() -> void:
	if not is_inside_tree():
		return
	var x := FightHud.side_margin(self)
	var w := PAD * 2.0 + COL * 2.0 + GAP
	if _compact:
		w = PAD * 2.0 + _text_w(_bold, "000", 15) + _text_w(_font, " FPS  ▸", FS)
		_panel = Rect2(x, TOP, w, 26.0)
	else:
		_panel = Rect2(x, TOP, w, _body_height())
	# the FPS line folds and opens the panel: a finger-sized strip over it
	_toggle.position = _panel.position
	_toggle.size = Vector2(_panel.size.x, UiTheme.TAP)
	_measure.visible = not _compact
	if not _compact:
		var r := _measure_rect()
		_measure.position = r.position + Vector2(0, (r.size.y - UiTheme.TAP) * 0.5)
		_measure.size = Vector2(r.size.x, UiTheme.TAP)
		_measure.disabled = _probe != null


## How tall the open panel is: the head, the graph, the taller column, the footer.
func _body_height() -> float:
	return _foot_y() - TOP + ROW * 3.0 + PAD


## Where the footer starts: under the CPU column (its rows, a rule, Total and Spare) or the GPU
## column (Measure and two lines of note under it), whichever ends lower.
func _foot_y() -> float:
	var cpu := _cols_top() + ROW * (CPU_ROWS.size() + 3) + 3.0
	var gpu := _measure_rect().end.y + 28.0
	return maxf(cpu, gpu) + 6.0


func _cols_top() -> float:
	# head (FPS line, adapter), then the graph
	return TOP + PAD + 34.0 + 34.0 + 8.0


## The Measure button's face, under the GPU column's rows.
func _measure_rect() -> Rect2:
	var gx := _panel.position.x + PAD + COL + GAP
	var y := _cols_top() + ROW * (GpuProbe.ROWS.size() + GPU_STAGES.size() + 4) + 6.0
	return Rect2(gx, y, COL, 26.0)


func _draw() -> void:
	var t0 := Perf.now()
	_paint()
	Perf.add(Perf.PANEL, t0)


func _paint() -> void:
	if not visible:
		return
	draw_style_box(_box, _panel)
	var r := _rep
	var x := _panel.position.x + PAD
	var y := _panel.position.y
	var budget := 1000.0 / maxf(1.0, Settings.target_fps())
	# the head: FPS (coloured against the frame rate aimed for), frame time and the slowest frame
	var fps := "--" if r == null else str(roundi(r.fps))
	var fc := UiTheme.TEXT if r == null else (GOOD if r.frame <= budget * 1.1 else SLOW if r.frame <= budget * 2.1 else BAD)
	var pressed := _toggle.button_pressed
	var hx := x + _text_w(_bold, "000", 15) - _text_w(_bold, fps, 15)
	draw_string(_bold, Vector2(hx, y + 18.0), fps, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, fc)
	var after := x + _text_w(_bold, "000", 15)
	if _compact:
		draw_string(_font, Vector2(after, y + 17.0), " FPS  ▸", HORIZONTAL_ALIGNMENT_LEFT, -1, FS, UiTheme.TEXT_2 if not pressed else UiTheme.TEXT)
		return
	draw_string(_font, Vector2(after, y + 17.0), " FPS", HORIZONTAL_ALIGNMENT_LEFT, -1, FS, UiTheme.TEXT)
	if r != null:
		var s := "%.1f ms · max %d" % [r.frame, roundi(r.worst)]
		draw_string(_font, Vector2(after + _text_w(_font, " FPS  ", FS), y + 17.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, FS, UiTheme.MUTED)
	draw_string(_font, Vector2(_panel.end.x - PAD - _text_w(_font, "▾", FS), y + 17.0), "▾", HORIZONTAL_ALIGNMENT_LEFT, -1, FS, UiTheme.TEXT_2 if not pressed else UiTheme.TEXT)
	draw_string(_font, Vector2(x, y + 33.0), _gpu_name, HORIZONTAL_ALIGNMENT_LEFT, _panel.size.x - PAD * 2.0, FS - 1, UiTheme.MUTED)
	_graph(Rect2(x, y + PAD + 34.0, _panel.size.x - PAD * 2.0, 32.0), budget)
	var cy := _cols_top()
	_cpu_column(Vector2(x, cy), r, budget)
	_gpu_column(Vector2(x + COL + GAP, cy), r, budget)
	# the footer, across both columns
	var fy := _foot_y()
	draw_line(Vector2(x, fy - 4.0), Vector2(_panel.end.x - PAD, fy - 4.0), UiTheme.LINE, 1.0)
	var fw := _panel.size.x - PAD * 2.0
	draw_string(_font, Vector2(x, fy + 10.0), _foot, HORIZONTAL_ALIGNMENT_LEFT, fw, FS - 1, UiTheme.MUTED)
	draw_string(_font, Vector2(x, fy + 10.0 + ROW), _foot2, HORIZONTAL_ALIGNMENT_LEFT, fw, FS - 1, UiTheme.MUTED)
	draw_string(_font, Vector2(x, fy + 10.0 + ROW * 2.0), "* on the sim's thread, beside the frame", HORIZONTAL_ALIGNMENT_LEFT, fw, FS - 1, UiTheme.MUTED)


func _cpu_column(at: Vector2, r: Perf.Report, budget: float) -> void:
	var y := at.y
	_head_row(at.x, y, "CPU")
	y += ROW
	for row in CPU_ROWS:
		var s: int = row[0]
		var ms := -1.0
		if r != null:
			ms = r.ms[s]
			if s == Perf.OTHER:
				# (the overlay's own cost is in here; the footer says how much)
				ms += r.ms[Perf.PANEL]
			if s == Perf.AI and not r.ai:
				# runtime/perf.gd doesn't hand the AI's time over (yet): say so, don't show 0
				ms = -2.0
		_row(at.x, y, row[1], ms, row[2], budget)
		y += ROW
	draw_line(Vector2(at.x, y + 1.0), Vector2(at.x + COL, y + 1.0), UiTheme.LINE, 1.0)
	y += 3.0
	_row(at.x, y, "Total", -1.0 if r == null else r.cpu, false, budget, true)
	y += ROW
	_row(at.x, y, "Spare", -1.0 if r == null else maxf(0.0, r.frame - r.cpu), false, budget)


func _gpu_column(at: Vector2, r: Perf.Report, budget: float) -> void:
	var y := at.y
	_head_row(at.x, y, "GPU")
	y += ROW
	var total := -1.0 if r == null else (r.gpu if r.gpu >= 0.0 else -2.0)
	_row(at.x, y, "Frame", total, false, budget, true)
	y += ROW
	# the frame by render stage, live
	draw_string(_font, Vector2(at.x, y + 11.0), "by stage, live", HORIZONTAL_ALIGNMENT_LEFT, COL, FS - 1, UiTheme.MUTED)
	y += ROW
	for st in GPU_STAGES:
		var ms := -1.0
		if r != null:
			ms = r.stages[st[0]] if r.stages.size() > 0 else -2.0
		_row(at.x, y, st[1], ms, false, budget)
		y += ROW
	# what the measuring found, part by part (or dashes until it has run)
	var res := _result
	var label := "by part" if res == null else ("by part, %ds ago" % roundi((Time.get_ticks_msec() - res.at) / 1000.0))
	if is_live():
		label = "by part, live"
	draw_string(_font, Vector2(at.x, y + 11.0), label, HORIZONTAL_ALIGNMENT_LEFT, COL, FS - 1, UiTheme.MUTED)
	y += ROW
	for i in GpuProbe.ROWS.size():
		var ms := -1.0
		if res != null:
			ms = res.ms[i]
		_row(at.x, y, GpuProbe.ROWS[i], ms, false, budget)
		y += ROW
	var b := _measure_rect()
	var bb := _btn_box
	if _measure.button_pressed:
		bb = _btn_box.duplicate()
		bb.bg_color = Color(1, 1, 1, 0.16)
	draw_style_box(bb, b)
	var text := "Measure live"
	var col := UiTheme.TEXT
	if is_live():
		text = "Live · tap to stop" if res != null else "Measuring… %d%%" % roundi(_probe.progress() * 100.0)
	elif _probe != null:
		text = "Measuring… %d%%" % roundi(_probe.progress() * 100.0)
		col = UiTheme.MUTED
	draw_string(_font, Vector2(b.position.x, b.position.y + 17.0), text, HORIZONTAL_ALIGNMENT_CENTER, b.size.x, FS, col)
	var note := _note
	if note == "" and is_live():
		note = ("Probe ~%.1f ms GPU, not counted above" % res.full) if res != null else "Redraws without each part"
	elif note == "" and res != null:
		note = "full redraw %.2f ms" % res.full
	elif note == "" and r != null and r.gpu < 0.0:
		note = "No GPU timer here."
	elif note == "" and res == null and _probe == null:
		note = "Redraws without each part"
	draw_multiline_string(_font, Vector2(at.x, b.end.y + 13.0), note, HORIZONTAL_ALIGNMENT_LEFT, COL, FS - 1, 2, UiTheme.MUTED)


func _head_row(x: float, y: float, title: String) -> void:
	draw_string(_bold, Vector2(x, y + 11.0), title, HORIZONTAL_ALIGNMENT_LEFT, -1, FS, UiTheme.TEXT_2)
	draw_string(_font, Vector2(x, y + 11.0), "ms", HORIZONTAL_ALIGNMENT_RIGHT, COL - 46.0, FS - 1, UiTheme.MUTED)


## One row: label, ms (right-aligned; -1 shows a dash, -2 "n/a") and a bar against the budget.
func _row(x: float, y: float, label: String, ms: float, sub: bool, budget: float, strong := false) -> void:
	var lc := UiTheme.MUTED if sub else (UiTheme.TEXT if strong else UiTheme.TEXT_2)
	draw_string(_bold if strong else _font, Vector2(x + (9.0 if sub else 0.0), y + 11.0), label, HORIZONTAL_ALIGNMENT_LEFT, COL - 50.0, FS, lc)
	if ms >= 0.0:
		_num(x + COL - 46.0, y + 11.0, "%.1f" % ms if ms >= 10.0 else "%.2f" % ms, _bold if strong else _font, UiTheme.TEXT)
	else:
		draw_string(_font, Vector2(x, y + 11.0), "–" if ms == -1.0 else "n/a", HORIZONTAL_ALIGNMENT_RIGHT, COL - 46.0, FS, UiTheme.MUTED)
	# perfOverlay.ts .perf-bar: the share of the frame's budget, cyan (muted for nested rows)
	var track := Rect2(x + COL - 40.0, y + 5.0, 40.0, 4.0)
	draw_rect(track, TRACK)
	if ms > 0.0:
		var f := track
		f.size.x *= minf(1.0, ms / budget)
		draw_rect(f, UiTheme.MUTED if sub else UiTheme.CYAN)


## perfOverlay.ts drawGraph: every frame of the last few seconds, lines at the budget and twice it.
func _graph(r: Rect2, budget: float) -> void:
	draw_rect(r, Color(1, 1, 1, 0.04))
	var top := budget * 3.0
	var n := Perf.HISTORY
	var bw := r.size.x / n
	var pts := PackedVector2Array()
	var cols := PackedColorArray()
	var k0 := n - _hist.size()
	for i in _hist.size():
		var ms := _hist[i]
		var bx := r.position.x + (k0 + i + 0.5) * bw
		var h := minf(ms, top) / top * r.size.y
		pts.append(Vector2(bx, r.end.y))
		pts.append(Vector2(bx, r.end.y - h))
		var c := GOOD if ms <= budget * 1.1 else SLOW if ms <= budget * 2.1 else BAD
		cols.append(c)
	if pts.size() > 0:
		draw_multiline_colors(pts, cols, maxf(1.0, bw))
	for k in [1.0, 2.0]:
		var ly := roundf(r.end.y - k / 3.0 * r.size.y)
		draw_line(Vector2(r.position.x, ly), Vector2(r.end.x, ly), Color(1, 1, 1, 0.35), 1.0)


## A number right-aligned at `right`, glyph by glyph: the digits change with every report, and
## shaping a new string each time costs twice as much as placing its glyphs (monospaced, so one
## advance fits them all).
func _num(right: float, y: float, s: String, f: Font, c: Color) -> void:
	var adv := f.get_char_size(48, FS).x
	var x := right - adv * s.length()
	for i in s.length():
		draw_char(f, Vector2(x + adv * i, y), s[i], FS, c)


## `s`, cut short with an ellipsis to fit `w`.
static func _fit(s: String, f: Font, fs: int, w: float) -> String:
	if f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x <= w:
		return s
	var n := s.length()
	while n > 1 and f.get_string_size(s.left(n) + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w:
		n -= 1
	return s.left(n).strip_edges() + "…"


func _text_w(f: Font, s: String, fs: int) -> float:
	return f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x


## A viewport's size in device pixels (the root window's, or a SubViewport's).
static func _pixels(vp: Viewport) -> Vector2i:
	if vp is Window:
		return (vp as Window).size
	if vp is SubViewport:
		return (vp as SubViewport).size
	return Vector2i(vp.get_visible_rect().size)


static func _renderer_name() -> String:
	match RenderingServer.get_current_rendering_method():
		"mobile":
			return "Mobile (%s)" % RenderingServer.get_current_rendering_driver_name().capitalize()
		"forward_plus":
			return "Forward+ (%s)" % RenderingServer.get_current_rendering_driver_name().capitalize()
		"gl_compatibility":
			return "Compatibility (%s)" % RenderingServer.get_current_rendering_driver_name()
	return RenderingServer.get_current_rendering_method()


## Marks the start (first) or the end of the engine's pass over every node's _process.
class Edge extends Node:
	var _first := false

	func _init(first: bool) -> void:
		_first = first
		name = "PerfFirst" if first else "PerfLast"
		process_priority = -1000000 if first else 1000000

	func _ready() -> void:
		set_process(Perf.on)

	func _process(_dt: float) -> void:
		if _first:
			Perf.process_begin()
		else:
			Perf.process_end()


## GPU time per part of the scene (renderProbe.ts measure/round/finish, for Godot). The scene is
## drawn again from the fight's camera into an offscreen SubViewport that shares its world and
## copies its size, 3D scale, MSAA, shadow atlas and environment, while each part's meshes sit on
## a visual layer of their own: once in full, once without the shadows, once without the glow,
## then once without each part (on that base). The viewport's measured GPU time for each version,
## median of a few rounds interleaved so camera moves hit them all alike, gives each part as the
## difference, and Other as what is left of the base. Measured times come back a few frames late
## (the GPU's timestamps are read once it is done), so the probe first works out how late.
##
## The fight's own view doesn't change: the meshes move to layers its camera, every light's cull
## mask and every light's shadow casters already include (checked first, or Measure refuses), and
## when it is done every mesh gets its own layers back and the viewport is freed.
class GpuProbe extends RefCounted:
	## The ring is told apart piece by piece (its canvas, ropes and glow strips, truss, corner
	## lifts, and the rest: apron, posts, steps), so a costly ring says which piece costs.
	enum { BOTS, CROWD, VENUE, RING, CANVAS, ROPES, TRUSS, LIFTS, SHOW, FX, RT, PARTS }
	## Row labels: the parts, then what the other versions isolate.
	## ("Empty frame": the frame with every part gone, what clearing, resolving and the post
	## chain cost on their own; "Other": what the parts cost together beyond their sum)
	const ROWS := ["Bots", "Crowd", "Venue", "Ring (rest)", "Canvas", "Ropes, glow", "Truss", "Lifts", "Light show", "Effects", "Ray tracing", "Shadows", "Glow/post", "Empty frame", "Other"]
	const SHADOWS := PARTS
	const GLOW := PARTS + 1
	const EMPTY := PARTS + 2
	const OTHER := PARTS + 3
	## Visual layer bits the parts move to (layers 10 to 20: nothing else here uses them).
	const BIT0 := 9
	## Layers only lights look at (the follow spots': FollowSpots.LAYER): a mesh moved to its
	## part's layer keeps them, so it stays lit as it was, and the probe's camera ignores them.
	const LIGHT_ONLY := FollowSpots.LAYER
	## The versions drawn: full, without shadows, without glow, then without each part.
	const V_FULL := 0
	const V_NO_SHADOW := 1
	const V_NO_GLOW := 2
	const V_PART := 3
	## (and with every part gone)
	const V_EMPTY := V_PART + PARTS
	## Rounds of every version, frames kept per version and round (after one thrown away at each
	## switch), and the most frames the GPU's timing may lag. Live measuring runs shorter rounds,
	## over and over.
	static var rounds := 3
	static var take := 3
	const LIVE_ROUNDS := 2
	const LIVE_TAKE := 2
	## Live rounds rest this long between them, drawing nothing extra (ms).
	const LIVE_REST_MS := 6000
	const MAX_LAG := 12
	## How late measured times arrive here, once worked out (per renderer, so kept).
	static var _lag := -1

	## A finished measurement: ms per row of ROWS (-1: not measured here, -2: that part is off).
	class Result extends RefCounted:
		var ms := PackedFloat64Array()
		## The full offscreen frame, ms.
		var full := 0.0
		## Time.get_ticks_msec() when it finished.
		var at := 0
		## Samples per version, for checks.
		var samples := {}

	var done := false
	var res: Result
	## Measuring round after round: `res` is replaced each time and `fresh` set, never done.
	var live := false
	var fresh := false
	var _rounds := 3
	var _take := 3
	## Why Measure can't run here (empty when it can).
	var refused := ""

	var _scene: Node3D
	var _host: Node
	var _main_vp: Viewport
	var _main_cam: Camera3D
	var _vp: SubViewport
	var _cam: Camera3D
	var _env_noglow: Environment
	var _atlas := 0
	var _shadows := false
	var _glow := false
	var _all_bits := 0
	var _full_mask := 0
	## Original layers of every mesh moved, by instance id.
	var _orig := {}
	var _count := PackedInt32Array()
	## arena nodes that start a part, by instance id.
	var _named := {}
	## The plan: the version drawn on each frame and whether its time is kept.
	var _plan := PackedInt32Array()
	var _keep := PackedByteArray()
	var _samples := {}
	var _frame := 0
	var _plan_start := -1
	var _cal := 0
	var _full_n := 0
	var _full_ref := 0.0
	var _switch_at := -1
	## When a live round's rest ends (Time.get_ticks_msec), or 0 while measuring.
	var _rest_until := 0

	func _init(scene: Node3D, host: Node, live_ := false) -> void:
		_scene = scene
		_host = host
		live = live_
		_rounds = LIVE_ROUNDS if live else rounds
		_take = LIVE_TAKE if live else take
		_count.resize(PARTS)
		_main_vp = scene.get_viewport()
		_main_cam = _main_vp.get_camera_3d()
		if _main_cam == null:
			refused = "No camera to measure from."
			return
		for p in PARTS:
			_all_bits |= 1 << (BIT0 + p)
		refused = _check_masks()
		if refused != "":
			return
		_full_mask = _main_cam.cull_mask & ~LIGHT_ONLY
		_index_arena()
		_build()

	## 0..1, for the button.
	func progress() -> float:
		if _plan.is_empty() or _plan_start < 0:
			return 0.0
		return clampf(float(_frame - _plan_start) / (_plan.size() + maxi(_lag, 0)), 0.0, 1.0)

	## Stop now and put everything back.
	func abort() -> void:
		_restore()
		done = true

	## The meshes may move to the part layers only if nothing that sees them sorts by layer: the
	## fight's camera, every light (what it lights, what casts its shadow), reflection probes and
	## decals must all already include every part layer.
	func _check_masks() -> String:
		if (_main_cam.cull_mask & _all_bits) != _all_bits:
			return "The camera hides layers 10-20."
		for n in _scene.find_children("*", "Node3D", true, false):
			if n is Light3D:
				var l := n as Light3D
				# (a light of the light-only layers lights the meshes moved just as before)
				if (l.light_cull_mask & ~LIGHT_ONLY) == 0 and not l.shadow_enabled:
					continue
				if (l.light_cull_mask & _all_bits) != _all_bits or (l.shadow_caster_mask & _all_bits) != _all_bits:
					return "Light %s skips layers 10-20." % l.name
			elif n is ReflectionProbe or n is Decal:
				if (int(n.get("cull_mask")) & _all_bits) != _all_bits:
					return "%s skips layers 10-20." % n.name
		return ""

	## The arena's own groups (its baked scene names them).
	func _index_arena() -> void:
		var arena = _scene.get("arena")
		if arena == null or arena.get("scene") == null:
			return
		var named: Dictionary = arena.scene.named
		for k in [["venue", VENUE], ["crowd", CROWD], ["show", SHOW], ["beams", SHOW], ["corner0_beam", SHOW], ["corner1_beam", SHOW], ["corner0_column", SHOW], ["corner1_column", SHOW], ["ropes", ROPES], ["ringGlow", ROPES], ["skirt", ROPES], ["truss", TRUSS], ["corner0", LIFTS], ["corner1", LIFTS], ["corner0_sleeve", LIFTS], ["corner1_sleeve", LIFTS]]:
			var n: Node = named.get(k[0])
			if n != null:
				_named[n.get_instance_id()] = k[1]
		# the canvas: the ring's first mesh (Arena._init)
		var ring: Node = named.get("arena")
		if ring != null and ring.get_child_count() > 0 and ring.get_child(0) is MeshInstance3D:
			_named[ring.get_child(0).get_instance_id()] = CANVAS

	func _build() -> void:
		var world := _scene.get_world_3d()
		_vp = SubViewport.new()
		_vp.name = "PerfProbe"
		_vp.world_3d = world
		_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		_match_viewport()
		_atlas = _main_vp.positional_shadow_atlas_size
		_cam = Camera3D.new()
		_vp.add_child(_cam)
		_host.add_child(_vp)
		_cam.current = true
		_copy_camera()
		RenderingServer.viewport_set_measure_render_time(_vp.get_viewport_rid(), true)
		# (the stage rows are the game's frame: this redraw stays out of them)
		Perf.skip_vp(_vp.get_viewport_rid())
		# shadows and glow: measured only where the fight has them on
		for l in _scene.find_children("*", "Light3D", true, false):
			if (l as Light3D).shadow_enabled and (l as Light3D).is_visible_in_tree() and not l is DirectionalLight3D:
				_shadows = _atlas > 0
		var env: Environment = _main_cam.environment
		if env == null:
			env = world.environment if world.environment != null else world.fallback_environment
		_glow = env != null and env.glow_enabled
		if _glow:
			_env_noglow = env.duplicate()
			_env_noglow.glow_enabled = false
		_assign_all()

	## The offscreen view matches what the screen renders: size, 3D scale, MSAA and the rest.
	func _match_viewport() -> void:
		var m := _main_vp
		var px := PerfOverlay._pixels(m)
		if _vp.size != px:
			_vp.size = px
		for p in ["msaa_3d", "screen_space_aa", "use_taa", "use_debanding", "scaling_3d_mode", "scaling_3d_scale", "fsr_sharpness", "texture_mipmap_bias", "anisotropic_filtering_level", "mesh_lod_threshold", "use_occlusion_culling", "positional_shadow_atlas_16_bits", "transparent_bg"]:
			# (only when it differs: some of these reallocate the render buffers)
			if _vp.get(p) != m.get(p):
				_vp.set(p, m.get(p))
		for q in 4:
			if _vp.get_positional_shadow_atlas_quadrant_subdiv(q) != m.get_positional_shadow_atlas_quadrant_subdiv(q):
				_vp.set_positional_shadow_atlas_quadrant_subdiv(q, m.get_positional_shadow_atlas_quadrant_subdiv(q))

	func _copy_camera() -> void:
		var c := _main_cam
		_cam.global_transform = c.global_transform
		_cam.projection = c.projection
		_cam.fov = c.fov
		_cam.size = c.size
		_cam.near = c.near
		_cam.far = c.far
		_cam.keep_aspect = c.keep_aspect
		_cam.h_offset = c.h_offset
		_cam.v_offset = c.v_offset
		_cam.frustum_offset = c.frustum_offset
		_cam.attributes = c.attributes

	## Every mesh of the scene onto its part's layer (again each round: torn-off parts change
	## hands, a new fight brings new robots).
	func _assign_all() -> void:
		_count.fill(0)
		_assign(_scene, -1)

	func _assign(n: Node, part: int) -> void:
		var p := part
		if n is BotModel:
			p = BOTS
		elif n is FightFx or n is Drones or n is Referee:
			p = FX
		elif n is Arena:
			p = RING
		elif n is OutdoorVenue or n is TitanVenue:
			# (an event's own venue hangs under the arena, round the same ring)
			p = VENUE
		elif n is RayTrace:
			# (with ray tracing off it draws nothing: no row)
			p = RT if (n as RayTrace).visible else -1
		var id := n.get_instance_id()
		if _named.has(id):
			p = _named[id]
		if p >= 0 and n is GeometryInstance3D:
			var g := n as GeometryInstance3D
			# (something the camera doesn't show stays as it is)
			if _orig.has(id) or (g.layers & _full_mask) != 0:
				if not _orig.has(id):
					_orig[id] = g.layers
				g.layers = (1 << (BIT0 + p)) | (int(_orig[id]) & LIGHT_ONLY)
				_count[p] += 1
		for c in n.get_children():
			# (other viewports are other pictures: the scoreboard's, this probe's own)
			if not c is Viewport:
				_assign(c, p)

	func _restore() -> void:
		for id in _orig:
			if is_instance_id_valid(id):
				var g := instance_from_id(id) as GeometryInstance3D
				if g != null:
					g.layers = _orig[id]
		_orig.clear()
		if _vp != null:
			RenderingServer.viewport_set_measure_render_time(_vp.get_viewport_rid(), false)
			Perf.skip_vp(RID())
			_vp.queue_free()
			_vp = null
			_cam = null

	## The versions this scene has, in drawing order.
	func _versions() -> PackedInt32Array:
		var vs := PackedInt32Array([V_FULL])
		if _shadows:
			vs.append(V_NO_SHADOW)
		if _glow:
			vs.append(V_NO_GLOW)
		for p in PARTS:
			if _count[p] > 0:
				vs.append(V_PART + p)
		vs.append(V_EMPTY)
		return vs

	func _make_plan() -> void:
		var vs := _versions()
		for r in _rounds:
			for v in vs:
				for k in _take + 1:
					_plan.append(v)
					# (the first frame after a switch is thrown away: a buffer may be reallocating)
					_keep.append(1 if k > 0 else 0)
		for v in vs:
			_samples[v] = []

	## Draw `v` this frame.
	func _apply(v: int) -> void:
		var shadows := v == V_FULL
		var glow := v == V_FULL or v == V_NO_SHADOW
		var atlas := _atlas if shadows else 0
		if _vp.positional_shadow_atlas_size != atlas:
			_vp.positional_shadow_atlas_size = atlas
		var env: Environment = null if glow or not _glow else _env_noglow
		if _cam.environment != env:
			_cam.environment = env
		if v == V_EMPTY:
			_cam.cull_mask = _full_mask & ~_all_bits
		else:
			_cam.cull_mask = (_full_mask & ~(1 << (BIT0 + v - V_PART))) if v >= V_PART else _full_mask

	## Once a frame, after the fight has moved its camera.
	func step() -> void:
		if done or _vp == null:
			return
		if _rest_until > 0:
			if Time.get_ticks_msec() < _rest_until:
				return
			_rest_until = 0
			_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
			_make_plan()
			_plan_start = _frame + 1
		_copy_camera()
		var gpu := RenderingServer.viewport_get_measured_render_time_gpu(_vp.get_viewport_rid())
		if _plan_start < 0:
			_calibrate(gpu)
			_frame += 1
			return
		# this frame's reading is the frame drawn `_lag` frames ago
		var j := _frame - _lag - _plan_start
		if j >= 0 and j < _plan.size() and _keep[j] and gpu > 0.0:
			(_samples[_plan[j]] as Array).append(gpu)
		var k := _frame - _plan_start
		if k < _plan.size():
			if k % (_take + 1) == 0:
				if k % (_versions_count() * (_take + 1)) == 0:
					# a new round: the screen's size or 3D scale may have moved, parts changed hands
					_match_viewport()
					_assign_all()
				_apply(_plan[k])
		else:
			# everything after the last planned frame is wasted: draw nothing much
			_cam.cull_mask = 0
		if j >= _plan.size() - 1:
			_finish()
		_frame += 1

	func _versions_count() -> int:
		return maxi(1, _samples.size())

	## How late do measured times arrive? Draw everything until a time comes back, then nothing
	## at all, and count the frames until the time drops (renderers differ: 6 frames on the
	## container's OpenGL, about 3 on Vulkan).
	func _calibrate(gpu: float) -> void:
		if _lag >= 0 and _cal == 0:
			# known from an earlier measurement
			_start_plan()
			return
		_cal += 1
		if _switch_at < 0:
			_apply(V_FULL)
			if gpu > 0.0:
				# (the smallest of three: the first frames may carry one-off costs)
				_full_ref = minf(_full_ref, gpu) if _full_n > 0 else gpu
				_full_n += 1
				if _full_n >= 3:
					_cam.cull_mask = 0
					_switch_at = _frame
			elif _cal > MAX_LAG + 4:
				refused = "No GPU timer on this renderer."
				_restore()
				done = true
			return
		if gpu > 0.0 and gpu < _full_ref * 0.6:
			_lag = _frame - _switch_at
			_start_plan()
		elif _frame - _switch_at > MAX_LAG:
			refused = "GPU times didn't settle; try again."
			_restore()
			done = true

	func _start_plan() -> void:
		_make_plan()
		_plan_start = _frame
		_apply(_plan[0])

	func _finish() -> void:
		var r := Result.new()
		r.ms.resize(ROWS.size())
		r.ms.fill(-1.0)
		var med := func(v: int) -> float:
			var s: Array = _samples.get(v, [])
			if s.is_empty():
				return -1.0
			s.sort()
			return s[s.size() >> 1]
		var full: float = med.call(V_FULL)
		var no_shadow: float = med.call(V_NO_SHADOW) if _shadows else full
		var base: float = med.call(V_NO_GLOW) if _glow else no_shadow
		r.full = full
		r.ms[SHADOWS] = maxf(0.0, full - no_shadow) if _shadows else -2.0
		r.ms[GLOW] = maxf(0.0, no_shadow - base) if _glow else -2.0
		var parts := 0.0
		for p in PARTS:
			var without: float = med.call(V_PART + p)
			if without < 0.0:
				continue
			r.ms[p] = maxf(0.0, base - without)
			parts += r.ms[p]
		var empty: float = med.call(V_EMPTY)
		r.ms[EMPTY] = maxf(0.0, empty)
		r.ms[OTHER] = maxf(0.0, base - parts - maxf(0.0, empty))
		r.at = Time.get_ticks_msec()
		r.samples = _samples
		res = r
		if live:
			# the next round after a rest, on the same viewport: drawn round after round with no
			# break, the probe drew the whole scene a second time on every frame the panel was
			# open, which nearly halved the frame rate it was there to show
			fresh = true
			_samples = {}
			_plan = PackedInt32Array()
			_keep = PackedByteArray()
			_cam.cull_mask = 0
			_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
			_rest_until = Time.get_ticks_msec() + LIVE_REST_MS
			return
		_restore()
		done = true
