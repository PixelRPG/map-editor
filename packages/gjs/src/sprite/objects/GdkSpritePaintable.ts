import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import type Gtk from '@girs/gtk-4.0'

/**
 * GObject implementing `Gdk.Paintable` for sprite rendering inside GTK widgets.
 *
 * GTK-only — distinct from any Excalibur graphics primitive.
 *
 * Designed to be created on-demand and reused to minimize GObject instances
 * and avoid GC callback issues.
 */
export class GdkSpritePaintable extends GObject.Object implements Gdk.Paintable.Interface {
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
        GTypeName: 'GdkSpritePaintable',
        Implements: [Gdk.Paintable],
      },
      GdkSpritePaintable,
    )
  }

  constructor(texture: Gdk.Texture | null, x: number, y: number, width: number, height: number) {
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

    // Clip to target area
    const clipRect = new Graphene.Rect()
    clipRect.init(0, 0, width, height)
    snapshot.push_clip(clipRect)

    snapshot.save()

    // Use independent X / Y scale factors. Earlier code derived a single
    // `width / this._width` scale and applied it to both axes — that
    // worked only when the target rect matched the sprite's aspect
    // ratio. Once a consumer allocated a non-square cell (e.g. the
    // chip popover's FlowBox sizing tiles 32×64), the y-scale ended up
    // larger than the target, so the texture region BELOW the target
    // sprite leaked through inside the clip — visually merging two
    // tiles into one cell.
    const scaleX = width / this._width
    const scaleY = height / this._height

    const translatePoint = new Graphene.Point()
    translatePoint.x = -this._x * scaleX
    translatePoint.y = -this._y * scaleY
    snapshot.translate(translatePoint)

    const scaledTextureRect = new Graphene.Rect()
    scaledTextureRect.init(
      0,
      0,
      this._sourceTexture.get_width() * scaleX,
      this._sourceTexture.get_height() * scaleY,
    )

    // NEAREST filtering keeps pixel-art crisp at both integer and
    // fractional scales.
    snapshot.append_scaled_texture(this._sourceTexture, Gsk.ScalingFilter.NEAREST, scaledTextureRect)

    snapshot.restore()
    snapshot.pop()
  }

  vfunc_get_current_image(): Gdk.Paintable {
    return this
  }

  // Note: vfunc_get_flags is implemented by the GObject system automatically
  // We don't override it to avoid GC callback issues as per gobject-patterns rules
}

GObject.type_ensure(GdkSpritePaintable.$gtype)
