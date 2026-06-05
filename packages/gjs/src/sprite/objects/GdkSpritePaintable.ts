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
/** Optional behaviour flags for {@link GdkSpritePaintable}. */
export interface GdkSpritePaintableOptions {
  /**
   * When `true`, `vfunc_snapshot` centers the sprite inside the
   * caller-given rect using the SMALLER of `width/spriteWidth` and
   * `height/spriteHeight` as the uniform scale — preserving the
   * sprite's intrinsic aspect ratio regardless of the rect's shape.
   *
   * When `false` (default, for backward compatibility), the snapshot
   * stretches the sprite to fill the rect with independent X / Y
   * scales — what `Gtk.Picture` callers using
   * `content-fit: fill` (e.g. `TilePalette`'s sized FlowBox cells)
   * expect. `Gtk.Picture` with `content-fit: contain` *should* call
   * `vfunc_snapshot` with aspect-matching dims and the two modes
   * would produce identical output — but in practice Picture's
   * own aspect resolution sometimes hands the paintable the full
   * widget allocation (see the comment on `vfunc_compute_concrete_size`
   * below). Opt in to `keepAspectRatio` from sprite-displaying
   * widgets (character preview, tile inspector preview, top-bar
   * tile swatch) to guarantee correct proportions there.
   */
  keepAspectRatio?: boolean
}

export class GdkSpritePaintable extends GObject.Object implements Gdk.Paintable.Interface {
  private _sourceTexture: Gdk.Texture | null = null
  private _x: number
  private _y: number
  private _width: number
  private _height: number
  private _keepAspectRatio: boolean

  // Interface method declarations (TypeScript compatibility)
  declare get_current_image: Gdk.Paintable['get_current_image']
  declare get_flags: Gdk.Paintable['get_flags']
  declare vfunc_get_flags: Gdk.Paintable['vfunc_get_flags']
  declare get_intrinsic_aspect_ratio: Gdk.Paintable['get_intrinsic_aspect_ratio']
  declare get_intrinsic_height: Gdk.Paintable['get_intrinsic_height']
  declare get_intrinsic_width: Gdk.Paintable['get_intrinsic_width']
  declare snapshot: Gdk.Paintable['snapshot']
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

  constructor(
    texture: Gdk.Texture | null,
    x: number,
    y: number,
    width: number,
    height: number,
    options: GdkSpritePaintableOptions = {},
  ) {
    super()
    this._sourceTexture = texture
    this._x = x
    this._y = y
    this._width = width
    this._height = height
    this._keepAspectRatio = options.keepAspectRatio ?? false
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

  // `vfunc_compute_concrete_size` would be the cleanest place to
  // enforce the sprite's intrinsic aspect ratio — that's the GTK-
  // recommended hook for "tell my caller what dimensions I want".
  // But GJS throws at registration time with "Could not find
  // definition of virtual function compute_concrete_size" — its
  // interface-vfunc dispatch table doesn't include that slot. So we
  // can't override it from JS, and `Gtk.Picture` reaches the default
  // C-side `compute_concrete_size` which trusts our (working)
  // `get_intrinsic_width/height` and `get_intrinsic_aspect_ratio`.
  // In practice the aspect math sometimes still hands the snapshot
  // the full widget allocation rather than aspect-fitted dims — so
  // the `keepAspectRatio` branch in `vfunc_snapshot` is the
  // reliable workaround.

  vfunc_snapshot(snapshot: Gtk.Snapshot, width: number, height: number): void {
    if (!this._sourceTexture) {
      return
    }

    // Resolve render rect. Two modes:
    //
    // - `keepAspectRatio: false` (default — preserves existing
    //   stretching behaviour for tile-palette FlowBox cells where
    //   the FlowBox sizes cells 32×64 but the sprite is 32×32 and
    //   the caller WANTS the sprite stretched to fill the cell):
    //   independent X / Y scales straight from the rect.
    //
    // - `keepAspectRatio: true` (character preview, tile inspector
    //   preview, top-bar tile swatch — any single-sprite display
    //   that should never deform): pick the smaller axis scale +
    //   centre the result inside the rect. Done at the paintable
    //   level rather than at the consumer because `Gtk.Picture`'s
    //   `content-fit: contain` has been seen to call snapshot with
    //   the full widget allocation rather than aspect-fitted dims
    //   (the GJS interface-vfunc issue noted above). Belt-and-
    //   suspenders.
    let renderX = 0
    let renderY = 0
    let renderWidth = width
    let renderHeight = height
    if (this._keepAspectRatio && this._width > 0 && this._height > 0) {
      const spriteAspect = this._width / this._height
      const rectAspect = width / height
      if (spriteAspect > rectAspect) {
        renderHeight = width / spriteAspect
        renderY = (height - renderHeight) / 2
      } else {
        renderWidth = height * spriteAspect
        renderX = (width - renderWidth) / 2
      }
    }

    // Clip to the rendered sprite rect, NOT the full snapshot rect.
    // `append_scaled_texture` lays down the WHOLE sprite-sheet scaled
    // up — translated so the target sprite lands at (renderX, renderY).
    // If the clip stays at (0, 0, width, height), every other sprite
    // in the sheet that falls within the widget allocation leaks
    // through outside the centered sprite rect (which is exactly the
    // "three scientists side by side" bug). Clipping to the sprite
    // rect itself confines the texture draw to the area we actually
    // want to paint. In `keepAspectRatio: false` mode renderX/Y=0 +
    // renderWidth/Height=width/height, so the clip degenerates to the
    // old `(0, 0, width, height)` rect — no regression for tile-
    // palette FlowBox cells.
    const clipRect = new Graphene.Rect()
    clipRect.init(renderX, renderY, renderWidth, renderHeight)
    snapshot.push_clip(clipRect)

    snapshot.save()

    const scaleX = renderWidth / this._width
    const scaleY = renderHeight / this._height

    const translatePoint = new Graphene.Point()
    translatePoint.x = renderX - this._x * scaleX
    translatePoint.y = renderY - this._y * scaleY
    snapshot.translate(translatePoint)

    const scaledTextureRect = new Graphene.Rect()
    scaledTextureRect.init(0, 0, this._sourceTexture.get_width() * scaleX, this._sourceTexture.get_height() * scaleY)

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
