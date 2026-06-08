import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import { GameProjectResource, type MapData } from '@pixelrpg/engine'
import type { GdkSpriteSheet } from '../../sprite/objects/GdkSpriteSheet'
import { GdkSpriteSetResource } from '../../sprite/resource/GdkSpriteSetResource'

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
/** Cap the baked preview texture's longest edge — these are small thumbnails. */
const BAKE_MAX_EDGE = 512

export class MapPreview extends Gtk.Widget {
  private _ops: DrawOp[] = []
  private _mapWidth = 0
  private _mapHeight = 0
  private _accentColor: Gdk.RGBA
  private _loaded = false
  // The composited tiles, rasterised to ONE texture so repaints (atlas
  // pan, card hover) are O(1) instead of re-rendering N clipped tile nodes
  // every frame. Invalidated whenever the tile ops change; rebuilt lazily
  // off the first paint (when the widget has a renderer).
  private _baked: Gdk.Texture | null = null
  private _bakeScheduled = false

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
   * Load a project + its first map from disk. Resolves once the
   * preview is ready to paint, even if loading failed (in which case
   * the widget renders the accent placeholder).
   *
   * Used by the welcome view, where each template card owns its own
   * fetch. Atlas/inspector previews reuse the already-loaded resource
   * via {@link setFromResource}.
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
      await this._populateFromMap(firstMap, await this._collectSheets(resource, firstMap.spriteSets ?? []))
    } catch (error) {
      console.warn('[MapPreview] Failed to render preview:', error)
      this._loaded = true
    }
  }

  /**
   * Render the preview from an **already-loaded** project resource.
   * Avoids a second filesystem trip when the host (atlas view, scene
   * inspector) has already parsed the project file.
   *
   * Pass a specific `mapId` to render a non-default map; otherwise
   * the project's first map is used.
   */
  async setFromResource(resource: GameProjectResource, mapId?: string): Promise<void> {
    try {
      const mapData = mapId ? resource.maps.get(mapId)?.mapData : Array.from(resource.maps.values())[0]?.mapData
      if (!mapData) {
        this._loaded = true
        this.queue_draw()
        return
      }
      await this._populateFromMap(mapData, await this._collectSheets(resource, mapData.spriteSets ?? []))
    } catch (error) {
      console.warn('[MapPreview] Failed to render preview:', error)
      this._loaded = true
    }
  }

  private async _populateFromMap(mapData: MapData, ranges: SheetRange[]): Promise<void> {
    this._mapWidth = mapData.columns * mapData.tileWidth
    this._mapHeight = mapData.rows * mapData.tileHeight

    const ops: DrawOp[] = []
    for (const layer of mapData.layers ?? []) {
      if (!layer.visible || !layer.sprites) continue
      for (const tile of layer.sprites) {
        const resolved = this._resolveSpriteByLocalId(ranges, tile.spriteSetId, tile.spriteId)
        if (!resolved) continue
        ops.push({
          texture: resolved.texture,
          sx: resolved.x,
          sy: resolved.y,
          sw: resolved.width,
          sh: resolved.height,
          tx: tile.x * mapData.tileWidth,
          ty: tile.y * mapData.tileHeight,
          tw: mapData.tileWidth,
          th: mapData.tileHeight,
        })
      }
    }
    this._ops = ops
    this._loaded = true
    this._baked = null // tiles changed → re-bake on next paint
    this.queue_draw()
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
    const dw = this._mapWidth * scale
    const dh = this._mapHeight * scale
    const dest = new Graphene.Rect()
    dest.init((width - dw) / 2, (height - dh) / 2, dw, dh)

    // Fast path: paint the pre-rasterised composite (one texture).
    if (this._baked) {
      snapshot.append_scaled_texture(this._baked, Gsk.ScalingFilter.NEAREST, dest)
      return
    }

    // First paint (or just after the tiles changed): draw the tiles
    // directly this once, and bake them to a texture for every paint
    // after. The bake runs off an idle so it isn't a re-entrant
    // `render_texture` inside this snapshot.
    snapshot.save()
    snapshot.translate(new Graphene.Point({ x: dest.get_x(), y: dest.get_y() }))
    for (const op of this._ops) this._paintTile(snapshot, op, scale)
    snapshot.restore()
    this._scheduleBake()
  }

  /** Rasterise the tile composite to one texture (off-snapshot), then repaint. */
  private _scheduleBake(): void {
    if (this._bakeScheduled) return
    this._bakeScheduled = true
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._bakeScheduled = false
      if (!this._baked && this._ops.length) {
        this._baked = this._bakeTexture()
        if (this._baked) this.queue_draw()
      }
      return GLib.SOURCE_REMOVE
    })
  }

  private _bakeTexture(): Gdk.Texture | null {
    const renderer = this.get_native()?.get_renderer()
    if (!renderer || !this._mapWidth || !this._mapHeight) return null
    // Bake at native map resolution, capped so a large map stays a small
    // thumbnail texture (it's only ever shown card-sized).
    const bakeScale = Math.min(1, BAKE_MAX_EDGE / Math.max(this._mapWidth, this._mapHeight))
    const sub = Gtk.Snapshot.new()
    for (const op of this._ops) this._paintTile(sub, op, bakeScale)
    const node = sub.to_node()
    if (!node) return null
    const region = new Graphene.Rect()
    region.init(0, 0, this._mapWidth * bakeScale, this._mapHeight * bakeScale)
    try {
      return renderer.render_texture(node, region)
    } catch (error) {
      console.warn('[MapPreview] Failed to bake preview texture:', error)
      return null
    }
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
