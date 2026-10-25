## Titan battles' cameras (render/titan): how the city films two 30 m giants fighting in its
## harbour square. No lens floats in the air beside them (that is what made them look small):
## every shot comes from somewhere a camera crew could really be, at a real distance, with the
## long lens that distance needs: up the scaffold towers in the press pen round the stage, on
## the roofs round the square, down on the paving at the barrier looking up, crouched on the
## deck's apron at their feet, a fan's phone held up over the crowd, the news helicopter
## circling, the cable cam strung over the ring, a boat in the harbour. The operators follow the
## action a beat late, crash-zoom on the big hits, and their pictures shake as the ground jumps.
##
## The Director hands it the match in titan battles (Director.titan): step() sets the
## director's lens (_pos, _look, _fov, _roll) every sim step and counts the cuts; the director
## still eases between steps and shakes the picture (shake_k: how much the ground's shaking
## reaches this shot's lens). It draws from an Rng of its own, seeded from the match: the web
## game has no titans to agree with, and online each phone films the fight its own way anyway.
class_name TitanCam
extends RefCounted

const J_PELVIS := 0
const J_CHEST := 1
const J_HEAD := 3
const J_FOOT_L := 12
const J_FOOT_R := 15
const FRAME_JOINTS := [3, 1, 0, 6, 9, 11, 14, 12, 15]
const JOINT_ROOM := [0.94, 1.0, 1.0, 1.08, 1.08, 1.0, 1.0, 1.1, 1.1]

## The scaffold camera towers in the press pen inside the crowd barrier (TitanProps builds them
## at these angles, each looking in between two of the ring's posts): their platforms are level
## with the deck, the lens 3 m over it.
const TOWER_R := 9.4
const TOWER_DEG := [45.0, 90.0, 135.0, 225.0, 270.0, 315.0]
const TOWER_TOP := 0.02
const TOWER_EYE := TOWER_TOP + 0.2
## At the barrier: a cameraman standing on the paving (1.7 m).
const STREET_R := 9.55
const STREET_EYE := TitanCity.PLAZA_Y + 0.115
## A fan's phone, held up over the heads a few rows back.
const FAN_EYE := TitanCity.PLAZA_Y + 0.158
## On the deck's apron, outside the ropes (the middle of it: the octagon's apothem), crouched
## (1.2 m).
const APRON_R := 4.88
const APRON_EYE := 0.08
## How far round from a corner (rad) the apron's operator keeps.
const APRON_CLEAR := 0.16
## The deck's edge (the stage's lip): lenses below the deck can't see past it.
const DECK_EDGE := 5.2
## Shot kind, weight when it's calm, weight when the fight is hot: the lenses that show the titans
## among people-sized things (the street, the roofs) come up most.
const WEIGHTS := [
	["tower", 1.6, 1.5],
	["roof", 2.0, 1.4],
	["street", 1.4, 1.8],
	["apron", 0.9, 1.8],
	["fan", 0.0, 0.0],
	["heli", 1.2, 0.6],
	["sky", 0.6, 0.7],
	["boat", 0.7, 0.35],
]
## How much the ground's shaking reaches each kind of lens (the helicopter rides above it, the
## boat on the water; the crews on the paving and the apron feel every step).
const GROUND := {
	"tower": 0.75, "roof": 0.45, "street": 0.95, "apron": 1.25, "fan": 0.9, "heli": 0.0,
	"sky": 0.3, "boat": 0.1, "present": 1.0, "count": 0.3, "fill": 0.4, "pov": 0.6,
}
## Least time between two titan's-eye shots, and the chance a cut goes to one.
const POV_GAP := 22.0
const POV_CHANCE := 0.22


class TShot extends RefCounted:
	var kind := "tower"
	## How its lens moves: "fixed", "ring" (round the square at a, r, h), "apron" (round the
	## deck's apron), "heli" (circling), "sky" (gliding after the fight), "count" (the drop).
	var mode := "fixed"
	var t := 0.0
	var dur := 6.0
	## Where the lens is (moving stations work it out each step from a, r, h).
	var eye := Vector3.ZERO
	var a := 0.0
	var rate := 0.0
	var r := 0.0
	var h := 0.0
	## How much of the frame the titans may fill, and the lens's widest and longest (degrees).
	var fill := 0.72
	var fov_min := 5.0
	var fov_max := 42.0
	## How quickly the operator's aim and zoom follow (1/s).
	var aim := 2.4
	var zoom := 1.3
	## Handheld wobble (rad), a dutch roll.
	var hand := 0.002
	var roll := 0.0
	var subject := -1
	var bias := 0.0
	## Aim above (+) the framing's centre, as a share of the half frame.
	var lift := 0.0


