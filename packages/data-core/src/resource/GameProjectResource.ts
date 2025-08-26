import { GameProjectData, MapData, SpriteSetData } from '../types'
import { Loadable } from '../types'

/**
 * Abstract base class for game project resource loaders
 * Defines the common interface for loading game projects across different platforms
 */
export abstract class GameProjectResource implements Loadable<GameProjectData> {
  /**
   * The loaded game project data
   */
  abstract data: GameProjectData

  /**
   * Load the game project data from the file
   * @returns Promise that resolves when the game project is loaded
   */
  abstract load(): Promise<GameProjectData>

  /**
   * Check if the resource is loaded
   * @returns True if the resource is loaded
   */
  abstract isLoaded(): boolean

  /**
   * Load the raw game project data from file
   * @param path Path to the game project file
   * @returns Promise that resolves to the game project data
   */
  protected abstract loadGameProjectData(path: string): Promise<GameProjectData>

  /**
   * Load all sprite sets referenced in the project
   * @returns Promise that resolves when all sprite sets are loaded
   */
  protected abstract loadSpriteSets(): Promise<void>

  /**
   * Load all maps referenced in the project
   * @returns Promise that resolves when all maps are loaded
   */
  protected abstract loadMaps(): Promise<void>

  /**
   * Get a map resource by ID
   * @param id Map ID
   * @returns Promise that resolves to map data or null if not found
   */
  abstract getMap(id: string): Promise<MapData | null>

  /**
   * Get a sprite set resource by ID
   * @param id Sprite set ID
   * @returns Promise that resolves to sprite set data or null if not found
   */
  abstract getSpriteSet(id: string): Promise<SpriteSetData | null>

  /**
   * Load a specific map by ID
   * @param mapId Map ID to load
   * @returns Promise that resolves to the loaded map resource
   */
  abstract loadMap(mapId: string): Promise<any>

  /**
   * Resolve a path relative to the base directory
   * @param path Path to resolve
   * @returns Resolved absolute path
   */
  abstract resolvePath(path: string): string

  /**
   * Get the path to the game project file
   */
  abstract get path(): string
}
