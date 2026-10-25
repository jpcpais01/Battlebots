## A pull, played out (the Skin Vault's big moment), over the vault's own place: the vault does
## the work in 3D (VaultStage.play) and this puts the words, the flashes and the buttons over it.
## Black bars slide in like a film's while the vault door's wheel spins and it swings open.
##   one pull: a pod glides out of the vault, hovers, rises and charges (a Rare teases violet
##   through its seam, an Epic trips the alarm, lasers and all, and blows through to gold) and
##   bursts; the camera cuts to the robot as a beam paints the skin onto it, and its rarity, name
##   and NEW (or the shards a copy gave) come in beside it.
##   ten: ten pods fly out of the vault onto pads in an arc and pop one by one into lights of their
##   rarity's colour, a pip lighting along the bottom for each (an Epic trips the alarm first);
##   each Epic among them then gets the spotlight on the robot on its own (a tap goes on), and ten
##   cards deal out and turn over. A card tapped shows that skin on the robot.
## A skin's reveal: its stars stamped in one by one, its rarity word with a glint running over it
## on a streak of the rarity's light, the shade behind the words stained with its colour.
## A tap skips ahead (to the burst, to the lights, the cards all turned). `finished` says what the
## player picked: "done", "again" (the same pull again) or "wear" (with the id).
class_name PullShow
extends Control

signal finished(action: String, data)

## The shade behind the words: deep violet, fading out to the right.
const SHADE := preload("res://app/gacha/pull_shade.gdshader")
const STREAK := preload("res://app/gacha/pull_streak.gdshader")
const WORD := preload("res://app/gacha/pull_word.gdshader")

var results: Array = []
var app: App
var sound: GachaSound
var stage: VaultStage
## What the pull costs again, for the button ("" hides it).
var again_text := ""
var again_ok := true

var _best: Dictionary
var _tier := 0
var _phase := "in"
var _bars: Array[ColorRect] = []
var _flash := ColorRect.new()
var _flash_a := 0.0
var _veil := ColorRect.new()
var _shade: ColorRect
var _ui := Control.new()
var _hint: Label
var _pips: Array[Panel] = []
var _pip_row := Control.new()
var _cards: Array[SkinCard] = []
var _card_box := Control.new()
var _flip_tw: Tween
var _buttons: Control = null
var _detail: Control = null
## Where each card sits once dealt (they float a little about it once all are up).
var _home: Array[Vector2] = []
## Seconds since the last card turned (the floating eases in), -1 before.
var _float_t := -1.0
## A ten-pull's Epics, each shown on the robot on its own before the cards deal (Gacha games'
## spotlight): the ones still to come, the one up now and how long it's been up.
var _spots: Array[int] = []
var _spot_root: Control = null
var _spot_t := 0.0


func _init(app_: App, results_: Array, sound_: GachaSound) -> void:
	app = app_
	results = results_
	sound = sound_
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.theme()
	_best = Gacha.best_of(results)
	_tier = int(_best.skin.r)


func _ready() -> void:
	var vs := get_viewport_rect().size
	# a shade down the left for the words, kept off until there are words
	_shade = ColorRect.new()
	var sm := ShaderMaterial.new()
	sm.shader = SHADE
	_shade.material = sm
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade.position = Vector2.ZERO
	_shade.size = Vector2(vs.x * 0.62, vs.y)
	_shade.modulate.a = 0.0
	add_child(_shade)
	# the veil the ten cards deal out over
	_veil.color = Color(0.02, 0.0, 0.06, 0.0)
	_veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_veil)
	_card_box.set_anchors_preset(Control.PRESET_FULL_RECT)
	_card_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_card_box)
	_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_ui)
	# the film's black bars
	for i in 2:
		var b := ColorRect.new()
		b.color = Color(0, 0, 0, 1)
		b.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.size = Vector2(vs.x, vs.y * 0.085)
		b.position = Vector2(0, -b.size.y if i == 0 else vs.y)
		add_child(b)
		_bars.append(b)
	_bars_to(true)
	# the burst's flash over everything (hidden while it's clear: a clear full-screen rect still
	# costs the GPU a pass over every pixel)
	_flash.visible = false
	_flash.color = Color(1, 1, 1, 0)
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var add := CanvasItemMaterial.new()
	add.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	_flash.material = add
	add_child(_flash)
	_hint = MenuKit.label("Tap to skip", 13, 600, Color(1, 1, 1, 0.45))
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint.size = Vector2(vs.x, 20)
	_hint.position = Vector2(0, vs.y - vs.y * 0.085 * 0.5 - 10)
	add_child(_hint)
	if results.size() > 1:
		_build_pips(vs)
	app.tap("start")
	stage = app.game.get_place("vault") as VaultStage
	if stage != null:
		stage.beat.connect(_on_beat)
		stage.play(results, app.player)


