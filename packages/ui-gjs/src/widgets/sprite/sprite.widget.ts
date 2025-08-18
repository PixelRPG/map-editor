import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import Object from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import { SpriteResource } from '@pixelrpg/data-gjs'

import Template from './sprite.widget.blp'

/**
 * Widget for displaying a single sprite
 * Migrated from apps/maker-gjs to enable reuse across packages
 */
export class SpriteWidget extends Adw.Bin {

  // GObject properties
  declare _sprite: SpriteResource

  // GObject internal children
  declare _image: Gtk.Image

  static {
    GObject.registerClass({
      GTypeName: 'SpriteWidget',
      Template,
      InternalChildren: ['image'],
      Properties: {
        sprite: Object.ParamSpec.object('sprite', 'Sprite', 'Sprite', GObject.ParamFlags.READWRITE as any, SpriteResource),
      },
    }, this);
  }

  constructor(public readonly spriteObject: SpriteResource) {
    super({})
    this._sprite = spriteObject;
    const scaleFactor = 2;
    const width = this._sprite.width * scaleFactor;
    const height = this._sprite.height * scaleFactor;
    const pixbufScaled = this._sprite._image.data.scale_simple(width, height, GdkPixbuf.InterpType.NEAREST);
    this._image.set_from_pixbuf(pixbufScaled);
    this.width_request = width;
    this.height_request = height;
  }
}

GObject.type_ensure(SpriteWidget.$gtype)
