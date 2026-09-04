import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { GdkSprite } from '../../sprite'
import { SignalScope } from '../../utils/signal-scope.ts'

import Template from './sprite.widget.blp'

/**
 * Modern GTK4 sprite widget using unified Texture architecture
 *
 * Uses Gtk.Picture + Gdk.Texture for optimal performance.
 * Clean, unified approach without legacy pixbuf complications.
 */
export class SpriteWidget extends Adw.Bin {
  // GObject internal children - Gtk.Picture is the modern image widget
  declare _image: Gtk.Picture | null

  private _signals = new SignalScope()

  // Private fields for sprite data
  private _sprite: GdkSprite | null = null
  private _scale: number = 1.0

  static {
    GObject.registerClass(
      {
        GTypeName: 'SpriteWidget',
        Template,
        InternalChildren: ['image'],
        Properties: {
          sprite: GObject.ParamSpec.object(
            'sprite',
            'Sprite',
            'The sprite to display',
            GObject.ParamFlags.READWRITE,
            GObject.Object.$gtype,
          ),
          scale: GObject.ParamSpec.double(
            'scale',
            'Scale',
            'Scale factor for the sprite',
            GObject.ParamFlags.READWRITE,
            1.0,
            10.0,
            1.0, // min, max, default
          ),
        },
      },
      SpriteWidget,
    )
  }

  constructor(sprite?: GdkSprite | null, scale?: number) {
    super()

    if (sprite !== undefined) {
      this.sprite = sprite
    }
    if (scale !== undefined) {
      this.scale = scale
    }
  }

  // GObject property getters and setters
  get sprite(): GdkSprite | null {
    return this._sprite
  }

  set sprite(value: GdkSprite | null) {
    if (this._sprite === value) return

    this._sprite = value
    this.notify('sprite')
    this._initializeSprite()
  }

  get scale(): number {
    return this._scale
  }

  set scale(value: number) {
    if (this._scale === value) return

    this._scale = value
    this.notify('scale')
    this._updateScale()
  }

  /**
   * Initialize the sprite display - set paintable once
   */
  private _initializeSprite(): void {
    if (!this._sprite || !this._image) {
      return
    }

    // Apply initial scale
    this._updateScale()

    // Set the paintable directly
    this._image.set_paintable(this._sprite.createPaintable())
  }

  /**
   * Update the widget size based on sprite dimensions and scale
   */
  private _updateScale(): void {
    if (!this._sprite || !this._scale || !this._image) {
      return
    }

    this.width_request = this._sprite.width * this._scale
    this.height_request = this._sprite.height * this._scale
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this, 'notify::scale', () => this._updateScale())
    this._signals.connect(this, 'notify::sprite', () => this._initializeSprite())
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
