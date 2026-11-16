/**
 * The collision presets behind "Can the hero walk here?".
 *
 * Two properties carry the feature and are worth more than the
 * individual coordinates:
 *
 *   1. Round trip — every writable preset classifies back to itself,
 *      on an even tile and on an odd one. If it did not, opening the
 *      panel would show a different picture than the one just picked.
 *   2. Tiling — a half and its opposite half cover the tile exactly,
 *      with no gap and no overlap, which is why the far side is a
 *      subtraction and not a second rounding.
 */

import { describe, expect, it } from '@gjsify/unit'

import type { ColliderShape, SpriteDataSet } from '../types/data/index.ts'
import {
  COLLISION_PRESETS,
  CollisionPreset,
  collisionPresetOf,
  spriteCollisionRef,
  spriteSetCollisionRefs,
  tileCollisionForPreset,
  tileCollisionOf,
  writableCollisionPreset,
} from './tile-collision.ts'

function sprite(fields: Partial<SpriteDataSet>): SpriteDataSet {
  return { id: 0, col: 0, row: 0, ...fields } as SpriteDataSet
}

/** A sprite definition carrying whatever the preset writes. */
function spriteForPreset(preset: CollisionPreset, tileWidth = 16, tileHeight = 16): SpriteDataSet {
  const data = tileCollisionForPreset(preset, tileWidth, tileHeight)
  if (!data) throw new Error(`preset ${preset} is not writable`)
  return sprite({ solid: data.solid, colliders: data.colliders })
}

function rectOf(shape: ColliderShape): { x: number; y: number; width: number; height: number } {
  if (shape.type !== 'rectangle') throw new Error(`expected a rectangle, got ${shape.type}`)
  return { x: shape.offset?.x ?? 0, y: shape.offset?.y ?? 0, width: shape.width, height: shape.height }
}

function onlyRect(preset: CollisionPreset, tileWidth: number, tileHeight: number) {
  const colliders = tileCollisionForPreset(preset, tileWidth, tileHeight)?.colliders
  expect(colliders?.length).toBe(1)
  return rectOf(colliders![0])
}

