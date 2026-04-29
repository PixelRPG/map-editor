import { Scene, TileMap, Vector, Tile, Logger } from 'excalibur'
import type { Loadable } from 'excalibur'
import type { MapData, LayerData } from '../types'
import { MapFormat } from '../format/MapFormat'
import { SpriteSetResource } from './SpriteSetResource.ts'
import { extractDirectoryPath, getFilename, joinPaths } from '../utils/url'
import { loadTextFile } from '../utils'
import type { MapResourceOptions } from '../types'
import {
  MapEditorComponent,
  type TileSpriteRef,
} from '../components/map-editor.component.ts'

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
  private tileSetResources: Map<string, SpriteSetResource> = new Map()
  private readonly _preloadedSpriteSets: Map<string, SpriteSetResource>
  private _mapData!: MapData

  private tileMap!: TileMap
  private initialSprites: Map<Tile, TileSpriteRef[]> = new Map()

  private logger = Logger.getInstance()

  public get mapData(): MapData {
    return this._mapData
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
        this.tileSetResources.set(spriteSetRef.id, preloaded)
        this.logger.debug(
          `Reused pre-loaded sprite set: ${spriteSetRef.id}`,
        )
        continue
      }

      // Otherwise load fresh (standalone MapResource usage)
      try {
        const fullPath = joinPaths(this.basePath, spriteSetRef.path)
        const resource = new SpriteSetResource(fullPath, {
          headless: this.headless,
        })
        await resource.load()

        this.tileSetResources.set(spriteSetRef.id, resource)
        this.logger.debug(
          `Loaded sprite set: ${spriteSetRef.id} from ${fullPath}`,
        )
      } catch (error) {
        this.logger.error(
          `Failed to load sprite set ${spriteSetRef.id}: ${error}`,
        )
        throw error
      }
    }

    this.logger.debug(`Loaded ${this.tileSetResources.size} sprite sets`)
  }

  private createTileMap(data: MapData): TileMap {
    MapFormat.validate(data)

    return new TileMap({
      name: data.name,
      pos: data.pos ? new Vector(data.pos.x, data.pos.y) : undefined,
      tileWidth: data.tileWidth,
      tileHeight: data.tileHeight,
      columns: data.columns,
      rows: data.rows,
      renderFromTopOfGraphic: data.renderFromTopOfGraphic,
    })
  }

  private processLayers(tileMap: TileMap, data: MapData): void {
    const sortedLayers = [...data.layers].sort((a, b) => {
      const zIndexA = Number(a.properties?.['z'] ?? 0)
      const zIndexB = Number(b.properties?.['z'] ?? 0)
      return zIndexA - zIndexB
    })

    const tileLayers = sortedLayers.filter(
      (layer) => layer.type === 'tile' && layer.visible,
    )
    tileLayers.forEach((layer) => this.processTileLayer(tileMap, layer))

    const objectLayers = sortedLayers.filter(
      (layer) => layer.type === 'object' && layer.visible,
    )
    objectLayers.forEach((layer) => this.processObjectLayer(tileMap, layer))
  }

  private processTileLayer(tileMap: TileMap, layer: LayerData): void {
    if (
      !layer.sprites ||
      !Array.isArray(layer.sprites) ||
      layer.sprites.length === 0
    ) {
      this.logger.warn(`Skipping layer ${layer.name}: No sprites found`)
      return
    }

    const layerZIndex =
      layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : 0

    for (const spriteData of layer.sprites) {
      if (
        spriteData.x < 0 ||
        spriteData.x >= tileMap.columns ||
        spriteData.y < 0 ||
        spriteData.y >= tileMap.rows
      ) {
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

      if (spriteData.solid !== undefined) {
        tile.solid = spriteData.solid
      }

      const existingRefs = this.initialSprites.get(tile) || []
      existingRefs.push({
        spriteSetId: spriteData.spriteSetId,
        spriteId: spriteData.spriteId,
        animationId: spriteData.animationId,
        zIndex:
          spriteData.zIndex !== undefined ? spriteData.zIndex : layerZIndex,
        layerId: layer.id,
      })
      this.initialSprites.set(tile, existingRefs)
    }
  }

  private processObjectLayer(tileMap: TileMap, layer: LayerData): void {
    if (
      !layer.objects ||
      !Array.isArray(layer.objects) ||
      layer.objects.length === 0
    ) {
      return
    }

    const layerZIndex =
      layer.properties?.['z'] !== undefined ? Number(layer.properties['z']) : 0

    for (const obj of layer.objects) {
      if (
        obj.type !== 'sprite' ||
        obj.spriteId === undefined ||
        !obj.spriteSetId
      ) {
        continue
      }

      const tileX = Math.floor(obj.x / tileMap.tileWidth)
      const tileY = Math.floor(obj.y / tileMap.tileHeight)

      if (
        tileX < 0 ||
        tileX >= tileMap.columns ||
        tileY < 0 ||
        tileY >= tileMap.rows
      ) {
        continue
      }

      const objData = {
        id: obj.id,
        name: obj.name,
        type: obj.type,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        properties: obj.properties,
        spriteId: obj.spriteId,
        spriteSetId: obj.spriteSetId,
        animationId: obj.animationId,
      }

      const tile = tileMap.getTile(tileX, tileY)
      if (!tile) continue

      tile.data.set('object', objData)

      const existingRefs = this.initialSprites.get(tile) || []
      const zIndex = obj.zIndex !== undefined ? obj.zIndex : layerZIndex
      existingRefs.push({
        spriteSetId: obj.spriteSetId,
        spriteId: obj.spriteId,
        animationId: obj.animationId,
        zIndex,
        layerId: layer.id,
      })
      this.initialSprites.set(tile, existingRefs)
    }
  }

  async load(): Promise<TileMap> {
    try {
      const mapDataPath = joinPaths(this.basePath, this.filename)
      const mapDataText = await loadTextFile(mapDataPath)
      this._mapData = MapFormat.deserialize(mapDataText)

      this.tileMap = this.createTileMap(this._mapData)
      this.data = this.tileMap

      await this.loadSpriteSets()

      this.processLayers(this.tileMap, this._mapData)

      return this.tileMap
    } catch (error) {
      this.logger.error(`Failed to load map: ${error}`)
      throw error
    }
  }

  addToScene(scene: Scene): void {
    if (!this.tileMap) {
      throw new Error('Map resource not loaded')
    }

    const editorComponent = new MapEditorComponent()
    editorComponent.setInitialSprites(this.initialSprites)
    this.tileMap.addComponent(editorComponent)

    this.applyInitialGraphics()

    scene.add(this.tileMap)
  }

  private applyInitialGraphics(): void {
    this.initialSprites.forEach((refs, tile) => {
      const sortedRefs = [...refs].sort((a, b) => {
        const aZ = a.zIndex ?? 0
        const bZ = b.zIndex ?? 0
        return aZ - bZ
      })

      for (const ref of sortedRefs) {
        const spriteSet = this.tileSetResources.get(ref.spriteSetId)
        if (!spriteSet) continue

        if (ref.animationId && spriteSet.animations[ref.animationId]) {
          tile.addGraphic(spriteSet.animations[ref.animationId].clone())
        } else if (spriteSet.sprites[ref.spriteId]) {
          tile.addGraphic(spriteSet.sprites[ref.spriteId].clone())
        }
      }
    })
  }

  getSpriteSetResource(spriteSetId: string): SpriteSetResource | undefined {
    return this.tileSetResources.get(spriteSetId)
  }

  getAllSpriteSetResources(): Map<string, SpriteSetResource> {
    return this.tileSetResources
  }

  getAvailableLayerIds(): string[] {
    return this._mapData.layers
      .filter((layer) => layer.type === 'tile' && layer.visible)
      .map((layer) => layer.id)
  }

  getFirstLayerId(): string | null {
    const layerIds = this.getAvailableLayerIds()
    return layerIds.length > 0 ? layerIds[0] : null
  }

  isLoaded(): boolean {
    return !!this.data
  }
}
