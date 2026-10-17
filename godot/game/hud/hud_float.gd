## The floating numbers pinned over the robots (hud.ts floatAt, style.css .dmg): damage, blocks, crits, heals and the coach's shouts.
## Each is placed where its world point lands on screen the frame it appears, then stays put on
## screen while it rises and fades (the web sets left/top once and animates the transform).
class_name HudFloat
extends HudPart

## sim/body.ts J.Chest, J.Head.
const J_CHEST := 1
const J_HEAD := 3
## hud.ts floatAt: no more than 15 up at once.
const MAX := 15
## sim/coach.ts COACH_LABEL.
const COACH_LABEL := {"go": "Go in!", "allIn": "All in!!!", "defend": "Defend.", "head": "For the head!"}
const BLK := Color(0.624, 0.875, 1.0)

## The numbers up: {text, size (in em), col, dur, at (world, until placed), pos, placed, t}.
var _items: Array[Dictionary] = []
## hud.ts hpPrev / healAcc: health gained since the last heal popup, per bot.
var _hp_prev := [0.0, 0.0]
var _heal_acc := [0.0, 0.0]
## style.css --broadcast. (.dmg.coach's letter-spacing 0.04em is under a pixel: left out.)
var _font: Font
## Canvas units per CSS pixel, measured when the em changes.
var _em := -1.0
var _px := 1.0


func start(mm) -> void:
	_items.clear()
	_font = HudKit.broadcast()
	for i in 2:
		_hp_prev[i] = float(mm.fighters[i].hp)
		_heal_acc[i] = 0.0
	queue_redraw()


func stop() -> void:
	_items.clear()
	queue_redraw()


## hud.ts update: health coming back (siphon) pops up green once 12 or more has come back.
func capture(mm) -> void:
	for i in 2:
		var f = mm.fighters[i]
		var hp: float = f.hp
		var dh: float = hp - float(_hp_prev[i])
		if dh > 0.0:
			_heal_acc[i] += dh
		_hp_prev[i] = hp
		if _heal_acc[i] >= 12.0:
			_add(_v(f.body.pos[J_CHEST]), "+%d" % roundi(_heal_acc[i]), "heal")
			_heal_acc[i] = 0.0


## hud.ts onEvent: the hit's number where it landed, and the coach's call over the bot's head.
func on_event(type: String, d) -> void:
	match type:
		"hit":
			# a finisher plays without numbers: just the moves
			if d.get("finisher") == true:
				return
			if d.get("shielded") == true:
				_add(_v(d.point), "SHIELD", "blk")
				return
			var dmg := roundi(float(d.damage))
			if d.get("blocked") == true:
				if dmg >= 4:
					_add(_v(d.point), str(dmg), "blk")
				return
			var crit: bool = d.get("crit") == true
			_add(_v(d.point), "%d!" % dmg if crit else str(dmg), "crit" if crit else "")
		"coach":
			var k := str(d.kind)
			_add(_v(d.f.body.pos[J_HEAD]), str(COACH_LABEL.get(k, k)), "coach " + k)


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


## hud.ts floatAt with style.css's .dmg classes: size in em, colour, how long it plays.
func _add(at: Vector3, text: String, cls: String) -> void:
	if _items.size() >= MAX:
		return
	var sz := 1.15
	var col := Color.WHITE
	var dur := 0.9
	match cls:
		"crit":
			sz = 1.6
			col = HudKit.AMBER
		"blk":
			sz = 0.85
			col = BLK
		"heal":
			sz = 0.85
			col = HudKit.GREEN
		"coach go":
			sz = 1.3
			col = HudKit.AMBER
		"coach allIn":
			sz = 1.5
			col = HudKit.RED
		"coach defend":
			sz = 1.3
			col = HudKit.CYAN
		"coach head":
			sz = 1.3
			col = HudKit.ORANGE
	if cls.begins_with("coach"):
		dur = 1.4
	_items.append({"text": text, "size": sz, "col": col, "dur": dur, "at": at, "pos": Vector2.ZERO, "placed": false, "t": 0.0})


func tick(dt: float) -> void:
	if _items.is_empty():
		return
	var cam := hud.cam if hud != null else null
	var e := em()
	if e != _em:
		_em = e
		_px = HudCoach.px(self)
	var p := _px
	var k := 0
	while k < _items.size():
		var it := _items[k]
		if not it.placed:
			# pinned where the point is on screen now, after this frame's camera move
			if cam == null or cam.is_position_behind(it.at):
				_items.remove_at(k)
				continue
			var s := cam.unproject_position(it.at)
			it.pos = Vector2(s.x + (randf() - 0.5) * 18.0 * p, s.y - 10.0 * p)
			it.placed = true
		else:
			it.t += dt
		if it.t >= it.dur:
			_items.remove_at(k)
			continue
		k += 1
	queue_redraw()


func _draw() -> void:
	if _items.is_empty():
		return
	var e := em()
	var p := _px
	for it in _items:
		var fs: float = it.size * e
		var t: float = it.t
		var dur: float = it.dur
		# @keyframes dmg (ease-out each step): in from 1.6x, up 0.6em, then on up to 2.6em, fading
		var a: float = HudKit.keyframes(t, dur, [[0.0, 0.0], [0.15, 1.0], [1.0, 0.0]], HudKit.ease_out)
		var ty: float = HudKit.keyframes(t, dur, [[0.0, 0.0], [0.15, -0.6], [1.0, -2.6]], HudKit.ease_out)
		var sc: float = HudKit.keyframes(t, dur, [[0.0, 1.6], [0.15, 1.0], [1.0, 0.9]], HudKit.ease_out)
		if a <= 0.003:
			continue
		var font := _font
		var isz := int(round(fs))
		var text: String = it.text
		var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, isz).x
		# the box (line-height 1.25) hangs from the point, centred on it; it scales about its middle
		var mid: Vector2 = it.pos + Vector2(0.0, 0.625 * fs + ty * fs)
		var asc := font.get_ascent(isz)
		var desc := font.get_descent(isz)
		draw_set_transform(mid, 0.0, Vector2(sc, sc))
		var at := Vector2(-tw * 0.5, (asc - desc) * 0.5)
		var col: Color = it.col
		# text-shadow: 0 2px 0 rgba(0,0,0,.6), 0 0 12px rgba(0,0,0,.5)
		draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, isz, maxi(2, roundi(8.0 * p)), Color(0, 0, 0, 0.16 * a))
		draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, isz, maxi(1, roundi(3.0 * p)), Color(0, 0, 0, 0.2 * a))
		draw_string(font, at + Vector2(0, 2.0 * p), text, HORIZONTAL_ALIGNMENT_LEFT, -1, isz, Color(0, 0, 0, 0.6 * a))
		draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, isz, Color(col, col.a * a))
	draw_set_transform_matrix(Transform2D.IDENTITY)
