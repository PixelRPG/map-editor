import GObject from '@girs/gobject-2.0'
import Gdk from '@girs/gdk-4.0'
import { ImageResource } from './ImageResource'

/**
 * Pure Gdk.Texture sprite resource - 100% modern GTK4 architecture
 * 
 * 🚀 ZERO GdkPixbuf dependencies - clean, sustainable, performant!
 * Direct texture-only input for optimal GPU rendering.
 */
export class SpriteResource extends GObject.Object {
  // GObject properties
  declare _image: ImageResource

  static {
    GObject.registerClass({
      GTypeName: 'SpriteResource',
      Properties: {
        image: GObject.ParamSpec.object('image', 'Image', 'Image for the sprite', GObject.ParamFlags.READWRITE, ImageResource),
      }
    }, this);
  }

  /**
   * Get sprite width from texture
   */
  get width(): number {
    return this._image.width;
  }

  /**
   * Get sprite height from texture
   */
  get height(): number {
    return this._image.height;
  }

  /**
   * Get the sprite texture
   */
  get texture(): Gdk.Texture {
    return this._image.texture;
  }

  /**
   * Constructor - accepts only Gdk.Texture (pure modern approach)
   */
  constructor(texture: Gdk.Texture) {
    super()
    this._image = ImageResource.fromTexture(texture)
  }

  /**
   * Create from Gdk.Texture (only supported method)
   */
  static fromTexture(texture: Gdk.Texture): SpriteResource {
    return new SpriteResource(texture);
  }

  /**
   * Check if the sprite is loaded
   */
  isLoaded(): boolean {
    return this._image.isLoaded();
  }
}