export default async () => {
  await describe('tileCollisionForPreset', async () => {
    await it('writes Free as explicitly not solid with no shapes', async () => {
      expect(tileCollisionForPreset(CollisionPreset.Free, 16, 16)).toStrictEqual({ solid: false })
    })

    await it('writes Wall as solid with no shapes, so the tile bounds are used', async () => {
      expect(tileCollisionForPreset(CollisionPreset.Wall, 16, 16)).toStrictEqual({ solid: true })
    })

    await it('places the halves on a 16 px tile', async () => {
      expect(onlyRect(CollisionPreset.HalfTop, 16, 16)).toStrictEqual({ x: 0, y: 0, width: 16, height: 8 })
      expect(onlyRect(CollisionPreset.HalfBottom, 16, 16)).toStrictEqual({ x: 0, y: 8, width: 16, height: 8 })
      expect(onlyRect(CollisionPreset.HalfLeft, 16, 16)).toStrictEqual({ x: 0, y: 0, width: 8, height: 16 })
      expect(onlyRect(CollisionPreset.HalfRight, 16, 16)).toStrictEqual({ x: 8, y: 0, width: 8, height: 16 })
    })

    await it('places the corners on a 16 px tile', async () => {
      expect(onlyRect(CollisionPreset.CornerTopLeft, 16, 16)).toStrictEqual({ x: 0, y: 0, width: 8, height: 8 })
      expect(onlyRect(CollisionPreset.CornerTopRight, 16, 16)).toStrictEqual({ x: 8, y: 0, width: 8, height: 8 })
      expect(onlyRect(CollisionPreset.CornerBottomLeft, 16, 16)).toStrictEqual({ x: 0, y: 8, width: 8, height: 8 })
      expect(onlyRect(CollisionPreset.CornerBottomRight, 16, 16)).toStrictEqual({ x: 8, y: 8, width: 8, height: 8 })
    })

    await it('lets opposite halves tile an odd-sized tile exactly', async () => {
      const top = onlyRect(CollisionPreset.HalfTop, 15, 15)
      const bottom = onlyRect(CollisionPreset.HalfBottom, 15, 15)
      expect(top.y).toBe(0)
      expect(top.y + top.height).toBe(bottom.y)
      expect(bottom.y + bottom.height).toBe(15)

      const left = onlyRect(CollisionPreset.HalfLeft, 15, 15)
      const right = onlyRect(CollisionPreset.HalfRight, 15, 15)
      expect(left.x).toBe(0)
      expect(left.x + left.width).toBe(right.x)
      expect(right.x + right.width).toBe(15)
    })

    await it('lets the four corners tile a non-square tile exactly', async () => {
      const corners = [
        onlyRect(CollisionPreset.CornerTopLeft, 24, 15),
        onlyRect(CollisionPreset.CornerTopRight, 24, 15),
        onlyRect(CollisionPreset.CornerBottomLeft, 24, 15),
        onlyRect(CollisionPreset.CornerBottomRight, 24, 15),
      ]
      const area = corners.reduce((sum, r) => sum + r.width * r.height, 0)
      expect(area).toBe(24 * 15)
      for (const corner of corners) {
        expect(corner.x + corner.width <= 24).toBe(true)
        expect(corner.y + corner.height <= 15).toBe(true)
      }
    })

    await it('refuses to write Custom — its shapes come from the shape editor', async () => {
      expect(tileCollisionForPreset(CollisionPreset.Custom, 16, 16)).toBe(null)
    })

    await it('offers every preset but Custom in the pictogram grid', async () => {
      expect(COLLISION_PRESETS.includes(CollisionPreset.Custom)).toBe(false)
      expect(COLLISION_PRESETS.length).toBe(10)
      for (const preset of COLLISION_PRESETS) {
        expect(tileCollisionForPreset(preset, 16, 16)).not.toBe(null)
      }
    })
  })

  await describe('writableCollisionPreset', async () => {
    await it('accepts the name of every pictogram', async () => {
      for (const preset of COLLISION_PRESETS) {
        expect(writableCollisionPreset(preset)).toBe(preset)
      }
    })

    await it('refuses Custom, an unknown name and an empty string', async () => {
      expect(writableCollisionPreset(CollisionPreset.Custom)).toBeNull()
      expect(writableCollisionPreset('half-diagonal')).toBeNull()
      expect(writableCollisionPreset('')).toBeNull()
    })
  })

  await describe('collisionPresetOf', async () => {
    await it('round-trips every writable preset on a 16 px tile', async () => {
      for (const preset of COLLISION_PRESETS) {
        expect(collisionPresetOf(spriteForPreset(preset), 16, 16)).toBe(preset)
      }
    })

    await it('round-trips every writable preset on an odd, non-square tile', async () => {
      for (const preset of COLLISION_PRESETS) {
        expect(collisionPresetOf(spriteForPreset(preset, 24, 15), 24, 15)).toBe(preset)
      }
    })

    await it('reads a pre-presets solid tile as a Wall', async () => {
      expect(collisionPresetOf(sprite({ solid: true }), 16, 16)).toBe(CollisionPreset.Wall)
      expect(collisionPresetOf(sprite({ solid: true, colliders: [] }), 16, 16)).toBe(CollisionPreset.Wall)
    })

    await it('reads a tile nothing declares solid as Free', async () => {
      expect(collisionPresetOf(sprite({}), 16, 16)).toBe(CollisionPreset.Free)
      expect(collisionPresetOf(undefined, 16, 16)).toBe(CollisionPreset.Free)
    })

    await it('reads walkable:false as a Wall, like the engine does', async () => {
      expect(collisionPresetOf(sprite({ tileProperties: { walkable: false } }), 16, 16)).toBe(CollisionPreset.Wall)
    })

    await it('ignores shapes on a tile that does not block', async () => {
      const dormant = sprite({ solid: false, colliders: [{ type: 'rectangle', width: 16, height: 8 }] })
      expect(collisionPresetOf(dormant, 16, 16)).toBe(CollisionPreset.Free)
    })

    await it('reads a shape off the preset grid as Custom', async () => {
      const odd = sprite({
        solid: true,
        colliders: [{ type: 'rectangle', width: 5, height: 11, offset: { x: 3, y: 1 } }],
      })
      expect(collisionPresetOf(odd, 16, 16)).toBe(CollisionPreset.Custom)
    })

    await it('reads a polygon, a circle and several shapes as Custom', async () => {
      const polygon = sprite({
        solid: true,
        colliders: [
          {
            type: 'polygon',
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 16 },
              { x: 16, y: 16 },
            ],
          },
        ],
      })
      const circle = sprite({ solid: true, colliders: [{ type: 'circle', radius: 8, offset: { x: 8, y: 8 } }] })
      const two = sprite({
        solid: true,
        colliders: [
          { type: 'rectangle', width: 16, height: 8, offset: { x: 0, y: 0 } },
          { type: 'rectangle', width: 8, height: 8, offset: { x: 0, y: 8 } },
        ],
      })
      expect(collisionPresetOf(polygon, 16, 16)).toBe(CollisionPreset.Custom)
      expect(collisionPresetOf(circle, 16, 16)).toBe(CollisionPreset.Custom)
      expect(collisionPresetOf(two, 16, 16)).toBe(CollisionPreset.Custom)
    })

    await it('reads the same rectangle as a half on one tile size and Custom on another', async () => {
      const topHalfOf16 = spriteForPreset(CollisionPreset.HalfTop, 16, 16)
      expect(collisionPresetOf(topHalfOf16, 16, 16)).toBe(CollisionPreset.HalfTop)
      expect(collisionPresetOf(topHalfOf16, 32, 32)).toBe(CollisionPreset.Custom)
    })
  })

  await describe('spriteCollisionRef', async () => {
    await it('leaves a missing definition walkable', async () => {
      expect(spriteCollisionRef(undefined)).toStrictEqual({ solid: false, colliders: undefined })
    })

    await it('carries the stored shapes of a blocking sprite', async () => {
      const halfTop = spriteForPreset(CollisionPreset.HalfTop)
      expect(spriteCollisionRef(halfTop)).toStrictEqual({ solid: true, colliders: halfTop.colliders })
    })

    // The trap the shared helper exists for: a Tiled-ported tileset
    // marks walls through `tileProperties.walkable`, never `solid`. An
    // overlay deriving solidity from `solid` alone would show those
    // tiles as walkable while the hero bumps into them.
    await it('blocks on tileProperties.walkable === false', async () => {
      expect(spriteCollisionRef(sprite({ tileProperties: { walkable: false } })).solid).toBe(true)
    })

    await it('lets a placement override the definition both ways', async () => {
      const wall = spriteForPreset(CollisionPreset.Wall)
      expect(spriteCollisionRef(wall, false).solid).toBe(false)
      expect(spriteCollisionRef(sprite({ solid: false }), true).solid).toBe(true)
    })
  })

  await describe('spriteSetCollisionRefs', async () => {
    await it('keys the blocking tiles by sprite id and drops the rest', async () => {
      const refs = spriteSetCollisionRefs([
        sprite({ id: 0, solid: false }),
        sprite({ id: 3, solid: true }),
        sprite({ id: 7, tileProperties: { walkable: false } }),
      ])
      expect([...refs.keys()]).toStrictEqual([3, 7])
      expect(refs.get(3)?.solid).toBe(true)
    })

    await it('survives a set that is not loaded yet', async () => {
      expect(spriteSetCollisionRefs(undefined).size).toBe(0)
    })
  })

  await describe('tileCollisionOf', async () => {
    const topHalf: ColliderShape = { type: 'rectangle', width: 16, height: 8, offset: { x: 0, y: 0 } }
    const bottomHalf: ColliderShape = { type: 'rectangle', width: 16, height: 8, offset: { x: 0, y: 8 } }

    await it('leaves an empty tile walkable', async () => {
      expect(tileCollisionOf([])).toStrictEqual({ solid: false, colliders: [] })
    })

    await it('leaves a tile of non-blocking sprites walkable', async () => {
      expect(tileCollisionOf([{ solid: false }, { solid: false, colliders: [topHalf] }])).toStrictEqual({
        solid: false,
        colliders: [],
      })
    })

    await it('blocks as soon as one stacked sprite blocks', async () => {
      expect(tileCollisionOf([{ solid: false }, { solid: true, colliders: [topHalf] }])).toStrictEqual({
        solid: true,
        colliders: [topHalf],
      })
    })

    await it('unions the shapes of several blocking sprites', async () => {
      expect(
        tileCollisionOf([
          { solid: true, colliders: [topHalf] },
          { solid: true, colliders: [bottomHalf] },
        ]),
      ).toStrictEqual({ solid: true, colliders: [topHalf, bottomHalf] })
    })

    await it('lets a full-tile wall swallow the partial shapes above it', async () => {
      expect(tileCollisionOf([{ solid: true, colliders: [topHalf] }, { solid: true }])).toStrictEqual({
        solid: true,
        colliders: [],
      })
      expect(tileCollisionOf([{ solid: true }, { solid: true, colliders: [bottomHalf] }])).toStrictEqual({
        solid: true,
        colliders: [],
      })
    })

    await it('ignores shapes carried by a sprite that does not block', async () => {
      expect(
        tileCollisionOf([
          { solid: false, colliders: [topHalf] },
          { solid: true, colliders: [bottomHalf] },
        ]),
      ).toStrictEqual({ solid: true, colliders: [bottomHalf] })
    })
  })
}