func _exit_tree() -> void:
	if stage != null and stage.beat.is_connected(_on_beat):
		stage.beat.disconnect(_on_beat)


func _bars_to(on: bool) -> void:
	var vs := get_viewport_rect().size
	for i in 2:
		var b := _bars[i]
		var to := (0.0 if on else -b.size.y) if i == 0 else (vs.y - b.size.y if on else vs.y)
		b.create_tween().tween_property(b, "position:y", to, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT if on else Tween.EASE_IN)


## Ten pips along the bottom bar, one lighting for each pod as it pops.
func _build_pips(vs: Vector2) -> void:
	var d := maxf(12.0, vs.y * 0.022)
	var gap := d * 0.9
	var w := 10.0 * d + 9.0 * gap
	_pip_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pip_row.position = Vector2((vs.x - w) * 0.5, vs.y - vs.y * 0.085 * 0.5 - d * 0.5)
	_pip_row.size = Vector2(w, d)
	add_child(_pip_row)
	for i in results.size():
		var p := Panel.new()
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.add_theme_stylebox_override(&"panel", MenuKit.box(Color(1, 1, 1, 0.1), 999, [0.0, 0.0, 0.0, 0.0], Color(1, 1, 1, 0.28), 1))
		p.size = Vector2(d, d)
		p.position = Vector2(i * (d + gap), 0)
		p.pivot_offset = p.size * 0.5
		_pip_row.add_child(p)
		_pips.append(p)
	_hint.position.y -= d * 1.4


# ------------------------------------------------------------------------------ the stage's beats

func _process(dt: float) -> void:
	_spot_t += dt
	if _flash_a > 0.0:
		_flash_a = maxf(0.0, _flash_a - dt * 2.4)
		_flash.color.a = _flash_a * _flash_a
		_flash.visible = _flash_a > 0.0
	if _float_t >= 0.0:
		_float_t += dt
		var k := smoothstep(0.6, 1.6, _float_t)
		for i in _cards.size():
			if i < _home.size():
				_cards[i].position.y = _home[i].y + sin(_float_t * 1.7 + i * 0.9) * 2.5 * k


func _on_beat(what: String, data) -> void:
	match what:
		"burst":
			var c: Color = Skins.RARITY_COL[int(data)]
			_flash.color = Color(c.lerp(Color.WHITE, 0.5), 0.0)
			_flash_a = 0.75 + 0.1 * int(data)
		"reveal":
			_phase = "reveal"
			_hint.visible = false
			_reveal(data, "single")
		"pop":
			var i: int = data[0]
			var tier: int = data[1]
			_pip(i, tier)
			if tier == Skins.EPIC:
				_flash.color = Color(Skins.RARITY_COL[2].lerp(Color.WHITE, 0.5), 0.0)
				_flash_a = 0.6
		"cards":
			_phase = "cards"
			for i in results.size():
				_pip(i, int(results[i].skin.r), true)
				if int(results[i].skin.r) == Skins.EPIC:
					_spots.append(i)
			if _spots.is_empty():
				_deal()
			else:
				_next_spot()


