import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { Image } from './image.ts'

// import Template from './sprite.ui?raw'

export interface Sprite {
  _image: InstanceType<typeof Image>
}

export class Sprite extends GObject.Object {

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

  constructor(spritePixbuf: GdkPixbuf.Pixbuf) {
    super()
    this._image = new Image(spritePixbuf)
  }
}
