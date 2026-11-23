/**
 * The layout presets, against the pack they were measured on.
 *
 * Two kinds of assertion, both needed:
 *
 *   1. Structural — every preset's masks are normalised and unique,
 *      every cell names a part that exists and sits inside it, and the
 *      first part is its own origin. A typo in a table is otherwise a
 *      brush that paints one wrong piece, which looks like a bug in the
 *      matcher.
 *   2. Golden — applying a preset at this pack's measured coordinates
 *      yields the sprite ids `docs/design/ui-redesign/TERRAIN.md` §2
 *      names. That is what makes the numbers in §2 testable rather than
 *      a claim in prose.
 */

import { describe, expect, it } from '@gjsify/unit'

import roguelike from '../../../../games/blank-starter/spritesets/roguelike.json' with { type: 'json' }
import { TerrainPreset } from '../types/data/index.ts'
import { isNormalisedTerrainMask, resolveTerrainTile, terrainFootprint } from './terrain.ts'
import {
  TERRAIN_PRESETS,
  defaultTerrainLayout,
  terrainPresetPart,
  terrainPresetPlacement,
  terrainPresetSpec,
  terrainTilesForPreset,
} from './terrain-presets.ts'

/** Kenney's `roguelikeSheet_transparent.png`: 57×31 tiles of 16 px. */
const SHEET = { columns: 57, rows: 31 }

/** The sprite id rule every sheet the import dialog writes uses. */
function spriteAt(col: number, row: number): number {
  return row * SHEET.columns + col
}

