## The player's settings: what they are, where they're kept (user://settings.cfg) and how each one
## reaches the game, live, with no restart. Ported from the web game's settings
## (src/ui/app.ts settings(); the stores in src/audio/sfx.ts, src/render/stage.ts,
## src/render/pacer.ts, src/game/director.ts and src/ui/perfOverlay.ts) and its resolution
## governor (src/render/governor.ts, driven as src/render/stage.ts govern does).
##
## Game: sound, commentary level, camera zoom, the FPS counter.
## Graphics: a quality tier (Auto picks one for the device), the 3D resolution (Auto holds the
## frame rate by moving it, between camera cuts), the frame-rate cap and ray tracing (the web's
## bb.rt: Off, Light on the phone's usual renderer, Heavy on Forward+ after a restart).
##
## The fight sets the targets (sfx, voice, booth, director, hud, env, key, arena, contact_ao, ray) and
## calls load_and_apply() once they exist. Anything left null is skipped, so this also works for
## a screen without a fight. Process mode is the default: the governor rests while the game is
## paused (a paused frame says nothing about the fight's cost).
class_name Settings
extends Node

## Something changed (a pick, or the governor moving the resolution): menus redraw their labels.
signal changed

const PATH := "user://settings.cfg"
## Commentary levels (sfx.ts setCommentary: 1 on, 0.5 quiet, 0 off).
const COMMENTARY := [1.0, 0.5, 0.0]
const ZOOMS := ["close", "normal", "wide"]
const QUALITIES := ["low", "med", "high"]
## Fixed resolutions offered (0 = Auto), as a share of the screen's own pixels.
const RESOLUTIONS := [0.0, 0.5, 0.75, 1.0]
const FPS_CAPS := [0, 60, 30]
const RT_MODES := ["off", "light", "heavy"]
## Where Heavy's renderer is asked for: project.godot's application/config/project_settings_override
## reads this file before the renderer starts, so Forward+ takes over from the next start.
const RENDERER_PATH := "user://renderer.cfg"
## Heavy's own effects, on Forward+ (tuned to the arena's metres: a robot is ~1.2 m tall).
const HEAVY_ENV := {
	"ssao_radius": 0.6, "ssao_intensity": 1.6, "ssao_power": 1.5, "ssao_detail": 0.5,
	"ssao_horizon": 0.06, "ssao_sharpness": 0.98, "ssao_light_affect": 0.25,
	"ssil_radius": 3.0, "ssil_intensity": 1.0, "ssil_sharpness": 0.98, "ssil_normal_rejection": 1.0,
	"ssr_max_steps": 48, "ssr_fade_in": 0.15, "ssr_fade_out": 2.0, "ssr_depth_tolerance": 0.2,
}
## The key spot's size with ray tracing on, for its soft shadows (pcss.ts KEY_SIZE 1.6 m across).
const KEY_SIZE := {"light": 0.8, "heavy": 0.8}

## What each quality tier turns on, for Godot's Mobile renderer (the web's tiers in stage.ts,
## arena.ts, show.ts and ao.ts, translated):
## - msaa: 3D multisampling (cheap on a phone's tiled GPU, so even Low keeps 2x);
## - shadow: the key spot's shadow, its size (the spot gets a whole atlas quadrant, so half the
##   atlas: 1024 on Med, 2048 on High, as stage.ts mapSize) and its filter;
## - glow: the bloom (High also upsamples it bicubically, smoother on the LED and beacons);
## - aniso: texture filtering at grazing angles (the canvas, the crowd's atlas);
## - beams: the haze beams from the truss and the moving heads (arena.ts / show.ts skip them on
##   low: a stack of screen-sized additive layers, the heaviest fill on a phone);
## - ao_map: the contact shadows' floor map (ao.ts MAP_SIZE);
## - res_px: the 3D resolution's ceiling, as the screen's short side in pixels (0: native). The
##   web caps the pixel ratio per tier the same way (1, 1.5, 2 CSS px).
## A reduced 3D resolution is upscaled bilinearly: Godot 4.7 has FSR 1 on Forward+ only (the
## Mobile renderer warns and falls back), so FSR is used only where the game runs on Forward+.
const TIERS := {
	"low": {"msaa": Viewport.MSAA_2X, "shadow": false, "atlas": 2048, "soft": RenderingServer.SHADOW_QUALITY_HARD, "glow": false, "bicubic": false, "aniso": Viewport.ANISOTROPY_2X, "beams": false, "ao_map": 256, "detail": false, "res_px": 720},
	"med": {"msaa": Viewport.MSAA_2X, "shadow": true, "atlas": 2048, "soft": RenderingServer.SHADOW_QUALITY_HARD, "glow": true, "bicubic": false, "aniso": Viewport.ANISOTROPY_4X, "beams": true, "ao_map": 384, "detail": false, "res_px": 900},
	"high": {"msaa": Viewport.MSAA_4X, "shadow": true, "atlas": 4096, "soft": RenderingServer.SHADOW_QUALITY_SOFT_LOW, "glow": true, "bicubic": true, "aniso": Viewport.ANISOTROPY_16X, "beams": true, "ao_map": 512, "detail": true, "res_px": 0},
}

