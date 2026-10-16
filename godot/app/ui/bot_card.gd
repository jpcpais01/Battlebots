## A bot card (src/ui/botCard.ts botCardHtml, style.css .bcard): the tag ("Your bot",
## "Challenger") with its corner's dot and the power chip, the bot's name, its two moves, live
## maker sets and frame size as pills, and its six fitted parts as tiles (PartTile "card"), on a
## dark panel washed with the bot's paint. Side "l" hugs the left edge in cyan, "r" the right in
## orange, mirrored. Used for both bots in the fight intro (FightHud IntroView).
class_name BotCard
extends Container

const EM := UiTheme.EM
const ORANGE := Color(1.0, 0.478, 0.102)

var side := "l"
var tiles: Array[PartTile] = []
## The gear tiles' gearIn delays (seconds): d0 + k * 0.05.
var delays: Array[float] = []
var _bg: ColorRect
var _shadow: Panel
var _col := VBoxContainer.new()
var _pad: Array[float] = [0.9 * EM, 0.85 * EM, 0.9 * EM, 0.9 * EM]


## A card for `spec` with its fight build `build` (Fighter.build, or TItems.computeBuild).
## `game` gives the part pictures (Game.thumbs); `d0` is when the first part tile pops in.
static func make(game, spec, build, side_: String, tag: String, d0 := 0.35) -> BotCard:
	var c := BotCard.new()
	c.side = side_
	c._build(game, spec, build, tag, d0)
	return c


func _build(game, spec, build, tag: String, d0: float) -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var r := side == "r"
	var sc := ORANGE if r else UiTheme.CYAN
	var paint := MenuKit.hex(spec.paint.primary)
	# box-shadow: var(--shadow) (0 18px 50px rgba(0,0,0,.5))
	_shadow = Panel.new()
	var sb := MenuKit.box(Color(0.04, 0.05, 0.08, 0.6), 24)
	sb.shadow_color = Color(0, 0, 0, 0.5)
	sb.shadow_size = 25
	sb.shadow_offset = Vector2(0, 18)
	_shadow.add_theme_stylebox_override(&"panel", sb)
	_shadow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_shadow)
	# linear-gradient(165deg, color-mix(paint 10%, rgba(22,26,37,.92)), rgba(11,14,21,.94) 60%)
	var base := Color(22 / 255.0, 26 / 255.0, 37 / 255.0)
	var a := 0.1 + 0.9 * 0.92
	var c0 := Color((paint * 0.1 + base * (0.9 * 0.92)) / a, a)
	_bg = MenuKit.grad_panel({
		"radius": 24.0, "c0": c0, "c1": Color(11 / 255.0, 14 / 255.0, 21 / 255.0, 0.94), "angle": 165.0,
		"stop1": 0.6, "border": UiTheme.LINE, "border_w": 1.0,
		# .bcard::after: 3px of paint along the top, fading away from its edge
		"bar": Color(paint, 0.9), "bar_h": 3.0, "bar_dir": -1.0 if r else 1.0,
	})
	add_child(_bg)
	_col.add_theme_constant_override(&"separation", int(round(0.45 * EM)))
	_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_col)
	# ---- cap: tag (with the corner's dot) and power
	var cap := HBoxContainer.new()
	cap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cap.add_theme_constant_override(&"separation", int(round(0.5 * EM)))
	var tfs := 0.7 * EM
	var tag_row := HBoxContainer.new()
	tag_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tag_row.alignment = BoxContainer.ALIGNMENT_CENTER
	tag_row.add_theme_constant_override(&"separation", int(round(0.45 * tfs)))
	var dot := Panel.new()
	var ds := MenuKit.box(sc, 99)
	ds.shadow_color = Color(sc, 0.8)
	ds.shadow_size = 4
	dot.add_theme_stylebox_override(&"panel", ds)
	dot.custom_minimum_size = Vector2.ONE * round(0.6 * tfs)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tl := MenuKit.label(tag.to_upper(), tfs, 700, UiTheme.TEXT_2, int(round(0.14 * tfs)))
	tl.custom_minimum_size.y = 0
	for n: Control in ([tl, dot] if r else [dot, tl]):
		tag_row.add_child(n)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pfs := 0.8 * EM
	var pwr := MenuKit.pill(MenuKit.box(MenuKit.AMBER, 999, [0.6 * pfs, 0.15 * pfs, 0.6 * pfs, 0.15 * pfs]), 0.3 * pfs)
	pwr.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var small := MenuKit.label("PWR", 0.85 * pfs, 700, Color(UiTheme.INK, 0.7))
	small.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	small.custom_minimum_size.y = 0
	pwr.get_node("Row").add_child(small)
	var pl := MenuKit.label(str(int(build.rating)), pfs, 750, UiTheme.INK)
	pl.custom_minimum_size.y = 0
	pwr.get_node("Row").add_child(pl)
	for n: Control in ([pwr, gap, tag_row] if r else [tag_row, gap, pwr]):
		cap.add_child(n)
	_col.add_child(cap)
	# ---- the name (1.4em, 800, one line with an ellipsis)
	var nm := MenuKit.label(str(spec.name_), 1.4 * EM, 800, UiTheme.TEXT)
	nm.custom_minimum_size = Vector2(0, round(1.4 * EM * 1.1))
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nm.clip_text = true
	nm.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if r else HORIZONTAL_ALIGNMENT_LEFT
	_col.add_child(nm)
	# ---- moves, live maker sets, frame size
	var moves := HFlowContainer.new()
	moves.mouse_filter = Control.MOUSE_FILTER_IGNORE
	moves.alignment = FlowContainer.ALIGNMENT_END if r else FlowContainer.ALIGNMENT_BEGIN
	moves.add_theme_constant_override(&"h_separation", int(round(0.3 * EM)))
	moves.add_theme_constant_override(&"v_separation", int(round(0.3 * EM)))
	for id in [build.fistAbility, build.kickAbility]:
		var ic := "ab:" + str(id)
		moves.add_child(_move(ic if Icons.find(ic) != null else "", str(TMoves.MOVES[id].name_), MenuKit.AMBER, UiTheme.TEXT_2))
	for st in build.sets:
		if not bool(st.active):
			continue
		var logo := "co:" + str(st.company.id)
		moves.add_child(_move(logo if Icons.find(logo) != null else "", str(int(st.count)), MenuKit.css(str(st.company.color)), UiTheme.TEXT, 0.2))
	var z: float = float(spec.get("size_", 1.0)) if spec is Dictionary else 1.0
	if z != 1.0:
		moves.add_child(_move("size", "%d%%" % roundi(z * 100.0), UiTheme.CYAN, UiTheme.CYAN, 0.3, Color(UiTheme.CYAN, 0.12)))
	_col.add_child(moves)
	# ---- the six fitted parts
	var gear := GridContainer.new()
	gear.columns = 3
	gear.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gear.add_theme_constant_override(&"h_separation", int(round(0.35 * EM)))
	gear.add_theme_constant_override(&"v_separation", int(round(0.35 * EM)))
	var gm := MarginContainer.new()
	gm.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gm.add_theme_constant_override(&"margin_top", int(round(0.1 * EM)))
	gm.add_child(gear)
	_col.add_child(gm)
	var k := 0
	for slot in TItems.SLOTS:
		var eq = spec.loadout[slot]
		var item = TItems.ITEM_BY_ID.get(eq.id)
		var t := PartTile.make("card", 0.0)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.mouse_filter = Control.MOUSE_FILTER_IGNORE
		gear.add_child(t)
		if item != null:
			t.show_part(game, slot, item, float(item.tier), spec.paint, spec.loadout)
			t.tooltip_text = ""
		tiles.append(t)
		delays.append(d0 + k * 0.05)
		k += 1


