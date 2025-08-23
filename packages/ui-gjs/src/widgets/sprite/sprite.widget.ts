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
            'Sprite resource to display',
            GObject.ParamFlags.READWRITE,
            Sprite,
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

  constructor(
    public sprite: Sprite | null,
    public scale: number = 1.0,
  ) {
    super()

    this._initializeSprite()
  }

  /**
   * Initialize the sprite display - set paintable once
   */
  private _initializeSprite(): void {
    if (!this.sprite || !this._image) {
      return
    }

    // Apply initial scale
    this._updateScale()

    // Set the paintable directly
    this._image.set_paintable(this.sprite)
  }

  /**
   * Update the widget size based on sprite dimensions and scale
   */
  private _updateScale(): void {
    if (!this.sprite || !this.scale || !this._image) {
      return
    }

    this.width_request = this.sprite.width * this.scale
    this.height_request = this.sprite.height * this.scale
  }

  /**
   * Connect signals when widget becomes visible (GTK 4 lifecycle pattern)
   */
  vfunc_map(): void {
    super.vfunc_map()

    if (this._signalHandlers.length === 0) {
      // Connect property change handlers
      const spriteHandlerId = this.connect('notify::sprite', () =>
        this._initializeSprite(),
      )
      const scaleHandlerId = this.connect('notify::scale', () =>
        this._updateScale(),
      )
      this._signalHandlers.push(spriteHandlerId, scaleHandlerId)
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
