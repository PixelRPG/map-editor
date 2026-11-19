/**
 * The matching rule behind a terrain brush.
 *
 * Three properties carry it, and they are worth more than any single
 * lookup:
 *
 *   1. Normalisation is idempotent and closes at 47 — the number the
 *      whole design rests on. A corner only counts with both its edges.
 *   2. Both sides normalise. A table can only hold normalised keys and
 *      a lookup can only ask with one, so a denormalised mask read off
 *      a map still finds the tile drawn for it.
 *   3. Painting never fails. A one-entry table paints that tile
 *      everywhere; nothing short of an empty table yields `null`.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { TerrainData } from '../types/data/index.ts'
import {
  TERRAIN_CORNER_BITS,
  TERRAIN_E,
  TERRAIN_EDGE_BITS,
  TERRAIN_MASK_FULL,
  TERRAIN_MASKS,
  TERRAIN_N,
  TERRAIN_NE,
  TERRAIN_NW,
  TERRAIN_S,
  TERRAIN_SE,
  TERRAIN_SW,
  TERRAIN_W,
  findTerrain,
  floorSpriteIdOf,
  isNormalisedTerrainMask,
  normaliseTerrainMask,
  resolveTerrainTile,
  spriteBelongsToTerrain,
  terrainFootprint,
  terrainFootprintCells,
  terrainIconSpriteId,
  terrainIndexOf,
  terrainMaskAt,
  terrainMasks,
  terrainPaintsPaths,
  terrainPreviewSpriteIds,
  terrainSpriteIds,
} from './terrain.ts'

function terrain(fields: Partial<TerrainData>): TerrainData {
  return { id: 't', name: 'T', tiles: {}, ...fields }
}

/** A probe over a rectangular blob of cells given as `"x,y"`. */
function blob(cells: readonly string[]) {
  const set = new Set(cells)
  return (x: number, y: number) => set.has(`${x},${y}`)
}

