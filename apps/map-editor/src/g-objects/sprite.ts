import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { Graphic } from './graphic.ts'
import { Image } from './image.ts'
import type { ImageResource } from '../types/image-resource.ts'
import type { DataSprite } from '@pixelrpg/common'

// import Template from './sprite.ui?raw'

interface _Sprite {
  _image: InstanceType<typeof Image>
}

class _Sprite extends Graphic {
  constructor(dataSprite: DataSprite, spritePixbuf: GdkPixbuf.Pixbuf) {
    super(dataSprite)
    this._image = new Image(dataSprite.image, spritePixbuf)
  }
}

export const Sprite = GObject.registerClass(
  {
    GTypeName: 'Sprite',
    // Template,
    Properties: {
      // TODO(ts-for-gir): fix type of flags parameter
      image: GObject.ParamSpec.object('image', 'Image', 'Image for the sprite', GObject.ParamFlags.READWRITE as any, Image),
    }
  },
  _Sprite
)
