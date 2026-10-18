## A pull, played out (the Skin Vault's big moment). The screen falls dark and a paint capsule
## drops into a pool of light. It charges, its seam leaking light: a Common's cool blue; a Rare
## cracks it over to violet; an Epic holds, shakes and blows through to gold. It bursts in a flash,
## a ring of light and a shower of sparks, and what was inside comes out:
##   one pull: the skin's swatch rises, its rarity, its name, NEW or the shards a copy gave;
##   ten: ten cards fan out face down, each edge already glowing its colour, and turn over one
##   by one (an Epic holds its breath first). A card tapped afterwards opens on its own.
## A tap before the burst skips to it; a tap while the cards turn turns the rest. `finished`
## says what the player picked: "done", "again" (the same pull again) or "wear" (with the id).
class_name PullShow
extends Control

signal finished(action: String, data)

const BG_SHADER := preload("res://app/gacha/vault_bg.gdshader")
const CAP_SHADER := preload("res://app/gacha/capsule.gdshader")
## When the capsule lands, and how long it charges for each best rarity.
const LAND := 0.72
const CHARGE := [1.2, 1.85, 2.6]

var results: Array = []
var app: App
var sound: GachaSound
## What the pull costs again, for the button ("" hides it).
var again_text := ""
var again_ok := true

var _best: Dictionary
var _tier := 0
var _t := 0.0
var _phase := "in"
var _bg := ColorRect.new()
var _bg_mat := ShaderMaterial.new()
var _stage := Control.new()
var _cap: ColorRect
var _cap_mat: ShaderMaterial
var _cap_size := Vector2.ZERO
var _cap_at := Vector2.ZERO
var _halves: Array = []
var _shake := 0.0
var _flash := 0.0
var _ring := -1.0
var _shown_tier := 0
var _seam := Color()
var _burst_at := 0.0
var _cards: Array[SkinCard] = []
var _flip_tw: Tween
var _flipped := 0
var _ui := Control.new()
var _detail: Control = null
var _sparks: CPUParticles2D
var _confetti: CPUParticles2D
var _riser_on := false
var _cracked := [false, false]


func _init(app_: App, results_: Array, sound_: GachaSound) -> void:
	app = app_
	results = results_
	sound = sound_
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	theme = UiTheme.theme()
	_best = Gacha.best_of(results)
	_tier = int(_best.skin.r)
	_seam = Skins.RARITY_COL[0]


func _ready() -> void:
	_bg.color = Color.WHITE
	_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bg_mat.shader = BG_SHADER
	_bg.material = _bg_mat
	add_child(_bg)
	_stage.set_anchors_preset(Control.PRESET_FULL_RECT)
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_stage)
	_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_ui)
	var vs := get_viewport_rect().size
	size = vs
	_cap_size = Vector2(vs.y * 0.62 * 0.75, vs.y * 0.62)
	_cap_at = Vector2(vs.x * 0.5, vs.y * 0.47)
	_cap = _capsule(0)
	_cap.position = Vector2(_cap_at.x - _cap_size.x * 0.5, -_cap_size.y)
	_stage.add_child(_cap)
	_cap_mat = _cap.material
	_bg_mat.set_shader_parameter("at", _cap_at / vs)
	_bg_mat.set_shader_parameter("aspect", vs.x / vs.y)
	_bg_mat.set_shader_parameter("alpha", 0.0)
	_set_seam(Skins.RARITY_COL[0])
	_sparks = _particles(vs.y / 720.0, false)
	_stage.add_child(_sparks)
	_confetti = _particles(vs.y / 720.0, true)
	_stage.add_child(_confetti)
	var hint := MenuKit.label("Tap to skip", 13, 600, Color(1, 1, 1, 0.35))
	hint.name = "Hint"
	hint.position = Vector2(vs.x * 0.5 - 60, vs.y - 44)
	hint.size = Vector2(120, 20)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_ui.add_child(hint)
	app.tap("start")


