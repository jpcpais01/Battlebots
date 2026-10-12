# Battlebots

Vite + TypeScript + Three.js PWA, deployed to Vercel from `main`.

- `npm run build` must pass before merging (typecheck + Vite build).
- After changes in `src/sim`, run `npm run sim -- 60` to check fight balance.

## Patch notes (required on every merge to main)

Players see patch notes from the "Patch notes" button on the home screen.
They live in `src/patchNotes.ts`.

Every PR merged into `main` must add to `PATCH_NOTES` in the same PR:

- Add a new entry at the **top** of the array (newest first) with today's
  date (`YYYY-MM-DD`), a short title, and one short player-facing line per change.
- If the top entry already has today's date, you may add lines to it instead.
- Write for players, not developers: say what they will notice, not file names.

The home button shows a dot until the player opens the newest entry.