## Where the settings live (a test points this somewhere else, and its renderer file too).
static var path := PATH
static var renderer_path := RENDERER_PATH

var sound := true
var commentary := 1.0
var zoom := "normal"
## The FPS counter (the web's Performance stats). On by default here: the counter shipped
## visible before it had a switch.
var perf_stats := true
## "" = Auto (picked for the device), else low / med / high.
var quality := ""
## 0 = Auto (the governor), else a fixed share of the screen's pixels.
var resolution := 0.0
## 0 = as fast as the screen goes, else 60 or 30 (Display.set_cap).
var fps_cap := 0
## "off", "light" or "heavy" (what the player picked: rt_mode() says what is in force now).
var rt := "off"

var sfx: Sfx
var voice: Voice
var booth: Booth
var director: Director
var hud: FightHud
var env: Environment
var key: Light3D
var arena: Arena
var contact_ao: ContactAO
var ray: RayTrace

var _gov := ResGovernor.new()
## The 3D scale on screen now, and how long a change the governor wants has waited for a cut.
var _applied := 1.0
var _pending := 0.0
var _last_cuts := -1
var _last_mode := ""


## stage.ts detectQuality, for this port: a desktop gets High, a phone Med, and a phone with few
## cores or an entry-level GPU Low (the web goes by core count alone).
static func auto_quality() -> String:
	if not OS.has_feature("mobile"):
		return "high"
	var gpu := RenderingServer.get_video_adapter_name().to_lower()
	for weak in ["adreno (tm) 3", "adreno (tm) 4", "adreno (tm) 5", "adreno (tm) 610", "adreno (tm) 612", "mali-4", "mali-t", "mali-g31", "mali-g51", "mali-g52", "mali-g57", "powervr"]:
		if gpu.contains(weak):
			return "low"
	return "low" if OS.get_processor_count() < 6 else "med"


## The tier in force: the player's pick, or Auto's.
func tier() -> String:
	return quality if quality != "" else auto_quality()


## Read user://settings.cfg (missing or broken: the defaults) and put every setting into effect.
func load_and_apply() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(path) == OK:
		sound = bool(cfg.get_value("game", "sound", sound))
		commentary = _pick(float(cfg.get_value("game", "commentary", commentary)), COMMENTARY, 1.0)
		zoom = str(cfg.get_value("game", "zoom", zoom))
		if not ZOOMS.has(zoom):
			zoom = "normal"
		perf_stats = bool(cfg.get_value("game", "perf_stats", perf_stats))
		quality = str(cfg.get_value("graphics", "quality", ""))
		if not QUALITIES.has(quality):
			quality = ""
		resolution = _pick(float(cfg.get_value("graphics", "resolution", 0.0)), RESOLUTIONS, 0.0)
		fps_cap = int(_pick(float(cfg.get_value("graphics", "fps", 0)), [0.0, 60.0, 30.0], 0.0))
		rt = str(cfg.get_value("graphics", "rt", "off"))
		if not RT_MODES.has(rt):
			rt = "off"
	# (the renderer file follows the setting: boot.gd may have taken Heavy back after a failed start)
	_write_renderer()
	apply_all()


## A saved value, if it is one of the choices (a hand-edited file can't set anything odd).
static func _pick(v: float, choices: Array, fallback: float) -> float:
	for c in choices:
		if absf(float(c) - v) < 0.001:
			return float(c)
	return fallback