func _pip(i: int, tier: int, quiet := false) -> void:
	if i >= _pips.size() or _pips[i].has_meta("lit"):
		return
	var p := _pips[i]
	p.set_meta("lit", true)
	var c: Color = Skins.RARITY_COL[tier]
	p.add_theme_stylebox_override(&"panel", MenuKit.box(c.lerp(Color.WHITE, 0.15), 999, [0.0, 0.0, 0.0, 0.0], c.lerp(Color.WHITE, 0.6), 2))
	if quiet:
		return
	p.scale = Vector2.ONE * (1.9 + 0.4 * tier)
	p.create_tween().tween_property(p, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


# ------------------------------------------------------------------------------ one skin

## The skin on the robot: its stars, its rarity, its name, what it gave and the buttons, in beside
## it. `how`: "single" (one pull's result), "detail" (opened from a 10-pull card) or "spot" (an Epic
## from a 10-pull, shown on its own before the cards deal: no buttons, a tap goes on).
func _reveal(r: Dictionary, how: String) -> void:
	var s = r.skin
	var tier := int(s.r)
	var detail := how == "detail"
	var vs := size
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if detail:
		_detail = root
	elif how == "spot":
		_spot_root = root
	_ui.add_child(root)
	var col: Color = Skins.RARITY_COL[tier]
	# the shade stained with the rarity's colour
	var sm := _shade.material as ShaderMaterial
	sm.set_shader_parameter("tint", col)
	sm.set_shader_parameter("stain", 0.35 + 0.3 * tier)
	_shade.create_tween().tween_property(_shade, "modulate:a", 1.0, 0.4)
	_bars_to(false)
	var x0 := maxf(28.0, vs.x * 0.07)
	var tw_w := vs.x * 0.46
	var u := minf(vs.y, vs.x * 0.6)
	var y := vs.y * 0.25
	# a streak of the rarity's light shooting out behind the word
	var streak := ColorRect.new()
	var stm := ShaderMaterial.new()
	stm.shader = STREAK
	stm.set_shader_parameter("color", col)
	stm.set_shader_parameter("strength", 0.45 + 0.35 * tier)
	streak.material = stm
	streak.mouse_filter = Control.MOUSE_FILTER_IGNORE
	streak.size = Vector2(vs.x * 0.6, u * 0.24)
	streak.position = Vector2(0, y + u * 0.075 - streak.size.y * 0.5)
	root.add_child(streak)
	root.create_tween().tween_method(func(v: float) -> void: stm.set_shader_parameter("grow", v), 0.0, 1.0, 0.5).set_delay(0.3).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	# the rarity, big, in the broadcast face, a glint of light running over it
	var word := MenuKit.grad_label(String(Skins.RARITY_NAME[tier]).to_upper(), u * 0.12, MenuKit.broadcast(400), col.lerp(Color.WHITE, 0.6), col)
	var wm := word.material as ShaderMaterial
	wm.shader = WORD
	word.size = Vector2(tw_w, u * 0.15)
	word.position = Vector2(x0, y)
	word.pivot_offset = Vector2(0, word.size.y * 0.5)
	root.add_child(word)
	var shine := root.create_tween()
	shine.tween_interval(0.8)
	shine.tween_method(func(v: float) -> void: wm.set_shader_parameter("sweep", v), -80.0, u * 0.12 * 3.6 + 80.0, 0.6 + 0.1 * tier).set_trans(Tween.TRANS_SINE)
	shine.tween_interval(2.2 - 0.6 * tier)
	shine.set_loops()
	# its stars, stamped in one by one over the word
	var stars := RarityStars.new(tier + 1, col.lerp(Color.WHITE, 0.15), u * 0.06)
	stars.position = Vector2(x0 - u * 0.005, y - stars.size.y - u * 0.012)
	root.add_child(stars)
	stars.pop(0.45, 0.17 + 0.05 * tier, func(i: int) -> void:
		sound.play("pop", 0.5 + 0.1 * i, 1.2 + 0.2 * i)
		if i == tier and tier == Skins.EPIC:
			_flash.color = Color(col.lerp(Color.WHITE, 0.5), 0.0)
			_flash_a = 0.35)
	y += u * 0.16
	var name_l := MenuKit.label(String(s.name), u * 0.075, 800)
	name_l.add_theme_font_override(&"font", MenuKit.broadcast(400))
	MenuKit.text_shadow(name_l, 0.6)
	name_l.size = Vector2(tw_w, u * 0.09)
	name_l.position = Vector2(x0, y)
	root.add_child(name_l)
	y += u * 0.1
	var blurb := MenuKit.label(String(s.blurb), maxf(14.0, u * 0.03), 500, UiTheme.TEXT_2)
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.size = Vector2(tw_w * 0.85, u * 0.08)
	blurb.position = Vector2(x0, y)
	MenuKit.text_shadow(blurb, 0.8)
	root.add_child(blurb)
	y += u * 0.1
	# NEW, or what the copy turned into
	var fs := maxf(12.0, u * 0.026)
	var tag := MenuKit.pill(MenuKit.box(MenuKit.AMBER if r.new else Color(1, 1, 1, 0.12), 999, [fs * 0.9, fs * 0.3, fs * 0.9, fs * 0.3], Color(1, 1, 1, 0.0) if r.new else UiTheme.LINE_2, 0 if r.new else 1))
	var tl := MenuKit.label("NEW SKIN" if r.new else "DUPLICATE  +%d SHARDS" % int(r.shards), fs, 850, UiTheme.INK if r.new else UiTheme.TEXT, 1)
	tag.get_node("Row").add_child(tl)
	root.add_child(tag)
	var ts := tag.get_combined_minimum_size()
	tag.size = ts
	tag.position = Vector2(x0 + stars.size.x + u * 0.03, stars.position.y + (stars.size.y - ts.y) * 0.5)
	tag.pivot_offset = Vector2(0, ts.y * 0.5)
	tag.rotation = -0.06
	if how == "spot":
		var go := MenuKit.label("Tap to continue", maxf(13.0, u * 0.026), 650, Color(1, 1, 1, 0.6))
		go.position = Vector2(x0, y + u * 0.03)
		go.size = Vector2(tw_w, u * 0.05)
		root.add_child(go)
		var gt := go.create_tween()
		go.modulate.a = 0.0
		gt.tween_interval(1.3)
		gt.tween_property(go, "modulate:a", 1.0, 0.4)
		_reveal_in(root, [word, name_l, blurb], tag, false, 0.6 + (tier + 1) * (0.17 + 0.05 * tier))
		return
	# the buttons
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 12)
	var wear := _button("Wear it", "paint", &"BtnPrimary")
	wear.pressed.connect(func() -> void: finished.emit("wear", s.id))
	row.add_child(wear)
	if detail:
		var back := _button("Back", "back", &"Btn")
		back.pressed.connect(_close_detail)
		row.add_child(back)
	else:
		if again_text != "":
			var again := _button(again_text, "refresh", &"Btn")
			again.disabled = not again_ok
			again.pressed.connect(func() -> void: finished.emit("again", null))
			row.add_child(again)
		var done := _button("Done", "check", &"Btn")
		done.pressed.connect(func() -> void: finished.emit("done", null))
		row.add_child(done)
	root.add_child(row)
	var rs := row.get_combined_minimum_size()
	row.size = rs
	row.position = Vector2(x0, minf(vs.y - rs.y - 22.0, y + u * 0.02))
	_reveal_in(root, [word, name_l, blurb, row], tag, r.new and not detail, 0.6 + (tier + 1) * (0.17 + 0.05 * tier))


