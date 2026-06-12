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

/** A finished bake, kept so widget rebuilds don't re-render the map. */
interface BakedPreview {
  texture: Gdk.Texture
  mapWidth: number
  mapHeight: number
}

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
 * Rendering strategy (the ported worlds have 100k+ tiles, so the
 * naive paint-every-tile path is too hot for the main loop):
 *
 * - The widget itself never paints individual tiles. Until its bake
 *   is ready it shows the accent colour + the map's own
 *   `backgroundColor`; then it paints the baked texture (O(1)).
 * - Bakes run through a module-wide queue, ONE per main-loop idle at
 *   idle priority — 19 atlas cards become 19 short steps between
 *   frames instead of one multi-second stall.
 * - Finished bakes land in a small LRU cache keyed by a content
 *   fingerprint of the map, so re-entering the atlas (which rebuilds
 *   the cards) reuses the textures instead of re-rendering. The
 *   welcome view's per-path lookups serve the cached texture
 *   instantly and then refresh it in the background.
 */
/** Cap the baked preview texture's longest edge — these are small thumbnails. */
const BAKE_MAX_EDGE = 512

/** Baked textures kept across widget rebuilds (≤512px ≈ ≤1 MB each). */
const BAKE_CACHE_MAX = 48

export class MapPreview extends Gtk.Widget {
  private _ops: DrawOp[] = []
  private _mapWidth = 0
  private _mapHeight = 0
  private _accentColor: Gdk.RGBA
  /** Map-declared fill behind the tiles (`MapData.backgroundColor`). */
  private _mapBackground: Gdk.RGBA | null = null
  private _loaded = false
  private _baked: Gdk.Texture | null = null
  /** Cache slot for this widget's current map (see `_cacheStore`). */
  private _cacheKey: string | null = null

  // ── module-wide bake machinery ────────────────────────────────────
  private static _cache = new Map<string, BakedPreview>()
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

  private static _cacheStore(key: string, baked: BakedPreview): void {
    // Refresh insertion order so eviction is least-recently-stored.
    MapPreview._cache.delete(key)
    MapPreview._cache.set(key, baked)
    if (MapPreview._cache.size > BAKE_CACHE_MAX) {
      const oldest = MapPreview._cache.keys().next().value
      if (oldest !== undefined) MapPreview._cache.delete(oldest)
    }
  }