func save() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("game", "sound", sound)
	cfg.set_value("game", "commentary", commentary)
	cfg.set_value("game", "zoom", zoom)
	cfg.set_value("game", "perf_stats", perf_stats)
	cfg.set_value("graphics", "quality", quality if quality != "" else "auto")
	cfg.set_value("graphics", "resolution", resolution)
	cfg.set_value("graphics", "fps", fps_cap)
	cfg.set_value("graphics", "rt", rt)
	var err := cfg.save(path)
	if err != OK:
		push_warning("settings: couldn't save %s (%s)" % [path, error_string(err)])


func apply_all() -> void:
	_apply_sound()
	_apply_commentary()
	_apply_zoom()
	_apply_perf()
	_apply_quality()
	_apply_fps()


## The renderer running now: "mobile" (phones, and this project's default), "forward_plus" (Heavy)
## or "gl_compatibility" (a device without Vulkan, and the container's screenshots).
static func renderer() -> String:
	return RenderingServer.get_current_rendering_method()


## The ray tracing in force now: Heavy waits for Forward+ (Light until then).
func rt_mode() -> String:
	if rt == "heavy" and renderer() != "forward_plus":
		return "light"
	return rt


## What the Ray tracing row has to say beyond the pick: "restart" (the renderer changes when the
## app starts again), "unsupported" (Heavy picked, but this device runs neither Vulkan renderer)
## or "".
func rt_note() -> String:
	var r := renderer()
	if rt == "heavy" and r != "forward_plus":
		return "unsupported" if r == "gl_compatibility" else "restart"
	if rt != "heavy" and r == "forward_plus":
		return "restart"
	return ""


## Start the app again (Heavy's renderer only changes at a start). Android restarts the activity.
func restart() -> void:
	save()
	OS.set_restart_on_exit(true)
	get_tree().quit()


# ------------------------------------------------------------------ the picks
## Each applies at once, saves, and tells the menus.

func set_sound(on: bool) -> void:
	sound = on
	_apply_sound()
	_changed()


func set_commentary(v: float) -> void:
	commentary = v
	_apply_commentary()
	_changed()


func set_zoom(z: String) -> void:
	zoom = z
	_apply_zoom()
	_changed()


func set_perf_stats(on: bool) -> void:
	perf_stats = on
	_apply_perf()
	_changed()


## "" for Auto.
func set_quality(q: String) -> void:
	quality = q
	_apply_quality()
	_changed()


## 0 for Auto.
func set_resolution(r: float) -> void:
	resolution = r
	# back to Auto starts from the top again, forgetting levels the governor had ruled out
	# (stage.ts setResScale)
	if r == 0.0:
		_gov.reset(_ceiling())
	_apply_resolution()
	_changed()


func set_fps_cap(c: int) -> void:
	fps_cap = c
	_apply_fps()
	_changed()


func set_rt(m: String) -> void:
	rt = m
	_write_renderer()
	_apply_rt()
	_changed()


func _changed() -> void:
	save()
	changed.emit()


# ------------------------------------------------------------------ applying
func _apply_sound() -> void:
	# (sfx.ts setMuted: the whole mix, commentary included; Sfx.muted mutes the master bus)
	if sfx != null:
		sfx.muted = not sound
	else:
		AudioServer.set_bus_mute(0, not sound)


func _apply_commentary() -> void:
	# sfx.ts setCommentary: the booth stops picking lines at 0, the voice bus takes the level
	if booth != null:
		booth.enabled = commentary > 0.0
	if voice != null:
		voice.set_level(commentary)


func _apply_zoom() -> void:
	if director != null:
		director.zoom = zoom


func _apply_perf() -> void:
	if hud != null:
		hud.show_fps(perf_stats)


func _apply_fps() -> void:
	Display.set_cap(fps_cap)


