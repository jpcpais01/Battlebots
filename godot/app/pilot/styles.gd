## Fighting styles: the player tells their bot how to fight (BotSpec.style, read by the sim's
## brain: src/sim/brain.ts FIGHT_STYLES / STYLE_SHAPE), or leaves it to pick its own from its
## build ("Auto"). This holds what the menus say about each style, the pilot's record in each
## style (the pilot save's `styles`), and the picker over the home screen.
class_name FightStyles
extends RefCounted

const EM := UiTheme.EM

## Auto (no style on the spec): the bot picks one from its parts.
const AUTO := ""

## In the sim's FIGHT_STYLES order. bars: pressure, range (how far away it likes it), defence; 0..1.
const STYLES := [
	{
		"id": "Boxer", "color": "#5ad1ff", "short": "All-rounder",
		"blurb": "Jab, move, pick the moment. No real weakness, and it can fight any way the fight asks.",
		"bars": [0.55, 0.5, 0.5],
		"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10.5V8a5 5 0 0 1 10 0v5.5a5.5 5.5 0 0 1-5.5 5.5H11a4 4 0 0 1-4-4z" fill="currentColor" fill-opacity=".2"/><path d="M7 12.5h4a2 2 0 0 0 0-4H9"/><path d="M8.5 19v2.5h7V19"/></svg>',
	},
	{
		"id": "Brawler", "color": "#ff5a5a", "short": "Power puncher",
		"blurb": "Plants its feet, walks through fire and throws heavy. Stays in the pocket to trade.",
		"bars": [0.9, 0.15, 0.25],
		"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5l3-5 3 4 2-5.5 2 5.5 3-4 1 5" /><rect x="5" y="11" width="14" height="9.5" rx="3" fill="currentColor" fill-opacity=".2"/><path d="M9 11v3.5M12.5 11v3.5M16 11v3.5"/></svg>',
	},
	{
		"id": "Swarmer", "color": "#ff8a1f", "short": "Pressure fighter",
		"blurb": "Never stops coming. Bobs under shots, smothers you on the ropes and loves the clinch.",
		"bars": [0.85, 0.3, 0.45],
		"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l5 5-5 5"/><path d="M9.5 7l5 5-5 5"/><path d="M16 7l5 5-5 5" fill="currentColor" fill-opacity=".2"/></svg>',
	},
	{
		"id": "Out-fighter", "color": "#6be38a", "short": "Range keeper",
		"blurb": "Lives at the end of its reach. Busy feet, long shots, and gone before you can answer.",
		"bars": [0.35, 0.95, 0.6],
		"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12h19"/><path d="M6 8.5L2.5 12 6 15.5M18 8.5l3.5 3.5-3.5 3.5"/><circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity=".2"/></svg>',
	},
	{
		"id": "Counter-puncher", "color": "#b38cff", "short": "Counter striker",
		"blurb": "Patient and hard to hit. Waits for you to swing, makes you miss, and makes you pay.",
		"bars": [0.3, 0.55, 0.9],
		"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="currentColor" fill-opacity=".2"/><path d="M15.5 9.5l-4 4.5 2.5.5-2 3"/></svg>',
	},
]
const AUTO_DEF := {
	"id": AUTO, "color": "#8a96b0", "short": "Picks its own",
	"blurb": "Leaves it to the bot: it picks a style each fight from its parts, its size and its mood.",
	"bars": [],
	"svg": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="6" width="14" height="12" rx="3.5" fill="currentColor" fill-opacity=".2"/><path d="M9 11h.01M15 11h.01" stroke-width="2.6"/><path d="M9.5 14.5h5M12 3v3"/></svg>',
}
const BAR_NAMES := ["Pressure", "Range", "Defence"]

static func def(id: String) -> Dictionary:
	for s in STYLES:
		if s.id == id:
			return s
	return AUTO_DEF


static func index(id: String) -> int:
	for i in STYLES.size():
		if STYLES[i].id == id:
			return i
	return -1


static func color(id: String) -> Color:
	return MenuKit.css(String(def(id).color))


static func icon(id: String, px: float) -> Texture2D:
	return CareerKit.svg(String(def(id).svg), px)


## The style a bot is told to fight in (AUTO for none).
static func of(bot) -> String:
	var s = bot.get("style") if bot is Dictionary else null
	return String(s) if s is String and index(String(s)) >= 0 else AUTO


static func set_style(bot: Dictionary, id: String) -> void:
	if index(id) >= 0:
		bot.style = id
	else:
		bot.erase("style")


# ------------------------------------------------------------------ the pilot's record per style

static func sanitize_into(out: Dictionary, raw: Dictionary) -> void:
	out.styles = {}
	var st = raw.get("styles")
	if not st is Dictionary:
		return
	for id in st:
		var v = st[id]
		if index(String(id)) >= 0 and v is Array and v.size() == 2:
			out.styles[String(id)] = [maxi(0, int(v[0])), maxi(0, int(v[1]))]


## A fight fought in `id`: [wins, fights] goes up.
static func tally(p: Dictionary, id: String, won: bool) -> void:
	if index(id) < 0:
		return
	if not p.get("styles") is Dictionary:
		p.styles = {}
	var r: Array = p.styles.get(id, [0, 0])
	p.styles[id] = [int(r[0]) + (1 if won else 0), int(r[1]) + 1]


static func record(p: Dictionary, id: String) -> Array:
	var st = p.get("styles")
	return st.get(id, [0, 0]) if st is Dictionary else [0, 0]


# ------------------------------------------------------------------ the picker

