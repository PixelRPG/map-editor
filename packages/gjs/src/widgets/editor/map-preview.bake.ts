import type Gdk from '@girs/gdk-4.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'

import { GdkSpriteSetResource } from '../../sprite/resource/GdkSpriteSetResource'
import { type BakeOffset, type DrawOp, type SheetRange, tileTransform } from './map-preview.ops.ts'

/** Where and how a bake paints: scale, map-pixel offset and the target region. */
export interface BakePlacement extends BakeOffset {
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

/**
 * Append one tile to the bake snapshot, reusing the caller-owned temps.
 * The arithmetic lives in {@link tileTransform} (GTK-free, unit-tested);
 * this only feeds it into the snapshot.
 */
function paintTile(
  snapshot: Gtk.Snapshot,
  op: DrawOp,
  placement: BakePlacement,
  target: Graphene.Rect,
  translatePoint: Graphene.Point,
  fullRect: Graphene.Rect,
): void {
  const t = tileTransform(op, placement)
  target.init(t.targetX, t.targetY, t.targetW, t.targetH)
  snapshot.push_clip(target)
  snapshot.save()

  // The texture is the full atlas. Translate so the wanted sub-region
  // lines up with `target`, then paint the whole atlas at the same
  // scale. Push_clip keeps the rest invisible.
  translatePoint.init(t.translateX, t.translateY)
  snapshot.translate(translatePoint)

  fullRect.init(0, 0, op.texture.get_width() * t.atlasScale, op.texture.get_height() * t.atlasScale)
  snapshot.append_scaled_texture(op.texture, Gsk.ScalingFilter.NEAREST, fullRect)

  snapshot.restore()
  snapshot.pop()
}
