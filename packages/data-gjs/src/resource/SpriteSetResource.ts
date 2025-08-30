import Gio from '@girs/gio-2.0'
import Gdk from '@girs/gdk-4.0'
import {
  SpriteSetData,
  SpriteSetResource as BaseSpriteSetResource,
} from '@pixelrpg/data-core'
import { SpriteSetResourceOptions } from '../types/SpriteSetResourceOptions'
import { loadTextFile } from '../utils'
import { SpriteSetFormat } from '@pixelrpg/data-core'
import { ImageResource } from './ImageResource'
import { SpriteSheet, Sprite } from '../objects/index.ts'

/**
 * Resource class for loading custom SpriteSet format into GJS.
 *
 * Similar to Excalibur SpriteSetResource: `packages/data-excalibur/src/resource/SpriteSetResource.ts`
 *
 * @see SpriteSheet For processing loaded data into individual sprites
 * @see Sprite For individual sprite representation
 */
export class SpriteSetResource extends BaseSpriteSetResource {
  private _data: SpriteSetData | null = null
  private _path: string
  private _imageResource: ImageResource | null = null
  private _spriteSheet: SpriteSheet | null = null
  private _sprites: Record<number, Sprite> = {}
  private _useGResource: boolean
  private _resourcePrefix: string | undefined = undefined

  /**
   * Create a new SpriteSetResource
   * @param path The path to the sprite set file
   */
  constructor(path: string, options?: SpriteSetResourceOptions) {
    super()
    this._path = path
    this._useGResource = options?.useGResource || false
    this._resourcePrefix = options?.resourcePrefix || undefined
  }

  /**
   * Load the sprite set data from the JSON file and associated image
   *
   * This method performs the complete file loading pipeline:
   * 1. Loads and parses the sprite set JSON file
   * 2. Resolves the image path (relative to JSON file)
   * 3. Creates and loads the ImageResource for the sprite sheet
   * 4. Validates the loaded data
   *
   * @returns Promise that resolves with the loaded SpriteSetData
   * @throws Error if file loading or parsing fails
   */
  async load(): Promise<SpriteSetData> {
    if (this._data) {
      return this._data
    }

    try {
      // Load and parse the sprite set data
      const spriteSetText = await loadTextFile(
        this._path,
        this._useGResource,
        this._resourcePrefix,
      )
      this._data = SpriteSetFormat.deserialize(spriteSetText)

      // Now load the image if it exists
      if (this._data.image) {
        const imagePath = this._data.image.path
        // If the image path is relative, resolve it relative to the JSON file
        const absoluteImagePath = imagePath.startsWith('/')
          ? imagePath
          : Gio.File.new_for_path(this._path)
              .get_parent()
              ?.get_child(imagePath)
              .get_path() || imagePath

        try {
          // Create ImageResource and load it
          this._imageResource = new ImageResource(absoluteImagePath)
          await this._imageResource.load()

          // Create SpriteSheet from the loaded data and image
          this._spriteSheet = new SpriteSheet(this._data, this._imageResource)

          // Create individual sprites (similar to Excalibur pattern)
          this._sprites = this.createSprites(this._data, this._spriteSheet)
        } catch (error) {
          console.error(`Error loading sprite set image: ${error}`)
        }
      }

      return this._data
    } catch (error) {
      console.error(`Error parsing sprite set file: ${error}`)
      throw error
    }
  }

  /**
   * Get the loaded sprite set data
   */
  get data(): SpriteSetData {
    if (!this._data) {
      throw new Error('Sprite set data not loaded')
    }
    return this._data
  }

  /**
   * Get the path to the sprite set file
   */
  get path(): string {
    return this._path
  }

  /**
   * Get the loaded image resource for the sprite set image
   */
  get imageResource(): ImageResource | null {
    return this._imageResource
  }

  /**
   * Creates individual sprites from the sprite sheet (similar to Excalibur pattern)
   * @param data The sprite set data
   * @param spriteSheet The created sprite sheet
   */
  private createSprites(
    data: SpriteSetData,
    spriteSheet: SpriteSheet,
  ): Record<number, Sprite> {
    const sprites: Record<number, Sprite> = {}

    if (data.sprites && data.sprites.length > 0) {
      data.sprites.forEach((spriteData) => {
        try {
          // Get the sprite from the sprite sheet by position
          const spriteIndex = spriteData.row * data.columns + spriteData.col
          if (spriteIndex < spriteSheet.sprites.length) {
            sprites[spriteData.id] = spriteSheet.sprites[spriteIndex]
          }
        } catch (error) {
          console.error(`Error creating sprite ${spriteData.id}:`, error)
        }
      })
    }

    return sprites
  }

  /**
   * Get the created sprite sheet
   */
  get spriteSheet(): SpriteSheet | null {
    return this._spriteSheet
  }

  /**
   * Get all created sprites by ID
   */
  get sprites(): Record<number, Sprite> {
    return this._sprites
  }

  /**
   * Get a specific sprite by ID
   */
  getSprite(id: number): Sprite | undefined {
    return this._sprites[id]
  }

  /**
   * Check if the resource is loaded
   * @returns True if both data and image resource are loaded
   */
  isLoaded(): boolean {
    return this._data !== null && (this._imageResource?.isLoaded() ?? false)
  }
}
