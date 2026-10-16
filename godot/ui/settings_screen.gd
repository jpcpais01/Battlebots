## The Settings card (src/ui/app.ts settings(), style.css .box.settings, .set-grid, .set-col,
## .set-row, .seg.fit): a heading with a close button over two columns, Game and Graphics, each a
## list of rows with what the setting is on the left and its choices on the right. Every row
## re-reads the live state after any change, so the lit choice and the labels ("Auto, now 0.8x")
## always say what is really in force.
class_name SettingsScreen
extends PanelContainer

## The close button (or a tap on the dimmed scene round the card).
signal closed

## Two columns at least this wide side by side, else one above the other (.set-grid minmax 20em).
const COL_MIN := 320.0
const GAP := 11.0
## .box.settings width: min(50em, 100%).
const WIDTH := 800.0

var settings: Settings
## Plays a menu blip (PauseMenu's): the web's tap() on every pick.
var blip: Callable = func(_kind: String) -> void: pass

var _rows: Array[SegRow] = []
var _grid := GridContainer.new()
var _scroll := ScrollContainer.new()
var _head := HBoxContainer.new()
## Height the grid may take before it scrolls.
var _room := 600.0


func _init(s: Settings) -> void:
	settings = s
	theme_type_variation = &"Box"
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(GAP))
	add_child(v)
	# .set-head: the heading and a round close button
	var h2 := Label.new()
	h2.text = "Settings"
	h2.theme_type_variation = &"H2"
	h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_head.add_child(h2)
	var x := UiTheme.icon_button("close", UiTheme.TAP)
	x.pressed.connect(func() -> void: closed.emit())
	_head.add_child(x)
	v.add_child(_head)
	# .set-grid, scrolling inside the card if a short screen can't hold it
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_scroll.add_child(_grid)
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override(&"h_separation", int(GAP))
	_grid.add_theme_constant_override(&"v_separation", int(GAP))
	v.add_child(_scroll)
	_grid.minimum_size_changed.connect(_fit_scroll)
	_build()
	settings.changed.connect(refresh)


func _build() -> void:
	# Game feel: sound, commentary, camera, stats
	var game := _col("Game")
	for k in ["sound", "commentary", "zoom", "perf"]:
		_row(game, k)
	# Graphics: quality, resolution, frame rate
	var gfx := _col("Graphics")
	for k in ["quality", "resolution", "fps"]:
		_row(gfx, k)


## A row's label: [what it is, its quieter second line or ""].
func _label_for(k: String) -> Array:
	var s := settings
	match k:
		"sound":
			return ["Sound", ""]
		"commentary":
			return ["Commentary", ""]
		"zoom":
			return ["Camera zoom", ""]
		"perf":
			return ["Performance stats", "Frame-rate counter"]
		"quality":
			return ["Quality", "Auto picked %s" % _q_name(Settings.auto_quality()) if s.quality == "" else ""]
		"resolution":
			var now := s.scale_now()
			var sub := ("Auto, now %sx" % _num(now)) if s.resolution == 0.0 else ("Native" if now >= 0.999 else "%sx" % _num(now))
			var px := _pixels(now)
			return ["Resolution", sub + " · " + px if px != "" else sub]
		"fps":
			return ["Frame rate", "Screen %d Hz" % Display.hz()]
	return [k, ""]


