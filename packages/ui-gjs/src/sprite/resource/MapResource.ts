import { MapData, Loadable } from '@pixelrpg/data'
import { MapResourceOptions } from '../types/MapResourceOptions'
import { loadTextFile } from '../utils'
import { MapFormat } from '@pixelrpg/data'
import { SpriteSetResource } from './SpriteSetResource'
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions'
import { extractDirectoryPath } from '@pixelrpg/data'
import { resolveResourcePath } from '../utils/path'

/**
 * GJS implementation of a map resource loader
 * Compatible with Excalibur MapResource interface
 */
export class MapResource implements Loadable<MapData> {
  private _data: MapData | null = null
  private _path: string
  private _useGResource: boolean
  private _resourcePrefix: string | undefined
  private _basePath: string = ''
  private _filename: string = ''

  // Sprite set resources
  private _tileSetResources: Map<string, SpriteSetResource> = new Map()

  /**
   * Create a new MapResource
   * @param path The path to the map file
   */
  constructor(path: string, options?: MapResourceOptions) {
    this._path = path
    this._useGResource = options?.useGResource || false
    this._resourcePrefix = options?.resourcePrefix || undefined

    this._basePath = extractDirectoryPath(path)
    this._filename = path.split('/').pop() || path

    // Debug output for path resolution
    console.debug(`[MapResource] Constructor called with path: ${path}`)
    console.debug(`[MapResource] Extracted basePath: ${this._basePath}`)
  }

  /**
   * Load the map data from the file and associated sprite sets
   * @returns Promise that resolves when the map and sprite sets are loaded
   */
  async load(): Promise<MapData> {
    if (this._data) {
      return this._data
    }

    try {
      // Load the map data
      const mapText = await loadTextFile(
        this._path,
        this._useGResource,
        this._resourcePrefix,
      )
      this._data = MapFormat.deserialize(mapText)

      // Load sprite sets
      await this.loadSpriteSets()

      return this._data
    } catch (error) {
      console.error(`Error parsing map file: ${error}`)
      throw error
    }
  }

  /**
   * Get the loaded map data
   */
  get data(): MapData {
    if (!this._data) {
      throw new Error('Map data not loaded')
    }

    return this._data
  }

  /**
   * Get the path to the map file
   */
  get path(): string {
    return this._path
  }

  /**
   * Check if the resource is loaded
   * @returns True if the resource is loaded
   */
  isLoaded(): boolean {
    return this._data !== null
  }

  /**
   * Load sprite sets referenced in the map
   */
  private async loadSpriteSets(): Promise<void> {
    if (!this._data?.spriteSets) {
      console.warn('[MapResource] No sprite sets found in map data')
      return
    }

    const spriteSetRefs = this._data.spriteSets
    console.debug(`[MapResource] Loading ${spriteSetRefs.length} sprite sets`)

    // Load each sprite set
    for (const spriteSetRef of spriteSetRefs) {
      try {
        console.debug(`[MapResource] Processing sprite set: ${spriteSetRef.id}`)

        // Use the robust path resolver from utils/path.ts
        const fullPath = resolveResourcePath(
          this._basePath,
          spriteSetRef.path,
          '[MapResource]',
        )

        const resource = new SpriteSetResource(fullPath, {
          useGResource: this._useGResource,
          resourcePrefix: this._resourcePrefix,
        })
        await resource.load()

        this._tileSetResources.set(spriteSetRef.id, resource)
        console.debug(`[MapResource] Loaded sprite set: ${spriteSetRef.id}`)
      } catch (error) {
        console.error(
          `[MapResource] Failed to load sprite set ${spriteSetRef.id}: ${error}`,
        )
        throw error
      }
    }

    console.debug(
      `[MapResource] Loaded ${this._tileSetResources.size} sprite sets`,
    )
  }

  /**
   * Get a sprite set resource by ID
   * @param spriteSetId The ID of the sprite set
   */
  getSpriteSetResource(spriteSetId: string): SpriteSetResource | undefined {
    return this._tileSetResources.get(spriteSetId)
  }

  /**
   * Get all sprite set resources
   */
  getAllSpriteSetResources(): Map<string, SpriteSetResource> {
    return this._tileSetResources
  }

  /**
   * Get the map data (compatible with Excalibur interface)
   */
  get mapData(): MapData {
    if (!this._data) {
      throw new Error('Map data not loaded')
    }
    return this._data
  }
}