## The director this is filming for (set for the length of each call: no reference cycle).
var d: Director = null
var shot := TShot.new()
## How much the ground's shaking reaches the current lens.
var shake_k := 0.8
var _rng: TMath.Rng
var _t := 0.0
var _heat := 0.0
var _kick := Vector3.ZERO
var _crash := 0.0
var _cut_in := -1.0
var _next := ""
var _down_i := 0
var _was_down := [false, false]
var _beat := ""
var _pov_gap := 0.0
var _hold := 0.0
## The operator's aim (a point) and zoom, eased.
var _aim := Vector3.ZERO
var _fov := 30.0
var _roll := 0.0
var _pts := PackedVector3Array()
var _room := PackedFloat32Array()
var _n := 0
var _c := Vector3.ZERO
var _sep := 1.0
var _axis := 0.0
## Where the fill shots and the countdown start from.
var _fl_n := 0
var _fl_kind := -1
var _roofs: Array[Vector3] = []


func _init() -> void:
	_pts.resize(18)
	_room.resize(18)
	_rng = TMath.Rng.new(1.0)


## A new fight (Director.begin): everything back to a fixed state, seeded from the match.
## `roofs`: the roofs round the square a crew can film from (TitanCity.roof_spots).
func begin(dir: Director, m, roofs: Array[Vector3]) -> void:
	d = dir
	_rng = TMath.Rng.new(JS.ushr(JS.bxor(m.seed_, float(0x7174a2)), 0.0))
	_t = 0.0
	_heat = 0.0
	_kick = Vector3.ZERO
	_crash = 0.0
	_cut_in = -1.0
	_next = ""
	_was_down = [false, false]
	_beat = ""
	_pov_gap = 0.0
	_hold = 0.0
	_fl_n = 0
	_fl_kind = -1
	shot = TShot.new()
	shot.kind = "none"
	_roofs = roofs
	d = null


# ------------------------------------------------------------------ events

## A blow landed (Director.cue): the fight heats up, the operator glances at it and on a big one
## crash-zooms in.
func cue(type: String, data) -> void:
	if type == "detach":
		_hold = 0.8
		_crash = maxf(_crash, 0.7)
	if type != "hit" or data.shielded:
		return
	var p = data.point
	var point := Vector3(p.x, p.y, p.z)
	var blocked: bool = data.blocked
	var damage: float = data.damage
	_heat = minf(3.0, _heat + (0.15 if blocked else 0.3 + damage / 80.0))
	if JS.truthy(data.get("finisher")):
		_kick = (point - _c) * 0.1
		_crash = maxf(_crash, 0.6)
		return
	var big: bool = not blocked and (damage >= 50.0 or JS.truthy(data.crit) or JS.truthy(data.knockdown))
	_kick = (point - _c) * (0.3 if big else 0.06 if blocked else 0.12)
	if _kick.length() > 0.5:
		_kick = _kick.normalized() * 0.5
	if big:
		_crash = maxf(_crash, 0.75 if damage < 80.0 else 1.0)
		if not JS.truthy(data.knockdown) and shot.t > 1.5 and _cut_in < 0.0 and _rng.next() < 0.35:
			_cut_in = 0.6 + _rng.next() * 0.4


# ------------------------------------------------------------------ the match

func step(dir: Director, dt: float, m) -> void:
	d = dir
	_step(dt, m)
	d = null


func _step(dt: float, m) -> void:
	_t += dt
	var pa = m.fighters[0].body.pos[J_PELVIS]
	var pb = m.fighters[1].body.pos[J_PELVIS]
	var sx: float = pb.x - pa.x
	var sz: float = pb.z - pa.z
	_sep = sqrt(sx * sx + sz * sz)
	if _sep > 0.3:
		_axis = atan2(sz, sx)
	_heat = maxf(0.0, _heat - dt * 0.3)
	_hold = maxf(0.0, _hold - dt)
	_crash = maxf(0.0, _crash - dt * 0.9)
	_kick *= exp(-3.0 * dt)
	shot.t += dt
	var ph: String = m.phase
	var fill: bool = ph == "intro" and m.phaseTime >= TEntrance.PRESENT * 2.0
	var beat := ""
	if fill:
		beat = "fill"
	elif ph == "intro":
		beat = "p%d" % int(m.presenting)
	elif ph == "countdown":
		beat = "count"
	var cut := beat != _beat
	_beat = beat
	var pov := d._shot.kind == "pov"
	if pov and (d._shot.t < Director.POV_MIN or (ph == "fight" and m.fin == null and d._shot.t < d._shot.dur and d._pov_ok(m, d._pov_by))):
		# the titan's-eye shot plays out on the director's own lens
		d._shot.t += dt
		d._pov_frame(dt, m)
		shake_k = GROUND.pov
		return
	if pov:
		d._end_pov()
		d._shot = Director.make_shot("wide", d._rng)
		d._shot.kind = "titan"
		_pov_gap = 0.0
		shot.kind = "none"
	if not pov:
		_pov_gap += dt
	if fill:
		if cut or shot.t > shot.dur:
			_fill_shot(m)
	elif ph == "intro":
		_present(m, cut)
		return
	elif ph == "countdown":
		if cut:
			_count_shot(m)
	elif ph == "greet":
		if shot.kind != "greet":
			_cut(m, "greet")
	elif ph == "ko":
		if shot.kind != "ko" and d._ko_focus >= 0 and _hold <= 0.0:
			_cut(m, "ko")
	elif ph == "end" and m.winner != null:
		if shot.kind != "win":
			_cut(m, "win")
	elif m.fin != null:
		if shot.kind != "fin" and _hold <= 0.0:
			_cut(m, "fin")
	else:
		if shot.kind == "count" or shot.kind == "none":
			_cut(m, "tower" if shot.kind == "count" else "")
		elif shot.kind == "greet":
			# the touch-gloves shot holds into the first exchange
			shot.kind = "tower"
			shot.dur = shot.t + 1.5
		_direct(dt, m)
		if d._shot.kind == "pov":
			return
	_frame(dt, m)