## One pill of .bcard .moves: an icon and a word.
func _move(icon_name: String, text: String, icon_color: Color, text_color: Color, gap := 0.3, bg := Color(1, 1, 1, 0.07)) -> Control:
	var fs := 0.72 * EM
	var p := MenuKit.pill(MenuKit.box(bg, 999, [0.6 * fs, 0.22 * fs, 0.6 * fs, 0.22 * fs]), gap * fs)
	var row := p.get_node("Row")
	if icon_name != "":
		var ic := MenuKit.icon(icon_name, 1.15 * fs, icon_color)
		ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(ic)
	var l := MenuKit.label(text, fs, 600, text_color)
	l.custom_minimum_size.y = 0
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(l)
	return p


## The gear tiles' entrance at `t` seconds (gearIn: from 70% and clear, 0.45s each, --ease).
func gear_at(t: float) -> void:
	for i in tiles.size():
		var x := clampf((t - delays[i]) / 0.45, 0.0, 1.0)
		# cubic-bezier(0.2, 0.8, 0.2, 1), near enough
		var e := 1.0 - pow(1.0 - x, 3.5)
		tiles[i].rise._apply(e, Vector2.ZERO, 0.7)


## Retry the part pictures (the garage's renders come in a few frames after they're asked for).
func refresh_pictures(game, spec) -> bool:
	var all := true
	for t in tiles:
		if t.item != null and not t.has_picture():
			t.show_part(game, t.slot, t.item, float(t.item.tier), spec.paint, spec.loadout)
			t.tooltip_text = ""
			all = all and t.has_picture()
	return all


func _get_minimum_size() -> Vector2:
	var m := _col.get_combined_minimum_size()
	return m + Vector2(_pad[0] + _pad[2], _pad[1] + _pad[3])


func _notification(what: int) -> void:
	if what == NOTIFICATION_SORT_CHILDREN:
		fit_child_in_rect(_shadow, Rect2(Vector2.ZERO, size))
		fit_child_in_rect(_bg, Rect2(Vector2.ZERO, size))
		fit_child_in_rect(_col, Rect2(Vector2(_pad[0], _pad[1]), size - Vector2(_pad[0] + _pad[2], _pad[1] + _pad[3])))
		# square tiles: as tall as they are wide
		for t in tiles:
			var w := (size.x - _pad[0] - _pad[2] - 2.0 * round(0.35 * EM)) / 3.0
			if absf(t.custom_minimum_size.y - floorf(w)) > 0.5:
				t.custom_minimum_size.y = floorf(w)
