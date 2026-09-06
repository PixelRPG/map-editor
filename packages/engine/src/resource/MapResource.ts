import type { Loadable } from 'excalibur'
import { Logger, type Scene, type Tile, type TileMap } from 'excalibur'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { MapFormat } from '../format/MapFormat'
import { layerOrderIndex, sortRefsByLayerOrder } from '../services/layer-order.ts'
import { collectHiddenLayerIds, isLayerDataVisible } from '../services/layer-visibility.ts'
import {
  getSpritesAt,
  iterateOccupiedCoords,
  parseShadowCoordKey,
  setInitialSprites,
} from '../services/map-editor-shadow.service.ts'
import type { LayerPlane, MapData, MapResourceOptions } from '../types'
import { DEFAULT_LAYER_PLANE, LAYER_PLANES } from '../types/data/LayerData.ts'
import { loadTextFile } from '../utils'
import { extractDirectoryPath, getFilename, joinPaths } from '../utils/url'
import { foldShadowToLayerSprites } from './shadow-fold.ts'
import { isSpriteRefSolid } from './sprite-solidity.ts'
import { SpriteSetResource } from './SpriteSetResource.ts'
import { buildPlaneTileMaps, collectInitialSprites } from './tilemap-builder.ts'

/**
 * Resource class for loading custom Map format into Excalibur.
 *
 * Loads the map JSON and its referenced sprite sets, builds an Excalibur
 * {@link TileMap} from the data, applies initial sprites to tiles, and hands
 * the per-tile sprite refs over to {@link MapEditorComponent} on
 * `addToScene` — the component owns the live editor state from that point on.
 * Editor reads/writes that mutate per-tile sprites go through the component,
 * not the resource.
 */
export class MapResource implements Loadable<TileMap> {
  data!: TileMap
  private readonly headless: boolean = false
  private readonly basePath: string = ''
  private readonly filename: string = ''
  private spriteSetResources: Map<string, SpriteSetResource> = new Map()
  private readonly _preloadedSpriteSets: Map<string, SpriteSetResource>
  private _mapData!: MapData

  /**
   * One `TileMap` per {@link LayerPlane} — built up-front in
   * {@link buildPlaneTileMaps} so callers can always grab the
   * plane-matching tilemap by component lookup, even before any
   * sprites for that plane are loaded. The `data` field (Loadable
   * contract) points at the ground-plane tilemap for backwards
   * compatibility with callers that don't know about planes.
   */
  private tileMapsByPlane: Map<LayerPlane, TileMap> = new Map()
  /** Initial per-plane sprite refs, keyed by `"tileX,tileY"` per the shadow-state schema. */
  private initialSpritesByPlane: Map<LayerPlane, Map<string, TileSpriteRef[]>> = new Map()

  private logger = Logger.getInstance()

  public get mapData(): MapData {
    return this._mapData
  }

  /** Absolute filesystem path to the source JSON. Useful for editors
   * that want to persist `editorData` changes back to disk. */
  public get sourcePath(): string {
    return joinPaths(this.basePath, this.filename)
  }

  constructor(path: string, options?: MapResourceOptions) {
    this.headless = options?.headless ?? this.headless
    this.basePath = extractDirectoryPath(path)
    this.filename = getFilename(path)
    this._preloadedSpriteSets = options?.preloadedSpriteSets ?? new Map()
    this.logger.debug(`MapResource created with path: ${path}`)
  }

  private async loadSpriteSets(): Promise<void> {
    const spriteSetRefs = this._mapData.spriteSets || []

    if (spriteSetRefs.length === 0) {
      this.logger.warn('No sprite sets found in map data')
      return
    }

    for (const spriteSetRef of spriteSetRefs) {
      // Reuse pre-loaded resource if available (typically from GameProjectResource)
      const preloaded = this._preloadedSpriteSets.get(spriteSetRef.id)
      if (preloaded) {
        this.spriteSetResources.set(spriteSetRef.id, preloaded)
        this.logger.debug(`Reused pre-loaded sprite set: ${spriteSetRef.id}`)
        continue
      }

      // Otherwise load fresh (standalone MapResource usage)
      try {
        const fullPath = joinPaths(this.basePath, spriteSetRef.path)
        const resource = new SpriteSetResource(fullPath, {
          headless: this.headless,
        })
        await resource.load()

        this.spriteSetResources.set(spriteSetRef.id, resource)
        this.logger.debug(`Loaded sprite set: ${spriteSetRef.id} from ${fullPath}`)
      } catch (error) {
        this.logger.error(`Failed to load sprite set ${spriteSetRef.id}: ${error}`)
        throw error
      }
    }

    this.logger.debug(`Loaded ${this.spriteSetResources.size} sprite sets`)
  }