func _capsule(half: int) -> ColorRect:
	var c := ColorRect.new()
	c.color = Color.WHITE
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.size = _cap_size
	c.pivot_offset = _cap_size * 0.5
	var m := ShaderMaterial.new()
	m.shader = CAP_SHADER
	m.set_shader_parameter("aspect", 0.75)
	m.set_shader_parameter("half", half)
	m.set_shader_parameter("seam", _seam)
	c.material = m
	return c


## A one-shot burst of glowing sparks (or slower, tumbling confetti for an Epic), scaled to the screen.
func _particles(k: float, confetti: bool) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.emitting = false
	p.one_shot = true
	p.explosiveness = 1.0
	p.amount = 90 if confetti else 160
	p.lifetime = 2.6 if confetti else 1.5
	p.direction = Vector2(0, -1)
	p.spread = 180.0
	p.initial_velocity_min = (200.0 if confetti else 260.0) * k
	p.initial_velocity_max = (700.0 if confetti else 1100.0) * k
	p.gravity = Vector2(0, (380.0 if confetti else 620.0) * k)
	p.damping_min = 40.0 * k
	p.damping_max = 160.0 * k
	p.angular_velocity_min = -540.0 if confetti else 0.0
	p.angular_velocity_max = 540.0 if confetti else 0.0
	p.scale_amount_min = (0.5 if confetti else 0.25) * k
	p.scale_amount_max = (1.0 if confetti else 0.9) * k
	var curve := Curve.new()
	curve.add_point(Vector2(0, 1))
	curve.add_point(Vector2(0.7, 0.7))
	curve.add_point(Vector2(1, 0))
	p.scale_amount_curve = curve
	p.texture = _dot_texture(confetti)
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_MIX if confetti else CanvasItemMaterial.BLEND_MODE_ADD
	p.material = mat
	p.position = _cap_at
	return p


