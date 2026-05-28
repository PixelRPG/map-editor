import type { Loadable } from 'excalibur'
import { Logger, type Scene, type Tile, TileMap, Vector } from 'excalibur'
import { MapEditorComponent, type TileSpriteRef } from '../components/map-editor.component.ts'
import { TIER_Z, TileMapTierComponent } from '../components/tilemap-tier.component.ts'
import { MapFormat } from '../format/MapFormat'
import { collectHiddenLayerIds } from '../services/layer-visibility.ts'
import type { LayerData, LayerTier, MapData, MapResourceOptions, SpriteDataMap, SpriteDataSet } from '../types'
import { loadTextFile } from '../utils'
import { extractDirectoryPath, getFilename, joinPaths } from '../utils/url'
import { SpriteSetResource } from './SpriteSetResource.ts'

/**
 * Derive the effective solidity for a sprite placement, combining
 * placement-level overrides, sprite-set defaults, and the semantic
 * `tileProperties.walkable` flag.
 *
 * Returns:
 *   - `true` — explicit solid (placement or sprite-set says wall, or
 *     `tileProperties.walkable === false`)
 *   - `false` — explicit non-solid (placement.solid === false or
 *     sprite-set def.solid === false explicitly)
 *   - `undefined` — no opinion (leaves the existing tile.solid alone)
 */
function effectiveSolidity(
  placement: SpriteDataMap,
  def: SpriteDataSet | undefined,
): boolean | undefined {
  if (placement.solid !== undefined) return placement.solid
  if (def?.solid !== undefined) return def.solid
  if (def?.tileProperties?.walkable === false) return true
  return undefined
}

/** All tiers a `MapResource` builds tilemaps for. Order is canonical
 * for iteration when order doesn't otherwise matter. */
const ALL_TIERS: readonly LayerTier[] = ['ground', 'hero', 'overlay'] as const

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
  private initialSpritesByTier: Map<LayerTier, Map<Tile, TileSpriteRef[]>> = new Map()

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
    for (const tier of ALL_TIERS) {
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
    sortedLayers.forEach((layer) => this.processTileLayer(layer))
  }

  private processTileLayer(layer: LayerData): void {
    if (!layer.sprites || !Array.isArray(layer.sprites) || layer.sprites.length === 0) {
      return
    }
    const tier: LayerTier = layer.tier ?? 'ground'
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

      // Resolve effective solidity in priority order:
      //   1. Per-placement `spriteData.solid` (explicit override on
      //      a specific tile placement).
      //   2. Per-sprite-set `def.solid` (the "this tile is a wall"
      //      authoring flag — set via TilesTab's Solid switch or
      //      ported from Tiled `<objectgroup>` colliders).
      //   3. Per-sprite-set `def.tileProperties.walkable === false`
      //      (the semantic "you can't walk here" path — carries
      //      richer info like `surface: 'water'` for audio + encounter
      //      systems via `WalkOnTileSystem`).
      // The tile is solid if ANY layer's sprite at this position is
      // solid — first solid encountered wins, otherwise the last
      // explicit non-solid wins. Stacked layers with mixed solidity
      // pick the maximum (solid > non-solid).
      const def = this.spriteSetResources
        .get(spriteData.spriteSetId)
        ?.data?.sprites.find((s) => s.id === spriteData.spriteId)
      const effectiveSolid = effectiveSolidity(spriteData, def)
      if (effectiveSolid === true) {
        tile.solid = true
      } else if (effectiveSolid === false && !tile.solid) {
        tile.solid = false
      }

      const existingRefs = initialSprites.get(tile) || []
      existingRefs.push({
        spriteSetId: spriteData.spriteSetId,
        spriteId: spriteData.spriteId,
        animationId: spriteData.animationId,
        zIndex: spriteData.zIndex !== undefined ? spriteData.zIndex : layerZIndex,
        layerId: layer.id,
      })
      initialSprites.set(tile, existingRefs)
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
      const groundTileMap = this.tileMapsByTier.get('ground')
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

    for (const tier of ALL_TIERS) {
      const tileMap = this.tileMapsByTier.get(tier)
      const initial = this.initialSpritesByTier.get(tier)
      if (!tileMap || !initial) continue
      const editorComponent = new MapEditorComponent()
      editorComponent.setInitialSprites(initial)
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

    for (const initial of this.initialSpritesByTier.values()) {
      initial.forEach((refs, tile) => {
        const sortedRefs = [...refs].sort((a, b) => {
          const aZ = a.zIndex ?? 0
          const bZ = b.zIndex ?? 0
          return aZ - bZ
        })

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
    return this.getTileMapForTier(layer.tier ?? 'ground')
  }

  /** Iterate every tilemap built for this map (one per tier). */
  *tileMaps(): IterableIterator<TileMap> {
    for (const t of this.tileMapsByTier.values()) yield t
  }

  getSpriteSetResource(spriteSetId: string): SpriteSetResource | undefined {
    return this.spriteSetResources.get(spriteSetId)
  }

  /**
   * Re-apply solid state for every tile referencing `(spriteSetId,
   * spriteId)`. Called after the user toggles `solid` on a sprite
   * definition via the Tiles tab so the change takes effect without
   * a full map reload.
   *
   * A tile is solid if ANY layer's sprite at its position is solid
   * (per-placement override > per-sprite-set default). The accumulator
   * walks all layers/sprites at each touched position to re-derive
   * the verdict — same logic as `processTileLayer` but scoped to the
   * affected sprite definition.
   */
  refreshTileSolidsForSprite(spriteSetId: string, spriteId: number): void {
    if (!this._mapData) return
    const touched = new Set<string>()
    for (const layer of this._mapData.layers) {
      const sprites = layer.sprites ?? []
      for (const sprite of sprites) {
        if (sprite.spriteSetId === spriteSetId && sprite.spriteId === spriteId) {
          touched.add(`${sprite.x},${sprite.y}`)
        }
      }
    }
    for (const key of touched) {
      const [xStr, yStr] = key.split(',')
      const x = Number.parseInt(xStr, 10)
      const y = Number.parseInt(yStr, 10)
      this._recomputeTileSolid(x, y)
    }
  }

  /**
   * Walk the full layer stack at `(x, y)` and re-derive `tile.solid`
   * from the topmost solid-flagged sprite. Used by
   * {@link refreshTileSolidsForSprite}; not on the per-frame path.
   */
  private _recomputeTileSolid(x: number, y: number): void {
    let solid = false
    for (const layer of this._mapData.layers) {
      const sprite = layer.sprites?.find((s) => s.x === x && s.y === y)
      if (!sprite) continue
      const def = this.spriteSetResources
        .get(sprite.spriteSetId)
        ?.data?.sprites.find((s) => s.id === sprite.spriteId)
      const effective = effectiveSolidity(sprite, def)
      if (effective === true) {
        solid = true
        break
      }
    }
    for (const tilemap of this.tileMapsByTier.values()) {
      const tile = tilemap.getTile(x, y)
      if (tile) tile.solid = solid
    }
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
