import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import GLib from '@girs/glib-2.0'
import Graphene from '@girs/graphene-1.0'

import { MAX_INT32 } from '../constants.ts'

/**
 * A GdkPaintable implementation for rendering sub-regions of a texture
 *
 * This class enables proper sprite sheet handling in GTK4 by rendering
 * specific regions from a larger texture using GTK4's clip & translate
 * approach for optimal GPU performance.
 *
 * Implementation follows GTK4 best practices:
 * 1. Push clip rectangle for destination bounds
 * 2. Translate coordinates to position sprite region at origin
 * 3. Render complete source texture (clipped region becomes visible)
 */
export class SpritePaintable
  extends GObject.Object
  implements Gdk.Paintable.Interface
{
  private _sourceTexture: Gdk.Texture | null
  private _x: number
  private _y: number
  private _width: number
  private _height: number
  private _disposed: boolean = false

  // Regular methods are automatically provided by GObject runtime
  // but we add them for TypeScript compatibility during development
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
        GTypeName: 'SpritePaintable',
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
    return this._width / this._height
  }

  /**
   * Render the sprite region from the source texture using GTK4 Snapshot API
   *
   * Uses the GTK4 clip & translate approach for optimal GPU performance:
   * 1. Clip to destination bounds
   * 2. Translate to position sprite region at origin
   * 3. Render complete texture (only sprite region visible)
   */
  vfunc_snapshot(snapshot: Gdk.Snapshot, width: number, height: number): void {
    if (this._disposed || !this._sourceTexture) {
      return
    }

    // Cast to Gtk.Snapshot to access the full GTK4 API
    const gtkSnapshot = snapshot as unknown as Gtk.Snapshot

    // Create clipping rectangle for the destination sprite area
    const clipRect = new Graphene.Rect()
    clipRect.init(0, 0, width, height)

    // Push clip to restrict rendering to destination bounds
    gtkSnapshot.push_clip(clipRect)

    try {
      // Save transformation state
      gtkSnapshot.save()

      try {
        // Translate coordinates so the sprite region appears at origin
        const translatePoint = new Graphene.Point()
        translatePoint.x = -this._x
        translatePoint.y = -this._y
        gtkSnapshot.translate(translatePoint)

        // Render the complete source texture at its original size
        // Only the sprite region will be visible due to clipping and translation
        const sourceRect = new Graphene.Rect()
        sourceRect.init(
          0,
          0,
          this._sourceTexture.get_width(),
          this._sourceTexture.get_height(),
        )

        gtkSnapshot.append_texture(this._sourceTexture, sourceRect)
      } finally {
        // Always restore transformation state
        gtkSnapshot.restore()
      }
    } finally {
      // Always pop the clip
      gtkSnapshot.pop()
    }
  }

  /**
   * Get current image (required by GdkPaintable interface)
   */
  vfunc_get_current_image(this: this & Gdk.Paintable): Gdk.Paintable {
    return this
  }

  /**
   * Get paintable flags (required by GdkPaintable interface)
   * Returns static flags to avoid GC issues during shutdown
   */
  vfunc_get_flags(): Gdk.PaintableFlags {
    if (this._disposed) {
      return 0 as Gdk.PaintableFlags
    }
    return Gdk.PaintableFlags.SIZE | Gdk.PaintableFlags.CONTENTS
  }

  /**
   * Dispose method to clean up resources and prevent GC issues
   */
  vfunc_dispose(): void {
    if (!this._disposed) {
      this._disposed = true
      this._sourceTexture = null
    }
    super.vfunc_dispose?.()
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
}

// Ensure the type is registered
GObject.type_ensure(SpritePaintable.$gtype)
