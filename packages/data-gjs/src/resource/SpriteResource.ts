import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import { SpritePaintable } from './SpritePaintable'
import { MAX_INT32 } from '../constants'

/**
 * Modern sprite resource with proper sub-texture support
 */
export class SpriteResource extends GObject.Object {
  // GObject properties
  declare _paintable: SpritePaintable
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
  get paintable(): SpritePaintable {
    return this._paintable
  }

  /**
   * Get the current scale factor
   */
  get scale(): number {
    return this._paintable.scale
  }

  /**
   * Set the scale factor - updates the paintable and dimensions
   */
  set scale(newScale: number) {
    this._paintable.scale = newScale
    // Update our stored dimensions to match the new scale
    const originalWidth = this._paintable.width
    const originalHeight = this._paintable.height
    this._width = Math.round(originalWidth * newScale)
    this._height = Math.round(originalHeight * newScale)
  }

  /**
   * Constructor - accepts a paintable (texture or sprite paintable)
   */
  constructor(paintable: SpritePaintable, width: number, height: number) {
    super()
    this._paintable = paintable
    this._width = width
    this._height = height
  }

  /**
   * Create from Gdk.Texture (full texture sprite)
   */
  static fromTexture(
    texture: Gdk.Texture,
    scale: number = 1.0,
  ): SpriteResource {
    // Always use SpritePaintable for consistency and scaling support
    const spritePaintable = new SpritePaintable(
      texture,
      0, // x
      0, // y
      texture.get_width(), // width
      texture.get_height(), // height
      scale,
    )
    const scaledWidth = Math.round(texture.get_width() * scale)
    const scaledHeight = Math.round(texture.get_height() * scale)
    return new SpriteResource(spritePaintable, scaledWidth, scaledHeight)
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
    scale: number = 1.0,
  ): SpriteResource {
    const spritePaintable = new SpritePaintable(
      texture,
      x,
      y,
      width,
      height,
      scale,
    )
    const scaledWidth = Math.round(width * scale)
    const scaledHeight = Math.round(height * scale)
    return new SpriteResource(spritePaintable, scaledWidth, scaledHeight)
  }

  /**
   * Check if the sprite is loaded
   */
  isLoaded(): boolean {
    return this._paintable !== null
  }
}
