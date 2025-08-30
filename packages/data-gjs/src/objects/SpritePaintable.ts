import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'

/**
 * A reusable GObject that implements Gdk.Paintable for sprite rendering
 *
 * This class is designed to be created on-demand and reused to minimize
 * the number of GObject instances and avoid GC callback issues.
 */
export class SpritePaintable
  extends GObject.Object
  implements Gdk.Paintable.Interface
{
  private _sourceTexture: Gdk.Texture | null = null
  private _x: number
  private _y: number
  private _width: number
  private _height: number

  // Interface method declarations (TypeScript compatibility)
  declare get_current_image: Gdk.Paintable['get_current_image']
  declare get_flags: Gdk.Paintable['get_flags']
  declare vfunc_get_flags: Gdk.Paintable['vfunc_get_flags']
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
      },
      this,
    )
  }

  constructor(
    texture: Gdk.Texture | null,
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

  vfunc_get_intrinsic_width(): number {
    return this._width
  }

  vfunc_get_intrinsic_height(): number {
    return this._height
  }

  vfunc_get_intrinsic_aspect_ratio(): number {
    return this._width / this._height || 1
  }

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

    // Use append_scaled_texture with NEAREST filtering for pixel-perfect sprites
    snapshot.append_scaled_texture(
      this._sourceTexture,
      Gsk.ScalingFilter.NEAREST,
      scaledTextureRect,
    )

    snapshot.restore()
    snapshot.pop()
  }

  vfunc_get_current_image(): Gdk.Paintable {
    return this
  }

  // Note: vfunc_get_flags is implemented by the GObject system automatically
  // We don't override it to avoid GC callback issues as per gobject-patterns rules
}

// Ensure the SpritePaintable type is registered
GObject.type_ensure(SpritePaintable.$gtype)