## In they come: the word slams in, the rest slides after it, the tag stamps down.
func _reveal_in(root: Control, items: Array, tag: Control, coin: bool, tag_at := 0.85) -> void:
	var word: Control = items[0]
	var tw := root.create_tween().set_parallel()
	for i in items.size():
		var c: Control = items[i]
		c.modulate.a = 0.0
		var px := c.position.x
		c.position.x = px - 40.0
		tw.tween_property(c, "modulate:a", 1.0, 0.3).set_delay(0.35 + i * 0.1)
		tw.tween_property(c, "position:x", px, 0.45).set_delay(0.35 + i * 0.1).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	word.scale = Vector2(1.5, 1.5)
	tw.tween_property(word, "scale", Vector2.ONE, 0.5).set_delay(0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tag.modulate.a = 0.0
	tag.scale = Vector2(2.2, 2.2)
	tw.tween_property(tag, "modulate:a", 1.0, 0.12).set_delay(tag_at)
	tw.tween_property(tag, "scale", Vector2.ONE, 0.28).set_delay(tag_at).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if coin:
		tw.tween_callback(func() -> void: sound.play("coin", 0.6)).set_delay(tag_at + 0.1)


func _button(text: String, icon_name: String, variant: StringName) -> Button:
	var b := UiTheme.button(text, icon_name, variant)
	MenuKit.pad_button(b, 22.0, 48.0)
	return b


## Back from a card's skin on the robot to the ten.
func _close_detail() -> void:
	if _detail == null:
		return
	app.tap("back")
	var d := _detail
	_detail = null
	var tw := d.create_tween()
	tw.tween_property(d, "modulate:a", 0.0, 0.18)
	tw.tween_callback(d.queue_free)
	_shade.create_tween().tween_property(_shade, "modulate:a", 0.0, 0.25)
	if stage != null:
		stage.back_to_orbs()
	_cards_shown(true)


# ------------------------------------------------------------------------------ ten

## The next of a ten-pull's Epics, on the robot in the spotlight before the cards deal.
func _next_spot() -> void:
	var i: int = _spots.pop_front()
	_phase = "spot"
	_spot_t = 0.0
	_hint.visible = false
	_pip_row.create_tween().tween_property(_pip_row, "modulate:a", 0.0, 0.3)
	if stage != null:
		stage.show_on_robot(String(results[i].skin.id))
	_reveal(results[i], "spot")


## A tap on an Epic in the spotlight: on to the next, or back to the lights as the cards deal.
func _end_spot() -> void:
	if _spot_t < 0.8:
		return
	var d := _spot_root
	_spot_root = null
	if d != null:
		var tw := d.create_tween()
		tw.tween_property(d, "modulate:a", 0.0, 0.2)
		tw.tween_callback(d.queue_free)
	if not _spots.is_empty():
		_next_spot()
		return
	_phase = "cards"
	_shade.create_tween().tween_property(_shade, "modulate:a", 0.0, 0.25)
	_bars_to(true)
	if stage != null:
		stage.back_to_orbs()
	_deal()


## Ten cards fly up out of the pips into two rows, face down, their edges glowing what's under,
## and turn over one by one (an Epic holds its breath first).
func _deal() -> void:
	var vs := size
	_hint.visible = false
	_veil.create_tween().tween_property(_veil, "color:a", 0.55, 0.4)
	var gap := vs.y * 0.025
	# (between the film's bars, clear of the buttons that come up under them)
	var ch := minf((vs.y * 0.62 - gap) * 0.5, (vs.x * 0.8 - gap * 4.0) / 5.0 * 1.4)
	var cw := ch / 1.4
	var x0 := (vs.x - (cw * 5.0 + gap * 4.0)) * 0.5
	var y0 := vs.y * 0.085 + gap * 1.5
	for i in results.size():
		var r: Dictionary = results[i]
		var c := SkinCard.new(r.skin, cw, ch)
		c.set_face(false)
		var from := _pips[i].global_position + _pips[i].size * 0.5 if i < _pips.size() else vs * 0.5
		c.position = from - Vector2(cw, ch) * 0.5
		c.pivot_offset = Vector2(cw, ch) * 0.5
		c.scale = Vector2(0.15, 0.15)
		c.rotation = randf_range(-0.8, 0.8)
		c.modulate.a = 0.0
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var target := Vector2(x0 + (i % 5) * (cw + gap), y0 + (i / 5) * (ch + gap))
		_home.append(target)
		_card_box.add_child(c)
		_cards.append(c)
		var tw := c.create_tween().set_parallel()
		var dl := i * 0.05
		tw.tween_property(c, "position", target, 0.5).set_delay(dl).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "scale", Vector2.ONE, 0.45).set_delay(dl).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "rotation", 0.0, 0.45).set_delay(dl)
		tw.tween_property(c, "modulate:a", 1.0, 0.15).set_delay(dl)
		tw.tween_callback(func() -> void: sound.play("flip", 0.3, 1.3)).set_delay(dl)
		var idx := i
		c.pressed.connect(func() -> void: _open_card(idx))
	_flip_tw = create_tween()
	_flip_tw.tween_interval(0.45 + results.size() * 0.05)
	# turned over from the Commons up, so the best is always the last one to land
	var order := range(results.size())
	order.sort_custom(func(a: int, b: int) -> bool:
		var ta := int(results[a].skin.r)
		var tb := int(results[b].skin.r)
		return ta < tb or (ta == tb and a < b))
	for i in order:
		var t := int(results[i].skin.r)
		if t == Skins.EPIC:
			var c := _cards[i]
			_flip_tw.tween_callback(func() -> void:
				sound.play("riser", 0.45, 3.4)
				var tr := c.create_tween()
				for k in 8:
					tr.tween_property(c, "rotation", 0.05 * (1 if k % 2 == 0 else -1), 0.05)
				tr.tween_property(c, "rotation", 0.0, 0.05))
			_flip_tw.tween_method(func(v: float) -> void: c.set_glow(v), 1.0, 2.6, 0.45)
		_flip_tw.tween_callback(_flip.bind(i))
		_flip_tw.tween_interval(0.12 if t == Skins.COMMON else (0.3 if t == Skins.RARE else 0.5))
	_flip_tw.tween_callback(_dealt)