export default async () => {
  await describe('TERRAIN_PRESETS', async () => {
    await it('holds the five presets, richest first', async () => {
      expect(TERRAIN_PRESETS.map((spec) => spec.preset)).toStrictEqual([
        TerrainPreset.Blob47,
        TerrainPreset.Ground29,
        TerrainPreset.Patch13,
        TerrainPreset.Path16,
        TerrainPreset.Block9,
      ])
    })

    await it('is looked up by its enum value and by the raw string', async () => {
      expect(terrainPresetSpec(TerrainPreset.Patch13)?.parts.length).toBe(2)
      expect(terrainPresetSpec('patch-13')?.parts.length).toBe(2)
      expect(terrainPresetSpec('no-such-preset')).toBe(undefined)
    })

    for (const spec of TERRAIN_PRESETS) {
      await describe(spec.preset, async () => {
        await it('anchors its first part at its own origin', async () => {
          expect(spec.parts[0]?.dc).toBe(0)
          expect(spec.parts[0]?.dr).toBe(0)
        })

        await it('names every part once', async () => {
          expect(new Set(spec.parts.map((part) => part.id)).size).toBe(spec.parts.length)
        })

        await it('keeps every cell inside a part it names', async () => {
          for (const cell of spec.cells) {
            const part = terrainPresetPart(spec, cell.part)
            expect(part).not.toBe(undefined)
            expect(cell.dc >= 0 && cell.dc < (part?.columns ?? 0)).toBe(true)
            expect(cell.dr >= 0 && cell.dr < (part?.rows ?? 0)).toBe(true)
          }
        })

        await it('uses normalised masks, each once', async () => {
          const masks = spec.cells.map((cell) => cell.mask)
          for (const mask of masks) expect(isNormalisedTerrainMask(mask)).toBe(true)
          expect(new Set(masks).size).toBe(masks.length)
        })

        await it('puts each cell of a part in a place of its own', async () => {
          const seen = spec.cells.map((cell) => `${cell.part}:${cell.dc},${cell.dr}`)
          expect(new Set(seen).size).toBe(seen.length)
        })
      })
    }

    await it('counts the entries its name promises', async () => {
      expect(terrainPresetSpec(TerrainPreset.Ground29)?.cells.length).toBe(29)
      expect(terrainPresetSpec(TerrainPreset.Patch13)?.cells.length).toBe(13)
      expect(terrainPresetSpec(TerrainPreset.Block9)?.cells.length).toBe(9)
      expect(terrainPresetSpec(TerrainPreset.Path16)?.cells.length).toBe(16)
      expect(terrainPresetSpec(TerrainPreset.Blob47)?.cells.length).toBe(47)
    })

    await it('path-16 is the N·E·S·W bit pattern, row-major', async () => {
      const tiles = terrainTilesForPreset(TerrainPreset.Path16, { block: { col: 0, row: 0 } }, { columns: 4 })
      // single, N, E, N+E … cross
      expect(tiles['0']).toBe(0)
      expect(tiles['1']).toBe(1)
      expect(tiles['4']).toBe(2)
      expect(tiles['5']).toBe(3)
      expect(tiles['85']).toBe(15)
      expect(Object.keys(tiles).length).toBe(16)
    })

    await it('path-16 holds no corner bit and blob-47 every normalised mask', async () => {
      for (const cell of terrainPresetSpec(TerrainPreset.Path16)?.cells ?? [])
        expect((cell.mask & 0b10101010) === 0).toBe(true)
      const masks = (terrainPresetSpec(TerrainPreset.Blob47)?.cells ?? []).map((cell) => cell.mask)
      expect(masks[0]).toBe(0)
      expect(masks[46]).toBe(255)
      expect(masks.slice(0, 5)).toStrictEqual([0, 1, 4, 5, 7])
    })

    await it('blob-47 leaves its 48th cell empty', async () => {
      const tiles = terrainTilesForPreset(
        TerrainPreset.Blob47,
        { block: { col: 2, row: 1 } },
        { columns: 20, rows: 10 },
      )
      expect(Object.keys(tiles).length).toBe(47)
      expect(Object.values(tiles).includes(1 * 20 + 2 + 5 * 20 + 7)).toBe(false)
    })
  })

  await describe('defaultTerrainLayout', async () => {
    await it('places a single-part preset where it was dropped', async () => {
      expect(defaultTerrainLayout(TerrainPreset.Ground29, 5, 7)).toStrictEqual({
        preset: TerrainPreset.Ground29,
        parts: { block: { col: 5, row: 7 } },
      })
    })

    await it('puts the patch corners two columns left, same row', async () => {
      expect(defaultTerrainLayout(TerrainPreset.Patch13, 2, 15).parts).toStrictEqual({
        block: { col: 2, row: 15 },
        corners: { col: 0, row: 15 },
      })
    })

    await it('yields an empty layout for a preset we do not know', async () => {
      expect(defaultTerrainLayout('nope' as TerrainPreset, 0, 0).parts).toStrictEqual({})
    })
  })

  await describe('terrainTilesForPreset', async () => {
    await it("writes this pack's dirt from (5,7)", async () => {
      const tiles = terrainTilesForPreset(
        TerrainPreset.Ground29,
        defaultTerrainLayout(TerrainPreset.Ground29, 5, 7).parts,
        SHEET,
      )
      expect(Object.keys(tiles).length).toBe(29)
      // §2.1: T-junctions (5–6, 7–8), bends (7–8, 7–8), straights
      // (9, 7–8), inner corners (5–6, 9–10), block (7–9, 9–11),
      // ends (5–6, 11–12), cross (7,12), single (8,12).
      expect(tiles['84']).toBe(spriteAt(5, 7))
      expect(tiles['69']).toBe(spriteAt(6, 8))
      expect(tiles['20']).toBe(spriteAt(7, 7))
      expect(tiles['17']).toBe(spriteAt(9, 7))
      expect(tiles['68']).toBe(spriteAt(9, 8))
      expect(tiles['247']).toBe(spriteAt(5, 9))
      expect(tiles['127']).toBe(spriteAt(6, 10))
      expect(tiles['28']).toBe(spriteAt(7, 9))
      expect(tiles['255']).toBe(spriteAt(8, 10))
      expect(tiles['193']).toBe(spriteAt(9, 11))
      expect(tiles['1']).toBe(spriteAt(5, 11))
      expect(tiles['4']).toBe(spriteAt(6, 12))
      expect(tiles['85']).toBe(spriteAt(7, 12))
      expect(tiles['0']).toBe(spriteAt(8, 12))
    })

    await it('paints single cells, because the ground set has a lone tile', async () => {
      const dirt = {
        id: 'dirt',
        name: 'Dirt',
        tiles: terrainTilesForPreset(TerrainPreset.Ground29, { block: { col: 5, row: 7 } }, SHEET),
      }
      expect(terrainFootprint(dirt)).toBe(1)
      expect(resolveTerrainTile(dirt, 0)).toBe(spriteAt(8, 12))
    })

    await it("writes this pack's water with its corners a row lower", async () => {
      // §2.2: the one group whose inner corners do not sit on the
      // block's top row — the reason parts move independently.
      const tiles = terrainTilesForPreset(
        TerrainPreset.Patch13,
        { block: { col: 2, row: 0 }, corners: { col: 0, row: 1 } },
        SHEET,
      )
      expect(Object.keys(tiles).length).toBe(13)
      expect(tiles['28']).toBe(spriteAt(2, 0))
      expect(tiles['255']).toBe(spriteAt(3, 1))
      expect(tiles['193']).toBe(spriteAt(4, 2))
      expect(tiles['247']).toBe(spriteAt(0, 1))
      expect(tiles['223']).toBe(spriteAt(1, 1))
      expect(tiles['253']).toBe(spriteAt(0, 2))
      expect(tiles['127']).toBe(spriteAt(1, 2))
    })

    await it("writes this pack's grass from the default offsets", async () => {
      const tiles = terrainTilesForPreset(
        TerrainPreset.Patch13,
        defaultTerrainLayout(TerrainPreset.Patch13, 2, 15).parts,
        SHEET,
      )
      expect(tiles['255']).toBe(spriteAt(3, 16))
      expect(tiles['247']).toBe(spriteAt(0, 15))
      expect(tiles['127']).toBe(spriteAt(1, 16))
    })

    await it('paints 2×2, because a patch has no lone tile', async () => {
      const water = {
        id: 'water',
        name: 'Water',
        tiles: terrainTilesForPreset(TerrainPreset.Patch13, { block: { col: 2, row: 0 } }, SHEET),
      }
      expect(terrainFootprint(water)).toBe(2)
    })

    await it('skips a part the layout never placed', async () => {
      const tiles = terrainTilesForPreset(TerrainPreset.Patch13, { block: { col: 2, row: 0 } }, SHEET)
      expect(Object.keys(tiles).length).toBe(9)
      expect(tiles['247']).toBe(undefined)
    })

    await it('drops cells that hang off the sheet rather than inventing ids', async () => {
      // The corners part at its default sits two columns left of the
      // block — off the sheet when the block is at column 0.
      const tiles = terrainTilesForPreset(
        TerrainPreset.Patch13,
        defaultTerrainLayout(TerrainPreset.Patch13, 0, 0).parts,
        SHEET,
      )
      expect(Object.keys(tiles).length).toBe(9)

      const bottom = terrainTilesForPreset(TerrainPreset.Block9, { block: { col: 0, row: 30 } }, SHEET)
      expect(Object.keys(bottom).length).toBe(3)
    })

    await it('yields nothing for a preset we do not know', async () => {
      expect(terrainTilesForPreset('nope', { block: { col: 0, row: 0 } }, SHEET)).toStrictEqual({})
      expect(terrainPresetPlacement('nope', {})).toStrictEqual([])
    })
  })
}