  /**
   * Parse the map JSON + resolve its sprite sets. The Excalibur
   * `TileMap`s (one `Tile` object per cell per plane — six figures for
   * the big ported worlds) are NOT built here: projects preload every
   * map for the atlas/previews/snapshots, which only read `mapData`.
   * {@link ensureTileMaps} builds them on first scene use.
   *
   * `Loadable` consumers gate on {@link isLoaded}; the returned
   * `TileMap` is only meaningful once the tilemaps exist.
   */
  async load(): Promise<TileMap> {
    try {
      const mapDataPath = joinPaths(this.basePath, this.filename)
      const mapDataText = await loadTextFile(mapDataPath)
      this._mapData = MapFormat.deserialize(mapDataText)
      MapFormat.validate(this._mapData)

      await this.loadSpriteSets()

      return this.data
    } catch (error) {
      this.logger.error(`Failed to load map: ${error}`)
      throw error
    }
  }

  /**
   * Build the per-plane `TileMap`s + the editor shadow state from the
   * loaded map data. Idempotent — the first scene to use this map
   * pays the (large) tile-allocation cost, later calls are no-ops.
   */
  ensureTileMaps(): void {
    if (this.tileMapsByPlane.size > 0) return
    if (!this._mapData) throw new Error('Map resource not loaded')

    this.tileMapsByPlane = buildPlaneTileMaps(this._mapData)
    // Loadable<TileMap> contract — point `data` at the ground
    // tilemap. Callers that need a specific plane should walk the
    // scene by `TileMapPlaneComponent` instead.
    const groundTileMap = this.tileMapsByPlane.get(DEFAULT_LAYER_PLANE)
    if (!groundTileMap) throw new Error('Failed to build ground tilemap')
    this.data = groundTileMap

    this.initialSpritesByPlane = collectInitialSprites(this._mapData, this.tileMapsByPlane, (setId, spriteId, solid) =>
      this.isSolidRef(setId, spriteId, solid),
    )
  }

  addToScene(scene: Scene): void {
    this.ensureTileMaps()

    for (const plane of LAYER_PLANES) {
      const tileMap = this.tileMapsByPlane.get(plane)
      const initial = this.initialSpritesByPlane.get(plane)
      if (!tileMap || !initial) continue
      const editorComponent = new MapEditorComponent()
      setInitialSprites(editorComponent, initial)
      tileMap.addComponent(editorComponent)
      scene.add(tileMap)
    }

    this.applyInitialGraphics()
  }

  private applyInitialGraphics(): void {
    // Hot loop on first render — collect once, branch in the inner
    // loop. Shared with `rebuildAllTileGraphics` so the two paths
    // can't disagree on what "hidden" means.
    const hiddenLayerIds = collectHiddenLayerIds(this)
    // The same draw-order rule `rebuildAllTileGraphics` applies on every
    // later paint, so the first frame and the thousandth agree.
    const layerOrder = layerOrderIndex(this._mapData.layers)

    for (const [plane, initial] of this.initialSpritesByPlane) {
      const tileMap = this.tileMapsByPlane.get(plane)
      if (!tileMap) continue
      initial.forEach((refs, key) => {
        const sortedRefs = sortRefsByLayerOrder(refs, layerOrder)
        const { tileX, tileY } = parseShadowCoordKey(key)
        const tile = tileMap.getTile(tileX, tileY)
        if (!tile) return

        for (const ref of sortedRefs) {
          if (hiddenLayerIds.has(ref.layerId)) continue
          const spriteSet = this.spriteSetResources.get(ref.spriteSetId)
          if (!spriteSet) continue

          if (ref.animationId && spriteSet.animations[ref.animationId]) {
            tile.addGraphic(spriteSet.animations[ref.animationId].clone())
          } else if (spriteSet.sprites[ref.spriteId]) {
            tile.addGraphic(spriteSet.sprites[ref.spriteId].clone())
          }
        }
      })
    }
  }

