## The crowd's mood with its sound cues (src/audio/crowd.ts CrowdMood): the excitement maths is
## the visuals' CrowdMood (render/venue/crowd_mood.gd), and this adds what that port leaves out:
## the one-off reactions each moment calls for (gasps, cheers, boos when nothing happens,
## whistles), with their per-kind cooldowns, and the applause level.
## Pure logic, like the web class: CrowdAudio plays what it decides.
class_name CrowdMoodCues
extends CrowdMood

## One reaction to play (crowd.ts CrowdCue): "ooh", "cheer", "boo" or "whistle".
class Cue:
	var kind: String
	var gain: float
	var delay: float

	func _init(k: String, g: float, d: float) -> void:
		kind = k
		gain = g
		delay = d


## Reactions decided since the last time the player took them (crowd.ts CrowdMood.cues).
var cues: Array[Cue] = []
## 0..1: how hard the house is clapping.
var applause := 0.0
var _applause_hold := 0.0
## When each kind may sound again (crowd.ts CrowdMood.cool), on the mood's own clock.
var _cool := {}


## crowd.ts CrowdMood.cue: a reaction, unless one of its kind sounded too recently.
func _cue(kind: String, gain: float, delay := 0.0, cooldown := 1.2) -> void:
	if float(_cool.get(kind, 0.0)) > _t:
		return
	_cool[kind] = _t + cooldown
	cues.append(Cue.new(kind, gain, delay))


## crowd.ts CrowdMood.clap.
func _clap(level: float, hold: float) -> void:
	applause = maxf(applause, level)
	_applause_hold = maxf(_applause_hold, hold)


## crowd.ts CrowdMood.event: the excitement (CrowdMood.event), then the cues and claps.
func event(type: String, data) -> void:
	super.event(type, data)
	match type:
		"count":
			# and roars along with each number
			_cue("cheer", 0.25 + (3.0 - float(data)) * 0.1, 0.05, 0.0)
		"fightStart":
			_cue("cheer", 0.7)
			_clap(0.6, 2.0)
		"fistBump":
			_cue("cheer", 0.5, 0.05, 0.0)
			_clap(0.8, 1.5)
		"hit":
			if data.shielded:
				return
			if data.blocked:
				if data.guardBreak:
					_cue("ooh", 0.45)
				return
			var k := minf(1.0, float(data.damage) / 100.0)
			# (the combo count is the one CrowdMood.event just updated)
			if _combo_n == 3:
				_cue("whistle", 0.5, 0.15, 2.0)
			elif _combo_n >= 4:
				_cue("cheer", 0.35, 0.05, 2.5)
			if not data.knockdown and (k >= 0.55 or data.crit):
				_cue("ooh", 0.5 + 0.4 * k, 0.04)
			elif not data.knockdown and data.counter and k > 0.3:
				_cue("ooh", 0.4, 0.04)
		"knockdown":
			_cue("cheer", 0.9, 0.05, 0.5)
			_cue("whistle", 0.5, 0.5, 0.5)
		"detach":
			_cue("ooh", 0.9, 0.0)
			_cue("cheer", 0.85, 0.25, 0.5)
		"debrisCrowd":
			# screams, then a roar as someone holds the part up
			_cue("ooh", 0.8, 0.0, 0.8)
			_cue("cheer", 1.0, 0.35, 0.8)
			cues.append(Cue.new("whistle", 0.5, 0.9))
		"finisher":
			_cue("ooh", 0.85, 0.0)
			_cue("cheer", 0.8, 0.35, 0.5)
		"stagger":
			_cue("ooh", 0.45, 0.05)
		"takedown":
			_cue("ooh", 0.75, 0.0)
		"sprawl", "takedownStuffed":
			_cue("ooh", 0.4, 0.05)
		"dodge":
			if randf() < 0.15:
				_cue("ooh", 0.22, 0.05, 3.0)
		"getupFail":
			# they were nearly up
			_cue("ooh", 0.55, 0.05)
		"getUp":
			_clap(0.6, 1.5)
			_cue("cheer", 0.4, 0.0, 1.0)
		"ko":
			_cool.clear()
			_cue("cheer", 1.0, 0.05, 0.0)
			_cue("ooh", 0.6, 0.0, 0.0)
			cues.append(Cue.new("cheer", 0.8, 0.8))
			cues.append(Cue.new("whistle", 0.6, 0.6))
			cues.append(Cue.new("whistle", 0.5, 1.5))
			_clap(1.0, 5.0)
		"decision":
			_cue("cheer", 0.7, 0.2, 0.0)
			cues.append(Cue.new("whistle", 0.45, 0.9))
			_clap(0.9, 4.0)


## crowd.ts CrowdMood.tick: the excitement (CrowdMood.tick), the walk-out's cheer, the restless
## crowd's boos or whistle once nothing has landed for a while, and the applause dying away.
func tick(dt: float, phase: String, clock: float, hp0: float, hp1: float) -> void:
	var walkout := phase == "intro" and not _live
	var was_lull := _lull
	super.tick(dt, phase, clock, hp0, hp1)
	if walkout:
		_cue("cheer", 0.7, 0.1, 0.0)
		_clap(0.6, 2.5)
	if _lull and not was_lull:
		if randf() < 0.55:
			_cue("boo", 0.5, 0.0, 10.0)
		else:
			_cue("whistle", 0.4, 0.0, 6.0)
	if _applause_hold > 0.0:
		_applause_hold -= dt
	else:
		applause *= exp(-dt / 1.2)
