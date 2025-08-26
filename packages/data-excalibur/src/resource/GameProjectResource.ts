import { Logger, Scene } from 'excalibur'
import {
  GameProjectData,
  GameProjectFormat,
  Loadable,
  extractDirectoryPath,
  getFilename,
  joinPaths,
} from '@pixelrpg/data-core'
import { MapResource } from './MapResource'
import { SpriteSetResource } from './SpriteSetResource'
import { loadTextFile } from '../utils'
import type { GameProjectResourceOptions } from '../types'

/**
 * Resource class for loading a complete game project into Excalibur
 */
export class GameProjectResource implements Loadable<GameProjectData> {
  /**
   * The loaded game project data
   */
  data!: GameProjectData

  /**
   * Configuration options
   */
  private readonly headless: boolean = false
  private readonly baseDir: string = ''
  private readonly filename: string = ''
  private readonly preloadAllMaps: boolean = false
  private readonly preloadAllSpriteSets: boolean = true
  private readonly customInitialMapId?: string

  /**
   * Store of all maps and sprite sets
   */
  private mapResources: Map<string, MapResource> = new Map()
  private spriteSetResources: Map<string, SpriteSetResource> = new Map()
  private gameProjectData!: GameProjectData

  /**
   * Flag to indicate if the resource is loaded
   */
  private _isLoaded: boolean = false

  /**
   * Logger for debugging
   */
  private logger = Logger.getInstance()

  /**
   * Get all loaded maps
   */
  public get maps(): Map<string, MapResource> {
    return this.mapResources
  }

  /**
   * Get all loaded sprite sets
   */
  public get spriteSets(): Map<string, SpriteSetResource> {
    return this.spriteSetResources
  }

  /**
   * Get a map by ID
   */
  public getMap(id: string): MapResource | undefined {
    return this.mapResources.get(id)
  }

  /**
   * Get a sprite set by ID
   */
  public getSpriteSet(id: string): SpriteSetResource | undefined {
    return this.spriteSetResources.get(id)
  }

  constructor(path: string, options?: GameProjectResourceOptions) {
    this.headless = options?.headless ?? this.headless
    this.baseDir = options?.baseDir ?? extractDirectoryPath(path)
    this.filename = getFilename(path)
    this.preloadAllMaps = options?.preloadAllMaps ?? this.preloadAllMaps
    this.preloadAllSpriteSets =
      options?.preloadAllSpriteSets ?? this.preloadAllSpriteSets
    this.customInitialMapId = options?.initialMapId

    this.logger.debug(`GameProjectResource created with path: ${path}`)
  }

  /**
   * Loads the game project data from JSON
   */
  private async loadGameProjectData(path: string): Promise<GameProjectData> {
    try {
      console.log('Loading game project data from:', path)
      const json = await loadTextFile(path)
      const data = GameProjectFormat.deserialize(json)

      this.logger.debug(`Loaded game project: ${data.name} (ID: ${data.id})`)
      return data
    } catch (error) {
      this.logger.error(`Error loading game project data: ${error}`)
      throw error
    }
  }

  /**
   * Loads all sprite sets in the game project
   */
  private async loadSpriteSets(): Promise<void> {
    if (
      !this.gameProjectData.spriteSets ||
      this.gameProjectData.spriteSets.length === 0
    ) {
      this.logger.warn('No sprite sets found in game project')
      return
    }

    // Process each sprite set
    for (const spriteSet of this.gameProjectData.spriteSets) {
      try {
        // Handle external sprite set reference
        const fullPath = joinPaths(this.baseDir, spriteSet.path)
        const resource = new SpriteSetResource(fullPath, {
          headless: this.headless,
        })

        await resource.load()
        this.spriteSetResources.set(spriteSet.id, resource)
        this.logger.debug(`Loaded sprite set: ${spriteSet.id} from ${fullPath}`)
      } catch (error) {
        this.logger.error(`Failed to load sprite set ${spriteSet.id}: ${error}`)
        throw error
      }
    }

    this.logger.info(`Loaded ${this.spriteSetResources.size} sprite sets`)
  }

  /**
   * Loads a single map by ID
   */
  private async _loadMap(mapId: string): Promise<MapResource> {
    const mapEntry = this.gameProjectData.maps.find((map) => map.id === mapId)
    if (!mapEntry) {
      throw new Error(`Map with ID ${mapId} not found in game project`)
    }

    try {
      // Handle external map reference
      const fullPath = joinPaths(this.baseDir, mapEntry.path)
      const resource = new MapResource(fullPath, {
        headless: this.headless,
      })

      await resource.load()
      this.mapResources.set(mapId, resource)
      this.logger.debug(`Loaded map: ${mapId} from ${fullPath}`)
      return resource
    } catch (error) {
      this.logger.error(`Failed to load map ${mapId}: ${error}`)
      throw error
    }
  }

  /**
   * Loads the game project
   */
  async load(): Promise<GameProjectData> {
    try {
      // Load the game project data
      const fullPath = joinPaths(this.baseDir, this.filename)
      this.gameProjectData = await this.loadGameProjectData(fullPath)
      this.data = this.gameProjectData

      // Determine initial map ID
      const initialMapId =
        this.customInitialMapId || this.gameProjectData.startup.initialMapId

      // Load sprite sets if configured to preload
      if (this.preloadAllSpriteSets) {
        await this.loadSpriteSets()
      }

      // Load all maps if configured to preload
      if (this.preloadAllMaps) {
        for (const map of this.gameProjectData.maps) {
          if (map.id !== initialMapId) {
            await this._loadMap(map.id)
          }
        }
      }

      // Load the initial map
      await this.loadMap(initialMapId)

      this._isLoaded = true
      this.logger.info(
        `Game project "${this.gameProjectData.name}" loaded successfully`,
      )

      return this.gameProjectData
    } catch (error) {
      this.logger.error(`Failed to load game project: ${error}`)
      throw error
    }
  }

  /**
   * Checks if the resource is loaded
   */
  isLoaded(): boolean {
    return this._isLoaded
  }

  /**
   * Loads a map by ID
   * If the map is not already loaded, it will be loaded first otherwise it will return the existing map resource
   */
  async loadMap(mapId: string): Promise<MapResource> {
    if (this.mapResources.has(mapId)) {
      return this.mapResources.get(mapId)!
    }

    // Load the map if it's not already loaded
    return await this._loadMap(mapId)
  }

  /**
   * Debug information about the loaded game project
   */
  debugInfo(): void {
    this.logger.debug('====== Game Project Debug Info ======')
    this.logger.debug(
      `Project: ${this.gameProjectData.name} (ID: ${this.gameProjectData.id})`,
    )
    this.logger.debug(`Version: ${this.gameProjectData.version}`)
    this.logger.debug(
      `Maps: ${this.mapResources.size}/${this.gameProjectData.maps.length} loaded`,
    )
    this.logger.debug(
      `Sprite Sets: ${this.spriteSetResources.size}/${this.gameProjectData.spriteSets.length} loaded`,
    )
    this.logger.debug('======================================')
  }
}
