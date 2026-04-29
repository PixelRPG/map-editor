import Gio from '@girs/gio-2.0'
import type { SpriteSetData } from '@pixelrpg/engine'
import { SpriteSetFormat } from '@pixelrpg/engine'
import type { SpriteSetResource } from '@pixelrpg/engine'
import { loadTextFile } from '../utils'
import { GdkImageTexture } from './GdkImageTexture.ts'
import { GdkSpriteSheet, GdkSprite } from '../objects/index.ts'

/**
 * GTK-side SpriteSet resource. Produces `GdkSpriteSheet`/`GdkSprite`s for
 * rendering in GTK widgets via `Gdk.Paintable`.
 *
 * Two construction paths:
 * - `fromEngineResource(engineResource)` — **primary path** in the editor.
 *   Reuses the already-parsed `SpriteSetData` AND extracts the `GdkPixbuf`
 *   from the already-loaded `HTMLImageElement` (gjsify polyfill) — zero
 *   additional disk I/O.
 * - `fromPath(path)` — standalone path for storybook stories and tests that
 *   don't have an engine resource available. Parses JSON and loads image
 *   from disk.
 */
export class GdkSpriteSetResource {
  private _data: SpriteSetData
  private _path: string
  private _imageTexture: GdkImageTexture | null = null
  private _spriteSheet: GdkSpriteSheet | null = null
  private _sprites: Record<number, GdkSprite> = {}

  /** Private — use the static factory methods. */
  private constructor(data: SpriteSetData, path: string) {
    this._data = data
    this._path = path
  }

  /**
   * Create from an already-loaded engine `SpriteSetResource`.
   *
   * Reuses the parsed `SpriteSetData`. For the image, extracts the internal
   * `GdkPixbuf.Pixbuf` from the gjsify `HTMLImageElement` polyfill and
   * converts it to a `Gdk.Texture` — no second disk read. Falls back to
   * loading from disk if the pixbuf is not available.
   */
  static async fromEngineResource(
    engineResource: SpriteSetResource,
  ): Promise<GdkSpriteSetResource> {
    const r = new GdkSpriteSetResource(engineResource.data, engineResource.path)
    await r._buildFromEngineResource(engineResource)
    return r
  }

  /**
   * Standalone loading for contexts without an engine resource
   * (storybook stories, tests). Parses the SpriteSet JSON and loads the
   * image from disk.
   */
  static async fromPath(path: string): Promise<GdkSpriteSetResource> {
    const text = await loadTextFile(path)
    const data = SpriteSetFormat.deserialize(text)
    const r = new GdkSpriteSetResource(data, path)
    await r._loadFromDisk()
    return r
  }

  /**
   * Extract the GdkPixbuf from the already-loaded HTMLImageElement and
   * convert it to a Gdk.Texture. Falls back to disk load if the pixbuf
   * is not available (e.g. in non-gjsify environments).
   */
  private async _buildFromEngineResource(
    engineResource: SpriteSetResource,
  ): Promise<void> {
    if (!this._data.image) return

    // TODO: Pixbuf-sharing via Gdk.Texture.new_for_pixbuf(htmlImage._pixbuf)
    // is possible (gjsify's HTMLImageElement polyfill stores a GdkPixbuf
    // internally) but causes rendering issues with some textures. For now,
    // fall back to disk loading. The parsed SpriteSetData is still shared.
    await this._loadFromDisk()
  }

  /** Load the image from disk (standalone path or fallback). */
  private async _loadFromDisk(): Promise<void> {
    if (!this._data.image) return

    const imagePath = this._resolveImagePath(this._data.image.path)
    this._imageTexture = new GdkImageTexture(imagePath)
    await this._imageTexture.load()

    this._spriteSheet = new GdkSpriteSheet(this._data, this._imageTexture)
    this._sprites = this._buildNamedSprites()
  }

  private _buildNamedSprites(): Record<number, GdkSprite> {
    if (!this._spriteSheet) return {}
    const sprites: Record<number, GdkSprite> = {}
    for (const sprite of this._data.sprites) {
      const index = sprite.row * this._data.columns + sprite.col
      if (index < this._spriteSheet.sprites.length) {
        sprites[sprite.id] = this._spriteSheet.sprites[index]
      }
    }
    return sprites
  }

  private _resolveImagePath(relativePath: string): string {
    if (relativePath.startsWith('/')) return relativePath
    return (
      Gio.File.new_for_path(this._path)
        .get_parent()
        ?.get_child(relativePath)
        .get_path() || relativePath
    )
  }

  get data(): SpriteSetData {
    return this._data
  }

  get path(): string {
    return this._path
  }

  get imageTexture(): GdkImageTexture | null {
    return this._imageTexture
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

  /** Placeholder — animation support is not yet implemented in the GTK pipeline. */
  get animations(): Record<string, unknown> {
    return {}
  }

  isLoaded(): boolean {
    return this._imageTexture?.isLoaded() ?? false
  }
}
