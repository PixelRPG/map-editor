import Gio from '@girs/gio-2.0'
import type { SpriteSetData } from '@pixelrpg/engine'
import { SpriteSetFormat } from '@pixelrpg/engine'
import { loadTextFile } from '../utils'
import { GdkImageTexture } from './GdkImageTexture.ts'
import { GdkSpriteSheet, GdkSprite } from '../objects/index.ts'

/**
 * GTK-side SpriteSet loader that produces a `GdkSpriteSheet` of `GdkSprite`s
 * for rendering via `Gdk.Paintable`.
 *
 * The cross-platform Excalibur equivalent lives in `@pixelrpg/engine`
 * (`SpriteSetResource`); this class exists only for GTK previews in the editor
 * UI. Both pipelines coexist intentionally.
 */
export class GdkSpriteSetResource {
  private _data: SpriteSetData | null = null
  private _path: string
  private _imageTexture: GdkImageTexture | null = null
  private _spriteSheet: GdkSpriteSheet | null = null
  private _sprites: Record<number, GdkSprite> = {}

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
        this._imageTexture = new GdkImageTexture(absoluteImagePath)
        await this._imageTexture.load()

        this._spriteSheet = new GdkSpriteSheet(this._data, this._imageTexture)
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

  get imageTexture(): GdkImageTexture | null {
    return this._imageTexture
  }

  private createSprites(
    data: SpriteSetData,
    spriteSheet: GdkSpriteSheet,
  ): Record<number, GdkSprite> {
    const sprites: Record<number, GdkSprite> = {}

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

  get spriteSheet(): GdkSpriteSheet | null {
    return this._spriteSheet
  }

  get sprites(): Record<number, GdkSprite> {
    return this._sprites
  }

  getSprite(id: number): GdkSprite | undefined {
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