## When to cut, and to what.
func _direct(dt: float, m) -> void:
	for f in m.fighters:
		var i := int(f.index)
		var down: bool = f.isDown
		if down and not _was_down[i] and f.state != "ko":
			_next = "down"
			_cut_in = 0.45
			_down_i = i
		if not down and _was_down[i] and shot.kind == "down":
			shot.dur = minf(shot.dur, shot.t + 1.0)
		_was_down[i] = down
	if _hold > 0.0:
		_cut_in = maxf(0.0, _cut_in - dt) if _cut_in >= 0.0 else _cut_in
		return
	if _cut_in >= 0.0:
		_cut_in -= dt
		if _cut_in < 0.0:
			var k := _next
			_next = ""
			_cut(m, k)
			return
	var busy := false
	for f in m.fighters:
		if f.strike != null and f.strike.phase != "recovery":
			busy = true
	if (shot.t > shot.dur and not busy) or shot.t > shot.dur + 2.5:
		_cut(m)


## Hard cut to a new shot: the best of a few candidates.
func _cut(m, kind: String = "") -> void:
	if kind == "" and _pov_gap > POV_GAP and _rng.next() < POV_CHANCE:
		var first := d.player if _rng.next() < 0.6 else 1 - d.player
		var by := first if d._pov_ok(m, first) else (1 - first if d._pov_ok(m, 1 - first) else -1)
		if by >= 0:
			d._shot = Director.make_shot("pov", d._rng)
			d._shot.dur = Director.POV_MIN + 0.5 + _rng.next() * 3.0
			d._shot.subject = 1 - by
			d._shot.wobble = 0.0
			d._pov_by = by
			d.cuts += 1
			d._pov_eye = d._eye_target(m, by)
			d._pov_look = d._gaze_target(m, by)
			d._pov_roll = 0.0
			d._fov = d._pov_fov()
			d._pov_frame(0.0, m)
			shot.kind = "pov"
			_cut_in = -1.0
			return
	var prev := shot
	var prev_dir := (prev.eye - _c).normalized() if prev.kind != "none" else Vector3.ZERO
	var best: TShot = null
	var best_score := INF
	var tries := 5 if kind != "" else 8
	for i in tries:
		var k := kind
		if k == "":
			var hot := clampf(_heat / 1.5, 0.0, 1.0)
			var sum := 0.0
			for w in WEIGHTS:
				if w[0] != prev.kind:
					sum += lerpf(w[1], w[2], hot)
			var x := _rng.next() * sum
			k = "tower"
			for w in WEIGHTS:
				if w[0] == prev.kind:
					continue
				x -= lerpf(w[1], w[2], hot)
				if x <= 0.0:
					k = w[0]
					break
		var s := _make(k, m)
		if s == null:
			continue
		_place(s, 0.0)
		var score := _score(s, m)
		# a cut should look clearly different from what it cuts from
		if prev_dir != Vector3.ZERO:
			var nd := (s.eye - _c).normalized()
			if nd.dot(prev_dir) > 0.93 and absf(s.eye.distance_to(_c) / maxf(0.1, prev.eye.distance_to(_c)) - 1.0) < 0.35:
				score += 1.5
		score += _rng.next() * 0.5
		if score < best_score:
			best_score = score
			best = s
	if best == null:
		best = _make("heli", m)
		_place(best, 0.0)
	shot = best
	d._shot.kind = "titan"
	d._shot.subject = shot.subject
	d.cuts += 1
	_cut_in = -1.0
	_kick = Vector3.ZERO
	shake_k = GROUND.get(shot.kind, 0.6)
	# the operator is already on them as the cut lands
	_gather(m, shot)
	_aim = _target(shot)
	_fov = _fit(shot)
	_roll = shot.roll
	_frame(0.0, m)