  /**
   * Cheap content stamp for cache keys: tile edits change the sum, so
   * a re-entered atlas re-bakes exactly the maps that changed. Not
   * cryptographic — a collision merely shows a stale thumbnail.
   */
  private static _fingerprint(mapData: MapData): number {
    let hash = ((mapData.columns * 73856093) ^ (mapData.rows * 19349663)) | 0
    for (const layer of mapData.layers ?? []) {
      if (!layer.visible || !layer.sprites) continue
      hash = (hash * 31 + layer.sprites.length) | 0
      for (const tile of layer.sprites) {
        hash = (hash + tile.x * 31 + tile.y * 131 + tile.spriteId * 7) | 0
      }
    }
    const background = mapData.backgroundColor ?? ''
    for (let i = 0; i < background.length; i++) hash = (hash * 33 + background.charCodeAt(i)) | 0
    return hash >>> 0
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
    const pathKey = `path:${projectPath}`
    const cached = MapPreview._cache.get(pathKey)
    if (cached) this._showBaked(pathKey, cached)
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
      await this._populateFromMap(firstMap, await this._collectSheets(resource, firstMap.spriteSets ?? []), pathKey)
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
   * the project's first map is used. A cache hit (same map content)
   * skips sprite-sheet collection and the bake entirely.
   */
  async setFromResource(resource: GameProjectResource, mapId?: string): Promise<void> {
    try {
      const mapData = mapId ? resource.maps.get(mapId)?.mapData : Array.from(resource.maps.values())[0]?.mapData
      if (!mapData) {
        this._loaded = true
        this.queue_draw()
        return
      }
      const cacheKey = `map:${resource.path}:${mapData.id}:${MapPreview._fingerprint(mapData)}`
      const cached = MapPreview._cache.get(cacheKey)
      if (cached) {
        this._showBaked(cacheKey, cached)
        return
      }
      await this._populateFromMap(mapData, await this._collectSheets(resource, mapData.spriteSets ?? []), cacheKey)
    } catch (error) {
      console.warn('[MapPreview] Failed to render preview:', error)
      this._loaded = true
    }
  }

  private _showBaked(cacheKey: string, baked: BakedPreview): void {
    this._cacheKey = cacheKey
    this._baked = baked.texture
    this._mapWidth = baked.mapWidth
    this._mapHeight = baked.mapHeight
    this._ops = []
    this._loaded = true
    this.queue_draw()
  }

  private async _populateFromMap(mapData: MapData, ranges: SheetRange[], cacheKey: string | null): Promise<void> {
    this._mapWidth = mapData.columns * mapData.tileWidth
    this._mapHeight = mapData.rows * mapData.tileHeight
    this._cacheKey = cacheKey

    this._mapBackground = null
    if (mapData.backgroundColor) {
      const rgba = new Gdk.RGBA()
      if (rgba.parse(mapData.backgroundColor)) this._mapBackground = rgba
    }

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
    this._baked = null // tiles changed → re-bake
    if (ops.length) MapPreview._enqueue(this)
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
    if (this._ops.length) MapPreview._enqueue(this)
  }

  /** Queue callback: rasterise once, publish to the cache, drop the ops. */
  private _runBake(): void {
    if (this._baked || !this._ops.length) return
    try {
      this._baked = this._bakeTexture()
    } catch (error) {
      // Disposed widget or renderer hiccup — leave unbaked; a later
      // snapshot re-queues us if the widget is still alive.
      console.warn('[MapPreview] Bake failed:', error)
      return
    }
    if (!this._baked) return
    if (this._cacheKey) {
      MapPreview._cacheStore(this._cacheKey, {
        texture: this._baked,
        mapWidth: this._mapWidth,
        mapHeight: this._mapHeight,
      })
    }
    // The op list (one entry per tile — six figures for the ported
    // worlds) is dead weight once the texture exists.
    this._ops = []
    this.queue_draw()
  }

  private _bakeTexture(): Gdk.Texture | null {
    const renderer = this.get_native()?.get_renderer()
    if (!renderer || !this._mapWidth || !this._mapHeight) return null
    // Bake at native map resolution, capped so a large map stays a small
    // thumbnail texture (it's only ever shown card-sized).
    const bakeScale = Math.min(1, BAKE_MAX_EDGE / Math.max(this._mapWidth, this._mapHeight))
    const sub = Gtk.Snapshot.new()
    const region = new Graphene.Rect()
    region.init(0, 0, this._mapWidth * bakeScale, this._mapHeight * bakeScale)
    if (this._mapBackground) sub.append_color(this._mapBackground, region)
    const target = new Graphene.Rect()
    const translatePoint = new Graphene.Point()
    const fullRect = new Graphene.Rect()
    for (const op of this._ops) this._paintTile(sub, op, bakeScale, target, translatePoint, fullRect)
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
    target: Graphene.Rect,
    translatePoint: Graphene.Point,
    fullRect: Graphene.Rect,
  ): void {
    target.init(op.tx * scale, op.ty * scale, op.tw * scale, op.th * scale)
    snapshot.push_clip(target)
    snapshot.save()

    // The texture is the full atlas. Translate so the wanted sub-region
    // lines up with `target`, then paint the whole atlas at the same
    // scale. Push_clip keeps the rest invisible.
    const textureScale = (op.tw * scale) / op.sw
    translatePoint.init(op.tx * scale - op.sx * textureScale, op.ty * scale - op.sy * textureScale)
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