  /**
   * Get the `TileMap` entity for a specific plane. Returns
   * `undefined` only when the map hasn't been loaded yet — every
   * loaded map has all three planes built up-front.
   *
   * Use this when you have a layer (or a `LayerPlane`) in hand and
   * need to read / write its tilemap directly. For lookup from
   * within a `Scene` without the `MapResource` in scope, look up
   * by `TileMapPlaneComponent` instead.
   */
  getTileMapForPlane(plane: LayerPlane): TileMap | undefined {
    return this.tileMapsByPlane.get(plane)
  }

  /**
   * Resolve the tilemap that owns a given layer id by routing
   * through the layer's `plane`. Returns `undefined` if the layer
   * id is unknown.
   */
  getTileMapForLayer(layerId: string): TileMap | undefined {
    const layer = this._mapData?.layers.find((l) => l.id === layerId)
    if (!layer) return undefined
    return this.getTileMapForPlane(layer.plane ?? DEFAULT_LAYER_PLANE)
  }

  /** Iterate every tilemap built for this map (one per plane). */
  *tileMaps(): IterableIterator<TileMap> {
    for (const t of this.tileMapsByPlane.values()) yield t
  }

  /**
   * Look up a sprite-set resource by id: the map's own referenced sets
   * first, then the pre-loaded project-level sets. The fallback makes
   * project-only sets resolvable through the map — character appearance
   * sheets (e.g. the scientist) live on the project but are not
   * referenced by any map JSON, yet placed Cast NPCs must render their
   * sprite on this map (`entity/visual-graphic.ts`).
   */
  getSpriteSetResource(spriteSetId: string): SpriteSetResource | undefined {
    return this.spriteSetResources.get(spriteSetId) ?? this._preloadedSpriteSets.get(spriteSetId)
  }

  /**
   * Fold the live editor shadow (`MapEditorComponent.sprites`) on
   * every plane's tilemap back into `mapData.layers[].sprites[]`.
   *
   * Paints mutate the shadow only — `mapData.layers` stays at the
   * load-time snapshot until something explicitly syncs it. Callers
   * that need a current view of the map (disk persist, project
   * snapshot for a late-joining peer) MUST call this first.
   *
   * Per-layer sprite arrays are rebuilt deterministically from the
   * shadow (sorted by `(y, x)`) so wire bytes are stable
   * across runs of the host and friendly to diff tools when the
   * file lands on disk.
   *
   * Per-placement `properties` + `solid` overrides on
   * `SpriteDataMap` entries are lost during this fold — the shadow
   * tracks only the gameplay-loaded fields (spriteSetId, spriteId,
   * animationId, layerId). This matches the pre-existing
   * limitation called out by `isSolidRef`: live edits already
   * dropped the per-placement `solid` override. Same caveat applies
   * now to the persisted shape.
   *
   * Returns true when at least one layer was updated, false when
   * `mapData` is unloaded (no-op safe to call mid-load).
   */
  syncShadowToMapData(): boolean {
    if (!this._mapData) return false
    // No plane tilemaps = this map was loaded (e.g. for a snapshot) but
    // never opened in a scene, so there's no editor shadow to fold in.
    // Bail out — otherwise the write-back loop below would overwrite the
    // loaded on-disk sprites with an empty shadow (data loss).
    if (this.tileMapsByPlane.size === 0) return false

    const shadows = [...this.tileMapsByPlane.values()]
      .map((tileMap) => tileMap.get(MapEditorComponent)?.sprites)
      .filter((sprites) => sprites !== undefined)
    const spritesPerLayer = foldShadowToLayerSprites(shadows)
    for (const layer of this._mapData.layers) {
      layer.sprites = spritesPerLayer.get(layer.id) ?? []
    }
    return true
  }

