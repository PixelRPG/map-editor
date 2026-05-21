import Gdk from '@girs/gdk-4.0'
import { GameProjectResource } from '@pixelrpg/engine'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import { GdkSpriteSetResource } from '../../sprite/resource/GdkSpriteSetResource'
import type { GdkSpriteSheet } from '../../sprite/objects/GdkSpriteSheet'

interface DrawOp {
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

interface SheetRange {
  spriteSetId: string
  start: number
  end: number
  sheet: GdkSpriteSheet
}

/**
 * Renders a static thumbnail of a project's first map by compositing
 * each tile sprite onto a `Gtk.Snapshot`. Used by the welcome view's
 * template cards and the recent-projects list.
 *
 * Why a custom widget instead of an `Engine`: each `Engine` would spin
 * up its own Excalibur runtime + GL context, which is wasteful for
 * tiny static previews. This widget loads the project, decodes the
 * sprite-sheets via the existing `GdkSpriteSetResource` pipeline, and
 * batches one `append_scaled_texture` call per tile. GTK caches the
 * resulting GSK tree, so the per-tile cost is paid exactly once.
 */
export class MapPreview extends Gtk.Widget {
  private _ops: DrawOp[] = []
  private _mapWidth = 0
  private _mapHeight = 0
  private _accentColor: Gdk.RGBA
  private _loaded = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgMapPreview',
        Properties: {
          'accent-color': GObject.ParamSpec.string(
            'accent-color',
            'Accent color',
            'Fallback background colour used when the project has no tile data',
            GObject.ParamFlags.READWRITE,
            '#3a3a40',
          ),
        },
      },
      MapPreview,
    )
  }

  constructor() {
    super()
    this._accentColor = new Gdk.RGBA()
    this._accentColor.parse('#3a3a40')
    this.can_target = false
  }

  set accentColor(value: string) {
    if (this._accentColor.parse(value)) this.queue_draw()
  }

  /**
   * Load a project + its first map. Resolves once the preview is ready
   * to paint, even if loading failed (in which case the widget renders
   * the accent placeholder).
   */
  async loadProject(projectPath: string): Promise<void> {
    try {
      const resource = new GameProjectResource(projectPath, {
        preloadAllMaps: true,
        preloadAllSpriteSets: true,
      })
      await resource.load()
      const firstMap = Array.from(resource.maps.values())[0]?.mapData
      if (!firstMap) {
        this._loaded = true
        return
      }

      const ranges = await this._collectSheets(resource, firstMap.spriteSets ?? [])
      this._mapWidth = firstMap.columns * firstMap.tileWidth
      this._mapHeight = firstMap.rows * firstMap.tileHeight

      const ops: DrawOp[] = []
      for (const layer of firstMap.layers ?? []) {
        if (layer.type !== 'tile' || !layer.visible || !layer.sprites) continue
        for (const tile of layer.sprites) {
          const ranges_resolved = this._resolveSpriteByLocalId(ranges, tile.spriteSetId, tile.spriteId)
          if (!ranges_resolved) continue
          ops.push({
            texture: ranges_resolved.texture,
            sx: ranges_resolved.x,
            sy: ranges_resolved.y,
            sw: ranges_resolved.width,
            sh: ranges_resolved.height,
            tx: tile.x * firstMap.tileWidth,
            ty: tile.y * firstMap.tileHeight,
            tw: firstMap.tileWidth,
            th: firstMap.tileHeight,
          })
        }
      }
      this._ops = ops
      this._loaded = true
      this.queue_draw()
    } catch (error) {
      console.warn('[MapPreview] Failed to render preview:', error)
      this._loaded = true
    }
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const width = this.get_width()
    const height = this.get_height()
    if (width <= 0 || height <= 0) return

    const background = new Graphene.Rect()
    background.init(0, 0, width, height)
    snapshot.append_color(this._accentColor, background)

    if (!this._loaded || !this._ops.length || !this._mapWidth || !this._mapHeight) return

    const scale = Math.min(width / this._mapWidth, height / this._mapHeight)
    const offsetX = (width - this._mapWidth * scale) / 2
    const offsetY = (height - this._mapHeight * scale) / 2

    const translatePoint = new Graphene.Point({ x: offsetX, y: offsetY })
    snapshot.save()
    snapshot.translate(translatePoint)

    for (const op of this._ops) {
      this._paintTile(snapshot, op, scale)
    }

    snapshot.restore()
  }

  private _paintTile(snapshot: Gtk.Snapshot, op: DrawOp, scale: number): void {
    const target = new Graphene.Rect()
    target.init(op.tx * scale, op.ty * scale, op.tw * scale, op.th * scale)
    snapshot.push_clip(target)
    snapshot.save()

    // The texture is the full atlas. Translate so the wanted sub-region
    // lines up with `target`, then paint the whole atlas at the same
    // scale. Push_clip keeps the rest invisible.
    const textureScale = (op.tw * scale) / op.sw
    const translatePoint = new Graphene.Point({
      x: op.tx * scale - op.sx * textureScale,
      y: op.ty * scale - op.sy * textureScale,
    })
    snapshot.translate(translatePoint)

    const fullRect = new Graphene.Rect()
    fullRect.init(0, 0, op.texture.get_width() * textureScale, op.texture.get_height() * textureScale)
    snapshot.append_scaled_texture(op.texture, Gsk.ScalingFilter.NEAREST, fullRect)

    snapshot.restore()
    snapshot.pop()
  }

  private async _collectSheets(
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
   * Look up a sprite by its `(spriteSetId, spriteId)` reference and
   * resolve it to a renderable atlas region. The map format stores
   * `spriteId` as a **local** 0-based index within the named set.
   */
  private _resolveSpriteByLocalId(
    ranges: SheetRange[],
    spriteSetId: string,
    localId: number,
  ): { texture: Gdk.Texture; x: number; y: number; width: number; height: number } | null {
    const range = ranges.find((r) => r.spriteSetId === spriteSetId)
    if (!range) return null
    const sprite = range.sheet.sprites[localId]
    if (!sprite) return null
    const texture = sprite.sourceTexture
    if (!texture) return null
    return { texture, x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height }
  }
}

GObject.type_ensure(MapPreview.$gtype)
