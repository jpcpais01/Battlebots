# Battlebots

Auto 1v1 robot boxing arena. Build a bot from six gear slots, then watch it fight a random-gear opponent. Installable PWA, built for landscape phones.

## Run

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run sim -- 60  # headless: simulate 60 random matches and print fight stats
```

## Deploy (Vercel)

Import the repo in Vercel. It detects Vite (`vercel.json` sets the framework, long-lived caching for hashed assets and no-cache for the service worker). No environment variables are needed.

## How it works

- **Fight sim** (`src/sim`): each bot is a 16-particle Verlet body that follows a procedurally animated rig (IK arms and legs, foot planting with heel and toe pivots, guard, kinetic-chain punches where hips lead and shoulders follow, chambered kicks) and goes ragdoll when hurt. The sim runs at a fixed 120 Hz and is fully deterministic per seed.
- **Fight AI** (`src/sim/brain.ts`): no scripted combos. Each bot perceives its opponent through a delayed, noisy buffer (reaction time comes from gear), scores plans and attacks by utility (range, opponent guard habits, risk of counters, stamina, cooldowns), feints, reacts to strikes with blocks, slips, ducks, sways and steps, punishes whiffs, and learns during the fight which of its moves and defenses work. Random personality traits and mood (anger, fear, confidence) make each fight different.
- **Gear** (`src/game/items.ts`): Head, Fist, Core, Chest, Legs, Kick, five items each, five rarities (Common to Mythic) that scale stats and passives. Fist and Kick items carry an ability; Core items carry a special passive.
- **Rendering** (`src/render`): Three.js. Each bot is one rigidly skinned mesh built from faceted procedural parts (two draw calls per bot: painted metal plus emissive trim, colours and roughness/metalness per vertex), an adaptive resolution governor, bloom on high quality only, CPU particles and a broadcast-style camera director.
- **Sound** (`src/audio`): synthesized with WebAudio, no audio files.

Debug URL flags: `?q=low|med|high` forces graphics quality.