func _flip(i: int) -> void:
	var c := _cards[i]
	if c.face_up:
		return
	var r: Dictionary = results[i]
	var t := int(r.skin.r)
	var tw := c.create_tween()
	tw.tween_property(c, "scale:x", 0.0, 0.08).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.tween_callback(func() -> void:
		c.set_face(true)
		c.set_glow(1.0)
		if r.new:
			c.set_badge("NEW")
		else:
			c.set_badge("+%d" % int(r.shards), Color(1, 1, 1, 0.16), UiTheme.TEXT))
	tw.tween_property(c, "scale:x", 1.0, 0.12).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	if t >= Skins.RARE:
		tw.tween_callback(func() -> void:
			if i < _home.size():
				_card_box.add_child(CardSparks.new(Rect2(_home[i], c.size), Skins.RARITY_COL[t], t))
			c.orb.set_halo(1.6)
			c.orb.create_tween().tween_method(c.orb.set_halo, 1.6, 0.35 + 0.3 * t, 0.7))
		tw.tween_property(c, "scale", Vector2(1.12, 1.12), 0.1)
		tw.tween_property(c, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	sound.play("flip", 0.55)
	if t == Skins.RARE:
		sound.play("chime1", 0.4)
	elif t == Skins.EPIC:
		sound.play("chime2", 0.7)
		_flash.color = Color(Skins.RARITY_COL[2].lerp(Color.WHITE, 0.5), 0.0)
		_flash_a = 0.45


## Every card is up: the buttons, and the cards open on a tap.
func _dealt() -> void:
	if _phase == "dealt":
		return
	_phase = "dealt"
	for i in _cards.size():
		_flip(i)
		_cards[i].mouse_filter = Control.MOUSE_FILTER_STOP
	_bars_to(false)
	_pip_row.create_tween().tween_property(_pip_row, "modulate:a", 0.0, 0.3)
	_float_t = 0.0
	var vs := size
	var box := Control.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.set_anchors_preset(Control.PRESET_FULL_RECT)
	_card_box.add_child(box)
	_summary(box, vs)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 12)
	if again_text != "":
		var again := _button(again_text, "refresh", &"Btn")
		again.disabled = not again_ok
		again.pressed.connect(func() -> void: finished.emit("again", null))
		row.add_child(again)
	var done := _button("Done", "check", &"BtnPrimary")
	done.pressed.connect(func() -> void: finished.emit("done", null))
	row.add_child(done)
	box.add_child(row)
	var rs := row.get_combined_minimum_size()
	row.size = rs
	row.position = Vector2((vs.x - rs.x) * 0.5, vs.y - rs.y - maxf(16.0, vs.y * 0.04))
	var hint := MenuKit.label("Tap a card to see it on your robot", 13, 600, UiTheme.MUTED)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.size = Vector2(vs.x, 18)
	hint.position = Vector2(0, row.position.y - 26)
	box.add_child(hint)
	_buttons = box
	box.modulate.a = 0.0
	box.create_tween().tween_property(box, "modulate:a", 1.0, 0.3)


