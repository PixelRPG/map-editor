import type { Loadable } from 'excalibur'
import { Logger, type Scene, type Tile, TileMap, Vector } from 'excalibur'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { TIER_Z, TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import { MapFormat } from '../format/MapFormat'
import { collectHiddenLayerIds } from '../services/layer-visibility.ts'
import {
  getSpritesAt,
  iterateOccupiedCoords,
  setInitialSprites,
  shadowCoordKey,
} from '../services/map-editor-shadow.service.ts'
import type { LayerData, LayerTier, MapData, MapResourceOptions, SpriteDataMap } from '../types'
import { DEFAULT_LAYER_TIER, LAYER_TIERS } from '../types/data/LayerData.ts'
import { loadTextFile } from '../utils'
import { extractDirectoryPath, getFilename, joinPaths } from '../utils/url'
import { SpriteSetResource } from './SpriteSetResource.ts'

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
   * One `TileMap` per {@link LayerTier} — built up-front in
   * {@link createTileMaps} so callers can always grab the
   * tier-matching tilemap by component lookup, even before any
   * sprites for that tier are loaded. The `data` field (Loadable
   * contract) points at the ground-tier tilemap for backwards
   * compatibility with callers that don't know about tiers.
   */
  private tileMapsByTier: Map<LayerTier, TileMap> = new Map()
  /** Initial per-tier sprite refs, keyed by `"tileX,tileY"` per the shadow-state schema. */
  private initialSpritesByTier: Map<LayerTier, Map<string, TileSpriteRef[]>> = new Map()

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
   * Build one `TileMap` entity per tier — same dimensions across
   * all of them, so a tile at `(x, y)` resolves to congruent tiles
   * on every tilemap. Each gets a {@link TileMapTierComponent}
   * marker + a stable z derived from {@link TIER_Z}.
   *
   * Always builds all three tiers, even when the map only has
   * layers on one. The unused tilemaps cost a few KB of empty
   * tile-grid memory but let `TileEditorSystem` blindly look up
   * the tier-matching tilemap on every click without first
   * checking "does this tier exist".
   */
  private createTileMaps(data: MapData): void {
    MapFormat.validate(data)
    for (const tier of LAYER_TIERS) {
      const tilemap = this.buildSingleTileMap(data, tier)
      tilemap.addComponent(new TileMapTierComponent(tier))
      tilemap.z = TIER_Z[tier]
      this.tileMapsByTier.set(tier, tilemap)
      this.initialSpritesByTier.set(tier, new Map())
    }
  }

  private buildSingleTileMap(data: MapData, tier: LayerTier): TileMap {
    return new TileMap({
      name: `${data.name}:${tier}`,
      pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      columns: data.columns,
      rows: data.rows,
      renderFromTopOfGraphic: data.renderFromTopOfGraphic,
    })
  }

  private processLayers(data: MapData): void {
    const sortedLayers = [...data.layers].sort((a, b) => {
      const zIndexA = Number(a.properties?.z ?? 0)
      const zIndexB = Number(b.properties?.z ?? 0)
      return zIndexA - zIndexB
    })

    // Every layer is a tile layer in the object-system schema. Object
    // placements (NPCs, items, teleports, …) live on
    // `MapData.objectPlacements` and are spawned by the engine's
    // `ObjectSpawnSystem`, not at resource-load time.
    //
    // We process ALL layers (even invisible ones) so the editor's
    // shadow-state (`MapEditorComponent`) holds a complete picture of
    // every layer's content. The visibility filter has moved to the
    // *render* path (`applyInitialGraphics` + `rebuildAllTileGraphics`)
    // so toggling `layer.visible` at runtime is a pure graphics
    // refresh — no re-loading of sprites from the JSON.
    //
    // Tier routing: each layer's sprites are written to the tilemap
    // matching its `tier` (default `'ground'`). A layer's sprite
    // positions remain global tile-coordinates — the same `(x, y)`
    // resolves to congruent tiles on every tier's tilemap.
    for (const layer of sortedLayers) {
      this.processTileLayer(layer)
    }
  }

  private processTileLayer(layer: LayerData): void {
    if (!layer.sprites || !Array.isArray(layer.sprites) || layer.sprites.length === 0) {
      return
    }
    const tier: LayerTier = layer.tier ?? DEFAULT_LAYER_TIER
    const tileMap = this.tileMapsByTier.get(tier)
    const initialSprites = this.initialSpritesByTier.get(tier)
    if (!tileMap || !initialSprites) return

    const layerZIndex = layer.properties?.z !== undefined ? Number(layer.properties.z) : 0

    for (const spriteData of layer.sprites) {
      if (spriteData.x < 0 || spriteData.x >= tileMap.columns || spriteData.y < 0 || spriteData.y >= tileMap.rows) {
        continue
      }

      if (spriteData.spriteId === undefined || !spriteData.spriteSetId) {
        continue
      }

      const tile = tileMap.getTile(spriteData.x, spriteData.y)
      if (!tile) continue

      if (spriteData.properties) {
        Object.entries(spriteData.properties).forEach(([key, value]) => {
          tile.data.set(key, value)
        })
      }

      // A tile becomes solid as soon as any layer's sprite at this
      // position contributes solidity. Sticky — once true on this
      // load pass we don't let later non-solid sprites unset it.
      if (this._isSolidRef(spriteData.spriteSetId, spriteData.spriteId, spriteData.solid)) {
        tile.solid = true
      }

      const key = shadowCoordKey(spriteData.x, spriteData.y)
      const existingRefs = initialSprites.get(key) ?? []
      existingRefs.push({
        spriteSetId: spriteData.spriteSetId,
        spriteId: spriteData.spriteId,
        animationId: spriteData.animationId,
        zIndex: spriteData.zIndex !== undefined ? spriteData.zIndex : layerZIndex,
        layerId: layer.id,
      })
      initialSprites.set(key, existingRefs)
    }
  }

  async load(): Promise<TileMap> {
    try {
      const mapDataPath = joinPaths(this.basePath, this.filename)
      const mapDataText = await loadTextFile(mapDataPath)
      this._mapData = MapFormat.deserialize(mapDataText)

      this.createTileMaps(this._mapData)
      // Loadable<TileMap> contract — point `data` at the ground
      // tilemap. Callers that need a specific tier should walk the
      // scene by `TileMapTierComponent` instead.
      const groundTileMap = this.tileMapsByTier.get(DEFAULT_LAYER_TIER)
      if (!groundTileMap) throw new Error('Failed to build ground tilemap')
      this.data = groundTileMap

      await this.loadSpriteSets()

      this.processLayers(this._mapData)

      return groundTileMap
    } catch (error) {
      this.logger.error(`Failed to load map: ${error}`)
      throw error
    }
  }

  addToScene(scene: Scene): void {
    if (this.tileMapsByTier.size === 0) {
      throw new Error('Map resource not loaded')
    }

    for (const tier of LAYER_TIERS) {
      const tileMap = this.tileMapsByTier.get(tier)
      const initial = this.initialSpritesByTier.get(tier)
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

    for (const [tier, initial] of this.initialSpritesByTier) {
      const tileMap = this.tileMapsByTier.get(tier)
      if (!tileMap) continue
      initial.forEach((refs, key) => {
        const sortedRefs = [...refs].sort((a, b) => {
          const aZ = a.zIndex ?? 0
          const bZ = b.zIndex ?? 0
          return aZ - bZ
        })
        const comma = key.indexOf(',')
        const tileX = Number(key.slice(0, comma))
        const tileY = Number(key.slice(comma + 1))
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
   * Get the `TileMap` entity for a specific tier. Returns
   * `undefined` only when the map hasn't been loaded yet — every
   * loaded map has all three tiers built up-front.
   *
   * Use this when you have a layer (or a `LayerTier`) in hand and
   * need to read / write its tilemap directly. For lookup from
   * within a `Scene` without the `MapResource` in scope, look up
   * by `TileMapTierComponent` instead.
   */
  getTileMapForTier(tier: LayerTier): TileMap | undefined {
    return this.tileMapsByTier.get(tier)
  }

  /**
   * Resolve the tilemap that owns a given layer id by routing
   * through the layer's `tier`. Returns `undefined` if the layer
   * id is unknown.
   */
  getTileMapForLayer(layerId: string): TileMap | undefined {
    const layer = this._mapData?.layers.find((l) => l.id === layerId)
    if (!layer) return undefined
    return this.getTileMapForTier(layer.tier ?? DEFAULT_LAYER_TIER)
  }

  /** Iterate every tilemap built for this map (one per tier). */
  *tileMaps(): IterableIterator<TileMap> {
    for (const t of this.tileMapsByTier.values()) yield t
  }

  getSpriteSetResource(spriteSetId: string): SpriteSetResource | undefined {
    return this.spriteSetResources.get(spriteSetId)
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
  /**
   * Fold the live editor shadow (`MapEditorComponent.sprites`) on
   * every tier's tilemap back into `mapData.layers[].sprites[]`.
   *
   * Paints mutate the shadow only — `mapData.layers` stays at the
   * load-time snapshot until something explicitly syncs it. Callers
   * that need a current view of the map (disk persist, project
   * snapshot for a late-joining peer) MUST call this first.
   *
   * Per-layer sprite arrays are rebuilt deterministically from the
   * shadow (sorted by `(y, x, zIndex)`) so wire bytes are stable
   * across runs of the host and friendly to diff tools when the
   * file lands on disk.
   *
   * Per-placement `properties` + `solid` overrides on
   * `SpriteDataMap` entries are lost during this fold — the shadow
   * tracks only the gameplay-loaded fields (spriteSetId, spriteId,
   * animationId, zIndex, layerId). This matches the pre-existing
   * limitation called out by `_isSolidRef`: live edits already
   * dropped the per-placement `solid` override. Same caveat applies
   * now to the persisted shape.
   *
   * Returns true when at least one layer was updated, false when
   * `mapData` is unloaded (no-op safe to call mid-load).
   */
  syncShadowToMapData(): boolean {
    if (!this._mapData) return false

    const spritesPerLayer = new Map<string, SpriteDataMap[]>()
    for (const tileMap of this.tileMapsByTier.values()) {
      const editor = tileMap.get(MapEditorComponent)
      if (!editor) continue
      for (const [key, refs] of Object.entries(editor.sprites)) {
        const comma = key.indexOf(',')
        const tileX = Number(key.slice(0, comma))
        const tileY = Number(key.slice(comma + 1))
        for (const ref of refs) {
          const list = spritesPerLayer.get(ref.layerId) ?? []
          const entry: SpriteDataMap = {
            x: tileX,
            y: tileY,
            spriteSetId: ref.spriteSetId,
            spriteId: ref.spriteId,
          }
          if (ref.animationId !== undefined) entry.animationId = ref.animationId
          if (ref.zIndex !== undefined) entry.zIndex = ref.zIndex
          list.push(entry)
          spritesPerLayer.set(ref.layerId, list)
        }
      }
    }

    for (const layer of this._mapData.layers) {
      const sprites = spritesPerLayer.get(layer.id) ?? []
      sprites.sort((a, b) => a.y - b.y || a.x - b.x || (a.zIndex ?? 0) - (b.zIndex ?? 0))
      layer.sprites = sprites
    }
    return true
  }

  refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    for (const tilemap of this.tileMapsByTier.values()) {
      const editor = tilemap.get(MapEditorComponent)
      if (!editor) continue
      for (const { tileX, tileY } of iterateOccupiedCoords(editor)) {
        const refs = getSpritesAt(editor, tileX, tileY)
        if (refs.some((r) => r.spriteSetId === spriteSetId && r.spriteId === spriteId)) {
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
   * solidity per {@link _isSolidRef}.
   */
  refreshTileSolidFromEditor(tilemap: TileMap, tile: Tile): void {
    const editor = tilemap.get(MapEditorComponent)
    if (!editor) return
    const refs = getSpritesAt(editor, tile.x, tile.y)
    tile.solid = refs.some((r) => this._isSolidRef(r.spriteSetId, r.spriteId))
  }

  /**
   * Resolve whether a single sprite reference makes a tile solid.
   *
   * Priority:
   *   1. `placementSolid` — explicit per-placement override (only the
   *      load-time path carries this; live edits via
   *      `MapEditorComponent` lose the field — pre-existing
   *      limitation, no UI for placement-level overrides yet).
   *   2. `def.solid` — sprite-set wall flag (TilesTab Solid switch
   *      + Tiled `<objectgroup>` porter).
   *   3. `def.tileProperties.walkable === false` — semantic
   *      "can't walk here" path that carries surface metadata.
   *
   * Returns `false` when none of the above declare solidity — the
   * tile stays whatever it was. Caller can union across stacked
   * refs to get "any sprite blocks" semantics.
   */
  private _isSolidRef(spriteSetId: string, spriteId: number, placementSolid?: boolean): boolean {
    if (placementSolid !== undefined) return placementSolid
    const def = this.spriteSetResources.get(spriteSetId)?.data?.sprites.find((s) => s.id === spriteId)
    if (def?.solid === true) return true
    if (def?.solid === false) return false
    return def?.tileProperties?.walkable === false
  }

  getAllSpriteSetResources(): Map<string, SpriteSetResource> {
    return this.spriteSetResources
  }

  getAvailableLayerIds(): string[] {
    return this._mapData.layers.filter((layer) => layer.visible).map((layer) => layer.id)
  }

  getFirstLayerId(): string | null {
    const layerIds = this.getAvailableLayerIds()
    return layerIds.length > 0 ? layerIds[0] : null
  }

  isLoaded(): boolean {
    return !!this.data
  }
}
