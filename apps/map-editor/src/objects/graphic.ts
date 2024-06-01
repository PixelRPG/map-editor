import GObject from '@girs/gobject-2.0'
import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import GdkPixbuf from '@girs/gdkpixbuf-2.0'
import type { DataGraphic } from '@pixelrpg/common'

// import Template from './graphic.ui?raw'

interface _Graphic {
  // Add GObject properties here
}

class _Graphic extends GObject.Object implements DataGraphic {

  // TODO: check which properties are not used / needed
  id: DataGraphic['id']
  width: DataGraphic['width']
  height: DataGraphic['height']
  opacity: DataGraphic['opacity']
  rotation: DataGraphic['rotation']
  scale: DataGraphic['scale']
  flipHorizontal: DataGraphic['flipHorizontal']
  flipVertical: DataGraphic['flipVertical']
  origin: DataGraphic['origin']

  constructor(dataGraphic: DataGraphic) {
    super()
    this.id = dataGraphic.id
    this.width = dataGraphic.width
    this.height = dataGraphic.height
    this.opacity = dataGraphic.opacity
    this.rotation = dataGraphic.rotation
    this.scale = dataGraphic.scale
    this.flipHorizontal = dataGraphic.flipHorizontal
    this.flipVertical = dataGraphic.flipVertical
    this.origin = dataGraphic.origin
  }
}

export const Graphic = GObject.registerClass(
  {
    GTypeName: 'Graphic',
    // Template,
    Properties: {
      // Add GObject properties here
    }
  },
  _Graphic
)
