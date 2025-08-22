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
            0.1,
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

    // Initialize sprite after template is constructed
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      this._initializeSprite()
      return GLib.SOURCE_REMOVE
    })

    // Connect property change handlers
    this.connect('notify::sprite', () => this._initializeSprite())
    this.connect('notify::scale', () => this._initializeSprite())
  }

  /**
   * Initialize the sprite display with optimal Gtk.Picture configuration
   */
  private _initializeSprite(): void {
    if (!this.sprite) {
      return
    }

    if (!this._image) {
      return
    }

    try {
      let paintable = this.sprite.paintable

      if (!paintable) {
        throw new Error('Sprite paintable is null or undefined')
      }

      // If we need scaling and the paintable is a SpritePaintable, create a scaled version
      if (this.scale !== 1.0 && paintable instanceof SpritePaintable) {
        const scaledPaintable = new SpritePaintable(
          paintable.sourceTexture!,
          paintable.x,
          paintable.y,
          paintable.width,
          paintable.height,
          this.scale,
        )
        paintable = scaledPaintable
      }

      // Set the paintable - Picture will use its intrinsic size
      this._image.set_paintable(paintable)

      // Let the Picture widget auto-size based on paintable's intrinsic size
      this.set_size_request(-1, -1)
      this._image.set_size_request(-1, -1)
    } catch (error) {
      console.error('Error initializing sprite widget:', error)
      this._handleInitializationError()
    }
  }

  /**
   * Handle initialization errors gracefully
   */
  private _handleInitializationError(): void {
    this.set_size_request(32, 32)
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
