## The big calls in the middle of the screen (hud.ts count, callout, refEl, finish, finBan): the
## countdown, FIGHT!, the callouts, the referee's count, the end-of-fight word and the finisher's
## banner.
class_name HudCalls
extends HudPart

## The scene on its own (Game.auto) offers a tap for the next fight once this one is over.
var can_restart := false
var v := {}
var _font: Font
var _a := 1.0


func start(_m) -> void:
	_font = ThemeDB.fallback_font


func capture(match_) -> void:
	v = FightHud.snapshot(match_)


func tick(_dt: float) -> void:
	queue_redraw()


func _draw() -> void:
	if v.is_empty():
		return
	_banner(clampf(size.y / 720.0, 0.6, 2.0))


func _banner(u: float) -> void:
	var text := ""
	var sub := ""
	var col := Color.WHITE
	match v.phase:
		"countdown":
			text = "%d" % maxi(1, ceili(3.0 - v.phaseTime))
		"greet":
			text = "FIGHT!"
			col = Color(1, 0.75, 0.2)
		"fight":
			if v.phaseTime < 0.8:
				text = "FIGHT!"
				col = Color(1, 0.75, 0.2)
		"ko", "end":
			var r = v.result
			text = str(r) + "!" if r != null else "KO!"
			col = Color(1, 0.3, 0.25)
			if v.winner != null:
				sub = v.winner + " wins"
			elif r == "Draw":
				sub = "A draw"
			if can_restart:
				sub += "\nTap for the next fight"
	if text == "":
		return
	# the result clears off once the fight's over (hud.ts .finish.out, 0.5s; a decision's
	# TIME! callout holds 1.8s): the loser's ride out has the screen
	_a = 1.0
	if v.phase == "end":
		var hold := 1.8 if str(v.result) == "Decision" else 0.0
		_a = clampf(1.0 - (float(v.phaseTime) - hold) / (0.4 if hold > 0.0 else 0.5), 0.0, 1.0)
		if _a <= 0.0:
			return
	var room := size.x - 2.0 * FightHud.side_margin(self)
	var fs := _fit(text, int(96 * u), room)
	var tw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var y := size.y * 0.45
	_text(Vector2(size.x * 0.5 - tw * 0.5, y), text, fs, col, int(10 * u))
	var lines := sub.split("\n")
	for k in lines.size():
		var s := lines[k]
		if s == "":
			continue
		var ss := _fit(s, int(30 * u), room)
		var sw := _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
		_text(Vector2(size.x * 0.5 - sw * 0.5, y + 56 * u + k * 40 * u), s, ss, Color.WHITE, int(6 * u))

## The font size `s` fits across `room` at, up to `fs`.
func _fit(s: String, fs: int, room: float) -> int:
	var tw := _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	return fs if tw <= room else maxi(8, int(fs * room / tw))

func _text(at: Vector2, s: String, fs: int, col: Color, outline := 0) -> void:
	draw_string_outline(_font, at + Vector2(0, 2), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(4, outline), Color(0, 0, 0, 0.75 * _a))
	col.a *= _a
	draw_string(_font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

