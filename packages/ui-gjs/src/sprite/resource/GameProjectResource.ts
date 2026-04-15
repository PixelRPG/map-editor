import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import {
  GameProjectData,
  MapData,
  GameProjectFormat,
} from '@pixelrpg/data-excalibur'
import type { SpriteSetData } from '@pixelrpg/data-excalibur'
import { GameProjectResourceOptions } from '../types/GameProjectResourceOptions'
import { MapResource } from './MapResource'
import { SpriteSetResource } from './SpriteSetResource'
import { loadTextFile } from '../utils'

/**
 * GJS implementation of a game project resource loader
 */
export class GameProjectResource {
  private _data: GameProjectData | null = null
  private _path: string
  private _baseDir: Gio.File
  private _preloadResources: boolean
  private _useGResource: boolean
  private _resourcePrefix: string

  private _maps: Map<string, MapResource> = new Map()
  private _spriteSets: Map<string, SpriteSetResource> = new Map()

  /**
   * Create a new GameProjectResource
   * @param path Path to the game project file
   * @param options Options for loading the game project
   */
  constructor(path: string, options: GameProjectResourceOptions) {
    this._path = path

    if (options.baseDir) {
      if (typeof options.baseDir === 'string') {
        this._baseDir = Gio.File.new_for_path(options.baseDir)
      } else {
        this._baseDir = options.baseDir
      }
    } else {
      // Default to the directory containing the project file
      const projectFile = Gio.File.new_for_path(this._path)
      const parent = projectFile.get_parent()
      this._baseDir = parent || Gio.File.new_for_path(GLib.get_current_dir())
    }

    this._preloadResources = options.preloadResources || false
    this._useGResource = options.useGResource || false
    this._resourcePrefix = options.resourcePrefix || '/org/pixelrpg/game'
  }

  /**
   * Get the loaded game project data
   */
  get data(): GameProjectData {
    if (!this._data) {
      throw new Error('Game project data not loaded')
    }
    return this._data
  }

  /**
   * Load the raw game project data from file
   * @param path Path to the game project file
   * @returns Promise that resolves to the game project data
   */
  protected async loadGameProjectData(path: string): Promise<GameProjectData> {
    try {
      const projectText = await loadTextFile(
        path,
        this._useGResource,
        this._resourcePrefix,
      )
      return GameProjectFormat.deserialize(projectText)
    } catch (error) {
      console.error(`Error parsing game project file: ${error}`)
      throw error
    }
  }

  /**
   * Load the game project data from the file
   * @returns Promise that resolves when the game project is loaded
   */
  async load(): Promise<GameProjectData> {
    if (this._data) {
      return this._data
    }

    try {
      this._data = await this.loadGameProjectData(this._path)

      // Preload resources if requested
      if (this._preloadResources) {
        await this.loadSpriteSets()
        await this.loadMaps()
      }

      return this._data
    } catch (error) {
      console.error(`Error loading game project: ${error}`)
      throw error
    }
  }

  /**
   * Load all sprite sets referenced in the project
   * @returns Promise that resolves when all sprite sets are loaded
   */
  protected async loadSpriteSets(): Promise<void> {
    if (!this._data) {
      throw new Error('Cannot load sprite sets before loading project data')
    }

    if (!this._data.spriteSets || this._data.spriteSets.length === 0) {
      return
    }

    const loadPromises: Promise<SpriteSetData>[] = []

    for (const spriteSetRef of this._data.spriteSets) {
      const spriteSetPath = this.resolvePath(spriteSetRef.path)
      const spriteSetResource = new SpriteSetResource(spriteSetPath)
      this._spriteSets.set(spriteSetRef.id, spriteSetResource)
      loadPromises.push(spriteSetResource.load())
    }

    await Promise.all(loadPromises)
  }

  /**
   * Load all maps referenced in the project
   * @returns Promise that resolves when all maps are loaded
   */
  protected async loadMaps(): Promise<void> {
    if (!this._data) {
      throw new Error('Cannot load maps before loading project data')
    }

    if (!this._data.maps || this._data.maps.length === 0) {
      return
    }

    const loadPromises: Promise<MapData>[] = []

    for (const mapRef of this._data.maps) {
      const mapPath = this.resolvePath(mapRef.path)
      const mapResource = new MapResource(mapPath)
      this._maps.set(mapRef.id, mapResource)
      loadPromises.push(mapResource.load())
    }

    await Promise.all(loadPromises)
  }

  /**
   * Resolve a path relative to the base directory
   * @param path Path to resolve
   * @returns Absolute path
   */
  resolvePath(path: string): string {
    if (path.startsWith('/')) {
      return path
    }

    if (this._useGResource) {
      return `${this._resourcePrefix}/${path}`
    }

    return this._baseDir.get_child(path).get_path() || path
  }

  /**
   * Get a map resource by ID
   * @param id Map ID
   * @returns Map data or null if not found
   */
  async getMap(id: string): Promise<MapData | null> {
    if (!this._data) {
      await this.load()
    }

    // If already loaded, return it
    if (this._maps.has(id)) {
      const resource = this._maps.get(id)!
      if (!resource.data) {
        await resource.load()
      }
      return resource.data
    }

    // Find the map reference
    const mapRef = this._data?.maps?.find((m) => m.id === id)
    if (!mapRef) {
      return null
    }

    // Load the map
    const mapResource = await this.loadMap(id)
    return mapResource.data
  }

  /**
   * Load a specific map by ID
   * @param mapId Map ID to load
   * @returns Promise that resolves to the loaded map resource
   */
  async loadMap(mapId: string): Promise<MapResource> {
    if (this._maps.has(mapId)) {
      return this._maps.get(mapId)!
    }

    if (!this._data) {
      await this.load()
    }

    // Find the map reference
    const mapRef = this._data?.maps?.find((m) => m.id === mapId)
    if (!mapRef) {
      throw new Error(`Map with ID ${mapId} not found in game project`)
    }

    // Load the map
    const mapPath = this.resolvePath(mapRef.path)
    const mapResource = new MapResource(mapPath)
    this._maps.set(mapId, mapResource)
    await mapResource.load()

    return mapResource
  }

  /**
   * Get a sprite set resource instance by ID
   * @param id Sprite set ID
   * @returns Sprite set resource or null if not found
   */
  async getSpriteSet(id: string): Promise<SpriteSetResource | null> {
    if (!this._data) {
      await this.load()
    }

    // If already loaded, return it
    if (this._spriteSets.has(id)) {
      const resource = this._spriteSets.get(id)!
      if (!resource.data) {
        await resource.load()
      }
      return resource
    }

    // Find the sprite set reference
    const spriteSetRef = this._data?.spriteSets?.find((s) => s.id === id)
    if (!spriteSetRef) {
      return null
    }

    // Load the sprite set
    const spriteSetPath = this.resolvePath(spriteSetRef.path)
    const spriteSetResource = new SpriteSetResource(spriteSetPath, {
      useGResource: this._useGResource,
      resourcePrefix: this._resourcePrefix,
    })
    this._spriteSets.set(id, spriteSetResource)

    // Load the resource
    await spriteSetResource.load()
    return spriteSetResource
  }

  /**
   * Get the path to the game project file
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
}
