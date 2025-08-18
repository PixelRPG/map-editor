import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { ImageResource } from './ImageResource'

/**
 * Represents a single sprite with image data
 * Moved from apps/maker-gjs to enable reuse across packages
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

  get width() {
    return this._image.data.get_width()
  }

  get height() {
    return this._image.data.get_height()
  }

  constructor(spritePixbuf: GdkPixbuf.Pixbuf) {
    super()
    this._image = ImageResource.fromPixbuf(spritePixbuf)
  }
}
