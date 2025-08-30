import type { Loadable, SpriteSetData } from '../types'

/**
 * Abstract base class for sprite set resource loaders
 * Defines the common interface for loading sprite sets across different platforms
 */
export abstract class SpriteSetResource implements Loadable<SpriteSetData> {
  /**
   * The loaded sprite set data
   */
  abstract data: SpriteSetData

  /**
   * The path to the sprite set file
   */
  abstract get path(): string

  /**
   * Load the sprite set data from the file system
   * @returns Promise that resolves with the loaded SpriteSetData
   */
  abstract load(): Promise<SpriteSetData>

  /**
   * Check if the resource is loaded
   * @returns True if the sprite set data is loaded
   */
  abstract isLoaded(): boolean

  /**
   * Get a specific sprite by ID (platform-specific implementation)
   * @param id Sprite ID
   * @returns Platform-specific sprite object or undefined if not found
   */
  abstract getSprite(id: number): unknown

  /**
   * Get all sprites (platform-specific implementation)
   * @returns Record of sprite ID to platform-specific sprite objects
   */
  abstract get sprites(): Record<number, unknown>
}