## A shot of kind k for the fight as it stands, or null when there's none to be had.
func _make(k: String, m) -> TShot:
	var s := TShot.new()
	s.kind = k
	var r := _rng
	var home := _home_angle()
	match k:
		"tower":
			# the tower nearest a good angle on the home side
			var want := home + (r.next() - 0.5) * 1.3
			var best := 0
			var bd := INF
			for i in TOWER_DEG.size():
				var dd := absf(Director._wrap(deg_to_rad(TOWER_DEG[i]) - want))
				if dd < bd:
					bd = dd
					best = i
			var a := deg_to_rad(TOWER_DEG[best])
			s.eye = Vector3(cos(a) * TOWER_R, TOWER_EYE, sin(a) * TOWER_R)
			s.mode = "fixed"
			s.dur = 5.0 + r.next() * 3.5
			# (room round them for the deck, its marshals and the city behind: their size)
			s.fill = 0.56 + r.next() * 0.1
			s.fov_min = 9.0
			s.fov_max = 44.0
			s.aim = 2.2
			s.zoom = 1.1
			s.hand = 0.0012
			s.lift = 0.04
		"roof":
			if _roofs.is_empty():
				return null
			var want := home + (r.next() - 0.5) * 1.4
			var best := -1
			var bd := INF
			for i in _roofs.size():
				var p: Vector3 = _roofs[i]
				var dd := absf(Director._wrap(atan2(p.z, p.x) - want)) + r.next() * 0.25
				if dd < bd:
					bd = dd
					best = i
			s.eye = _roofs[best]
			s.dur = 5.5 + r.next() * 3.5
			# (wide, the titans high in the frame: the stage, its crews and the crowd below them)
			s.fill = 0.3 + r.next() * 0.1
			s.fov_min = 5.0
			s.fov_max = 34.0
			s.aim = 1.8
			s.zoom = 0.9
			s.hand = 0.0008
			s.lift = -0.2
		"street":
			s.mode = "ring"
			s.a = _clear_of_towers(home + (r.next() - 0.5) * 1.1)
			s.r = STREET_R
			s.h = STREET_EYE
			s.dur = 4.0 + r.next() * 2.5
			# (the press pen's people along the bottom of the frame, the titans over the deck's edge)
			s.fill = 0.5
			s.fov_min = 20.0
			s.fov_max = 50.0
			s.aim = 2.8
			s.zoom = 1.6
			s.hand = 0.004
			s.roll = (r.next() - 0.5) * 0.06
			s.lift = -0.15
		"fan":
			s.mode = "ring"
			s.a = home + (r.next() - 0.5) * 1.0
			# a few rows back, not in the boulevard
			s.r = TitanVenue.CROWD_R0 + 0.4 + r.next() * 1.8
			if absf(sin(s.a)) * s.r < 2.3:
				s.a += 0.3 * (1.0 if sin(s.a) >= 0.0 else -1.0)
			s.h = FAN_EYE
			s.dur = 3.2 + r.next() * 2.0
			s.fill = 0.9
			s.fov_min = 26.0
			s.fov_max = 52.0
			s.aim = 1.6
			s.zoom = 0.0
			s.hand = 0.012
			s.roll = (r.next() - 0.5) * 0.08
			s.lift = 0.05
		"apron":
			s.mode = "apron"
			s.a = home + (r.next() - 0.5) * 1.2
			s.r = APRON_R
			s.h = APRON_EYE
			s.rate = (r.next() - 0.5) * 0.08
			s.dur = 3.5 + r.next() * 2.5
			s.fill = 0.95
			s.fov_min = 42.0
			s.fov_max = 74.0
			s.aim = 3.0
			s.zoom = 2.0
			s.hand = 0.006
			s.roll = (r.next() - 0.5) * 0.1
			s.lift = 0.1
		"heli":
			s.mode = "heli"
			s.a = home + (r.next() - 0.5) * 1.6
			s.r = 18.0 + r.next() * 8.0
			s.h = 4.5 + r.next() * 3.5
			s.rate = (-1.0 if r.next() < 0.5 else 1.0) * (0.025 + r.next() * 0.025)
			s.dur = 5.0 + r.next() * 3.0
			# wide: the stage, the crowd packing the square, the streets round it
			s.fill = 0.24 + r.next() * 0.1
			s.fov_min = 6.0
			s.fov_max = 36.0
			s.aim = 1.4
			s.zoom = 0.6
			s.hand = 0.0025
			s.lift = -0.1
		"sky":
			# the cable cam, out over the apron at the titans' shoulders, the city behind them
			s.mode = "sky"
			s.a = home + (r.next() - 0.5) * 0.9
			s.r = 6.0 + r.next() * 2.0
			s.h = 1.9 + r.next() * 0.9
			s.rate = (r.next() - 0.5) * 0.08
			s.dur = 4.5 + r.next() * 3.0
			s.fill = 0.72
			s.fov_min = 20.0
			s.fov_max = 56.0
			s.aim = 2.0
			s.zoom = 1.5
			s.hand = 0.0015
		"boat":
			s.eye = Vector3((r.next() - 0.5) * 16.0, TitanCity.WATER_Y + 0.13, TitanCity.QUAY_Z - 4.5 - r.next() * 5.0)
			s.dur = 4.5 + r.next() * 2.5
			# the quay, the crowd along it and the stage over them
			s.fill = 0.42
			s.fov_min = 4.0
			s.fov_max = 26.0
			s.aim = 1.5
			s.zoom = 0.9
			s.hand = 0.0035
			s.lift = -0.1
		"down":
			# down on the deck: the apron, low by the fallen titan
			var p = m.fighters[_down_i].body.pos[J_PELVIS]
			var to_c := atan2(p.z, p.x)
			s.kind = "apron"
			s.mode = "apron"
			s.a = to_c + (r.next() - 0.5) * 0.9
			s.r = APRON_R
			s.h = APRON_EYE
			s.dur = 3.4
			s.fill = 0.9
			s.fov_min = 36.0
			s.fov_max = 70.0
			s.aim = 3.0
			s.zoom = 1.8
			s.hand = 0.006
			s.roll = (-1.0 if r.next() < 0.5 else 1.0) * 0.07
			s.subject = _down_i
			s.bias = 0.35
		"greet":
			s = _make("tower", m)
			s.kind = "greet"
			s.dur = 99.0
			s.fill = 0.7
		"fin":
			# a finisher: the street at the barrier, looking up at it, holding
			var by := int(m.fin.att.index)
			s = _make("street" if r.next() < 0.6 else "apron", m)
			s.kind = "fin"
			s.dur = 99.0
			s.subject = by
			s.bias = 0.2
			s.zoom = 0.8
		"ko":
			# the fallen titan from the apron, the winner standing over it
			var i := maxi(0, d._ko_focus)
			var p = m.fighters[i].body.pos[J_PELVIS]
			var w = m.fighters[1 - i].body.pos[J_PELVIS]
			var away := atan2(p.z - w.z, p.x - w.x)
			s.kind = "ko"
			s.mode = "apron"
			s.a = away + (r.next() - 0.5) * 0.8
			s.r = APRON_R
			s.h = APRON_EYE
			s.rate = (-1.0 if r.next() < 0.5 else 1.0) * 0.035
			s.dur = 99.0
			s.fill = 0.66
			s.fov_min = 30.0
			s.fov_max = 70.0
			s.aim = 1.6
			s.zoom = 0.7
			s.hand = 0.004
			s.roll = 0.05
			s.subject = i
			s.bias = 0.6
		"win":
			# the winner from below, the low sun behind it
			var i := int(m.winner.index)
			var p = m.fighters[i].body.pos[J_PELVIS]
			var sun := Vector2(TitanVenue.SUN_DIR.x, TitanVenue.SUN_DIR.z).normalized()
			var a := atan2(-sun.y, -sun.x) + (r.next() - 0.5) * 0.7
			s.kind = "win"
			s.mode = "ring"
			s.a = _clear_of_towers(a)
			s.r = STREET_R
			s.h = STREET_EYE
			if Vector2(p.x, p.z).length() > 2.5 or r.next() < 0.5:
				# near the deck's edge: the apron's view, wide, at its feet
				s.mode = "apron"
				s.a = atan2(p.z, p.x) + (r.next() - 0.5) * 0.6
				s.r = APRON_R
				s.h = APRON_EYE
			s.dur = 99.0
			s.fill = 0.62
			s.fov_min = 12.0
			s.fov_max = 70.0
			s.aim = 1.2
			s.zoom = 0.5
			s.hand = 0.003
			s.subject = i
			s.lift = 0.1
	return s


