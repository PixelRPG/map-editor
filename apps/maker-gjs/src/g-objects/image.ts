import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'

import type { DataImage } from '@pixelrpg/common'
import type { ImageResource } from '../types/image-resource.ts'

// import Template from './image.ui?raw'

export interface Image {
  pixbuf: GdkPixbuf.Pixbuf
}

export class Image extends GObject.Object {

  static {
    GObject.registerClass({
      GTypeName: 'Image',
      // Template,
      Properties: {
        // TODO(ts-for-gir): fix type of flags parameter
        pixbuf: GObject.ParamSpec.object('pixbuf', 'Pixbuf', 'Pixbuf for the image', GObject.ParamFlags.READWRITE as any, GdkPixbuf.Pixbuf),
      }
    }, this);
  }

  constructor(data: DataImage, pixbuf: GdkPixbuf.Pixbuf) {
    super()
    this.pixbuf = pixbuf
  }
}
