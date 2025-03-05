import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { Image } from './image.ts'

export class Sprite extends GObject.Object {

  declare _image: Image

  static {
    GObject.registerClass({
      GTypeName: 'Sprite',
      // Template,
      Properties: {
        // TODO(ts-for-gir): fix type of flags parameter
        image: GObject.ParamSpec.object('image', 'Image', 'Image for the sprite', GObject.ParamFlags.READWRITE as any, Image),
      }
    }, this);
  }

  get width() {
    return this._image._pixbuf.get_width()
  }

  get height() {
    return this._image._pixbuf.get_height()
  }

  constructor(spritePixbuf: GdkPixbuf.Pixbuf) {
    super()
    this._image = new Image(spritePixbuf)
  }
}
