import GObject from '@girs/gobject-2.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'

export class Image extends GObject.Object {

  declare _pixbuf: GdkPixbuf.Pixbuf

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

  constructor(pixbuf: GdkPixbuf.Pixbuf) {
    super()
    this._pixbuf = pixbuf
  }
}