## Where the shot's lens is now (moving stations move: the helicopter circles, the cable cam
## glides with the fight, the apron's operator walks round).
func _place(s: TShot, dt: float) -> void:
	match s.mode:
		"ring":
			s.eye = Vector3(cos(s.a) * s.r, s.h, sin(s.a) * s.r)
		"apron":
			s.a += s.rate * dt
			# (clear of the corners: the pylons stand there, and their crews beside them)
			var corner := (floorf(s.a / (PI / 4.0)) + 0.5) * PI / 4.0
			var off := Director._wrap(s.a - corner)
			if absf(off) < APRON_CLEAR:
				var away := 1.0 if off >= 0.0 else -1.0
				s.a = corner + APRON_CLEAR * away
				s.rate = absf(s.rate) * away
			# the apron is an octagon round the ropes: the operator stays on it
			var k := floorf(s.a / (PI / 4.0) + 0.5)
			var face := cos(s.a - k * PI / 4.0)
			s.eye = Vector3(cos(s.a), 0, sin(s.a)) * (s.r / maxf(0.92, face)) + Vector3(0, s.h, 0)
		"heli":
			s.a += s.rate * dt
			s.eye = _c * Vector3(0.3, 0, 0.3) + Vector3(cos(s.a) * s.r, s.h, sin(s.a) * s.r)
		"sky":
			s.a += s.rate * dt
			var want := Vector3(_c.x, 0, _c.z) + Vector3(cos(s.a) * s.r, s.h, sin(s.a) * s.r)
			if s.eye == Vector3.ZERO or dt <= 0.0:
				s.eye = want
			else:
				s.eye = s.eye.lerp(want, 1.0 - exp(-0.8 * dt))


