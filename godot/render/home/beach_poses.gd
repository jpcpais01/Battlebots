## The beach robot's poses (src/render/home/beachPoses.ts), in its own frame on the sun lounger
## (root at the foot of the backrest's hinge line, x to its right, z towards the foot end).
## Lounger: cushion top at y 0.42 from z -0.25 to 1.1, backrest rising back from (z -0.25, y 0.42)
## at 48 degrees. Built once, on first use.
class_name BeachPoses
extends RefCounted

const LOUNGER := {"seatY": 0.42, "seatZ0": -0.25, "seatZ1": 1.1, "halfW": 0.36, "backAngle": 0.84, "backLen": 0.95}

## Where the phone and the coconut sit, in the robot's frame.
const PHONE_AT := Vector3(-0.74, 0.515, 0.08)
const TABLE_L := Vector3(-0.76, 0, 0.06)
const TABLE_R := Vector3(0.8, 0, -0.1)
## On its feet beside the lounger, facing out (the live fighter takes over from here).
const STAND_AT := Vector3(0.95, 0, 0.17)
const STAND_YAW := PI / 2.0

## Times (s after Fight) of the call's beats.
const CALL := {"ring": 0.0, "look": 0.45, "grab": 1.25, "ear": 1.7, "putDown": 2.55, "toss": 2.78, "shades": 3.0, "swing": 3.45, "stand": 4.35, "live": 4.5, "emote": 4.75, "cut": 6.2}

## The idle loop: lie back, and every so often a drink.
const IDLE_LEN := 9.0

static var _idle: Array = []
static var _outro: Array = []


static func idle() -> Array:
	if _idle.is_empty():
		_build()
	return _idle


static func outro() -> Array:
	if _outro.is_empty():
		_build()
	return _outro


