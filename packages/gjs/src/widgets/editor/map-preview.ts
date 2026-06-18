import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import { GameProjectResource, type MapData } from '@pixelrpg/engine'
import type { GdkSpriteSheet } from '../../sprite/objects/GdkSpriteSheet'
import { GdkSpriteSetResource } from '../../sprite/resource/GdkSpriteSetResource'
import { BakeCache, buildCacheKey } from './bake-cache.ts'
import { clampViewportCenter, fingerprintMapData } from './map-preview.geometry.ts'

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

/** A finished bake, kept so widget rebuilds don't re-render the map. */
interface BakedPreview {
  texture: Gdk.Texture
  mapWidth: number
  mapHeight: number
}

/** Card-preview viewport: a section of the map at a fixed pixel zoom. */
export interface PreviewViewport {
  /** Viewport centre, in tile coordinates. */
  tileX: number
  /** See {@link tileX}. */
  tileY: number
  /** Native-pixel zoom (3 = one map pixel covers 3 widget pixels). */
  zoom: number
}

/** Cap the FIT-mode bake's longest edge — those are small thumbnails. */
const BAKE_MAX_EDGE = 512

/** Baked textures kept across widget rebuilds (≤512px ≈ ≤1 MB each). */
const BAKE_CACHE_MAX = 48

/**
 * Renders a static thumbnail of a project map by compositing each
 * tile sprite onto a `Gtk.Snapshot`. Used by the welcome view's
 * template cards, the recent-projects list and the atlas scene cards.
 *
 * Why a custom widget instead of an `Engine`: each `Engine` would spin
 * up its own Excalibur runtime + GL context, which is wasteful for
 * tiny static previews. This widget loads the project, decodes the
 * sprite-sheets via the existing `GdkSpriteSetResource` pipeline and
 * rasterises the tiles ONCE into a small texture (the "bake").
 *
 * Two content modes:
 *
 * - **Fit** (welcome/template cards): the whole map scaled into the
 *   widget, longest texture edge capped at {@link BAKE_MAX_EDGE}.
 * - **Viewport** (atlas cards): a section of the map at a uniform
 *   native-pixel zoom, centred on an adjustable focus point — pass a
 *   {@link PreviewViewport} to `setFromResource` and pan live via
 *   {@link panViewportBy}/{@link commitViewport}. While a pan's
 *   re-bake is pending the last bake paints shifted, so the gesture
 *   feels immediate.
 *
 * Rendering strategy (the ported worlds have 100k+ tiles, so the
 * naive paint-every-tile path is too hot for the main loop):
 *
 * - The widget itself never paints individual tiles. Until its bake
 *   is ready it shows the accent colour + the map's own
 *   `backgroundColor`; then it paints the baked texture (O(1)).
 * - Bakes run through a module-wide queue, ONE per main-loop idle at
 *   idle priority — 19 atlas cards become 19 short steps between
 *   frames instead of one multi-second stall.
 * - Draw ops are built per bake from the retained map data (filtered
 *   to the viewport) and dropped right after — no six-figure op
 *   arrays held per card.
 * - Finished bakes land in a small LRU cache keyed by a content
 *   fingerprint of the map (+ viewport), so re-entering the atlas
 *   reuses the textures instead of re-rendering. Live pan bakes skip
 *   the cache; the drag-end commit writes it.
 */
