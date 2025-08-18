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
  declare sprite: SpriteResource;
  declare scale: number;

  // GObject internal children - Gtk.Picture is the modern image widget
  declare _image: Gtk.Picture

  static {
    GObject.registerClass({
      GTypeName: 'SpriteWidget',
      Template,
      InternalChildren: ['image'],
      Properties: {
        sprite: GObject.ParamSpec.object(
          'sprite', 
          'Sprite', 
          'Sprite resource to display', 
          GObject.ParamFlags.READWRITE,
          SpriteResource
        ),
        scale: GObject.ParamSpec.double(
          'scale',
          'Scale',
          'Scale factor for the sprite',
          GObject.ParamFlags.READWRITE,
          0.1, 10.0, 1.0  // min, max, default
        ),
      },
    }, this);
  }

  constructor(spriteResource: SpriteResource, scale: number = 1.0) {
    super();
    this.sprite = spriteResource;
    this.scale = scale;
    this._initializeSprite();
  }

  /**
   * Initialize the sprite display
   * Pure Gtk.Picture + Gdk.Texture architecture
   */
  private _initializeSprite(): void {
    if (!this.sprite || !this._image) {
      console.warn('SpriteWidget: Missing sprite or image widget');
      return;
    }

    try {
      // Direct texture access from sprite - no conversion needed!
      const texture = this.sprite.texture;
      
      // Set texture as paintable on Picture widget (modern GTK4 approach)
      this._image.set_paintable(texture);
      
      // Configure widget sizing
      this._configureSizing();
      
      console.log(`SpriteWidget initialized: ${this.sprite.width}x${this.sprite.height}px, texture: OK`);
      
    } catch (error) {
      console.error('Error initializing sprite widget:', error);
      this._handleInitializationError();
    }
  }

  /**
   * Configure widget sizing and scaling based on sprite dimensions
   */
  private _configureSizing(): void {
    if (!this.sprite) return;

    // Apply scaling via Gtk.Picture - clean and efficient!
    const scaledWidth = Math.max(this.sprite.width * this.scale, 16);
    const scaledHeight = Math.max(this.sprite.height * this.scale, 16);
    
    // Set size request for the scaled dimensions
    this.set_size_request(scaledWidth, scaledHeight);
    
    // Configure Picture widget for scaling
    this._image.set_can_shrink(false);
    this._image.set_keep_aspect_ratio(true);
  }

  /**
   * Handle initialization errors gracefully
   */
  private _handleInitializationError(): void {
    // Ensure widget has reasonable fallback size
    this.set_size_request(32, 32);
    console.warn('SpriteWidget: Using fallback sizing due to initialization error');
  }

  /**
   * Get the current texture (direct access from sprite)
   */
  get texture(): Gdk.Texture {
    return this.sprite.texture;
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
