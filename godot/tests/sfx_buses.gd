## Writes godot/default_bus_layout.tres: the mixing buses every sound worker shares, with the
## web mix's effects on them (src/audio/sfx.ts unlock and makeHitBus). Re-run after a change:
##   godot --headless --path godot -s res://tests/sfx_buses.gd
##
## - Master: the final mix (sfx.ts `out` and after): MASTER volume 0.7, the fast limiter
##   (threshold -4 dB, ratio 20, 2 ms attack, 120 ms release, plus the make-up gain Chromium's
##   DynamicsCompressor adds by itself) and a -1 dB ceiling in place of the soft clipper.
## - Mix -> Master: effects, the crowd and the music, through the glue compressor (threshold -14,
##   ratio 4, a 30 dB knee: on a steady tone it is a +0.6 dB lift that eases off near full scale).
## - Fx -> Mix: the sound effects (their own bus so Settings' Effects slider leaves the crowd and
##   the music alone).
## - Hits -> Fx: the impacts' arena slap: one echo off each side wall (83 ms left, 131 ms right)
##   and their darker repeats. As in the web, each impact plays dry into the mix and sends into the
##   slap; Godot can't split a bus, so sfx.gd plays the dry impact on Fx and its send (baked
##   band-limited, the slap's 160 Hz - 2.4 kHz filters) on Hits.
## - Crowd -> Mix, Music -> Mix (walk-ons and the chant), Voice -> Master (the commentary).
##
## Godot's compressor works its ratio on 2.08x the overshoot in dB (audio_effect_compressor.cpp),
## so a web ratio R is set as 1 / (1 - (1 - 1/R) / 2.08); the values below were then fitted on
## the static curves the web mix measures (tests/sfx_ref.gd "sweep" against audio_sfx_ref.ts).
extends SceneTree

const OVER := 2.08136898


## The Godot ratio that compresses like a web (Chromium) compressor of ratio r above its threshold.
static func ratio(r: float) -> float:
	return 1.0 / (1.0 - (1.0 - 1.0 / r) / OVER)


static func build() -> AudioBusLayout:
	var srv := AudioServer
	while srv.bus_count > 1:
		srv.remove_bus(srv.bus_count - 1)
	for i in srv.get_bus_effect_count(0):
		srv.remove_bus_effect(0, 0)
	# Master: out (MASTER = 0.7), the limiter, then a ceiling
	var out := AudioEffectAmplify.new()
	out.volume_db = linear_to_db(0.7)
	srv.add_bus_effect(0, out)
	var limit := AudioEffectCompressor.new()
	# (-3.5: Godot has no knee; the web's 2 dB one lets the first dB over through)
	limit.threshold = -3.5
	limit.ratio = ratio(20.0)
	limit.attack_us = 2000.0
	limit.release_ms = 120.0
	limit.gain = 2.0
	srv.add_bus_effect(0, limit)
	var ceiling := AudioEffectHardLimiter.new()
	# (-1 dB: where the web's look-ahead limiter and make-up gain hold the peaks; Godot's compressor
	# has no look-ahead, so this catches the transients it lets through)
	ceiling.ceiling_db = -1.0
	ceiling.release = 0.12
	srv.add_bus_effect(0, ceiling)
	_bus("Mix", "Master")
	var glue := AudioEffectCompressor.new()
	glue.threshold = -8.0
	glue.ratio = ratio(1.1)
	glue.attack_us = 3000.0
	glue.release_ms = 250.0
	glue.gain = 0.6
	srv.add_bus_effect(1, glue)
	_bus("Fx", "Mix")
	_bus("Hits", "Fx")
	# the hit bus's arena slap (sfx.ts makeHitBus), fed by each impact's band-limited send (sfx.gd)
	var slap := AudioEffectDelay.new()
	slap.dry = 0.0
	# a 0.22 send into each echo, panned -0.55 / +0.55 by a StereoPanner. On a centred hit that
	# panner puts 1.76x into the near side and 0.65x into the far one; Godot's taps scale the far
	# side only, so the near side gets the level and the pan the ratio.
	var near := 0.22 * (1.0 + cos(0.45 * PI / 2.0))
	var far := 0.22 * sin(0.45 * PI / 2.0)
	slap.tap1_active = true
	slap.tap1_delay_ms = 83.0
	slap.tap1_level_db = linear_to_db(near)
	slap.tap1_pan = -(1.0 - far / near)
	slap.tap2_active = true
	slap.tap2_delay_ms = 131.0
	slap.tap2_level_db = linear_to_db(near)
	slap.tap2_pan = 1.0 - far / near
	# each wall's echo comes back again 0.32 as loud, darker (the loop's 2.4 kHz low-pass): one
	# shared feedback line at the first wall's delay (the second wall's repeats land 48 ms early)
	slap.feedback_active = true
	slap.feedback_delay_ms = 83.0
	slap.feedback_level_db = linear_to_db(0.32)
	slap.feedback_lowpass = 2400.0
	srv.add_bus_effect(3, slap)
	_bus("Crowd", "Mix")
	_bus("Music", "Mix")
	_bus("Voice", "Master")
	return srv.generate_bus_layout()


static func _bus(name: String, send: String) -> void:
	var i := AudioServer.bus_count
	AudioServer.add_bus(i)
	AudioServer.set_bus_name(i, name)
	AudioServer.set_bus_send(i, send)


func _init() -> void:
	var err := ResourceSaver.save(build(), "res://default_bus_layout.tres")
	print("default_bus_layout.tres: ", error_string(err))
	quit()