export default async () => {
  await describe('normaliseTerrainMask', async () => {
    await it('keeps a corner whose two edges are both set', async () => {
      expect(normaliseTerrainMask(TERRAIN_N | TERRAIN_E | TERRAIN_NE)).toBe(TERRAIN_N | TERRAIN_E | TERRAIN_NE)
      expect(normaliseTerrainMask(TERRAIN_MASK_FULL)).toBe(TERRAIN_MASK_FULL)
    })

    await it('drops a corner that touches at a point only', async () => {
      expect(normaliseTerrainMask(TERRAIN_NE)).toBe(0)
      expect(normaliseTerrainMask(TERRAIN_SE)).toBe(0)
      expect(normaliseTerrainMask(TERRAIN_SW)).toBe(0)
      expect(normaliseTerrainMask(TERRAIN_NW)).toBe(0)
    })

    await it('drops a corner with only one of its two edges', async () => {
      expect(normaliseTerrainMask(TERRAIN_N | TERRAIN_NE)).toBe(TERRAIN_N)
      expect(normaliseTerrainMask(TERRAIN_E | TERRAIN_NE)).toBe(TERRAIN_E)
    })

    await it('ignores bits above the eight neighbours', async () => {
      expect(normaliseTerrainMask(256 | TERRAIN_N)).toBe(TERRAIN_N)
    })

    await it('is idempotent', async () => {
      for (let raw = 0; raw <= TERRAIN_MASK_FULL; raw++) {
        const once = normaliseTerrainMask(raw)
        expect(normaliseTerrainMask(once)).toBe(once)
        expect(isNormalisedTerrainMask(once)).toBe(true)
      }
    })
  })

  await describe('TERRAIN_MASKS', async () => {
    await it('closes at the classic 47', async () => {
      expect(TERRAIN_MASKS.length).toBe(47)
    })

    await it('is ascending, unique and entirely normalised', async () => {
      const seen = new Set<number>()
      let previous = -1
      for (const mask of TERRAIN_MASKS) {
        expect(mask > previous).toBe(true)
        expect(seen.has(mask)).toBe(false)
        expect(isNormalisedTerrainMask(mask)).toBe(true)
        seen.add(mask)
        previous = mask
      }
    })

    await it('holds the empty cell and the surrounded one', async () => {
      expect(TERRAIN_MASKS.includes(0)).toBe(true)
      expect(TERRAIN_MASKS.includes(TERRAIN_MASK_FULL)).toBe(true)
    })

    await it('names four edges and four corners, all distinct bits', async () => {
      const bits = [...TERRAIN_EDGE_BITS, ...TERRAIN_CORNER_BITS]
      expect(bits.length).toBe(8)
      expect(new Set(bits).size).toBe(8)
      expect(bits.reduce((all, bit) => all | bit, 0)).toBe(TERRAIN_MASK_FULL)
    })
  })

  await describe('terrainMaskAt', async () => {
    await it('reads the eight neighbours of a filled blob', async () => {
      // A 3×3 blob at (0,0)–(2,2): the centre is surrounded.
      const probe = blob(['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2'])
      expect(terrainMaskAt(1, 1, probe)).toBe(TERRAIN_MASK_FULL)
      expect(terrainMaskAt(0, 0, probe)).toBe(TERRAIN_E | TERRAIN_SE | TERRAIN_S)
      expect(terrainMaskAt(1, 0, probe)).toBe(TERRAIN_E | TERRAIN_SE | TERRAIN_S | TERRAIN_SW | TERRAIN_W)
      expect(terrainMaskAt(2, 2, probe)).toBe(TERRAIN_N | TERRAIN_W | TERRAIN_NW)
    })

    await it('normalises what it reads', async () => {
      // Only the diagonal neighbour is terrain — it must not count.
      expect(terrainMaskAt(0, 0, blob(['1,1']))).toBe(0)
    })

    await it('treats cells outside the map as the same terrain', async () => {
      const bounds = { columns: 3, rows: 3 }
      expect(terrainMaskAt(0, 0, () => true, bounds)).toBe(TERRAIN_MASK_FULL)
      expect(terrainMaskAt(0, 0, () => false, bounds)).toBe(TERRAIN_N | TERRAIN_W | TERRAIN_NW)
    })

    await it('leaves the outside to the probe when there are no bounds', async () => {
      expect(terrainMaskAt(0, 0, () => false)).toBe(0)
    })
  })

  await describe('terrainMasks', async () => {
    await it('returns the keys as ascending numbers', async () => {
      expect(terrainMasks(terrain({ tiles: { '255': 3, '0': 1, '28': 2 } }))).toStrictEqual([0, 28, 255])
    })

    await it('drops keys that are not usable masks', async () => {
      expect(terrainMasks(terrain({ tiles: { foo: 1, '256': 2, '-1': 3, '1.5': 4, '2': 5 } }))).toStrictEqual([])
    })

    await it('drops a denormalised key rather than matching it', async () => {
      expect(terrainMasks(terrain({ tiles: { '3': 1, '0': 2 } }))).toStrictEqual([0])
    })
  })

  await describe('resolveTerrainTile', async () => {
    const patch = terrain({
      tiles: { '28': 10, '124': 11, '112': 12, '31': 13, '255': 14, '241': 15, '7': 16, '199': 17, '193': 18 },
    })

    await it('returns the exact entry', async () => {
      expect(resolveTerrainTile(patch, 255)).toBe(14)
      expect(resolveTerrainTile(patch, 28)).toBe(10)
    })

    await it('normalises the asked mask before looking it up', async () => {
      // 255 with every corner but no edges normalises to 0 … and 28
      // plus a stray NW corner is still the top-left piece.
      expect(resolveTerrainTile(patch, 28 | TERRAIN_NW)).toBe(10)
    })

    await it('falls back to the nearest entry', async () => {
      // A lone cell (mask 0) has no piece in a 9-entry block; the
      // closest is a corner, which differs in two edges.
      const resolved = resolveTerrainTile(patch, 0)
      expect([10, 12, 16, 18].includes(resolved ?? -1)).toBe(true)
    })

    await it('paints a one-entry table everywhere', async () => {
      const single = terrain({ tiles: { '255': 7 } })
      for (const mask of TERRAIN_MASKS) expect(resolveTerrainTile(single, mask)).toBe(7)
    })

    await it('is null only for a table with no usable entry', async () => {
      expect(resolveTerrainTile(terrain({}), 0)).toBe(null)
      expect(resolveTerrainTile(terrain({ tiles: { nope: 1 } }), 0)).toBe(null)
    })

    await it('is deterministic whatever order the keys were written in', async () => {
      const forwards = terrain({ tiles: { '7': 1, '28': 2, '112': 3, '193': 4 } })
      const backwards = terrain({ tiles: { '193': 4, '112': 3, '28': 2, '7': 1 } })
      for (const mask of TERRAIN_MASKS) {
        expect(resolveTerrainTile(forwards, mask)).toBe(resolveTerrainTile(backwards, mask))
      }
    })

    await it('answers every one of the 47 masks for the ground table', async () => {
      // 29 entries, so 18 masks are nearest-match — none may be a hole.
      const ground = terrain({
        tiles: {
          '84': 1,
          '81': 2,
          '20': 3,
          '80': 4,
          '17': 5,
          '21': 6,
          '69': 7,
          '5': 8,
          '65': 9,
          '68': 10,
          '247': 11,
          '223': 12,
          '28': 13,
          '124': 14,
          '112': 15,
          '253': 16,
          '127': 17,
          '31': 18,
          '255': 19,
          '241': 20,
          '1': 21,
          '16': 22,
          '7': 23,
          '199': 24,
          '193': 25,
          '64': 26,
          '4': 27,
          '85': 28,
          '0': 29,
        },
      })
      for (const mask of TERRAIN_MASKS) expect(resolveTerrainTile(ground, mask)).not.toBe(null)
    })
  })

  await describe('terrainFootprint', async () => {
    await it('is one cell when the table has a single tile', async () => {
      const path = terrain({ tiles: { '0': 1, '255': 2 } })
      expect(terrainFootprint(path)).toBe(1)
      expect(terrainPaintsPaths(path)).toBe(true)
      expect(terrainFootprintCells(path, 3, 4)).toStrictEqual([{ x: 3, y: 4 }])
    })

    await it('is 2×2 when it has none, anchored top-left', async () => {
      const patch = terrain({ tiles: { '255': 2 } })
      expect(terrainFootprint(patch)).toBe(2)
      expect(terrainPaintsPaths(patch)).toBe(false)
      expect(terrainFootprintCells(patch, 3, 4)).toStrictEqual([
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
      ])
    })
  })

  await describe('terrainSpriteIds', async () => {
    const water = terrain({ id: 'water', tiles: { '255': 60, '28': 61 }, members: [2, 3] })

    await it('counts the variants and the members', async () => {
      expect([...terrainSpriteIds(water)].sort((a, b) => a - b)).toStrictEqual([2, 3, 60, 61])
      expect(spriteBelongsToTerrain(water, 2)).toBe(true)
      expect(spriteBelongsToTerrain(water, 60)).toBe(true)
      expect(spriteBelongsToTerrain(water, 99)).toBe(false)
    })

    await it('indexes a whole sprite set by sprite id', async () => {
      const grass = terrain({ id: 'grass', tiles: { '255': 80 } })
      const index = terrainIndexOf({ terrains: [water, grass] })
      expect(index.get(60)?.id).toBe('water')
      expect(index.get(3)?.id).toBe('water')
      expect(index.get(80)?.id).toBe('grass')
      expect(index.get(99)).toBe(undefined)
    })

    await it('gives a contested sprite to the first terrain that claims it', async () => {
      const other = terrain({ id: 'other', tiles: { '255': 60 } })
      expect(terrainIndexOf({ terrains: [water, other] }).get(60)?.id).toBe('water')
      expect(terrainIndexOf({ terrains: [other, water] }).get(60)?.id).toBe('other')
    })

    await it('copes with a set that has no terrains', async () => {
      expect(terrainIndexOf({}).size).toBe(0)
      expect(findTerrain({ terrains: [water] }, 'water')?.name).toBe('T')
      expect(findTerrain({}, 'water')).toBe(undefined)
    })
  })

  await describe('terrainIconSpriteId', async () => {
    await it('prefers the explicit icon', async () => {
      expect(terrainIconSpriteId(terrain({ icon: 5, tiles: { '0': 1, '255': 2 } }))).toBe(5)
    })

    await it('falls back to the single tile, then the centre, then the lowest mask', async () => {
      expect(terrainIconSpriteId(terrain({ tiles: { '0': 1, '255': 2 } }))).toBe(1)
      expect(terrainIconSpriteId(terrain({ tiles: { '28': 3, '255': 2 } }))).toBe(2)
      expect(terrainIconSpriteId(terrain({ tiles: { '28': 3, '31': 4 } }))).toBe(3)
      expect(terrainIconSpriteId(terrain({}))).toBe(null)
    })
  })

  await describe('floorSpriteIdOf', async () => {
    const sprites = [0, 5, 9].map((id) => ({ id, col: id, row: 0 }))

    await it('takes the declared tile when the set has it', async () => {
      expect(floorSpriteIdOf({ floorSpriteId: 5, sprites })).toBe(5)
      expect(floorSpriteIdOf({ floorSpriteId: 0, sprites })).toBe(0)
    })

    await it('answers undefined where nothing is declared', async () => {
      expect(floorSpriteIdOf({ sprites })).toBe(undefined)
    })

    await it('ignores a tile the set does not have', async () => {
      // A hand-edited descriptor must leave the editor scanning for a
      // floor, not drawing the sample on nothing.
      expect(floorSpriteIdOf({ floorSpriteId: 99, sprites })).toBe(undefined)
      expect(floorSpriteIdOf({ floorSpriteId: 5, sprites: [] })).toBe(undefined)
    })
  })

  await describe('terrainPreviewSpriteIds', async () => {
    /** A table that answers every mask with the mask itself. */
    const identity = terrain({ tiles: Object.fromEntries(TERRAIN_MASKS.map((mask) => [String(mask), mask])) })

    await it('reads the ring around the patch as other terrain', async () => {
      // Corners face out, edges face out, only the middle is full.
      expect(terrainPreviewSpriteIds(identity).join(' ')).toBe(
        [28, 124, 112, 31, TERRAIN_MASK_FULL, 241, 7, 199, 193].join(' '),
      )
    })

    await it('still fills nine cells from a one-entry table', async () => {
      expect(terrainPreviewSpriteIds(terrain({ tiles: { '255': 9 } })).join(' ')).toBe('9 9 9 9 9 9 9 9 9')
      expect(terrainPreviewSpriteIds(terrain({})).filter((id) => id !== null).length).toBe(0)
      expect(terrainPreviewSpriteIds(terrain({})).length).toBe(9)
    })
  })
}