describe('the Roguelike starter tileset', () => {
  const sprites = roguelike.sprites as ReadonlyArray<{ id: number; solid?: boolean }>
  const solid = (id: number): boolean => sprites[id]?.solid === true
  const terrain = (id: string) => roguelike.terrains.find((t) => t.id === id)

  it('ships complete brushes for beds, pool, leaves and rugs', () => {
    const patches = ['grass', 'autumn-leaves', 'purple-leaves', 'bed-red', 'bed-white', 'bed-blue', 'pool']
    for (const id of patches) expect(Object.keys(terrain(id)?.tiles ?? {}).length).toBe(13)
    const rugs = ['rug-teal', 'rug-green', 'rug-orange', 'carpet-green', 'carpet-orange', 'carpet-teal']
    for (const id of rugs) expect(Object.keys(terrain(id)?.tiles ?? {}).length).toBe(9)
  })

  it('makes every flower-bed rim solid and leaves the flowers walkable', () => {
    for (const id of ['bed-red', 'bed-white', 'bed-blue']) {
      const tiles = terrain(id)?.tiles as Record<string, number>
      for (const [mask, sprite] of Object.entries(tiles)) {
        expect(solid(sprite)).toBe(mask !== '255')
      }
    }
  })

  it('keeps rugs and leaves walkable', () => {
    for (const id of ['rug-teal', 'carpet-green', 'autumn-leaves']) {
      for (const sprite of Object.values(terrain(id)?.tiles as Record<string, number>))
        expect(solid(sprite)).toBe(false)
    }
  })
})