## What the ten came to, over the cards: a chip per rarity drawn (best first) and how many are new.
func _summary(box: Control, vs: Vector2) -> void:
	var n := [0, 0, 0]
	var fresh := 0
	for r in results:
		n[int(r.skin.r)] += 1
		fresh += 1 if r.new else 0
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fs := maxf(11.0, vs.y * 0.019)
	for t in [Skins.EPIC, Skins.RARE, Skins.COMMON]:
		if n[t] == 0:
			continue
		var c: Color = Skins.RARITY_COL[t]
		var chip := MenuKit.pill(MenuKit.box(Color(c, 0.16), 999, [fs * 0.8, fs * 0.25, fs * 0.8, fs * 0.25], Color(c, 0.7), 1))
		chip.get_node("Row").add_child(MenuKit.label("%d %s" % [n[t], String(Skins.RARITY_NAME[t]).to_upper()], fs, 800, c.lerp(Color.WHITE, 0.25), 1))
		row.add_child(chip)
	if fresh > 0:
		var chip := MenuKit.pill(MenuKit.box(MenuKit.AMBER, 999, [fs * 0.8, fs * 0.25, fs * 0.8, fs * 0.25]))
		chip.get_node("Row").add_child(MenuKit.label("%d NEW" % fresh, fs, 800, UiTheme.INK, 1))
		row.add_child(chip)
	box.add_child(row)
	var rs := row.get_combined_minimum_size()
	row.size = rs
	var top := _home[0].y if _home.size() > 0 else vs.y * 0.12
	row.position = Vector2((vs.x - rs.x) * 0.5, maxf(4.0, (top - rs.y) * 0.5 - 4.0))