func _apply_quality() -> void:
	var t: Dictionary = TIERS[tier()]
	var vp := get_viewport() if is_inside_tree() else null
	if vp != null:
		vp.msaa_3d = t.msaa
		vp.anisotropic_filtering_level = t.aniso
		vp.positional_shadow_atlas_size = t.atlas
		# one shadowed light (the key spot): give it a whole quadrant, not a quarter of one
		vp.set_positional_shadow_atlas_quadrant_subdiv(0, Viewport.SHADOW_ATLAS_QUADRANT_SUBDIV_1)
	RenderingServer.positional_soft_shadow_filter_set_quality(t.soft)
	# the robots' fine metal finish (surfaceDetail.ts: the web's high quality only)
	RenderingServer.global_shader_parameter_set("bb_surface_detail", t.detail)
	if key != null:
		# (BB_NOSHADOW: tests that want none)
		key.shadow_enabled = t.shadow and OS.get_environment("BB_NOSHADOW") == ""
	if env != null:
		env.glow_enabled = t.glow and OS.get_environment("BB_NOGLOW") == ""
		RenderingServer.environment_glow_set_use_bicubic_upscale(t.bicubic)
	if arena != null:
		for n in ["beams", "showBeams"]:
			var node := arena.node(n)
			if node != null:
				node.visible = t.beams
	if contact_ao != null:
		contact_ao.set_map_size(t.ao_map)
	# a new tier has a new ceiling: the governor starts again under it
	_gov.reset(_ceiling())
	_apply_resolution()
	# (ray tracing raises the shadows' filter over the tier's)
	_apply_rt()


func _apply_rt() -> void:
	var m := rt_mode()
	if ray != null:
		ray.set_key(key)
		ray.set_mode(m)
	if env != null:
		var heavy := m == "heavy"
		env.ssao_enabled = heavy
		env.ssil_enabled = heavy
		env.ssr_enabled = heavy
		if heavy:
			for k: String in HEAVY_ENV:
				env.set(k, HEAVY_ENV[k])
	if key != null:
		key.light_size = KEY_SIZE.get(m, 0.0)
	if m != "off":
		# soft shadows with a size (PCSS-like): the blocker search needs a filter with taps to spare
		var soft: int = TIERS[tier()].soft
		var want := RenderingServer.SHADOW_QUALITY_SOFT_HIGH if m == "heavy" else RenderingServer.SHADOW_QUALITY_SOFT_MEDIUM
		RenderingServer.positional_soft_shadow_filter_set_quality(maxi(soft, want))


## Heavy asks for Forward+ in the renderer file; anything else takes the file away.
func _write_renderer() -> void:
	if rt == "heavy":
		if FileAccess.file_exists(renderer_path):
			return
		var cfg := ConfigFile.new()
		cfg.set_value("rendering", "renderer/rendering_method", "forward_plus")
		cfg.set_value("rendering", "renderer/rendering_method.mobile", "forward_plus")
		var err := cfg.save(renderer_path)
		if err != OK:
			push_warning("settings: couldn't save %s (%s)" % [renderer_path, error_string(err)])
	elif FileAccess.file_exists(renderer_path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(renderer_path))


## The 3D scale the screen shows: the player's fixed pick, or the governor's.
func _apply_resolution() -> void:
	var s := resolution if resolution > 0.0 else _gov.ratio
	_set_scale(s)
	set_process(resolution == 0.0)
	_pending = 0.0


func _set_scale(s: float) -> void:
	_applied = s
	var vp := get_viewport() if is_inside_tree() else null
	if vp == null:
		return
	vp.scaling_3d_scale = s
	# FSR 1 sharpens what it upsamples, but only Forward+ has it (phones run Mobile: bilinear)
	var fsr := s < 0.99 and RenderingServer.get_current_rendering_method() == "forward_plus"
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if fsr else Viewport.SCALING_3D_MODE_BILINEAR


## The highest scale the tier allows on this screen (1 = native), on the governor's 0.05 grid.
func _ceiling() -> float:
	var px: int = TIERS[tier()].res_px
	if px <= 0 or not is_inside_tree():
		return 1.0
	var win := get_window().size
	var short := mini(win.x, win.y)
	if short <= 0:
		return 1.0
	return clampf(floorf(float(px) / short * 20.0) / 20.0, ResGovernor.MIN, 1.0)


## The 3D scale on screen now (for the Resolution label: "Auto, now 0.8x").
func scale_now() -> float:
	return _applied


## The frame rate to hold: the screen's, or the cap (pacer.ts target).
static func target_fps() -> int:
	var hz := Display.hz()
	return hz if Display.cap <= 0 else mini(hz, Display.cap)


