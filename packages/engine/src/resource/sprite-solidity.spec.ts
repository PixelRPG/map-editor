/**
 * Tile-solidity precedence.
 *
 * Three sources can declare a tile solid and they disagree on purpose:
 * an explicit `solid: false` on the sprite definition must beat the
 * `walkable === false` fallback, otherwise a tileset author cannot
 * un-block a tile whose surface metadata says "not walkable".
 */

import { describe, expect, it } from '@gjsify/unit'

import type { SpriteDataSet } from '../types/data/index.ts'
import { isSpriteRefSolid } from './sprite-solidity.ts'

function sprite(fields: Partial<SpriteDataSet>): SpriteDataSet {
  return { id: 0, col: 0, row: 0, ...fields } as SpriteDataSet
}

export default async () => {
  await describe('isSpriteRefSolid', async () => {
    await it('honours an explicit per-placement override above everything', async () => {
      const wall = sprite({ solid: true, tileProperties: { walkable: false } })
      expect(isSpriteRefSolid(wall, false)).toBe(false)
      expect(isSpriteRefSolid(sprite({ solid: false }), true)).toBe(true)
    })

    await it('reads the sprite-set solid flag when no override is given', async () => {
      expect(isSpriteRefSolid(sprite({ solid: true }))).toBe(true)
      expect(isSpriteRefSolid(sprite({ solid: false }))).toBe(false)
    })

    await it('lets an explicit solid:false win over walkable:false', async () => {
      expect(isSpriteRefSolid(sprite({ solid: false, tileProperties: { walkable: false } }))).toBe(false)
    })

    await it('falls back to walkable:false when solid is unset', async () => {
      expect(isSpriteRefSolid(sprite({ tileProperties: { walkable: false } }))).toBe(true)
      expect(isSpriteRefSolid(sprite({ tileProperties: { walkable: true } }))).toBe(false)
    })

    await it('is not solid when nothing declares solidity', async () => {
      expect(isSpriteRefSolid(sprite({}))).toBe(false)
      expect(isSpriteRefSolid(undefined)).toBe(false)
    })

    await it('still honours an override for an unknown sprite definition', async () => {
      expect(isSpriteRefSolid(undefined, true)).toBe(true)
    })
  })
}