export class MapPreview extends Gtk.Widget {
  private _mapWidth = 0
  private _mapHeight = 0
  private _accentColor: Gdk.RGBA
  /** Map-declared fill behind the tiles (`MapData.backgroundColor`). */
  private _mapBackground: Gdk.RGBA | null = null
  private _loaded = false
  /**
   * Texture matching the CURRENT content + viewport, or `null` while
   * a (re-)bake is queued. Fit mode paints it directly; viewport mode
   * paints {@link _viewportBake} (which stays behind as the shifted
   * stand-in when this is null mid-pan).
   */
  private _baked: Gdk.Texture | null = null
  /** Last completed viewport bake + the centre it was rendered at. */
  private _viewportBake: { texture: Gdk.Texture; center: { x: number; y: number } } | null = null
  /** Retained source for (re-)bakes; ops are derived per bake. */
  private _source: { mapData: MapData; ranges: SheetRange[] } | null = null
  /** Viewport centre in MAP pixels (null = fit-whole-map mode). */
  private _viewport: { centerX: number; centerY: number; zoom: number } | null = null
  /** Whether the next finished bake may be written to the LRU cache. */
  private _cacheWrite = true
  /**
   * Cache-key base for this widget's map (`path:<project>` or
   * `map:<project>:<id>:<fingerprint>`); {@link _cacheKey} appends
   * the current viewport. Null = nothing to cache.
   */
  private _cacheKeyBase: string | null = null

  // ── module-wide bake machinery ────────────────────────────────────
  // LRU (least-recently-STORED) bake cache — the bounded-cache + cache-key
  // logic lives in the GTK-free `bake-cache.ts` so it is unit-tested.
  private static _cache = new BakeCache<BakedPreview>(BAKE_CACHE_MAX)
  private static _queue: MapPreview[] = []
  private static _pumpScheduled = false

  private static _enqueue(preview: MapPreview): void {
    if (!MapPreview._queue.includes(preview)) MapPreview._queue.push(preview)
    MapPreview._pump()
  }

