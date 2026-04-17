import Gdk from '@girs/gdk-4.0'

import { GdkSpritePaintable } from './GdkSpritePaintable.ts'

/**
 * A lightweight sprite data structure for sprite sheet handling, backed by a
 * `Gdk.Texture` region for GTK widget rendering via the Gsk snapshot API.
 *
 * GTK-only — distinct from `ex.Sprite` (which renders via Canvas2D/WebGL).
 * Both pipelines coexist intentionally; see the package README.
 *
 * Does not implement `Gdk.Paintable` directly to avoid GC issues with many
 * instances. Use `createPaintable()` to get a paintable for rendering.
 */
export class GdkSprite {
  private _sourceTexture: Gdk.Texture | null = null
  private _x: number
  private _y: number
  private _width: number
  private _height: number
  private _paintable: GdkSpritePaintable | null = null
  private _index: number = 0

  /**
   * Create a new GdkSprite
   * @param texture The source texture containing the sprite sheet
   * @param x X position of the sprite in the texture
   * @param y Y position of the sprite in the texture
   * @param width Width of the sprite
   * @param height Height of the sprite
   * @param index The index of this sprite in the sprite sheet
   */
  constructor(
    texture: Gdk.Texture,
    x: number,
    y: number,
    width: number,
    height: number,
    index: number = 0,
  ) {
    this._sourceTexture = texture
    this._x = x
    this._y = y
    this._width = width
    this._height = height
    this._index = index
  }

  /**
   * Create a Gdk.Paintable for rendering this sprite. Lazily allocates a
   * `GdkSpritePaintable` on first call.
   */
  createPaintable(): Gdk.Paintable {
    if (!this._paintable) {
      this._paintable = new GdkSpritePaintable(
        this._sourceTexture,
        this._x,
        this._y,
        this._width,
        this._height,
      )
    }
    return this._paintable
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

  get index(): number {
    return this._index
  }

  /**
   * Create from Gdk.Texture (full texture sprite)
   */
  static fromTexture(texture: Gdk.Texture, index: number = 0): GdkSprite {
    return new GdkSprite(
      texture,
      0, // x
      0, // y
      texture.get_width(), // width
      texture.get_height(), // height
      index,
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
    index: number = 0,
  ): GdkSprite {
    return new GdkSprite(texture, x, y, width, height, index)
  }

  /**
   * Check if the sprite is loaded
   */
  isLoaded(): boolean {
    return this._sourceTexture !== null
  }
}
