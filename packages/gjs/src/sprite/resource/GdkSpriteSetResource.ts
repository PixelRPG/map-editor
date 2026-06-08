import Gdk from '@girs/gdk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import Gio from '@girs/gio-2.0'
import type { SpriteSetData, SpriteSetResource } from '@pixelrpg/engine'
import { SpriteSetFormat } from '@pixelrpg/engine'
import { type GdkSprite, GdkSpriteSheet } from '../objects/index.ts'
import { loadTextFile } from '../utils'
import { GdkImageTexture } from './GdkImageTexture.ts'

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
  static async fromEngineResource(engineResource: SpriteSetResource): Promise<GdkSpriteSetResource> {
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
  private async _buildFromEngineResource(engineResource: SpriteSetResource): Promise<void> {
    if (!this._data.image) return

    const imageSource = engineResource.getImageSource(this._data.image.id)
    // `_pixbuf` is protected on gjsify's HTMLImageElement; the Excalibur
    // `ImageSource.data` field is typed as `HTMLImageElement` so reach
    // through that narrow shape rather than `any`.
    const pixbuf = (imageSource?.data as unknown as { _pixbuf?: GdkPixbuf.Pixbuf })?._pixbuf

    if (pixbuf) {
      // Ensure RGBA — GdkPixbuf may be RGB-only for JPEG sources.
      const rgbaPixbuf = pixbuf.get_has_alpha() ? pixbuf : (pixbuf.add_alpha(false, 0, 0, 0) ?? pixbuf)

      // GTK4-native: explicit format avoids the deprecated
      // Gdk.Texture.new_for_pixbuf() and its colour-space/alpha ambiguity.
      // GdkPixbuf stores pixels as R, G, B, A bytes = MemoryFormat.R8G8B8A8.
      const texture = Gdk.MemoryTexture.new(
        rgbaPixbuf.get_width(),
        rgbaPixbuf.get_height(),
        Gdk.MemoryFormat.R8G8B8A8,
        rgbaPixbuf.get_pixels(),
        rgbaPixbuf.get_rowstride(),
      )
      this._imageTexture = GdkImageTexture.fromTexture(texture)
      this._spriteSheet = new GdkSpriteSheet(this._data, this._imageTexture)
      this._sprites = this._buildNamedSprites()
    } else {
      console.warn(
        `[GdkSpriteSetResource] No _pixbuf on HTMLImageElement for "${this._data.image.id}" — falling back to disk load`,
      )
      await this._loadFromDisk()
    }
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
    return Gio.File.new_for_path(this._path).get_parent()?.get_child(relativePath).get_path() || relativePath
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

  /**
   * A downscaled paintable of the WHOLE sheet, bounded to `maxSize` px
   * on its longer edge — for thumbnails (e.g. tileset gallery cards).
   *
   * The raw {@link imageTexture} can't be shown directly in a card: a
   * `Gtk.Picture` sizes to its paintable's intrinsic width, so a
   * 1024-px sheet would balloon the card across the row. Downscaling
   * produces a small-intrinsic texture that grids compactly while still
   * showing the recognisable sheet mosaic (better than any single tile,
   * which is often an empty/eraser cell). Operates on the already-loaded
   * in-memory texture, so it works for both disk-backed and built-in
   * sets. Returns the original texture when it's already within bounds,
   * or `null` if no image is loaded.
   */
  createSheetThumbnail(maxSize = 160): Gdk.Texture | null {
    const texture = this._imageTexture?.texture
    if (!texture) return null
    const w = texture.get_width()
    const h = texture.get_height()
    if (w <= 0 || h <= 0) return null
    if (Math.max(w, h) <= maxSize) return texture
    const scale = maxSize / Math.max(w, h)
    try {
      const full = Gdk.pixbuf_get_from_texture(texture)
      if (!full) return texture
      const scaled = full.scale_simple(
        Math.max(1, Math.round(w * scale)),
        Math.max(1, Math.round(h * scale)),
        GdkPixbuf.InterpType.BILINEAR,
      )
      return scaled ? Gdk.Texture.new_for_pixbuf(scaled) : texture
    } catch (err) {
      console.warn('[GdkSpriteSetResource] Failed to build sheet thumbnail:', err)
      return texture
    }
  }

  /** Placeholder — animation support is not yet implemented in the GTK pipeline. */
  get animations(): Record<string, unknown> {
    return {}
  }

  isLoaded(): boolean {
    return this._imageTexture?.isLoaded() ?? false
  }
}