## A row's choices: [text, lit, what picking it does] each, read from the live settings.
func _opts_for(k: String) -> Array:
	var s := settings
	var out := []
	match k:
		"sound":
			out = [["On", s.sound, s.set_sound.bind(true)], ["Off", not s.sound, s.set_sound.bind(false)]]
		"commentary":
			for o in [["On", 1.0], ["Quiet", 0.5], ["Off", 0.0]]:
				out.append([o[0], is_equal_approx(s.commentary, o[1]), s.set_commentary.bind(o[1])])
		"zoom":
			for z: String in Settings.ZOOMS:
				out.append([z.capitalize(), s.zoom == z, s.set_zoom.bind(z)])
		"perf":
			out = [["On", s.perf_stats, s.set_perf_stats.bind(true)], ["Off", not s.perf_stats, s.set_perf_stats.bind(false)]]
		"quality":
			out.append(["Auto", s.quality == "", s.set_quality.bind("")])
			for q: String in Settings.QUALITIES:
				out.append(["Med" if q == "med" else _q_name(q), s.quality == q, s.set_quality.bind(q)])
		"resolution":
			for r: float in Settings.RESOLUTIONS:
				var text := "Auto" if r == 0.0 else ("Native" if r >= 0.999 else "%sx" % _num(r))
				out.append([text, is_equal_approx(s.resolution, r), s.set_resolution.bind(r)])
		"fps":
			for c: int in Settings.FPS_CAPS:
				out.append(["Max %d" % Display.hz() if c == 0 else str(c), s.fps_cap == c, s.set_fps_cap.bind(c)])
	return out


static func _q_name(q: String) -> String:
	return "Medium" if q == "med" else q.capitalize()


## 0.75 -> "0.75", 0.8 -> "0.8", 1 -> "1".
static func _num(v: float) -> String:
	var t := "%.2f" % v
	return t.rstrip("0").rstrip(".")


## The 3D picture's size in pixels at scale `k` ("1920×864").
func _pixels(k: float) -> String:
	if not is_inside_tree():
		return ""
	var w := get_window().size
	return "%d×%d" % [roundi(w.x * k), roundi(w.y * k)]


func _col(title: String) -> VBoxContainer:
	var c := PanelContainer.new()
	c.theme_type_variation = &"SetCol"
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# each column its own height (.set-grid align-items: start)
	c.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", 0)
	c.add_child(v)
	var h3 := Label.new()
	h3.text = title.to_upper()
	h3.theme_type_variation = &"H3"
	# .set-col h3 margin: 0.45em 0 0.2em
	var m := MarginContainer.new()
	m.add_theme_constant_override(&"margin_top", 5)
	m.add_theme_constant_override(&"margin_bottom", 2)
	m.add_child(h3)
	v.add_child(m)
	_grid.add_child(c)
	return v


func _row(parent: VBoxContainer, k: String) -> void:
	# (the column's first row, straight under its heading, has no rule above it)
	var r := SegRow.new(_label_for.bind(k), _opts_for.bind(k), parent.get_child_count() == 1)
	r.name = k
	r.picked.connect(func() -> void: blip.call("tap"))
	parent.add_child(r)
	_rows.append(r)


## The row for a setting ("sound", "commentary", "zoom", "perf", "quality", "resolution", "fps").
func row(k: String) -> SegRow:
	for r in _rows:
		if r.name == k:
			return r
	return null


## Re-read every row (after any change: one pick can move another row's label).
func refresh() -> void:
	for r in _rows:
		r.sync()


## Size the card for `avail` (the screen less its margins): .box.settings is min(50em, 100%) wide,
## and the grid scrolls inside if the card would be taller than the screen.
func fit(avail: Vector2) -> void:
	var w := minf(WIDTH, avail.x)
	var inner := w - 40.0
	_grid.columns = 2 if inner >= COL_MIN * 2.0 + GAP else 1
	custom_minimum_size.x = w
	_scroll.custom_minimum_size.x = inner
	_room = avail.y - 37.0 - _head.get_combined_minimum_size().y - GAP
	_fit_scroll()


## The scroll box as tall as the grid (a ScrollContainer doesn't grow with what it holds), up to
## the room there is. Again whenever the grid's height changes (a row wrapping under its label).
func _fit_scroll() -> void:
	var want := _grid.get_combined_minimum_size().y
	_scroll.custom_minimum_size.y = clampf(want, 60.0, maxf(60.0, _room))