static func _build() -> void:
	var legs := [
		{"at": [0.15, 0.5, 0.8], "pole": [0, 1, 0.3], "air": 1, "flex": 0.35},
		{"at": [0.13, 0.47, 0.42], "pole": [0.35, 1, 0.4], "air": 1, "flex": 0.2},
	]
	var behind_head := {"at": [0.13, 0.03, -0.1], "in": "head", "pole": [0.6, 0.85, -0.2], "roll": -0.4}
	# lying back, one hand behind the head, the other holding a coconut on its belly, one knee up
	var lie := HomePuppet.pose({"pelvis": [0, 0.6, -0.14], "hips": [-0.74, 0, 0], "spine": [0.04, 0, 0], "head": [0.42, 0.05, 0],
		"hands": [behind_head, {"at": [0.12, -0.32, 0.25], "pole": [1, -0.4, -0.4], "roll": 0.2}], "feet": legs})
	# the coconut up to the mouth
	var drink := HomePuppet.pose({"pelvis": [0, 0.6, -0.14], "hips": [-0.72, 0, 0], "spine": [0.06, 0, 0], "head": [0.24, 0.05, 0],
		"hands": [behind_head, {"at": [0.03, -0.08, 0.2], "in": "head", "pole": [1, -0.6, -0.1], "roll": 0.5}], "feet": legs})
	# head back for the last of it
	var sip := HomePuppet.pose({"pelvis": [0, 0.6, -0.14], "hips": [-0.74, 0, 0], "spine": [0.04, 0, 0], "head": [0.06, 0.05, 0],
		"hands": [behind_head, {"at": [0.03, -0.06, 0.18], "in": "head", "pole": [1, -0.6, -0.1], "roll": 0.6}], "feet": legs})
	_idle = [[0.0, lie], [5.8, lie], [6.8, drink], [7.4, sip], [8.0, drink], [9.0, lie]]

	var belly := {"at": [0.12, -0.32, 0.25], "pole": [1, -0.4, -0.4], "roll": 0.2}
	var belly2 := {"at": [0.12, -0.3, 0.25], "pole": [1, -0.4, -0.4], "roll": 0.2}
	var ear := {"at": [0.12, 0.0, 0.02], "in": "head", "pole": [1, -0.5, 0.1], "roll": -1}
	# the phone buzzes: the head turns to it
	var look := HomePuppet.pose({"pelvis": [0, 0.6, -0.14], "hips": [-0.72, 0, 0], "spine": [0.08, -0.12, 0.04], "head": [0.55, -0.55, 0.12],
		"hands": [behind_head, belly], "feet": legs})
	# reaching over for it
	var reach := HomePuppet.pose({"pelvis": [0, 0.6, -0.12], "hips": [-0.52, 0, 0], "spine": [0.22, -0.3, 0.16], "head": [0.5, -0.45, 0.1],
		"hands": [{"at": [-PHONE_AT.x, PHONE_AT.y + 0.04, PHONE_AT.z], "in": "root", "pole": [0.7, -0.4, -0.6], "roll": 1}, belly2], "feet": legs})
	# phone at the ear
	var answer := HomePuppet.pose({"pelvis": [0, 0.6, -0.13], "hips": [-0.6, 0, 0], "spine": [0.1, -0.08, 0.05], "head": [0.28, -0.12, 0.22],
		"hands": [ear, belly2], "feet": legs})
	# "say that again?": a nod, still listening
	var listen := HomePuppet.pose({"pelvis": [0, 0.6, -0.12], "hips": [-0.55, 0, 0], "spine": [0.16, -0.06, 0.05], "head": [0.4, -0.08, 0.2],
		"hands": [ear, belly2], "feet": legs})
	var up_feet := [
		{"at": [0.15, 0.5, 0.78], "pole": [0, 1, 0.3], "air": 1, "flex": 0.3},
		{"at": [0.14, 0.48, 0.5], "pole": [0.3, 1, 0.4], "air": 1, "flex": 0.2},
	]
	var on_seat := {"at": [0.32, 0.5, 0.12], "in": "root", "pole": [0.5, -1, -0.2]}
	# sitting up: the phone goes down on the cushion, the coconut arm winds up
	var wind := HomePuppet.pose({"pelvis": [0, 0.6, -0.08], "hips": [-0.25, 0, 0], "spine": [0.12, 0.1, 0], "head": [0.1, 0.25, 0],
		"hands": [on_seat, {"at": [0.3, -0.12, 0.32], "pole": [1, -0.6, -0.2], "roll": 0.4}], "feet": up_feet})
	# ...and over the shoulder it goes
	var toss := HomePuppet.pose({"pelvis": [0, 0.6, -0.08], "hips": [-0.2, 0, 0], "spine": [0.05, -0.15, 0.05], "head": [0.02, 0.1, 0],
		"hands": [on_seat, {"at": [0.28, 0.6, -0.1], "pole": [1, -0.2, -0.5], "roll": -0.3}], "feet": up_feet})
	# upright, looking dead ahead: the shades come off
	var upright := HomePuppet.pose({"pelvis": [0, 0.6, -0.06], "hips": [-0.12, 0, 0], "spine": [0.04, 0, 0], "head": [0.02, 0, 0],
		"hands": [{"at": [0.36, 0.5, 0.18], "in": "root", "pole": [0.5, -1, -0.2]}, {"at": [0.36, 0.5, 0.2], "in": "root", "pole": [0.5, -1, -0.2]}],
		"feet": [{"at": [0.15, 0.5, 0.8], "pole": [0, 1, 0.3], "air": 1, "flex": 0.3}, {"at": [0.15, 0.49, 0.62], "pole": [0.2, 1, 0.4], "air": 1, "flex": 0.2}]})
	# legs swing out over the right-hand side
	var swing := HomePuppet.pose({"pelvis": [0.12, 0.6, 0.04], "hips": [-0.18, 0.85, 0], "spine": [0.06, 0, 0], "head": [0.0, -0.2, 0],
		"hands": [{"at": [0.1, 0.5, 0.3], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}, {"at": [0.42, 0.5, -0.1], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}],
		"feet": [{"at": [0.85, 0.45, 0.62], "abs": true, "pole": [1, 0.6, 0.2], "air": 1, "flex": 0.2}, {"at": [0.9, 0.42, 0.3], "abs": true, "pole": [1, 0.6, 0], "air": 1, "flex": 0.2}]})
	# sat on the edge, feet in the sand
	var edge := HomePuppet.pose({"pelvis": [0.3, 0.58, 0.16], "hips": [-0.05, 1.5, 0], "spine": [0.18, 0, 0], "head": [-0.05, 0, 0],
		"hands": [{"at": [0.36, 0.48, 0.5], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}, {"at": [0.38, 0.48, -0.16], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}],
		"feet": [{"at": [0.86, 0, 0.32], "abs": true, "pole": [1, 0.3, 0], "yaw": 0.1}, {"at": [0.86, 0, 0.02], "abs": true, "pole": [1, 0.3, 0], "yaw": 0.1}]})
	# pushing up off the knees
	var rise := HomePuppet.pose({"pelvis": [0.62, 0.72, 0.17], "hips": [0.5, 1.5, 0], "spine": [0.35, 0, 0], "head": [-0.3, 0, 0],
		"hands": [{"at": [0.95, 0.5, 0.36], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}, {"at": [0.95, 0.5, -0.02], "in": "root", "abs": true, "pole": [0.5, -1, -0.2]}],
		"feet": [{"at": [0.9, 0, 0.32], "abs": true, "pole": [1, 0.3, 0], "yaw": 0.1}, {"at": [0.9, 0, 0.02], "abs": true, "pole": [1, 0.3, 0], "yaw": 0.1}]})
	# on its feet beside the lounger, facing out
	var stand := HomePuppet.pose({"pelvis": [0.95, 0.88, 0.17], "hips": [0.04, STAND_YAW, 0], "spine": [0.02, 0, 0], "head": [0, 0, 0],
		"hands": [{"at": [0.3, -0.36, 0.12], "pole": [0.4, -0.2, -1], "roll": 0.3}, {"at": [0.3, -0.36, 0.12], "pole": [0.4, -0.2, -1], "roll": 0.3}],
		"feet": [{"at": [0.97, 0, 0.32], "abs": true, "pole": [1, 0.2, 0], "yaw": 0.12}, {"at": [0.97, 0, 0.02], "abs": true, "pole": [1, 0.2, 0], "yaw": 0.12}]})
	_outro = [
		[0.0, lie],
		[CALL.look, look],
		[CALL.grab, reach],
		[CALL.ear, answer],
		[2.1, listen],
		[2.35, answer],
		[2.5, wind],
		[CALL.toss, toss],
		[CALL.shades + 0.1, upright],
		[3.3, upright],
		[3.75, swing],
		[4.0, edge],
		[4.2, rise],
		[CALL.stand, stand],
	]
