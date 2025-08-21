import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Gdk from '@girs/gdk-4.0'
import { SpriteResource } from '@pixelrpg/data-gjs'

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
    this._initializeSprite()
  }

  /**
   * Initialize the sprite display with optimal Gtk.Picture configuration
   */
  private _initializeSprite(): void {
    if (!this.sprite || !this._image) {
      return
    }

    try {
      const paintable = this.sprite.paintable
      if (!paintable) {
        throw new Error('Sprite paintable is null or undefined')
      }

      // Set the paintable - all other configuration is handled in the Blueprint
      this._image.set_paintable(paintable)

      // Configure widget sizing
      this._configureSizing()
    } catch (error) {
      console.error('Error initializing sprite widget:', error)
      this._handleInitializationError()
    }
  }

  /**
   * Configure widget sizing and scaling based on sprite dimensions
   */
  private _configureSizing(): void {
    if (!this.sprite) return

    const scaledWidth = Math.max(this.sprite.width * this.scale, 16)
    const scaledHeight = Math.max(this.sprite.height * this.scale, 16)

    // Set size request for the scaled dimensions
    // Layout behavior is configured in the Blueprint template
    this.set_size_request(scaledWidth, scaledHeight)
    this._image.set_size_request(scaledWidth, scaledHeight)
  }

  /**
   * Handle initialization errors gracefully
   */
  private _handleInitializationError(): void {
    this.set_size_request(32, 32)
  }

  /**
   * Get the current texture (direct access from sprite)
   */
  get texture(): Gdk.Texture {
    return this.sprite.texture
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