static func _dot_texture(square: bool) -> Texture2D:
	if square:
		var img := Image.create(14, 22, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		return ImageTexture.create_from_image(img)
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	g.add_point(0.25, Color(1, 1, 1, 0.9))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(0.5, 0.0)
	t.width = 48
	t.height = 48
	return t


func _set_seam(c: Color) -> void:
	_seam = c
	if _cap_mat != null:
		_cap_mat.set_shader_parameter("seam", c)
	for h in _halves:
		(h.material as ShaderMaterial).set_shader_parameter("seam", c)
	_bg_mat.set_shader_parameter("tint", c)


func _ramp(c: Color) -> Gradient:
	var g := Gradient.new()
	g.set_color(0, Color.WHITE)
	g.set_color(1, Color(c, 0.0))
	g.add_point(0.3, c.lerp(Color.WHITE, 0.3))
	return g


# ------------------------------------------------------------------------------ the timeline

func _process(dt: float) -> void:
	_t += dt
	var vs := size
	var charge_len: float = CHARGE[_tier]
	_burst_at = LAND + charge_len
	match _phase:
		"in", "charge":
			_bg_mat.set_shader_parameter("alpha", minf(1.0, _t / 0.3))
			if _t < LAND:
				# the drop: falling faster and faster into the light
				var k := clampf((_t - 0.12) / (LAND - 0.12), 0.0, 1.0)
				var y := lerpf(-_cap_size.y, _cap_at.y - _cap_size.y * 0.5, k * k)
				_cap.position = Vector2(_cap_at.x - _cap_size.x * 0.5, y)
				_cap.scale = Vector2(0.94, 1.08) if k > 0.0 else Vector2.ONE
			else:
				if _phase == "in":
					_phase = "charge"
					_shake = 14.0
					app.game.sfx.thud(0.9)
					sound.play("riser", 0.9, 1.9 / charge_len)
				_charge((_t - LAND) / charge_len, dt)
			if _t >= _burst_at:
				_burst()
		"burst":
			pass
	# the burst's afterglow, the ring rushing out, the halves flying apart
	if _flash > 0.0:
		_flash = maxf(0.0, _flash - dt * 2.6)
		_bg_mat.set_shader_parameter("flash", _flash * _flash)
	if _ring >= 0.0:
		_ring += dt * 1.5
		_bg_mat.set_shader_parameter("ring", _ring)
		if _ring > 2.5:
			_ring = -1.0
			_bg_mat.set_shader_parameter("ring", -1.0)
	# the shake settles
	_shake = maxf(0.0, _shake - dt * 30.0)
	_stage.position = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * _shake * vs.y / 720.0


func _charge(k: float, dt: float) -> void:
	k = clampf(k, 0.0, 1.0)
	var col: Color = _seam
	# the tease: violet breaks through for a Rare or better, then gold for an Epic
	if _tier >= 1 and k > 0.42 and not _cracked[0]:
		_cracked[0] = true
		_shake = 10.0
		sound.play("crack", 0.8, 1.0)
		_shown_tier = 1
	if _tier >= 2 and k > 0.72 and not _cracked[1]:
		_cracked[1] = true
		_shake = 18.0
		_flash = 0.35
		sound.play("crack", 1.0, 1.35)
		_shown_tier = 2
	col = col.lerp(Skins.RARITY_COL[_shown_tier], minf(1.0, dt * 10.0))
	_set_seam(col)
	# it comes to life: a pulse quickening, the light growing, a shudder building
	var pulse := 0.5 + 0.5 * sin(_t * (8.0 + k * 30.0))
	var power := 0.15 + k * 0.7 + pulse * 0.15 * k
	_cap_mat.set_shader_parameter("charge", power)
	_cap_mat.set_shader_parameter("crack", smoothstep(0.55, 1.0, k) * (0.4 + 0.3 * _shown_tier))
	_bg_mat.set_shader_parameter("power", power * (0.6 + 0.2 * _shown_tier))
	_bg_mat.set_shader_parameter("rays", k * (0.3 + 0.35 * _shown_tier))
	_shake = maxf(_shake, k * k * (3.0 + 4.0 * _shown_tier))
	_cap.rotation = sin(_t * 37.0) * 0.02 * k * (1.0 + _shown_tier)
	# landed: a squash that springs back
	var since := _t - LAND
	var sq := exp(-since * 9.0) * cos(since * 26.0) * 0.12
	_cap.scale = Vector2(1.0 + sq, 1.0 - sq) * (1.0 + k * 0.04 + pulse * 0.015 * k)
	_cap.position = _cap_at - _cap_size * 0.5


func _burst() -> void:
	_phase = "burst"
	_shown_tier = _tier
	_set_seam(Skins.RARITY_COL[_tier])
	_flash = 1.0
	_ring = 0.0
	_shake = 22.0 + 8.0 * _tier
	sound.stop_all()
	sound.play("burst", 0.9)
	sound.play("chime%d" % _tier, 0.8)
	_bg_mat.set_shader_parameter("power", 0.5 + 0.2 * _tier)
	_bg_mat.set_shader_parameter("rays", 0.5 + 0.3 * _tier)
	var hint := _ui.get_node_or_null("Hint")
	if hint != null:
		hint.queue_free()
	# the capsule splits: the halves fly apart, tumbling, and fade
	_cap.visible = false
	for half in [1, 2]:
		var h := _capsule(half)
		h.position = _cap.position
		(h.material as ShaderMaterial).set_shader_parameter("seam", _seam)
		_stage.add_child(h)
		_halves.append(h)
		var dir := Vector2(-0.6, -1.0) if half == 1 else Vector2(0.7, 1.0)
		var tw := h.create_tween().set_parallel()
		tw.tween_property(h, "position", h.position + dir * size.y * 0.7, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(h, "rotation", -0.9 if half == 1 else 1.1, 0.8)
		tw.tween_property(h, "modulate:a", 0.0, 0.6).set_delay(0.15)
	_sparks.color_ramp = _ramp(Skins.RARITY_COL[_tier])
	_sparks.amount = 110 + 70 * _tier
	_sparks.restart()
	if _tier >= 1:
		_confetti.color_ramp = null
		_confetti.color_initial_ramp = _confetti_ramp()
		_confetti.amount = 50 if _tier == 1 else 110
		_confetti.restart()
	if results.size() == 1:
		get_tree().create_timer(0.12).timeout.connect(func() -> void: _reveal(results[0], false))
	else:
		get_tree().create_timer(0.1).timeout.connect(_deal)


func _confetti_ramp() -> Gradient:
	var g := Gradient.new()
	var c: Color = Skins.RARITY_COL[_tier]
	g.set_color(0, c)
	g.set_color(1, Color.WHITE)
	g.add_point(0.33, Color(1.0, 0.45, 0.75))
	g.add_point(0.66, Color(0.35, 0.85, 1.0))
	g.interpolation_mode = Gradient.GRADIENT_INTERPOLATE_CONSTANT
	return g


# ------------------------------------------------------------------------------ one skin

## The skin comes out: its swatch rising in its halo, its rarity, its name, what it gave. On its
## own (`detail` false: the single pull's result) or opened from a 10-pull card.
func _reveal(r: Dictionary, detail: bool) -> void:
	var s = r.skin
	var vs := size
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP if detail else Control.MOUSE_FILTER_IGNORE
	if detail:
		var dim := ColorRect.new()
		dim.color = Color(0.01, 0.012, 0.02, 0.86)
		dim.set_anchors_preset(Control.PRESET_FULL_RECT)
		root.add_child(dim)
		_detail = root
	_ui.add_child(root)
	var col: Color = Skins.RARITY_COL[int(s.r)]
	_bg_mat.set_shader_parameter("tint", col)
	var op := minf(vs.y * 0.44, vs.x * 0.3)
	var cy := vs.y * 0.4
	# the rarity, in the broadcast face, over the swatch
	var word := MenuKit.grad_label(String(Skins.RARITY_NAME[int(s.r)]).to_upper(), op * 0.2, MenuKit.broadcast(400), col.lerp(Color.WHITE, 0.55), col)
	word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	word.size = Vector2(vs.x, op * 0.26)
	word.position = Vector2(0, cy - op * 0.5 - op * 0.28)
	word.pivot_offset = word.size * 0.5
	root.add_child(word)
	var orb := SkinOrb.new(s, op)
	orb.size = Vector2(op, op)
	orb.position = Vector2(vs.x * 0.5 - op * 0.5, cy - op * 0.5)
	orb.pivot_offset = Vector2(op, op) * 0.5
	orb.set_spin(0.08)
	root.add_child(orb)
	var name_l := MenuKit.label(String(s.name), op * 0.15, 800)
	name_l.add_theme_font_override(&"font", MenuKit.broadcast(400))
	MenuKit.text_shadow(name_l, 0.6)
	name_l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_l.size = Vector2(vs.x, op * 0.2)
	name_l.position = Vector2(0, cy + op * 0.52)
	root.add_child(name_l)
	var blurb := MenuKit.label(String(s.blurb), maxf(13.0, op * 0.058), 500, UiTheme.TEXT_2)
	blurb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	blurb.size = Vector2(vs.x, op * 0.08)
	blurb.position = Vector2(0, cy + op * 0.52 + op * 0.2)
	MenuKit.text_shadow(blurb, 0.8)
	root.add_child(blurb)
	# NEW, or what the copy turned into
	var tag_text := "NEW SKIN" if r.new else "DUPLICATE  +%d SHARDS" % int(r.shards)
	var fs := maxf(12.0, op * 0.05)
	var tag := MenuKit.pill(MenuKit.box(MenuKit.AMBER if r.new else Color(1, 1, 1, 0.12), 999, [fs * 0.9, fs * 0.3, fs * 0.9, fs * 0.3], Color(1, 1, 1, 0.0) if r.new else UiTheme.LINE_2, 0 if r.new else 1))
	var tl := MenuKit.label(tag_text, fs, 850, UiTheme.INK if r.new else UiTheme.TEXT, 1)
	tag.get_node("Row").add_child(tl)
	root.add_child(tag)
	var ts := tag.get_combined_minimum_size()
	tag.size = ts
	tag.position = Vector2(vs.x * 0.5 + op * 0.3, cy - op * 0.48)
	tag.pivot_offset = ts * 0.5
	tag.rotation = -0.12
	# the buttons
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 12)
	row.alignment = BoxContainer.ALIGNMENT_CENTER
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
	row.position = Vector2((vs.x - rs.x) * 0.5, minf(vs.y - rs.y - 22.0, cy + op * 0.52 + op * 0.36))
	# in they come: the swatch springs up out of the burst, the words after it
	orb.scale = Vector2.ZERO
	var tw := create_tween().set_parallel()
	tw.tween_property(orb, "scale", Vector2.ONE, 0.75).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(v: float) -> void: orb.set_halo(v), 1.6, 0.35 + 0.3 * float(s.r), 1.4)
	for i in 4:
		var c: Control = [word, name_l, blurb, row][i]
		c.modulate.a = 0.0
		tw.tween_property(c, "modulate:a", 1.0, 0.35).set_delay(0.25 + i * 0.12)
	word.scale = Vector2(1.6, 1.6)
	tw.tween_property(word, "scale", Vector2.ONE, 0.45).set_delay(0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# the tag stamps down
	tag.modulate.a = 0.0
	tag.scale = Vector2(2.2, 2.2)
	tw.tween_property(tag, "modulate:a", 1.0, 0.12).set_delay(0.7)
	tw.tween_property(tag, "scale", Vector2.ONE, 0.28).set_delay(0.7).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	if r.new and not detail:
		tw.tween_callback(func() -> void:
			_shake = 6.0
			sound.play("coin", 0.6)).set_delay(0.8)


func _button(text: String, icon_name: String, variant: StringName) -> Button:
	var b := UiTheme.button(text, icon_name, variant)
	MenuKit.pad_button(b, 22.0, 48.0)
	return b


func _close_detail() -> void:
	if _detail == null:
		return
	app.tap("back")
	var d := _detail
	_detail = null
	var tw := d.create_tween()
	tw.tween_property(d, "modulate:a", 0.0, 0.18)
	tw.tween_callback(d.queue_free)
	_bg_mat.set_shader_parameter("tint", Skins.RARITY_COL[_tier])


# ------------------------------------------------------------------------------ ten

## Ten cards fan out of the burst into two rows, face down, their edges glowing what's under.
func _deal() -> void:
	var vs := size
	var gap := vs.y * 0.025
	var ch := minf((vs.y * 0.7 - gap) * 0.5, (vs.x * 0.86 - gap * 4.0) / 5.0 * 1.4)
	var cw := ch / 1.4
	var x0 := (vs.x - (cw * 5.0 + gap * 4.0)) * 0.5
	var y0 := vs.y * 0.08
	for i in results.size():
		var r: Dictionary = results[i]
		var c := SkinCard.new(r.skin, cw, ch)
		c.set_face(false)
		c.position = _cap_at - Vector2(cw, ch) * 0.5
		c.scale = Vector2(0.2, 0.2)
		c.rotation = randf_range(-1.2, 1.2)
		c.modulate.a = 0.0
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var target := Vector2(x0 + (i % 5) * (cw + gap), y0 + (i / 5) * (ch + gap))
		_ui.add_child(c)
		_cards.append(c)
		var tw := c.create_tween().set_parallel()
		var dl := i * 0.055
		tw.tween_property(c, "position", target, 0.5).set_delay(dl).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "scale", Vector2.ONE, 0.45).set_delay(dl).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "rotation", 0.0, 0.45).set_delay(dl)
		tw.tween_property(c, "modulate:a", 1.0, 0.15).set_delay(dl)
		tw.tween_callback(func() -> void: sound.play("flip", 0.35, 1.3)).set_delay(dl)
		var idx := i
		c.pressed.connect(func() -> void: _open_card(idx))
	_bg_mat.set_shader_parameter("at", Vector2(0.5, 0.42))
	_bg_mat.set_shader_parameter("power", 0.25)
	_bg_mat.set_shader_parameter("rays", 0.25)
	# then they turn over, one by one
	_flip_tw = create_tween()
	_flip_tw.tween_interval(0.5 + results.size() * 0.055)
	for i in results.size():
		var r: Dictionary = results[i]
		var t := int(r.skin.r)
		if t == Skins.EPIC:
			# an Epic holds its breath: it trembles and its edge flares before it turns
			var c := _cards[i]
			_flip_tw.tween_callback(func() -> void:
				sound.play("riser", 0.5, 3.4)
				var tr := c.create_tween()
				for k in 8:
					tr.tween_property(c, "rotation", 0.05 * (1 if k % 2 == 0 else -1), 0.05)
				tr.tween_property(c, "rotation", 0.0, 0.05))
			_flip_tw.tween_method(func(v: float) -> void: c.set_glow(v), 1.0, 2.6, 0.45)
		_flip_tw.tween_callback(_flip.bind(i))
		_flip_tw.tween_interval(0.16 if t == Skins.COMMON else 0.32)
	_flip_tw.tween_callback(_dealt)


