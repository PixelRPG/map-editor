/**
 * The definition dialog's test shape.
 *
 * The shape is the dialog's whole feedback loop — "is the block in the
 * right place?" is answered by looking at it — so what it asks for is
 * worth pinning: a path set, two inner corners, four outer corners and
 * a lone cell. Lose one of those to a tidy-up and a misplaced frame
 * stops being visible, which is the bug this page exists to prevent.
 */

import { describe, expect, it } from '@gjsify/unit'

import { TerrainPreset } from '../types/data/index.ts'
import type { TerrainData } from '../types/data/TerrainData.ts'
import { terrainMaskAt } from './terrain.ts'
import { defaultTerrainLayout, terrainTilesForPreset } from './terrain-presets.ts'
import {
  TERRAIN_SAMPLE_COLUMNS,
  TERRAIN_SAMPLE_ROWS,
  TERRAIN_SAMPLE_SHAPE,
  terrainSampleFilled,
  terrainSampleMasks,
  terrainSampleTiles,
} from './terrain-sample.ts'

/** Kenney's `roguelikeSheet_transparent.png`, this pack's dirt path. */
const SHEET = { columns: 57, rows: 31 }

function groundTerrain(): TerrainData {
  return {
    id: 'path',
    name: 'Path',
    tiles: terrainTilesForPreset(
      TerrainPreset.Ground29,
      defaultTerrainLayout(TerrainPreset.Ground29, 5, 7).parts,
      SHEET,
    ),
  }
}

/** Every mask the sample asks for, so a claim about coverage is checked. */
function sampleMasks(): Set<number> {
  const masks = new Set<number>()
  for (let y = 0; y < TERRAIN_SAMPLE_ROWS; y++) {
    for (let x = 0; x < TERRAIN_SAMPLE_COLUMNS; x++) {
      if (terrainSampleFilled(x, y)) masks.add(terrainMaskAt(x, y, terrainSampleFilled))
    }
  }
  return masks
}

export default async () => {
  await describe('TERRAIN_SAMPLE_SHAPE', async () => {
    await it('is a rectangle of the declared size', async () => {
      expect(TERRAIN_SAMPLE_SHAPE.length).toBe(TERRAIN_SAMPLE_ROWS)
      const widths = new Set(TERRAIN_SAMPLE_SHAPE.map((row) => row.length))
      expect([...widths].join(' ')).toBe(String(TERRAIN_SAMPLE_COLUMNS))
    })

    await it('keeps a floor border, so no shape runs off the edge', async () => {
      const border: string[] = []
      for (let x = 0; x < TERRAIN_SAMPLE_COLUMNS; x++) {
        if (terrainSampleFilled(x, 0) || terrainSampleFilled(x, TERRAIN_SAMPLE_ROWS - 1)) border.push(`x${x}`)
      }
      for (let y = 0; y < TERRAIN_SAMPLE_ROWS; y++) {
        if (terrainSampleFilled(0, y) || terrainSampleFilled(TERRAIN_SAMPLE_COLUMNS - 1, y)) border.push(`y${y}`)
      }
      expect(border.join(' ')).toBe('')
    })

    await it('asks for a lone cell, a T, a bend and both ends of a path', async () => {
      const masks = sampleMasks()
      // 0 lone · 84 T (E·S·W) · 5 bend (N·E) · 4 end (E) · 64 end (W)
      expect([0, 84, 5, 4, 64].filter((mask) => !masks.has(mask)).join(' ')).toBe('')
    })

    await it('asks for both inner corners and all four outer ones', async () => {
      const masks = sampleMasks()
      // 223 (no SW) · 247 (no SE) are inner; 28 / 112 / 7 / 193 are the
      // block's NW / NE / SW / SE.
      expect([223, 247].filter((mask) => !masks.has(mask)).join(' ')).toBe('')
      expect([28, 112, 7, 193].filter((mask) => !masks.has(mask)).join(' ')).toBe('')
    })
  })

  await describe('terrainSampleMasks', async () => {
    await it('gives one entry per cell, null off the shape', async () => {
      const masks = terrainSampleMasks()
      expect(masks.length).toBe(TERRAIN_SAMPLE_COLUMNS * TERRAIN_SAMPLE_ROWS)
      expect(masks[0]).toBe(null)
      // (1, 1) is the west end of the top path: only its east neighbour
      // is terrain, so the mask is a bare `TERRAIN_E`.
      expect(masks[TERRAIN_SAMPLE_COLUMNS + 1]).toBe(4)
    })

    await it('asks the same of every cell the painter does', async () => {
      // The fix-up page edits the row a cell RESOLVES THROUGH, so the
      // two must not drift: a mask here that the painter never asks for
      // would be an entry the author can add and never see.
      const masks = terrainSampleMasks()
      const tiles = terrainSampleTiles(groundTerrain())
      const mismatched = masks
        .map((mask, index) => (mask == null) === (tiles[index] == null))
        .filter((agreed) => !agreed).length
      expect(mismatched).toBe(0)
    })
  })

  await describe('terrainSampleTiles', async () => {
    await it('gives one entry per cell, null off the shape', async () => {
      const tiles = terrainSampleTiles(groundTerrain())
      expect(tiles.length).toBe(TERRAIN_SAMPLE_COLUMNS * TERRAIN_SAMPLE_ROWS)
      expect(tiles[0]).toBe(null)
      expect(tiles[TERRAIN_SAMPLE_COLUMNS + 1] != null).toBe(true)
    })

    await it('resolves this pack\u2019s path to the tiles \u00a72 names', async () => {
      const tiles = terrainSampleTiles(groundTerrain())
      const at = (x: number, y: number) => tiles[y * TERRAIN_SAMPLE_COLUMNS + x]
      // The lone cell at (10, 6) is the block's "single" tile: mask 0
      // sits at the preset's (3, 5), so (5 + 3, 7 + 5) on the sheet.
      expect(at(10, 6)).toBe(12 * SHEET.columns + 8)
      // The blob's centre at (10, 2) is the filled middle (mask 255).
      expect(at(10, 2)).toBe(10 * SHEET.columns + 8)
    })

    await it('paints every cell, even from a one-entry table', async () => {
      const tiles = terrainSampleTiles({ id: 'x', name: 'X', tiles: { '255': 7 } })
      const painted = tiles.filter((tile) => tile === 7).length
      const filled = TERRAIN_SAMPLE_SHAPE.join('')
        .split('')
        .filter((cell) => cell === '#').length
      expect(painted).toBe(filled)
    })

    await it('draws nothing from an empty table', async () => {
      const tiles = terrainSampleTiles({ id: 'x', name: 'X', tiles: {} })
      expect(tiles.filter((tile) => tile != null).length).toBe(0)
    })
  })
}
