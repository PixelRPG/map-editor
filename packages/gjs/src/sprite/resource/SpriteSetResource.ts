import Gio from '@girs/gio-2.0'
import type { SpriteSetData } from '@pixelrpg/engine'
import { SpriteSetFormat } from '@pixelrpg/engine'
import { loadTextFile } from '../utils'
import { ImageTexture } from './ImageTexture.ts'
import { SpriteSheet, Sprite } from '../objects/index.ts'

/**
 * GJS-specific SpriteSet loader that produces a {@link SpriteSheet} of GJS
 * {@link Sprite}s rendering via `Gdk.Paintable`. The cross-platform Excalibur
 * equivalent lives in `@pixelrpg/engine` (`SpriteSetResource`); this class
 * exists only for GTK previews in the editor UI.
 */
export class SpriteSetResource {
  private _data: SpriteSetData | null = null
  private _path: string
  private _imageTexture: ImageTexture | null = null
  private _spriteSheet: SpriteSheet | null = null
  private _sprites: Record<number, Sprite> = {}

  constructor(path: string) {
    this._path = path
  }

  async load(): Promise<SpriteSetData> {
    if (this._data) {
      return this._data
    }

    const spriteSetText = await loadTextFile(this._path)
    this._data = SpriteSetFormat.deserialize(spriteSetText)

    if (this._data.image) {
      const imagePath = this._data.image.path
      const absoluteImagePath = imagePath.startsWith('/')
        ? imagePath
        : Gio.File.new_for_path(this._path)
            .get_parent()
            ?.get_child(imagePath)
            .get_path() || imagePath

      try {
        this._imageTexture = new ImageTexture(absoluteImagePath)
        await this._imageTexture.load()

        this._spriteSheet = new SpriteSheet(this._data, this._imageTexture)
        this._sprites = this.createSprites(this._data, this._spriteSheet)
      } catch (error) {
        console.error(`Error loading sprite set image: ${error}`)
      }
    }

    return this._data
  }

  get data(): SpriteSetData {
    if (!this._data) {
      throw new Error('Sprite set data not loaded')
    }
    return this._data
  }

  get path(): string {
    return this._path
  }

  get imageTexture(): ImageTexture | null {
    return this._imageTexture
  }

  private createSprites(
    data: SpriteSetData,
    spriteSheet: SpriteSheet,
  ): Record<number, Sprite> {
    const sprites: Record<number, Sprite> = {}

    if (data.sprites && data.sprites.length > 0) {
      data.sprites.forEach((spriteData) => {
        try {
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

  get spriteSheet(): SpriteSheet | null {
    return this._spriteSheet
  }

  get sprites(): Record<number, Sprite> {
    return this._sprites
  }

  getSprite(id: number): Sprite | undefined {
    return this._sprites[id]
  }

  /** Placeholder for animation support (not yet implemented in GJS). */
  get animations(): Record<string, unknown> {
    return {}
  }

  isLoaded(): boolean {
    return this._data !== null && (this._imageTexture?.isLoaded() ?? false)
  }
}
