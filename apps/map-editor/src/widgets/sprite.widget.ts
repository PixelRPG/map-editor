import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { DataSprite, DataResource } from '@pixelrpg/common'
import { Sprite } from '../g-objects/sprite.ts'

import type { ImageResource } from '../types/image-resource.ts'

import Template from './sprite.widget.ui?raw'

interface _SpriteWidget {
  // Properties
  _sprite: InstanceType<typeof Sprite>

  // Widgets
  _image: Gtk.Image
}

class _SpriteWidget extends Adw.Bin {
  constructor(public readonly spriteObject: InstanceType<typeof Sprite>) {
    super({})
    this._sprite = spriteObject;
    const scaleFactor = 2;
    const width = spriteObject.width * scaleFactor;
    const height = spriteObject.height * scaleFactor;
    const pixbufScaled = spriteObject._image.pixbuf.scale_simple(width, height, GdkPixbuf.InterpType.NEAREST);
    this._image.set_from_pixbuf(pixbufScaled);
    // const image = Gtk.Image.new_from_pixbuf(pixbufScaled);
    // this.child = image;
    this.width_request = width;
    this.height_request = height;
  }
}

export const SpriteWidget = GObject.registerClass(
  {
    GTypeName: 'SpriteWidget',
    Template,
    InternalChildren: ['image'],
    Properties: {
      sprite: Object.ParamSpec.object('sprite', 'Sprite', 'Sprite', GObject.ParamFlags.READWRITE as any, Sprite),
    },
  },
  _SpriteWidget
)