  /**
   * Re-apply `tile.solid` for every tile currently displaying a
   * sprite with id `(spriteSetId, spriteId)`. Called when the user
   * toggles `solid` on a sprite definition from the Tiles view so
   * every placement of that sprite flips collision immediately.
   *
   * Walks the live editor shadow (`MapEditorComponent`) on every
   * tilemap rather than `mapData.layers[].sprites[]` — paint/erase
   * during playtest only mutates the shadow; mapData stays stale
   * until save. Anchoring on the shadow keeps Tiles-tab toggles and
   * runtime paints consistent.
   */
  refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    this.refreshTileSolidsWhere((r) => r.spriteSetId === spriteSetId && r.spriteId === spriteId)
  }

  /**
   * Re-apply `tile.solid` for every placement of ANY sprite of the
   * given set. Used when a peer's sprite-set descriptor update arrives
   * over collab — the wire payload carries the whole descriptor, not
   * which sprite's flags changed, so the whole set's placements are
   * recomputed (same single pass over occupied coords as the
   * per-sprite variant).
   */
  refreshTileSolidsForSpriteSet(spriteSetId: string): void {
    this.refreshTileSolidsWhere((r) => r.spriteSetId === spriteSetId)
  }

  /** Recompute `tile.solid` for every tile holding a sprite ref matching `matches`. */
  private refreshTileSolidsWhere(matches: (ref: TileSpriteRef) => boolean): void {
    for (const tilemap of this.tileMapsByPlane.values()) {
      const editor = tilemap.get(MapEditorComponent)
      if (!editor) continue
      for (const { tileX, tileY } of iterateOccupiedCoords(editor)) {
        const refs = getSpritesAt(editor, tileX, tileY)
        if (refs.some(matches)) {
          const tile = tilemap.getTile(tileX, tileY)
          if (tile) this.refreshTileSolidFromEditor(tilemap, tile)
        }
      }
    }
  }

  /**
   * Recompute `tile.solid` on `tilemap`'s tile from the live editor
   * shadow state. Called by `layer.manager.ts` after every paint /
   * erase so collision tracks edits in real time. A tile is solid
   * iff at least one sprite currently placed on it contributes
   * solidity per {@link isSolidRef}.
   */
  refreshTileSolidFromEditor(tilemap: TileMap, tile: Tile): void {
    const editor = tilemap.get(MapEditorComponent)
    if (!editor) return
    const refs = getSpritesAt(editor, tile.x, tile.y)
    tile.solid = refs.some((r) => this.isSolidRef(r.spriteSetId, r.spriteId))
  }

  /**
   * Whether a sprite reference makes its tile solid, resolved against
   * this map's loaded sprite-set definitions. The precedence rules are
   * the pure {@link isSpriteRefSolid}; this only owns the lookup.
   */
  private isSolidRef(spriteSetId: string, spriteId: number, placementSolid?: boolean): boolean {
    const definition = this.spriteSetResources.get(spriteSetId)?.data?.sprites.find((s) => s.id === spriteId)
    return isSpriteRefSolid(definition, placementSolid)
  }

  getAllSpriteSetResources(): Map<string, SpriteSetResource> {
    return this.spriteSetResources
  }

  /**
   * Ids of the currently-visible layers (for layer-list / picker UI).
   *
   * Visibility is decided by the SHARED predicate, not a truthiness
   * test: this used to filter `layer.visible` truthily, so a layer whose
   * descriptor carried no `visible` key rendered on screen and could be
   * toggled via `Engine.setLayerVisible` but never appeared in the
   * picker. See `services/layer-visibility.ts`.
   */
  getAvailableLayerIds(): string[] {
    return this._mapData.layers.filter((layer) => isLayerDataVisible(layer)).map((layer) => layer.id)
  }

  /**
   * The first layer that can accept paint — the editor's fallback target
   * when no active layer is set (pencil/object preview, TileEditorSystem).
   *
   * Deliberately NOT filtered by visibility: a hidden first layer must
   * still be the fallback target (matching its on-disk order). Filtering
   * by `visible` here meant hiding the first layer silently redirected
   * paint to a different visible layer — or, with every layer hidden,
   * returned null so paint landed nowhere.
   */
  getFirstLayerId(): string | null {
    const first = this._mapData.layers[0]
    return first ? first.id : null
  }

  isLoaded(): boolean {
    // Loaded = map data parsed. The TileMaps build lazily on first
    // scene use (`ensureTileMaps`) — `data` stays unset until then.
    return !!this._mapData
  }
}