## How bad a candidate is: the player on the wrong side, one titan hiding the other, a lens that
## can't fit them.
func _score(s: TShot, m) -> float:
	_gather(m, s)
	var score := 0.0
	var fwd := (_c - s.eye)
	fwd.y = 0.0
	if fwd.length() < 0.01:
		return 99.0
	fwd = fwd.normalized()
	var right := fwd.cross(Vector3.UP)
	var pp = m.fighters[d.player].body.pos[J_PELVIS]
	var po = m.fighters[1 - d.player].body.pos[J_PELVIS]
	var across := (Vector3(pp.x - po.x, 0, pp.z - po.z)).dot(right)
	# the player's titan belongs on the left
	if _sep > 0.5 and across > 0.0:
		score += 2.5 * minf(1.0, across / 1.2)
	# looking along the fight line, one hides the other
	if _sep > 0.6:
		var line := Vector3(cos(_axis), 0, sin(_axis))
		score += maxf(0.0, absf(fwd.dot(line)) - 0.75) * 9.0
	var need := _fit(s)
	if need > s.fov_max * 1.05:
		score += (need / s.fov_max - 1.0) * 6.0
	# into the low sun the titans go grey in the glare (only the winner's shot wants them black
	# against it)
	if s.kind != "win":
		var sun := Vector3(TitanVenue.SUN_DIR.x, 0.0, TitanVenue.SUN_DIR.z).normalized()
		score += maxf(0.0, fwd.dot(sun) - 0.35) * 5.0
	# a pylon in the way
	for f in m.fighters:
		for j in [J_CHEST, J_HEAD]:
			var q = f.body.pos[j]
			if _blocked(s.eye, Vector3(q.x, q.y, q.z)):
				score += 2.0
	# a lens down on the paving sees little of a titan lying on the deck
	if s.eye.y < 0.0:
		for f in m.fighters:
			if f.isDown:
				score += 2.0
	return score


## Whether one of the ring's pylons stands between the lens and p.
static func _blocked(eye: Vector3, p: Vector3) -> bool:
	var a := Vector2(eye.x, eye.z)
	var b := Vector2(p.x, p.z)
	var ab := b - a
	var l2 := ab.length_squared()
	if l2 < 1e-6:
		return false
	for k in 8:
		var ang := (k + 0.5) * PI / 4.0
		var c := Vector2(cos(ang), sin(ang)) * TitanRing.RING_CORNER
		var t := clampf((c - a).dot(ab) / l2, 0.0, 1.0)
		if t <= 0.0 or t >= 1.0:
			continue
		if (a + ab * t).distance_to(c) < TitanRing.POST_R + 0.12:
			# (over the top of it: the floodlights are on its head)
			if lerpf(eye.y, p.y, t) < TitanRing.POST_TOP + 0.3:
				return true
	return false


## An angle round the street at the barrier, moved off the camera towers standing there.
static func _clear_of_towers(a: float) -> float:
	for t in TOWER_DEG:
		var off := Director._wrap(a - deg_to_rad(t))
		if absf(off) < 0.05:
			return a + (0.05 - absf(off)) * (1.0 if off >= 0.0 else -1.0)
	return a


## The angle round the ring (from the centre) that films the fight square on, from the side that
## keeps the player's titan on the left.
func _home_angle() -> float:
	return Director._wrap(_axis + d._home_side() * PI / 2.0)


# ------------------------------------------------------------------ framing

func _gather(m, s: TShot) -> void:
	var n := 0
	var min_y := INF
	var max_y := -INF
	var only := s.subject if s.kind == "win" else -1
	for f in m.fighters:
		var fi := int(f.index)
		if only >= 0 and fi != only:
			continue
		var loose := s.kind == "ko" and fi != s.subject
		var pos: Array = f.body.pos
		for k in 9:
			var j: int = FRAME_JOINTS[k]
			var q = pos[j]
			var p := Vector3(q.x, q.y, q.z)
			if j == J_HEAD:
				p.y += 0.24
			if j == J_FOOT_L or j == J_FOOT_R:
				p.y = maxf(0.0, p.y - 0.08)
			p.y = maxf(p.y, _hidden_below(s.eye, p))
			var room: float = JOINT_ROOM[k]
			if loose:
				room = 1.12 if (j == J_HEAD or j == J_CHEST) else INF
			_pts[n] = p
			_room[n] = room
			if is_finite(room):
				min_y = minf(min_y, p.y)
				max_y = maxf(max_y, p.y)
			n += 1
	_n = n
	var c: Vector3
	if only >= 0:
		c = Director._jp(m.fighters[only], J_PELVIS)
	else:
		c = (Director._jp(m.fighters[0], J_PELVIS) + Director._jp(m.fighters[1], J_PELVIS)) * 0.5
	if s.subject >= 0 and s.bias > 0.0:
		c = c.lerp(Director._jp(m.fighters[s.subject], J_PELVIS), s.bias)
	c.y = (min_y + max_y) * 0.5 if n > 0 else 1.0
	_c = c


