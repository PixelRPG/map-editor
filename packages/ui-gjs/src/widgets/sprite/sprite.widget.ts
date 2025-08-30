import GObject from '@girs/gobject-2.0'
import GLib from '@girs/glib-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gdk from '@girs/gdk-4.0'
import { Sprite } from '@pixelrpg/data-gjs'

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

  // Signal management
  private _signalHandlers: number[] = []

  // Private fields for sprite data
  private _sprite: Sprite | null = null
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
      this,
    )
  }

  constructor(sprite?: Sprite | null, scale?: number) {
    super()

    if (sprite !== undefined) {
      this.sprite = sprite
    }
    if (scale !== undefined) {
      this.scale = scale
    }
  }

  // GObject property getters and setters
  get sprite(): Sprite | null {
    return this._sprite
  }

  set sprite(value: Sprite | null) {
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

    if (this._signalHandlers.length === 0) {
      // Connect property change handlers
      const scaleHandlerId = this.connect('notify::scale', () =>
        this._updateScale(),
      )
      const spriteHandlerId = this.connect('notify::sprite', () =>
        this._initializeSprite(),
      )
      this._signalHandlers.push(scaleHandlerId, spriteHandlerId)
    }
  }

  /**
   * Disconnect signals when widget becomes invisible (GC-safe cleanup)
   */
  vfunc_unmap(): void {
    if (this._signalHandlers.length > 0) {
      // Disconnect all signal handlers
      for (const handlerId of this._signalHandlers) {
        if (handlerId > 0) {
          this.disconnect(handlerId)
        }
      }
      this._signalHandlers = []
    }

    super.vfunc_unmap()
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
