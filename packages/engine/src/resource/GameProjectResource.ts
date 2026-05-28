import { Logger } from 'excalibur'
import { BUILT_IN_SCIENTIST, BUILT_IN_SCIENTIST_SPRITESET, BUILT_IN_SCIENTIST_SPRITESET_ID } from '../__demo__/scientist/index'
import { GameProjectFormat } from '../format/GameProjectFormat'
import type { GameProjectData, GameProjectResourceOptions, MapData } from '../types'
import { loadTextFile } from '../utils'
import { extractDirectoryPath, getFilename, joinPaths } from '../utils/url'
import { MapResource } from './MapResource'
import { SpriteSetResource } from './SpriteSetResource'

/**
 * Resource class for loading a complete game project into Excalibur
 */
export class GameProjectResource {
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
   * Get a map resource by ID
   */
  public getMapResource(id: string): MapResource | undefined {
    return this.mapResources.get(id)
  }

  constructor(path: string, options?: GameProjectResourceOptions) {
    this.headless = options?.headless ?? this.headless
    this.baseDir = options?.baseDir ?? extractDirectoryPath(path)
    this.filename = getFilename(path)
    this.preloadAllMaps = options?.preloadAllMaps ?? this.preloadAllMaps
    this.preloadAllSpriteSets = options?.preloadAllSpriteSets ?? this.preloadAllSpriteSets
    this.customInitialMapId = options?.initialMapId

    this.logger.debug(`GameProjectResource created with path: ${path}`)
  }

  /**
   * Loads the game project data from JSON
   */
  protected async loadGameProjectData(path: string): Promise<GameProjectData> {
    try {
      this.logger.debug(`Loading game project data from: ${path}`)
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
  protected async loadSpriteSets(): Promise<void> {
    if (!this.data.spriteSets || this.data.spriteSets.length === 0) {
      this.logger.warn('No sprite sets found in game project')
      return
    }

    // Process each sprite set
    for (const spriteSet of this.data.spriteSets) {
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
   * Load all maps referenced in the project
   * @returns Promise that resolves when all maps are loaded
   */
  protected async loadMaps(): Promise<void> {
    if (!this.data.maps || this.data.maps.length === 0) {
      this.logger.warn('No maps found in game project')
      return
    }

    // Process each map
    for (const map of this.data.maps) {
      try {
        await this._loadMap(map.id)
      } catch (error) {
        this.logger.error(`Failed to load map ${map.id}: ${error}`)
        throw error
      }
    }

    this.logger.info(`Loaded ${this.mapResources.size} maps`)
  }

  /**
   * Loads a single map by ID
   */
  private async _loadMap(mapId: string): Promise<MapResource> {
    const mapEntry = this.data.maps.find((map) => map.id === mapId)
    if (!mapEntry) {
      throw new Error(`Map with ID ${mapId} not found in game project`)
    }

    try {
      // Handle external map reference
      const fullPath = joinPaths(this.baseDir, mapEntry.path)
      const resource = new MapResource(fullPath, {
        headless: this.headless,
        preloadedSpriteSets: this.spriteSetResources,
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
      this.data = await this.loadGameProjectData(fullPath)

      // Determine initial map ID
      const initialMapId = this.customInitialMapId || this.data.startup.initialMapId

      // Load sprite sets if configured to preload
      if (this.preloadAllSpriteSets) {
        await this.loadSpriteSets()
      }

      // Register engine-bundled assets (e.g. the built-in scientist
      // starter character). Done before map loading so map placements
      // that reference `characterId` resolve cleanly. See
      // `__demo__/scientist/index.ts` for the bundled definition.
      await this._registerBuiltIns()

      // Load all maps if configured to preload
      if (this.preloadAllMaps) {
        await this.loadMaps()
      }

      // Load the initial map
      await this.loadMap(initialMapId)

      this._isLoaded = true
      this.logger.info(`Game project "${this.data.name}" loaded successfully`)

      return this.data
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
   * Get a map resource by ID (returns data, not resource)
   * @param id Map ID
   * @returns Map data or null if not found
   */
  async getMap(id: string): Promise<MapData | null> {
    try {
      const mapResource = await this.loadMap(id)
      return mapResource?.mapData || null
    } catch (_error) {
      // Map not found or failed to load
      return null
    }
  }

  /**
   * Get a sprite set resource instance by ID
   * @param id Sprite set ID
   * @returns Sprite set resource or null if not found
   */
  async getSpriteSet(id: string): Promise<SpriteSetResource | null> {
    return this.spriteSetResources.get(id) || null
  }

  /**
   * Resolve a path relative to the base directory
   * @param path Path to resolve
   * @returns Resolved absolute path
   */
  resolvePath(path: string): string {
    if (path.startsWith('/')) {
      return path
    }
    return joinPaths(this.baseDir, path)
  }

  /**
   * Get the path to the game project file
   */
  get path(): string {
    return joinPaths(this.baseDir, this.filename)
  }

  /**
   * Register engine-bundled assets onto the freshly loaded project.
   *
   * Two things happen here, both idempotent:
   *
   *   1. The built-in scientist sprite-set is registered in
   *      `spriteSetResources` under its stable id. The sprite-set
   *      lives as a TS literal + base64-encoded PNG in
   *      `__demo__/scientist/`, so no file system access; the
   *      `inlineData` path on `SpriteSetResource` consumes it
   *      directly.
   *
   *   2. If the project's `characters[]` is empty / missing, the
   *      bundled scientist character is auto-seeded as the player.
   *      This keeps "open project → click Play → walk around" working
   *      without any Cast-editor setup (Mario-Maker convenience).
   *      Existing projects with their own characters configured are
   *      left untouched.
   *
   * In-memory only — the project file on disk is not modified. Once
   * the user customises the cast via the Cast view, their characters
   * persist through the normal save path.
   */
  private async _registerBuiltIns(): Promise<void> {
    if (!this.spriteSetResources.has(BUILT_IN_SCIENTIST_SPRITESET_ID)) {
      try {
        const resource = new SpriteSetResource('', {
          headless: this.headless,
          inlineData: BUILT_IN_SCIENTIST_SPRITESET,
        })
        await resource.load()
        this.spriteSetResources.set(BUILT_IN_SCIENTIST_SPRITESET_ID, resource)
        this.logger.debug(`Registered built-in sprite set: ${BUILT_IN_SCIENTIST_SPRITESET_ID}`)
      } catch (error) {
        this.logger.error(`Failed to register built-in scientist sprite set: ${error}`)
      }
    }

    if (!this.data.characters || this.data.characters.length === 0) {
      this.data.characters = [{ ...BUILT_IN_SCIENTIST }]
      this.logger.debug('Auto-seeded built-in scientist as project player character')
    }
  }

  /**
   * Debug information about the loaded game project
   */
  debugInfo(): void {
    this.logger.debug('====== Game Project Debug Info ======')
    this.logger.debug(`Project: ${this.data.name} (ID: ${this.data.id})`)
    this.logger.debug(`Version: ${this.data.version}`)
    this.logger.debug(`Maps: ${this.mapResources.size}/${this.data.maps.length} loaded`)
    this.logger.debug(`Sprite Sets: ${this.spriteSetResources.size}/${this.data.spriteSets.length} loaded`)
    this.logger.debug('======================================')
  }
}