func _open_card(i: int) -> void:
	if _phase != "dealt" or _detail != null:
		return
	app.tap("select")
	_cards_shown(false)
	if stage != null:
		stage.show_on_robot(String(results[i].skin.id))
	_reveal(results[i], "detail")


## The cards (and their veil and buttons) out of the way while a skin is shown on the robot, or back.
func _cards_shown(on: bool) -> void:
	_card_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for c in _cards:
		c.mouse_filter = Control.MOUSE_FILTER_STOP if on else Control.MOUSE_FILTER_IGNORE
	if _buttons != null:
		for b in _buttons.find_children("*", "Button", true, false):
			(b as Button).mouse_filter = Control.MOUSE_FILTER_STOP if on else Control.MOUSE_FILTER_IGNORE
	var tw := create_tween().set_parallel()
	tw.tween_property(_card_box, "modulate:a", 1.0 if on else 0.0, 0.25)
	tw.tween_property(_veil, "color:a", 0.55 if on else 0.0, 0.25)


# ------------------------------------------------------------------------------ taps

func _gui_input(e: InputEvent) -> void:
	if not (e is InputEventMouseButton and (e as InputEventMouseButton).pressed):
		return
	_skip()


func _skip() -> void:
	if _phase == "in":
		# straight to the burst (one) or the lights (ten)
		if stage != null:
			stage.skip()
	elif _phase == "spot":
		_end_spot()
	elif _phase == "cards":
		# turn the rest over at once
		if _flip_tw != null and _flip_tw.is_valid():
			_flip_tw.kill()
		_dealt()


func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		if _detail != null:
			_close_detail()
		elif _phase == "spot":
			_end_spot()
		elif _phase == "dealt" or _phase == "reveal":
			finished.emit("done", null)
		else:
			_skip()
