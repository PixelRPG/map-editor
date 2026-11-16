import type { ColliderShape, SpriteDataSet } from '../types/data/index.ts'
import { isSpriteRefSolid } from './sprite-solidity.ts'

/**
 * The ready-made collision shapes behind "Can the hero walk here?".
 *
 * A tileset author never types coordinates: they pick a picture, and
 * that picture is one of these presets. The preset is NOT stored — it
 * is derived from the sprite definition every time the panel opens, so
 * a definition written by the Tiled porter, by a peer over collab or by
 * hand in the JSON classifies exactly like one written by the toggles.
 *
 * The data mapping, chosen so existing games keep their collision:
 *
 *   - {@link CollisionPreset.Free} — `solid: false`, no colliders.
 *   - {@link CollisionPreset.Wall} — `solid: true`, *no* colliders.
 *     Excalibur falls back to the tile bounds for a solid tile without
 *     colliders, so every tile that was `solid: true` before this
 *     module existed is a Wall and stays one.
 *   - the halves and corners — `solid: true` plus one rectangle.
 *   - {@link CollisionPreset.Custom} — anything else (several shapes, a
 *     polygon, a circle, a rectangle off the preset grid). It is a
 *     classification only: {@link tileCollisionForPreset} refuses to
 *     write it, because the shapes live in the Full-view shape editor.
 */
export enum CollisionPreset {
  Free = 'free',
  Wall = 'wall',
  HalfTop = 'half-top',
  HalfBottom = 'half-bottom',
  HalfLeft = 'half-left',
  HalfRight = 'half-right',
  CornerTopLeft = 'corner-top-left',
  CornerTopRight = 'corner-top-right',
  CornerBottomLeft = 'corner-bottom-left',
  CornerBottomRight = 'corner-bottom-right',
  Custom = 'custom',
}

/**
 * The writable presets in the order the pictogram grid shows them:
 * Free · Wall · Half (top, bottom, left, right) · Corner (four).
 *
 * {@link CollisionPreset.Custom} is deliberately absent — it can be
 * read off a definition but never picked.
 */
export const COLLISION_PRESETS: readonly CollisionPreset[] = [
  CollisionPreset.Free,
  CollisionPreset.Wall,
  CollisionPreset.HalfTop,
  CollisionPreset.HalfBottom,
  CollisionPreset.HalfLeft,
  CollisionPreset.HalfRight,
  CollisionPreset.CornerTopLeft,
  CollisionPreset.CornerTopRight,
  CollisionPreset.CornerBottomLeft,
  CollisionPreset.CornerBottomRight,
]

/**
 * The writable preset a name stands for, or `null` for anything else —
 * an unknown name, or `custom`, which is classified but never written.
 *
 * The pictogram toggles name their preset with a plain string (a GObject
 * signal payload, and the same string on the collab wire), so this is
 * the one place a string becomes a {@link CollisionPreset}.
 */
export function writableCollisionPreset(value: string): CollisionPreset | null {
  return COLLISION_PRESETS.find((preset) => preset === value) ?? null
}

/** The collision fields of a sprite definition, as a preset writes them. */
export interface TileCollisionData {
  /** The sprite-set wall flag. Always written explicitly, never left out. */
  solid: boolean
  /**
   * The shapes to store in `definition.colliders`, or `undefined` to
   * remove the field entirely (Free and Wall both want it gone).
   */
  colliders?: ColliderShape[]
}

/**
 * The near half of `size`, rounded up on an odd tile.
 *
 * The far half is always `size - half(size)` rather than a second
 * rounding, so a top half and a bottom half tile exactly with no gap
 * and no overlap even on a 15 px tile.
 */
function half(size: number): number {
  return Math.round(size / 2)
}

function rect(x: number, y: number, width: number, height: number): ColliderShape {
  return { type: 'rectangle', width, height, offset: { x, y } }
}

/**
 * The collision fields for a preset on a tile of this size, or `null`
 * for {@link CollisionPreset.Custom} (not writable — see the enum).
 *
 * Rectangle offsets are tile-local top-left pixels, the convention the
 * Tiled porter already writes (`scripts/port-tiled-collision.mjs`).
 */