## How high up a titan at p a lens at `eye` below the deck starts to see it (the stage's lip is
## in the way of the rest): -INF for a lens that sees the whole deck.
static func _hidden_below(eye: Vector3, p: Vector3) -> float:
	if eye.y >= -0.02:
		return -INF
	var de := Vector2(eye.x, eye.z)
	var dp := Vector2(p.x, p.z)
	var dir := dp - de
	var dist := dir.length()
	if dist < 1e-3:
		return -INF
	dir /= dist
	# where the sight line crosses the deck's edge (a circle round the ring)
	var b := de.dot(dir)
	var c := de.length_squared() - DECK_EDGE * DECK_EDGE
	var disc := b * b - c
	if disc <= 0.0:
		return -INF
	var t_in := -b - sqrt(disc)
	if t_in <= 0.0 or t_in >= dist:
		return -INF
	return eye.y + (0.0 - eye.y) * dist / t_in


## Where the operator aims: the framing's centre, lifted a little on a low lens, and the glance
## at the last blow.
func _target(s: TShot) -> Vector3:
	var to := _c - s.eye
	var dist := to.length()
	var half := dist * tan(deg_to_rad(_fov if _fov > 0.0 else 30.0) * 0.5)
	return _c + _kick + Vector3(0, s.lift * half, 0)


## The lens that fits the framed points from the shot's lens, in degrees (unclamped).
func _fit(s: TShot) -> float:
	var look := _c
	var fwd := (look - s.eye).normalized()
	var right := fwd.cross(Vector3.UP).normalized()
	if right.length_squared() < 1e-6:
		right = Vector3.RIGHT
	var up := right.cross(fwd)
	var need := 0.0
	for i in _n:
		var mm := _room[i] * s.fill
		if not is_finite(mm):
			continue
		var rel := _pts[i] - s.eye
		var z := maxf(0.3, rel.dot(fwd))
		need = maxf(need, maxf(absf(rel.dot(up)) / (mm * z), absf(rel.dot(right)) / (mm * z * d.aspect)))
	return rad_to_deg(2.0 * atan(need))


func _frame(dt: float, m) -> void:
	var s := shot
	if s.kind == "none":
		return
	if s.mode == "count":
		_count_place(m, dt)
	else:
		_place(s, dt)
	_gather(m, s)
	var want := _target(s)
	var lens := clampf(_fit(s), s.fov_min, s.fov_max)
	# the crash zoom: in hard on a big hit, easing back out
	if s.kind != "fan" and s.kind != "apron" and s.kind != "sky":
		lens *= 1.0 - 0.32 * _crash * _crash
	if dt > 0.0:
		_aim = _aim.lerp(want, 1.0 - exp(-s.aim * dt))
		# widen quickly to keep them in shot, tighten slowly
		var zl := s.zoom * (3.0 if lens > _fov else 1.0)
		if s.zoom > 0.0:
			_fov = Director._damp(_fov, lens, zl, dt)
		_roll = Director._damp(_roll, s.roll, 1.5, dt)
	# the operator's hands
	var wob := s.hand
	var nt := _t
	var dist := s.eye.distance_to(_aim)
	var wv := Vector3(d._noise.at(nt * 0.55 + 3.0), d._noise.at(nt * 0.45 + 9.0) * 0.7, d._noise.at(nt * 0.55 + 17.0)) * wob * dist
	if s.kind == "heli":
		# a helicopter's slow wallow, and the odd bump
		wv += Vector3(d._noise.at(nt * 0.2 + 33.0), d._noise.at(nt * 0.25 + 37.0), d._noise.at(nt * 0.2 + 41.0)) * 0.006 * dist
	d._pos = s.eye
	d._look = _aim + wv
	d._fov = _fov * Director.ZOOM[d.zoom].fov
	d._roll = _roll
	if s.kind == "fan":
		d.crowd_seat = Vector4(s.eye.x, s.eye.z, 1.6, minf(1.0, 0.6 + _heat * 0.4))
	else:
		d.crowd_seat.w = 0.0
	# (the director's polar state: what the next cut and the stretcher judge from)
	d._center = _c
	d._yaw = atan2(s.eye.z - _c.z, s.eye.x - _c.x)
	d._dist = Vector2(s.eye.x - _c.x, s.eye.z - _c.z).length()


