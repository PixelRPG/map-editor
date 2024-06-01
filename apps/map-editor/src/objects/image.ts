import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'

import type { DataImage } from '@pixelrpg/common'
import type { ImageResource } from '../types/image-resource.ts'

// import Template from './image.ui?raw'

interface _Image {
  pixbuf: GdkPixbuf.Pixbuf
}

class _Image extends GObject.Object {

  constructor(data: DataImage, pixbuf: GdkPixbuf.Pixbuf) {
    super()
    this.pixbuf = pixbuf
  }
}

// TODO(ts-for-gir): Fix return type of GObject.registerClass like `as InstanceType<typeof _Image> & GObject.ObjectSubclass ?`
export const Image = GObject.registerClass(
  {
    GTypeName: 'Image',
    // Template,
    Properties: {
      // TODO(ts-for-gir): fix type of flags parameter
      pixbuf: GObject.ParamSpec.object('pixbuf', 'Pixbuf', 'Pixbuf for the image', GObject.ParamFlags.READWRITE as any, GdkPixbuf.Pixbuf),
    }
  },
  _Image
)