## stage.ts govern: feed the governor this frame; a change it wants waits for a camera cut, where
## nobody sees the picture change sharpness, but a drop goes through after 2.5 s regardless.
func _process(dt: float) -> void:
	var cut := false
	if director != null:
		cut = director.cuts != _last_cuts or director.mode != _last_mode
		_last_cuts = director.cuts
		_last_mode = director.mode
	if _gov.ratio == _applied:
		_pending = 0.0
		_gov.sample(dt, _ceiling(), target_fps())
		if _gov.ratio == _applied:
			return
	_pending += dt
	var dropping := _gov.ratio < _applied
	if cut or (dropping and _pending > 2.5):
		_pending = 0.0
		_set_scale(_gov.ratio)
		changed.emit()


## Adaptive render resolution (src/render/governor.ts ResolutionGovernor): steps the 3D scale down
## while frames are slow and back up when there is headroom, but never climbs back to a level that
## has already proven too slow (so a phone whose cost sits between two levels doesn't flip-flop
## forever under vsync). A frame-rate goal above 60 that can't be held even at the lowest scale
## falls back to 60.
class ResGovernor extends RefCounted:
	const MIN := 0.5
	const STEP := 0.1
	## Frames in the window (governor.ts keeps the last 90), and how often a full window is judged.
	const WINDOW := 90
	const EVERY := 10

	var ratio := 1.0
	var _ceiling := INF
	var _times := PackedFloat32Array()
	var _sorted := PackedFloat32Array()
	var _n := 0
	var _head := 0
	var _since := 0
	var _cooldown := 0.0
	## 1 up, -1 down, 0 neither yet.
	var _last_move := 0
	var _target := 60
	var _goal := 60
	## Ratio when the current goal was set, to go back to if a high goal proves out of reach.
	var _start := 0.0

	func _init() -> void:
		_times.resize(WINDOW)
		_sorted.resize(WINDOW)

	## Start again at `top`, with nothing ruled out.
	func reset(top: float) -> void:
		ratio = top
		_ceiling = INF
		_last_move = 0
		_n = 0
		_start = top

	## Feed one frame time. `device` is the highest useful ratio, `target` the frame rate to hold.
	## Returns true when `ratio` changed.
	func sample(dt: float, device: float, target: int) -> bool:
		if target != _target:
			# a new frame-rate goal: levels ruled out for the old one may be fine now
			_target = target
			_goal = target
			_start = ratio
			_ceiling = INF
			_last_move = 0
			_n = 0
		_times[_head] = dt
		_head = (_head + 1) % WINDOW
		_n = mini(_n + 1, WINDOW)
		_cooldown -= dt
		_since += 1
		# (judged every few frames, not every one: sorting the window costs a little)
		if _cooldown > 0.0 or _n < WINDOW or _since < EVERY:
			return false
		_since = 0
		var avg := _trimmed_mean()
		var slow := avg > 1.0 / (_goal * 0.75)
		if slow and ratio <= MIN + 0.001 and _goal > 60:
			# can't hold the high refresh rate even at the lowest scale: settle for 60, back at the
			# scale we had before chasing it
			_goal = 60
			_ceiling = INF
			ratio = minf(device, maxf(_start, ratio))
			_moved(1, 4.0)
			return true
		if slow and ratio > MIN + 0.001:
			# the level we just climbed back to is still too slow: settle below it for good
			if _last_move == 1:
				_ceiling = ratio - STEP
			ratio = maxf(MIN, snappedf(ratio - STEP, 0.05))
			_moved(-1, 2.0)
			return true
		var top := minf(device, _ceiling)
		if avg < 1.0 / (_goal * 0.967) and ratio < top - 0.001:
			ratio = minf(top, snappedf(ratio + STEP, 0.05))
			_moved(1, 4.0)
			return true
		# (a smaller screen or a lower tier since: come down to it)
		if ratio > device + 0.001:
			ratio = device
			_moved(-1, 2.0)
			return true
		return false

	func _moved(dir: int, cooldown: float) -> void:
		_last_move = dir
		_cooldown = cooldown
		_n = 0

	## Mean frame time ignoring the slowest 10%, so a few hitches (shader compiles) don't drop it.
	func _trimmed_mean() -> float:
		for i in WINDOW:
			_sorted[i] = _times[i]
		_sorted.sort()
		var n := int(WINDOW * 0.9)
		var sum := 0.0
		for i in n:
			sum += _sorted[i]
		return sum / n