## One setting: what it is (and a quieter second line) on the left, its choices on the right, the
## choices dropping under the label when both don't fit on one line (style.css .set-row: flex-wrap,
## .seg.fit margin-left: auto). A hairline above every row but a column's first.
class SegRow extends Container:
	## A choice was picked (not the lit one).
	signal picked

	const PAD := 7.0
	const GAP_X := 13.0
	const GAP_Y := 6.0
	const SEG_H := 42.0

	var _label: Callable
	var _opts: Callable
	var _first := false
	var _lab := VBoxContainer.new()
	var _main := Label.new()
	var _sub := Label.new()
	var _track := PanelContainer.new()
	var _seg := HBoxContainer.new()
	var _picks: Array[Callable] = []
	var _on: Array[bool] = []

	func _init(label: Callable, opts: Callable, first: bool) -> void:
		_label = label
		_opts = opts
		_first = first
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_main.theme_type_variation = &"SetLabel"
		_sub.theme_type_variation = &"SetSub"
		_lab.add_theme_constant_override(&"separation", 0)
		_lab.add_child(_main)
		_lab.add_child(_sub)
		add_child(_lab)
		_track.theme_type_variation = &"SegTrack"
		_seg.add_theme_constant_override(&"separation", 2)
		_track.add_child(_seg)
		add_child(_track)
		sync()

	## Re-read the label and the choices.
	func sync() -> void:
		var l: Array = _label.call()
		_main.text = l[0]
		_sub.text = l[1]
		_sub.visible = l[1] != ""
		var list: Array = _opts.call()
		_picks.resize(list.size())
		_on.resize(list.size())
		while _seg.get_child_count() < list.size():
			var i := _seg.get_child_count()
			var b := Button.new()
			b.custom_minimum_size = Vector2(48, SEG_H)
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
			b.pressed.connect(_tap.bind(i))
			UiTheme.press_feedback(b, 0.94)
			_seg.add_child(b)
		for i in list.size():
			var o: Array = list[i]
			var b := _seg.get_child(i) as Button
			b.text = o[0]
			b.theme_type_variation = &"SegOn" if o[1] else &"SegBtn"
			_on[i] = o[1]
			_picks[i] = o[2]
		update_minimum_size()
		queue_sort()

	func _tap(i: int) -> void:
		if _on[i]:
			return
		picked.emit()
		# (the pick tells Settings, whose `changed` re-syncs every row, this one included)
		_picks[i].call()

	## The choices' button for `text` (tests click through them).
	func button(text: String) -> Button:
		for b: Button in _seg.get_children():
			if b.text == text:
				return b
		return null

	func title() -> String:
		return _main.text

	func subtitle() -> String:
		return _sub.text

	func _one_line(w: float) -> bool:
		return _lab.get_combined_minimum_size().x + GAP_X + _track.get_combined_minimum_size().x <= w

	func _get_minimum_size() -> Vector2:
		var a := _lab.get_combined_minimum_size()
		var b := _track.get_combined_minimum_size()
		if size.x <= 0.0 or _one_line(size.x):
			return Vector2(a.x + GAP_X + b.x, maxf(a.y, b.y) + PAD * 2.0)
		return Vector2(maxf(a.x, b.x), a.y + GAP_Y + b.y + PAD * 2.0)

	func _notification(what: int) -> void:
		if what == NOTIFICATION_SORT_CHILDREN:
			var a := _lab.get_combined_minimum_size()
			var b := _track.get_combined_minimum_size()
			if _one_line(size.x):
				var h := maxf(a.y, b.y)
				fit_child_in_rect(_lab, Rect2(0, PAD + (h - a.y) * 0.5, a.x, a.y))
				fit_child_in_rect(_track, Rect2(size.x - b.x, PAD + (h - b.y) * 0.5, b.x, b.y))
			else:
				fit_child_in_rect(_lab, Rect2(0, PAD, a.x, a.y))
				fit_child_in_rect(_track, Rect2(size.x - b.x, PAD + a.y + GAP_Y, b.x, b.y))
		elif what == NOTIFICATION_RESIZED:
			update_minimum_size()
		elif what == NOTIFICATION_DRAW and not _first:
			draw_line(Vector2(0, 0.5), Vector2(size.x, 0.5), UiTheme.LINE, 1.0)
