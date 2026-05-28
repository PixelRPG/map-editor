import type { CharacterDefinition, SpriteSetData } from '../../types/data/index.ts'
import { SCIENTIST_PNG_DATA_URL } from './scientist-image.ts'

/**
 * Built-in starter character bundled with the engine — the scientist
 * sprite from PixelRPG/excalibur-version (320×32 PNG, 20 frames of
 * 16×32). Auto-seeded into projects that have no `characters[]`
 * configured so that playtest "just works" out of the box.
 *
 * The PNG ships as a base64 data URL (~1.7 KB inline TS) so the
 * engine package has zero asset-resolution dependencies — works
 * identically in the maker (GJS), the storybook, and the browser.
 *
 * Designed to be replaced: the user will eventually configure their
 * own hero via the Cast editor (Phase 3). When that happens, the
 * scientist character can be deleted; the engine falls back to the
 * procedural placeholder if no `isPlayer` character remains.
 */

export const BUILT_IN_SCIENTIST_SPRITESET_ID = 'built-in:scientist'

export const BUILT_IN_SCIENTIST_SPRITESET: SpriteSetData = {
  version: '1.0.0',
  id: BUILT_IN_SCIENTIST_SPRITESET_ID,
  name: 'Scientist (built-in)',
  image: {
    id: 'main',
    path: SCIENTIST_PNG_DATA_URL,
    type: 'image',
  },
  spriteWidth: 16,
  spriteHeight: 32,
  columns: 20,
  rows: 1,
  margin: 0,
  spacing: 0,
  sprites: Array.from({ length: 20 }, (_, i) => ({
    id: i,
    col: i,
    row: 0,
  })),
}

export const BUILT_IN_SCIENTIST: CharacterDefinition = {
  id: 'built-in:scientist',
  name: 'Scientist',
  kind: 'hero',
  isPlayer: true,
  spriteSetId: BUILT_IN_SCIENTIST_SPRITESET_ID,
  speedTilesPerSec: 4,
  defaultAnimation: 'idle-down',
  // Frame mapping derives from the original Aseprite frame tags:
  //   back / back-walk (0–4) → idle-up / walk-up
  //   front / front-walk (5–9) → idle-down / walk-down
  //   left / left-walk (10–14) → idle-left / walk-left
  //   right / right-walk (15–19) → idle-right / walk-right
  // Uniform 200 ms per frame (the source export's per-frame duration).
  animations: [
    { id: 'idle-up', frames: [0], durationMs: 200 },
    { id: 'walk-up', frames: [1, 2, 3, 4], durationMs: 200 },
    { id: 'idle-down', frames: [5], durationMs: 200 },
    { id: 'walk-down', frames: [6, 7, 8, 9], durationMs: 200 },
    { id: 'idle-left', frames: [10], durationMs: 200 },
    { id: 'walk-left', frames: [11, 12, 13, 14], durationMs: 200 },
    { id: 'idle-right', frames: [15], durationMs: 200 },
    { id: 'walk-right', frames: [16, 17, 18, 19], durationMs: 200 },
  ],
}
