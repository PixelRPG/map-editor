import GObject from '@girs/gobject-2.0'
import GLib from '@girs/glib-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gdk from '@girs/gdk-4.0'
import { SpriteResource, SpritePaintable } from '@pixelrpg/data-gjs'

import Template from './sprite.widget.blp'

/**
 * Modern GTK4 sprite widget using unified Texture architecture
 *
 * Uses Gtk.Picture + Gdk.Texture for optimal performance.
 * Clean, unified approach without legacy pixbuf complications.
 */
export class SpriteWidget extends Adw.Bin {
  // GObject properties
  declare sprite: SpriteResource
  declare scale: number

  // GObject internal children - Gtk.Picture is the modern image widget
  declare _image: Gtk.Picture

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
            SpriteResource,
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

  constructor(spriteResource: SpriteResource, scale: number = 1.0) {
    super()
    this.sprite = spriteResource
    this.scale = scale

    // Connect property change handlers
    this.connect('notify::sprite', () => this._initializeSprite())
    this.connect('notify::scale', () => this._updateScale())

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

    // Set the paintable once - it will handle all future scaling internally
    this._image.set_paintable(this.sprite.paintable)
  }

  /**
   * Update the widget size based on sprite dimensions and scale
   */
  private _updateScale(): void {
    if (!this.sprite || !this.scale) {
      return
    }

    this.width_request = this.sprite.width * this.scale
    this.height_request = this.sprite.height * this.scale
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
