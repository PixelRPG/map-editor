import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import { GameProjectResource, type MapData } from '@pixelrpg/engine'
import { BakeCache, buildCacheKey } from './bake-cache.ts'
import { type BakePlacement, collectSheets, renderOps } from './map-preview.bake.ts'
import { buildDrawOps, type DrawOp, type SheetRange } from './map-preview.ops.ts'
import {
  clampViewportCenter,
  fingerprintMapData,
  fitBakeScale,
  fitDestRect,
  viewportSourceRect,
} from './map-preview.geometry.ts'

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
 * rasterises the tiles ONCE into a small texture (the "bake",
 * assembled by `map-preview.bake.ts`).
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
  // ── module-wide bake machinery ────────────────────────────────────
  // LRU (least-recently-STORED) bake cache — the bounded-cache + cache-key
  // logic lives in the GTK-free `bake-cache.ts` so it is unit-tested.
  private static _cache = new BakeCache<BakedPreview>(BAKE_CACHE_MAX)
  private static _queue: MapPreview[] = []
  private static _pumpScheduled = false

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

  get accentColor(): string {
    return this._accentColor.to_string()
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
      this._setSource(firstMap, await collectSheets(resource, firstMap.spriteSets ?? []))
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
          this._source = { mapData, ranges: await collectSheets(resource, mapData.spriteSets ?? []) }
          this._readBackground(mapData)
        }
        return
      }
      this._setSource(mapData, await collectSheets(resource, mapData.spriteSets ?? []))
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
    const viewport = this._viewport
    if (!viewport || !this._source) return
    this._clampViewport(viewport.centerX - dxWidget / viewport.zoom, viewport.centerY - dyWidget / viewport.zoom)
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
    const viewport = this._viewport
    if (!viewport || !this._source || viewport.zoom === zoom) return
    viewport.zoom = zoom
    this._clampViewport(viewport.centerX, viewport.centerY)
    this._cacheWrite = true
    this._baked = null
    this._viewportBake = null
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

    const fit = fitDestRect(width, height, this._mapWidth, this._mapHeight)
    const dest = new Graphene.Rect()
    dest.init(fit.x, fit.y, fit.w, fit.h)

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

  /** Full LRU key for the current content + viewport. */
  private _cacheKey(): string | null {
    return buildCacheKey(this._cacheKeyBase, this._viewport)
  }

  /** Re-centre the viewport, clamped to the map on both axes. */
  private _clampViewport(centerX: number, centerY: number): void {
    const viewport = this._viewport
    if (!viewport) return
    viewport.centerX = clampViewportCenter(centerX, this._mapWidth, this.get_width(), viewport.zoom)
    viewport.centerY = clampViewportCenter(centerY, this._mapHeight, this.get_height(), viewport.zoom)
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
      MapPreview._cache.set(cacheKey, { texture, mapWidth: this._mapWidth, mapHeight: this._mapHeight })
    }
    this.queue_draw()
  }

  /** Fit mode: whole map, longest texture edge capped. */
  private _bakeFitTexture(): Gdk.Texture | null {
    const renderer = this.get_native()?.get_renderer()
    if (!renderer || !this._source || !this._mapWidth || !this._mapHeight) return null
    const scale = fitBakeScale(this._mapWidth, this._mapHeight, BAKE_MAX_EDGE)
    const region = new Graphene.Rect()
    region.init(0, 0, this._mapWidth * scale, this._mapHeight * scale)
    const ops = buildDrawOps(this._source.mapData, this._source.ranges, null)
    return this._render(renderer, ops, { scale, offsetXMapPx: 0, offsetYMapPx: 0, region })
  }

  /** Viewport mode: the visible section at native-pixel zoom. */
  private _bakeViewportTexture(): Gdk.Texture | null {
    const viewport = this._viewport
    const renderer = this.get_native()?.get_renderer()
    const width = this.get_width()
    const height = this.get_height()
    if (!viewport || !renderer || !this._source || width <= 0 || height <= 0) return null
    // Re-clamp against the now-known widget size (initial centres are
    // set before the first allocation).
    this._clampViewport(viewport.centerX, viewport.centerY)
    const source = viewportSourceRect(viewport.centerX, viewport.centerY, width, height, viewport.zoom)
    const region = new Graphene.Rect()
    region.init(0, 0, width, height)
    const ops = buildDrawOps(this._source.mapData, this._source.ranges, source)
    return this._render(renderer, ops, {
      scale: viewport.zoom,
      offsetXMapPx: -source.x,
      offsetYMapPx: -source.y,
      region,
    })
  }

  private _render(renderer: Gsk.Renderer, ops: DrawOp[], placement: BakePlacement): Gdk.Texture | null {
    return renderOps(renderer, ops, placement, this._mapWidth, this._mapHeight, this._mapBackground)
  }
}

GObject.type_ensure(MapPreview.$gtype)
