import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import { SpritePaintable } from './SpritePaintable'
import { MAX_INT32 } from '../constants'

/**
 * Modern sprite resource with proper sub-texture support
 */
export class SpriteResource extends GObject.Object {
  // GObject properties
  declare _paintable: Gdk.Paintable
  declare _width: number
  declare _height: number

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteResource',
        Properties: {
          paintable: GObject.ParamSpec.object(
            'paintable',
            'Paintable',
            'Paintable for the sprite',
            GObject.ParamFlags.READWRITE,
            GObject.Object,
          ),
          width: GObject.ParamSpec.int(
            'width',
            'Width',
            'Width of the sprite',
            GObject.ParamFlags.READWRITE,
            1,
            MAX_INT32,
            1,
          ), // min, max, default
          height: GObject.ParamSpec.int(
            'height',
            'Height',
            'Height of the sprite',
            GObject.ParamFlags.READWRITE,
            1,
            MAX_INT32,
            1,
          ), // min, max, default
        },
      },
      this,
    )
  }

  /**
   * Get sprite width
   */
  get width(): number {
    return this._width
  }

  /**
   * Get sprite height
   */
  get height(): number {
    return this._height
  }

  /**
   * Get the sprite paintable (can be used with Gtk.Picture)
   */
  get paintable(): Gdk.Paintable {
    return this._paintable
  }

  /**
   * Get the sprite texture (for backward compatibility)
   * Note: This returns the full texture if this is a sub-sprite
   */
  get texture(): Gdk.Texture {
    if (this._paintable instanceof SpritePaintable) {
      const sourceTexture = this._paintable.sourceTexture
      if (!sourceTexture) {
        throw new Error('SpritePaintable has been disposed')
      }
      return sourceTexture
    }
    // If it's a regular texture paintable, we need to extract the texture
    // For now, we'll assume it's a texture and cast it
    return this._paintable as unknown as Gdk.Texture
  }

  /**
   * Constructor - accepts a paintable (texture or sprite paintable)
   */
  constructor(paintable: Gdk.Paintable, width: number, height: number) {
    super()
    this._paintable = paintable
    this._width = width
    this._height = height
  }

  /**
   * Create from Gdk.Texture (full texture sprite)
   */
  static fromTexture(texture: Gdk.Texture): SpriteResource {
    return new SpriteResource(
      texture,
      texture.get_width(),
      texture.get_height(),
    )
  }

  /**
   * Create from a sub-region of a texture (sprite sheet)
   */
  static fromSubTexture(
    texture: Gdk.Texture,
    x: number,
    y: number,
    width: number,
    height: number,
  ): SpriteResource {
    const spritePaintable = new SpritePaintable(texture, x, y, width, height)
    return new SpriteResource(spritePaintable, width, height)
  }

  /**
   * Check if the sprite is loaded
   */
  isLoaded(): boolean {
    return this._paintable !== null
  }
}
