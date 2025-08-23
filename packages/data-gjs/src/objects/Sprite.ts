import Gdk from '@girs/gdk-4.0'

import { SpritePaintable } from './SpritePaintable.ts'

/**
 * A lightweight sprite data structure for sprite sheet handling
 *
 * This class represents a sprite region within a larger texture without
 * implementing Gdk.Paintable directly to avoid GC issues with many instances.
 * Use createPaintable() to get a Gdk.Paintable for rendering when needed.
 *
 * Features:
 * - Lightweight data structure for sprite regions
 * - Factory methods for easy sprite creation
 * - Sub-texture support for sprite sheets
 * - Creates paintable objects on demand for rendering
 * - Avoids GC callback issues by not implementing Gdk.Paintable directly
 */
export class Sprite {
  private _sourceTexture: Gdk.Texture | null = null
  private _x: number
  private _y: number
  private _width: number
  private _height: number

  /**
   * Create a new Sprite
   * @param texture The source texture containing the sprite sheet
   * @param x X position of the sprite in the texture
   * @param y Y position of the sprite in the texture
   * @param width Width of the sprite
   * @param height Height of the sprite
   */
  constructor(
    texture: Gdk.Texture,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    this._sourceTexture = texture
    this._x = x
    this._y = y
    this._width = width
    this._height = height
  }

  /**
   * Create a Gdk.Paintable for rendering this sprite
   * This creates a new SpritePaintable instance that can be used with GTK widgets
   */
  createPaintable(): Gdk.Paintable {
    return new SpritePaintable(
      this._sourceTexture,
      this._x,
      this._y,
      this._width,
      this._height,
    )
  }

  // Getters for the properties
  get sourceTexture(): Gdk.Texture | null {
    return this._sourceTexture
  }

  get x(): number {
    return this._x
  }

  get y(): number {
    return this._y
  }

  get width(): number {
    return this._width
  }

  get height(): number {
    return this._height
  }

  /**
   * Create from Gdk.Texture (full texture sprite)
   */
  static fromTexture(texture: Gdk.Texture): Sprite {
    return new Sprite(
      texture,
      0, // x
      0, // y
      texture.get_width(), // width
      texture.get_height(), // height
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
  ): Sprite {
    return new Sprite(texture, x, y, width, height)
  }

  /**
   * Check if the sprite is loaded
   */
  isLoaded(): boolean {
    return this._sourceTexture !== null
  }
}
