## The crowd's mood (src/audio/crowd.ts CrowdMood, without its sound cues): an excitement level
## pushed up by what happens in the fight (big shots, combos, knockdowns, a close finish) and
## relaxing back to a floor that itself rises with the tension. The fans in the stands
## (ArenaCrowd.update) follow `excite`; the crowd you hear will too once it is ported.
class_name CrowdMood
extends RefCounted

var excite := 0.2
var _hold := 0.0
var _since_landed := 0.0
var _lull := false
## A fight was on screen last tick (the house goes up the moment one starts).
var _live := false
var _combo_who := -1
var _combo_n := 0
var _combo_t := -9.0
var _t := 0.0


func _bump(x: float) -> void:
	excite = minf(1.0, excite + x * (1.0 - excite * 0.5))


## A match event (crowd.ts CrowdMood.event), plus "debrisCrowd" for a part landing in the seats.
func event(type: String, data) -> void:
	match type:
		"count":
			# the house counts down with the screen, louder each number
			_bump(0.12 + (3.0 - float(data)) * 0.08)
			_hold = maxf(_hold, 0.9)
		"fightStart":
			_bump(0.5)
		"fistBump":
			_bump(0.2)
		"hit":
			if data.shielded:
				_bump(0.04)
				return
			if data.blocked:
				_bump(0.2 if data.guardBreak else 0.03)
				return
			var k := minf(1.0, float(data.damage) / 100.0)
			_bump(0.05 + 0.3 * k)
			_since_landed = 0.0
			_lull = false
			# combos: the same fighter landing again and again
			var a := int(data.attacker.index)
			if a == _combo_who and _t - _combo_t < 1.6:
				_combo_n += 1
			else:
				_combo_who = a
				_combo_n = 1
			_combo_t = _t
			if _combo_n == 3:
				_bump(0.15)
		"knockdown":
			excite = 1.0
			_hold = 1.5
		"detach":
			# a part torn clean off: the house comes up out of its seats
			excite = 1.0
			_hold = maxf(_hold, 1.8)
		"debrisCrowd":
			excite = 1.0
			_hold = maxf(_hold, 2.5)
		"finisher":
			excite = 1.0
			_hold = maxf(_hold, 3.0)
		"stagger":
			_bump(0.2)
		"takedown":
			excite = maxf(excite, 0.8)
		"clinch":
			_bump(0.08)
		"sprawl", "kickCatch", "takedownStuffed":
			_bump(0.15)
		"dodge":
			_bump(0.04)
		"ropes":
			_bump(0.06)
		"getupFail":
			_bump(0.15)
		"getUp":
			_bump(0.3)
		"ko":
			excite = 1.0
			_hold = 4.5
		# a tag team match: the hot tag, a bot knocked out of the match, the double team
		"tag":
			_bump(0.5)
			_hold = maxf(_hold, 1.0)
		"eliminated":
			excite = 1.0
			_hold = maxf(_hold, 3.5)
		"assist":
			excite = 1.0
			_hold = maxf(_hold, 2.5)
		"tagResume":
			_bump(0.3)
		"decision":
			excite = maxf(excite, 0.8)
			_hold = 2.0


## Advances the mood (crowd.ts CrowdMood.tick). `phase` is the match phase, or "" outside a
## fight; `clock` and `hp0`/`hp1` (0..1) only matter while one is on.
func tick(dt: float, phase: String, clock: float, hp0: float, hp1: float) -> void:
	_t += dt
	var floor_ := 0.15
	# the fighters walk out to a full house: noise from the first second, not the bell
	if phase == "intro" and not _live:
		excite = maxf(excite, 0.6)
	_live = phase != ""
	if _live:
		if phase == "intro" or phase == "countdown" or phase == "greet":
			floor_ = 0.55
		elif phase == "fight":
			floor_ = 0.22
			# the last seconds and a close, bloody fight lift everyone
			if clock < 15.0:
				floor_ += (15.0 - clock) / 15.0 * 0.35
			if minf(hp0, hp1) < 0.3:
				floor_ += 0.12
			if hp0 < 0.35 and hp1 < 0.35:
				floor_ += 0.1
			# nothing landing for a while: the crowd gets restless
			_since_landed += dt
			if _since_landed > 7.0:
				floor_ = minf(floor_, 0.1)
				_lull = true
		else:
			floor_ = 0.35
	if _hold > 0.0:
		_hold -= dt
	elif excite > floor_:
		excite = floor_ + (excite - floor_) * exp(-dt / 3.0)
	else:
		excite += (floor_ - excite) * (1.0 - exp(-dt / 1.5))