export function tileCollisionForPreset(
  preset: CollisionPreset,
  tileWidth: number,
  tileHeight: number,
): TileCollisionData | null {
  const w = tileWidth
  const h = tileHeight
  const hw = half(w)
  const hh = half(h)

  switch (preset) {
    case CollisionPreset.Free:
      return { solid: false }
    case CollisionPreset.Wall:
      return { solid: true }
    case CollisionPreset.HalfTop:
      return { solid: true, colliders: [rect(0, 0, w, hh)] }
    case CollisionPreset.HalfBottom:
      return { solid: true, colliders: [rect(0, hh, w, h - hh)] }
    case CollisionPreset.HalfLeft:
      return { solid: true, colliders: [rect(0, 0, hw, h)] }
    case CollisionPreset.HalfRight:
      return { solid: true, colliders: [rect(hw, 0, w - hw, h)] }
    case CollisionPreset.CornerTopLeft:
      return { solid: true, colliders: [rect(0, 0, hw, hh)] }
    case CollisionPreset.CornerTopRight:
      return { solid: true, colliders: [rect(hw, 0, w - hw, hh)] }
    case CollisionPreset.CornerBottomLeft:
      return { solid: true, colliders: [rect(0, hh, hw, h - hh)] }
    case CollisionPreset.CornerBottomRight:
      return { solid: true, colliders: [rect(hw, hh, w - hw, h - hh)] }
    case CollisionPreset.Custom:
      return null
  }
}

/** Whether two shapes are the same rectangle, treating a missing offset as (0, 0). */
function sameRectangle(a: ColliderShape, b: ColliderShape): boolean {
  if (a.type !== 'rectangle' || b.type !== 'rectangle') return false
  if (a.width !== b.width || a.height !== b.height) return false
  return (a.offset?.x ?? 0) === (b.offset?.x ?? 0) && (a.offset?.y ?? 0) === (b.offset?.y ?? 0)
}

/**
 * Which pictogram describes this sprite definition's collision.
 *
 * Solidity comes from {@link isSpriteRefSolid}, the same function the
 * engine uses to build colliders, so the picture in the panel can never
 * disagree with what the hero bumps into. Shapes are compared against
 * the rectangle {@link tileCollisionForPreset} *generates* for each
 * candidate rather than against a second copy of the geometry, so the
 * writer and the reader cannot drift apart.
 */
export function collisionPresetOf(
  definition: SpriteDataSet | undefined,
  tileWidth: number,
  tileHeight: number,
): CollisionPreset {
  // Not solid = nothing blocks, whatever shapes the definition carries
  // (Excalibur ignores colliders on a non-solid tile).
  if (!isSpriteRefSolid(definition)) return CollisionPreset.Free

  const colliders = definition?.colliders
  if (!colliders || colliders.length === 0) return CollisionPreset.Wall
  if (colliders.length > 1) return CollisionPreset.Custom

  for (const preset of COLLISION_PRESETS) {
    const shape = tileCollisionForPreset(preset, tileWidth, tileHeight)?.colliders?.[0]
    if (shape && sameRectangle(shape, colliders[0])) return preset
  }
  return CollisionPreset.Custom
}

/** One sprite stacked on a tile, as the solidity union sees it. */
export interface TileCollisionRef {
  solid: boolean
  colliders?: readonly ColliderShape[]
}

/**
 * Fold the sprites stacked on one tile into that tile's collision.
 *
 * Solidity is a union: one blocking sprite blocks the tile. Shapes are
 * a union too, and that is why a solid sprite *without* shapes wins
 * outright — it blocks the whole tile, so no partial shape can carve
 * anything back out. Returning an empty array for that case is exactly
 * what Excalibur wants: a solid tile with no colliders uses its bounds.
 */
export function tileCollisionOf(refs: readonly TileCollisionRef[]): TileCollisionData {
  const solidRefs = refs.filter((ref) => ref.solid)
  if (solidRefs.length === 0) return { solid: false, colliders: [] }

  const shapes: ColliderShape[] = []
  for (const ref of solidRefs) {
    if (!ref.colliders || ref.colliders.length === 0) return { solid: true, colliders: [] }
    shapes.push(...ref.colliders)
  }
  return { solid: true, colliders: shapes }
}
