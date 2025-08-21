import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import Graphene from '@girs/graphene-1.0'

import { MAX_INT32 } from '../constants.ts'

/**
 * A GdkPaintable implementation for rendering sub-regions of a texture
 *
 * This class enables proper sprite sheet handling in GTK4 by allowing
 * rendering of specific regions from a larger texture, which is not
 * directly supported by Gdk.Texture.
 *
 */
export class SpritePaintable
  extends GObject.Object
  implements Gdk.Paintable.Interface
{
  private _texture: Gdk.Texture
  private _x: number
  private _y: number
  private _width: number
  private _height: number

  // Regular methods are automatically provided by GObject runtime
  // but we add them for TypeScript compatibility during development
  declare get_current_image: Gdk.Paintable['get_current_image']
  declare get_flags: Gdk.Paintable['get_flags']
  declare get_intrinsic_aspect_ratio: Gdk.Paintable['get_intrinsic_aspect_ratio']
  declare get_intrinsic_height: Gdk.Paintable['get_intrinsic_height']
  declare get_intrinsic_width: Gdk.Paintable['get_intrinsic_width']
  declare snapshot: Gdk.Paintable['snapshot']

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpritePaintable',
        Implements: [Gdk.Paintable],
        Properties: {
          texture: GObject.ParamSpec.object(
            'texture',
            'Texture',
            'The source texture to render from',
            GObject.ParamFlags.READWRITE,
            Gdk.Texture,
          ),
          x: GObject.ParamSpec.int(
            'x',
            'X Position',
            'X position of the sprite in the source texture',
            GObject.ParamFlags.READWRITE,
            0, // minimum
            MAX_INT32, // maximum (2^31 - 1, max 32-bit signed int)
            0, // default value
          ),
          y: GObject.ParamSpec.int(
            'y',
            'Y Position',
            'Y position of the sprite in the source texture',
            GObject.ParamFlags.READWRITE,
            0, // minimum
            MAX_INT32, // maximum (2^31 - 1, max 32-bit signed int)
            0, // default value
          ),
          width: GObject.ParamSpec.int(
            'width',
            'Width',
            'Width of the sprite',
            GObject.ParamFlags.READWRITE,
            1, // minimum
            MAX_INT32, // maximum (2^31 - 1, max 32-bit signed int)
            1, // default value
          ),
          height: GObject.ParamSpec.int(
            'height',
            'Height',
            'Height of the sprite',
            GObject.ParamFlags.READWRITE,
            1, // minimum
            MAX_INT32, // maximum (2^31 - 1, max 32-bit signed int)
            1, // default value
          ),
        },
      },
      this,
    )
  }

  /**
   * Create a new SpritePaintable
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
    super()
    this._texture = texture
    this._x = x
    this._y = y
    this._width = width
    this._height = height
  }

  /**
   * Get the intrinsic width of this paintable
   */
  vfunc_get_intrinsic_width(): number {
    return this._width
  }

  /**
   * Get the intrinsic height of this paintable
   */
  vfunc_get_intrinsic_height(): number {
    return this._height
  }

  /**
   * Get the intrinsic aspect ratio
   */
  vfunc_get_intrinsic_aspect_ratio(): number {
    return this._width / this._height
  }

  /**
   * Render the sprite region from the source texture
   */
  vfunc_snapshot(snapshot: Gdk.Snapshot, width: number, height: number): void {
    // Simple rectangle drawing - in a real implementation, you would draw the sprite region here
    const rect = new Gdk.Rectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
    })

    // For now, just log the rendering operation
    // In a complete implementation, this would render the sprite region from the texture
    console.log(
      `Drawing sprite region: ${width}x${height} from texture region (${this._x}, ${this._y}, ${this._width}, ${this._height})`,
    )
  }

  /**
   * Get current image (required by GdkPaintable interface)
   */
  vfunc_get_current_image(this: this & Gdk.Paintable): Gdk.Paintable {
    return this
  }

  /**
   * Get paintable flags (required by GdkPaintable interface)
   */
  vfunc_get_flags(): Gdk.PaintableFlags {
    return Gdk.PaintableFlags.SIZE | Gdk.PaintableFlags.CONTENTS
  }

  // Getters for the properties
  get texture(): Gdk.Texture {
    return this._texture
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
}