# ------------------------------------------------------------------ the show around the fight

## A titan coming up out of its corner's hatch on the lift: from the deck, wide and low, looking
## up at it as it rises, set to one side of the frame for its card.
func _present(m, cut: bool) -> void:
	var who := int(m.presenting)
	var u := TMath.smoothstep_(0.0, TEntrance.PRESENT, m.phaseTime - who * TEntrance.PRESENT)
	var hxz: Array = TEntrance.hatchXZ(float(who))
	var oxz: Array = TEntrance.hatchXZ(float(1 - who))
	var hx: float = hxz[0]
	var hz: float = hxz[1]
	var c := Vector3(hx, 1.05, hz)
	var sw := -1.0 if who == 0 else 1.0
	var yaw := atan2(oxz[1] - hz, oxz[0] - hx) + sw * (0.75 - u * 0.4)
	var dist := 4.1 - u * 0.7
	var fov := 50.0 - u * 6.0
	var eye := Vector3(hx + cos(yaw) * dist, 0.07 + u * 0.05, hz + sin(yaw) * dist)
	# aim off to the card's side, which puts the titan on the other side of the frame
	var off := 0.3 * dist * tan(deg_to_rad(fov) * 0.5) * d.aspect
	var look := Vector3(c.x + sin(yaw) * off * sw, c.y, c.z - cos(yaw) * off * sw)
	# it opens looking down into the hatch, and tilts up with the lift
	look.y -= 0.7 * (1.0 - TEntrance.liftUp(TEntrance.entryTime(m.phase, m.phaseTime, float(who))))
	d._pos = eye
	d._look = look + Vector3(d._noise.at(_t * 0.5 + 3.0), d._noise.at(_t * 0.4 + 9.0), 0) * 0.01
	d._fov = fov * Director.ZOOM[d.zoom].fov
	d._roll = sw * 0.04 * (1.0 - u)
	shake_k = GROUND.present
	if cut:
		d.cuts += 1
		shot = TShot.new()
		shot.kind = "present"


## The booth is still talking after the presentations: the city waits. The helicopter over the
## harbour, the crowd from a roof, the ring from a boat, the cable cam drifting over the deck.
func _fill_shot(m) -> void:
	var kind := int(_rng.next() * 4.0)
	if kind == _fl_kind:
		kind = (kind + 1) % 4
	_fl_kind = kind
	_fl_n += 1
	var s := TShot.new()
	s.dur = 3.0 + _rng.next() * 1.5
	match kind:
		0:
			s = _make("heli", m)
			s.r = 34.0 + _rng.next() * 10.0
			s.h = 9.0 + _rng.next() * 5.0
			s.fill = 0.25
			s.fov_max = 40.0
		1:
			s = _make("roof", m)
			if s == null:
				s = _make("heli", m)
			s.fill = 0.35
		2:
			s = _make("boat", m)
			s.fill = 0.36
		_:
			s = _make("sky", m)
			s.h = 3.8
			s.r = 1.5
			s.fill = 0.6
	s.dur = 3.0 + _rng.next() * 1.5
	shot = s
	d._shot.kind = "titan"
	d.cuts += 1
	shake_k = GROUND.fill
	_gather(m, s)
	_place(s, 0.0)
	_aim = _target(s)
	_fov = clampf(_fit(s), s.fov_min, s.fov_max)
	_roll = 0.0


## The countdown: the cable cam drops from high over the square down to the fighters' level.
func _count_shot(m) -> void:
	var s := TShot.new()
	s.kind = "count"
	s.mode = "count"
	s.a = _home_angle() + 0.9 * d._home_side()
	s.rate = -0.18 * d._home_side()
	s.r = 14.0
	s.h = 9.0
	s.fill = 0.6
	s.fov_min = 24.0
	s.fov_max = 50.0
	s.aim = 3.0
	s.zoom = 1.5
	s.hand = 0.001
	s.dur = 99.0
	shot = s
	d._shot.kind = "titan"
	d.cuts += 1
	shake_k = GROUND.count
	_gather(m, s)
	_count_place(m, 0.0)
	_aim = _c
	_fov = 38.0


func _count_place(m, dt: float) -> void:
	var s := shot
	var k := TMath.smoothstep_(0.0, TMatch.COUNTDOWN, m.phaseTime)
	s.a += s.rate * dt
	var r := lerpf(14.0, 7.5, k)
	var h := lerpf(9.0, 1.6, k)
	s.eye = Vector3(_c.x + cos(s.a) * r, h, _c.z + sin(s.a) * r)


## The ground's shaking at the current lens (the director's trauma is scaled by it).
func ground_k() -> float:
	return shake_k
