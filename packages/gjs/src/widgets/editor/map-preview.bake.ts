import type Gdk from '@girs/gdk-4.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource, MapData } from '@pixelrpg/engine'

import type { GdkSpriteSheet } from '../../sprite/objects/GdkSpriteSheet'
import { GdkSpriteSetResource } from '../../sprite/resource/GdkSpriteSetResource'
import { type MapRect, tileIntersectsClip } from './map-preview.geometry.ts'

/** One tile of a bake: where to read from the atlas and where to put it. */
export interface DrawOp {
  texture: Gdk.Texture
  /** Sprite location in the atlas (source coordinates, source pixels). */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Tile position in the map (pre-scale, in map-pixel units). */
  tx: number
  ty: number
  tw: number
  th: number
}

/** A sprite-set's decoded sheet plus the global id range it covers. */
export interface SheetRange {
  spriteSetId: string
  start: number
  end: number
  sheet: GdkSpriteSheet
}

/** Where and how a bake paints: scale, map-pixel offset and the target region. */
export interface BakePlacement {
  scale: number
  offsetXMapPx: number
  offsetYMapPx: number
  region: Graphene.Rect
}

/**
 * Decode every sprite set a map references into a {@link SheetRange}. Sets
 * that fail to load are skipped with a warning — a preview missing one
 * tileset still beats no preview at all.
 */
export async function collectSheets(
  resource: GameProjectResource,
  spriteSetRefs: { id: string; firstGid: number }[],
): Promise<SheetRange[]> {
  const ranges: SheetRange[] = []
  for (const ref of spriteSetRefs) {
    try {
      const engineSet = await resource.getSpriteSet(ref.id)
      if (!engineSet) continue
      const gdkSet = await GdkSpriteSetResource.fromEngineResource(engineSet)
      if (!gdkSet.spriteSheet) continue
      ranges.push({
        spriteSetId: ref.id,
        start: ref.firstGid,
        end: ref.firstGid + gdkSet.spriteSheet.sprites.length - 1,
        sheet: gdkSet.spriteSheet,
      })
    } catch (error) {
      console.warn(`[MapPreview] Failed to load sprite set ${ref.id}:`, error)
    }
  }
  return ranges
}

/**
 * Look up a sprite by its `(spriteSetId, spriteId)` reference and resolve it
 * to a renderable atlas region. The map format stores `spriteId` as a
 * **local** 0-based index within the named set.
 */
function resolveSpriteByLocalId(
  ranges: SheetRange[],
  spriteSetId: string,
  localId: number,
): { texture: Gdk.Texture; x: number; y: number; width: number; height: number } | null {
  const sprite = ranges.find((r) => r.spriteSetId === spriteSetId)?.sheet.sprites[localId]
  const texture = sprite?.sourceTexture
  if (!sprite || !texture) return null
  return { texture, x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height }
}

/** Build the per-tile draw ops for a map, optionally clipped to a map-px rect. */
export function buildDrawOps(mapData: MapData, ranges: SheetRange[], clip: MapRect | null): DrawOp[] {
  const ops: DrawOp[] = []
  for (const layer of mapData.layers ?? []) {
    if (!layer.visible || !layer.sprites) continue
    for (const tile of layer.sprites) {
      const tx = tile.x * mapData.tileWidth
      const ty = tile.y * mapData.tileHeight
      if (clip && !tileIntersectsClip(tx, ty, mapData.tileWidth, mapData.tileHeight, clip)) continue
      const resolved = resolveSpriteByLocalId(ranges, tile.spriteSetId, tile.spriteId)
      if (!resolved) continue
      ops.push({
        texture: resolved.texture,
        sx: resolved.x,
        sy: resolved.y,
        sw: resolved.width,
        sh: resolved.height,
        tx,
        ty,
        tw: mapData.tileWidth,
        th: mapData.tileHeight,
      })
    }
  }
  return ops
}

/**
 * Rasterise `ops` into a texture. `background`, when given, fills the map
 * bounds first — fit mode shows the widget's accent colour outside them, and
 * viewport mode clamps inside the map anyway.
 */
export function renderOps(
  renderer: Gsk.Renderer,
  ops: DrawOp[],
  placement: BakePlacement,
  mapWidth: number,
  mapHeight: number,
  background: Gdk.RGBA | null,
): Gdk.Texture | null {
  const { scale, offsetXMapPx, offsetYMapPx, region } = placement
  const snapshot = Gtk.Snapshot.new()
  if (background) {
    const fill = new Graphene.Rect()
    fill.init(
      Math.max(0, offsetXMapPx * scale),
      Math.max(0, offsetYMapPx * scale),
      Math.min(region.get_width(), mapWidth * scale),
      Math.min(region.get_height(), mapHeight * scale),
    )
    snapshot.append_color(background, fill)
  }
  // The three Graphene temps are reused across the whole loop — allocating
  // them per tile triples the GI overhead of the hottest loop in here.
  const target = new Graphene.Rect()
  const translatePoint = new Graphene.Point()
  const fullRect = new Graphene.Rect()
  for (const op of ops) {
    paintTile(snapshot, op, placement, target, translatePoint, fullRect)
  }
  const node = snapshot.to_node()
  if (!node) return null
  try {
    return renderer.render_texture(node, region)
  } catch (error) {
    console.warn('[MapPreview] Failed to bake preview texture:', error)
    return null
  }
}

/** Append one tile to the bake snapshot, reusing the caller-owned temps. */
function paintTile(
  snapshot: Gtk.Snapshot,
  op: DrawOp,
  placement: BakePlacement,
  target: Graphene.Rect,
  translatePoint: Graphene.Point,
  fullRect: Graphene.Rect,
): void {
  const { scale, offsetXMapPx, offsetYMapPx } = placement
  const tx = (op.tx + offsetXMapPx) * scale
  const ty = (op.ty + offsetYMapPx) * scale
  target.init(tx, ty, op.tw * scale, op.th * scale)
  snapshot.push_clip(target)
  snapshot.save()

  // The texture is the full atlas. Translate so the wanted sub-region
  // lines up with `target`, then paint the whole atlas at the same
  // scale. Push_clip keeps the rest invisible.
  const textureScale = (op.tw * scale) / op.sw
  translatePoint.init(tx - op.sx * textureScale, ty - op.sy * textureScale)
  snapshot.translate(translatePoint)

  fullRect.init(0, 0, op.texture.get_width() * textureScale, op.texture.get_height() * textureScale)
  snapshot.append_scaled_texture(op.texture, Gsk.ScalingFilter.NEAREST, fullRect)

  snapshot.restore()
  snapshot.pop()
}
