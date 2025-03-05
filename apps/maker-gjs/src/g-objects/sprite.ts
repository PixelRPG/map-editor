import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { ImageResource } from '@pixelrpg/data-gjs'

// TODO: Move to packages/data-gjs
export class Sprite extends GObject.Object {

  declare _image: ImageResource

  static {
    GObject.registerClass({
      GTypeName: 'Sprite',
      // Template,
      Properties: {
        // TODO(ts-for-gir): fix type of flags parameter
        image: GObject.ParamSpec.object('image', 'Image', 'Image for the sprite', GObject.ParamFlags.READWRITE as any, ImageResource),
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