func _flip(i: int) -> void:
	var c := _cards[i]
	if c.face_up:
		return
	_flipped += 1
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
		c.scale.y = 1.0
		tw.tween_property(c, "scale", Vector2(1.12, 1.12), 0.1)
		tw.tween_property(c, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	sound.play("flip", 0.6)
	if t == Skins.RARE:
		sound.play("chime1", 0.45)
	elif t == Skins.EPIC:
		sound.play("chime2", 0.75)
		_shake = 12.0
		_flash = 0.45
		_bg_mat.set_shader_parameter("tint", Skins.RARITY_COL[2])
		_sparks.position = c.position + c.size * 0.5
		_sparks.color_ramp = _ramp(Skins.RARITY_COL[2])
		_sparks.amount = 120
		_sparks.restart()


## Every card is up: the buttons, and the cards open on a tap.
func _dealt() -> void:
	if _phase == "dealt":
		return
	_phase = "dealt"
	for i in _cards.size():
		_flip(i)
		_cards[i].mouse_filter = Control.MOUSE_FILTER_STOP
	var vs := size
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
	_ui.add_child(row)
	var rs := row.get_combined_minimum_size()
	row.size = rs
	row.position = Vector2((vs.x - rs.x) * 0.5, vs.y - rs.y - maxf(16.0, vs.y * 0.04))
	var hint := MenuKit.label("Tap a card to look closer", 13, 600, UiTheme.MUTED)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.size = Vector2(vs.x, 18)
	hint.position = Vector2(0, row.position.y - 26)
	_ui.add_child(hint)
	for c in [row, hint]:
		c.modulate.a = 0.0
		c.create_tween().tween_property(c, "modulate:a", 1.0, 0.3)


func _open_card(i: int) -> void:
	if _phase != "dealt" or _detail != null:
		return
	app.tap("select")
	_reveal(results[i], true)


# ------------------------------------------------------------------------------ taps

func _gui_input(e: InputEvent) -> void:
	if not (e is InputEventMouseButton and (e as InputEventMouseButton).pressed):
		return
	_skip()


func _skip() -> void:
	if _phase == "in" or _phase == "charge":
		# straight to the burst
		_t = _burst_at
		if _cap.position.y < 0:
			_cap.position = _cap_at - _cap_size * 0.5
		_burst()
	elif _phase == "burst" and not _cards.is_empty():
		# turn the rest over at once
		if _flip_tw != null and _flip_tw.is_valid():
			_flip_tw.kill()
		_dealt()


func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("ui_cancel"):
		get_viewport().set_input_as_handled()
		if _detail != null:
			_close_detail()
		elif _phase == "dealt" or (_phase == "burst" and results.size() == 1):
			finished.emit("done", null)
		else:
			_skip()
