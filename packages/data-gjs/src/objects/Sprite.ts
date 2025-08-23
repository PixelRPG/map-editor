import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import GLib from '@girs/glib-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'

import { MAX_INT32 } from '../constants.ts'

/**
 * A complete sprite resource implementation with GdkPaintable interface
 *
 * This class combines sprite resource management with GTK4 paintable rendering,
 * enabling proper sprite sheet handling by rendering specific regions from a
 * larger texture using GTK4's snapshot approach for optimal GPU performance.
 *
 * Features:
 * - Direct usage as Gdk.Paintable for GTK widgets
 * - Factory methods for easy sprite creation
 * - Sub-texture support for sprite sheets
 * - Pixel-perfect rendering with nearest neighbor filtering
 * - GC-safe vfunc implementation (required by Gdk.Paintable interface)
 */
export class Sprite extends GObject.Object implements Gdk.Paintable.Interface {
  private _sourceTexture: Gdk.Texture | null = null
  private _x: number
  private _y: number
  private _width: number
  private _height: number

  // Interface method declarations (TypeScript compatibility)
  declare get_current_image: Gdk.Paintable['get_current_image']
  declare get_flags: Gdk.Paintable['get_flags']
  declare get_intrinsic_aspect_ratio: Gdk.Paintable['get_intrinsic_aspect_ratio']
  declare get_intrinsic_height: Gdk.Paintable['get_intrinsic_height']
  declare get_intrinsic_width: Gdk.Paintable['get_intrinsic_width']
  declare snapshot: Gdk.Paintable['snapshot']
  declare compute_concrete_size: Gdk.Paintable['compute_concrete_size']
  declare invalidate_contents: Gdk.Paintable['invalidate_contents']
  declare invalidate_size: Gdk.Paintable['invalidate_size']

  static {
    GObject.registerClass(
      {
        GTypeName: 'Sprite',
        Implements: [Gdk.Paintable],
        Properties: {
          sourceTexture: GObject.ParamSpec.object(
            'sourceTexture',
            'Source Texture',
            'The source texture containing the sprite sheet',
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
    super()
    this._sourceTexture = texture
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
    return this._width / this._height || 1
  }

  /**
   * Render the sprite region from the source texture using GTK4 Snapshot API
   *
   * Uses clip + scale + translate approach for pixel-perfect sprite scaling:
   * 1. Clip to destination bounds
   * 2. Scale by the scale factor
   * 3. Translate to position sprite region at origin
   * 4. Render complete texture (clipped to scaled sprite region)
   */
  vfunc_snapshot(snapshot: Gtk.Snapshot, width: number, height: number): void {
    if (!this._sourceTexture) {
      return
    }

    // Create a rectangle for the target area (where to render)
    const targetRect = new Graphene.Rect()
    targetRect.init(0, 0, width, height)

    // Clip to target area
    const clipRect = new Graphene.Rect()
    clipRect.init(0, 0, width, height)
    snapshot.push_clip(clipRect)

    // Save transformation state
    snapshot.save()

    // Calculate the scale factor needed to make the sprite region fill our target area
    const textureToTargetScale = width / this._width

    // Translate so our sprite region appears at origin
    const translatePoint = new Graphene.Point()
    translatePoint.x = -this._x * textureToTargetScale
    translatePoint.y = -this._y * textureToTargetScale
    snapshot.translate(translatePoint)

    // Create rectangle for the entire texture scaled to the right size
    const scaledTextureRect = new Graphene.Rect()
    scaledTextureRect.init(
      0,
      0,
      this._sourceTexture.get_width() * textureToTargetScale,
      this._sourceTexture.get_height() * textureToTargetScale,
    )

    // Use append_scaled_texture with NEAREST filtering
    snapshot.append_scaled_texture(
      this._sourceTexture,
      Gsk.ScalingFilter.NEAREST,
      scaledTextureRect,
    )

    snapshot.restore()
    snapshot.pop()
  }

  /**
   * Get current image
   */
  vfunc_get_current_image(): Gdk.Paintable {
    return this
  }

  /**
   * Get paintable flags
   */
  vfunc_get_flags(): Gdk.PaintableFlags {
    return 0 as Gdk.PaintableFlags
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

// Ensure the type is registered
GObject.type_ensure(Sprite.$gtype)