## The fighting style picker over the home screen: Auto and the five styles, each with what it
## does, its matchups and the pilot's record in it. Picking one saves it on the player's bot.
static func open_picker(app) -> void:
	app.tap()
	Modal.open(app.ui, "Fighting style", func(md: Modal) -> void:
		md.width = 46.0 * EM
		var sub := MenuKit.label("How your bot fights. Every style is evenly matched, so pick the one you love to watch.", 0.74 * EM, 600, UiTheme.MUTED)
		sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		md.body.add_child(sub)
		var sc := ScrollContainer.new()
		sc.name = "Scroll"
		sc.follow_focus = false
		sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		sc.mouse_filter = Control.MOUSE_FILTER_PASS
		var g := GridContainer.new()
		g.name = "Styles"
		g.columns = 2
		g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		g.add_theme_constant_override(&"h_separation", int(0.5 * EM))
		g.add_theme_constant_override(&"v_separation", int(0.5 * EM))
		sc.add_child(g)
		md.body.add_child(sc)
		var cards := []
		var paint := func() -> void:
			var cur := of(app.player)
			for c in cards:
				_light(c[0], String(c[1]) == cur)
		for d in STYLES + [AUTO_DEF]:
			var id := String(d.id)
			var card := _card(app, d)
			(card.get_node("Tap") as Button).pressed.connect(func() -> void:
				if of(app.player) == id:
					return
				app.tap("select")
				set_style(app.player, id)
				app.commit_player()
				paint.call())
			g.add_child(card)
			cards.append([card, id])
		paint.call()
		md.add_scroll(sc)
		MedalViews._touch(sc), Callable(), true)


## One style's card: its badge, name and kind, what it does, its three bars and the pilot's
## record in it.
static func _card(app, d: Dictionary) -> PanelContainer:
	var id := String(d.id)
	var col := MenuKit.css(String(d.color))
	var pc := PanelContainer.new()
	pc.name = id if id != "" else "Auto"
	pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pc.mouse_filter = Control.MOUSE_FILTER_PASS
	pc.set_meta("color", col)
	var v := PilotViews._col(0.35 * EM)
	pc.add_child(v)
	var top := PilotViews._row(0.55 * EM)
	v.add_child(top)
	top.add_child(_badge(id, 2.3 * EM))
	var nv := PilotViews._col(0.0)
	nv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	nv.add_child(MenuKit.label(id if id != "" else "Auto", 0.98 * EM, 800, UiTheme.TEXT))
	nv.add_child(MenuKit.label(String(d.short), 0.66 * EM, 700, col))
	top.add_child(nv)
	var on := MenuKit.label("", 0.62 * EM, 800, UiTheme.INK)
	on.name = "On"
	var chip := MenuKit.pill(MenuKit.box(col, 999, [0.55 * EM, 0.12 * EM, 0.55 * EM, 0.12 * EM]))
	chip.name = "Chip"
	chip.get_node("Row").add_child(on)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	on.text = "FIGHTING"
	top.add_child(chip)
	var blurb := MenuKit.label(String(d.blurb), 0.7 * EM, 500, UiTheme.TEXT_2)
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.custom_minimum_size.x = 12.0 * EM
	v.add_child(blurb)
	var bars: Array = d.bars
	for k in bars.size():
		var r := PilotViews._row(0.45 * EM)
		var l := MenuKit.label(BAR_NAMES[k], 0.62 * EM, 700, UiTheme.MUTED)
		l.custom_minimum_size.x = 4.2 * EM
		r.add_child(l)
		var bar := PilotViews.Bar.new(maxf(5.0, 0.34 * EM))
		bar.fill = col
		bar.fill_2 = col.lerp(Color.WHITE, 0.25)
		bar.value = float(bars[k])
		r.add_child(bar)
		v.add_child(r)
	if id != AUTO:
		var rec := record(app.pilot, id)
		var txt := "Not fought in yet" if int(rec[1]) == 0 else "Your record: %d won of %d" % [int(rec[0]), int(rec[1])]
		v.add_child(MenuKit.label(txt, 0.62 * EM, 600, UiTheme.MUTED))
	# the whole card is the button (over everything, see-through)
	var b := MenuKit.bare_button(1.0)
	b.name = "Tap"
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	b.button_down.connect(_press.bind(pc, 0.97, 0.09))
	b.button_up.connect(_press.bind(pc, 1.0, 0.18))
	pc.add_child(b)
	return pc


## A press shrinks the card a touch about its centre (UiTheme.press_feedback, for a card).
static func _press(c: Control, k: float, dur: float) -> void:
	c.pivot_offset = c.size * 0.5
	var tw := c.create_tween()
	tw.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(c, "scale", Vector2(k, k), dur)


## Lit (the style being fought in) or not: the card's face and its FIGHTING chip.
static func _light(card: PanelContainer, on: bool) -> void:
	var col: Color = card.get_meta("color")
	var st := MenuKit.box(Color(col, 0.13) if on else Color(1, 1, 1, 0.04), 16, [0.8 * EM, 0.7 * EM, 0.8 * EM, 0.75 * EM], col if on else UiTheme.LINE, 2 if on else 1)
	if on:
		st.shadow_color = Color(col, 0.35)
		st.shadow_size = 10
	card.add_theme_stylebox_override(&"panel", st)
	(card.find_child("Chip", true, false) as Control).visible = on


## The style's badge: its glyph in a ring of its colour.
static func _badge(id: String, px: float) -> Control:
	var col := color(id)
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.custom_minimum_size = Vector2(px, px)
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var st := MenuKit.box(Color(col, 0.16), 999, [0, 0, 0, 0], Color(col, 0.75), 2)
	p.add_theme_stylebox_override(&"panel", st)
	var ic := TextureRect.new()
	ic.texture = icon(id, px * 0.58)
	ic.modulate = col.lerp(Color.WHITE, 0.2)
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.custom_minimum_size = Vector2(px, px) * 0.58
	ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(ic)
	return p