  /** One bake per idle tick so the frame clock breathes between bakes. */
  private static _pump(): void {
    if (MapPreview._pumpScheduled || !MapPreview._queue.length) return
    MapPreview._pumpScheduled = true
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      MapPreview._pumpScheduled = false
      MapPreview._queue.shift()?._runBake()
      MapPreview._pump()
      return GLib.SOURCE_REMOVE
    })
  }

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
   * fetch. A previously baked texture for the same project paints
   * immediately; the load then continues in the background and swaps
   * in a fresh bake (so an edited project heals its thumbnail).
   * Atlas/inspector previews reuse the already-loaded resource via
   * {@link setFromResource}.
   */
  async loadProject(projectPath: string): Promise<void> {
    this._cacheKeyBase = `path:${projectPath}`
    const cached = MapPreview._cache.get(this._cacheKeyBase)
    if (cached) this._showBaked(cached)
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
      this._setSource(firstMap, await this._collectSheets(resource, firstMap.spriteSets ?? []))
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
   * the project's first map is used. With a {@link PreviewViewport}
   * the card shows a zoomed section instead of the whole map. A cache
   * hit (same map content + viewport) paints immediately; viewport
   * previews still collect their sprite sheets so pans can re-bake.
   */
  async setFromResource(
    resource: GameProjectResource,
    mapId?: string,
    viewport: PreviewViewport | null = null,
  ): Promise<void> {
    try {
      const mapData = mapId ? resource.maps.get(mapId)?.mapData : Array.from(resource.maps.values())[0]?.mapData
      if (!mapData) {
        this._loaded = true
        this.queue_draw()
        return
      }
      this._viewport = viewport
        ? {
            centerX: viewport.tileX * mapData.tileWidth,
            centerY: viewport.tileY * mapData.tileHeight,
            zoom: viewport.zoom,
          }
        : null
      this._cacheKeyBase = `map:${resource.path}:${mapData.id}:${fingerprintMapData(mapData)}`
      const cacheKey = this._cacheKey()
      const cached = cacheKey ? MapPreview._cache.get(cacheKey) : undefined
      if (cached) {
        this._showBaked(cached)
        if (this._viewport) {
          this._viewportBake = {
            texture: cached.texture,
            center: { x: this._viewport.centerX, y: this._viewport.centerY },
          }
          // Pans re-bake from source — collect it even on a hit.
          this._source = { mapData, ranges: await this._collectSheets(resource, mapData.spriteSets ?? []) }
          this._readBackground(mapData)
        }
        return
      }
      this._setSource(mapData, await this._collectSheets(resource, mapData.spriteSets ?? []))
    } catch (error) {
      console.warn('[MapPreview] Failed to render preview:', error)
      this._loaded = true
    }
  }

  /**
   * Live viewport pan by a widget-pixel delta (positive = drag right/
   * down → content follows the pointer). Cheap: shifts the last bake
   * immediately and queues a non-cached re-bake.
   */
  panViewportBy(dxWidget: number, dyWidget: number): void {
    if (!this._viewport || !this._source) return
    const { zoom } = this._viewport
    this._viewport.centerX = clampViewportCenter(
      this._viewport.centerX - dxWidget / zoom,
      this._mapWidth,
      this.get_width(),
      zoom,
    )
    this._viewport.centerY = clampViewportCenter(
      this._viewport.centerY - dyWidget / zoom,
      this._mapHeight,
      this.get_height(),
      zoom,
    )
    this._cacheWrite = false
    this._baked = null // stale for the new centre — `_viewportBake` keeps the shifted paint alive
    MapPreview._enqueue(this)
    this.queue_draw()
  }

  /**
   * Finish a pan: re-enable caching and return the viewport centre in
   * tile coordinates for the host to persist (`editorData.preview`).
   */
  commitViewport(): { tileX: number; tileY: number } | null {
    if (!this._viewport || !this._source) return null
    const { mapData } = this._source
    this._cacheWrite = true
    MapPreview._enqueue(this)
    return {
      tileX: this._viewport.centerX / mapData.tileWidth,
      tileY: this._viewport.centerY / mapData.tileHeight,
    }
  }

  /**
   * Change the viewport zoom in place (the atlas's global zoom
   * control). The last bake is dropped too — it would paint at the
   * wrong scale — so the card shows its room colour until the queued
   * re-bake lands.
   */
  setViewportZoom(zoom: number): void {
    if (!this._viewport || !this._source || this._viewport.zoom === zoom) return
    this._viewport.zoom = zoom
    this._viewport.centerX = clampViewportCenter(this._viewport.centerX, this._mapWidth, this.get_width(), zoom)
    this._viewport.centerY = clampViewportCenter(this._viewport.centerY, this._mapHeight, this.get_height(), zoom)
    this._cacheWrite = true
    this._baked = null
    this._viewportBake = null
    MapPreview._enqueue(this)
    this.queue_draw()
  }

  /** Full LRU key for the current content + viewport. */
  private _cacheKey(): string | null {
    return buildCacheKey(this._cacheKeyBase, this._viewport)
  }

  /** Paint a cached bake without rebuilding anything. */
  private _showBaked(baked: BakedPreview): void {
    this._baked = baked.texture
    this._mapWidth = baked.mapWidth
    this._mapHeight = baked.mapHeight
    this._loaded = true
    this.queue_draw()
  }

  private _readBackground(mapData: MapData): void {
    this._mapBackground = null
    if (mapData.backgroundColor) {
      const rgba = new Gdk.RGBA()
      if (rgba.parse(mapData.backgroundColor)) this._mapBackground = rgba
    }
  }

  /** Adopt fresh map content and queue its bake. */
  private _setSource(mapData: MapData, ranges: SheetRange[]): void {
    this._mapWidth = mapData.columns * mapData.tileWidth
    this._mapHeight = mapData.rows * mapData.tileHeight
    this._readBackground(mapData)
    this._source = { mapData, ranges }
    this._loaded = true
    this._baked = null // content changed → re-bake
    this._viewportBake = null
    this._cacheWrite = true
    MapPreview._enqueue(this)
    this.queue_draw()
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    const width = this.get_width()
    const height = this.get_height()
    if (width <= 0 || height <= 0) return

    const background = new Graphene.Rect()
    background.init(0, 0, width, height)
    snapshot.append_color(this._accentColor, background)

    if (!this._loaded || !this._mapWidth || !this._mapHeight) return

    if (this._viewport) {
      this._snapshotViewport(snapshot, width, height)
      return
    }

    const scale = Math.min(width / this._mapWidth, height / this._mapHeight)
    const dw = this._mapWidth * scale
    const dh = this._mapHeight * scale
    const dest = new Graphene.Rect()
    dest.init((width - dw) / 2, (height - dh) / 2, dw, dh)

    if (this._baked) {
      snapshot.append_scaled_texture(this._baked, Gsk.ScalingFilter.NEAREST, dest)
      return
    }

    // Bake not ready: show the map's own room colour as a stand-in.
    // Individual tiles are NEVER painted here — for the big ported
    // worlds that node tree is millions of GI calls. The queued bake
    // repaints us when its texture lands.
    if (this._mapBackground) snapshot.append_color(this._mapBackground, dest)
    if (this._source) MapPreview._enqueue(this)
  }

  /**
   * Viewport mode: the baked texture covers the widget 1:1. While a
   * pan's re-bake is pending, {@link _viewportBake} paints shifted by
   * the centre delta so the drag tracks the pointer immediately.
   */
  private _snapshotViewport(snapshot: Gtk.Snapshot, width: number, height: number): void {
    const viewport = this._viewport
    if (!viewport) return
    if (this._mapBackground) {
      const fill = new Graphene.Rect()
      fill.init(0, 0, width, height)
      snapshot.append_color(this._mapBackground, fill)
    }
    const bake = this._viewportBake
    if (bake) {
      const dest = new Graphene.Rect()
      dest.init(
        (bake.center.x - viewport.centerX) * viewport.zoom,
        (bake.center.y - viewport.centerY) * viewport.zoom,
        bake.texture.get_width(),
        bake.texture.get_height(),
      )
      const clip = new Graphene.Rect()
      clip.init(0, 0, width, height)
      snapshot.push_clip(clip)
      snapshot.append_scaled_texture(bake.texture, Gsk.ScalingFilter.NEAREST, dest)
      snapshot.pop()
    }
    if (!this._baked && this._source) MapPreview._enqueue(this)
  }

  /** Queue callback: rasterise once, publish to the cache, drop the ops. */
  private _runBake(): void {
    if (this._baked || !this._source) return
    let texture: Gdk.Texture | null = null
    try {
      texture = this._viewport ? this._bakeViewportTexture() : this._bakeFitTexture()
    } catch (error) {
      // Disposed widget or renderer hiccup — leave unbaked; a later
      // snapshot re-queues us if the widget is still alive.
      console.warn('[MapPreview] Bake failed:', error)
      return
    }
    if (!texture) return
    this._baked = texture
    if (this._viewport) {
      this._viewportBake = {
        texture,
        center: { x: this._viewport.centerX, y: this._viewport.centerY },
      }
    }
    const cacheKey = this._cacheKey()
    if (cacheKey && this._cacheWrite) {
      MapPreview._cache.set(cacheKey, {
        texture,
        mapWidth: this._mapWidth,
        mapHeight: this._mapHeight,
      })
    }
    this.queue_draw()
  }

  /** Build the per-tile draw ops, optionally clipped to a map-px rect. */
  private _buildOps(clip: { x: number; y: number; w: number; h: number } | null): DrawOp[] {
    const source = this._source
    if (!source) return []
    const { mapData, ranges } = source
    const ops: DrawOp[] = []
    for (const layer of mapData.layers ?? []) {
      if (!layer.visible || !layer.sprites) continue
      for (const tile of layer.sprites) {
        const tx = tile.x * mapData.tileWidth
        const ty = tile.y * mapData.tileHeight
        if (
          clip &&
          (tx + mapData.tileWidth <= clip.x ||
            tx >= clip.x + clip.w ||
            ty + mapData.tileHeight <= clip.y ||
            ty >= clip.y + clip.h)
        ) {
          continue
        }
        const resolved = this._resolveSpriteByLocalId(ranges, tile.spriteSetId, tile.spriteId)
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

  /** Fit mode: whole map, longest texture edge capped. */
  private _bakeFitTexture(): Gdk.Texture | null {
    const renderer = this.get_native()?.get_renderer()
    if (!renderer || !this._mapWidth || !this._mapHeight) return null
    const bakeScale = Math.min(1, BAKE_MAX_EDGE / Math.max(this._mapWidth, this._mapHeight))
    const region = new Graphene.Rect()
    region.init(0, 0, this._mapWidth * bakeScale, this._mapHeight * bakeScale)
    return this._renderOps(renderer, this._buildOps(null), bakeScale, 0, 0, region)
  }

  /** Viewport mode: the visible section at native-pixel zoom. */
  private _bakeViewportTexture(): Gdk.Texture | null {
    const viewport = this._viewport
    const renderer = this.get_native()?.get_renderer()
    const width = this.get_width()
    const height = this.get_height()
    if (!viewport || !renderer || width <= 0 || height <= 0) return null
    // Re-clamp against the now-known widget size (initial centres are
    // set before the first allocation).
    viewport.centerX = clampViewportCenter(viewport.centerX, this._mapWidth, width, viewport.zoom)
    viewport.centerY = clampViewportCenter(viewport.centerY, this._mapHeight, height, viewport.zoom)
    const viewW = width / viewport.zoom
    const viewH = height / viewport.zoom
    // Whole-map-pixel origin: a fractional origin would land every
    // tile's clip edge between device pixels, and the NEAREST-sampled
    // atlas bleeds a hairline of the neighbouring sheet cell through —
    // visible as faint seams across the preview.
    const originX = Math.round(viewport.centerX - viewW / 2)
    const originY = Math.round(viewport.centerY - viewH / 2)
    const region = new Graphene.Rect()
    region.init(0, 0, width, height)
    const ops = this._buildOps({ x: originX, y: originY, w: viewW, h: viewH })
    return this._renderOps(renderer, ops, viewport.zoom, -originX, -originY, region)
  }

  /** Rasterise ops (scaled + translated in map px) into `region`. */
  private _renderOps(
    renderer: Gsk.Renderer,
    ops: DrawOp[],
    scale: number,
    offsetXMapPx: number,
    offsetYMapPx: number,
    region: Graphene.Rect,
  ): Gdk.Texture | null {
    const sub = Gtk.Snapshot.new()
    if (this._mapBackground) {
      const fill = new Graphene.Rect()
      // Background covers the map bounds only (fit mode shows the
      // accent outside them; viewport clamps inside the map anyway).
      fill.init(
        Math.max(0, offsetXMapPx * scale),
        Math.max(0, offsetYMapPx * scale),
        Math.min(region.get_width(), this._mapWidth * scale),
        Math.min(region.get_height(), this._mapHeight * scale),
      )
      sub.append_color(this._mapBackground, fill)
    }
    const target = new Graphene.Rect()
    const translatePoint = new Graphene.Point()
    const fullRect = new Graphene.Rect()
    for (const op of ops) {
      this._paintTile(sub, op, scale, offsetXMapPx, offsetYMapPx, target, translatePoint, fullRect)
    }
    const node = sub.to_node()
    if (!node) return null
    try {
      return renderer.render_texture(node, region)
    } catch (error) {
      console.warn('[MapPreview] Failed to bake preview texture:', error)
      return null
    }
  }

  /**
   * Append one tile to the bake snapshot. The three Graphene temps are
   * caller-owned and reused across the whole loop — allocating them
   * per tile triples the GI overhead of the hottest loop in here.
   */
  private _paintTile(
    snapshot: Gtk.Snapshot,
    op: DrawOp,
    scale: number,
    offsetXMapPx: number,
    offsetYMapPx: number,
    target: Graphene.Rect,
    translatePoint: Graphene.Point,
    fullRect: Graphene.Rect,
  ): void {
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
