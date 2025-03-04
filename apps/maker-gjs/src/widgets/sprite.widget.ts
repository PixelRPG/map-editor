import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { Sprite } from '../g-objects/sprite.ts'

import Template from './sprite.widget.ui?raw'

export interface SpriteWidget {
  // Properties
  _sprite: Sprite

  // Child Widgets
  _image: Gtk.Image
}

export class SpriteWidget extends Adw.Bin {

  static {
    GObject.registerClass({
      GTypeName: 'SpriteWidget',
      Template,
      InternalChildren: ['image'],
      Properties: {
        sprite: Object.ParamSpec.object('sprite', 'Sprite', 'Sprite', GObject.ParamFlags.READWRITE as any, Sprite),
      },
    }, this);
  }

  constructor(public readonly spriteObject: Sprite) {
    super({})
    this._sprite = spriteObject;
    const scaleFactor = 2;
    const width = this._sprite.width * scaleFactor;
    const height = this._sprite.height * scaleFactor;
    const pixbufScaled = this._sprite._image._pixbuf.scale_simple(width, height, GdkPixbuf.InterpType.NEAREST);
    this._image.set_from_pixbuf(pixbufScaled);
    this.width_request = width;
    this.height_request = height;
  }
}
